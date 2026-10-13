import { ValidationPipe } from '@nestjs/common';
import { CreateWalletDto, UpdateWalletDto, WalletAdminController } from './wallet-admin.controller';

/**
 * The admin wallet-config endpoints used to accept `@Body() body: unknown`,
 * which Nest's ValidationPipe silently skips (it only validates parameters
 * typed as a class it recognizes, not `unknown`/`Object`). That meant a
 * compromised or buggy admin session could write arbitrary fields into the
 * wallet-config collection governing withdrawal minimums/fees. These tests
 * run the real global ValidationPipe against the new typed DTOs to prove
 * malformed/extraneous input is now rejected or stripped before it reaches
 * the controller.
 */
function makePipe(): ValidationPipe {
  return new ValidationPipe({ whitelist: true, transform: true });
}

async function transformBody(pipe: ValidationPipe, metatype: any, value: unknown) {
  return pipe.transform(value, { type: 'body', metatype });
}

describe('WalletAdminController DTO validation', () => {
  describe('CreateWalletDto', () => {
    it('rejects a payload missing required fields', async () => {
      const pipe = makePipe();
      await expect(
        transformBody(pipe, CreateWalletDto, { description: 'missing everything else' }),
      ).rejects.toThrow();
    });

    it('rejects a negative minAmount / networkWithdrawalFee', async () => {
      const pipe = makePipe();
      await expect(
        transformBody(pipe, CreateWalletDto, {
          coin: 'USDT',
          address: 'T123',
          red: 'TRC20',
          minAmount: -5,
          networkWithdrawalFee: 0,
        }),
      ).rejects.toThrow();
    });

    it('strips fields not declared on the DTO instead of writing them through', async () => {
      const pipe = makePipe();
      const result: CreateWalletDto = await transformBody(pipe, CreateWalletDto, {
        coin: 'USDT',
        address: 'T123',
        red: 'TRC20',
        minAmount: 10,
        networkWithdrawalFee: 1,
        isActive: true,
        // Not a real WalletEntry field — must not survive whitelist transform.
        role: 'superadmin',
      });

      expect(result).toEqual({
        coin: 'USDT',
        address: 'T123',
        red: 'TRC20',
        minAmount: 10,
        networkWithdrawalFee: 1,
        isActive: true,
      });
      expect((result as any).role).toBeUndefined();
    });

    it('accepts a valid, complete payload', async () => {
      const pipe = makePipe();
      const result: CreateWalletDto = await transformBody(pipe, CreateWalletDto, {
        coin: 'USDT',
        address: 'T123',
        red: 'TRC20',
        description: 'Tron network',
        minAmount: 10,
        networkWithdrawalFee: 1,
        isActive: true,
      });

      expect(result.coin).toBe('USDT');
      expect(result.minAmount).toBe(10);
    });
  });

  describe('UpdateWalletDto', () => {
    it('accepts a partial payload with only one field', async () => {
      const pipe = makePipe();
      const result: UpdateWalletDto = await transformBody(pipe, UpdateWalletDto, {
        minAmount: 25,
      });

      expect(result).toEqual({ minAmount: 25 });
    });

    it('rejects a wrong-typed field even on a partial update', async () => {
      const pipe = makePipe();
      await expect(
        transformBody(pipe, UpdateWalletDto, { minAmount: 'not-a-number' }),
      ).rejects.toThrow();
    });
  });

  it('controller passes the (already-validated) DTO straight through to WalletService', () => {
    const wallets = {
      findAll: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    const controller = new WalletAdminController(wallets as any);
    const dto: CreateWalletDto = {
      coin: 'USDT',
      address: 'T123',
      red: 'TRC20',
      minAmount: 10,
      networkWithdrawalFee: 1,
    };

    controller.create(dto);
    expect(wallets.create).toHaveBeenCalledWith(dto);
  });
});
