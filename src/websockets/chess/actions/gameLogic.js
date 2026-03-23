/**
 * Chess Game Logic
 * Following Strategy Pattern for piece movement.
 */

const PIECES = {
    PAWN: 'p',
    ROOK: 'r',
    KNIGHT: 'n',
    BISHOP: 'b',
    QUEEN: 'q',
    KING: 'k'
};

const COLORS = {
    WHITE: 'w',
    BLACK: 'b'
};

/**
 * Creates the initial 8x8 chess board.
 */
const createInitialBoard = () => {
    const board = Array(8).fill(null).map(() => Array(8).fill(null));

    const setupRow = (row, color) => {
        const mainPieces = [PIECES.ROOK, PIECES.KNIGHT, PIECES.BISHOP, PIECES.QUEEN, PIECES.KING, PIECES.BISHOP, PIECES.KNIGHT, PIECES.ROOK];
        for (let col = 0; col < 8; col++) {
            board[row][col] = { type: mainPieces[col], color };
        }
    };

    const setupPawns = (row, color) => {
        for (let col = 0; col < 8; col++) {
            board[row][col] = { type: PIECES.PAWN, color };
        }
    };

    // White pieces (Bottom) - Rows 6 and 7
    setupPawns(6, COLORS.WHITE);
    setupRow(7, COLORS.WHITE);

    // Black pieces (Top) - Rows 0 and 1
    setupRow(0, COLORS.BLACK);
    setupPawns(1, COLORS.BLACK);

    return board;
};

/**
 * Validates if coordinates are within the board.
 */
const isOnBoard = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

/**
 * Returns all pseudo-legal moves for a piece at (row, col).
 * Does NOT account for "leaves king in check".
 */
const getPseudoLegalMoves = (row, col, board, state) => {
    const piece = board[row][col];
    if (!piece) return [];

    const moves = [];
    const color = piece.color;
    const opponentColor = color === COLORS.WHITE ? COLORS.BLACK : COLORS.WHITE;

    const addMove = (r, c) => {
        if (!isOnBoard(r, c)) return false;
        const target = board[r][c];
        if (!target) {
            moves.push({ from: { row, col }, to: { row: r, col: c } });
            return true; // continue sliding
        } else if (target.color === opponentColor) {
            moves.push({ from: { row, col }, to: { row: r, col: c } });
            return false; // captured, stop sliding
        }
        return false; // blocked by own piece, stop sliding
    };

    switch (piece.type) {
        case PIECES.PAWN: {
            const direction = color === COLORS.WHITE ? -1 : 1;
            const startRow = color === COLORS.WHITE ? 6 : 1;

            // Forward 1
            if (isOnBoard(row + direction, col) && !board[row + direction][col]) {
                moves.push({ from: { row, col }, to: { row: row + direction, col } });
                // Forward 2
                if (row === startRow && !board[row + 2 * direction][col]) {
                    moves.push({ from: { row, col }, to: { row: row + 2 * direction, col } });
                }
            }

            // Captures
            for (const dc of [-1, 1]) {
                const tr = row + direction;
                const tc = col + dc;
                if (isOnBoard(tr, tc)) {
                    const target = board[tr][tc];
                    if (target && target.color === opponentColor) {
                        moves.push({ from: { row, col }, to: { row: tr, col: tc } });
                    }
                    // En Passant
                    if (state.en_passant_target && state.en_passant_target.row === tr && state.en_passant_target.col === tc) {
                        moves.push({ from: { row, col }, to: { row: tr, col: tc }, enPassant: true });
                    }
                }
            }
            break;
        }
        case PIECES.ROOK: {
            const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
            for (const [dr, dc] of dirs) {
                let r = row + dr, c = col + dc;
                while (addMove(r, c)) { r += dr; c += dc; }
            }
            break;
        }
        case PIECES.KNIGHT: {
            const knightMoves = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
            for (const [dr, dc] of knightMoves) {
                addMove(row + dr, col + dc);
            }
            break;
        }
        case PIECES.BISHOP: {
            const dirs = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
            for (const [dr, dc] of dirs) {
                let r = row + dr, c = col + dc;
                while (addMove(r, c)) { r += dr; c += dc; }
            }
            break;
        }
        case PIECES.QUEEN: {
            const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];
            for (const [dr, dc] of dirs) {
                let r = row + dr, c = col + dc;
                while (addMove(r, c)) { r += dr; c += dc; }
            }
            break;
        }
        case PIECES.KING: {
            const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];
            for (const [dr, dc] of dirs) {
                addMove(row + dr, col + dc);
            }
            // Castling
            const rights = state.castling_rights;
            if (color === COLORS.WHITE) {
                if (rights.wK && !board[7][5] && !board[7][6]) moves.push({ from: { row, col }, to: { row: 7, col: 6 }, castle: 'K' });
                if (rights.wQ && !board[7][1] && !board[7][2] && !board[7][3]) moves.push({ from: { row, col }, to: { row: 7, col: 2 }, castle: 'Q' });
            } else {
                if (rights.bK && !board[0][5] && !board[0][6]) moves.push({ from: { row, col }, to: { row: 0, col: 6 }, castle: 'k' });
                if (rights.bQ && !board[0][1] && !board[0][2] && !board[0][3]) moves.push({ from: { row, col }, to: { row: 0, col: 2 }, castle: 'q' });
            }
            break;
        }
    }

    return moves;
};

/**
 * Checks if the king of the given color is in check.
 */
const isCheck = (color, board, state) => {
    let kingPos = null;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (board[r][c]?.type === PIECES.KING && board[r][c]?.color === color) {
                kingPos = { row: r, col: c };
                break;
            }
        }
        if (kingPos) break;
    }

    if (!kingPos) return false;

    const opponentColor = color === COLORS.WHITE ? COLORS.BLACK : COLORS.WHITE;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (board[r][c]?.color === opponentColor) {
                const moves = getPseudoLegalMoves(r, c, board, state);
                if (moves.some(m => m.to.row === kingPos.row && m.to.col === kingPos.col)) {
                    return true;
                }
            }
        }
    }
    return false;
};

/**
 * Returns all fully legal moves for a piece.
 */
const getLegalMoves = (row, col, board, state) => {
    const piece = board[row][col];
    if (!piece || (state.current_player === 1 && piece.color !== COLORS.WHITE) || (state.current_player === 2 && piece.color !== COLORS.BLACK)) {
        return [];
    }

    const pseudoMoves = getPseudoLegalMoves(row, col, board, state);
    return pseudoMoves.filter(move => {
        // Special case: Castling has extra rules
        if (move.castle) {
            if (isCheck(piece.color, board, state)) return false;
            // Check passing squares
            const r = move.from.row;
            const passingCol = move.castle.toLowerCase() === 'k' ? move.from.col + 1 : move.from.col - 1;
            const testBoard = board.map(row => [...row]);
            testBoard[r][passingCol] = testBoard[r][move.from.col];
            testBoard[r][move.from.col] = null;
            if (isCheck(piece.color, testBoard, state)) return false;
        }

        // Simulating the move
        const nextBoard = board.map(row => [...row]);
        nextBoard[move.to.row][move.to.col] = nextBoard[move.from.row][move.from.col];
        nextBoard[move.from.row][move.from.col] = null;
        
        // Handle en passant capture in simulation
        if (move.enPassant) {
            const captureRow = move.from.row;
            nextBoard[captureRow][move.to.col] = null;
        }

        return !isCheck(piece.color, nextBoard, state);
    });
};

/**
 * Applies a move to the board and calculates new state.
 */
const applyMove = (move, board, state) => {
    const nextBoard = board.map(row => [...row]);
    const piece = nextBoard[move.from.row][move.from.col];
    const nextState = {
        current_player: state.current_player,
        castling_rights: state.castling_rights ? { ...state.castling_rights } : { wK: true, wQ: true, bK: true, bQ: true },
        en_passant_target: state.en_passant_target ? { ...state.en_passant_target } : null,
        history: [...(state.history || [])]
    };
    nextState.en_passant_target = null; // Reset unless move is 2-square pawn jump

    // Standard move
    nextBoard[move.to.row][move.to.col] = piece;
    nextBoard[move.from.row][move.from.col] = null;

    // Pawn Special Logic
    if (piece.type === PIECES.PAWN) {
        // En Passant capture
        if (move.enPassant) {
            nextBoard[move.from.row][move.to.col] = null;
        }
        // En Passant target square creation
        if (Math.abs(move.to.row - move.from.row) === 2) {
            nextState.en_passant_target = {
                row: (move.from.row + move.to.row) / 2,
                col: move.from.col
            };
        }
        // Promotion (Auto-Queen for now, allow custom pieces in future)
        const lastRank = piece.color === COLORS.WHITE ? 0 : 7;
        if (move.to.row === lastRank) {
            nextBoard[move.to.row][move.to.col] = { type: move.promotion || PIECES.QUEEN, color: piece.color };
        }
    }

    // Castling Logic
    if (move.castle) {
        const row = piece.color === COLORS.WHITE ? 7 : 0;
        if (move.castle.toLowerCase() === 'k') {
            nextBoard[row][5] = nextBoard[row][7];
            nextBoard[row][7] = null;
        } else {
            nextBoard[row][3] = nextBoard[row][0];
            nextBoard[row][0] = null;
        }
    }

    // Update Castling Rights
    if (piece.type === PIECES.KING) {
        if (piece.color === COLORS.WHITE) { nextState.castling_rights.wK = false; nextState.castling_rights.wQ = false; }
        else { nextState.castling_rights.bK = false; nextState.castling_rights.bQ = false; }
    }
    if (piece.type === PIECES.ROOK) {
        if (move.from.row === 7 && move.from.col === 7) nextState.castling_rights.wK = false;
        if (move.from.row === 7 && move.from.col === 0) nextState.castling_rights.wQ = false;
        if (move.from.row === 0 && move.from.col === 7) nextState.castling_rights.bK = false;
        if (move.from.row === 0 && move.from.col === 0) nextState.castling_rights.bQ = false;
    }

    nextState.turn_start_time = new Date();
    
    return { nextBoard, nextState };
};

/**
 * Final Check for End Game
 */
const getGameResult = (board, state) => {
    const currentColor = state.current_player === 1 ? COLORS.WHITE : COLORS.BLACK;
    let hasLegalMoves = false;

    outer: for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (board[r][c]?.color === currentColor) {
                if (getLegalMoves(r, c, board, state).length > 0) {
                    hasLegalMoves = true;
                    break outer;
                }
            }
        }
    }

    if (!hasLegalMoves) {
        if (isCheck(currentColor, board, state)) {
            return { finished: true, winner: state.current_player === 1 ? 2 : 1, reason: 'checkmate' };
        } else {
            return { finished: true, winner: null, reason: 'stalemate' };
        }
    }

    // Draw by Insufficient Material (simplified)
    const pieces = board.flat().filter(p => p !== null);
    if (pieces.length === 2) return { finished: true, winner: null, reason: 'insufficient_material' };

    return { finished: false };
};

module.exports = {
    PIECES,
    COLORS,
    createInitialBoard,
    getLegalMoves,
    applyMove,
    getGameResult,
    isCheck
};
