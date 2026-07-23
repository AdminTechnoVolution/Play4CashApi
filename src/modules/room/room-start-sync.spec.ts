import { Types } from 'mongoose';
import { RoomService } from './room.service';
import { RoomStatus } from './schemas/room.schema';

class FakeQuery<T> implements PromiseLike<T> {
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

function playerRef(id: Types.ObjectId, username: string) {
  return {
    _id: id,
    username,
    toString: () => id.toString(),
  };
}

function makeJoinHarness(requiredPlayers = 2) {
  const creatorId = new Types.ObjectId();
  const joinerId = new Types.ObjectId();
  const thirdId = new Types.ObjectId();
  const roomId = new Types.ObjectId();
  const gameId = new Types.ObjectId();
  const room: any = {
    _id: roomId,
    name: 'Sync room',
    game_id: {
      _id: gameId,
      socket_code: 'chess',
      max_players: requiredPlayers,
      min_players: requiredPlayers,
    },
    status: RoomStatus.WAITING,
    player_limit: requiredPlayers,
    players: [{ playerId: playerRef(creatorId, 'Creator'), ready: false, moves: [] }],
    bet_amount: 10,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const roomModel: any = {
    findById: jest.fn(() => new FakeQuery(room)),
    findOneAndUpdate: jest.fn((filter: any, update: any[]) => {
      const requestedId = update?.[0]?.$set?.players?.$concatArrays?.[1]?.[0]?.playerId;
      const duplicate = room.players.some(
        (player: any) => player.playerId.toString() === requestedId?.toString(),
      );
      if (
        room.status !== RoomStatus.WAITING ||
        room.players.length >= requiredPlayers ||
        duplicate
      ) {
        return new FakeQuery(null);
      }
      room.players.push({
        playerId: playerRef(requestedId, requestedId.toString() === joinerId.toString() ? 'Joiner' : 'Third'),
        ready: false,
        moves: [],
      });
      room.updated_at = new Date();
      if (room.players.length === requiredPlayers) {
        room.status = RoomStatus.STARTED;
        room.started_at = new Date();
      }
      return new FakeQuery(room);
    }),
  };
  const userModel = {
    findById: jest.fn().mockResolvedValue({ balance: 100 }),
  };
  const roomsGateway = {
    broadcastRoomUpdate: jest.fn(),
  };
  const service = new RoomService(
    roomModel,
    {} as any,
    userModel as any,
    {} as any,
    roomsGateway as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  return { service, room, roomModel, roomsGateway, creatorId, joinerId, thirdId };
}

describe('RoomService authoritative room start synchronization', () => {
  it('creates a room explicitly in waiting with its creator', async () => {
    const creatorId = new Types.ObjectId();
    const gameId = new Types.ObjectId();
    const createdId = new Types.ObjectId();
    const create = jest.fn().mockResolvedValue({ _id: createdId });
    const roomModel: any = {
      create,
      findById: jest.fn(() => new FakeQuery({
        _id: createdId,
        status: RoomStatus.WAITING,
        game_id: { _id: gameId, socket_code: 'chess' },
        players: [{ playerId: playerRef(creatorId, 'Creator') }],
      })),
    };
    const service = new RoomService(
      roomModel,
      { findById: jest.fn().mockResolvedValue({ min_bet: 1, min_players: 2, max_players: 2, house_edge: 5 }) } as any,
      { findById: jest.fn().mockResolvedValue({ balance: 100 }) } as any,
      {} as any,
      { broadcastRoomUpdate: jest.fn() } as any,
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
    );

    await service.createRoom(creatorId.toString(), gameId.toString(), 10, true);

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      status: RoomStatus.WAITING,
      players: [expect.objectContaining({ playerId: creatorId })],
    }));
  });

  it('atomically starts a full room and returns both players to the joiner', async () => {
    const { service, room, roomsGateway, joinerId } = makeJoinHarness(2);

    const state: any = await service.joinRoom(joinerId.toString(), room._id.toString());

    expect(room.status).toBe(RoomStatus.STARTED);
    expect(state).toEqual(expect.objectContaining({
      status: RoomStatus.STARTED,
      currentPlayers: 2,
      requiredPlayers: 2,
      isCurrentUserInRoom: true,
      canEnterPlay: true,
      gameSocketCode: 'chess',
    }));
    expect(state.players.map((player: any) => player.username)).toEqual(['Creator', 'Joiner']);
    expect(roomsGateway.broadcastRoomUpdate).toHaveBeenCalledWith(
      room.game_id._id.toString(),
      'roomStarted',
      expect.objectContaining({ status: RoomStatus.STARTED }),
    );
  });

  it('allows only one concurrent join into the final slot', async () => {
    const { service, room, joinerId, thirdId } = makeJoinHarness(2);

    const results = await Promise.allSettled([
      service.joinRoom(joinerId.toString(), room._id.toString()),
      service.joinRoom(thirdId.toString(), room._id.toString()),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(room.players).toHaveLength(2);
    expect(room.status).toBe(RoomStatus.STARTED);
  });

  it('returns started idempotently when the joined player retries without duplicating them', async () => {
    const { service, room, joinerId } = makeJoinHarness(2);
    await service.joinRoom(joinerId.toString(), room._id.toString());

    const retry: any = await service.joinRoom(joinerId.toString(), room._id.toString());

    expect(retry.status).toBe(RoomStatus.STARTED);
    expect(retry.currentPlayers).toBe(2);
    expect(room.players).toHaveLength(2);
  });

  it('returns canEnterPlay only to a player in the started room', async () => {
    const { service, room, joinerId, thirdId } = makeJoinHarness(2);
    await service.joinRoom(joinerId.toString(), room._id.toString());

    const member = await service.getRoomState(room._id.toString(), joinerId.toString());
    const outsider = await service.getRoomState(room._id.toString(), thirdId.toString());

    expect(member.data.canEnterPlay).toBe(true);
    expect(member.data.isCurrentUserInRoom).toBe(true);
    expect(outsider.data.canEnterPlay).toBe(false);
    expect(outsider.data.isCurrentUserInRoom).toBe(false);
  });
});
