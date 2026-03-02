require('winston-daily-rotate-file');
const winston = require('winston');
const { combine, timestamp, printf, errors } = winston.format;
const MAX_CLASSNAME_WIDTH = 30;
const MAX_LEVEL_WIDTH = 8;

const transport = new winston.transports.DailyRotateFile({
    filename: 'logs/play4cash-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    maxSize: '5m',
    maxFiles: '30d'
});

const logFormat = printf(({ timestamp, level, message, className, stack }) => {
    const paddedClassName = `[${className}]`.padEnd(MAX_CLASSNAME_WIDTH);
    const paddedLevel = `[${level}]`.padEnd(MAX_LEVEL_WIDTH);
    return `${timestamp} ${paddedLevel} ${paddedClassName} : ${stack || message}`;
});

const logger = winston.createLogger({
    level: 'info',
    format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }),
        logFormat
    ),
    transports: [
        transport,
        new winston.transports.Console()
    ]
});

module.exports = logger;