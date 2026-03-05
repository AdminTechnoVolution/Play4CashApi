const mongoose = require('mongoose');

const languageSchema = new mongoose.Schema({
    es: { type: String },
    en: { type: String }
}, { _id: false });

const gameSchema = new mongoose.Schema({
    name: languageSchema,
    description: languageSchema,
    active: { type: Boolean, required: true },
    min_players: { type: Number, required: true },
    max_players: { type: Number, required: true },
    min_bet: { type: Number, required: true },
    default_bets: { type: [Number], required: true },
    house_edge: { type: Number, required: true, min: 1, max: 100 },
    socket_code: { type: String, required: true },
    turn_timer_seconds: { type: Number, required: true, min: 1 },
    created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Game', gameSchema);
