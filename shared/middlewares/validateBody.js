const BaseResponse = require('../util/baseResponse');

module.exports = (schema) => {
    return (req, res, next) => {
        const acceptLanguage = req.headers['accept-language'];
        const language = acceptLanguage?.includes('en') ? 'en' : 'es';
        req.setLocale(language);

        const { error } = schema.validate(req.body, { abortEarly: false });
        if (error) {
            const messages = error.details.map(detail => req.__(detail.message));
            const response = new BaseResponse(false, messages);
            return res.status(400).json(response);
        }
        next();
    };
};
