const path = require('path');
const logger = require('../config/logger');
const filename = path.basename(__filename);
const i18n = require('i18n');
const cron = require('node-cron');
const { getWithdrawalHistory } = require('../clients/binance');
const User = require('../../src/models/user.model');
const { SUCCESS_BINANCE_WITHDRAWAL, REJECTED_BINANCE_WITHDRAWAL } = require('../util/constants');
const Withdrawal = require('../../src/models/withdrawal.model');
const TxMessage = require('../../src/models/tx_message.model');
const schedule = process.env.JOB_CRON_WITHDRAWAL_IN_PROCESSING;
const Decimal = require('decimal.js');
const redisClient = require('../config/redis');

const JOB_LOCK_KEY = 'job:withdrawal-processing';
const JOB_LOCK_TTL_SECS = 55; // slightly less than the shortest cron interval (1 min)

async function verifyWithdrawalsInProcessing() {
    // Distributed lock: only one server instance runs this at a time
    const lock = await redisClient.set(JOB_LOCK_KEY, '1', { NX: true, EX: JOB_LOCK_TTL_SECS });
    if (!lock) {
        logger.info('JOB withdrawal-processing: skipped (another instance holds the lock)', { className: filename });
        return;
    }

    try {
        const withdrawals = await getWithdrawalHistoryInProcessing();
        if (withdrawals.length === 0) return;

        logger.info(`JOB Running: withdrawal in processing at ${new Date().toISOString()}`, { className: filename });

        const inputParam = await getInputParam(withdrawals);
        if (!inputParam) return;

        const binanceWithdrawals = await getWithdrawalHistory(inputParam);
        await processBinanceWithdrawals(withdrawals, binanceWithdrawals);
    } finally {
        await redisClient.del(JOB_LOCK_KEY);
    }
}

async function processBinanceWithdrawals(withdrawals, binanceWithdrawals) {
    for (const withdrawal of withdrawals) {
        try {
            const binanceWithdrawal = binanceWithdrawals.find(bw => bw.id === withdrawal.id_binance);

            // Guard: Binance may not return data for every ID in the batch
            if (!binanceWithdrawal) {
                logger.warn(`JOB: withdrawal ${withdrawal.id_binance} not found in Binance response — skipping`, { className: filename });
                continue;
            }

            switch (binanceWithdrawal.status) {
                case SUCCESS_BINANCE_WITHDRAWAL:
                    await confirmWithdrawal(withdrawal, binanceWithdrawal);
                    break;
                case REJECTED_BINANCE_WITHDRAWAL:
                    await rejectWithdrawal(withdrawal, binanceWithdrawal);
                    break;
                default:
                    await logWithdrawalStatus(withdrawal, binanceWithdrawal);
                    break;
            }
        } catch (error) {
            logger.error(`Error processing withdrawal ID: ${withdrawal.id_binance}. Error: ${error.message}`, { className: filename });
        }
    }
}

async function confirmWithdrawal(withdrawal, binanceWithdrawal) {
    const user = await User.findOne({ _id: withdrawal.user_id });
    const descTransferType = getDescTransferType(binanceWithdrawal.transferType);
    const descWalletType = getDescWalletType(binanceWithdrawal.walletType);

    user.total_witdrawal = new Decimal(user.total_witdrawal).plus(withdrawal.amount);

    withdrawal.status = 'confirmed';
    withdrawal.tx_fee = new Decimal(withdrawal.amount).minus(binanceWithdrawal.amount);
    withdrawal.amount = binanceWithdrawal.amount;
    withdrawal.txId = binanceWithdrawal.txId;
    withdrawal.confirmed_at = new Date();
    withdrawal.confirmed_at_binance = new Date(binanceWithdrawal.completeTime);
    withdrawal.transfer_type = descTransferType;
    withdrawal.wallet_type = descWalletType;

    await user.save();
    await withdrawal.save();
    await saveTxMessage(withdrawal.user_id, binanceWithdrawal.txId, withdrawal.amount, withdrawal.coin, withdrawal.wallet, i18n.__('message_tx.confirmed.ok'));
}

async function rejectWithdrawal(withdrawal, binanceWithdrawal) {
    const user = await User.findOne({ _id: withdrawal.user_id });

    user.balance = new Decimal(user.balance).plus(withdrawal.amount);

    await user.save();
    await withdrawal.deleteOne({ _id: withdrawal._id });
    await saveTxMessage(withdrawal.user_id, binanceWithdrawal.txId, withdrawal.amount, withdrawal.coin, withdrawal.wallet, i18n.__('message_tx.rejected'));
}

async function logWithdrawalStatus(withdrawal, binanceWithdrawal) {
    const message = i18n.__('message_tx.otherstatus') + binanceWithdrawal.status;
    await saveTxMessage(withdrawal.user_id, binanceWithdrawal.txId, withdrawal.amount, withdrawal.coin, withdrawal.wallet, message);
}

async function getWithdrawalHistoryInProcessing() {
    try {
        return Withdrawal.find({ status: 'processing' });
    } catch {
        logger.error('Error fetching withdrawals in processing', { className: filename });
        return [];
    }
}

function getDescTransferType(transferType) {
    switch (transferType) {
        case 1:
            return 'internal';
        case 0:
            return 'external';
        default:
            return 'unknown';
    }
}

function getDescWalletType(transferType) {
    switch (transferType) {
        case 1:
            return 'funding';
        case 0:
            return 'spot';
        default:
            return 'unknown';
    }
}

async function saveTxMessage(user_id, txId, amount, coin, wallet, message) {
    const txMessage = new TxMessage({
        user_id,
        txId,
        amount,
        coin,
        message,
        wallet,
        txType: 'withdrawal'
    });

    await txMessage.save();
}

async function getInputParam(withdrawals) {
    return withdrawals.map(w => w.id_binance).join(',');

}

cron.schedule(schedule, () => {
    verifyWithdrawalsInProcessing();
});