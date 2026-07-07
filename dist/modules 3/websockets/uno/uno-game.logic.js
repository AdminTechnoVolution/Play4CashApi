"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildUnoDeck = buildUnoDeck;
exports.shuffleUnoDeck = shuffleUnoDeck;
exports.isColoredNumberCard = isColoredNumberCard;
exports.cardScoreValue = cardScoreValue;
exports.sumHandScore = sumHandScore;
exports.dealUnoInitialState = dealUnoInitialState;
exports.getNextUnoPlayerIndex = getNextUnoPlayerIndex;
exports.activePlayerCount = activePlayerCount;
exports.isWild = isWild;
exports.isWildDrawFour = isWildDrawFour;
exports.isColoredDrawTwo = isColoredDrawTwo;
exports.isDrawStackResponderCard = isDrawStackResponderCard;
exports.isSkipCard = isSkipCard;
exports.isReverseCard = isReverseCard;
exports.isNumberCard = isNumberCard;
exports.colorOfColoredCard = colorOfColoredCard;
exports.numberDigit = numberDigit;
exports.handHasColor = handHasColor;
exports.canPlayCardOnDiscard = canPlayCardOnDiscard;
exports.reshuffleDiscardIntoDraw = reshuffleDiscardIntoDraw;
exports.drawNCards = drawNCards;
exports.cloneEngineState = cloneEngineState;
exports.topDiscard = topDiscard;
exports.validatePlay = validatePlay;
exports.applyPlay = applyPlay;
exports.validateTakeDrawStack = validateTakeDrawStack;
exports.applyTakeDrawStack = applyTakeDrawStack;
exports.hasLegalPlay = hasLegalPlay;
exports.applyDrawOne = applyDrawOne;
exports.validatePassTurn = validatePassTurn;
exports.applyPassTurn = applyPassTurn;
exports.applyCallUno = applyCallUno;
exports.applyChallengeUnoMiss = applyChallengeUnoMiss;
exports.engineStateFromDeal = engineStateFromDeal;
const crypto_1 = require("crypto");
const COLORS = ['R', 'G', 'B', 'Y'];
function buildUnoDeck() {
    const deck = [];
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
function shuffleUnoDeck(deck) {
    const a = [...deck];
    for (let i = a.length - 1; i > 0; i--) {
        const j = (0, crypto_1.randomInt)(i + 1);
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
function isColoredNumberCard(card) {
    return /^[RGBY][0-9]$/.test(card);
}
function cardScoreValue(card) {
    if (card === 'W' || card === 'W4')
        return 50;
    if (/^[RGBY](Skip|Reverse|Draw2)$/.test(card))
        return 20;
    const m = /^[RGBY]([0-9])$/.exec(card);
    if (m)
        return Number(m[1]);
    return 0;
}
function sumHandScore(hand) {
    let total = 0;
    for (const c of hand)
        total += cardScoreValue(c);
    return total;
}
function dealUnoInitialState(playerIds) {
    const shuffled = shuffleUnoDeck(buildUnoDeck());
    const hands = Object.fromEntries(playerIds.map((id) => [id, []]));
    for (let r = 0; r < 7; r++) {
        for (const id of playerIds) {
            const c = shuffled.shift();
            if (!c)
                throw new Error('UNO deal: deck underrun');
            hands[id].push(c);
        }
    }
    const drawPile = shuffled;
    const discardPile = [];
    while (drawPile.length > 0) {
        const c = drawPile.shift();
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
    const currentColor = top[0];
    return { hands, drawPile, discardPile, currentColor };
}
function getNextUnoPlayerIndex(currentIndex, playerIds, eliminatedPlayers, direction) {
    const n = playerIds.length;
    let idx = currentIndex;
    for (let s = 0; s < n; s++) {
        idx = (idx + direction + n) % n;
        const pid = playerIds[idx];
        if (!eliminatedPlayers.includes(pid))
            return idx;
    }
    return currentIndex;
}
function activePlayerCount(playerIds, eliminatedPlayers) {
    return playerIds.filter((id) => !eliminatedPlayers.includes(id)).length;
}
function isWild(card) {
    return card === 'W' || card === 'W4';
}
function isWildDrawFour(card) {
    return card === 'W4';
}
function isColoredDrawTwo(card) {
    return /^[RGBY]Draw2$/.test(card);
}
function isDrawStackResponderCard(card) {
    return isColoredDrawTwo(card) || isWildDrawFour(card);
}
function isSkipCard(card) {
    return /^[RGBY]Skip$/.test(card);
}
function isReverseCard(card) {
    return /^[RGBY]Reverse$/.test(card);
}
function isNumberCard(card) {
    return /^[RGBY][0-9]$/.test(card);
}
function colorOfColoredCard(card) {
    if (/^[RGBY]/.test(card))
        return card[0];
    return null;
}
function numberDigit(card) {
    if (isNumberCard(card))
        return card[1];
    return null;
}
function handHasColor(hand, currentColor) {
    return hand.some((c) => {
        const col = colorOfColoredCard(c);
        return col !== null && col === currentColor;
    });
}
function canPlayCardOnDiscard(playCard, topDiscard, currentColor) {
    if (isWild(playCard))
        return true;
    if (isWild(topDiscard) || isWildDrawFour(topDiscard)) {
        const pc = colorOfColoredCard(playCard);
        return pc === currentColor;
    }
    if (isNumberCard(topDiscard)) {
        const d = numberDigit(topDiscard);
        if (isNumberCard(playCard) && numberDigit(playCard) === d)
            return true;
        const pc = colorOfColoredCard(playCard);
        return pc === currentColor;
    }
    if (isSkipCard(topDiscard)) {
        if (isSkipCard(playCard))
            return true;
        const pc = colorOfColoredCard(playCard);
        return pc === currentColor;
    }
    if (isReverseCard(topDiscard)) {
        if (isReverseCard(playCard))
            return true;
        const pc = colorOfColoredCard(playCard);
        return pc === currentColor;
    }
    if (isColoredDrawTwo(topDiscard)) {
        if (isColoredDrawTwo(playCard))
            return true;
        const pc = colorOfColoredCard(playCard);
        return pc === currentColor;
    }
    return false;
}
function reshuffleDiscardIntoDraw(drawPile, discardPile, shuffleFn = shuffleUnoDeck) {
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
function drawNCards(drawPile, discardPile, n, shuffleFn = shuffleUnoDeck) {
    const drawn = [];
    let draw = [...drawPile];
    let disc = [...discardPile];
    while (drawn.length < n) {
        if (draw.length === 0) {
            const r = reshuffleDiscardIntoDraw(draw, disc, shuffleFn);
            draw = r.drawPile;
            disc = r.discardPile;
            if (draw.length === 0)
                break;
        }
        const c = draw.shift();
        drawn.push(c);
    }
    return { drawn, drawPile: draw, discardPile: disc };
}
function cloneEngineState(s) {
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
        unoCalled: [...s.unoCalled],
        pendingUnoOffender: s.pendingUnoOffender,
        lastActionPlayerId: s.lastActionPlayerId,
    };
}
function topDiscard(state) {
    const d = state.discardPile;
    return d[d.length - 1];
}
function currentPlayerId(state) {
    return state.playerIds[state.currentPlayerIndex];
}
function assertCurrentPlayer(state, playerId) {
    if (currentPlayerId(state) !== playerId) {
        throw new Error('NOT_YOUR_TURN');
    }
}
function validatePlay(state, playerId, cardIndex, options = {}) {
    try {
        assertCurrentPlayer(state, playerId);
    }
    catch {
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
    if (state.drawStackPending > 0) {
        if (!isDrawStackResponderCard(card)) {
            return { ok: false, reason: 'STACK_RESPONSE_REQUIRED' };
        }
        if (isColoredDrawTwo(card)) {
            const top = topDiscard(state);
            if (!top || !isColoredDrawTwo(top)) {
                return { ok: false, reason: 'STACK_DRAW2_NOT_ALLOWED' };
            }
        }
        if (isWildDrawFour(card) && handHasColor(hand, state.currentColor)) {
            return { ok: false, reason: 'WILD4_ILLEGAL_HAS_COLOR' };
        }
        if (card === 'W4' && !options.chosenColor) {
            return { ok: false, reason: 'CHOSEN_COLOR_REQUIRED' };
        }
        return { ok: true };
    }
    const top = topDiscard(state);
    if (!top) {
        return { ok: false, reason: 'NO_MATCH' };
    }
    if (!canPlayCardOnDiscard(card, top, state.currentColor)) {
        return { ok: false, reason: 'NO_MATCH' };
    }
    if (isWildDrawFour(card) && handHasColor(hand, state.currentColor)) {
        return { ok: false, reason: 'WILD4_ILLEGAL_HAS_COLOR' };
    }
    if ((card === 'W' || card === 'W4') && !options.chosenColor) {
        return { ok: false, reason: 'CHOSEN_COLOR_REQUIRED' };
    }
    return { ok: true };
}
function applyPlay(state, playerId, cardIndex, options = {}) {
    const v = validatePlay(state, playerId, cardIndex, options);
    if (!v.ok)
        throw new Error(v.reason);
    const next = cloneEngineState(state);
    next.pendingUnoOffender = null;
    next.lastActionPlayerId = playerId;
    const hand = [...next.hands[playerId]];
    const [card] = hand.splice(cardIndex, 1);
    next.hands[playerId] = hand;
    next.discardPile = [...next.discardPile, card];
    let newColor = next.currentColor;
    if (card === 'W' || card === 'W4') {
        newColor = options.chosenColor;
    }
    else {
        const col = colorOfColoredCard(card);
        if (col)
            newColor = col;
    }
    next.currentColor = newColor;
    const prevPending = state.drawStackPending;
    if (isColoredDrawTwo(card)) {
        next.drawStackPending = prevPending > 0 ? prevPending + 2 : 2;
    }
    else if (isWildDrawFour(card)) {
        next.drawStackPending = prevPending > 0 ? prevPending + 4 : 4;
    }
    else {
        next.drawStackPending = 0;
    }
    const active = activePlayerCount(next.playerIds, next.eliminatedPlayers);
    if (hand.length === 0) {
        if (!next.unoCalled.includes(playerId) && !options.callUno) {
            const { drawn, drawPile, discardPile } = drawNCards(next.drawPile, next.discardPile, 2);
            next.drawPile = drawPile;
            next.discardPile = discardPile;
            next.hands[playerId] = [...next.hands[playerId], ...drawn];
            next.unoCalled = next.unoCalled.filter((id) => id !== playerId);
            next.pendingUnoOffender = null;
        }
        else {
            next.unoCalled = next.unoCalled.filter((id) => id !== playerId);
            return { state: next, winnerId: playerId };
        }
    }
    else if (hand.length === 1) {
        if (options.callUno) {
            if (!next.unoCalled.includes(playerId))
                next.unoCalled = [...next.unoCalled, playerId];
            next.pendingUnoOffender = null;
        }
        else {
            next.unoCalled = next.unoCalled.filter((id) => id !== playerId);
            next.pendingUnoOffender = playerId;
        }
    }
    else {
        next.unoCalled = next.unoCalled.filter((id) => id !== playerId);
    }
    if (isSkipCard(card)) {
        advanceSkip(next, active);
        return { state: next };
    }
    if (isReverseCard(card)) {
        next.direction = (next.direction === 1 ? -1 : 1);
        if (active === 2) {
        }
        else {
            next.currentPlayerIndex = getNextUnoPlayerIndex(next.currentPlayerIndex, next.playerIds, next.eliminatedPlayers, next.direction);
        }
        return { state: next };
    }
    advanceTurnNormal(next);
    return { state: next };
}
function advanceTurnNormal(state) {
    state.currentPlayerIndex = getNextUnoPlayerIndex(state.currentPlayerIndex, state.playerIds, state.eliminatedPlayers, state.direction);
}
function advanceSkip(state, activeCount) {
    if (activeCount === 2) {
        return;
    }
    advanceTurnNormal(state);
    advanceTurnNormal(state);
}
function validateTakeDrawStack(state, playerId) {
    try {
        assertCurrentPlayer(state, playerId);
    }
    catch {
        return { ok: false, reason: 'NOT_YOUR_TURN' };
    }
    if (state.drawStackPending <= 0) {
        return { ok: false, reason: 'NO_DRAW_STACK' };
    }
    return { ok: true };
}
function applyTakeDrawStack(state, playerId, shuffleFn = shuffleUnoDeck) {
    const v = validateTakeDrawStack(state, playerId);
    if (!v.ok)
        throw new Error(v.reason);
    const next = cloneEngineState(state);
    next.pendingUnoOffender = null;
    next.lastActionPlayerId = playerId;
    const n = next.drawStackPending;
    const { drawn, drawPile, discardPile } = drawNCards(next.drawPile, next.discardPile, n, shuffleFn);
    next.drawPile = drawPile;
    next.discardPile = discardPile;
    next.hands[playerId] = [...(next.hands[playerId] || []), ...drawn];
    next.drawStackPending = 0;
    next.unoCalled = next.unoCalled.filter((id) => id !== playerId);
    advanceTurnNormal(next);
    return { state: next };
}
function hasLegalPlay(state, playerId) {
    const hand = state.hands[playerId] || [];
    for (let i = 0; i < hand.length; i++) {
        const card = hand[i];
        if (card === 'W' || card === 'W4') {
            for (const c of COLORS) {
                if (validatePlay(state, playerId, i, { chosenColor: c }).ok)
                    return true;
            }
        }
        else {
            if (validatePlay(state, playerId, i, {}).ok)
                return true;
        }
    }
    return false;
}
function applyDrawOne(state, playerId, shuffleFn = shuffleUnoDeck) {
    try {
        assertCurrentPlayer(state, playerId);
    }
    catch {
        throw new Error('NOT_YOUR_TURN');
    }
    if (state.eliminatedPlayers.includes(playerId))
        throw new Error('ELIMINATED');
    if (state.drawStackPending > 0)
        throw new Error('CANNOT_DRAW_WHILE_STACK');
    const { drawn, drawPile, discardPile } = drawNCards(state.drawPile, state.discardPile, 1, shuffleFn);
    if (drawn.length === 0)
        throw new Error('DECK_EMPTY');
    const next = cloneEngineState(state);
    next.pendingUnoOffender = null;
    next.lastActionPlayerId = playerId;
    next.drawPile = drawPile;
    next.discardPile = discardPile;
    next.hands[playerId] = [...(next.hands[playerId] || []), ...drawn];
    next.unoCalled = next.unoCalled.filter((id) => id !== playerId);
    return { state: next };
}
function validatePassTurn(state, playerId) {
    try {
        assertCurrentPlayer(state, playerId);
    }
    catch {
        return { ok: false, reason: 'NOT_YOUR_TURN' };
    }
    if (state.eliminatedPlayers.includes(playerId))
        return { ok: false, reason: 'ELIMINATED' };
    if (state.drawStackPending > 0)
        return { ok: false, reason: 'MUST_RESOLVE_STACK' };
    if (hasLegalPlay(state, playerId))
        return { ok: false, reason: 'HAS_LEGAL_PLAY' };
    return { ok: true };
}
function applyPassTurn(state, playerId, shuffleFn = shuffleUnoDeck) {
    const v = validatePassTurn(state, playerId);
    if (!v.ok)
        throw new Error(v.reason);
    let afterDraw;
    try {
        afterDraw = applyDrawOne(state, playerId, shuffleFn).state;
    }
    catch (e) {
        if (e?.message === 'DECK_EMPTY') {
            const next = cloneEngineState(state);
            next.pendingUnoOffender = null;
            next.lastActionPlayerId = playerId;
            advanceTurnNormal(next);
            return next;
        }
        throw e;
    }
    if (hasLegalPlay(afterDraw, playerId)) {
        return afterDraw;
    }
    const next = cloneEngineState(afterDraw);
    advanceTurnNormal(next);
    return next;
}
function applyCallUno(state, playerId) {
    const hand = state.hands[playerId] || [];
    if (hand.length !== 1 || state.unoCalled.includes(playerId)) {
        throw new Error('UNO_CALL_NOT_ALLOWED');
    }
    const pending = state.pendingUnoOffender;
    if (pending !== null && pending !== playerId) {
        throw new Error('UNO_CALL_NOT_ALLOWED');
    }
    const next = cloneEngineState(state);
    next.pendingUnoOffender = null;
    if (!next.unoCalled.includes(playerId)) {
        next.unoCalled = [...next.unoCalled, playerId];
    }
    return next;
}
function applyChallengeUnoMiss(state, accuserId, accusedId, shuffleFn = shuffleUnoDeck) {
    if (!state.playerIds.includes(accuserId)) {
        throw new Error('INVALID_ACCUSER');
    }
    if (state.eliminatedPlayers.includes(accuserId)) {
        throw new Error('ELIMINATED');
    }
    if (state.pendingUnoOffender !== accusedId) {
        return { state, success: false };
    }
    const next = cloneEngineState(state);
    next.pendingUnoOffender = null;
    const { drawn, drawPile, discardPile } = drawNCards(next.drawPile, next.discardPile, 2, shuffleFn);
    next.drawPile = drawPile;
    next.discardPile = discardPile;
    next.hands[accusedId] = [...(next.hands[accusedId] || []), ...drawn];
    next.unoCalled = next.unoCalled.filter((id) => id !== accusedId);
    return { state: next, success: true };
}
function engineStateFromDeal(playerIds, deal) {
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
        unoCalled: [],
        pendingUnoOffender: null,
        lastActionPlayerId: null,
    };
}
//# sourceMappingURL=uno-game.logic.js.map