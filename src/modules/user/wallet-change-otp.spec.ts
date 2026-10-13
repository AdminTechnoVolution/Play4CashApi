import * as bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { UserService } from './user.service';
import { OtpAttemptGuardService } from '../../common/otp-attempts/otp-attempt-guard.service';

function createRedisMock() {
  const counters = new Map<string, number>();
  return {
    counters,
    eval: jest.fn(async (_script: string, options: { keys: string[] }) => {
      const [key] = options.keys;
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    }),
    del: jest.fn(async (key: string) => {
      counters.delete(key);
      return 1;
    }),
  };
}

function makeService(pending: any) {
  const walletChangePendingModel = {
    findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(pending) }),
    deleteOne: jest.fn().mockResolvedValue({}),
  };
  const userRepo = {
    updateById: jest.fn().mockResolvedValue({ _id: pending?._id }),
  };
  const walletService = {
    findByCoinAndNetwork: jest.fn().mockResolvedValue({ minAmount: 1, networkWithdrawalFee: 0 }),
  };
  const redis = createRedisMock();
  const otpAttemptGuard = new OtpAttemptGuardService(redis as any);

  const service = new UserService(
    userRepo as any,
    {} as any,
    walletChangePendingModel as any,
    {} as any,
    walletService as any,
    {} as any,
    {} as any,
    {} as any,
    otpAttemptGuard,
  );

  return { service, walletChangePendingModel, userRepo, redis };
}

describe('UserService.confirmWalletChangeWithOtp', () => {
  const userId = '507f1f77bcf86cd799439011';

  it('kills the pending wallet change after 5 wrong codes, regardless of caller IP', async () => {
    const pendingId = new Types.ObjectId();
    const pending = {
      _id: pendingId,
      coin: 'USDT',
      network: 'TRX',
      wallet: 'wallet-1',
      verification_code: bcrypt.hashSync('123456', 10),
      verification_expires_at: new Date(Date.now() + 10 * 60 * 1000),
    };
    const { service, walletChangePendingModel } = makeService(pending);

    for (let i = 0; i < 5; i++) {
      await expect(
        service.confirmWalletChangeWithOtp(userId, 'wrong-code'),
      ).rejects.toMatchObject({ message: 'ERROR_WALLET_CHANGE_CODE_INVALID' });
    }

    await expect(
      service.confirmWalletChangeWithOtp(userId, 'wrong-code'),
    ).rejects.toMatchObject({ message: 'ERROR_WALLET_CHANGE_LOCKED' });

    expect(walletChangePendingModel.deleteOne).toHaveBeenCalledWith({ _id: pendingId });
  });

  it('accepts the correct code and does not lock out a legitimate user', async () => {
    const pendingId = new Types.ObjectId();
    const pending = {
      _id: pendingId,
      coin: 'USDT',
      network: 'TRX',
      wallet: 'wallet-1',
      verification_code: bcrypt.hashSync('123456', 10),
      verification_expires_at: new Date(Date.now() + 10 * 60 * 1000),
    };
    const { service, walletChangePendingModel, userRepo } = makeService(pending);

    await service.confirmWalletChangeWithOtp(userId, '123456');

    expect(userRepo.updateById).toHaveBeenCalledWith(userId, {
      wallet_address: { coin: 'USDT', network: 'TRX', wallet: 'wallet-1' },
    });
    expect(walletChangePendingModel.deleteOne).toHaveBeenCalledWith({ _id: pendingId });
  });
});
