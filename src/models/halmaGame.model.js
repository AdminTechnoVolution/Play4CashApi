const mongoose = require('mongoose');

const halmaGameSchema = new mongoose.Schema({
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
    // 8x8 board: 0 = empty, 1 = Player 1 piece, 2 = Player 2 piece
    board: {
        type: [[Number]],
        required: true,
    },
    // Which player's turn it is (1 or 2)
    current_player: {
        type: Number,
        enum: [1, 2],
        default: 1,
    },
    // Optional config: once a piece enters the goal zone it cannot move back out
    prevent_leave_goal: {
        type: Boolean,
        default: false,
    },
}, {
    versionKey: false,
    timestamps: false,
});

module.exports = mongoose.model('HalmaGame', halmaGameSchema);
