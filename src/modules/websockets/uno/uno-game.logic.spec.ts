import {
  buildUnoDeck,
  canPlayCardOnDiscard,
  cardScoreValue,
  dealUnoInitialState,
  drawNCards,
  engineStateFromDeal,
  applyPlay,
  applyTakeDrawStack,
  applyDrawOne,
  applyPassTurn,
  applyCallUno,
  applyChallengeUnoMiss,
  validatePassTurn,
  hasLegalPlay,
  validatePlay,
  validateTakeDrawStack,
  handHasColor,
  reshuffleDiscardIntoDraw,
  getNextUnoPlayerIndex,
  activePlayerCount,
  isDrawStackResponderCard,
  sumHandScore,
  type UnoColor,
  type UnoEngineState,
} from './uno-game.logic';

/** Helper that builds a complete UnoEngineState with sensible defaults. */
function state(overrides: Partial<UnoEngineState> & { hands: UnoEngineState['hands']; playerIds: string[]; discardPile: string[] }): UnoEngineState {
  return {
    drawPile: [],
    currentPlayerIndex: 0,
    direction: 1,
    currentColor: 'R' as UnoColor,
    drawStackPending: 0,
    eliminatedPlayers: [],
    unoCalled: [],
    pendingUnoOffender: null,
    lastActionPlayerId: null,
    ...overrides,
  };
}

const identity = <T>(c: T[]): T[] => [...c];

describe('buildUnoDeck', () => {
  it('has 108 cards', () => {
    expect(buildUnoDeck().length).toBe(108);
  });
});

describe('canPlayCardOnDiscard', () => {
  it('allows same number different color', () => {
    expect(canPlayCardOnDiscard('G5', 'R5', 'R')).toBe(true);
  });

  it('allows same color different number', () => {
    expect(canPlayCardOnDiscard('R3', 'R5', 'R')).toBe(true);
  });

  it('allows wild', () => {
    expect(canPlayCardOnDiscard('W', 'R5', 'R')).toBe(true);
    expect(canPlayCardOnDiscard('W4', 'R5', 'R')).toBe(true);
  });

  it('with wild on discard uses currentColor', () => {
    expect(canPlayCardOnDiscard('Y3', 'W', 'Y')).toBe(true);
    expect(canPlayCardOnDiscard('R3', 'W', 'Y')).toBe(false);
  });

  it('matches skip to skip', () => {
    expect(canPlayCardOnDiscard('GSkip', 'RSkip', 'R')).toBe(true);
  });
});

describe('handHasColor', () => {
  it('detects colored cards only', () => {
    expect(handHasColor(['W', 'W4', 'G2'], 'R')).toBe(false);
    expect(handHasColor(['W', 'R1'], 'R')).toBe(true);
  });
});

describe('no-stacking rule (+2 / +4 cannot be answered with another draw card)', () => {
  it('rejects ANY play when stack pending — only take_draw_stack is allowed', () => {
    const s = state({
      playerIds: ['p0', 'p1'],
      hands: { p0: ['GDraw2', 'W4', 'R3'], p1: [] },
      discardPile: ['R1'],
      drawStackPending: 2,
    });
    for (let i = 0; i < 3; i++) {
      const v = validatePlay(s, 'p0', i, { chosenColor: 'G' });
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.reason).toBe('MUST_TAKE_STACK');
    }
  });

  it('blocks W4 when pending 0 and hand has current color', () => {
    const s = state({
      playerIds: ['p0', 'p1'],
      hands: { p0: ['R3', 'W4'], p1: [] },
      discardPile: ['R5'],
    });
    const v = validatePlay(s, 'p0', 1, { chosenColor: 'G' });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('WILD4_ILLEGAL_HAS_COLOR');
  });

  it('allows W4 when pending 0 and no card of current color', () => {
    const s = state({
      playerIds: ['p0', 'p1'],
      hands: { p0: ['G3', 'W4'], p1: [] },
      discardPile: ['R5'],
    });
    expect(validatePlay(s, 'p0', 1, { chosenColor: 'G' }).ok).toBe(true);
  });
});

describe('applyTakeDrawStack', () => {
  it('draws accumulated cards and resets stack', () => {
    const s = state({
      playerIds: ['p0', 'p1'],
      hands: { p0: [], p1: ['G1'] },
      drawPile: ['A', 'B', 'C', 'D', 'E', 'F'],
      discardPile: ['R9'],
      drawStackPending: 2,
    });
    const r = applyTakeDrawStack(s, 'p0', identity);
    expect(r.state.drawStackPending).toBe(0);
    expect(r.state.hands.p0.length).toBe(2);
    expect(r.state.currentPlayerIndex).toBe(1);
    expect(r.state.lastActionPlayerId).toBe('p0');
  });

  it('always succeeds (no-stacking variant: no responder check)', () => {
    const s = state({
      playerIds: ['p0', 'p1'],
      hands: { p0: ['W4'], p1: [] },
      drawPile: ['X', 'Y', 'Z', 'Q'],
      discardPile: ['R1'],
      drawStackPending: 4,
    });
    expect(validateTakeDrawStack(s, 'p0').ok).toBe(true);
  });
});

describe('reverse two players', () => {
  it('keeps same current index after reverse', () => {
    const s = state({
      playerIds: ['a', 'b'],
      hands: { a: ['RReverse', 'G1'], b: ['R2'] },
      discardPile: ['R5'],
    });
    const { state: next } = applyPlay(s, 'a', 0, {});
    expect(next.currentPlayerIndex).toBe(0);
    expect(next.direction).toBe(-1);
  });
});

describe('drawNCards + reshuffle', () => {
  it('reshuffles discard when draw empty mid-draw', () => {
    const drawPile = ['a', 'b', 'c', 'd'];
    const discardPile = ['x', 'y', 'z'];
    const { drawn, drawPile: d2, discardPile: disc2 } = drawNCards(drawPile, discardPile, 6, identity);
    expect(drawn.length).toBe(6);
    expect(disc2.length).toBe(1);
    expect(disc2[disc2.length - 1]).toBe('z');
    expect(d2.length + drawn.length).toBeGreaterThanOrEqual(0);
  });
});

describe('dealUnoInitialState + engineStateFromDeal', () => {
  it('produces valid opening', () => {
    const deal = dealUnoInitialState(['a', 'b']);
    expect(deal.hands.a.length).toBe(7);
    expect(deal.hands.b.length).toBe(7);
    expect(deal.discardPile.length).toBe(1);
    expect(deal.currentColor).toMatch(/^[RGBY]$/);
    const eng = engineStateFromDeal(['a', 'b'], deal);
    expect(eng.drawStackPending).toBe(0);
    expect(eng.unoCalled).toEqual([]);
    expect(eng.pendingUnoOffender).toBeNull();
    expect(eng.lastActionPlayerId).toBeNull();
    expect(activePlayerCount(eng.playerIds, eng.eliminatedPlayers)).toBe(2);
  });
});

describe('getNextUnoPlayerIndex', () => {
  it('skips eliminated', () => {
    const ids = ['a', 'b', 'c'];
    const next = getNextUnoPlayerIndex(0, ids, ['b'], 1);
    expect(ids[next]).toBe('c');
  });
});

describe('isDrawStackResponderCard', () => {
  it('accepts colored +2 and W4 only', () => {
    expect(isDrawStackResponderCard('RDraw2')).toBe(true);
    expect(isDrawStackResponderCard('W4')).toBe(true);
    expect(isDrawStackResponderCard('W')).toBe(false);
    expect(isDrawStackResponderCard('R5')).toBe(false);
  });
});

describe('reshuffleDiscardIntoDraw', () => {
  it('keeps only top on discard', () => {
    const r = reshuffleDiscardIntoDraw([], ['a', 'b', 'top'], identity);
    expect(r.discardPile).toEqual(['top']);
    expect(r.drawPile).toEqual(['a', 'b']);
  });
});

describe('draw_one + pass', () => {
  it('draw_one adds a card and keeps turn, sets lastActionPlayerId', () => {
    const s = state({
      playerIds: ['a', 'b'],
      hands: { a: ['G9'], b: ['R1'] },
      drawPile: ['X'],
      discardPile: ['R5'],
    });
    const { state: next } = applyDrawOne(s, 'a', identity);
    expect(next.hands.a).toEqual(['G9', 'X']);
    expect(next.currentPlayerIndex).toBe(0);
    expect(next.lastActionPlayerId).toBe('a');
  });

  it('draw_one clears the player from unoCalled (hand grew)', () => {
    const s = state({
      playerIds: ['a', 'b'],
      hands: { a: ['G9'], b: ['R1'] },
      drawPile: ['X'],
      discardPile: ['R5'],
      unoCalled: ['a'],
    });
    const { state: next } = applyDrawOne(s, 'a', identity);
    expect(next.unoCalled).not.toContain('a');
  });

  it('pass fails when a legal play exists', () => {
    const s = state({
      playerIds: ['a', 'b'],
      hands: { a: ['R3'], b: [] },
      discardPile: ['R7'],
    });
    expect(hasLegalPlay(s, 'a')).toBe(true);
    expect(validatePassTurn(s, 'a').ok).toBe(false);
  });

  it('pass advances when no legal play and sets lastActionPlayerId', () => {
    const s = state({
      playerIds: ['a', 'b'],
      hands: { a: ['G9'], b: ['R1'] },
      discardPile: ['R5'],
    });
    expect(hasLegalPlay(s, 'a')).toBe(false);
    const next = applyPassTurn(s, 'a');
    expect(next.currentPlayerIndex).toBe(1);
    expect(next.lastActionPlayerId).toBe('a');
  });
});

// ── Fase 1: UNO call / challenge ────────────────────────────────────────────

describe('applyPlay — UNO call semantics', () => {
  it('opens miss-window when reaching 1 card without callUno=true', () => {
    const s = state({
      playerIds: ['a', 'b'],
      hands: { a: ['R3', 'R5'], b: ['Y2'] },
      discardPile: ['R7'],
    });
    const { state: next } = applyPlay(s, 'a', 0, {});
    expect(next.hands.a.length).toBe(1);
    expect(next.pendingUnoOffender).toBe('a');
    expect(next.unoCalled).not.toContain('a');
  });

  it('atomically declares UNO when callUno=true on the play that drops to 1 card', () => {
    const s = state({
      playerIds: ['a', 'b'],
      hands: { a: ['R3', 'R5'], b: ['Y2'] },
      discardPile: ['R7'],
    });
    const { state: next } = applyPlay(s, 'a', 0, { callUno: true });
    expect(next.hands.a.length).toBe(1);
    expect(next.pendingUnoOffender).toBeNull();
    expect(next.unoCalled).toContain('a');
  });

  it('does not open the window if hand stays ≥2', () => {
    const s = state({
      playerIds: ['a', 'b'],
      hands: { a: ['R3', 'R5', 'R8'], b: ['Y2'] },
      discardPile: ['R7'],
    });
    const { state: next } = applyPlay(s, 'a', 0, {});
    expect(next.pendingUnoOffender).toBeNull();
  });

  it('any subsequent action closes a previously-opened window', () => {
    const s = state({
      playerIds: ['a', 'b'],
      hands: { a: ['R3'], b: ['R5', 'Y9', 'B1'] },
      discardPile: ['R7'],
      pendingUnoOffender: 'a',
      currentPlayerIndex: 1,
    });
    // b plays a valid R5 (matches color) → ends with 2 cards (no new window for b).
    // a's window must be closed by this action.
    const { state: next } = applyPlay(s, 'b', 0, {});
    expect(next.pendingUnoOffender).toBeNull();
  });

  it('refuses to award the win if player empties without callUno → forced 2-card penalty', () => {
    const s = state({
      playerIds: ['a', 'b'],
      hands: { a: ['R3'], b: ['Y2'] },
      drawPile: ['X1', 'X2', 'X3'],
      discardPile: ['R7'],
    });
    const r = applyPlay(s, 'a', 0, {}); // no callUno, no prior unoCalled
    expect(r.winnerId).toBeUndefined();
    expect(r.state.hands.a.length).toBe(2); // penalty applied
    expect(r.state.unoCalled).not.toContain('a');
  });

  it('awards the win when emptying after a prior valid UNO declaration', () => {
    const s = state({
      playerIds: ['a', 'b'],
      hands: { a: ['R3'], b: ['Y2'] },
      drawPile: ['X1', 'X2'],
      discardPile: ['R7'],
      unoCalled: ['a'],
    });
    const r = applyPlay(s, 'a', 0, {});
    expect(r.winnerId).toBe('a');
  });

  it('awards the win when emptying with callUno=true on the same play', () => {
    const s = state({
      playerIds: ['a', 'b'],
      hands: { a: ['R3'], b: ['Y2'] },
      drawPile: ['X1', 'X2'],
      discardPile: ['R7'],
    });
    const r = applyPlay(s, 'a', 0, { callUno: true });
    expect(r.winnerId).toBe('a');
  });
});

describe('applyCallUno', () => {
  it('clears the pending offender and adds to unoCalled', () => {
    const s = state({
      playerIds: ['a', 'b'],
      hands: { a: ['R3'], b: ['Y2', 'Y9'] },
      discardPile: ['R7'],
      pendingUnoOffender: 'a',
      currentPlayerIndex: 1,
    });
    const next = applyCallUno(s, 'a');
    expect(next.pendingUnoOffender).toBeNull();
    expect(next.unoCalled).toContain('a');
  });

  it('throws UNO_CALL_NOT_ALLOWED when window is closed or wrong player', () => {
    const s = state({
      playerIds: ['a', 'b'],
      hands: { a: ['R3', 'R5'], b: ['Y2'] },
      discardPile: ['R7'],
    });
    expect(() => applyCallUno(s, 'a')).toThrow('UNO_CALL_NOT_ALLOWED');
  });

  it('throws when offender is set but caller is not the offender', () => {
    const s = state({
      playerIds: ['a', 'b'],
      hands: { a: ['R3'], b: ['Y2', 'Y9'] },
      discardPile: ['R7'],
      pendingUnoOffender: 'a',
    });
    expect(() => applyCallUno(s, 'b')).toThrow('UNO_CALL_NOT_ALLOWED');
  });
});

// ── Fase 2: Mattel scoring ──────────────────────────────────────────────────

describe('cardScoreValue', () => {
  it('numbered cards score their face value', () => {
    expect(cardScoreValue('R0')).toBe(0);
    expect(cardScoreValue('B5')).toBe(5);
    expect(cardScoreValue('Y9')).toBe(9);
  });
  it('action cards (Skip/Reverse/+2) score 20', () => {
    expect(cardScoreValue('GSkip')).toBe(20);
    expect(cardScoreValue('YReverse')).toBe(20);
    expect(cardScoreValue('BDraw2')).toBe(20);
  });
  it('Wild and Wild +4 score 50', () => {
    expect(cardScoreValue('W')).toBe(50);
    expect(cardScoreValue('W4')).toBe(50);
  });
  it('unknown encodings score 0 (defensive)', () => {
    expect(cardScoreValue('garbage')).toBe(0);
    expect(cardScoreValue('')).toBe(0);
  });
});

describe('sumHandScore', () => {
  it('sums an empty hand to 0', () => {
    expect(sumHandScore([])).toBe(0);
  });
  it('sums a mixed hand (5 + 9 + 20 + 50 = 84)', () => {
    expect(sumHandScore(['R5', 'B9', 'GSkip', 'W4'])).toBe(84);
  });
  it('handles all-action hands (3 × 20 = 60)', () => {
    expect(sumHandScore(['RSkip', 'YReverse', 'BDraw2'])).toBe(60);
  });
});

describe('applyChallengeUnoMiss', () => {
  it('penalises offender with 2 cards and closes the window', () => {
    const s = state({
      playerIds: ['a', 'b'],
      hands: { a: ['R3'], b: ['Y2', 'Y9'] },
      drawPile: ['X', 'Y'],
      discardPile: ['R7'],
      pendingUnoOffender: 'a',
      currentPlayerIndex: 1,
    });
    const r = applyChallengeUnoMiss(s, 'b', 'a', identity);
    expect(r.success).toBe(true);
    expect(r.state.hands.a).toEqual(['R3', 'X', 'Y']);
    expect(r.state.pendingUnoOffender).toBeNull();
  });

  it('returns success=false (not throw) when no offender pending', () => {
    const s = state({
      playerIds: ['a', 'b'],
      hands: { a: ['R3', 'R5'], b: ['Y2'] },
      discardPile: ['R7'],
    });
    const r = applyChallengeUnoMiss(s, 'b', 'a', identity);
    expect(r.success).toBe(false);
    expect(r.state).toBe(s); // no mutation
  });

  it('rejects challenge from an unknown player', () => {
    const s = state({
      playerIds: ['a', 'b'],
      hands: { a: ['R3'], b: ['Y2', 'Y9'] },
      discardPile: ['R7'],
      pendingUnoOffender: 'a',
    });
    expect(() => applyChallengeUnoMiss(s, 'ghost', 'a', identity)).toThrow('INVALID_ACCUSER');
  });

  it('rejects challenge from an eliminated player', () => {
    const s = state({
      playerIds: ['a', 'b', 'c'],
      hands: { a: ['R3'], b: ['Y2', 'Y9'], c: [] },
      discardPile: ['R7'],
      pendingUnoOffender: 'a',
      eliminatedPlayers: ['c'],
    });
    expect(() => applyChallengeUnoMiss(s, 'c', 'a', identity)).toThrow('ELIMINATED');
  });

  it('reshuffles the discard when draw pile runs out mid-penalty', () => {
    const s = state({
      playerIds: ['a', 'b'],
      hands: { a: ['R3'], b: ['Y2', 'Y9'] },
      drawPile: [], // empty — must reshuffle from discard
      discardPile: ['Z1', 'Z2', 'TOP'],
      pendingUnoOffender: 'a',
    });
    const r = applyChallengeUnoMiss(s, 'b', 'a', identity);
    expect(r.success).toBe(true);
    expect(r.state.hands.a.length).toBe(3); // R3 + 2
  });
});
