import { Types } from 'mongoose';
import { UserService } from './user.service';

function makeRoomQuery(rooms: any[]) {
  const query = {
    populate: jest.fn(),
    sort: jest.fn(),
    lean: jest.fn().mockResolvedValue(rooms),
  };
  query.populate.mockReturnValue(query);
  query.sort.mockReturnValue(query);
  return query;
}

function makeService(rooms: any[]): UserService {
  const roomModel = {
    find: jest.fn().mockReturnValue(makeRoomQuery(rooms)),
  };

  return new UserService(
    {} as any,
    roomModel as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
}

function finishedRoom(userId: Types.ObjectId, opponentIds: Types.ObjectId[]) {
  const players = [
    { playerId: { _id: userId, username: 'CurrentPlayer' } },
    ...opponentIds.map((id, index) => ({
      playerId: { _id: id, username: `Opponent${index + 1}` },
    })),
  ];

  return {
    _id: new Types.ObjectId(),
    code: 'ROOM1',
    status: 'finished',
    players,
    game_id: { name: { en: 'Domino' }, socket_code: 'domino' },
    bet_amount: 10,
    house_edge: 5,
    winner: players[0].playerId,
    winner_reason: 'win',
    finished_at: new Date('2026-07-23T12:00:00.000Z'),
  };
}

describe('UserService game history opponents', () => {
  it('returns every other participant in a multiplayer match', async () => {
    const userId = new Types.ObjectId();
    const room = finishedRoom(userId, [
      new Types.ObjectId(),
      new Types.ObjectId(),
      new Types.ObjectId(),
    ]);

    const [history] = await makeService([room]).getHistory(userId.toString(), 'en');

    expect(history.opponents).toEqual([
      { username: 'Opponent1' },
      { username: 'Opponent2' },
      { username: 'Opponent3' },
    ]);
    expect(history.opponent).toEqual({ username: 'Opponent1' });
  });

  it('keeps the legacy singular opponent in a one-on-one match', async () => {
    const userId = new Types.ObjectId();
    const room = finishedRoom(userId, [new Types.ObjectId()]);

    const [history] = await makeService([room]).getHistory(userId.toString(), 'en');

    expect(history.opponents).toEqual([{ username: 'Opponent1' }]);
    expect(history.opponent).toEqual({ username: 'Opponent1' });
  });
});
