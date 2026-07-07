declare const COLORS: readonly ["R", "G", "B", "Y"];
export type UnoColor = (typeof COLORS)[number];
export declare function buildUnoDeck(): string[];
export declare function shuffleUnoDeck(deck: string[]): string[];
export declare function isColoredNumberCard(card: string): boolean;
export declare function cardScoreValue(card: string): number;
export declare function sumHandScore(hand: string[]): number;
export interface UnoDealResult {
    hands: Record<string, string[]>;
    drawPile: string[];
    discardPile: string[];
    currentColor: UnoColor;
}
export declare function dealUnoInitialState(playerIds: string[]): UnoDealResult;
export declare function getNextUnoPlayerIndex(currentIndex: number, playerIds: string[], eliminatedPlayers: string[], direction: 1 | -1): number;
export declare function activePlayerCount(playerIds: string[], eliminatedPlayers: string[]): number;
export declare function isWild(card: string): boolean;
export declare function isWildDrawFour(card: string): boolean;
export declare function isColoredDrawTwo(card: string): boolean;
export declare function isDrawStackResponderCard(card: string): boolean;
export declare function isSkipCard(card: string): boolean;
export declare function isReverseCard(card: string): boolean;
export declare function isNumberCard(card: string): boolean;
export declare function colorOfColoredCard(card: string): UnoColor | null;
export declare function numberDigit(card: string): string | null;
export declare function handHasColor(hand: string[], currentColor: UnoColor): boolean;
export declare function canPlayCardOnDiscard(playCard: string, topDiscard: string, currentColor: UnoColor): boolean;
export type ShuffleFn = (cards: string[]) => string[];
export declare function reshuffleDiscardIntoDraw(drawPile: string[], discardPile: string[], shuffleFn?: ShuffleFn): {
    drawPile: string[];
    discardPile: string[];
};
export declare function drawNCards(drawPile: string[], discardPile: string[], n: number, shuffleFn?: ShuffleFn): {
    drawn: string[];
    drawPile: string[];
    discardPile: string[];
};
export interface UnoEngineState {
    playerIds: string[];
    hands: Record<string, string[]>;
    drawPile: string[];
    discardPile: string[];
    currentPlayerIndex: number;
    direction: 1 | -1;
    currentColor: UnoColor;
    drawStackPending: number;
    eliminatedPlayers: string[];
    unoCalled: string[];
    pendingUnoOffender: string | null;
    lastActionPlayerId: string | null;
}
export declare function cloneEngineState(s: UnoEngineState): UnoEngineState;
export declare function topDiscard(state: UnoEngineState): string;
export type PlayUnoOptions = {
    chosenColor?: UnoColor;
    callUno?: boolean;
};
export declare function validatePlay(state: UnoEngineState, playerId: string, cardIndex: number, options?: PlayUnoOptions): {
    ok: true;
} | {
    ok: false;
    reason: string;
};
export declare function applyPlay(state: UnoEngineState, playerId: string, cardIndex: number, options?: PlayUnoOptions): {
    state: UnoEngineState;
    winnerId?: string;
};
export declare function validateTakeDrawStack(state: UnoEngineState, playerId: string): {
    ok: true;
} | {
    ok: false;
    reason: string;
};
export declare function applyTakeDrawStack(state: UnoEngineState, playerId: string, shuffleFn?: ShuffleFn): {
    state: UnoEngineState;
};
export declare function hasLegalPlay(state: UnoEngineState, playerId: string): boolean;
export declare function applyDrawOne(state: UnoEngineState, playerId: string, shuffleFn?: ShuffleFn): {
    state: UnoEngineState;
};
export declare function validatePassTurn(state: UnoEngineState, playerId: string): {
    ok: true;
} | {
    ok: false;
    reason: string;
};
export declare function applyPassTurn(state: UnoEngineState, playerId: string, shuffleFn?: ShuffleFn): UnoEngineState;
export declare function applyCallUno(state: UnoEngineState, playerId: string): UnoEngineState;
export declare function applyChallengeUnoMiss(state: UnoEngineState, accuserId: string, accusedId: string, shuffleFn?: ShuffleFn): {
    state: UnoEngineState;
    success: boolean;
};
export declare function engineStateFromDeal(playerIds: string[], deal: UnoDealResult): UnoEngineState;
export {};
