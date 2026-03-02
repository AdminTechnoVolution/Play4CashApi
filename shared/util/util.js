const { ALPHABET_NUMBERS, LANGUAGE_ES } = require('./constants');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const generateVerificationCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

const generateHash = async (value, isBcrypt) => {
    if (isBcrypt) {
        return await bcrypt.hash(value, 10);
    } else {
        return crypto.createHash('sha256').update(value).digest('hex');
    }
};

const generateRandomHash = () => {
    return crypto.randomBytes(40).toString('hex');
};

const maxDecimals = (max) => {
    return (value, helpers) => {
        const decimalPart = value.toString().split('.')[1];
        if (decimalPart && decimalPart.length > max) {
            return helpers.error('number.maxDecimals', { max });
        }
        return value;
    };
}

function generateRoomCode(length = 6) {
    const chars = ALPHABET_NUMBERS;
    const bytes = crypto.randomBytes(length);
    let result = '';

    for (let i = 0; i < length; i++) {
        result += chars[bytes[i] % chars.length];
    }

    return result;
}

function setLanguageToSocket(socket) {
    try {
        const acceptLanguageHeader = socket.handshake.headers['accept-language'];
        const acceptLanguage = acceptLanguageHeader || LANGUAGE_ES;
        const langTransform = acceptLanguage.split(',')[0].split('-')[0];
        socket.locale = langTransform;
    } catch {
        socket.locale = LANGUAGE_ES;
    }
}

module.exports = { generateVerificationCode, generateHash, maxDecimals, generateRandomHash, generateRoomCode, setLanguageToSocket };