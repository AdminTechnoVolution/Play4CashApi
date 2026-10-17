import { Types } from 'mongoose';
import { PaymentsDashboardController, depositTraffic } from './payments-dashboard.controller';

function makeDb(rows: unknown[]) {
  const aggregate = jest.fn(() => ({ toArray: jest.fn().mockResolvedValue(rows) }));
  const collection = jest.fn(() => ({ aggregate }));
  return { db: { collection } as any, collection, aggregate };
}

describe('admin deposit traffic', () => {
  it('sums confirmed provider deposits by their credited USDT and confirmation day', async () => {
    const { db, collection, aggregate } = makeDb([
      { _id: new Date('2026-10-16T00:00:00.000Z'), amount: Types.Decimal128.fromString('1234.567000'), count: 2 },
      { _id: new Date('2026-10-17T00:00:00.000Z'), amount: Types.Decimal128.fromString('0.004000'), count: 1 },
    ]);

    const result = await depositTraffic(db, '7d', new Date('2026-10-17T12:00:00.000Z'));
    const pipeline = (aggregate.mock.calls[0] as unknown as [any[]])[0];

    expect(collection).toHaveBeenCalledWith('finance_orders');
    expect(pipeline[0].$match).toEqual({
      kind: 'deposit', status: 'confirmed', confirmedAt: { $gte: new Date('2026-10-11T00:00:00.000Z') },
    });
    expect(pipeline[1].$group._id.$dateTrunc).toEqual({ date: '$confirmedAt', unit: 'day', timezone: 'UTC' });
    expect(pipeline[1].$group.amount).toEqual({ $sum: { $toDecimal: { $ifNull: ['$credited', '0'] } } });
    expect(result).toEqual({
      period: '7d',
      timezone: 'UTC',
      granularity: 'day',
      from: '2026-10-11T00:00:00.000Z',
      to: '2026-10-17T12:00:00.000Z',
      total_amount: 1234.57,
      total_count: 3,
      buckets: [
        { start: '2026-10-16T00:00:00.000Z', amount: 1234.57, count: 2 },
        { start: '2026-10-17T00:00:00.000Z', amount: 0, count: 1 },
      ],
    });
  });

  it('groups 90 days by UTC weeks starting on Monday', async () => {
    const { db, aggregate } = makeDb([]);

    const result = await depositTraffic(db, '90d');
    const dateTrunc = (aggregate.mock.calls[0] as unknown as [any[]])[0][1].$group._id.$dateTrunc;

    expect(dateTrunc).toEqual(expect.objectContaining({ unit: 'week', timezone: 'UTC', startOfWeek: 'monday' }));
    expect(result.granularity).toBe('week');
  });

  it('caches the same UTC period for 30 seconds', async () => {
    const { db, aggregate } = makeDb([]);
    const controller = new PaymentsDashboardController(db);

    await controller.getTraffic({ period: '30d' });
    await controller.getTraffic({ period: '30d' });

    expect(aggregate).toHaveBeenCalledTimes(1);
  });
});
