import { randomUUID } from 'crypto';
import { Model } from 'mongoose';

export type GameStartLease<T> = { token: string; room: T };

/**
 * Serializes game-state initialization. A room may already be publicly `started`
 * because its roster became full in the HTTP join transaction; the lease still
 * guarantees that only one gateway instance creates game state and charges bets.
 */
export async function acquireGameStartLease<T = any>(
  roomModel: Model<any>,
  roomId: string,
): Promise<GameStartLease<T> | null> {
  const token = randomUUID();
  const room = await roomModel.findOneAndUpdate(
    {
      _id: roomId,
      status: { $in: ['waiting', 'started'] },
      $and: [
        {
          $or: [
            { game_ready_at: { $exists: false } },
            { game_ready_at: null },
          ],
        },
      ],
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
    { _id: roomId, status: { $in: ['waiting', 'started'] }, start_lock: token },
    {
      $set: { status: 'started', game_ready_at: new Date(), ...extra },
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
    { _id: roomId, status: { $in: ['waiting', 'started'] }, start_lock: token },
    { $unset: { start_lock: 1, start_locked_at: 1 } },
  );
}
