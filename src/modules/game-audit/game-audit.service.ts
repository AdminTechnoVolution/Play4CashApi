import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { BusinessException } from '../../common/exceptions/business.exception';
import { Room, RoomStatus } from '../room/schemas/room.schema';
import { User } from '../user/schemas/user.schema';
import { UserService } from '../user/user.service';
import {
  GameAuditFinding,
  GameAuditFindingDocument,
  GameAuditReversal,
  GameAuditReversalDocument,
  GameAuditRun,
  GameAuditRunDocument,
} from './schemas/game-audit.schema';

const EXCLUDED_REASONS = new Set([
  'draw', 'stalemate', 'insufficient_material', 'match_cancelled',
  'start_state_missing_refunded', 'cancelled',
]);

const GAME_STATE_COLLECTIONS: Record<string, string> = {
  chess: 'chessgames',
  domino: 'dominogames',
  uno: 'unogames',
  halma: 'halmagames',
  'connect-four': 'connectfourgames',
  connect_four: 'connectfourgames',
};

@Injectable()
export class GameAuditService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Room.name) private readonly roomModel: Model<any>,
    @InjectModel(User.name) private readonly userModel: Model<any>,
    @InjectModel(GameAuditRun.name) private readonly runModel: Model<GameAuditRunDocument>,
    @InjectModel(GameAuditFinding.name) private readonly findingModel: Model<GameAuditFindingDocument>,
    @InjectModel(GameAuditReversal.name) private readonly reversalModel: Model<GameAuditReversalDocument>,
    private readonly userService: UserService,
  ) {}

  private eligibleFilter(roomId?: string) {
    const filter: any = {
      status: RoomStatus.FINISHED,
      source: { $ne: 'tournament' },
      bet_amount: { $gt: 0 },
      winner: { $exists: true, $ne: null },
      winner_reason: { $nin: [...EXCLUDED_REASONS] },
    };
    if (roomId) {
      if (!Types.ObjectId.isValid(roomId)) throw new BusinessException('ERROR_NOT_FOUND', 404);
      filter._id = new Types.ObjectId(roomId);
    }
    return filter;
  }

  private affectedPlayers(room: any): any[] {
    const winnerId = (room.winner?._id || room.winner)?.toString?.();
    return (room.players || []).filter((player: any) => {
      const id = player.playerId?._id?.toString?.() || player.playerId?.toString?.();
      const count = Math.max(Number(player.action_count || 0), Number(player.moves?.length || 0));
      return id && id !== winnerId && count === 0;
    });
  }

  async run(
    adminId: string,
    roomId?: string,
    reviewFilter: 'all' | 'unrefunded' | 'with_refunds' = 'all',
  ) {
    const run = await this.runModel.create({
      admin_id: new Types.ObjectId(adminId),
      room_id: roomId ? new Types.ObjectId(roomId) : undefined,
      review_filter: reviewFilter,
      status: 'running',
    });
    try {
      const rooms = await this.roomModel
        .find(this.eligibleFilter(roomId))
        .populate('players.playerId', 'username balance total_won audit_balance_debt')
        .lean();
      const reversals = rooms.length
        ? await this.reversalModel
            .find({ room_id: { $in: rooms.map((room: any) => room._id) } })
            .select('room_id refunded_player_id')
            .lean()
        : [];
      const refundedByRoom = new Map<string, Set<string>>();
      for (const reversal of reversals as any[]) {
        const key = reversal.room_id.toString();
        if (!refundedByRoom.has(key)) refundedByRoom.set(key, new Set());
        refundedByRoom.get(key)!.add(reversal.refunded_player_id.toString());
      }
      const selectedRooms = rooms.filter((room: any) => {
        const hasRefunds = (refundedByRoom.get(room._id.toString())?.size || 0) > 0;
        if (reviewFilter === 'unrefunded') return !hasRefunds;
        if (reviewFilter === 'with_refunds') return hasRefunds;
        return true;
      });
      const findings = selectedRooms.flatMap((room: any) => {
        const affected = this.affectedPlayers(room);
        if (affected.length === 0) return [];
        const refunded = refundedByRoom.get(room._id.toString()) || new Set<string>();
        const affectedIds = affected.map(
          (player: any) => (player.playerId._id || player.playerId).toString(),
        );
        const refundedIds = affectedIds.filter((id: string) => refunded.has(id));
        const pendingIds = affectedIds.filter((id: string) => !refunded.has(id));
        const status = refundedIds.length > 0
          ? (pendingIds.length > 0 ? 'partially_refunded' : 'refunded')
          : (Number(room.audit_evidence_version || 0) >= 1 ? 'candidate' : 'inconclusive');
        return [{
          run_id: run._id,
          room_id: room._id,
          status,
          affected_player_ids: affectedIds.map((id: string) => new Types.ObjectId(id)),
          refunded_player_ids: refundedIds.map((id: string) => new Types.ObjectId(id)),
          pending_player_ids: pendingIds.map((id: string) => new Types.ObjectId(id)),
          reason: Number(room.audit_evidence_version || 0) >= 1
            ? 'one_or_more_players_have_zero_turn_actions'
            : 'historical_evidence_incomplete',
        }];
      });
      if (findings.length) await this.findingModel.insertMany(findings);
      await this.runModel.updateOne(
        { _id: run._id },
        { $set: { status: 'completed', scanned_count: selectedRooms.length, finding_count: findings.length } },
      );
      return this.getRun(run._id.toString());
    } catch (error) {
      await this.runModel.updateOne(
        { _id: run._id },
        { $set: { status: 'failed', error: (error as Error).message } },
      );
      throw error;
    }
  }

  async getRun(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new BusinessException('ERROR_NOT_FOUND', 404);
    const run = await this.runModel.findById(id).lean();
    if (!run) throw new BusinessException('ERROR_NOT_FOUND', 404);
    return run;
  }

  async listResults(runId: string, status?: string, page = 1, limit = 25) {
    if (!Types.ObjectId.isValid(runId)) throw new BusinessException('ERROR_NOT_FOUND', 404);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 25));
    const safePage = Math.max(1, Number(page) || 1);
    const filter: any = { run_id: new Types.ObjectId(runId) };
    if (status && ['candidate', 'inconclusive', 'partially_refunded', 'refunded', 'discarded'].includes(status)) {
      filter.status = status;
    }
    const [items, total] = await Promise.all([
      this.findingModel.find(filter).sort({ createdAt: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit).lean(),
      this.findingModel.countDocuments(filter),
    ]);
    const rooms = await this.roomModel
      .find({ _id: { $in: items.map((item: any) => item.room_id) } })
      .populate('game_id', 'name socket_code')
      .populate('players.playerId', 'username')
      .populate('winner', 'username')
      .lean();
    const byId = new Map(rooms.map((room: any) => [room._id.toString(), room]));
    return {
      items: items.map((item: any) => ({ ...item, room: byId.get(item.room_id.toString()) })),
      total,
      page: safePage,
      limit: safeLimit,
    };
  }

  async getRoomDetail(roomId: string) {
    if (!Types.ObjectId.isValid(roomId)) throw new BusinessException('ERROR_NOT_FOUND', 404);
    const room = await this.roomModel
      .findById(roomId)
      .populate('game_id', 'name socket_code')
      .populate('players.playerId', 'username balance total_won audit_balance_debt')
      .populate('winner', 'username balance total_won audit_balance_debt')
      .lean();
    if (!room) throw new BusinessException('ERROR_NOT_FOUND', 404);
    const collectionName = GAME_STATE_COLLECTIONS[(room as any).game_id?.socket_code];
    const [reversals, durableGameState] = await Promise.all([
      this.reversalModel.find({ room_id: new Types.ObjectId(roomId) }).sort({ createdAt: 1 }).lean(),
      collectionName
        ? this.connection.collection(collectionName).findOne({ room_id: new Types.ObjectId(roomId) })
        : Promise.resolve(null),
    ]);
    const affectedIds = this.affectedPlayers(room).map(
      (player: any) => (player.playerId._id || player.playerId).toString(),
    );
    const refundedIds = reversals.map((item: any) => item.refunded_player_id.toString());
    const refundableIds = affectedIds.filter((id: string) => !refundedIds.includes(id));
    return {
      room,
      evidence_complete: Number((room as any).audit_evidence_version || 0) >= 1,
      affected_player_ids: affectedIds,
      refunded_player_ids: refundedIds,
      refundable_player_ids: refundableIds,
      pending_refund_count: refundableIds.length,
      reversals,
      durable_game_state: durableGameState,
    };
  }

  async reverse(roomId: string, playerId: string, adminId: string, reason: string, override = false) {
    if (process.env.FINANCE_V2_ENABLED === 'true') throw new BusinessException('USE_MFA_LEDGER_ADJUSTMENT', 409);
    if (![roomId, playerId, adminId].every(Types.ObjectId.isValid)) {
      throw new BusinessException('ERROR_NOT_FOUND', 404);
    }
    const existing = await this.reversalModel.findOne({ room_id: roomId, refunded_player_id: playerId }).lean();
    if (existing) return existing;

    const room = await this.roomModel.populate(
      await this.roomModel.findOne(this.eligibleFilter(roomId)).lean(),
      [{ path: 'players.playerId', select: 'username' }, { path: 'winner', select: 'username' }],
    );
    if (!room) throw new BusinessException('ERROR_NOT_FOUND', 404);
    const evidenceComplete = Number(room.audit_evidence_version || 0) >= 1;
    if (!evidenceComplete && !override) throw new BusinessException('ERROR_AUDIT_OVERRIDE_REQUIRED', 400);
    const affected = this.affectedPlayers(room);
    const target = affected.find((player: any) => (player.playerId._id || player.playerId).toString() === playerId);
    if (!target) throw new BusinessException('ERROR_AUDIT_PLAYER_NOT_ELIGIBLE', 400);

    const winnerId = (room.winner._id || room.winner).toString();
    const amount = Number(room.bet_amount);
    const session = await this.connection.startSession();
    let created: any;
    try {
      await session.withTransaction(async () => {
        const duplicate = await this.reversalModel.findOne({
          room_id: new Types.ObjectId(roomId),
          refunded_player_id: new Types.ObjectId(playerId),
        }).session(session);
        if (duplicate) { created = duplicate; return; }

        const [winnerBefore, playerBefore] = await Promise.all([
          this.userModel.findById(winnerId).session(session).lean(),
          this.userModel.findById(playerId).session(session).lean(),
        ]);
        if (!winnerBefore || !playerBefore) throw new BusinessException('ERROR_USER_NOTFOUND', 404);
        const canDebit = Number(winnerBefore.balance) >= amount;
        const refundKey = `game-audit-refund:${roomId}:${playerId}`;
        const debitKey = `game-audit-debit:${roomId}:${playerId}`;

        const credited = await this.userModel.updateOne(
          { _id: playerId, balance_adjustment_keys: { $ne: refundKey } },
          { $inc: { balance: amount }, $addToSet: { balance_adjustment_keys: refundKey } },
          { session },
        );
        if (credited.modifiedCount !== 1) throw new BusinessException('ERROR_AUDIT_ALREADY_PROCESSED', 409);

        const winnerUpdate = canDebit
          ? { $inc: { balance: -amount, total_won: -Math.min(amount, Number(winnerBefore.total_won || 0)) }, $addToSet: { balance_adjustment_keys: debitKey } }
          : { $inc: { total_won: -Math.min(amount, Number(winnerBefore.total_won || 0)), audit_balance_debt: amount }, $addToSet: { balance_adjustment_keys: debitKey } };
        const debited = await this.userModel.updateOne(
          { _id: winnerId, balance_adjustment_keys: { $ne: debitKey }, ...(canDebit ? { balance: { $gte: amount } } : {}) },
          winnerUpdate,
          { session },
        );
        if (debited.modifiedCount !== 1) throw new BusinessException('ERROR_AUDIT_BALANCE_CHANGED', 409);

        [created] = await this.reversalModel.create([{
          room_id: room._id,
          refunded_player_id: new Types.ObjectId(playerId),
          refunded_username: target.playerId.username,
          winner_id: new Types.ObjectId(winnerId),
          winner_username: room.winner.username,
          amount,
          reason: reason.trim(),
          admin_id: new Types.ObjectId(adminId),
          inconclusive_override: !evidenceComplete,
          winner_adjustment: canDebit ? 'balance_debited' : 'debt_recorded',
          debt_created: canDebit ? 0 : amount,
          balances: {
            refunded_before: Number(playerBefore.balance),
            refunded_after: Number(playerBefore.balance) + amount,
            winner_before: Number(winnerBefore.balance),
            winner_after: canDebit ? Number(winnerBefore.balance) - amount : Number(winnerBefore.balance),
          },
        }], { session });
        const affectedIds = affected.map(
          (player: any) => new Types.ObjectId((player.playerId._id || player.playerId).toString()),
        );
        const refundedCount = await this.reversalModel.countDocuments({
          room_id: room._id,
          refunded_player_id: { $in: affectedIds },
        }).session(session);
        await this.findingModel.updateMany(
          { room_id: room._id, affected_player_ids: new Types.ObjectId(playerId) },
          {
            $set: {
              status: refundedCount >= affectedIds.length ? 'refunded' : 'partially_refunded',
            },
            $addToSet: { refunded_player_ids: new Types.ObjectId(playerId) },
            $pull: { pending_player_ids: new Types.ObjectId(playerId) },
          },
          { session },
        );
      });
    } finally {
      await session.endSession();
    }
    this.userService.invalidateHistory([playerId, winnerId]);
    return created?.toObject?.() || created;
  }
}
