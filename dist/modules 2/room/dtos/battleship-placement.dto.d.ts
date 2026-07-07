declare class ShipDto {
    type: string;
    startRow: number;
    startCol: number;
    isHorizontal: boolean;
    cells: number[][];
}
export declare class BattleshipPlacementDto {
    ships: ShipDto[];
}
export {};
