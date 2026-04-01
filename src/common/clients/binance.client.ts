import { Logger } from "@nestjs/common";

const { Spot } = require('@binance/connector');

let clientInstance: any = null;

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
