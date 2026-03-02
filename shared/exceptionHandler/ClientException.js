class ClientException extends Error {
    constructor(message, statusCode = 400, name = 'ClientException') {
        super(message);
        this.name = name;
        this.statusCode = statusCode;
    }
}

module.exports = ClientException;
