import { IsArray, IsInt, IsString, IsNotEmpty, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class ShipDto {
  @ApiProperty({ description: 'Type of ship (carrier, battleship, cruiser, submarine, destroyer)' })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiProperty({ description: 'Start row (0-9)' })
  @IsInt()
  startRow: number;

  @ApiProperty({ description: 'Start column (0-9)' })
  @IsInt()
  startCol: number;

  @ApiProperty({ description: 'Is ship horizontal' })
  isHorizontal: boolean;

  @ApiProperty({ description: 'Array of coordinates [row, col]', type: 'array', items: { type: 'array', items: { type: 'number' } } })
  @IsArray()
  @IsArray({ each: true })
  cells: number[][];
}

export class BattleshipPlacementDto {
  @ApiProperty({ type: [ShipDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShipDto)
  ships: ShipDto[];
}
