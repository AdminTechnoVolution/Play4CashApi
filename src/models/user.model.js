const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
  coin: { type: String, uppercase: true },
  network: { type: String, uppercase: true, maxlength: 50 },
  wallet: { type: String },
}, { _id: false });

const userSchema = new mongoose.Schema({
  email: { type: String, required: true },
  username: { type: String, required: true },
  wallet_address: walletSchema,
  balance: { type: Number, default: 0 },
  total_recharged: { type: Number, default: 0 },
  total_witdrawal: { type: Number, default: 0 },
  total_won: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now },
  status: { type: String, enum: ['pending_verify', 'active', 'inactive'], default: 'active', lowercase: true },
}, {
  versionKey: false
});

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ username: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
userSchema.index({ status: 1 });


module.exports = mongoose.model('User', userSchema);