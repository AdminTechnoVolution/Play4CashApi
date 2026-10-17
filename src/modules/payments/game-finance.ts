import { assertFinanceEligibility } from './eligibility';
import { Model, Connection, Types } from 'mongoose';
import Decimal from 'decimal.js';
import { LedgerService } from './ledger.service';
import { positiveMoney } from './money';

/** The test-era gateway signatures remain compatible; money flows through one ledger when v2 is enabled. */
export async function gameFinancialUpdate(
  users: Model<any>, method: 'updateOne' | 'findOneAndUpdate' | 'findByIdAndUpdate',
  args: any[], roomId: string,
): Promise<any> {
  const payoutUpdate = args[1];
  if (payoutUpdate?.$inc?.total_won !== undefined && users.db) {
    const match = await users.db.collection('rooms').findOne({ _id: new Types.ObjectId(roomId) });
    if (match?.start_protocol === 1 && !match.play_started_at) throw new Error('MATCH_START_NOT_CONFIRMED');
  }
  if (process.env.FINANCE_V2_ENABLED !== 'true') return (users as any)[method](...args);
  const userId = String(method === 'findByIdAndUpdate' ? args[0] : args[0]._id);
  const update = args[1];
  const delta = new Decimal(String(update.$inc.balance));
  const ledger = new LedgerService(users.db);
  try {
    if (update.$inc.total_won !== undefined) await settleGameRoom(users.db, roomId);
    else await ledger.transaction(async session => {
      const room = await users.db.collection('rooms').findOne({ _id: new Types.ObjectId(roomId) }, { session });
      if (!room) throw new Error('INVALID_CASUAL_FINANCE_ROOM');
      if (room.source === 'tournament') {
        if (!room.tournament_id || !room.players.some((p: any) => String(p.playerId) === userId)) throw new Error('INVALID_TOURNAMENT_GAME_SEAT');
        const tournament = await users.db.collection('tournaments').findOne({ _id: room.tournament_id }, { session });
        const participant = await users.db.collection('tournamentparticipants').findOne({ tournament_id: room.tournament_id, user_id: new Types.ObjectId(userId) }, { session });
        if (!tournament || tournament.status === 'cancelled' || tournament.prizes_settled || !participant || participant.status === 'refunded') throw new Error('TOURNAMENT_GAME_NOT_ACTIVE');
        const paid = await users.db.collection('finance_journals').findOne({ operationId: `tournament:stake:${room.tournament_id}:${participant._id}` }, { session });
        if (!paid) throw new Error('TOURNAMENT_REGISTRATION_NOT_FUNDED');
        // Entry was already reserved in tournament escrow; individual matches never charge again.
        return;
      }
      const stake = positiveMoney(String(room.bet_amount_decimal ?? room.bet_amount));
      if (!delta.abs().eq(String(room.bet_amount))) throw new Error('STAKE_AMOUNT_MISMATCH');
      const exactDelta = new Decimal(stake).mul(delta.isNegative() ? -1 : 1);
      if (delta.isNegative()) {
        await assertFinanceEligibility(users.db, userId, session);
        if (!['waiting', 'started'].includes(room.status) || room.finance_cancelled) throw new Error('ROOM_NOT_CHARGEABLE');
        await ledger.post(`room:stake:${roomId}:${userId}`, [
          { account: `user:${userId}:available`, amount: exactDelta.toFixed(6) },
          { account: `escrow:room:${roomId}`, amount: exactDelta.negated().toFixed(6) },
        ], session);
      } else {
        const paid = await users.db.collection('finance_journals').findOne({ operationId: `room:stake:${roomId}:${userId}` }, { session });
        if (!paid) throw new Error('NO_STAKE_TO_REFUND');
        await ledger.post(`room:refund:${roomId}:${userId}`, [
          { account: `escrow:room:${roomId}`, amount: exactDelta.negated().toFixed(6) },
          { account: `user:${userId}:available`, amount: exactDelta.toFixed(6) },
        ], session);
        // Failed starts cannot reuse an already-refunded stake idempotency key.
        if (room.status !== 'finished') await users.db.collection('rooms').updateOne({ _id: room._id },
          { $set: { status: 'finished', finance_cancelled: true, winner_reason: 'startup_failed', finished_at: new Date() } }, { session });
      }
    });
    if (method === 'updateOne') return { matchedCount: 1, modifiedCount: 1, acknowledged: true };
    return users.findById(userId);
  } catch (error) {
    if (delta.isNegative() && (error as Error).message === 'INSUFFICIENT_BALANCE') return null;
    throw error;
  }
}

/** Finished rooms are recoverable even if the gateway died before awarding the winner. */
export async function settleGameRoom(db: Connection, roomId: string): Promise<void> {
  const ledger = new LedgerService(db);
  await ledger.transaction(async session => {
    const room = await db.collection('rooms').findOne({ _id: new Types.ObjectId(roomId), status: 'finished' }, { session });
    if (!room || room.source === 'tournament' || room.finance_settled) return;
    const escrow = await db.collection('finance_accounts').findOne({ account: `escrow:room:${roomId}` }, { session });
    const pot = new Decimal(escrow?.balance?.toString() ?? '0');
    if (pot.isZero()) {
      await db.collection('rooms').updateOne({ _id: room._id }, { $set: { finance_settled: true, finance_settled_at: new Date() } }, { session });
      return;
    }
    if (room.winner && !room.finance_cancelled && room.start_protocol === 1 && !room.play_started_at) throw new Error('MATCH_START_NOT_CONFIRMED');
    if (room.winner && !room.finance_cancelled) {
      const winner = String(room.winner);
      if (!room.players.some((p: any) => String(p.playerId) === winner)) throw new Error('WINNER_NOT_IN_ROOM');
      const edge = new Decimal(String(room.house_edge ?? 0));
      if (edge.lt(0) || edge.gt(100)) throw new Error('INVALID_HOUSE_EDGE');
      const prize = pot.mul(new Decimal(1).minus(edge.div(100))).toDecimalPlaces(6, Decimal.ROUND_DOWN);
      const fee = pot.minus(prize);
      await ledger.post(`room:settle:${roomId}`, [
        { account: `escrow:room:${roomId}`, amount: pot.negated().toFixed(6) },
        { account: `user:${winner}:available`, amount: prize.toFixed(6) },
        { account: 'house:main', amount: fee.toFixed(6) },
      ], session);
      await db.collection('users').updateOne({ _id: new Types.ObjectId(winner) },
        { $inc: { total_won: Types.Decimal128.fromString(prize.toFixed(6)) } }, { session });
    } else {
      const stakes = await db.collection('finance_journals').find({ operationId: { $regex: `^room:stake:${roomId}:` } }, { session }).toArray();
      for (const stake of stakes) {
        const debit = stake.postings.find((p: any) => p.account.endsWith(':available'));
        const userId = debit.account.split(':')[1];
        if (await db.collection('finance_journals').findOne({ operationId: `room:refund:${roomId}:${userId}` }, { session })) continue;
        const amount = new Decimal(debit.amount.toString()).negated();
        await ledger.post(`room:refund:${roomId}:${userId}`, [
          { account: `escrow:room:${roomId}`, amount: amount.negated().toFixed(6) },
          { account: `user:${userId}:available`, amount: amount.toFixed(6) },
        ], session);
      }
    }
    await db.collection('rooms').updateOne({ _id: room._id }, { $set: { finance_settled: true, finance_settled_at: new Date() } }, { session });
  });
}
