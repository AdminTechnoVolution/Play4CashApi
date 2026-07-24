import { Types } from 'mongoose';
import { UnoGateway } from './uno.gateway';

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

describe('UnoGateway multiplayer start', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it.each(Array.from({ length: 9 }, (_, index) => index + 2))(
    'creates hands and sends private PLAY state to all %i players',
    async (playerCount) => {
    const roomId = new Types.ObjectId();
    const playerIds = Array.from({ length: playerCount }, () => new Types.ObjectId());
    const room: any = {
      _id: roomId,
      status: 'started',
      player_limit: playerCount,
      bet_amount: 5,
      game_id: {
        _id: new Types.ObjectId(),
        max_players: 10,
        turn_timer_seconds: 45,
        uno_match_target: 200,
      },
      players: playerIds.map((playerId) => ({ playerId, ready: true })),
    };
    const roomModel = {
      findById: jest.fn(() => new Query(room)),
      findOneAndUpdate: jest.fn((_filter: any, update: any) => {
        if (update?.$set?.game_ready_at) room.game_ready_at = update.$set.game_ready_at;
        return new Query(room);
      }),
    };
    const unoModel = {
      create: jest.fn(async (data: any) => ({ _id: new Types.ObjectId(), ...data })),
      deleteOne: jest.fn(),
    };
    const userModel = {
      findOneAndUpdate: jest.fn().mockResolvedValue({ balance: 95 }),
      updateOne: jest.fn(),
      findById: jest.fn((id: Types.ObjectId | string) =>
        new Query({ username: `P${playerIds.findIndex((p) => p.toString() === id.toString()) + 1}` }),
      ),
    };
    const sockets = playerIds.map((playerId) => ({
      data: { player_id: playerId.toString(), isSpectator: false },
      handshake: { query: { lang: 'en' } },
      emit: jest.fn(),
      id: playerId.toString(),
    }));
    const turnDeadlines = { schedule: jest.fn() };
    const gateway = new UnoGateway(
      unoModel as any,
      roomModel as any,
      userModel as any,
      { get: jest.fn(() => undefined) } as any,
      { broadcastRoomUpdate: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      turnDeadlines as any,
    );
    gateway.server = {
      in: jest.fn(() => ({ fetchSockets: jest.fn().mockResolvedValue(sockets) })),
      to: jest.fn(() => ({ emit: jest.fn() })),
    } as any;

    await (gateway as any).tryStartUnoGame(roomId.toString(), 'en');

    expect(userModel.findOneAndUpdate).toHaveBeenCalledTimes(playerCount);
    expect(unoModel.create).toHaveBeenCalledTimes(1);
    expect(turnDeadlines.schedule).toHaveBeenCalledWith(
      'uno',
      roomId.toString(),
      expect.any(String),
      65,
    );
    expect(unoModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ player_ids: playerIds }),
    );
    for (const socket of sockets) {
      expect(socket.emit).toHaveBeenCalledWith(
        'uno',
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            hand: expect.any(Array),
            playerOrder: playerIds.map(String),
            gameStarted: true,
            waitingForOpponent: false,
          }),
        }),
      );
    }
    },
  );
});
