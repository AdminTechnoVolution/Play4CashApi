const mongoose = require('mongoose');

const dominoGameSchema = new mongoose.Schema({
    room_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Room',
        required: true,
        unique: true,
    },
    player_ids: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    }],
    // Map of player_id (as string) to array of tiles [value1, value2]
    hands: {
        type: Map,
        of: [[Number]],
        required: true,
    },
    // The sequence of tiles on the board [[v1, v2], [v2, v3], ...]
    board: {
        type: [[Number]],
        default: [],
    },
    // Remaining tiles in the boneyard
    boneyard: {
        type: [[Number]],
        default: [],
    },
    // index in player_ids
    current_player_index: {
        type: Number,
        default: 0,
    },
    // The numbers at the ends of the chain
    open_ends: {
        left: { type: Number },
        right: { type: Number }
    },
    // For turn timers
    turn_start_time: {
        type: Date,
        default: Date.now,
    },
    status: {
        type: String,
        enum: ['active', 'blocked', 'finished'],
        default: 'active',
    },
    // Consecutive passes count (if equals player_ids.length, game is blocked)
    consecutive_passes: {
        type: Number,
        default: 0
    }
}, {
    versionKey: false,
    timestamps: true,
});

module.exports = mongoose.model('DominoGame', dominoGameSchema);
