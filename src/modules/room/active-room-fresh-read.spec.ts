import { RoomService } from './room.service';

describe('RoomService.getActiveRoomForUser', () => {
  it('does not return a cached room after the match is finished', async () => {
    const userId = '64b000000000000000000001';
    const activeRoom = {
      _id: 'room-id',
      status: 'started',
      players: [{ playerId: userId }],
    };
    const lean = jest.fn()
      .mockResolvedValueOnce(activeRoom)
      .mockResolvedValueOnce(null);
    const populatePlayers = jest.fn().mockReturnValue({ lean });
    const populateGame = jest.fn().mockReturnValue({ populate: populatePlayers });
    const findOne = jest.fn().mockReturnValue({ populate: populateGame });
    const service = Object.create(RoomService.prototype) as RoomService;
    Object.defineProperty(service, 'roomModel', { value: { findOne } });
    Object.defineProperty(service, 'localizeRooms', {
      value: jest.fn((rooms: unknown[]) => rooms),
    });

    const first = await service.getActiveRoomForUser(userId);
    const second = await service.getActiveRoomForUser(userId);

    expect(findOne).toHaveBeenCalledTimes(2);
    expect(first.data).toEqual(activeRoom);
    expect(second.data).toBeNull();
  });
});
