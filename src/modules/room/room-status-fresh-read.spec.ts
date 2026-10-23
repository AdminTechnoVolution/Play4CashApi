import { RoomService } from './room.service';

describe('RoomService.getRoomStatus', () => {
  it('reads the current room status on every request', async () => {
    const activeRoom = {
      _id: 'room-id',
      status: 'started',
      players: [{ playerId: 'winner-id' }, { playerId: 'loser-id' }],
    };
    const finishedRoom = {
      ...activeRoom,
      status: 'finished',
      winner: 'winner-id',
      winner_reason: 'timeout',
    };
    const lean = jest.fn()
      .mockResolvedValueOnce(activeRoom)
      .mockResolvedValueOnce(finishedRoom);
    const populate = jest.fn().mockReturnValue({ lean });
    const findById = jest.fn().mockReturnValue({ populate });
    const service = Object.create(RoomService.prototype) as RoomService;
    Object.defineProperty(service, 'roomModel', { value: { findById } });

    const first = await service.getRoomStatus('room-id');
    const second = await service.getRoomStatus('room-id');

    expect(findById).toHaveBeenCalledTimes(2);
    expect(populate).toHaveBeenCalledWith('game_id', 'name');
    expect(first.data.status).toBe('started');
    expect(second.data.status).toBe('finished');
    expect(second.data.winner_reason).toBe('timeout');
  });
});
