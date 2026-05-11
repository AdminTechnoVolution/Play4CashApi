import {
  buildUnoDeck,
  canPlayCardOnDiscard,
  dealUnoInitialState,
  drawNCards,
  engineStateFromDeal,
  applyPlay,
  applyTakeDrawStack,
  applyDrawOne,
  applyPassTurn,
  validatePassTurn,
  hasLegalPlay,
  validatePlay,
  validateTakeDrawStack,
  handHasColor,
  reshuffleDiscardIntoDraw,
  getNextUnoPlayerIndex,
  activePlayerCount,
  isDrawStackResponderCard,
} from './uno-game.logic';

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

describe('draw stack + W4 rules', () => {
  const p0 = 'p0';
  const p1 = 'p1';

  function twoPlayerState(top: string, color: 'R' | 'G' | 'B' | 'Y') {
    return {
      playerIds: [p0, p1],
      hands: {
        [p0]: ['RDraw2'],
        [p1]: ['G5', 'G6'],
      },
      drawPile: [] as string[],
      discardPile: [top],
      currentPlayerIndex: 0,
      direction: 1 as const,
      currentColor: color,
      drawStackPending: 0,
      eliminatedPlayers: [] as string[],
    };
  }

  it('rejects normal card when stack pending', () => {
    const s = twoPlayerState('R1', 'R');
    s.drawStackPending = 2;
    s.hands[p0] = ['G5', 'RDraw2'];
    const v = validatePlay(s, p0, 0, {});
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('MUST_RESPOND_DRAW_STACK');
  });

  it('allows +2 on stack and increases pending', () => {
    const s = twoPlayerState('R1', 'R');
    s.drawStackPending = 2;
    s.hands[p0] = ['GDraw2', 'R9'];
    expect(validatePlay(s, p0, 0, {}).ok).toBe(true);
    const { state } = applyPlay(s, p0, 0, {});
    expect(state.drawStackPending).toBe(4);
    expect(state.currentPlayerIndex).toBe(1);
  });

  it('allows W4 on stack without color restriction', () => {
    const s = twoPlayerState('R1', 'R');
    s.drawStackPending = 2;
    s.hands[p0] = ['R3', 'W4'];
    const v = validatePlay(s, p0, 1, { chosenColor: 'G' });
    expect(v.ok).toBe(true);
  });

  it('blocks W4 when pending 0 and hand has current color', () => {
    const s = twoPlayerState('R5', 'R');
    s.hands[p0] = ['R3', 'W4'];
    const v = validatePlay(s, p0, 1, { chosenColor: 'G' });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('WILD4_ILLEGAL_HAS_COLOR');
  });

  it('allows W4 when pending 0 and no card of current color', () => {
    const s = twoPlayerState('R5', 'R');
    s.hands[p0] = ['G3', 'W4'];
    expect(validatePlay(s, p0, 1, { chosenColor: 'G' }).ok).toBe(true);
  });
});

describe('applyTakeDrawStack', () => {
  const p0 = 'p0';
  const p1 = 'p1';

  it('draws accumulated cards and resets stack', () => {
    const state = {
      playerIds: [p0, p1],
      hands: { [p0]: [], [p1]: ['G1'] },
      drawPile: ['A', 'B', 'C', 'D', 'E', 'F'],
      discardPile: ['R9'],
      currentPlayerIndex: 0,
      direction: 1 as const,
      currentColor: 'R' as const,
      drawStackPending: 6,
      eliminatedPlayers: [] as string[],
    };
    const r = applyTakeDrawStack(state, p0, (a) => [...a]);
    expect(r.state.drawStackPending).toBe(0);
    expect(r.state.hands[p0].length).toBe(6);
    expect(r.state.currentPlayerIndex).toBe(1);
  });

  it('refuses take when hand has a stack responder', () => {
    const state = {
      playerIds: [p0, p1],
      hands: { [p0]: ['W4'], [p1]: [] },
      drawPile: ['X'],
      discardPile: ['R1'],
      currentPlayerIndex: 0,
      direction: 1 as const,
      currentColor: 'R' as const,
      drawStackPending: 4,
      eliminatedPlayers: [] as string[],
    };
    const v = validateTakeDrawStack(state, p0);
    expect(v.ok).toBe(false);
  });
});

describe('reverse two players', () => {
  it('keeps same current index after reverse', () => {
    const p0 = 'a';
    const p1 = 'b';
    const s = {
      playerIds: [p0, p1],
      hands: { [p0]: ['RReverse', 'G1'], [p1]: ['R2'] },
      drawPile: [] as string[],
      discardPile: ['R5'],
      currentPlayerIndex: 0,
      direction: 1 as const,
      currentColor: 'R' as const,
      drawStackPending: 0,
      eliminatedPlayers: [] as string[],
    };
    const { state } = applyPlay(s, p0, 0, {});
    expect(state.currentPlayerIndex).toBe(0);
    expect(state.direction).toBe(-1);
  });
});

describe('drawNCards + reshuffle', () => {
  it('reshuffles discard when draw empty mid-draw', () => {
    const drawPile: string[] = ['a', 'b', 'c', 'd'];
    const discardPile = ['x', 'y', 'z'];
    const identity = (c: string[]) => [...c];
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
    const r = reshuffleDiscardIntoDraw([], ['a', 'b', 'top'], (c) => c);
    expect(r.discardPile).toEqual(['top']);
    expect(r.drawPile).toEqual(['a', 'b']);
  });
});

describe('draw_one + pass', () => {
  it('draw_one adds a card and keeps turn', () => {
    const s = {
      playerIds: ['a', 'b'],
      hands: { a: ['G9'], b: ['R1'] },
      drawPile: ['X'],
      discardPile: ['R5'],
      currentPlayerIndex: 0,
      direction: 1 as const,
      currentColor: 'R' as const,
      drawStackPending: 0,
      eliminatedPlayers: [] as string[],
    };
    const { state } = applyDrawOne(s, 'a', (c) => c);
    expect(state.hands.a).toEqual(['G9', 'X']);
    expect(state.currentPlayerIndex).toBe(0);
  });

  it('pass fails when a legal play exists', () => {
    const s = {
      playerIds: ['a', 'b'],
      hands: { a: ['R3'], b: [] },
      drawPile: [],
      discardPile: ['R7'],
      currentPlayerIndex: 0,
      direction: 1 as const,
      currentColor: 'R' as const,
      drawStackPending: 0,
      eliminatedPlayers: [] as string[],
    };
    expect(hasLegalPlay(s, 'a')).toBe(true);
    expect(validatePassTurn(s, 'a').ok).toBe(false);
  });

  it('pass advances when no legal play', () => {
    const s = {
      playerIds: ['a', 'b'],
      hands: { a: ['G9'], b: ['R1'] },
      drawPile: [],
      discardPile: ['R5'],
      currentPlayerIndex: 0,
      direction: 1 as const,
      currentColor: 'R' as const,
      drawStackPending: 0,
      eliminatedPlayers: [] as string[],
    };
    expect(hasLegalPlay(s, 'a')).toBe(false);
    const next = applyPassTurn(s, 'a');
    expect(next.currentPlayerIndex).toBe(1);
  });
});
