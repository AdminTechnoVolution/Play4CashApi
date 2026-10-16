import { createHmac } from 'crypto';
import { canonical } from './canonical';
import { verifyIpn, parseProviderJson } from './nowpayments.client';
import { money, positiveMoney, reviewRequired } from './money';
import { normalizePostings } from './ledger.service';
import { idempotencyKey } from './payments.service';
import { totp } from './totp';

describe('financial boundaries', () => {
  it('preserves large provider amounts without changing strings, booleans or nulls', () => {
    const result = parseProviderJson('{"amount":999999999999999999.999999,"text":"1e2 \\"x\\"","enabled":true,"missing":null,"items":[0.000001]}');
    expect(result.amount).toBe('999999999999999999.999999');
    expect(result.text).toBe('1e2 "x"');
    expect(result.enabled).toBe(true);
    expect(result.missing).toBeNull();
    expect(result.items).toEqual(['0.000001']);
  });
  it('preserves USDT precision and rejects silent rounding / non-finite amounts', () => {
    expect(money('0.000001')).toBe('0.000001');
    expect(money('999999999999999999.999999')).toBe('999999999999999999.999999');
    for (const input of [1, 'NaN', 'Infinity', '1e2', '-1', '0.0000001', ' 1']) expect(() => positiveMoney(input)).toThrow();
    expect(() => positiveMoney('0')).toThrow();
  });
  it('applies exact review thresholds and includes reserved amounts', () => {
    expect(reviewRequired('500', '500', false)).toBe(false);
    expect(reviewRequired('500.000001', '0', false)).toBe(true);
    expect(reviewRequired('1', '999.000001', false)).toBe(true);
    expect(reviewRequired('1', '0', true)).toBe(true);
  });
  it('rejects unbalanced journals and duplicate accounts', () => {
    const account = 'user:507f1f77bcf86cd799439011:available';
    expect(() => normalizePostings([{ account, amount: '1' }, { account: 'external:opening', amount: '-0.999999' }])).toThrow('UNBALANCED');
    expect(() => normalizePostings([{ account, amount: '1' }, { account, amount: '-1' }])).toThrow('INVALID_LEDGER_ACCOUNT');
    expect(normalizePostings([{ account, amount: '1' }, { account: 'external:opening', amount: '-1' }])).toHaveLength(2);
  });
  it('validates idempotency keys before database effects', () => {
    expect(() => idempotencyKey()).toThrow();
    expect(() => idempotencyKey('short')).toThrow();
    expect(idempotencyKey('a'.repeat(32))).toHaveLength(32);
  });
});
describe('NOWPayments IPN authentication', () => {
  const body = { payment_id: 123, nested: { z: 2, a: 1 }, payment_status: 'finished' };
  const secret = 'test-only-secret';
  const signature = createHmac('sha512', secret).update(canonical(body)).digest('hex');
  it('verifies recursively sorted provider payloads', () => expect(verifyIpn(body, signature, secret)).toBe(true));
  it('rejects tampering, missing configuration and malformed signatures', () => {
    expect(verifyIpn({ ...body, payment_id: 456 }, signature, secret)).toBe(false);
    expect(verifyIpn(body, signature, '')).toBe(false);
    expect(verifyIpn(body, 'zz'.repeat(64), secret)).toBe(false);
    expect(verifyIpn(body, 'ff', secret)).toBe(false);
  });
});
describe('worker TOTP', () => {
  it('matches RFC 6238 test vectors modulo six digits', () => {
    expect(totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59000)).toBe('287082');
    expect(totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 1111111109000)).toBe('081804');
  });
});
