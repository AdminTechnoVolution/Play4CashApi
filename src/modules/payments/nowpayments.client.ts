import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { Injectable, ServiceUnavailableException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { createHmac, timingSafeEqual } from 'crypto';
import { canonical } from './canonical';

export function parseProviderJson(raw: string): any {
  // Preserve numeric tokens as decimal strings rather than losing precision in JSON.parse.
  return JSON.parse(raw.replace(/"(?:[^"\\]|\\.)*"|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (token, number) => number ? JSON.stringify(number) : token));
}
export function verifyIpn(body: unknown, signature: string | undefined, secret: string): boolean {
  if (!secret || !signature || !/^[a-fA-F0-9]{128}$/.test(signature)) return false;
  const expected = createHmac('sha512', secret).update(canonical(body)).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

/** Only an explicit negative provider response proves rejection; transport errors remain uncertain. */
export class NowPaymentsRejectedError extends ServiceUnavailableException {
  constructor(readonly providerStatus: number) {
    super({ message: 'NOWPAYMENTS_REJECTED', providerStatus });
  }
}

@Injectable()
export class NowPaymentsClient {
  constructor(private readonly config: ConfigService, @Optional() @InjectConnection() private readonly db?: Connection) {}
  async claimSubmissionSlot(kind: 'deposit' | 'payout'): Promise<boolean> {
    if (!this.db) throw new Error('PROVIDER_RATE_LIMIT_REQUIRES_MONGODB');
    const now = Date.now();
    try {
      const result = await this.db.collection('finance_provider_limits').findOneAndUpdate({ _id: kind as any,
        $or: [{ nextAt: { $lte: now } }, { nextAt: { $exists: false } }] },
        { $set: { nextAt: now + (kind === 'deposit' ? 500 : 1000) } }, { upsert: true, returnDocument: 'after' });
      return !!result;
    } catch (error) {
      if ((error as any).code === 11000) return false;
      throw error;
    }
  }

  verify(body: unknown, signature?: string) {
    return verifyIpn(body, signature, this.config.get<string>('NOWPAYMENTS_IPN_SECRET') ?? '');
  }
  private async request(method: 'GET' | 'POST', path: string, data?: unknown, token?: string) {
    const baseURL = this.config.get<string>('NOWPAYMENTS_BASE_URL');
    // This rollout is sandbox-only until game accounting and operational validation are complete.
    if (baseURL !== 'https://api-sandbox.nowpayments.io/v1') {
      throw new ServiceUnavailableException('NOWPAYMENTS_SANDBOX_REQUIRED');
    }
    const key = this.config.get<string>('NOWPAYMENTS_API_KEY');
    if (!key) throw new ServiceUnavailableException('NOWPAYMENTS_NOT_CONFIGURED');
    try {
      const response = await axios.request({ baseURL, url: path, method,
        ...(method === 'GET' ? { params: data } : { data }), timeout: 10000, maxRedirects: 0,
        transformResponse: [(raw: string) => parseProviderJson(raw)],
        maxContentLength: 1024 * 1024, maxBodyLength: 64 * 1024,
        headers: { 'x-api-key': key, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      return response.data;
    } catch (error) {
      const response = axios.isAxiosError(error) ? error.response : undefined;
      const body = response?.data;
      if ([400, 401, 403, 404, 422].includes(response?.status ?? 0)
        && body && typeof body === 'object' && body.status === false
        && !body.payment_id && !body.id && !body.batch_withdrawal_id && !body.batch_id && !body.payout_id
        && (!Array.isArray(body.withdrawals) || body.withdrawals.length === 0)) {
        throw new NowPaymentsRejectedError(response!.status);
      }
      // Axios errors contain request credentials. Never log/return the original error.
      throw new ServiceUnavailableException('NOWPAYMENTS_REQUEST_UNRESOLVED');
    }
  }
  merchantCoins() { return this.request('GET', '/merchant/coins'); }
  currencies() { return this.request('GET', '/full-currencies'); }
  minimum(currency: string) { return this.request('GET', '/min-amount', { currency_from: currency, currency_to: currency }); }
  createDeposit(orderId: string, amount: string, currency: string, callback: string) {
    return this.request('POST', '/payment', { order_id: orderId, price_amount: amount,
      // NOWPayments rejects outcome_currency on /payment (400 "outcome_currency is not allowed"); it settles in
      // pay_currency by default, and reconcileDeposit still refuses to credit any other outcome_currency.
      price_currency: currency, pay_currency: currency,
      ipn_callback_url: callback, is_fee_paid_by_user: true,
      // NOWPayments sandbox emulates payment processing for this scenario; no chain funds sent.
      case: this.sandboxCase() });
  }
  private sandboxCase(): string {
    const value = this.config.get<string>('NOWPAYMENTS_SANDBOX_CASE') || 'success';
    if (!['success', 'common', 'partially_paid', 'failed'].includes(value)) {
      throw new ServiceUnavailableException('INVALID_NOWPAYMENTS_SANDBOX_CASE');
    }
    return value;
  }
  deposit(id: string) { return this.request('GET', `/payment/${encodeURIComponent(id)}`); }
  validateAddress(currency: string, address: string) {
    return this.request('POST', '/payout/validate-address', { currency, address });
  }
  payoutFee(currency: string, amount: string) { return this.request('GET', '/payout/fee', { currency, amount }); }
  balances() { return this.request('GET', '/balance'); }
  async authenticate(): Promise<string> {
    // Only the separately deployed worker receives these credentials.
    if (this.config.get('PAYMENTS_WORKER') !== 'true') throw new Error('PAYOUT_WORKER_REQUIRED');
    const email = this.config.get<string>('NOWPAYMENTS_PAYOUT_EMAIL');
    const password = this.config.get<string>('NOWPAYMENTS_PAYOUT_PASSWORD');
    if (!email || !password) throw new Error('PAYOUT_AUTH_NOT_CONFIGURED');
    const result = await this.request('POST', '/auth', { email, password });
    if (!result?.token) throw new Error('PAYOUT_AUTH_FAILED');
    return result.token;
  }
  createPayout(id: string, currency: string, address: string, amount: string, callback: string, token: string) {
    return this.request('POST', '/payout', { ipn_callback_url: callback, withdrawals: [{
      address, currency, amount, unique_external_id: id,
    }] }, token);
  }
  verifyPayout(batchId: string, code: string, token: string) {
    return this.request('POST', `/payout/${encodeURIComponent(batchId)}/verify`, { verification_code: code }, token);
  }
  payout(id: string, token: string) { return this.request('GET', `/payout/${encodeURIComponent(id)}`, undefined, token); }
}
