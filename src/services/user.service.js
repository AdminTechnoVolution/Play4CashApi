const BaseResponse = require('../../shared/util/baseResponse');
const i18n = require('../../shared/language/i18n');
const BusinessException = require('../../shared/exceptionHandler/BusinessException');
const { SUCCESS_REGISTER_USER, SUCCESS_REGISTER_WALLET, SUCCESS_VERIFY_CODE_USER } = require('../../shared/util/constants');
const { sendEmail } = require('../../shared/email/mailer');
const { getValueFromJwtToken } = require('../../shared/util/jwt');
const { generateVerificationCode, generateHash } = require('../../shared/util/util');
const bcrypt = require('bcryptjs');
const User = require('../models/user.model');
const Room = require('../models/room.model');
const { getConfig } = require('./appConfig.service');

const getUserAccount = async (req) => {
    const auth = req.headers['authorization'];
    const user_id = getValueFromJwtToken(auth, 'id');

    const user = await User.findById(user_id).select('-created_at').lean();

    if (!user) throw new BusinessException('ERROR_USER_NOTFOUND');

    const config = await getConfig();
    user.limits = {
        daily_withdrawal: config.withdrawal_daily_limit,
    };

    return new BaseResponse(true, [], user);
}

const registerWalletToUser = async (req) => {
    let { wallet, coin, network } = req.body;
    const auth = req.headers['authorization'];
    const user_id = getValueFromJwtToken(auth, 'id');

    let user = await User.findOne({ _id: user_id, status: 'active' });

    if (!user) throw new BusinessException('ERROR_USER_NOTFOUND');

    user.wallet_address = { coin, network, wallet };
    await user.save();

    const message = req.__(SUCCESS_REGISTER_WALLET);
    return new BaseResponse(true, [message]);
}

const registerUser = async (req) => {
    let { email, username, referred_by } = req.body;
    email = email.toLowerCase();
    const existingUser = await User.findOne({ $or: [{ email: email }, { username: username }] })
        .collation({ locale: 'en', strength: 2 });

    if (existingUser) throw new BusinessException('user.exist');

    let user = new User({
        email: email,
        username,
        referred_by,
        status: 'active',
    });

    await user.save();

    const message = req.__(SUCCESS_REGISTER_USER);
    return new BaseResponse(true, [message]);
};

const verifyCodeUser = async (req) => {
    let { email, verification_code } = req.body;
    email = email.toLowerCase();
    const user = await User.findOne({ email, status: 'pending_verify' });

    if (!user) throw new BusinessException('ERROR_VERIFICATIONCODE_RESPONSE');
    let isMatch = bcrypt.compareSync(verification_code, user.verification_code);

    if (!isMatch) throw new BusinessException('ERROR_VERIFICATIONCODE_RESPONSE');

    user.status = 'active';
    user.verification_code = undefined;
    user.verification_expires_at = undefined;

    await user.save();
    const message = req.__(SUCCESS_VERIFY_CODE_USER);
    return new BaseResponse(true, [message]);
};

const getUserHistory = async (req) => {
    const auth = req.headers['authorization'];
    const user_id = getValueFromJwtToken(auth, 'id');
    const lang = req.headers['accept-language'] || 'es';

    const rooms = await Room.find({
        status: 'finished',
        'players.playerId': user_id
    })
    .populate('game_id', 'name socket_code')
    .populate('players.playerId', 'username')
    .populate('winner', 'username')
    .sort({ finished_at: -1 })
    .lean();

    const history = rooms.map(room => {
        const isWinner = room.winner && room.winner._id.toString() === user_id;
        const isDraw = !room.winner && room.status === 'finished' && 
                      ['stalemate', 'insufficient_material', 'draw'].includes(room.winner_reason);
        
        // Prize logic: 
        // - Win: bet + (bet * edge_remainder)
        // - Draw: bet back
        // - Loss: 0
        let prize = 0;
        let resultKey = 'lose';
        
        if (isWinner) {
            prize = room.bet_amount + (room.bet_amount * (1 - room.house_edge / 100));
            resultKey = 'win';
        } else if (isDraw) {
            prize = room.bet_amount;
            resultKey = 'draw';
        }

        const opponent = room.players.find(p => p.playerId?._id?.toString() !== user_id);
        
        // Localized game name
        let gameName = 'Unknown';
        if (room.game_id && room.game_id.name) {
            gameName = room.game_id.name[lang] || room.game_id.name['en'] || room.game_id.name['es'] || 'Unknown';
        }

        const reason = room.winner_reason || (isWinner ? 'win' : (isDraw ? 'draw' : 'forfeit'));

        return {
            room_id: room._id,
            room_code: room.code,
            game_name: gameName,
            game_code: room.game_id?.socket_code || 'unknown',
            bet_amount: room.bet_amount,
            result: i18n.__({ phrase: `ws.games.${resultKey}`, locale: lang }),
            prize: prize > 0 ? prize : (isWinner ? 0 : (isDraw ? room.bet_amount : null)), 
            winner_reason: i18n.__({ phrase: `ws.games.${reason}`, locale: lang }),
            opponent: opponent ? {
                username: opponent.playerId?.username,
            } : null,
            finished_at: room.finished_at,
            date: room.finished_at // Keep for backward compatibility
        };
    });

    return new BaseResponse(true, [], history);
};

const getTotalBalances = async () => {
    const result = await User.aggregate([
        { 
            $group: { 
                _id: null, 
                total_balances: { $sum: '$balance' },
                total_deposited: { $sum: '$total_recharged' },
                total_withdrawn: { $sum: '$total_witdrawal' }, // Note: existing typo in model
                total_users: { $sum: 1 }
            } 
        }
    ]);
    const data = result.length > 0 ? result[0] : { total_balances: 0, total_deposited: 0, total_withdrawn: 0, total_users: 0 };
    delete data._id;
    return new BaseResponse(true, [], data);
};

module.exports = { registerUser, verifyCodeUser, registerWalletToUser, getUserAccount, getUserHistory, getTotalBalances };
