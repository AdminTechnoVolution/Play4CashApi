import { Types } from 'mongoose';
import { GameAuditService } from './game-audit.service';

function roomQuery(rooms: any[]) {
  const query: any = {
    populate: jest.fn(),
    lean: jest.fn().mockResolvedValue(rooms),
  };
  query.populate.mockReturnValue(query);
  return query;
}

describe('GameAuditService', () => {
  function setup(rooms: any[], reversals: any[] = []) {
    const runId = new Types.ObjectId();
    const runModel = {
      create: jest.fn().mockResolvedValue({ _id: runId }),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: runId, status: 'completed' }),
      }),
    };
    const roomModel = {
      find: jest.fn().mockReturnValue(roomQuery(rooms)),
    };
    const findingModel = {
      insertMany: jest.fn().mockResolvedValue([]),
    };
    const reversalModel = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(reversals),
        }),
      }),
    };
    const service = new GameAuditService(
      {} as any,
      roomModel as any,
      {} as any,
      runModel as any,
      findingModel as any,
      reversalModel as any,
      {} as any,
    );
    return { service, roomModel, findingModel, runModel };
  }

  it('audits only the paid casual finished scope and marks new zero-action evidence as candidate', async () => {
    const winnerId = new Types.ObjectId();
    const affectedId = new Types.ObjectId();
    const { service, roomModel, findingModel } = setup([{
      _id: new Types.ObjectId(),
      winner: { _id: winnerId, username: 'Winner' },
      audit_evidence_version: 1,
      players: [
        { playerId: { _id: winnerId }, action_count: 2 },
        { playerId: { _id: affectedId }, action_count: 0 },
      ],
    }]);

    await service.run(new Types.ObjectId().toString());

    expect(roomModel.find).toHaveBeenCalledWith(expect.objectContaining({
      status: 'finished',
      source: { $ne: 'tournament' },
      bet_amount: { $gt: 0 },
    }));
    expect(findingModel.insertMany).toHaveBeenCalledWith([
      expect.objectContaining({
        status: 'candidate',
        affected_player_ids: [affectedId],
      }),
    ]);
  });

  it('marks matching historical rooms as inconclusive', async () => {
    const winnerId = new Types.ObjectId();
    const affectedId = new Types.ObjectId();
    const { service, findingModel } = setup([{
      _id: new Types.ObjectId(),
      winner: winnerId,
      players: [
        { playerId: { _id: winnerId }, moves: [{ type: 'move' }] },
        { playerId: { _id: affectedId } },
      ],
    }]);

    await service.run(new Types.ObjectId().toString());

    expect(findingModel.insertMany).toHaveBeenCalledWith([
      expect.objectContaining({
        status: 'inconclusive',
        reason: 'historical_evidence_incomplete',
      }),
    ]);
  });

  it('does not create findings when every non-winner has acted', async () => {
    const winnerId = new Types.ObjectId();
    const { service, findingModel } = setup([{
      _id: new Types.ObjectId(),
      winner: winnerId,
      audit_evidence_version: 1,
      players: [
        { playerId: { _id: winnerId }, action_count: 1 },
        { playerId: { _id: new Types.ObjectId() }, action_count: 1 },
      ],
    }]);

    await service.run(new Types.ObjectId().toString());

    expect(findingModel.insertMany).not.toHaveBeenCalled();
  });

  it('includes rooms without reversals only in the unrefunded review', async () => {
    const winnerId = new Types.ObjectId();
    const affectedId = new Types.ObjectId();
    const room = {
      _id: new Types.ObjectId(),
      winner: winnerId,
      audit_evidence_version: 1,
      players: [
        { playerId: { _id: winnerId }, action_count: 1 },
        { playerId: { _id: affectedId }, action_count: 0 },
      ],
    };
    const unrefunded = setup([room]);
    await unrefunded.service.run(new Types.ObjectId().toString(), undefined, 'unrefunded');
    expect(unrefunded.findingModel.insertMany).toHaveBeenCalled();

    const withRefunds = setup([room]);
    await withRefunds.service.run(new Types.ObjectId().toString(), undefined, 'with_refunds');
    expect(withRefunds.findingModel.insertMany).not.toHaveBeenCalled();
  });

  it('derives partially and fully refunded states from persistent reversals', async () => {
    const winnerId = new Types.ObjectId();
    const firstId = new Types.ObjectId();
    const secondId = new Types.ObjectId();
    const room = {
      _id: new Types.ObjectId(),
      winner: winnerId,
      audit_evidence_version: 1,
      players: [
        { playerId: { _id: winnerId }, action_count: 2 },
        { playerId: { _id: firstId }, action_count: 0 },
        { playerId: { _id: secondId }, action_count: 0 },
      ],
    };
    const partial = setup([room], [{ room_id: room._id, refunded_player_id: firstId }]);
    await partial.service.run(new Types.ObjectId().toString(), undefined, 'with_refunds');
    expect(partial.findingModel.insertMany).toHaveBeenCalledWith([
      expect.objectContaining({
        status: 'partially_refunded',
        refunded_player_ids: [firstId],
        pending_player_ids: [secondId],
      }),
    ]);

    const complete = setup([room], [
      { room_id: room._id, refunded_player_id: firstId },
      { room_id: room._id, refunded_player_id: secondId },
    ]);
    await complete.service.run(new Types.ObjectId().toString(), undefined, 'with_refunds');
    expect(complete.findingModel.insertMany).toHaveBeenCalledWith([
      expect.objectContaining({
        status: 'refunded',
        pending_player_ids: [],
      }),
    ]);
  });
});
