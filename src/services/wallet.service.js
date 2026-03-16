const path = require('path');
const logger = require('../../shared/config/logger');
const filename = path.basename(__filename);
const BaseResponse = require('../../shared/util/baseResponse');
const BusinessException = require('../../shared/exceptionHandler/BusinessException');
const Wallet = require('../models/wallet.model');

const createWallet = async (req) => {
    try {
        const { coin, address, red, isActive } = req.body;
        
        const existingWallet = await Wallet.findOne({ coin: coin.toUpperCase(), red });
        if (existingWallet) {
            throw new BusinessException('WARNING_WALLET_ALREADY_EXISTS');
        }

        const newWallet = new Wallet({
            coin: coin.toUpperCase(),
            address,
            red,
            isActive: isActive !== undefined ? isActive : true
        });

        await newWallet.save();

        const message = req.__ ? req.__("SUCCESS_GENERIC_RESPONSE") : "Wallet created successfully";
        return new BaseResponse(true, [message], newWallet);
    } catch (err) {
        logger.error(`Error creating wallet: ${err}`, { className: filename });
        if (err instanceof BusinessException) {
            throw err;
        }
        throw new BusinessException('ERROR_GENERIC_RESPONSE');
    }
};

const getWallets = async (req) => {
    try {
        const wallets = await Wallet.find();
        return new BaseResponse(true, [], wallets);
    } catch (err) {
        logger.error(`Error getting wallets: ${err}`, { className: filename });
        throw new BusinessException('ERROR_GENERIC_RESPONSE');
    }
};

module.exports = { createWallet, getWallets };
