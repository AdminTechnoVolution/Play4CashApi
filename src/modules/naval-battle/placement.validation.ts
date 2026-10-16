import { BadRequestException } from '@nestjs/common';
const sizes: Record<string, number> = { carrier: 5, battleship: 4, cruiser: 3, submarine: 3, destroyer: 2 };
export function validateFleet(input: unknown) {
  if (!Array.isArray(input) || input.length !== 5) throw new BadRequestException('INVALID_FLEET');
  const types = new Set<string>();
  const occupied = new Set<string>();
  return input.map(ship => {
    if (!ship || typeof ship !== 'object' || !Object.hasOwn(sizes, ship.type) || types.has(ship.type)
      || !Array.isArray(ship.cells) || ship.cells.length !== sizes[ship.type]) throw new BadRequestException('INVALID_FLEET');
    types.add(ship.type);
    const cells = ship.cells.map((cell: unknown) => {
      if (!Array.isArray(cell) || cell.length !== 2 || cell.some(v => !Number.isInteger(v) || v < 0 || v > 9)) throw new BadRequestException('INVALID_SHIP_CELL');
      const key = `${cell[0]},${cell[1]}`;
      if (occupied.has(key)) throw new BadRequestException('SHIPS_OVERLAP');
      occupied.add(key);
      return [cell[0], cell[1]] as number[];
    }).sort((a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1]);
    const horizontal = cells.every((cell: number[]) => cell[0] === cells[0][0]);
    const vertical = cells.every((cell: number[]) => cell[1] === cells[0][1]);
    if (!horizontal && !vertical) throw new BadRequestException('SHIP_MUST_BE_STRAIGHT');
    for (let i = 1; i < cells.length; i++) {
      if ((horizontal ? cells[i][1] - cells[i - 1][1] : cells[i][0] - cells[i - 1][0]) !== 1) throw new BadRequestException('SHIP_MUST_BE_CONTIGUOUS');
    }
    if ((ship.startRow !== undefined && ship.startRow !== cells[0][0])
      || (ship.startCol !== undefined && ship.startCol !== cells[0][1])
      || (ship.isHorizontal !== undefined && ship.isHorizontal !== horizontal)) throw new BadRequestException('SHIP_METADATA_MISMATCH');
    return { type: ship.type, startRow: cells[0][0], startCol: cells[0][1], isHorizontal: horizontal, cells };
  });
}
