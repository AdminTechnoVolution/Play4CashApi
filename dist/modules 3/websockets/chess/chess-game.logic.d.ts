export declare const PIECES: {
    readonly PAWN: "p";
    readonly ROOK: "r";
    readonly KNIGHT: "n";
    readonly BISHOP: "b";
    readonly QUEEN: "q";
    readonly KING: "k";
};
export declare const COLORS: {
    readonly WHITE: "w";
    readonly BLACK: "b";
};
export type BoardCell = {
    type: string;
    color: string;
} | null;
export type Board = BoardCell[][];
export interface GameState {
    current_player: 1 | 2;
    castling_rights: {
        wK: boolean;
        wQ: boolean;
        bK: boolean;
        bQ: boolean;
    };
    en_passant_target: {
        row: number;
        col: number;
    } | null;
    history?: any[];
    turn_start_time?: Date;
}
export declare const createInitialBoard: () => Board;
export declare const isCheck: (color: string, board: Board, state: GameState) => boolean;
export declare const getLegalMoves: (row: number, col: number, board: Board, state: GameState) => any[];
export declare const applyMove: (move: any, board: Board, state: GameState) => {
    nextBoard: Board;
    nextState: GameState;
};
export declare const getGameResult: (board: Board, state: GameState) => {
    finished: boolean;
    winner?: number | null;
    reason?: string;
};
export declare const isCastlingLegal: (board: Board, state: GameState, castlingSide: "K" | "Q") => {
    legal: boolean;
    reason?: string;
};
