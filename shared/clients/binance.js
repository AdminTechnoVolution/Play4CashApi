const path = require('path');
const logger = require('../config/logger');
const filename = path.basename(__filename);
const { Spot } = require('@binance/connector');
const client = new Spot(process.env.BINANCE_API_KEY, process.env.BINANCE_API_SECRET);
const ClientException = require('../exceptionHandler/ClientException');

async function getDepositHistory(coin) {
    try {
        const deposits = await client.depositHistory({
            coin: coin
        });
        return deposits.data;
    } catch (error) {
        logger.error(`Binance: error fetching deposit history. Error: ${error}`, { className: filename });
        throw new ClientException(`Binance deposit history failed: ${error}`, 500, 'BinanceDepositError');
    }
}

async function getWithdrawalHistory(idWithdrawalList) {
    try {
        const withdrawals = await client.withdrawHistory({
            idList: idWithdrawalList
        });
        return withdrawals.data;
    } catch (error) {
        logger.error(`Binance: error fetching withdrawal history. Error: ${error}`, { className: filename });
        throw new ClientException(`Binance withdrawal history failed: ${error}`, 500, 'BinanceWithdrawalError');
    }
}

async function sendWithdrawalRequest(coin, network, address, amount) {
    try {
        const response = await client.withdraw(coin, address, amount, { network });

        if (response.data?.code) {
            const message = `Binance error: Code: ${response.data.code}, Message: ${response.data.msg}`;
            throw new ClientException(message, 400, 'BinanceWithdrawalError');
        }

        return response.data;
    } catch (error) {
        const message = error.message ? error.message : error;
        logger.error(`Binance: error sending withdrawal request. Error: ${error}`, { className: filename });
        throw new ClientException(`Binance withdrawal request failed: ${error}`, 500, 'BinanceWithdrawalError');
    }
}

module.exports = { getDepositHistory, getWithdrawalHistory, sendWithdrawalRequest };
