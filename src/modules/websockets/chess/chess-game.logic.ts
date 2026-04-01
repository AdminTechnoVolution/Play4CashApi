/**
 * Chess Game Logic — TypeScript port of gameLogic.js
 * Follows Strategy Pattern for piece movement.
 */

export const PIECES = {
  PAWN: 'p', ROOK: 'r', KNIGHT: 'n', BISHOP: 'b', QUEEN: 'q', KING: 'k',
} as const;

export const COLORS = { WHITE: 'w', BLACK: 'b' } as const;

export type BoardCell = { type: string; color: string } | null;
export type Board = BoardCell[][];
export interface GameState {
  current_player: 1 | 2;
  castling_rights: { wK: boolean; wQ: boolean; bK: boolean; bQ: boolean };
  en_passant_target: { row: number; col: number } | null;
  history?: any[];
  turn_start_time?: Date;
}

export const createInitialBoard = (): Board => {
  const board: Board = Array(8).fill(null).map(() => Array(8).fill(null));
  const main = ['r','n','b','q','k','b','n','r'];
  for (let c = 0; c < 8; c++) {
    board[0][c] = { type: main[c], color: COLORS.BLACK };
    board[1][c] = { type: PIECES.PAWN, color: COLORS.BLACK };
    board[6][c] = { type: PIECES.PAWN, color: COLORS.WHITE };
    board[7][c] = { type: main[c], color: COLORS.WHITE };
  }
  return board;
};

const isOnBoard = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;

const getPseudoLegalMoves = (row: number, col: number, board: Board, state: GameState) => {
  const piece = board[row][col];
  if (!piece) return [];
  const moves: any[] = [];
  const color = piece.color;
  const opp = color === COLORS.WHITE ? COLORS.BLACK : COLORS.WHITE;

  const addMove = (r: number, c: number) => {
    if (!isOnBoard(r, c)) return false;
    const t = board[r][c];
    if (!t) { moves.push({ from: { row, col }, to: { row: r, col: c } }); return true; }
    if (t.color === opp) { moves.push({ from: { row, col }, to: { row: r, col: c } }); return false; }
    return false;
  };

  switch (piece.type) {
    case PIECES.PAWN: {
      const dir = color === COLORS.WHITE ? -1 : 1;
      const start = color === COLORS.WHITE ? 6 : 1;
      if (isOnBoard(row + dir, col) && !board[row + dir][col]) {
        moves.push({ from: { row, col }, to: { row: row + dir, col } });
        if (row === start && !board[row + 2 * dir][col])
          moves.push({ from: { row, col }, to: { row: row + 2 * dir, col } });
      }
      for (const dc of [-1, 1]) {
        const [tr, tc] = [row + dir, col + dc];
        if (isOnBoard(tr, tc)) {
          if (board[tr][tc]?.color === opp) moves.push({ from: { row, col }, to: { row: tr, col: tc } });
          if (state.en_passant_target?.row === tr && state.en_passant_target?.col === tc)
            moves.push({ from: { row, col }, to: { row: tr, col: tc }, enPassant: true });
        }
      }
      break;
    }
    case PIECES.ROOK: for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0]]) { let r=row+dr,c=col+dc; while(addMove(r,c)){r+=dr;c+=dc;} } break;
    case PIECES.KNIGHT: for (const [dr,dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) addMove(row+dr,col+dc); break;
    case PIECES.BISHOP: for (const [dr,dc] of [[1,1],[1,-1],[-1,1],[-1,-1]]) { let r=row+dr,c=col+dc; while(addMove(r,c)){r+=dr;c+=dc;} } break;
    case PIECES.QUEEN: for (const [dr,dc] of [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]) { let r=row+dr,c=col+dc; while(addMove(r,c)){r+=dr;c+=dc;} } break;
    case PIECES.KING: {
      for (const [dr,dc] of [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]) addMove(row+dr,col+dc);
      const r = state.castling_rights;
      if (color === COLORS.WHITE) {
        if (r.wK && !board[7][5] && !board[7][6]) moves.push({ from:{row,col}, to:{row:7,col:6}, castle:'K' });
        if (r.wQ && !board[7][1] && !board[7][2] && !board[7][3]) moves.push({ from:{row,col}, to:{row:7,col:2}, castle:'Q' });
      } else {
        if (r.bK && !board[0][5] && !board[0][6]) moves.push({ from:{row,col}, to:{row:0,col:6}, castle:'k' });
        if (r.bQ && !board[0][1] && !board[0][2] && !board[0][3]) moves.push({ from:{row,col}, to:{row:0,col:2}, castle:'q' });
      }
      break;
    }
  }
  return moves;
};

export const isCheck = (color: string, board: Board, state: GameState): boolean => {
  let kingPos: {row:number;col:number} | null = null;
  for (let r = 0; r < 8 && !kingPos; r++)
    for (let c = 0; c < 8; c++)
      if (board[r][c]?.type === PIECES.KING && board[r][c]?.color === color) { kingPos = {row:r,col:c}; break; }
  if (!kingPos) return false;
  const opp = color === COLORS.WHITE ? COLORS.BLACK : COLORS.WHITE;
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (board[r][c]?.color === opp)
        if (getPseudoLegalMoves(r, c, board, state).some((m: any) => m.to.row === kingPos!.row && m.to.col === kingPos!.col)) return true;
  return false;
};

export const getLegalMoves = (row: number, col: number, board: Board, state: GameState) => {
  const piece = board[row][col];
  if (!piece) return [];
  if (state.current_player === 1 && piece.color !== COLORS.WHITE) return [];
  if (state.current_player === 2 && piece.color !== COLORS.BLACK) return [];
  return getPseudoLegalMoves(row, col, board, state).filter((move: any) => {
    if (move.castle) {
      if (isCheck(piece.color, board, state)) return false;
      const passCol = move.castle.toLowerCase() === 'k' ? move.from.col + 1 : move.from.col - 1;
      const t = board.map(r => [...r]);
      t[move.from.row][passCol] = t[move.from.row][move.from.col]; t[move.from.row][move.from.col] = null;
      if (isCheck(piece.color, t as Board, state)) return false;
    }
    const next = board.map(r => [...r]) as Board;
    next[move.to.row][move.to.col] = next[move.from.row][move.from.col];
    next[move.from.row][move.from.col] = null;
    if (move.enPassant) next[move.from.row][move.to.col] = null;
    return !isCheck(piece.color, next, state);
  });
};

export const applyMove = (move: any, board: Board, state: GameState): { nextBoard: Board; nextState: GameState } => {
  const nextBoard = board.map(r => [...r]) as Board;
  const piece = nextBoard[move.from.row][move.from.col]!;
  const nextState: GameState = {
    current_player: state.current_player,
    castling_rights: { ...state.castling_rights },
    en_passant_target: null,
    history: [...(state.history || [])],
  };

  nextBoard[move.to.row][move.to.col] = piece;
  nextBoard[move.from.row][move.from.col] = null;

  if (piece.type === PIECES.PAWN) {
    if (move.enPassant) nextBoard[move.from.row][move.to.col] = null;
    if (Math.abs(move.to.row - move.from.row) === 2) nextState.en_passant_target = { row: (move.from.row+move.to.row)/2, col: move.from.col };
    const lastRank = piece.color === COLORS.WHITE ? 0 : 7;
    if (move.to.row === lastRank) nextBoard[move.to.row][move.to.col] = { type: move.promotion || PIECES.QUEEN, color: piece.color };
  }
  if (move.castle) {
    const r = piece.color === COLORS.WHITE ? 7 : 0;
    if (move.castle.toLowerCase() === 'k') { nextBoard[r][5] = nextBoard[r][7]; nextBoard[r][7] = null; }
    else { nextBoard[r][3] = nextBoard[r][0]; nextBoard[r][0] = null; }
  }
  if (piece.type === PIECES.KING) {
    if (piece.color === COLORS.WHITE) { nextState.castling_rights.wK = false; nextState.castling_rights.wQ = false; }
    else { nextState.castling_rights.bK = false; nextState.castling_rights.bQ = false; }
  }
  if (piece.type === PIECES.ROOK) {
    if (move.from.row===7&&move.from.col===7) nextState.castling_rights.wK = false;
    if (move.from.row===7&&move.from.col===0) nextState.castling_rights.wQ = false;
    if (move.from.row===0&&move.from.col===7) nextState.castling_rights.bK = false;
    if (move.from.row===0&&move.from.col===0) nextState.castling_rights.bQ = false;
  }
  nextState.turn_start_time = new Date();
  return { nextBoard, nextState };
};

export const getGameResult = (board: Board, state: GameState): { finished: boolean; winner?: number | null; reason?: string } => {
  const color = state.current_player === 1 ? COLORS.WHITE : COLORS.BLACK;
  let hasLegal = false;
  outer: for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (board[r][c]?.color === color && getLegalMoves(r,c,board,state).length > 0) { hasLegal = true; break outer; }
  if (!hasLegal) {
    if (isCheck(color, board, state)) return { finished: true, winner: state.current_player === 1 ? 2 : 1, reason: 'checkmate' };
    return { finished: true, winner: null, reason: 'stalemate' };
  }
  if (board.flat().filter(p => p !== null).length === 2) return { finished: true, winner: null, reason: 'insufficient_material' };
  return { finished: false };
};
