import { assertFinanceEligibility } from './eligibility';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { money } from './money';

export const DEFAULT_USDT_NETWORKS = {
  TRC20: 'usdttrc20', ERC20: 'usdterc20', BEP20: 'usdtbsc',
  POLYGON: 'usdtmatic', ARBITRUM: 'usdtarb', TON: 'usdtton', SOLANA: 'usdtsol',
};
// NOWPayments settles every deposit into USDTTRC20, so provider liquidity only exists on TRC20. Payouts on other
// networks would wait forever for a balance in their own currency.
export const WITHDRAWAL_NETWORKS = new Set(['TRC20']);
/** The merchant's outcome wallet: every deposit is converted into it. */
export const SETTLEMENT_CURRENCY = 'usdttrc20';

@Injectable()
export class PaymentsPolicy {
  constructor(private readonly config: ConfigService, @InjectConnection() private readonly db: Connection) {}
  enabled(kind: 'deposits' | 'withdrawals') {
    if (this.config.get('FINANCE_V2_ENABLED') !== 'true') throw new ServiceUnavailableException('FINANCE_V2_REQUIRED');
    if (this.config.get(`PAYMENTS_${kind.toUpperCase()}_ENABLED`) !== 'true') {
      throw new ServiceUnavailableException('PAYMENTS_DISABLED');
    }
    if (this.config.get('NOWPAYMENTS_BASE_URL') !== 'https://api-sandbox.nowpayments.io/v1') {
      throw new ServiceUnavailableException('PAYMENTS_SANDBOX_ONLY');
    }
  }
  /** Rolling 24 hour deposit cap per player in USDT, from DEPOSIT_LIMIT_24H (default 1000). */
  depositLimit24h(): string {
    const raw = String(this.config.get('DEPOSIT_LIMIT_24H') ?? '').trim() || '1000';
    // A malformed money limit must stop deposits, never silently remove the cap.
    if (!/^\d{1,12}(\.\d{1,6})?$/.test(raw) || !/[1-9]/.test(raw)) throw new ServiceUnavailableException('DEPOSIT_LIMIT_MISCONFIGURED');
    return money(raw);
  }
  async eligibility(userId: string) {
    return assertFinanceEligibility(this.db, userId);
  }

  networks(): Record<string, string> {
    // Default USDT mapping is intersected with merchant-enabled coins by PaymentsService.
    const raw = JSON.stringify(DEFAULT_USDT_NETWORKS);
    const entries = JSON.parse(raw);
    const permitted = new Set(['usdttrc20', 'usdterc20', 'usdtbsc', 'usdtmatic', 'usdtarb', 'usdtton', 'usdtsol']);
    if (!entries || Array.isArray(entries) || typeof entries !== 'object'
      || Object.entries(entries).some(([network, code]) => !/^[A-Z0-9_-]{2,30}$/.test(network) || !permitted.has(String(code)))) {
      throw new ServiceUnavailableException('INVALID_USDT_NETWORK_CONFIGURATION');
    }
    return entries;
  }
}
