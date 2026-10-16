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

jest.mock('./schemas/recharge-intent.schema', () => ({
  RechargeIntent: class RechargeIntent {},
  RechargeIntentSchema: {},
}));

function makeModelMock() {
  return {
    create: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    deleteOne: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    aggregate: jest.fn(),
  };
}

function makeWalletServiceMock() {
  return {
    findByCoinAndNetwork: jest.fn(),
  };
}

function makeService(overrides: Partial<{
  rechargeModel: any;
  userModel: any;
  txMessageModel: any;
  intentModel: any;
  walletService: any;
}> = {}) {
  const rechargeModel = overrides.rechargeModel ?? makeModelMock();
  const userModel = overrides.userModel ?? makeModelMock();
  const txMessageModel = overrides.txMessageModel ?? makeModelMock();
  const intentModel = overrides.intentModel ?? makeModelMock();
  const walletService = overrides.walletService ?? makeWalletServiceMock();

  const service = new RechargeService(
    rechargeModel as any,
    userModel as any,
    txMessageModel as any,
    intentModel as any,
    walletService as any,
  );
  return { service, rechargeModel, userModel, txMessageModel, intentModel, walletService };
}

describe('RechargeService.createRecharge', () => {
  const userId = '507f1f77bcf86cd799439011';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('claims the matching intent, creates one processing row, confirms it, and unsets the TTL on success', async () => {
    const { service, rechargeModel, userModel, txMessageModel, intentModel } = makeService();

    intentModel.findOneAndUpdate.mockResolvedValue({ _id: 'intent-1' });
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

    const out = await service.createRecharge(userId, 'tx-123', 'usdt', 30);

    expect(out).toEqual({ balance: 125 });
    expect(intentModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: expect.any(Object),
        coin: 'USDT',
        exactAmount: 25,
        status: 'pending',
        expires_at: expect.objectContaining({ $gt: expect.any(Date) }),
      }),
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'claimed', txId: 'tx-123' }),
        $unset: { expires_at: '' },
      }),
      { returnDocument: 'after' },
    );
    expect(rechargeModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        txId: 'tx-123',
        coin: 'USDT',
        amount: 25,
        intent_id: 'intent-1',
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

  it('rejects a valid on-chain deposit with no matching reservation, without crediting balance', async () => {
    const { service, rechargeModel, userModel, txMessageModel, intentModel } = makeService();

    intentModel.findOneAndUpdate.mockResolvedValue(null);
    (getDepositHistory as jest.Mock).mockResolvedValue([
      { txId: 'tx-stolen', amount: '25', coin: 'USDT', status: 1, address: 'wallet-addr', network: 'BSC' },
    ]);

    await expect(service.createRecharge(userId, 'tx-stolen', 'usdt', 30)).rejects.toMatchObject({
      message: 'WARNING_NO_MATCHING_DEPOSIT_INTENT',
      statusCode: 400,
    });

    expect(rechargeModel.create).not.toHaveBeenCalled();
    expect(userModel.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(txMessageModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ txId: 'tx-stolen' }),
    );
  });

  it('rejects duplicate txId atomically without calling Binance or matching an intent', async () => {
    const { service, rechargeModel, txMessageModel, intentModel } = makeService();

    rechargeModel.create.mockRejectedValue({
      code: 11000,
      keyPattern: { txId: 1 },
      message: 'E11000 duplicate key error collection: recharge index: txId_1 dup key',
    });
    rechargeModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ status: 'processing' }),
    });

    await expect(service.createRecharge(userId, 'tx-dup', 'usdt', 30)).rejects.toMatchObject({
      message: 'WARNING_TX_IN_PROCESS',
      statusCode: 400,
    });

    expect(getDepositHistory).not.toHaveBeenCalled();
    expect(intentModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(txMessageModel.create).not.toHaveBeenCalled();
  });

  it('maps duplicate confirmed txId to the confirmed warning', async () => {
    const { service, rechargeModel } = makeService();

    rechargeModel.create.mockRejectedValue({
      code: 11000,
      keyPattern: { txId: 1 },
      message: 'E11000 duplicate key error collection: recharge index: txId_1 dup key',
    });
    rechargeModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ status: 'confirmed' }),
    });

    await expect(service.createRecharge(userId, 'tx-confirmed', 'usdt', 30)).rejects.toMatchObject({
      message: 'WARNING_TX_CONFIRMED',
      statusCode: 400,
    });
  });

  it('stores a clean wallet-facing message when the tx is not visible yet', async () => {
    const { service, rechargeModel, txMessageModel, intentModel } = makeService();

    rechargeModel.create.mockResolvedValue({ _id: 'recharge-1', coin: 'USDT' });
    rechargeModel.deleteOne.mockResolvedValue({});
    (getDepositHistory as jest.Mock).mockResolvedValue([]);

    await expect(service.createRecharge(userId, 'tx-missing', 'usdt', 30)).rejects.toMatchObject({
      message: 'WARNING_TX_NOT_FOUND',
      statusCode: 400,
    });

    expect(intentModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(txMessageModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        txId: 'tx-missing',
        message: 'The transaction has not appeared in our wallet yet. Please try again later.',
      }),
    );
  });
});

describe('RechargeService.createIntent', () => {
  const userId = '507f1f77bcf86cd799439011';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reserves an exact amount against the configured wallet', async () => {
    const { service, intentModel, walletService } = makeService();
    walletService.findByCoinAndNetwork.mockResolvedValue({
      address: 'wallet-addr',
      minAmount: 10,
      networkWithdrawalFee: 0,
    });
    intentModel.create.mockResolvedValue({ _id: 'intent-1' });

    const result = await service.createIntent(userId, 'usdt', 'BSC', 50, 45);

    expect(walletService.findByCoinAndNetwork).toHaveBeenCalledWith('USDT', 'BSC');
    expect(intentModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        coin: 'USDT',
        network: 'BSC',
        requestedAmount: 50,
        address: 'wallet-addr',
        expires_at: expect.any(Date),
      }),
    );
    const createCall = intentModel.create.mock.calls[0][0];
    expect(createCall.exactAmount).toBeGreaterThanOrEqual(50.0001);
    expect(createCall.exactAmount).toBeLessThan(50.1);
    expect(result).toEqual(
      expect.objectContaining({
        intentId: 'intent-1',
        coin: 'USDT',
        network: 'BSC',
        address: 'wallet-addr',
        exactAmount: createCall.exactAmount,
      }),
    );
  });

  it('rejects amounts below the configured minimum', async () => {
    const { service, intentModel, walletService } = makeService();
    walletService.findByCoinAndNetwork.mockResolvedValue({ address: 'wallet-addr', minAmount: 10 });

    await expect(service.createIntent(userId, 'usdt', 'BSC', 5, 45)).rejects.toMatchObject({
      message: 'ERROR_RECHARGE_AMOUNT_MINIMUM',
      statusCode: 400,
    });
    expect(intentModel.create).not.toHaveBeenCalled();
  });

  it('rejects when the coin/network has no configured wallet', async () => {
    const { service, walletService } = makeService();
    walletService.findByCoinAndNetwork.mockResolvedValue(null);

    await expect(service.createIntent(userId, 'usdt', 'UNKNOWN', 50, 45)).rejects.toMatchObject({
      message: 'ERROR_RECHARGE_WALLET_NOT_CONFIGURED',
      statusCode: 400,
    });
  });

  it('retries with a new fingerprint on an exact-amount collision', async () => {
    const { service, intentModel, walletService } = makeService();
    walletService.findByCoinAndNetwork.mockResolvedValue({ address: 'wallet-addr', minAmount: 10 });
    intentModel.create
      .mockRejectedValueOnce({ code: 11000, keyPattern: { coin: 1, network: 1, exactAmount: 1 } })
      .mockResolvedValueOnce({ _id: 'intent-2' });

    const result = await service.createIntent(userId, 'usdt', 'BSC', 50, 45);

    expect(intentModel.create).toHaveBeenCalledTimes(2);
    expect(result.intentId).toBe('intent-2');
  });
});

describe('RechargeService.getDepositTraffic', () => {
  it('aggregates only confirmed USDT deposits using the effective confirmation date', async () => {
    const { service, rechargeModel } = makeService();
    rechargeModel.aggregate.mockResolvedValue([
      { _id: new Date('2026-07-24T00:00:00.000Z'), amount: 1234.567, count: 2 },
    ]);

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
    const { service, rechargeModel } = makeService();
    rechargeModel.aggregate.mockResolvedValue([]);

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
    const { service, rechargeModel } = makeService();
    rechargeModel.aggregate.mockResolvedValue([]);

    await service.getDepositTraffic('30d');
    await service.getDepositTraffic('30d');

    expect(rechargeModel.aggregate).toHaveBeenCalledTimes(1);
  });
});
