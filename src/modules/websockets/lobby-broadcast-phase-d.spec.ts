/**
 * Phase D — handleDisconnect must keep lobby subscribers in sync.
 *
 * Before this phase, when a player disconnected from a `waiting` room the gateway
 * only emitted a private socket message to the remaining peers inside the room. The
 * lobby (`/rooms` namespace) was still showing the old player count until the next
 * polling tick. With high-frequency reconnects this caused the join button to flash
 * "Sala llena" right when a seat was actually available.
 *
 * The fix is for every game gateway's `handleDisconnect(waiting)` branch to emit
 * either `roomUpdated` (when other players remain) or `roomDeleted` (when the room
 * empties out) on the lobby namespace. We assert the contract here against a fake
 * `RoomsGateway` to keep the regression risk tied to a fast unit test rather than
 * full-stack e2e.
 */
import { UnoGateway } from './uno/uno.gateway';

function makeRoomDoc(playerCount: number) {
  return {
    _id: 'room-123',
    status: 'waiting',
    player_limit: 4,
    game_id: { _id: 'game-uno', max_players: 4 },
    players: Array.from({ length: playerCount }).map((_, idx) => ({ playerId: `p-${idx}` })),
    spectators: [],
  };
}

function makeRoomModel(initialPlayers: number, remainingAfterPull: number) {
  const pulledDoc = makeRoomDoc(remainingAfterPull);
  const populatedLean = {
    _id: 'room-123',
    status: 'waiting',
    players: pulledDoc.players,
    game_id: { _id: 'game-uno' },
  };
  const findByIdChain = {
    populate: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(populatedLean),
  };
  return {
    findOne: jest.fn().mockResolvedValue(makeRoomDoc(initialPlayers)),
    findOneAndUpdate: jest.fn().mockResolvedValue(pulledDoc),
    findOneAndDelete: jest.fn().mockResolvedValue(null),
    findById: jest.fn().mockReturnValue(findByIdChain),
    __populatedLean: populatedLean,
    __findByIdChain: findByIdChain,
  } as any;
}

function makeFakeClient() {
  return {
    id: 'sock-abc',
    data: { room_id: 'room-123', player_id: 'p-0' },
    handshake: { query: { lang: 'en' } },
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    emit: jest.fn(),
  } as any;
}

function instantiateGateway(roomModel: any, roomsGateway: any) {
  const unoModel = { findOne: jest.fn().mockResolvedValue(null) } as any;
  const userModel = { findById: jest.fn().mockReturnValue({ select: () => ({ lean: () => Promise.resolve({ username: 'u' }) }) }) } as any;
  const config = { getOrThrow: jest.fn(), get: jest.fn() } as any;
  const redis = {} as any;
  const i18n = { translate: (k: string) => k } as any;
  const grace = { start: jest.fn(), cancel: jest.fn(), registerHandler: jest.fn() } as any;
  const turnDeadlines = { schedule: jest.fn(), cancel: jest.fn(), registerHandler: jest.fn() } as any;
  return new UnoGateway(unoModel, roomModel, userModel, config, roomsGateway, redis, i18n, grace, turnDeadlines);
}

describe('Phase D — UnoGateway.handleDisconnect broadcasts lobby updates', () => {
  it('emits roomUpdated to the lobby when a waiting room still has players', async () => {
    const roomModel = makeRoomModel(2, 1);
    const roomsGateway = { broadcastRoomUpdate: jest.fn() };
    const gateway = instantiateGateway(roomModel, roomsGateway);

    // Force a valid ObjectId-shaped player id so the gateway's `new Types.ObjectId(...)` call doesn't throw.
    const client = makeFakeClient();
    client.data.room_id = '507f1f77bcf86cd799439011';
    client.data.player_id = '507f1f77bcf86cd799439012';
    // Adjust the room doc so the player_id matches one of the room's players.
    (roomModel.findOne as jest.Mock).mockResolvedValue({
      ...makeRoomDoc(2),
      _id: '507f1f77bcf86cd799439011',
    });

    await gateway.handleDisconnect(client);

    expect(roomsGateway.broadcastRoomUpdate).toHaveBeenCalledWith(
      'game-uno',
      'roomUpdated',
      expect.objectContaining({ _id: 'room-123' }),
    );
    expect(roomsGateway.broadcastRoomUpdate).not.toHaveBeenCalledWith(
      expect.anything(),
      'roomDeleted',
      expect.anything(),
    );
  });

  it('emits roomDeleted to the lobby when the waiting room empties out', async () => {
    const roomModel = makeRoomModel(1, 0);
    const roomsGateway = { broadcastRoomUpdate: jest.fn() };
    const gateway = instantiateGateway(roomModel, roomsGateway);

    const client = makeFakeClient();
    client.data.room_id = '507f1f77bcf86cd799439011';
    client.data.player_id = '507f1f77bcf86cd799439012';
    (roomModel.findOne as jest.Mock).mockResolvedValue({
      ...makeRoomDoc(1),
      _id: '507f1f77bcf86cd799439011',
    });

    await gateway.handleDisconnect(client);

    expect(roomsGateway.broadcastRoomUpdate).toHaveBeenCalledWith(
      'game-uno',
      'roomDeleted',
      { id: '507f1f77bcf86cd799439011' },
    );
  });
});
