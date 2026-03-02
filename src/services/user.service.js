const BaseResponse = require('../../shared/util/baseResponse');
const BusinessException = require('../../shared/exceptionHandler/BusinessException');
const { SUCCESS_REGISTER_USER, SUCCESS_REGISTER_WALLET, SUCCESS_VERIFY_CODE_USER } = require('../../shared/util/constants');
const { sendEmail } = require('../../shared/email/mailer');
const { getValueFromJwtToken } = require('../../shared/util/jwt');
const { generateVerificationCode, generateHash } = require('../../shared/util/util');
const bcrypt = require('bcryptjs');
const User = require('../models/user.model');

const getUserAccount = async (req) => {
    const auth = req.headers['authorization'];
    const user_id = getValueFromJwtToken(auth, 'id');

    const user = await User.findById(user_id).select('-_id -password -created_at').lean();

    if (!user) throw new BusinessException('ERROR_USER_NOTFOUND');

    message = req.__(SUCCESS_REGISTER_WALLET);
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

    message = req.__(SUCCESS_REGISTER_WALLET);
    return new BaseResponse(true, [message]);
}

const registerUser = async (req) => {
    let { email, username, password, referred_by } = req.body;
    email = email.toLowerCase();
    const existingUser = await User.findOne({ $or: [{ email: email }, { username: username }] })
        .collation({ locale: 'en', strength: 2 });

    if (existingUser) throw new BusinessException('user.exist');

    let verification_code = generateVerificationCode();
    let hashedPassword = await generateHash(password, true);
    let hashedVerificationCode = await generateHash(verification_code, true);
    let referral_code = await generateHash(email, false);
    let verificationExpireMins = process.env.EMAIL_VERIFICATION_EXPIRY_MINUTES;
    let verification_expires_at = new Date(Date.now() + verificationExpireMins * 60 * 1000);

    let user = new User({
        email: email,
        username,
        password: hashedPassword,
        referral_code,
        referred_by,
        verification_code: hashedVerificationCode,
        verification_expires_at,
    });

    await user.save();
    sendVerificationEmail(email, username, verification_code, verificationExpireMins, req);

    message = req.__(SUCCESS_REGISTER_USER)
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
    message = req.__(SUCCESS_VERIFY_CODE_USER)
    return new BaseResponse(true, [message]);
};

const sendVerificationEmail = async (email, username, code, verificationExpireMins, req) => {
    let subject = req.__('mailer.verifyAccount.subject');
    let html = req.__('mailer.verifyAccount.template.body');
    html = html
        .replace(/\[code\]/g, code)
        .replace(/\[username\]/g, username)
        .replace(/\[verificationExpireMins\]/g, verificationExpireMins);
    await sendEmail(email, subject, html);
};

module.exports = { registerUser, verifyCodeUser, registerWalletToUser, getUserAccount };
