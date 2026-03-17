const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
    coin: { type: String, required: true, uppercase: true },
    address: { type: String, required: true },
    red: { type: String, required: true },
    description: { type: String },
    minAmount: { type: Number, required: true, default: 0 },
    networkWithdrawalFee: { type: Number, required: true, default: 0 },
    isActive: { type: Boolean, default: true }
}, {
    versionKey: false,
    timestamps: false,
});

walletSchema.index({ coin: 1 });
walletSchema.index({ isActive: 1 });

module.exports = mongoose.model('Wallet', walletSchema);
