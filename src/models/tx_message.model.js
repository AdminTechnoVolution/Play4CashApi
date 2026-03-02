const mongoose = require('mongoose');

const txMessageSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    txId: { type: String },
    amount: { type: Number, required: true },
    coin: { type: String, required: true, uppercase: true },
    message: { type: String, required: true },
    txType: { type: String, enum: ['recharge', 'withdrawal'], lowercase: true, required: true },
    wallet: { type: String },
    created_at: { type: Date, default: Date.now },
}, {
    versionKey: false
});

txMessageSchema.index({ txId: 1 });
txMessageSchema.index({ txType: 1 });
txMessageSchema.index({ coin: 1 });

module.exports = mongoose.model('Tx_Message', txMessageSchema);
