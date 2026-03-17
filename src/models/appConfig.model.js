const mongoose = require('mongoose');

const appConfigSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true, default: 'global' },
    withdrawal_daily_limit: { type: Number, required: true, default: 10000 },
}, {
    versionKey: false,
    timestamps: false,
});

appConfigSchema.index({ key: 1 }, { unique: true });

module.exports = mongoose.model('AppConfig', appConfigSchema);
