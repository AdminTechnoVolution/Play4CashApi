import { Types } from 'mongoose';
import { startState } from './match-start';

describe('startState', () => {
  it('reports the room revision so clients can send the first move with the current version', () => {
    const room = { _id: new Types.ObjectId(), start_protocol: 1, status: 'started', command_revision: 4 };
    expect(startState(room)).toMatchObject({ phase: 'preparing', version: 4 });
    expect(startState({ ...room, play_started_at: new Date(), command_revision: 5 })).toMatchObject({ phase: 'active', version: 5 });
    expect(startState({ _id: room._id, status: 'started' })).toMatchObject({ phase: 'legacy', version: 0 });
  });
});
