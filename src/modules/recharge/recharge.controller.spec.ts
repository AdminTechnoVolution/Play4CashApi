import { BadRequestException } from '@nestjs/common';
import { RechargeController } from './recharge.controller';

jest.mock('class-validator', () => ({
  IsNumber: () => () => undefined,
  IsString: () => () => undefined,
}));

jest.mock('@nestjs/swagger', () => ({
  ApiBearerAuth: () => () => undefined,
  ApiOperation: () => () => undefined,
  ApiProperty: () => () => undefined,
  ApiTags: () => () => undefined,
}));

function makeDeps() {
  const rechargeService = {
    createRecharge: jest.fn().mockResolvedValue({ balance: 125 }),
    getHistory: jest.fn(),
  } as any;
  const config = {
    get: jest.fn().mockReturnValue(45),
  } as any;
  const i18n = {
    translate: jest.fn((key: string) => key),
  } as any;
  const idempotency = {
    getOrSet: jest.fn(async (_key: string, _ttl: number, producer: () => Promise<any>) => producer()),
  } as any;

  const controller = new RechargeController(rechargeService, config, i18n, idempotency);
  return { controller, rechargeService, config, i18n, idempotency };
}

describe('RechargeController.create', () => {
  const user = { id: '507f1f77bcf86cd799439011' };
  const lang = 'en';
  const idempotencyKey = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('wraps recharge creation in the idempotency cache', async () => {
    const { controller, rechargeService, config, idempotency, i18n } = makeDeps();

    const out = await controller.create(
      user,
      { txId: 'tx-1', coin: 'usdt', amount: 25 },
      lang,
      idempotencyKey,
    );

    expect(out).toEqual({
      success: true,
      messages: ['SUCCESS_RECHARGE'],
      data: { balance: 125 },
    });
    expect(config.get).toHaveBeenCalledWith('withdrawal.processingExpiryMinutes');
    expect(idempotency.getOrSet).toHaveBeenCalledWith(
      `idem:recharge:create:${user.id}:${idempotencyKey}`,
      300,
      expect.any(Function),
    );
    expect(rechargeService.createRecharge).toHaveBeenCalledWith(user.id, 'tx-1', 'usdt', 25, 45);
    expect(i18n.translate).toHaveBeenCalledWith('SUCCESS_RECHARGE', lang);
  });

  it('rejects missing or malformed idempotency keys', async () => {
    const { controller, idempotency, rechargeService } = makeDeps();

    await expect(
      controller.create(user, { txId: 'tx-1', coin: 'usdt', amount: 25 }, lang, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.create(user, { txId: 'tx-1', coin: 'usdt', amount: 25 }, lang, 'retry'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(idempotency.getOrSet).not.toHaveBeenCalled();
    expect(rechargeService.createRecharge).not.toHaveBeenCalled();
  });
});
