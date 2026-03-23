const mongoose = require('mongoose');

const chessGameSchema = new mongoose.Schema({
    room_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Room',
        required: true,
        unique: true,
    },
    player1_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    player2_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    // 8x8 board: { type: 'p', color: 'w' } etc.
    board: {
        type: [[Object]],
        required: true,
    },
    // Which player's turn it is (1 = White, 2 = Black)
    current_player: {
        type: Number,
        enum: [1, 2],
        default: 1,
    },
    // Castling rights: { wK: true, wQ: true, bK: true, bQ: true }
    castling_rights: {
        type: Object,
        default: { wK: true, wQ: true, bK: true, bQ: true }
    },
    // En passant target square: { row, col } or null
    en_passant_target: {
        type: Object,
        default: null
    },
    // Move history: JSON array of moves
    history: {
        type: [Object],
        default: []
    },
    // For turn timers: when did the current turn begin?
    turn_start_time: {
        type: Date,
        default: Date.now,
    },
}, {
    versionKey: false,
    timestamps: true,
});

module.exports = mongoose.model('ChessGame', chessGameSchema);
