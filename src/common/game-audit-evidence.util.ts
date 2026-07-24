import { Model, Types } from 'mongoose';

/** Records a successful player action uniformly without coupling game gateways. */
export async function recordGameAuditAction(
  roomModel: Model<any>,
  roomId: string,
  playerId: string,
  type: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  const at = new Date();
  await roomModel.updateOne(
    { _id: new Types.ObjectId(roomId), 'players.playerId': new Types.ObjectId(playerId) },
    {
      $inc: { 'players.$.action_count': 1 },
      $set: { 'players.$.last_action_at': at },
      $push: { 'players.$.moves': { data: { type, at, ...data } } },
    },
  );
  await roomModel.updateOne(
    {
      _id: new Types.ObjectId(roomId),
      'players.playerId': new Types.ObjectId(playerId),
      'players.first_action_at': { $exists: false },
    },
    { $set: { 'players.$.first_action_at': at } },
  );
}
