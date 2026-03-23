const mongoose = require('mongoose');

const moveSchema = new mongoose.Schema({
    data: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { _id: false });

const playerSchema = new mongoose.Schema({
    playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    ready: { type: Boolean, default: false },
    moves: { type: [moveSchema], default: [] }
}, { _id: false });

const roomSchema = new mongoose.Schema({
    name: { type: String },
    code: { type: String, required: true, unique: true },
    game_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true },
    players: { type: [playerSchema], default: [] },
    bet_amount: { type: Number, required: true, min: 1 },
    house_edge: { type: Number, required: true, min: 1, max: 100 },
    public: { type: Boolean, required: true },
    status: { type: String, enum: ['waiting', 'started', 'finished'], default: 'waiting', lowercase: true },
    created_at: { type: Date, default: Date.now },
    finished_at: { type: Date },
    winner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    winner_reason: { type: String, lowercase: true },
}, {
    versionKey: false,
    timestamps: false,
});

roomSchema.index({ game_id: 1 });
roomSchema.index({ status: 1 });
roomSchema.index({ winner: 1 });
roomSchema.index({ 'players.playerId': 1 });
roomSchema.index({ 'players.playerId': 1, game_id: 1 });


module.exports = mongoose.model('Room', roomSchema);
