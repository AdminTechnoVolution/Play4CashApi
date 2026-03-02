class DataLayerException extends Error {
    constructor(message, statusCode = 500, name = 'DataLayerException') {
        super(message);
        this.name = name;
        this.statusCode = statusCode;
    }
}

module.exports = DataLayerException;
