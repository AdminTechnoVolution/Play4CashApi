"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isCastlingLegal = exports.getGameResult = exports.applyMove = exports.getLegalMoves = exports.isCheck = exports.createInitialBoard = exports.COLORS = exports.PIECES = void 0;
exports.PIECES = {
    PAWN: 'p', ROOK: 'r', KNIGHT: 'n', BISHOP: 'b', QUEEN: 'q', KING: 'k',
};
exports.COLORS = { WHITE: 'w', BLACK: 'b' };
const createInitialBoard = () => {
    const board = Array(8).fill(null).map(() => Array(8).fill(null));
    const main = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    for (let c = 0; c < 8; c++) {
        board[0][c] = { type: main[c], color: exports.COLORS.BLACK };
        board[1][c] = { type: exports.PIECES.PAWN, color: exports.COLORS.BLACK };
        board[6][c] = { type: exports.PIECES.PAWN, color: exports.COLORS.WHITE };
        board[7][c] = { type: main[c], color: exports.COLORS.WHITE };
    }
    return board;
};
exports.createInitialBoard = createInitialBoard;
const isOnBoard = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const getPseudoLegalMoves = (row, col, board, state) => {
    const piece = board[row][col];
    if (!piece)
        return [];
    const moves = [];
    const color = piece.color;
    const opp = color === exports.COLORS.WHITE ? exports.COLORS.BLACK : exports.COLORS.WHITE;
    const addMove = (r, c) => {
        if (!isOnBoard(r, c))
            return false;
        const t = board[r][c];
        if (!t) {
            moves.push({ from: { row, col }, to: { row: r, col: c } });
            return true;
        }
        if (t.color === opp) {
            moves.push({ from: { row, col }, to: { row: r, col: c } });
            return false;
        }
        return false;
    };
    switch (piece.type) {
        case exports.PIECES.PAWN: {
            const dir = color === exports.COLORS.WHITE ? -1 : 1;
            const start = color === exports.COLORS.WHITE ? 6 : 1;
            if (isOnBoard(row + dir, col) && !board[row + dir][col]) {
                moves.push({ from: { row, col }, to: { row: row + dir, col } });
                if (row === start && !board[row + 2 * dir][col])
                    moves.push({ from: { row, col }, to: { row: row + 2 * dir, col } });
            }
            for (const dc of [-1, 1]) {
                const [tr, tc] = [row + dir, col + dc];
                if (isOnBoard(tr, tc)) {
                    if (board[tr][tc]?.color === opp)
                        moves.push({ from: { row, col }, to: { row: tr, col: tc } });
                    if (state.en_passant_target?.row === tr && state.en_passant_target?.col === tc)
                        moves.push({ from: { row, col }, to: { row: tr, col: tc }, enPassant: true });
                }
            }
            break;
        }
        case exports.PIECES.ROOK:
            for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
                let r = row + dr, c = col + dc;
                while (addMove(r, c)) {
                    r += dr;
                    c += dc;
                }
            }
            break;
        case exports.PIECES.KNIGHT:
            for (const [dr, dc] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]])
                addMove(row + dr, col + dc);
            break;
        case exports.PIECES.BISHOP:
            for (const [dr, dc] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
                let r = row + dr, c = col + dc;
                while (addMove(r, c)) {
                    r += dr;
                    c += dc;
                }
            }
            break;
        case exports.PIECES.QUEEN:
            for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
                let r = row + dr, c = col + dc;
                while (addMove(r, c)) {
                    r += dr;
                    c += dc;
                }
            }
            break;
        case exports.PIECES.KING: {
            for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]])
                addMove(row + dr, col + dc);
            const r = state.castling_rights;
            if (color === exports.COLORS.WHITE) {
                if (r.wK && !board[7][5] && !board[7][6] && board[7][7]?.type === exports.PIECES.ROOK && board[7][7]?.color === exports.COLORS.WHITE)
                    moves.push({ from: { row, col }, to: { row: 7, col: 6 }, castle: 'K' });
                if (r.wQ && !board[7][1] && !board[7][2] && !board[7][3] && board[7][0]?.type === exports.PIECES.ROOK && board[7][0]?.color === exports.COLORS.WHITE)
                    moves.push({ from: { row, col }, to: { row: 7, col: 2 }, castle: 'Q' });
            }
            else {
                if (r.bK && !board[0][5] && !board[0][6] && board[0][7]?.type === exports.PIECES.ROOK && board[0][7]?.color === exports.COLORS.BLACK)
                    moves.push({ from: { row, col }, to: { row: 0, col: 6 }, castle: 'k' });
                if (r.bQ && !board[0][1] && !board[0][2] && !board[0][3] && board[0][0]?.type === exports.PIECES.ROOK && board[0][0]?.color === exports.COLORS.BLACK)
                    moves.push({ from: { row, col }, to: { row: 0, col: 2 }, castle: 'q' });
            }
            break;
        }
    }
    return moves;
};
const isCheck = (color, board, state) => {
    let kingPos = null;
    for (let r = 0; r < 8 && !kingPos; r++)
        for (let c = 0; c < 8; c++)
            if (board[r][c]?.type === exports.PIECES.KING && board[r][c]?.color === color) {
                kingPos = { row: r, col: c };
                break;
            }
    if (!kingPos)
        return false;
    const opp = color === exports.COLORS.WHITE ? exports.COLORS.BLACK : exports.COLORS.WHITE;
    for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++)
            if (board[r][c]?.color === opp)
                if (getPseudoLegalMoves(r, c, board, state).some((m) => m.to.row === kingPos.row && m.to.col === kingPos.col))
                    return true;
    return false;
};
exports.isCheck = isCheck;
const getLegalMoves = (row, col, board, state) => {
    const piece = board[row][col];
    if (!piece)
        return [];
    if (state.current_player === 1 && piece.color !== exports.COLORS.WHITE)
        return [];
    if (state.current_player === 2 && piece.color !== exports.COLORS.BLACK)
        return [];
    return getPseudoLegalMoves(row, col, board, state).filter((move) => {
        if (move.castle) {
            if ((0, exports.isCheck)(piece.color, board, state))
                return false;
            const passCol = move.castle.toLowerCase() === 'k' ? move.from.col + 1 : move.from.col - 1;
            const t = board.map(r => [...r]);
            t[move.from.row][passCol] = t[move.from.row][move.from.col];
            t[move.from.row][move.from.col] = null;
            if ((0, exports.isCheck)(piece.color, t, state))
                return false;
        }
        const next = board.map(r => [...r]);
        next[move.to.row][move.to.col] = next[move.from.row][move.from.col];
        next[move.from.row][move.from.col] = null;
        if (move.enPassant)
            next[move.from.row][move.to.col] = null;
        return !(0, exports.isCheck)(piece.color, next, state);
    });
};
exports.getLegalMoves = getLegalMoves;
const applyMove = (move, board, state) => {
    const nextBoard = board.map(r => [...r]);
    const piece = nextBoard[move.from.row][move.from.col];
    const nextState = {
        current_player: state.current_player === 1 ? 2 : 1,
        castling_rights: { ...state.castling_rights },
        en_passant_target: null,
        history: [...(state.history || [])],
    };
    nextBoard[move.to.row][move.to.col] = piece;
    nextBoard[move.from.row][move.from.col] = null;
    if (piece.type === exports.PIECES.PAWN) {
        if (move.enPassant)
            nextBoard[move.from.row][move.to.col] = null;
        if (Math.abs(move.to.row - move.from.row) === 2)
            nextState.en_passant_target = { row: (move.from.row + move.to.row) / 2, col: move.from.col };
        const lastRank = piece.color === exports.COLORS.WHITE ? 0 : 7;
        if (move.to.row === lastRank)
            nextBoard[move.to.row][move.to.col] = { type: move.promotion || exports.PIECES.QUEEN, color: piece.color };
    }
    if (move.castle) {
        const r = piece.color === exports.COLORS.WHITE ? 7 : 0;
        if (move.castle.toLowerCase() === 'k') {
            nextBoard[r][5] = nextBoard[r][7];
            nextBoard[r][7] = null;
        }
        else {
            nextBoard[r][3] = nextBoard[r][0];
            nextBoard[r][0] = null;
        }
    }
    if (piece.type === exports.PIECES.KING) {
        if (piece.color === exports.COLORS.WHITE) {
            nextState.castling_rights.wK = false;
            nextState.castling_rights.wQ = false;
        }
        else {
            nextState.castling_rights.bK = false;
            nextState.castling_rights.bQ = false;
        }
    }
    if (piece.type === exports.PIECES.ROOK) {
        if (move.from.row === 7 && move.from.col === 7)
            nextState.castling_rights.wK = false;
        if (move.from.row === 7 && move.from.col === 0)
            nextState.castling_rights.wQ = false;
        if (move.from.row === 0 && move.from.col === 7)
            nextState.castling_rights.bK = false;
        if (move.from.row === 0 && move.from.col === 0)
            nextState.castling_rights.bQ = false;
    }
    nextState.turn_start_time = new Date();
    return { nextBoard, nextState };
};
exports.applyMove = applyMove;
const getGameResult = (board, state) => {
    const color = state.current_player === 1 ? exports.COLORS.WHITE : exports.COLORS.BLACK;
    let hasLegal = false;
    outer: for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++)
            if (board[r][c]?.color === color && (0, exports.getLegalMoves)(r, c, board, state).length > 0) {
                hasLegal = true;
                break outer;
            }
    if (!hasLegal) {
        if ((0, exports.isCheck)(color, board, state))
            return { finished: true, winner: state.current_player === 1 ? 2 : 1, reason: 'checkmate' };
        return { finished: true, winner: null, reason: 'stalemate' };
    }
    if (board.flat().filter(p => p !== null).length === 2)
        return { finished: true, winner: null, reason: 'insufficient_material' };
    return { finished: false };
};
exports.getGameResult = getGameResult;
const isCastlingLegal = (board, state, castlingSide) => {
    const color = state.current_player === 1 ? exports.COLORS.WHITE : exports.COLORS.BLACK;
    const rank = color === exports.COLORS.WHITE ? 7 : 0;
    const king = board[rank][4];
    if (!king || king.type !== exports.PIECES.KING || king.color !== color) {
        return { legal: false, reason: 'King is not on its starting square' };
    }
    const rightsKey = `${color === exports.COLORS.WHITE ? 'w' : 'b'}${castlingSide}`;
    if (!state.castling_rights[rightsKey]) {
        return { legal: false, reason: 'King or rook has already moved' };
    }
    const rookCol = castlingSide === 'K' ? 7 : 0;
    const rook = board[rank][rookCol];
    if (!rook || rook.type !== exports.PIECES.ROOK || rook.color !== color) {
        return { legal: false, reason: 'Rook is not present on its starting square' };
    }
    const [startCol, endCol] = castlingSide === 'K' ? [5, 6] : [1, 3];
    for (let c = startCol; c <= endCol; c++) {
        if (board[rank][c] !== null) {
            return { legal: false, reason: 'There are pieces between the king and the rook' };
        }
    }
    if ((0, exports.isCheck)(color, board, state)) {
        return { legal: false, reason: 'Cannot castle while in check' };
    }
    const passThroughCol = castlingSide === 'K' ? 5 : 3;
    const transitBoard = board.map(r => [...r]);
    transitBoard[rank][passThroughCol] = transitBoard[rank][4];
    transitBoard[rank][4] = null;
    if ((0, exports.isCheck)(color, transitBoard, state)) {
        return { legal: false, reason: 'King would pass through a square under attack' };
    }
    const destCol = castlingSide === 'K' ? 6 : 2;
    const destBoard = board.map(r => [...r]);
    destBoard[rank][destCol] = destBoard[rank][4];
    destBoard[rank][4] = null;
    if ((0, exports.isCheck)(color, destBoard, state)) {
        return { legal: false, reason: 'King would end on a square under attack' };
    }
    return { legal: true };
};
exports.isCastlingLegal = isCastlingLegal;
//# sourceMappingURL=chess-game.logic.js.map