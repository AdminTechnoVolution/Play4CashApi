"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWithdrawalHistory = getWithdrawalHistory;
exports.getDepositHistory = getDepositHistory;
exports.sendWithdrawalRequest = sendWithdrawalRequest;
const common_1 = require("@nestjs/common");
const { Spot } = require('@binance/connector');
let clientInstance = null;
function getClient() {
    if (!clientInstance) {
        const apiKey = process.env.BINANCE_API_KEY || '';
        const apiSecret = process.env.BINANCE_API_SECRET || '';
        clientInstance = new Spot(apiKey, apiSecret);
    }
    return clientInstance;
}
async function getWithdrawalHistory(params = {}) {
    try {
        const response = await getClient().withdrawHistory(params);
        return response.data;
    }
    catch (error) {
        common_1.Logger.error('Binance: error fetching withdrawal history:', error.message);
        throw error;
    }
}
async function getDepositHistory(params = {}) {
    try {
        const response = await getClient().depositHistory(params);
        return response.data;
    }
    catch (error) {
        common_1.Logger.error('Binance: error fetching deposit history:', error.message);
        throw error;
    }
}
async function sendWithdrawalRequest(coin, network, address, amount) {
    try {
        const client = getClient();
        common_1.Logger.debug('Sending Binance Withdrawal Request (Connector):', { coin, network, address, amount });
        const response = await client.withdraw(coin, address, amount, { network });
        if (response.data?.code) {
            const message = `Binance error: Code: ${response.data.code}, Message: ${response.data.msg}`;
            throw new Error(message);
        }
        return response.data;
    }
    catch (error) {
        if (error.response?.data) {
            common_1.Logger.error('Binance API Error Response:', JSON.stringify(error.response.data));
            throw new Error(`Binance error: ${error.response.data.msg || JSON.stringify(error.response.data)}`);
        }
        common_1.Logger.error('Binance: error sending withdrawal request:', error.message);
        throw error;
    }
}
//# sourceMappingURL=binance.client.js.map