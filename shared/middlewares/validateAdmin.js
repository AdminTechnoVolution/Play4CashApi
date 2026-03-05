const { getValueFromJwtToken } = require('../util/jwt');
const BusinessException = require('../exceptionHandler/BusinessException');

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());

module.exports = (req, res, next) => {
    const auth = req.headers['authorization'];
    const email = getValueFromJwtToken(auth, 'email');

    if (!email || !ADMIN_EMAILS.includes(email.toLowerCase())) {
        throw new BusinessException('ERROR_AUTH', 403);
    }

    next();
};
