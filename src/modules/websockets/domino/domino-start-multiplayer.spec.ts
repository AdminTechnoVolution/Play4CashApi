import { Types } from 'mongoose';
import { DominoGateway } from './domino.gateway';

class Query<T> implements PromiseLike<T> {
  constructor(private readonly value: T) {}
  populate(): this { return this; }
  select(): this { return this; }
  lean(): Promise<T> { return Promise.resolve(this.value); }
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.value).then(onfulfilled, onrejected);
  }
}

describe('DominoGateway multiplayer start', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it.each(Array.from({ length: 9 }, (_, index) => index + 2))(
    'creates and privately synchronizes all %i players exactly once',
    async (playerCount) => {
    const roomId = new Types.ObjectId();
    const gameId = new Types.ObjectId();
    const playerIds = Array.from({ length: playerCount }, () => new Types.ObjectId());
    const room: any = {
      _id: roomId,
      status: 'started',
      player_limit: playerCount,
      bet_amount: 10,
      game_id: { _id: gameId, max_players: 10, turn_timer_seconds: 30 },
      players: playerIds.map((playerId) => ({ playerId, ready: true, moves: [] })),
    };
    const roomModel = {
      findById: jest.fn(() => new Query(room)),
      findOneAndUpdate: jest.fn((_filter: any, update: any) => {
        if (update?.$set?.game_ready_at) room.game_ready_at = update.$set.game_ready_at;
        return new Query(room);
      }),
    };
    const createdId = new Types.ObjectId();
    const dominoModel = {
      create: jest.fn(async (data: any) => ({ _id: createdId, ...data })),
      deleteOne: jest.fn(),
    };
    const userModel = {
      findOneAndUpdate: jest.fn().mockResolvedValue({ balance: 90 }),
      updateOne: jest.fn(),
      findById: jest.fn((id: Types.ObjectId) =>
        new Query({ username: `P${playerIds.findIndex((p) => p.equals(id)) + 1}` }),
      ),
    };
    const sockets = playerIds.map((playerId) => ({
      data: { player_id: playerId.toString(), isSpectator: false },
      handshake: { query: { lang: 'en' } },
      emit: jest.fn(),
      id: playerId.toString(),
    }));
    const server = {
      in: jest.fn(() => ({ fetchSockets: jest.fn().mockResolvedValue(sockets) })),
      to: jest.fn(() => ({ emit: jest.fn() })),
    };
    const gateway = new DominoGateway(
      dominoModel as any,
      roomModel as any,
      userModel as any,
      {} as any,
      { broadcastRoomUpdate: jest.fn() } as any,
      {} as any,
      { translate: jest.fn((key: string) => key) } as any,
      {} as any,
      { schedule: jest.fn() } as any,
    );
    gateway.server = server as any;

    await (gateway as any).tryStartDominoGame(roomId.toString(), 'en');

    expect(userModel.findOneAndUpdate).toHaveBeenCalledTimes(playerCount);
    expect(dominoModel.create).toHaveBeenCalledTimes(1);
    const createdState = dominoModel.create.mock.calls[0][0];
    expect(createdState).toEqual(expect.objectContaining({
      room_id: roomId.toString(),
      player_ids: playerIds,
    }));
    const handSizes = playerIds.map((id) => createdState.hands[id.toString()].length);
    expect(new Set(handSizes)).toEqual(new Set([Math.min(7, Math.floor(28 / playerCount))]));
    for (const socket of sockets) {
      expect(socket.emit).toHaveBeenCalledWith(
        'domino',
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            hand: expect.any(Array),
            gameStarted: true,
            waitingForOpponent: false,
          }),
        }),
      );
    }
    },
  );

  it('does not delete a pre-existing game when create reports E11000', async () => {
    const roomId = new Types.ObjectId();
    const players = [new Types.ObjectId(), new Types.ObjectId()];
    const room = {
      _id: roomId,
      status: 'started',
      player_limit: 2,
      bet_amount: 10,
      game_id: { _id: new Types.ObjectId(), max_players: 2 },
      players: players.map((playerId) => ({ playerId, ready: true })),
    };
    const roomModel = {
      findById: jest.fn(() => new Query(room)),
      findOneAndUpdate: jest.fn(() => new Query(room)),
      updateOne: jest.fn(),
    };
    const duplicate = Object.assign(new Error('duplicate'), { code: 11000 });
    const dominoModel = {
      create: jest.fn().mockRejectedValue(duplicate),
      deleteOne: jest.fn(),
    };
    const gateway = new DominoGateway(
      dominoModel as any,
      roomModel as any,
      {
        findOneAndUpdate: jest.fn().mockResolvedValue({}),
        updateOne: jest.fn().mockResolvedValue({}),
      } as any,
      {} as any,
      {} as any,
      {} as any,
      { translate: jest.fn((key: string) => key) } as any,
      {} as any,
      {} as any,
    );
    gateway.server = {
      to: jest.fn(() => ({ emit: jest.fn() })),
      in: jest.fn(() => ({ fetchSockets: jest.fn().mockResolvedValue([]) })),
    } as any;

    await (gateway as any).tryStartDominoGame(roomId.toString(), 'en');

    expect(dominoModel.deleteOne).not.toHaveBeenCalled();
  });
});
