const path = require('path');
const logger = require('../config/logger');
const filename = path.basename(__filename);
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE,
    auth: {
        user: process.env.EMAIL_FROM,
        pass: process.env.EMAIL_PASS,
    },
});

transporter.verify((error, success) => {
    if (error) {
        logger.error('Email transport configuration error:' + error, { className: filename });
    } else {
        logger.info('Email Transport Server is ready to send messages', { className: filename });
    }
});

const sendEmail = async (to, subject, html) => {
    const mailOptions = {
        from: `"Play4Cash" <${process.env.EMAIL_FROM}>`,
        to,
        subject,
        html
    };

    await transporter.sendMail(mailOptions);
};

module.exports = { sendEmail };
