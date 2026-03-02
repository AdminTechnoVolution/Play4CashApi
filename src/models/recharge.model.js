const mongoose = require('mongoose');

const rechargeSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    txId: { type: String, required: true },
    amount: { type: Number, required: true },
    network: { type: String },
    wallet: { type: String },
    coin: { type: String, required: true, uppercase: true },
    status: { type: String, enum: ['processing', 'confirmed'], default: 'processing', lowercase: true },
    created_at: { type: Date, default: Date.now },
    confirmed_at: { type: Date },
    time_processing_expires_at: { type: Date },
}, {
    versionKey: false,
    timestamps: false,
});

rechargeSchema.index({ time_processing_expires_at: 1 }, { expireAfterSeconds: 0 });
rechargeSchema.index({ txId: 1 }, { unique: true });
rechargeSchema.index({ user_id: 1 });
rechargeSchema.index({ coin: 1 });
rechargeSchema.index({ status: 1 });

module.exports = mongoose.model('Recharge', rechargeSchema);
