import {
  checkWinFromCell,
  createEmptyBoard,
  dropDisc,
  findDropRow,
  isBoardFull,
} from './connect-four-game.logic';
import { CONNECT_FOUR_ROWS } from '../../../common/constants/connect-four-game.constants';

describe('connect-four-game.logic', () => {
  it('creates an empty 6x7 board', () => {
    const b = createEmptyBoard();
    expect(b).toHaveLength(6);
    expect(b[0]).toHaveLength(7);
    expect(b.flat().every((c) => c === null)).toBe(true);
  });

  it('drops to the lowest empty row', () => {
    const b = createEmptyBoard();
    expect(findDropRow(b, 3)).toBe(5);
    const r = dropDisc(b, 3, 'R');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.row).toBe(5);
      expect(r.board[5][3]).toBe('R');
    }
  });

  it('detects four in a row horizontally', () => {
    const b = createEmptyBoard();
    for (const c of [0, 1, 2, 3]) {
      b[5][c] = 'R';
    }
    expect(checkWinFromCell(b, 5, 3, 'R').won).toBe(true);
  });

  it('detects four in a row diagonally via dropDisc', () => {
    const b = createEmptyBoard();
    b[5][0] = 'R';
    b[4][1] = 'R';
    b[3][2] = 'R';
    b[5][3] = 'Y';
    b[4][3] = 'Y';
    b[3][3] = 'Y';
    const win = dropDisc(b, 3, 'R');
    expect(win.ok).toBe(true);
    if (win.ok) {
      expect(win.row).toBe(2);
      expect(win.col).toBe(3);
      expect(win.win.won).toBe(true);
    }
  });

  it('reports draw when final drop fills the board without a winner', () => {
    const moves: Array<{ col: number; color: 'R' | 'Y' }> = [
      { col: 5, color: 'R' }, { col: 4, color: 'Y' }, { col: 6, color: 'R' }, { col: 4, color: 'Y' },
      { col: 3, color: 'R' }, { col: 1, color: 'Y' }, { col: 6, color: 'R' }, { col: 2, color: 'Y' },
      { col: 3, color: 'R' }, { col: 1, color: 'Y' }, { col: 4, color: 'R' }, { col: 3, color: 'Y' },
      { col: 3, color: 'R' }, { col: 3, color: 'Y' }, { col: 3, color: 'R' }, { col: 6, color: 'Y' },
      { col: 1, color: 'R' }, { col: 6, color: 'Y' }, { col: 1, color: 'R' }, { col: 5, color: 'Y' },
      { col: 6, color: 'R' }, { col: 5, color: 'Y' }, { col: 6, color: 'R' }, { col: 5, color: 'Y' },
      { col: 1, color: 'R' }, { col: 1, color: 'Y' }, { col: 2, color: 'R' }, { col: 2, color: 'Y' },
      { col: 5, color: 'R' }, { col: 5, color: 'Y' }, { col: 4, color: 'R' }, { col: 0, color: 'Y' },
      { col: 0, color: 'R' }, { col: 0, color: 'Y' }, { col: 4, color: 'R' }, { col: 0, color: 'Y' },
      { col: 0, color: 'R' }, { col: 2, color: 'Y' }, { col: 0, color: 'R' }, { col: 4, color: 'Y' },
      { col: 2, color: 'R' }, { col: 2, color: 'Y' },
    ];
    let b = createEmptyBoard();
    let last: ReturnType<typeof dropDisc> = { ok: false, reason: 'invalid_column' };
    for (const m of moves) {
      last = dropDisc(b, m.col, m.color);
      expect(last.ok).toBe(true);
      if (last.ok) b = last.board;
    }
    expect(last.ok).toBe(true);
    if (last.ok) {
      expect(last.win.won).toBe(false);
      expect(last.isDraw).toBe(true);
      expect(isBoardFull(last.board)).toBe(true);
    }
  });

  it('rejects full column', () => {
    let b = createEmptyBoard();
    for (let i = 0; i < CONNECT_FOUR_ROWS; i++) {
      const r = dropDisc(b, 0, i % 2 === 0 ? 'R' : 'Y');
      if (!r.ok) break;
      b = r.board;
    }
    expect(dropDisc(b, 0, 'R').ok).toBe(false);
  });
});
