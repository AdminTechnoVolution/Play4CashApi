export type Tile = [number, number];
export interface OpenEnds {
    left?: number;
    right?: number;
}
export declare const deal: (playerIds: string[]) => {
    hands: Map<string, Tile[]>;
    boneyard: Tile[];
};
export declare const getStartingPlayerIndex: (playerIds: string[], hands: Map<string, Tile[]>) => number;
export declare const canPlayTile: (tile: Tile, openEnds: OpenEnds) => boolean;
export declare const hasValidMoves: (hand: Tile[], openEnds: OpenEnds) => boolean;
export declare const validateMove: (tile: Tile, side: "left" | "right", openEnds: OpenEnds) => {
    valid: boolean;
    flippedTile: Tile;
    side: string;
};
export declare const calculateHandScore: (hand: Tile[]) => number;
export declare const getNextActivePlayerIndex: (currentIndex: number, playerIds: string[], eliminatedPlayers: string[]) => number;
export declare const getDominoGameResult: (hands: Map<string, Tile[]>, consecutive_passes: number, playerIds: string[], eliminatedPlayers?: string[]) => {
    finished: boolean;
    winner?: string | null;
    reason?: string;
};
