class BusinessException extends Error {
    constructor(message, statusCode = 400, name = 'BusinessException') {
        super(message);
        this.name = name;
        this.statusCode = statusCode;
    }
}

module.exports = BusinessException;
