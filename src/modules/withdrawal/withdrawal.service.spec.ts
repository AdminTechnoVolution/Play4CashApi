import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { getModelToken } from '@nestjs/mongoose';
import { WithdrawalService } from './withdrawal.service';
import { REDIS_CLIENT } from '../../common/redis/redis.module';
import { BusinessException } from '../../common/exceptions/business.exception';
import { WithdrawalSchema } from './schemas/withdrawal.schema';
import { WalletService } from '../wallet/wallet.service';
import { AppConfigService } from '../app-config/app-config.service';
import { EmailService } from '../../common/email/email.service';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createRedisMock() {
  const lockValues = new Map<string, string>();
  return {
    lockValues,
    set: jest.fn(async (key: string, value: string) => {
      if (lockValues.has(key)) return null;
      lockValues.set(key, value);
      return 'OK';
    }),
    eval: jest.fn(async (_script: string, options: { keys: string[]; arguments: string[] }) => {
      const [key] = options.keys;
      const [token] = options.arguments;
      if (lockValues.get(key) === token) {
        lockValues.delete(key);
        return 1;
      }
      return 0;
    }),
  };
}

describe('WithdrawalService', () => {
  let service: WithdrawalService;
  let redis: ReturnType<typeof createRedisMock>;
  let withdrawalModel: {
    findOne: jest.Mock;
    aggregate: jest.Mock;
    create: jest.Mock;
    findByIdAndUpdate: jest.Mock;
  };
  let userModel: {
    findById: jest.Mock;
    findOneAndUpdate: jest.Mock;
    findByIdAndUpdate: jest.Mock;
  };
  let txMessageModel: { create: jest.Mock };
  let emailDeferred: ReturnType<typeof createDeferred<void>>;
  let emailServiceMock: { sendWithdrawalVerification: jest.Mock };

  beforeEach(async () => {
    redis = createRedisMock();
    emailDeferred = createDeferred<void>();

    withdrawalModel = {
      findOne: jest.fn().mockResolvedValue(null),
      aggregate: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
      findByIdAndUpdate: jest.fn().mockResolvedValue({}),
    };
    userModel = {
      findById: jest.fn().mockResolvedValue({
        _id: new Types.ObjectId(),
        email: 'player@example.com',
        username: 'player1',
        balance: 100,
        wallet_address: {
          coin: 'USDT',
          wallet: 'wallet-1',
          network: 'TRX',
        },
      }),
      findOneAndUpdate: jest.fn().mockResolvedValue({ balance: 90 }),
      findByIdAndUpdate: jest.fn().mockResolvedValue({}),
    };
    txMessageModel = { create: jest.fn().mockResolvedValue({}) };
    emailServiceMock = {
      sendWithdrawalVerification: jest.fn().mockReturnValue(emailDeferred.promise),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WithdrawalService,
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: getModelToken('Withdrawal'), useValue: withdrawalModel },
        { provide: getModelToken('User'), useValue: userModel },
        { provide: getModelToken('TxMessage'), useValue: txMessageModel },
        {
          provide: WalletService,
          useValue: {
            findByCoinAndNetwork: jest.fn().mockResolvedValue({
              minAmount: 1,
              networkWithdrawalFee: 0.1,
            }),
          },
        },
        {
          provide: AppConfigService,
          useValue: {
            getConfig: jest.fn().mockResolvedValue({ withdrawal_daily_limit: 1000 }),
          },
        },
        {
          provide: EmailService,
          useValue: emailServiceMock,
        },
      ],
    })
      .overrideProvider(getModelToken('Withdrawal'))
      .useValue(withdrawalModel)
      .overrideProvider(getModelToken('User'))
      .useValue(userModel)
      .overrideProvider(getModelToken('TxMessage'))
      .useValue(txMessageModel)
      .overrideProvider(WalletService)
      .useValue({
        findByCoinAndNetwork: jest.fn().mockResolvedValue({
          minAmount: 1,
          networkWithdrawalFee: 0.1,
        }),
      })
      .overrideProvider(AppConfigService)
      .useValue({
        getConfig: jest.fn().mockResolvedValue({ withdrawal_daily_limit: 1000 }),
      })
      .overrideProvider(EmailService)
      .useValue(emailServiceMock)
      .compile();

    service = module.get(WithdrawalService);
  });

  it('serializes simultaneous withdrawals for the same user', async () => {
    const first = service.initiateWithdrawal('507f1f77bcf86cd799439011', 10, 30, 'en');

    await new Promise((resolve) => setImmediate(resolve));

    await expect(
      service.initiateWithdrawal('507f1f77bcf86cd799439011', 10, 30, 'en'),
    ).rejects.toBeInstanceOf(BusinessException);

    emailDeferred.resolve();
    await expect(first).resolves.toBeUndefined();

    expect(redis.set).toHaveBeenCalledTimes(2);
    expect(emailServiceMock.sendWithdrawalVerification).toHaveBeenCalledTimes(1);
    expect(withdrawalModel.create).toHaveBeenCalledTimes(1);
  });
});

describe('WithdrawalSchema', () => {
  it('enforces a unique pending withdrawal per user', () => {
    const partialIndex = WithdrawalSchema.indexes().find(([fields, options]) =>
      fields.user_id === 1 &&
      options?.unique === true &&
      (options as any)?.partialFilterExpression?.status === 'pending_verify',
    );

    expect(partialIndex).toBeDefined();
  });
});
