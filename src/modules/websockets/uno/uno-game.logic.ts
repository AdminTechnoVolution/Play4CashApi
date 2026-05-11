import { randomInt } from 'crypto';

const COLORS = ['R', 'G', 'B', 'Y'] as const;
export type UnoColor = (typeof COLORS)[number];

/** Standard 108-card UNO deck (compact ids, e.g. R5, RDraw2, W, W4). */
export function buildUnoDeck(): string[] {
  const deck: string[] = [];
  for (const c of COLORS) {
    deck.push(`${c}0`);
    for (let n = 1; n <= 9; n++) {
      deck.push(`${c}${n}`, `${c}${n}`);
    }
    deck.push(`${c}Skip`, `${c}Skip`, `${c}Reverse`, `${c}Reverse`, `${c}Draw2`, `${c}Draw2`);
  }
  for (let i = 0; i < 4; i++) {
    deck.push('W', 'W4');
  }
  return deck;
}

export function shuffleUnoDeck(deck: string[]): string[] {
  const a = [...deck];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Opening card must be a colored number (not wild / action). */
export function isColoredNumberCard(card: string): boolean {
  return /^[RGBY][0-9]$/.test(card);
}

export interface UnoDealResult {
  hands: Record<string, string[]>;
  drawPile: string[];
  discardPile: string[];
  currentColor: UnoColor;
}

/**
 * Deal 7 cards each, flip first valid starter onto discard.
 * drawPile[0] is the next card to draw (shift).
 */
export function dealUnoInitialState(playerIds: string[]): UnoDealResult {
  const shuffled = shuffleUnoDeck(buildUnoDeck());
  const hands: Record<string, string[]> = Object.fromEntries(playerIds.map((id) => [id, []]));

  for (let r = 0; r < 7; r++) {
    for (const id of playerIds) {
      const c = shuffled.shift();
      if (!c) throw new Error('UNO deal: deck underrun');
      hands[id].push(c);
    }
  }

  const drawPile = shuffled;
  const discardPile: string[] = [];

  while (drawPile.length > 0) {
    const c = drawPile.shift()!;
    if (isColoredNumberCard(c)) {
      discardPile.push(c);
      break;
    }
    drawPile.push(c);
  }

  if (discardPile.length === 0) {
    throw new Error('UNO deal: could not open discard');
  }

  const top = discardPile[discardPile.length - 1];
  const currentColor = top[0] as UnoColor;

  return { hands, drawPile, discardPile, currentColor };
}

export function getNextUnoPlayerIndex(
  currentIndex: number,
  playerIds: string[],
  eliminatedPlayers: string[],
  direction: 1 | -1,
): number {
  const n = playerIds.length;
  let idx = currentIndex;
  for (let s = 0; s < n; s++) {
    idx = (idx + direction + n) % n;
    const pid = playerIds[idx];
    if (!eliminatedPlayers.includes(pid)) return idx;
  }
  return currentIndex;
}

export function activePlayerCount(playerIds: string[], eliminatedPlayers: string[]): number {
  return playerIds.filter((id) => !eliminatedPlayers.includes(id)).length;
}

// ── Card classification ─────────────────────────────────────────────────────

export function isWild(card: string): boolean {
  return card === 'W' || card === 'W4';
}

export function isWildDrawFour(card: string): boolean {
  return card === 'W4';
}

export function isColoredDrawTwo(card: string): boolean {
  return /^[RGBY]Draw2$/.test(card);
}

/** +2 any color or W4 — valid response while a draw stack is pending. */
export function isDrawStackResponderCard(card: string): boolean {
  return isColoredDrawTwo(card) || isWildDrawFour(card);
}

export function isSkipCard(card: string): boolean {
  return /^[RGBY]Skip$/.test(card);
}

export function isReverseCard(card: string): boolean {
  return /^[RGBY]Reverse$/.test(card);
}

export function isNumberCard(card: string): boolean {
  return /^[RGBY][0-9]$/.test(card);
}

export function colorOfColoredCard(card: string): UnoColor | null {
  if (/^[RGBY]/.test(card)) return card[0] as UnoColor;
  return null;
}

export function numberDigit(card: string): string | null {
  if (isNumberCard(card)) return card[1];
  return null;
}

/**
 * True if the hand contains any colored card whose color matches `currentColor`
 * (wilds W/W4 do not count as holding that color).
 */
export function handHasColor(hand: string[], currentColor: UnoColor): boolean {
  return hand.some((c) => {
    const col = colorOfColoredCard(c);
    return col !== null && col === currentColor;
  });
}

/**
 * Match against top discard for normal play (no pending draw stack).
 * `currentColor` is the active color (after a wild, the declared color).
 */
export function canPlayCardOnDiscard(
  playCard: string,
  topDiscard: string,
  currentColor: UnoColor,
): boolean {
  if (isWild(playCard)) return true;

  if (isWild(topDiscard) || isWildDrawFour(topDiscard)) {
    const pc = colorOfColoredCard(playCard);
    return pc === currentColor;
  }

  if (isNumberCard(topDiscard)) {
    const d = numberDigit(topDiscard);
    if (isNumberCard(playCard) && numberDigit(playCard) === d) return true;
    const pc = colorOfColoredCard(playCard);
    return pc === currentColor;
  }

  if (isSkipCard(topDiscard)) {
    if (isSkipCard(playCard)) return true;
    const pc = colorOfColoredCard(playCard);
    return pc === currentColor;
  }

  if (isReverseCard(topDiscard)) {
    if (isReverseCard(playCard)) return true;
    const pc = colorOfColoredCard(playCard);
    return pc === currentColor;
  }

  if (isColoredDrawTwo(topDiscard)) {
    if (isColoredDrawTwo(playCard)) return true;
    const pc = colorOfColoredCard(playCard);
    return pc === currentColor;
  }

  return false;
}

// ── Draw pile / reshuffle ───────────────────────────────────────────────────

export type ShuffleFn = (cards: string[]) => string[];

/**
 * Move all discard except the top card into draw pile (shuffled), then prepend to draw.
 * drawPile[0] is drawn first (shift).
 */
export function reshuffleDiscardIntoDraw(
  drawPile: string[],
  discardPile: string[],
  shuffleFn: ShuffleFn = shuffleUnoDeck,
): { drawPile: string[]; discardPile: string[] } {
  if (discardPile.length < 2) {
    return { drawPile: [...drawPile], discardPile: [...discardPile] };
  }
  const top = discardPile[discardPile.length - 1];
  const rest = discardPile.slice(0, -1);
  const shuffled = shuffleFn(rest);
  return {
    drawPile: [...shuffled, ...drawPile],
    discardPile: [top],
  };
}

/**
 * Draw up to `n` cards, reshuffling discard into draw when draw is empty (keeping top discard).
 */
export function drawNCards(
  drawPile: string[],
  discardPile: string[],
  n: number,
  shuffleFn: ShuffleFn = shuffleUnoDeck,
): { drawn: string[]; drawPile: string[]; discardPile: string[] } {
  const drawn: string[] = [];
  let draw = [...drawPile];
  let disc = [...discardPile];

  while (drawn.length < n) {
    if (draw.length === 0) {
      const r = reshuffleDiscardIntoDraw(draw, disc, shuffleFn);
      draw = r.drawPile;
      disc = r.discardPile;
      if (draw.length === 0) break;
    }
    const c = draw.shift()!;
    drawn.push(c);
  }

  return { drawn, drawPile: draw, discardPile: disc };
}

// ── Engine state (plain object, immutable updates) ──────────────────────────

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
}

export function cloneEngineState(s: UnoEngineState): UnoEngineState {
  return {
    playerIds: [...s.playerIds],
    hands: Object.fromEntries(Object.entries(s.hands).map(([k, v]) => [k, [...v]])),
    drawPile: [...s.drawPile],
    discardPile: [...s.discardPile],
    currentPlayerIndex: s.currentPlayerIndex,
    direction: s.direction,
    currentColor: s.currentColor,
    drawStackPending: s.drawStackPending,
    eliminatedPlayers: [...s.eliminatedPlayers],
  };
}

export function topDiscard(state: UnoEngineState): string {
  const d = state.discardPile;
  return d[d.length - 1];
}

function currentPlayerId(state: UnoEngineState): string {
  return state.playerIds[state.currentPlayerIndex];
}

function assertCurrentPlayer(state: UnoEngineState, playerId: string): void {
  if (currentPlayerId(state) !== playerId) {
    throw new Error('NOT_YOUR_TURN');
  }
}

export type PlayUnoOptions = { chosenColor?: UnoColor };

export function validatePlay(
  state: UnoEngineState,
  playerId: string,
  cardIndex: number,
  options: PlayUnoOptions = {},
): { ok: true } | { ok: false; reason: string } {
  try {
    assertCurrentPlayer(state, playerId);
  } catch {
    return { ok: false, reason: 'NOT_YOUR_TURN' };
  }

  if (state.eliminatedPlayers.includes(playerId)) {
    return { ok: false, reason: 'ELIMINATED' };
  }

  const hand = state.hands[playerId];
  if (!hand || cardIndex < 0 || cardIndex >= hand.length) {
    return { ok: false, reason: 'INVALID_CARD_INDEX' };
  }

  const card = hand[cardIndex];
  const top = topDiscard(state);
  const pending = state.drawStackPending;

  if (pending > 0) {
    if (!isDrawStackResponderCard(card)) {
      return { ok: false, reason: 'MUST_RESPOND_DRAW_STACK' };
    }
  } else {
    if (!canPlayCardOnDiscard(card, top, state.currentColor)) {
      return { ok: false, reason: 'NO_MATCH' };
    }
    if (isWildDrawFour(card) && handHasColor(hand, state.currentColor)) {
      return { ok: false, reason: 'WILD4_ILLEGAL_HAS_COLOR' };
    }
  }

  if ((card === 'W' || card === 'W4') && !options.chosenColor) {
    return { ok: false, reason: 'CHOSEN_COLOR_REQUIRED' };
  }

  return { ok: true };
}

/**
 * Apply a validated play. Returns new state and optional winner if hand emptied.
 */
export function applyPlay(
  state: UnoEngineState,
  playerId: string,
  cardIndex: number,
  options: PlayUnoOptions = {},
): { state: UnoEngineState; winnerId?: string } {
  const v = validatePlay(state, playerId, cardIndex, options);
  if (!v.ok) throw new Error(v.reason);

  const next = cloneEngineState(state);
  const hand = [...next.hands[playerId]];
  const [card] = hand.splice(cardIndex, 1);
  next.hands[playerId] = hand;
  next.discardPile = [...next.discardPile, card];

  let newColor: UnoColor = next.currentColor;
  if (card === 'W' || card === 'W4') {
    newColor = options.chosenColor!;
  } else {
    const col = colorOfColoredCard(card);
    if (col) newColor = col;
  }
  next.currentColor = newColor;

  const pending = next.drawStackPending;
  if (pending > 0) {
    if (isColoredDrawTwo(card)) next.drawStackPending = pending + 2;
    else if (isWildDrawFour(card)) next.drawStackPending = pending + 4;
  } else {
    if (isColoredDrawTwo(card)) next.drawStackPending = 2;
    else if (isWildDrawFour(card)) next.drawStackPending = 4;
    else next.drawStackPending = 0;
  }

  const active = activePlayerCount(next.playerIds, next.eliminatedPlayers);

  if (hand.length === 0) {
    return { state: next, winnerId: playerId };
  }

  const stackJustGrew = isColoredDrawTwo(card) || isWildDrawFour(card);
  if (stackJustGrew && next.drawStackPending > 0) {
    advanceTurnAfterCard(next);
    return { state: next };
  }

  if (isSkipCard(card)) {
    advanceSkip(next, active);
    return { state: next };
  }

  if (isReverseCard(card)) {
    next.direction = (next.direction === 1 ? -1 : 1) as 1 | -1;
    if (active === 2) {
      /* same player plays again */
    } else {
      next.currentPlayerIndex = getNextUnoPlayerIndex(
        next.currentPlayerIndex,
        next.playerIds,
        next.eliminatedPlayers,
        next.direction,
      );
    }
    return { state: next };
  }

  advanceTurnNormal(next);
  return { state: next };
}

function advanceTurnNormal(state: UnoEngineState): void {
  state.currentPlayerIndex = getNextUnoPlayerIndex(
    state.currentPlayerIndex,
    state.playerIds,
    state.eliminatedPlayers,
    state.direction,
  );
}

/** After Skip: skip one active player. */
function advanceSkip(state: UnoEngineState, activeCount: number): void {
  if (activeCount === 2) {
    return;
  }
  advanceTurnNormal(state);
  advanceTurnNormal(state);
}

/**
 * After +2 / +4 that adds to stack, move to next player (they must respond or take cards).
 */
function advanceTurnAfterCard(state: UnoEngineState): void {
  advanceTurnNormal(state);
}

export function validateTakeDrawStack(state: UnoEngineState, playerId: string): { ok: true } | { ok: false; reason: string } {
  try {
    assertCurrentPlayer(state, playerId);
  } catch {
    return { ok: false, reason: 'NOT_YOUR_TURN' };
  }
  if (state.drawStackPending <= 0) {
    return { ok: false, reason: 'NO_DRAW_STACK' };
  }

  const hand = state.hands[playerId] || [];
  for (const c of hand) {
    if (isDrawStackResponderCard(c)) {
      return { ok: false, reason: 'MUST_PLAY_OR_PASS_ONLY_IF_NO_RESPONSE' };
    }
  }

  return { ok: true };
}

/**
 * Player takes the accumulated draw stack (no +2/W4 in hand to respond).
 * Resets stack, advances turn.
 */
export function applyTakeDrawStack(
  state: UnoEngineState,
  playerId: string,
  shuffleFn: ShuffleFn = shuffleUnoDeck,
): { state: UnoEngineState } {
  const v = validateTakeDrawStack(state, playerId);
  if (!v.ok) throw new Error(v.reason);

  const next = cloneEngineState(state);
  const n = next.drawStackPending;
  const { drawn, drawPile, discardPile } = drawNCards(next.drawPile, next.discardPile, n, shuffleFn);
  next.drawPile = drawPile;
  next.discardPile = discardPile;
  next.hands[playerId] = [...(next.hands[playerId] || []), ...drawn];
  next.drawStackPending = 0;
  advanceTurnNormal(next);
  return { state: next };
}

/**
 * Optional: take stack even when you could play a responder (explicit "accept" from client).
 * Same as applyTakeDrawStack but skips the "must not hold responder" check.
 */
export function applyTakeDrawStackForced(
  state: UnoEngineState,
  playerId: string,
  shuffleFn: ShuffleFn = shuffleUnoDeck,
): { state: UnoEngineState } {
  try {
    assertCurrentPlayer(state, playerId);
  } catch {
    throw new Error('NOT_YOUR_TURN');
  }
  if (state.drawStackPending <= 0) throw new Error('NO_DRAW_STACK');

  const next = cloneEngineState(state);
  const n = next.drawStackPending;
  const { drawn, drawPile, discardPile } = drawNCards(next.drawPile, next.discardPile, n, shuffleFn);
  next.drawPile = drawPile;
  next.discardPile = discardPile;
  next.hands[playerId] = [...(next.hands[playerId] || []), ...drawn];
  next.drawStackPending = 0;
  advanceTurnNormal(next);
  return { state: next };
}

/** True if the player can legally play at least one card from their hand. */
export function hasLegalPlay(state: UnoEngineState, playerId: string): boolean {
  const hand = state.hands[playerId] || [];
  for (let i = 0; i < hand.length; i++) {
    const card = hand[i];
    if (card === 'W' || card === 'W4') {
      for (const c of COLORS) {
        if (validatePlay(state, playerId, i, { chosenColor: c }).ok) return true;
      }
    } else {
      if (validatePlay(state, playerId, i, {}).ok) return true;
    }
  }
  return false;
}

/** Draw one card from the pile (no pending +2/+4 stack). Turn stays with the same player. */
export function applyDrawOne(
  state: UnoEngineState,
  playerId: string,
  shuffleFn: ShuffleFn = shuffleUnoDeck,
): { state: UnoEngineState } {
  try {
    assertCurrentPlayer(state, playerId);
  } catch {
    throw new Error('NOT_YOUR_TURN');
  }
  if (state.eliminatedPlayers.includes(playerId)) throw new Error('ELIMINATED');
  if (state.drawStackPending > 0) throw new Error('CANNOT_DRAW_WHILE_STACK');

  const { drawn, drawPile, discardPile } = drawNCards(state.drawPile, state.discardPile, 1, shuffleFn);
  if (drawn.length === 0) throw new Error('DECK_EMPTY');

  const next = cloneEngineState(state);
  next.drawPile = drawPile;
  next.discardPile = discardPile;
  next.hands[playerId] = [...(next.hands[playerId] || []), ...drawn];
  return { state: next };
}

export function validatePassTurn(
  state: UnoEngineState,
  playerId: string,
): { ok: true } | { ok: false; reason: string } {
  try {
    assertCurrentPlayer(state, playerId);
  } catch {
    return { ok: false, reason: 'NOT_YOUR_TURN' };
  }
  if (state.eliminatedPlayers.includes(playerId)) return { ok: false, reason: 'ELIMINATED' };
  if (state.drawStackPending > 0) return { ok: false, reason: 'MUST_RESOLVE_STACK' };
  if (hasLegalPlay(state, playerId)) return { ok: false, reason: 'HAS_LEGAL_PLAY' };
  return { ok: true };
}

/** End turn when no legal play (after drawing or with empty hand options). */
export function applyPassTurn(state: UnoEngineState, playerId: string): UnoEngineState {
  const v = validatePassTurn(state, playerId);
  if (!v.ok) throw new Error(v.reason);
  const next = cloneEngineState(state);
  advanceTurnNormal(next);
  return next;
}

export function engineStateFromDeal(
  playerIds: string[],
  deal: UnoDealResult,
): UnoEngineState {
  return {
    playerIds: [...playerIds],
    hands: Object.fromEntries(playerIds.map((id) => [id, [...(deal.hands[id] || [])]])),
    drawPile: [...deal.drawPile],
    discardPile: [...deal.discardPile],
    currentPlayerIndex: 0,
    direction: 1,
    currentColor: deal.currentColor,
    drawStackPending: 0,
    eliminatedPlayers: [],
  };
}
