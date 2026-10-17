import { ConfigService } from '@nestjs/config';
import { PaymentsPolicy } from './payments-policy.service';

const policy = (env: Record<string, string>) => new PaymentsPolicy(new ConfigService(env), {} as any);

describe('PaymentsPolicy.depositLimit24h', () => {
  it('defaults to 1000 USDT when DEPOSIT_LIMIT_24H is not configured', () => {
    expect(policy({}).depositLimit24h()).toBe('1000.000000');
    expect(policy({ DEPOSIT_LIMIT_24H: ' ' }).depositLimit24h()).toBe('1000.000000');
  });

  it('uses the configured limit', () => {
    expect(policy({ DEPOSIT_LIMIT_24H: '500' }).depositLimit24h()).toBe('500.000000');
    expect(policy({ DEPOSIT_LIMIT_24H: ' 250.5 ' }).depositLimit24h()).toBe('250.500000');
  });

  it.each(['abc', '0', '0.000000', '-5', '1e3', '1,000', '10.1234567'])('refuses deposits when the limit is malformed: %s', (value) => {
    expect(() => policy({ DEPOSIT_LIMIT_24H: value }).depositLimit24h()).toThrow('DEPOSIT_LIMIT_MISCONFIGURED');
  });
});
