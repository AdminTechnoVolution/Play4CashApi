import { assertFinanceEligibility } from './eligibility';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Connection, Types } from 'mongoose';
import Decimal from 'decimal.js';
import { LedgerService } from './ledger.service';
import { positiveMoney, bsonMoney } from './money';
import { fingerprint } from './canonical';

export async function registerTournament(db: Connection, tournamentId: string, userId: string, key: string, unregister = false) {
  const ledger = new LedgerService(db);
  return ledger.transaction(async session => {
    if (!unregister) await assertFinanceEligibility(db, userId, session);
    const requestId = `tournament:${unregister ? 'unregister' : 'register'}:${userId}:${key}`;
    const hash = fingerprint({ tournamentId, userId, unregister });
    const previous = await db.collection('finance_requests').findOne({ _id: requestId as any }, { session });
    if (previous) {
      if (previous.hash !== hash) throw new ConflictException('IDEMPOTENCY_CONFLICT');
      return previous.result;
    }
    const t = await db.collection('tournaments').findOne({ _id: new Types.ObjectId(tournamentId) }, { session });
    if (!t) throw new NotFoundException('Tournament not found');
    if (!['open', 'full', ...(unregister ? ['countdown'] : [])].includes(t.status)) throw new BadRequestException('Tournament registration closed');
    const participants = db.collection('tournamentparticipants');
    const participant = await participants.findOne({ tournament_id: t._id, user_id: new Types.ObjectId(userId) }, { session });
    let result: any;
    if (!unregister && participant) result = { registered: true, participantId: String(participant._id), alreadyRegistered: true };
    else {
      if (unregister && !participant) throw new NotFoundException('Not registered');
      if (!unregister && t.registered_count >= t.max_players) throw new ConflictException('Tournament is full');
      const user = await db.collection('users').findOne({ _id: new Types.ObjectId(userId) }, { session });
      if (!user) throw new NotFoundException('User not found');
      const amount = positiveMoney(String(t.buy_in_decimal ?? t.buy_in));
      const delta = new Decimal(amount).mul(unregister ? 1 : -1);
      const participantId = participant?._id ?? new Types.ObjectId();
      await ledger.post(`tournament:${unregister ? 'refund' : 'stake'}:${tournamentId}:${participantId}`, [
        { account: `user:${userId}:available`, amount: delta.toFixed(6) },
        { account: `escrow:tournament:${tournamentId}`, amount: delta.negated().toFixed(6) },
      ], session);
      const count = t.registered_count + (unregister ? -1 : 1);
      const status = unregister ? 'open' : count >= t.max_players ? (t.starts_at > new Date() ? 'countdown' : 'full') : t.status;
      const pool = new Decimal(String(t.gross_prize_pool ?? 0)).plus(delta.negated());
      await db.collection('tournaments').updateOne({ _id: t._id }, { $set: { registered_count: count, status, gross_prize_pool: bsonMoney(pool.toFixed(6)) } }, { session });
      if (unregister) await participants.deleteOne({ _id: participantId }, { session });
      else {
        const group = ((count - 1) % t.group_count) + 1;
        await participants.insertOne({ _id: participantId, tournament_id: t._id, user_id: user._id, username: user.username,
          status: 'registered', seed: count, group_number: group, registered_at: new Date(), createdAt: new Date(), updatedAt: new Date() }, { session });
      }
      await db.collection('tournamenttransactions').insertOne({ tournament_id: t._id, user_id: user._id,
        type: unregister ? 'registration_refund' : 'registration_debit', amount: bsonMoney(delta.toFixed(6)),
        status: 'completed', idempotency_key: requestId, reference: unregister ? 'refund' : 'registration', createdAt: new Date() }, { session });
      result = unregister ? { unregistered: true, registeredCount: count, status }
        : { registered: true, participantId: String(participantId), registeredCount: count, status, seed: count, groupNumber: ((count - 1) % t.group_count) + 1 };
    }
    await db.collection('finance_requests').insertOne({ _id: requestId as any, hash, result, createdAt: new Date() }, { session });
    return result;
  });
}
export async function settleTournament(db: Connection, id: string, winner: string, runnerUp: string) {
  if (winner === runnerUp) throw new Error('TOURNAMENT_WINNERS_MUST_DIFFER');
  const ledger = new LedgerService(db);
  await ledger.transaction(async session => {
    const t = await db.collection('tournaments').findOne({ _id: new Types.ObjectId(id) }, { session });
    if (!t || t.prizes_settled || t.status === 'cancelled') return;
    const participants = await db.collection('tournamentparticipants').find({ tournament_id: t._id,
      user_id: { $in: [new Types.ObjectId(winner), new Types.ObjectId(runnerUp)] } }, { session }).toArray();
    if (participants.length !== 2) throw new Error('TOURNAMENT_WINNER_NOT_REGISTERED');
    const account = await db.collection('finance_accounts').findOne({ account: `escrow:tournament:${id}` }, { session });
    const pot = new Decimal(account?.balance?.toString() ?? 0);
    if (pot.lte(0)) throw new Error('TOURNAMENT_ESCROW_EMPTY');
    const feePercent = new Decimal(String(t.house_fee_percent));
    const firstPercent = new Decimal(String(t.first_place_percent));
    if (feePercent.lt(0) || firstPercent.lt(0) || feePercent.plus(firstPercent).gt(100)) throw new Error('INVALID_PRIZE_SPLIT');
    const fee = pot.mul(feePercent).div(100).toDecimalPlaces(6, Decimal.ROUND_DOWN);
    const first = pot.mul(firstPercent).div(100).toDecimalPlaces(6, Decimal.ROUND_DOWN);
    const second = pot.minus(fee).minus(first);
    await ledger.post(`tournament:settle:${id}`, [
      { account: `escrow:tournament:${id}`, amount: pot.negated().toFixed(6) },
      { account: `user:${winner}:available`, amount: first.toFixed(6) },
      { account: `user:${runnerUp}:available`, amount: second.toFixed(6) },
      { account: 'house:main', amount: fee.toFixed(6) },
    ], session);
    await db.collection('tournaments').updateOne({ _id: t._id }, { $set: { status: 'finished', prizes_settled: true,
      winner_user_id: new Types.ObjectId(winner), runner_up_user_id: new Types.ObjectId(runnerUp), finished_at: new Date(),
      house_amount: bsonMoney(fee.toFixed(6)), first_place_amount: bsonMoney(first.toFixed(6)), second_place_amount: bsonMoney(second.toFixed(6)) } }, { session });
    for (const [userId, status, rank] of [[winner, 'winner', 1], [runnerUp, 'runner_up', 2]] as const) {
      await db.collection('tournamentparticipants').updateOne({ tournament_id: t._id, user_id: new Types.ObjectId(userId) },
        { $set: { status, final_rank: rank } }, { session });
    }
  });
}

export async function refundCancelledParticipant(db: Connection, tournamentId: string, userId: string) {
  const ledger = new LedgerService(db);
  await ledger.transaction(async session => {
    const t = await db.collection('tournaments').findOne({ _id: new Types.ObjectId(tournamentId), status: 'cancelled' }, { session });
    const participant = await db.collection('tournamentparticipants').findOne({ tournament_id: new Types.ObjectId(tournamentId), user_id: new Types.ObjectId(userId) }, { session });
    if (!t || !participant || participant.status === 'refunded') return;
    const paid = await db.collection('finance_journals').findOne({ operationId: `tournament:stake:${tournamentId}:${participant._id}` }, { session });
    if (!paid) throw new Error('TOURNAMENT_STAKE_NOT_FOUND');
    const debit = paid.postings.find((p: any) => p.account === `user:${userId}:available`);
    const amount = new Decimal(debit.amount.toString()).negated();
    await ledger.post(`tournament:refund:${tournamentId}:${participant._id}`, [
      { account: `user:${userId}:available`, amount: amount.toFixed(6) },
      { account: `escrow:tournament:${tournamentId}`, amount: amount.negated().toFixed(6) },
    ], session);
    await db.collection('tournamentparticipants').updateOne({ _id: participant._id }, { $set: { status: 'refunded' } }, { session });
  });
}
