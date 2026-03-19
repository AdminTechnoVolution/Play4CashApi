const BaseResponse = require('../../shared/util/baseResponse');
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

    const user = await User.findById(user_id).select('-_id -created_at').lean();

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

    const rooms = await Room.find({
        status: 'finished',
        'players.playerId': user_id
    })
    .populate('game_id', 'name')
    .populate('players.playerId', 'username')
    .populate('winner', 'username')
    .sort({ finished_at: -1 })
    .lean();

    const history = rooms.map(room => {
        const isWinner = room.winner && room.winner._id.toString() === user_id;
        const prize = isWinner
            ? room.bet_amount + (room.bet_amount * (1 - room.house_edge / 100))
            : 0;

        return {
            room_id: room._id,
            game_name: room.game_id ? room.game_id.name : 'Unknown',
            bet_amount: room.bet_amount,
            house_edge: room.house_edge,
            result: isWinner ? 'Won' : 'Lost',
            prize: isWinner ? prize : null,
            players: room.players.map(p => ({
                player_id: p.playerId?._id,
                username: p.playerId?.username,
            })),
            winner: room.winner
                ? { player_id: room.winner._id, username: room.winner.username }
                : null,
            date: room.finished_at
        };
    });

    return new BaseResponse(true, [], history);
};

module.exports = { registerUser, verifyCodeUser, registerWalletToUser, getUserAccount, getUserHistory };
