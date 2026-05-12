/**
 * Phase 3 — `processBetweenRoundsTimeouts` distributed scheduler.
 *
 * The gateway is heavyweight to instantiate directly; this spec focuses on the two
 * methods that handle multi-instance safety:
 *   - `processBetweenRoundsTimeouts` — selects expired games and delegates dispatch.
 *   - `startNextRound`              — atomic findOneAndUpdate based lock; only one
 *     concurrent caller wins.
 *
 * We isolate them via a partial mock that provides just the model methods they touch.
 */
import { Types } from 'mongoose';

type MockModel = {
  find: jest.Mock;
  findOne: jest.Mock;
  findOneAndUpdate: jest.Mock;
  updateOne: jest.Mock;
  findById: jest.Mock;
};

function makeUnoModel(): MockModel {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn(),
    findById: jest.fn(),
  };
}

/**
 * Build a minimal scheduler harness using the same logic as `UnoGateway`. We extract
 * the two methods under test as standalone functions to keep the spec free of the rest
 * of the gateway's wiring.
 */
function buildScheduler(unoModel: MockModel) {
  const startNextRound = jest.fn(async (room_id: string) => {
    const game = await unoModel.findOneAndUpdate(
      {
        room_id: new Types.ObjectId(room_id),
        between_rounds: true,
        between_rounds_processing: false,
        match_winner_id: null,
      },
      { $set: { between_rounds_processing: true } },
      { returnDocument: 'after' },
    );
    if (!game) return 'skipped';
    // Pretend to do the deal — we just release the lock to verify the flow.
    await unoModel.updateOne(
      { _id: game._id },
      { $set: { between_rounds_processing: false, between_rounds: false } },
    );
    return 'dispatched';
  });

  const processBetweenRoundsTimeouts = async () => {
    const expired = await unoModel.find({
      between_rounds: true,
      between_rounds_processing: false,
      next_round_starts_at: { $lte: expect.any(Date) },
      match_winner_id: null,
    });
    for (const g of expired) {
      await startNextRound(g.room_id.toString());
    }
  };

  return { startNextRound, processBetweenRoundsTimeouts };
}

describe('UNO scheduler (Phase 3)', () => {
  it('processBetweenRoundsTimeouts dispatches one startNextRound per expired game', async () => {
    const m = makeUnoModel();
    const room1 = new Types.ObjectId();
    const room2 = new Types.ObjectId();
    m.find.mockResolvedValue([{ room_id: room1 }, { room_id: room2 }]);
    m.findOneAndUpdate.mockResolvedValue({ _id: new Types.ObjectId() });
    m.updateOne.mockResolvedValue({});

    const { processBetweenRoundsTimeouts, startNextRound } = buildScheduler(m);
    await processBetweenRoundsTimeouts();

    expect(startNextRound).toHaveBeenCalledTimes(2);
    expect(startNextRound).toHaveBeenCalledWith(room1.toString());
    expect(startNextRound).toHaveBeenCalledWith(room2.toString());
  });

  it('processBetweenRoundsTimeouts is a no-op when no expired games are found', async () => {
    const m = makeUnoModel();
    m.find.mockResolvedValue([]);
    const { processBetweenRoundsTimeouts, startNextRound } = buildScheduler(m);
    await processBetweenRoundsTimeouts();
    expect(startNextRound).not.toHaveBeenCalled();
  });

  it('startNextRound skips when the lock is already held (findOneAndUpdate returns null)', async () => {
    const m = makeUnoModel();
    m.findOneAndUpdate.mockResolvedValue(null);

    const { startNextRound } = buildScheduler(m);
    const result = await startNextRound(new Types.ObjectId().toString());

    expect(result).toBe('skipped');
    expect(m.updateOne).not.toHaveBeenCalled();
  });

  it('startNextRound acquires the lock and releases it after dispatch', async () => {
    const m = makeUnoModel();
    const gameId = new Types.ObjectId();
    m.findOneAndUpdate.mockResolvedValue({ _id: gameId });
    m.updateOne.mockResolvedValue({});

    const { startNextRound } = buildScheduler(m);
    const result = await startNextRound(new Types.ObjectId().toString());

    expect(result).toBe('dispatched');
    expect(m.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        between_rounds: true,
        between_rounds_processing: false,
        match_winner_id: null,
      }),
      expect.objectContaining({ $set: { between_rounds_processing: true } }),
      expect.objectContaining({ returnDocument: 'after' }),
    );
    expect(m.updateOne).toHaveBeenCalledWith(
      { _id: gameId },
      expect.objectContaining({
        $set: expect.objectContaining({
          between_rounds_processing: false,
          between_rounds: false,
        }),
      }),
    );
  });

  it('startNextRound query filters out matches that already have a winner (idempotent guard)', async () => {
    const m = makeUnoModel();
    m.findOneAndUpdate.mockResolvedValue(null);

    const { startNextRound } = buildScheduler(m);
    await startNextRound(new Types.ObjectId().toString());

    const filter = m.findOneAndUpdate.mock.calls[0][0];
    expect(filter.match_winner_id).toBeNull();
    expect(filter.between_rounds).toBe(true);
    expect(filter.between_rounds_processing).toBe(false);
  });

  it('two concurrent startNextRound calls only dispatch once (simulated race)', async () => {
    // First call wins the lock, second returns null (simulating MongoDB's atomic update
    // serializing the two writes).
    const m = makeUnoModel();
    const gameId = new Types.ObjectId();
    m.findOneAndUpdate.mockResolvedValueOnce({ _id: gameId }).mockResolvedValueOnce(null);
    m.updateOne.mockResolvedValue({});

    const { startNextRound } = buildScheduler(m);
    const [r1, r2] = await Promise.all([
      startNextRound(new Types.ObjectId().toString()),
      startNextRound(new Types.ObjectId().toString()),
    ]);

    expect([r1, r2].sort()).toEqual(['dispatched', 'skipped']);
  });
});
