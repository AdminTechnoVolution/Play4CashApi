import { Body, Controller, Get, Headers, Param, Post, UseGuards, ConflictException } from '@nestjs/common';
import { IsIn, IsMongoId, IsString, Length, Matches } from 'class-validator';
import { InjectConnection } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Connection, Types } from 'mongoose';
import Decimal from 'decimal.js';
import { AdminRoute } from '../../common/decorators/admin-route.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { LedgerService } from './ledger.service';
import { money, positiveMoney } from './money';
import { fingerprint } from './canonical';
import type { ClientSession } from 'mongoose';
import { consumeFinancialMfa } from './financial-mfa';
import { commandMetrics } from '../../common/reliable-commands/metrics';
import { commandQueueDepth } from '../../common/reliable-commands/reliable-commands';
import { idempotencyKey } from './payments.service';
import { assertWithdrawalAuthorization } from './withdrawal-authorization';
class Params { @IsMongoId() id: string; }
class Decision {
  @IsIn(['approve', 'reject']) decision: 'approve' | 'reject';
  @IsString() @Length(10, 500) reason: string;
  @IsString() @Matches(/^\d{6}$/) code: string;
}
class Adjustment {
  @IsMongoId() userId: string;
  @IsIn(['credit', 'debit']) direction: 'credit' | 'debit';
  @IsString() @Matches(/^\d{1,18}(\.\d{1,6})?$/) amount: string;
  @IsString() @Length(10, 500) reason: string;
  @IsString() @Matches(/^\d{6}$/) code: string;
}
class ReconciliationRequest {
  @IsString() @Matches(/^[a-zA-Z0-9_-]{1,100}$/) providerId: string;
  @IsString() @Length(10, 500) reason: string;
  @IsString() @Matches(/^\d{6}$/) code: string;
}
@AdminRoute()
@UseGuards(AdminAuthGuard)
@Controller('admin/payments')
export class PaymentsAdminController {
  constructor(@InjectConnection() private readonly db: Connection, private readonly config: ConfigService, private readonly ledger: LedgerService) {}
  @Get('review') async list() {
    return this.db.collection('finance_orders').find({ status: { $in: ['review', 'uncertain', 'verification_delivery_failed'] } })
      .sort({ createdAt: 1 }).limit(100).toArray();
  }
  @Get('reconciliations') reconciliations() {
    return this.db.collection('finance_reconciliations').find({}).sort({ createdAt: -1 }).limit(30).toArray();
  }
  @Get('health') async health() {
    const [uncertain, pendingCommands, reserved, house, liquidityBlocked, stalledReservations, pendingDisconnects] = await Promise.all([
      this.db.collection('finance_orders').countDocuments({ status: 'uncertain' }),
      this.db.collection('game_outbox').countDocuments({ published: false }),
      this.db.collection('finance_orders').countDocuments({ status: { $in: ['reserved', 'review', 'processing', 'verification_pending'] } }),
      this.db.collection('finance_accounts').findOne({ account: 'house:main' }),
      this.db.collection('finance_orders').countDocuments({ status: 'reserved', liquidityRetryAt: { $gt: new Date() } }),
      this.db.collection('finance_orders').countDocuments({ reservedAt: { $lte: new Date(Date.now() - 900000) }, status: { $in: ['reserved', 'review', 'submitting', 'processing', 'verification_pending', 'uncertain'] } }),
      this.db.collection('game_disconnects').countDocuments({ completed: false }),
    ]);
    return { uncertain, pendingEvents: pendingCommands, reservedWithdrawals: reserved,
      houseBalance: house?.balance?.toString() ?? '0.000000', sandboxOnly: true, commands: commandMetrics(), commandQueueDepth: commandQueueDepth(), liquidityBlocked, stalledReservations, pendingDisconnects };
  }
  @Get('journals') journals() {
    return this.db.collection('finance_journals').find({}).sort({ createdAt: -1 }).limit(100).toArray();
  }
  @Get('return-requests') returns() {
    return this.db.collection('finance_return_requests').find({ status: 'review' }).sort({ createdAt: 1 }).limit(100).toArray();
  }
  @Get('resolution-requests') resolutions() {
    return this.db.collection('finance_resolution_requests').find({}).sort({ createdAt: -1 }).limit(100).toArray();
  }
  @Post('reconcile/:id') @RateLimit({ limit: 10, ttlMs: 60000 })
  async requestReconciliation(@CurrentUser() admin: JwtPayload, @Param() params: Params, @Body() body: ReconciliationRequest, @Headers('idempotency-key') rawKey: string) {
    const requestId = `admin:resolution:${admin.id}:${idempotencyKey(rawKey)}`;
    const hash = fingerprint({ orderId: params.id, providerId: body.providerId, reason: body.reason });
    return this.ledger.transaction(async session => {
      const previous = await this.db.collection('finance_admin_audit').findOne({ _id: requestId as any }, { session });
      if (previous) {
        if (previous.hash !== hash) throw new ConflictException('IDEMPOTENCY_CONFLICT');
        return previous.result;
      }
      await this.consumeMfa(admin.id, body.code, session);
      const order = await this.db.collection('finance_orders').findOne({ _id: new Types.ObjectId(params.id), status: 'uncertain' }, { session });
      if (!order || order.providerId) throw new ConflictException('ORDER_NOT_UNBOUND_UNCERTAIN');
      await this.db.collection('finance_resolution_requests').insertOne({ orderId: params.id, providerId: body.providerId,
        adminId: admin.id, reason: body.reason, status: 'pending', createdAt: new Date() }, { session });
      const result = { status: 'pending', message: 'El trabajador verificará la identidad de la operación antes de vincularla.' };
      await this.db.collection('finance_admin_audit').insertOne({ _id: requestId as any, adminId: admin.id, orderId: params.id, hash, result, reason: body.reason, decision: 'request_provider_resolution', createdAt: new Date() }, { session });
      return result;
    });
  }
  @Post('review/:id') @RateLimit({ limit: 10, ttlMs: 60000 })
  async decide(@CurrentUser() admin: JwtPayload, @Param() params: Params, @Body() body: Decision, @Headers('idempotency-key') rawKey: string) {
    const requestId = `admin:review:${admin.id}:${idempotencyKey(rawKey)}`;
    const hash = fingerprint({ orderId: params.id, decision: body.decision, reason: body.reason });
    return this.ledger.transaction(async session => {
      const previous = await this.db.collection('finance_admin_audit').findOne({ _id: requestId as any }, { session });
      if (previous) {
        if (previous.hash !== hash) throw new ConflictException('IDEMPOTENCY_CONFLICT');
        return previous.result;
      }
      await this.consumeMfa(admin.id, body.code, session);
      const order = await this.db.collection('finance_orders').findOne({ _id: new Types.ObjectId(params.id), kind: 'withdrawal', status: 'review' }, { session });
      if (!order) throw new ConflictException('WITHDRAWAL_NOT_REVIEWABLE');
      await assertWithdrawalAuthorization(this.db, order, session);
      if (order.reviewReason === 'fee_changed' && body.decision === 'approve') {
        throw new ConflictException('NEW_PLAYER_QUOTE_REQUIRED');
      }
      if (body.decision === 'reject') await this.ledger.post(`withdrawal:reject:${params.id}`, [
        { account: `user:${order.userId}:withdrawals`, amount: new Decimal(order.amount).negated().toFixed(6) },
        { account: `user:${order.userId}:available`, amount: order.amount },
      ], session);
      await this.db.collection('finance_orders').updateOne({ _id: order._id }, { $set: {
        status: body.decision === 'approve' ? 'reserved' : 'rejected', reviewedAt: new Date(),
        reviewedBy: admin.id, reviewDecision: body.decision, reviewNote: body.reason,
      } }, { session });
      const result = { id: params.id, status: body.decision === 'approve' ? 'reserved' : 'rejected' };
      await this.db.collection('finance_admin_audit').insertOne({ _id: requestId as any, orderId: params.id, adminId: admin.id,
        hash, result, decision: body.decision, reason: body.reason, createdAt: new Date() }, { session });
      return result;
    });
  }
  private async consumeMfa(adminId: string, code: string, session: ClientSession) {
    return consumeFinancialMfa(this.db, this.config, adminId, code, session);
  }
  @Post('adjustments') @RateLimit({ limit: 10, ttlMs: 60000 })
  async adjust(@CurrentUser() admin: JwtPayload, @Body() body: Adjustment, @Headers('idempotency-key') key: string) {
    if (!key || !/^[a-zA-Z0-9_-]{16,100}$/.test(key)) throw new ConflictException('IDEMPOTENCY_KEY_REQUIRED');
    const amount = positiveMoney(body.amount);
    const hash = fingerprint({ userId: body.userId, direction: body.direction, amount, reason: body.reason });
    const requestId = `admin:adjustment:${admin.id}:${key}`;
    return this.ledger.transaction(async session => {
      const previous = await this.db.collection('finance_admin_audit').findOne({ _id: requestId as any }, { session });
      if (previous) {
        if (previous.hash !== hash) throw new ConflictException('IDEMPOTENCY_CONFLICT');
        return previous.result;
      }
      await this.consumeMfa(admin.id, body.code, session);
      const delta = new Decimal(amount).mul(body.direction === 'credit' ? 1 : -1);
      await this.ledger.post(requestId, [
        { account: `user:${body.userId}:available`, amount: delta.toFixed(6) },
        { account: 'house:main', amount: delta.negated().toFixed(6) },
      ], session);
      const result = { userId: body.userId, amount, direction: body.direction };
      await this.db.collection('finance_admin_audit').insertOne({ _id: requestId as any, adminId: admin.id, hash, result, reason: body.reason, createdAt: new Date() }, { session });
      return result;
    });
  }

}
