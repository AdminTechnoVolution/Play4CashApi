import { normalizeUserAssetBalance } from './binance.client';

describe('normalizeUserAssetBalance', () => {
  it('normalizes all USDT balance buckets and their total', () => {
    expect(normalizeUserAssetBalance([
      {
        asset: 'USDT',
        free: '10.25',
        locked: '2.50',
        freeze: '1.00',
        withdrawing: '0.25',
      },
    ], 'usdt')).toEqual({
      free: 10.25,
      locked: 2.5,
      frozen: 1,
      withdrawing: 0.25,
      total: 14,
    });
  });

  it('treats an empty response as a zero balance', () => {
    expect(normalizeUserAssetBalance([], 'USDT')).toEqual({
      free: 0,
      locked: 0,
      frozen: 0,
      withdrawing: 0,
      total: 0,
    });
  });

  it('does not propagate missing, negative or invalid amounts', () => {
    expect(normalizeUserAssetBalance([
      {
        asset: 'USDT',
        free: 'invalid',
        locked: '-2',
        freeze: null,
        withdrawing: '3',
      },
    ], 'USDT')).toEqual({
      free: 0,
      locked: 0,
      frozen: 0,
      withdrawing: 3,
      total: 3,
    });
  });
});
