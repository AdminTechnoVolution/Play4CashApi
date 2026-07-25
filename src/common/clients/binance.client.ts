import { Logger } from "@nestjs/common";
import Decimal from 'decimal.js';

const { Spot } = require('@binance/connector');

let clientInstance: any = null;

export interface BinanceAssetBalance {
  free: number;
  locked: number;
  frozen: number;
  withdrawing: number;
  total: number;
}

const safeAmount = (value: unknown): number => {
  try {
    const amount = new Decimal(String(value ?? 0));
    return amount.isFinite() && amount.gte(0) ? amount.toNumber() : 0;
  } catch {
    return 0;
  }
};

export function normalizeUserAssetBalance(
  assets: unknown,
  requestedAsset: string,
): BinanceAssetBalance {
  const rows = Array.isArray(assets) ? assets : [];
  const row = rows.find(
    (item: any) => String(item?.asset || '').toUpperCase() === requestedAsset.toUpperCase(),
  ) as Record<string, unknown> | undefined;
  const free = safeAmount(row?.free);
  const locked = safeAmount(row?.locked);
  const frozen = safeAmount(row?.freeze);
  const withdrawing = safeAmount(row?.withdrawing);
  return {
    free,
    locked,
    frozen,
    withdrawing,
    total: new Decimal(free).plus(locked).plus(frozen).plus(withdrawing).toNumber(),
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('BINANCE_REQUEST_TIMEOUT')), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function getClient() {
  if (!clientInstance) {
    const apiKey = process.env.BINANCE_API_KEY || '';
    const apiSecret = process.env.BINANCE_API_SECRET || '';
    clientInstance = new Spot(apiKey, apiSecret);
  }
  return clientInstance;
}

export async function getWithdrawalHistory(params: Record<string, any> = {}): Promise<any[]> {
  try {
    const response = await getClient().withdrawHistory(params);
    return response.data;
  } catch (error: any) {
    Logger.error('Binance: error fetching withdrawal history:', error.message);
    throw error;
  }
}

export async function getDepositHistory(params: Record<string, any> = {}): Promise<any[]> {
  try {
    const response = await getClient().depositHistory(params);
    return response.data;
  } catch (error: any) {
    Logger.error('Binance: error fetching deposit history:', error.message);
    throw error;
  }
}

export async function getSpotAssetBalance(
  asset: string,
): Promise<BinanceAssetBalance> {
  try {
    const response = await withTimeout<any>(
      getClient().userAsset({
        asset: asset.toUpperCase(),
        needBtcValuation: false,
        recvWindow: 5000,
      }),
      8000,
    );
    return normalizeUserAssetBalance(response.data, asset);
  } catch (error: any) {
    const code = error?.response?.data?.code ?? error?.code ?? 'UNKNOWN';
    const status = error?.response?.status ?? 'n/a';
    Logger.error(
      `Binance: asset balance request failed code=${String(code)} status=${String(status)} message=${String(error?.message || 'unknown')}`,
    );
    throw error;
  }
}

export async function sendWithdrawalRequest(
  coin: string,
  network: string,
  address: string,
  amount: number,
): Promise<{ id: string }> {
  try {
    const client = getClient();
    Logger.debug('Sending Binance Withdrawal Request (Connector):', { coin, network, address, amount });
    const response = await client.withdraw(coin, address, amount, { network });

    if (response.data?.code) {
      const message = `Binance error: Code: ${response.data.code}, Message: ${response.data.msg}`;
      throw new Error(message);
    }

    return response.data;
  } catch (error: any) {
    if (error.response?.data) {
      Logger.error('Binance API Error Response:', JSON.stringify(error.response.data));
      throw new Error(`Binance error: ${error.response.data.msg || JSON.stringify(error.response.data)}`);
    }
    Logger.error('Binance: error sending withdrawal request:', error.message);
    throw error;
  }
}
