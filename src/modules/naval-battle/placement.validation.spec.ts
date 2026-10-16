import { validateFleet } from './placement.validation';
const fleet = () => [ ['carrier', 5], ['battleship', 4], ['cruiser', 3], ['submarine', 3], ['destroyer', 2] ].map(([type, size], row) => ({ type, cells: Array.from({ length: Number(size) }, (_, col) => [row, col]) }));
describe('server-authoritative ship placement', () => {
  it('normalizes a complete valid fleet', () => expect(validateFleet(fleet())[0]).toMatchObject({ startRow: 0, startCol: 0, isHorizontal: true }));
  it('rejects missing ships and fractional / out-of-bounds cells', () => {
    expect(() => validateFleet(fleet().slice(1))).toThrow('INVALID_FLEET');
    const invalid = fleet(); invalid[0].cells[0] = [0.5, 0]; expect(() => validateFleet(invalid)).toThrow('INVALID_SHIP_CELL');
  });
  it('rejects dispersed cells, overlaps and contradictory metadata', () => {
    const dispersed = fleet(); dispersed[0].cells[4] = [0, 8]; expect(() => validateFleet(dispersed)).toThrow('CONTIGUOUS');
    const overlapping = fleet(); overlapping[1].cells[0] = [0, 0]; expect(() => validateFleet(overlapping)).toThrow('OVERLAP');
    expect(() => validateFleet(fleet().map(s => ({ ...s, startRow: 9 })))).toThrow('METADATA_MISMATCH');
  });
});
