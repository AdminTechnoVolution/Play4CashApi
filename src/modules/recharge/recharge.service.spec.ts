import { BusinessException } from '../../common/exceptions/business.exception';
import { getDepositHistory } from '../../common/clients/binance.client';
import { RechargeService } from './recharge.service';

jest.mock('../../common/clients/binance.client', () => ({
  getDepositHistory: jest.fn(),
}));

jest.mock('./schemas/recharge.schema', () => ({
  Recharge: class Recharge {},
  RechargeSchema: {},
}));

function makeModelMock() {
  return {
    create: jest.fn(),
    findOne: jest.fn(),
    deleteOne: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    aggregate: jest.fn(),
  };
}

describe('RechargeService.createRecharge', () => {
  const userId = '507f1f77bcf86cd799439011';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates one processing row, confirms it, and unsets the TTL on success', async () => {
    const rechargeModel = makeModelMock();
    const userModel = makeModelMock();
    const txMessageModel = makeModelMock();

    rechargeModel.create.mockResolvedValue({ _id: 'recharge-1' });
    rechargeModel.findByIdAndUpdate.mockResolvedValue({ _id: 'recharge-1' });
    userModel.findByIdAndUpdate.mockResolvedValue({ balance: 125 });
    txMessageModel.create.mockResolvedValue({});
    (getDepositHistory as jest.Mock).mockResolvedValue([
      {
        txId: 'tx-123',
        amount: '25',
        coin: 'USDT',
        status: 1,
        address: 'wallet-addr',
        network: 'BSC',
      },
    ]);

    const service = new RechargeService(rechargeModel as any, userModel as any, txMessageModel as any);
    const out = await service.createRecharge(userId, 'tx-123', 'usdt', 30);

    expect(out).toEqual({ balance: 125 });
    expect(rechargeModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        txId: 'tx-123',
        coin: 'USDT',
        amount: 25,
        user_id: expect.any(Object),
        time_processing_expires_at: expect.any(Date),
      }),
    );
    expect(rechargeModel.findByIdAndUpdate).toHaveBeenCalledWith('recharge-1', {
      $set: {
        wallet: 'wallet-addr',
        network: 'BSC',
        status: 'confirmed',
        confirmed_at: expect.any(Date),
      },
      $unset: {
        time_processing_expires_at: '',
      },
    });
    expect(txMessageModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: userId,
        txId: 'tx-123',
        amount: 25,
        coin: 'usdt',
        message: 'Confirmed',
        txType: 'recharge',
      }),
    );
  });

  it('rejects duplicate txId atomically without calling Binance', async () => {
    const rechargeModel = makeModelMock();
    const userModel = makeModelMock();
    const txMessageModel = makeModelMock();

    rechargeModel.create.mockRejectedValue({
      code: 11000,
      keyPattern: { txId: 1 },
      message: 'E11000 duplicate key error collection: recharge index: txId_1 dup key',
    });
    rechargeModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ status: 'processing' }),
    });

    const service = new RechargeService(rechargeModel as any, userModel as any, txMessageModel as any);

    await expect(service.createRecharge(userId, 'tx-dup', 'usdt', 30)).rejects.toMatchObject({
      message: 'WARNING_TX_IN_PROCESS',
      statusCode: 400,
    });

    expect(getDepositHistory).not.toHaveBeenCalled();
    expect(userModel.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(txMessageModel.create).not.toHaveBeenCalled();
  });

  it('maps duplicate confirmed txId to the confirmed warning', async () => {
    const rechargeModel = makeModelMock();
    const userModel = makeModelMock();
    const txMessageModel = makeModelMock();

    rechargeModel.create.mockRejectedValue({
      code: 11000,
      keyPattern: { txId: 1 },
      message: 'E11000 duplicate key error collection: recharge index: txId_1 dup key',
    });
    rechargeModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ status: 'confirmed' }),
    });

    const service = new RechargeService(rechargeModel as any, userModel as any, txMessageModel as any);

    await expect(service.createRecharge(userId, 'tx-confirmed', 'usdt', 30)).rejects.toMatchObject({
      message: 'WARNING_TX_CONFIRMED',
      statusCode: 400,
    });
  });

  it('stores a clean wallet-facing message when the tx is not visible yet', async () => {
    const rechargeModel = makeModelMock();
    const userModel = makeModelMock();
    const txMessageModel = makeModelMock();

    rechargeModel.create.mockResolvedValue({ _id: 'recharge-1', coin: 'USDT' });
    rechargeModel.deleteOne.mockResolvedValue({});
    (getDepositHistory as jest.Mock).mockResolvedValue([]);

    const service = new RechargeService(rechargeModel as any, userModel as any, txMessageModel as any);

    await expect(service.createRecharge(userId, 'tx-missing', 'usdt', 30)).rejects.toMatchObject({
      message: 'WARNING_TX_NOT_FOUND',
      statusCode: 400,
    });

    expect(txMessageModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        txId: 'tx-missing',
        message: 'The transaction has not appeared in our wallet yet. Please try again later.',
      }),
    );
  });
});

describe('RechargeService.getDepositTraffic', () => {
  it('aggregates only confirmed USDT deposits using the effective confirmation date', async () => {
    const rechargeModel = makeModelMock();
    rechargeModel.aggregate.mockResolvedValue([
      { _id: new Date('2026-07-24T00:00:00.000Z'), amount: 1234.567, count: 2 },
    ]);
    const service = new RechargeService(
      rechargeModel as any,
      makeModelMock() as any,
      makeModelMock() as any,
    );

    const result = await service.getDepositTraffic('7d');
    const pipeline = rechargeModel.aggregate.mock.calls[0][0];

    expect(pipeline[0].$match).toEqual(expect.objectContaining({
      status: 'confirmed',
      coin: 'USDT',
    }));
    expect(pipeline[0].$match.$expr.$gte[0]).toEqual({
      $ifNull: ['$confirmed_at', '$created_at'],
    });
    expect(pipeline[1].$group._id.$dateTrunc).toEqual(expect.objectContaining({
      unit: 'day',
      timezone: 'UTC',
      date: { $ifNull: ['$confirmed_at', '$created_at'] },
    }));
    expect(result).toEqual(expect.objectContaining({
      period: '7d',
      timezone: 'UTC',
      granularity: 'day',
      total_amount: 1234.57,
      total_count: 2,
      buckets: [{
        start: '2026-07-24T00:00:00.000Z',
        amount: 1234.57,
        count: 2,
      }],
    }));
  });

  it('groups 90 days by UTC weeks starting on Monday', async () => {
    const rechargeModel = makeModelMock();
    rechargeModel.aggregate.mockResolvedValue([]);
    const service = new RechargeService(
      rechargeModel as any,
      makeModelMock() as any,
      makeModelMock() as any,
    );

    const result = await service.getDepositTraffic('90d');
    const dateTrunc = rechargeModel.aggregate.mock.calls[0][0][1].$group._id.$dateTrunc;

    expect(dateTrunc).toEqual(expect.objectContaining({
      unit: 'week',
      timezone: 'UTC',
      startOfWeek: 'monday',
    }));
    expect(result.granularity).toBe('week');
  });

  it('caches the same UTC period for 30 seconds', async () => {
    const rechargeModel = makeModelMock();
    rechargeModel.aggregate.mockResolvedValue([]);
    const service = new RechargeService(
      rechargeModel as any,
      makeModelMock() as any,
      makeModelMock() as any,
    );

    await service.getDepositTraffic('30d');
    await service.getDepositTraffic('30d');

    expect(rechargeModel.aggregate).toHaveBeenCalledTimes(1);
  });
});
