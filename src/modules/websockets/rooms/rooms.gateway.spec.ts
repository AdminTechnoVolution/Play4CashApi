import { Types } from 'mongoose';
import { RoomsGateway } from './rooms.gateway';

function queryResult(room: any) {
  return {
    populate: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(room),
  };
}

describe('RoomsGateway authoritative room state', () => {
  const roomId = new Types.ObjectId().toString();
  const gameId = new Types.ObjectId().toString();
  const playerId = new Types.ObjectId().toString();
  const outsiderId = new Types.ObjectId().toString();
  const room = {
    _id: roomId,
    name: 'Table',
    game_id: { _id: gameId, socket_code: 'uno', max_players: 2 },
    status: 'started',
    bet_amount: 10,
    players: [
      { playerId: { _id: playerId, username: 'Ana' } },
      { playerId: { _id: new Types.ObjectId(), username: 'Luis' } },
    ],
    updated_at: new Date('2026-07-23T12:00:00.000Z'),
    started_at: new Date('2026-07-23T12:00:00.000Z'),
  };

  function setup(authenticatedId = playerId) {
    const roomModel = { findById: jest.fn(() => queryResult(room)) };
    const gateway = new RoomsGateway({} as any, {} as any, roomModel as any);
    const client = {
      data: { player_id: authenticatedId },
      join: jest.fn().mockResolvedValue(undefined),
      emit: jest.fn(),
    } as any;
    return { gateway, client, roomModel };
  }

  it('emits the complete member state when subscribing with room_id', async () => {
    const { gateway, client } = setup();

    await gateway.handleSubscribe(client, { game_id: gameId, room_id: roomId });

    expect(client.join).toHaveBeenCalledWith(`game:${gameId}`);
    expect(client.emit).toHaveBeenCalledWith(
      'roomState',
      expect.objectContaining({
        roomId,
        gameId,
        gameSocketCode: 'uno',
        currentPlayers: 2,
        requiredPlayers: 2,
        isCurrentUserInRoom: true,
        canEnterPlay: true,
      }),
    );
  });

  it('returns refreshed state on an explicit sync request', async () => {
    const { gateway, client, roomModel } = setup();
    const waitingRoom = { ...room, status: 'waiting', players: room.players.slice(0, 1) };
    roomModel.findById
      .mockImplementationOnce(() => queryResult(waitingRoom))
      .mockImplementationOnce(() => queryResult(room));

    await gateway.handleSyncRoomState(client, { room_id: roomId });
    await gateway.handleSyncRoomState(client, { room_id: roomId });

    expect(roomModel.findById).toHaveBeenCalledTimes(2);
    expect(client.emit).toHaveBeenNthCalledWith(
      1,
      'roomState',
      expect.objectContaining({ roomId, status: 'waiting', currentPlayers: 1 }),
    );
    expect(client.emit).toHaveBeenNthCalledWith(
      2,
      'roomState',
      expect.objectContaining({ roomId, status: 'started', currentPlayers: 2 }),
    );
  });

  it('does not grant play access to an authenticated outsider', async () => {
    const { gateway, client } = setup(outsiderId);

    await gateway.handleSyncRoomState(client, { room_id: roomId });

    expect(client.emit).toHaveBeenCalledWith(
      'roomState',
      expect.objectContaining({
        isCurrentUserInRoom: false,
        canEnterPlay: false,
      }),
    );
  });

  it('reports invalid identifiers without disconnecting the socket', async () => {
    const { gateway, client, roomModel } = setup();

    await gateway.handleSyncRoomState(client, { room_id: 'invalid' });

    expect(roomModel.findById).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith('rooms', {
      success: false,
      messages: ['Invalid room_id'],
      data: { event: 'roomStateError', reason: 'invalid' },
    });
  });
});
