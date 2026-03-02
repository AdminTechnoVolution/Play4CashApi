const path = require('path');
const logger = require('../../shared/config/logger');
const filename = path.basename(__filename);
const BaseResponse = require('../../shared/util/baseResponse');
const BusinessException = require('../../shared/exceptionHandler/BusinessException');
const Recharge = require('../models/recharge.model');
const TxMessage = require('../models/tx_message.model');
const User = require('../models/user.model');
const { getValueFromJwtToken } = require('../../shared/util/jwt');
const { getDepositHistory } = require('../../shared/clients/binance');
const { SUCCESS_BINANCE_DEPOSIT } = require('../../shared/util/constants');
const Decimal = require('decimal.js');

const createRecharge = async (req) => {
    const recharge = await saveRecharge(req);
    const deposit = await validateClientDepositsBinance(recharge, req);
    const user = await confirmRecharge(recharge, deposit, req);

    message = req.__("SUCCESS_RECHARGE");
    const data = {
        balance: user.balance,
    };
    return new BaseResponse(true, [message], data);
};

const validateClientDepositsBinance = async (recharge, req) => {
    try {
        const deposits = await getDepositHistory(recharge.coin);
        const deposit = deposits.find(d => d.txId === recharge.txId);
        if (!deposit) throw new BusinessException(req.__("message_tx.processing.not_found"));
        if (deposit.amount !== recharge.amount.toString()) throw new BusinessException(req.__("message_tx.processing.amount_not_match"));
        if (deposit.coin.toUpperCase() !== recharge.coin.toUpperCase()) throw new BusinessException(req.__("message_tx.processing.coin_not_match"));
        if (deposit.status !== SUCCESS_BINANCE_DEPOSIT) { 
            const message = req.__("message_tx.processing.status") + deposit.status;
            throw new BusinessException(message);
        }

        return deposit;
    } catch (err) {
        logger.error(`Error validating recharge in binance: ${err}`, { className: filename });
        await saveTxMessage(recharge.user_id, recharge.txId, recharge.amount, recharge.coin, (`Binance: ${err.message}`));
        await recharge.deleteOne({ _id: recharge._id });
        throw new BusinessException('WARNING_TX_NOT_FOUND');
    }
}

const confirmRecharge = async (recharge, deposit, req) => {
    try {
        const user = await User.findOne({ _id: recharge.user_id });
        recharge.wallet = deposit.address;
        recharge.network = deposit.network;
        recharge.status = 'confirmed';
        recharge.time_processing_expires_at = undefined;

        user.balance = new Decimal(user.balance).plus(recharge.amount);
        user.total_recharged = new Decimal(user.total_recharged).plus(recharge.amount);

        await saveTxMessage(recharge.user_id, recharge.txId, recharge.amount, recharge.coin, req.__("message_tx.confirmed.ok"));
        await recharge.save();
        return await user.save();
    } catch (err) {
        logger.error(`Error confirming recharge: ${err}`, { className: filename });
        await saveTxMessage(recharge.user_id, recharge.txId, recharge.amount, recharge.coin, err.message);
        await recharge.deleteOne({ _id: recharge._id });
        throw new BusinessException('ERROR_CONFIRMING_TX');
    }
}

const saveRecharge = async (req) => {
    let foundRecharge;
    const { txId, coin, amount } = req.body;
    const auth = req.headers['authorization'];
    const user_id = getValueFromJwtToken(auth, 'id');
    const processingExpireMins = process.env.PROCESSING_EXPIRY_MINUTES;
    const time_processing_expires_at = new Date(Date.now() + processingExpireMins * 60 * 1000);

    let recharge = new Recharge({
        user_id,
        txId,
        coin: coin.toUpperCase(),
        amount,
        time_processing_expires_at
    });
    try {
        foundRecharge = await Recharge.findOne({ txId: recharge.txId });
        if (foundRecharge) {
            if (foundRecharge.status === 'confirmed') {
                throw new BusinessException('WARNING_TX_CONFIRMED');
            } else {
                throw new BusinessException('WARNING_TX_IN_PROCESS');
            }
        }
        return await recharge.save();
    } catch (err) {
        logger.error(`Error processing recharge: ${err}`, { className: filename });
        if (foundRecharge || err.code === 11000) {
            const message = (err.message === 'WARNING_TX_CONFIRMED') ? req.__("message_tx.confirmed.error") : req.__("message_tx.processing.error");
            await saveTxMessage(recharge.user_id, recharge.txId, recharge.amount, recharge.coin, message);
            throw new BusinessException(err.message ? err.message : 'WARNING_TX_IN_PROCESS');
        }
        await saveTxMessage(recharge.user_id, recharge.txId, recharge.amount, recharge.coin, err.message);
        throw new BusinessException('ERROR_GENERIC_RESPONSE');
    }
}

const saveTxMessage = async (user_id, txId, amount, coin, message) => {
    const txMessage = new TxMessage({
        user_id,
        txId,
        amount,
        coin,
        message,
        txType: 'recharge'
    });

    try {
        await txMessage.save();
    } catch (err) {
        logger.error(`Error saving message transaction: ${err}`, { className: filename });
    }
}

module.exports = { createRecharge };