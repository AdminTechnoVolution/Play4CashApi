const mongoose = require('mongoose');

const cellSchema = new mongoose.Schema({
    _id: false,
}, { strict: false }); // cells are stored as plain [[row, col]] arrays

const shipSchema = new mongoose.Schema({
    type: {
        type: String,
        required: true,
        enum: ['carrier', 'battleship', 'cruiser', 'submarine', 'destroyer'],
    },
    startRow: { type: Number, required: true, min: 0, max: 9 },
    startCol: { type: Number, required: true, min: 0, max: 9 },
    isHorizontal: { type: Boolean, required: true },
    cells: { type: [[Number]], required: true },
}, { _id: false });

const battleshipPlacementSchema = new mongoose.Schema({
    room_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Room',
        required: true,
    },
    player_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    ships: {
        type: [shipSchema],
        required: true,
    },
    ready_at: { type: Date, default: Date.now },
    status: {
        type: String,
        enum: ['placed', 'ready'],
        default: 'placed',
    },
}, {
    versionKey: false,
    timestamps: true,
});

battleshipPlacementSchema.index({ room_id: 1, player_id: 1 }, { unique: true });

module.exports = mongoose.model('BattleshipPlacement', battleshipPlacementSchema);
