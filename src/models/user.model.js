const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
  coin: { type: String, uppercase: true },
  network: { type: String, uppercase: true },
  wallet: { type: String },
}, { _id: false });

const userSchema = new mongoose.Schema({
  email: { type: String, required: true },
  username: { type: String, required: true },
  password: { type: String, required: true },
  referral_code: { type: String },
  referred_by: { type: String },
  wallet_address: walletSchema,
  balance: { type: Number, default: 0 },
  total_recharged: { type: Number, default: 0 },
  total_witdrawal: { type: Number, default: 0 },
  total_won: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now },
  status: { type: String, enum: ['pending_verify', 'active', 'inactive'], default: 'pending_verify', lowercase: true },
  verification_code: { type: String },
  verification_expires_at: { type: Date },
}, {
  versionKey: false
});

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ username: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
userSchema.index({ verification_expires_at: 1 }, { expireAfterSeconds: 0 });
userSchema.index({ referred_by: 1 });
userSchema.index({ status: 1 });

module.exports = mongoose.model('User', userSchema);