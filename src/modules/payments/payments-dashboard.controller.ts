import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { IsIn, IsOptional } from 'class-validator';
import { Connection } from 'mongoose';
import Decimal from 'decimal.js';
import { AdminRoute } from '../../common/decorators/admin-route.decorator';
import { TtlCache } from '../../common/ttl-cache';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';

export type DepositTrafficPeriod = '7d' | '30d' | '90d';
export interface DepositTrafficResponse {
  period: DepositTrafficPeriod;
  timezone: 'UTC';
  granularity: 'day' | 'week';
  from: string;
  to: string;
  total_amount: number;
  total_count: number;
  buckets: Array<{ start: string; amount: number; count: number }>;
}

class DepositTrafficQueryDto {
  @IsOptional()
  @IsIn(['7d', '30d', '90d'])
  period: DepositTrafficPeriod = '7d';
}

/** Provider deposits confirmed and credited in USDT, aggregated by their confirmation date. */
export async function depositTraffic(db: Connection, period: DepositTrafficPeriod, to = new Date()): Promise<DepositTrafficResponse> {
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const granularity: 'day' | 'week' = period === '90d' ? 'week' : 'day';
  const from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate() - (days - 1)));
  const rows = await db.collection('finance_orders').aggregate<{ _id: Date; amount: unknown; count: number }>([
    { $match: { kind: 'deposit', status: 'confirmed', confirmedAt: { $gte: from } } },
    {
      $group: {
        _id: {
          $dateTrunc: {
            date: '$confirmedAt',
            unit: granularity,
            timezone: 'UTC',
            ...(granularity === 'week' ? { startOfWeek: 'monday' } : {}),
          },
        },
        // `credited` is the exact settled USDT amount stored as a decimal string.
        amount: { $sum: { $toDecimal: { $ifNull: ['$credited', '0'] } } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]).toArray();
  const buckets = rows.map(row => ({
    start: row._id.toISOString(),
    amount: new Decimal(String(row.amount ?? 0)).toDecimalPlaces(2).toNumber(),
    count: Number(row.count || 0),
  }));
  return {
    period,
    timezone: 'UTC',
    granularity,
    from: from.toISOString(),
    to: to.toISOString(),
    total_amount: buckets.reduce((sum, row) => sum.plus(row.amount), new Decimal(0)).toDecimalPlaces(2).toNumber(),
    total_count: buckets.reduce((sum, row) => sum + row.count, 0),
    buckets,
  };
}

@Controller('admin/dashboard/deposits')
@AdminRoute()
@UseGuards(AdminAuthGuard)
export class PaymentsDashboardController {
  private readonly cache = new TtlCache<DepositTrafficResponse>();

  constructor(@InjectConnection() private readonly db: Connection) {}

  @Get()
  getTraffic(@Query() query: DepositTrafficQueryDto) {
    return this.cache.getOrSet(`deposit-traffic:${query.period}:UTC`, 30_000, () => depositTraffic(this.db, query.period));
  }
}
