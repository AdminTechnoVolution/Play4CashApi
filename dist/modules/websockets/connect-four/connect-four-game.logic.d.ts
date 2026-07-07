export type ConnectFourColor = 'R' | 'Y';
export type ConnectFourCell = null | ConnectFourColor;
export type ConnectFourBoard = ConnectFourCell[][];
export interface ConnectFourWinResult {
    won: boolean;
    winningCells: Array<{
        row: number;
        col: number;
    }>;
}
export interface DropDiscResult {
    ok: true;
    row: number;
    col: number;
    board: ConnectFourBoard;
    win: ConnectFourWinResult;
    isDraw: boolean;
}
export interface DropDiscError {
    ok: false;
    reason: 'invalid_column' | 'column_full' | 'out_of_bounds';
}
export declare function createEmptyBoard(): ConnectFourBoard;
export declare function coerceConnectFourBoard(raw: unknown): ConnectFourBoard;
export declare function isColumnInBounds(col: number): boolean;
export declare function findDropRow(board: ConnectFourBoard, col: number): number;
export declare function isBoardFull(board: ConnectFourBoard): boolean;
export declare function checkWinFromCell(board: ConnectFourBoard, row: number, col: number, color: ConnectFourColor): ConnectFourWinResult;
export declare function dropDisc(board: ConnectFourBoard, col: number, color: ConnectFourColor): DropDiscResult | DropDiscError;
export declare function colorForPlayerNum(playerNum: 1 | 2): ConnectFourColor;
export declare function playerNumForColor(color: ConnectFourColor): 1 | 2;
