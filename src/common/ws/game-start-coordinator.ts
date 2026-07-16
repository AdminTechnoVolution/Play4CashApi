import { randomUUID } from 'crypto';
import { Model } from 'mongoose';

export type GameStartLease<T> = { token: string; room: T };

/**
 * Keeps a room publicly `waiting` while a gateway prepares balances and game
 * state. Only the lease owner may publish `started` or roll the attempt back.
 */
export async function acquireGameStartLease<T = any>(
  roomModel: Model<any>,
  roomId: string,
): Promise<GameStartLease<T> | null> {
  const token = randomUUID();
  const room = await roomModel.findOneAndUpdate(
    {
      _id: roomId,
      status: 'waiting',
      $or: [{ start_lock: { $exists: false } }, { start_lock: null }],
    },
    { $set: { start_lock: token, start_locked_at: new Date() } },
    { returnDocument: 'after' },
  );
  return room ? { token, room: room as T } : null;
}

export async function publishGameStarted(
  roomModel: Model<any>,
  roomId: string,
  token: string,
  extra: Record<string, unknown> = {},
): Promise<any | null> {
  return roomModel.findOneAndUpdate(
    { _id: roomId, status: 'waiting', start_lock: token },
    {
      $set: { status: 'started', ...extra },
      $unset: { start_lock: 1, start_locked_at: 1 },
    },
    { returnDocument: 'after' },
  );
}

export async function releaseGameStartLease(
  roomModel: Model<any>,
  roomId: string,
  token: string,
): Promise<void> {
  await roomModel.updateOne(
    { _id: roomId, status: 'waiting', start_lock: token },
    { $unset: { start_lock: 1, start_locked_at: 1 } },
  );
}
