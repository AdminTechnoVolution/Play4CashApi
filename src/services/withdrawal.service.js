const path = require('path');
const logger = require('../../shared/config/logger');
const filename = path.basename(__filename);
const Decimal = require('decimal.js');
const bcrypt = require('bcryptjs');
const BaseResponse = require('../../shared/util/baseResponse');
const BusinessException = require('../../shared/exceptionHandler/BusinessException');
const TxMessage = require('../models/tx_message.model');
const Withdrawal = require('../models/withdrawal.model');
const User = require('../models/user.model');
const Wallet = require('../models/wallet.model');
const { getValueFromJwtToken } = require('../../shared/util/jwt');
const { generateVerificationCode, generateHash } = require('../../shared/util/util');
const { sendWithdrawalRequest } = require('../../shared/clients/binance');
const { sendEmail } = require('../../shared/email/mailer');
const WITHDRAWAL_VERIFICATION_EXPIRY_MINUTES = process.env.WITHDRAWAL_VERIFICATION_EXPIRY_MINUTES;
const MIN_WITHDRAWAL = process.env.MIN_WITHDRAWAL;
const { getConfig } = require('./appConfig.service');

const createWithdrawal = async (req) => {
    const user = await findUserWithValidWallet(req);
    const verification_code = generateVerificationCode();
    await saveWithdrawal(req, user, verification_code);
    sendVerificationEmail(req, user, verification_code);

    message = req.__("SUCCESS_WITHDRAWAL_CREATED");
    return new BaseResponse(true, [message]);
};

const verifyWithdrawal = async (req) => {
    const user = await findUserWithValidWallet(req);
    const withdrawal = await verifyWithdrawalCode(req, user);
    await verifyAmountAndBalance(req, user, withdrawal);
    await processWithdrawalAndCallBinance(req, user, withdrawal);

    message = req.__("SUCCESS_WITHDRAWAL_VERIFY");
    return new BaseResponse(true, [message]);
};

const processWithdrawalAndCallBinance = async (req, user, withdrawal) => {
    const verification_code = withdrawal.verification_code;
    const verification_expires_at = withdrawal.verification_expires_at;
    try {
        // Atomic balance deduction: only succeeds if the user still has enough funds.
        // This prevents double-spend race conditions where two concurrent requests
        // both pass the balance check but both proceed to deduct.
        const updatedUser = await User.findOneAndUpdate(
            { _id: user._id, balance: { $gte: withdrawal.amount } },
            { $inc: { balance: -withdrawal.amount } },
            { new: true }
        );
        if (!updatedUser) {
            throw new BusinessException('ERROR_WITHDRAWAL_INSUFFICIENT_BALANCE');
        }

        withdrawal.verification_code = undefined;
        withdrawal.verification_expires_at = undefined;
        await withdrawal.save();

        const withdrawalResponse = await sendWithdrawalRequest(
            withdrawal.coin, withdrawal.network, withdrawal.wallet, withdrawal.amount);

        withdrawal.id_binance = withdrawalResponse.id;
        withdrawal.status = 'processing';

        await withdrawal.save();
        await saveTxMessage(withdrawal.user_id, withdrawal.amount, withdrawal.coin, withdrawal.wallet, req.__("message_tx.processing.ok"));
    } catch (err) {
        logger.error(`Error processing withdrawal: ${err}`, { className: filename });
        // Only restore balance if we actually deducted it (i.e. not an insufficient-balance error)
        if (err.message !== 'ERROR_WITHDRAWAL_INSUFFICIENT_BALANCE') {
            await User.findOneAndUpdate(
                { _id: user._id },
                { $inc: { balance: withdrawal.amount } }
            );
        }
        withdrawal.status = 'pending_verify';
        withdrawal.verification_code = verification_code;
        withdrawal.verification_expires_at = verification_expires_at;
        await withdrawal.save();
        await saveTxMessage(withdrawal.user_id, withdrawal.amount, withdrawal.coin, withdrawal.wallet, err.message);
        throw new BusinessException('ERROR_GENERIC_RESPONSE');
    }
}


const verifyAmountAndBalance = async (req, user, withdrawal) => {
    try {
        const walletConfig = await Wallet.findOne({ coin: withdrawal.coin, red: withdrawal.network, isActive: true });
        if (!walletConfig) throw new BusinessException('ERROR_WALLET_NOT_CONFIGURED');

        if (withdrawal.amount < walletConfig.minAmount) throw new BusinessException('ERROR_WITHDRAWAL_AMOUNT_MINIMUM');
        if (withdrawal.amount > user.balance) throw new BusinessException('ERROR_WITHDRAWAL_INSUFFICIENT_BALANCE');
    } catch (err) {
        let message;
        logger.error(`Error verifying withdrawal: ${err}`, { className: filename });
        if (err.message === 'ERROR_WITHDRAWAL_INSUFFICIENT_BALANCE' || err.message === 'ERROR_WITHDRAWAL_AMOUNT_MINIMUM') {
            if (err.message === 'ERROR_WITHDRAWAL_AMOUNT_MINIMUM') message = req.__("message_tx.amount_minimum.error");
            if (err.message === 'ERROR_WITHDRAWAL_INSUFFICIENT_BALANCE') message = req.__("message_tx.insufficient_balance.error");

            await saveTxMessage(withdrawal.user_id, withdrawal.amount, withdrawal.coin, withdrawal.wallet, message);
            throw new BusinessException(err.message);
        }
    }
}

const verifyWithdrawalCode = async (req, user) => {
    const { verification_code } = req.body;

    const withdrawal = await Withdrawal.findOne(
        { user_id: user._id, status: 'pending_verify' }
    );

    if (!withdrawal) throw new BusinessException('ERROR_WITHDRAWAL_CODE_INVALID');
    let isMatch = bcrypt.compareSync(verification_code, withdrawal.verification_code);

    if (!isMatch) throw new BusinessException('ERROR_WITHDRAWAL_CODE_INVALID');

    return withdrawal;
}

const findUserWithValidWallet = async (req) => {
    const auth = req.headers['authorization'];
    const user_id = getValueFromJwtToken(auth, 'id');
    const user = await User.findOne({ _id: user_id, status: 'active' });
    if (!user) throw new BusinessException('ERROR_USER_NOTFOUND');
    if (!user.wallet_address || !user.wallet_address.coin || !user.wallet_address.wallet) throw new BusinessException('ERROR_USER_WALLET_NOTFOUND');
    return user;
}

const saveWithdrawal = async (req, user, verification_code) => {
    const { amount } = req.body;

    const walletConfig = await Wallet.findOne({ coin: user.wallet_address.coin, red: user.wallet_address.network, isActive: true });
    if (!walletConfig) throw new BusinessException('ERROR_WALLET_NOT_CONFIGURED');

    const tx_fee = walletConfig.networkWithdrawalFee || 0;

    const verification_expires_at = new Date(Date.now() + WITHDRAWAL_VERIFICATION_EXPIRY_MINUTES * 60 * 1000);
    let hashedVerificationCode = await generateHash(verification_code, true);
    const withdrawal = new Withdrawal({
        user_id: user._id,
        amount,
        tx_fee,
        coin: user.wallet_address.coin,
        wallet: user.wallet_address.wallet,
        network: user.wallet_address.network,
        verification_code: hashedVerificationCode,
        verification_expires_at
    });

    try {
        const config = await getConfig();
        const withdrawalDailyLimit = config.withdrawal_daily_limit;
        if (withdrawalDailyLimit > 0) {
            const startOfDay = new Date();
            startOfDay.setUTCHours(0, 0, 0, 0);

            const todayWithdrawals = await Withdrawal.aggregate([
                { $match: { 
                    user_id: user._id, 
                    created_at: { $gte: startOfDay },
                    status: { $ne: 'failed' }
                } },
                { $group: { _id: null, totalAmount: { $sum: "$amount" } } }
            ]);

            const totalToday = todayWithdrawals.length > 0 ? todayWithdrawals[0].totalAmount : 0;
            
            if (totalToday + amount > withdrawalDailyLimit) {
                throw new BusinessException('ERROR_WITHDRAWAL_DAILY_LIMIT_EXCEEDED');
            }
        }

        const foundWithdrawal = await Withdrawal.findOne({ user_id: withdrawal.user_id, status: 'pending_verify' });
        if (foundWithdrawal) throw new BusinessException('ERROR_WITHDRAWAL_PENDING_VERIFY');
        if (amount < walletConfig.minAmount) throw new BusinessException('ERROR_WITHDRAWAL_AMOUNT_MINIMUM');
        if (amount > user.balance) throw new BusinessException('ERROR_WITHDRAWAL_INSUFFICIENT_BALANCE');

        return await withdrawal.save();
    } catch (err) {
        let message;
        logger.error(`Error creating withdrawal: ${err}`, { className: filename });
        if (err.message === 'ERROR_WITHDRAWAL_PENDING_VERIFY' || err.message === 'ERROR_WITHDRAWAL_INSUFFICIENT_BALANCE' || err.message === 'ERROR_WITHDRAWAL_AMOUNT_MINIMUM' || err.message === 'ERROR_WITHDRAWAL_DAILY_LIMIT_EXCEEDED') {
            if (err.message === 'ERROR_WITHDRAWAL_PENDING_VERIFY') message = req.__("message_tx.pending.error");
            if (err.message === 'ERROR_WITHDRAWAL_AMOUNT_MINIMUM') message = req.__("message_tx.amount_minimum.error");
            if (err.message === 'ERROR_WITHDRAWAL_INSUFFICIENT_BALANCE') message = req.__("message_tx.insufficient_balance.error");
            if (err.message === 'ERROR_WITHDRAWAL_DAILY_LIMIT_EXCEEDED') message = req.__("ERROR_WITHDRAWAL_DAILY_LIMIT_EXCEEDED");

            await saveTxMessage(withdrawal.user_id, withdrawal.amount, withdrawal.coin, withdrawal.wallet, message);
            throw new BusinessException(err.message);
        }
        await saveTxMessage(withdrawal.user_id, withdrawal.amount, withdrawal.coin, withdrawal.wallet, err.message);
        throw new BusinessException('ERROR_GENERIC_RESPONSE');
    }
}

const sendVerificationEmail = async (req, user, verification_code) => {
    let subject = req.__('mailer.verifyWithdrawal.subject');
    let html = req.__('mailer.verifyWithdrawal.template.body');
    html = html
        .replace(/\[code\]/g, verification_code)
        .replace(/\[username\]/g, user.username)
        .replace(/\[verificationExpireMins\]/g, WITHDRAWAL_VERIFICATION_EXPIRY_MINUTES);
    await sendEmail(user.email, subject, html);
};

const saveTxMessage = async (user_id, amount, coin, wallet, message) => {
    const txMessage = new TxMessage({
        user_id,
        amount,
        coin,
        message,
        wallet,
        txType: 'withdrawal'
    });

    try {
        await txMessage.save();
    } catch (err) {
        logger.error(`Error saving message transaction: ${err}`, { className: filename });
    }
}
const getWithdrawalHistory = async (req) => {
    const auth = req.headers['authorization'];
    const user_id = getValueFromJwtToken(auth, 'id');

    const withdrawals = await Withdrawal.find({ user_id })
        .select('amount coin wallet network tx_fee status txId created_at confirmed_at')
        .sort({ created_at: -1 })
        .lean();

    return new BaseResponse(true, [], withdrawals);
};

module.exports = { createWithdrawal, verifyWithdrawal, getWithdrawalHistory };

