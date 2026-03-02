const mongoose = require('mongoose');

const withdrawalSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    coin: { type: String, required: true, uppercase: true },
    wallet: { type: String, required: true },
    id_binance: { type: String },
    tx_fee: { type: Number, default: 0 },
    transfer_type: { type: String, enum: ['internal', 'external', 'unknown'] },
    wallet_type: { type: String, enum: ['spot', 'funding', 'unknown'] },
    txId: { type: String },
    network: { type: String },
    status: { type: String, enum: ['pending_verify', 'processing', 'confirmed', 'failed'], default: 'pending_verify', lowercase: true },
    created_at: { type: Date, default: Date.now },
    confirmed_at: { type: Date },
    confirmed_at_binance: { type: Date },
    verification_code: { type: String },
    verification_expires_at: { type: Date }
}, {
    versionKey: false,
    timestamps: false,
});

withdrawalSchema.index({ verification_expires_at: 1 }, { expireAfterSeconds: 0 });
withdrawalSchema.index({ wallet_type: 1 });
withdrawalSchema.index({ transfer_type: 1 });
withdrawalSchema.index({ wallet: 1 });
withdrawalSchema.index({ user_id: 1 });
withdrawalSchema.index({ coin: 1 });
withdrawalSchema.index({ status: 1 });

module.exports = mongoose.model('Withdrawal', withdrawalSchema);