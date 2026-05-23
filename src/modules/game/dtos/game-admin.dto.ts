import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateGameDto {
  @ApiProperty({
    example: { es: 'Ajedrez', en: 'Chess', fr: 'Échecs', de: 'Schach', it: 'Scacchi', pt: 'Xadrez' },
  })
  @IsObject()
  name: Record<string, string>;

  @ApiProperty({
    example: {
      es: 'El clásico juego de estrategia.',
      en: 'The classic strategy game.',
      fr: 'Le jeu de stratégie classique.',
      de: 'Das klassische Strategiespiel.',
      it: 'Il classico gioco di strategia.',
      pt: 'O clássico jogo de estratégia.',
    },
  })
  @IsObject()
  description: Record<string, string>;

  @ApiPropertyOptional({
    type: 'array',
    items: {
      type: 'object',
      example: { es: 'Regla 1', en: 'Rule 1', fr: 'Règle 1', de: 'Regel 1', it: 'Regola 1', pt: 'Regra 1' },
    },
  })
  @IsOptional()
  @IsArray()
  rules?: Array<Record<string, string>>;

  @ApiProperty()
  @IsBoolean()
  active: boolean;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  min_players: number;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  max_players: number;

  @ApiProperty({ minimum: 0 })
  @IsNumber()
  @Min(0)
  min_bet: number;

  @ApiProperty({ type: [Number] })
  @IsArray()
  default_bets: number[];

  @ApiProperty({ minimum: 1, maximum: 100 })
  @IsNumber()
  @Min(1)
  @Max(100)
  house_edge: number;

  @ApiProperty()
  @IsString()
  socket_code: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  turn_timer_seconds: number;

  @ApiPropertyOptional({ minimum: 50, maximum: 500 })
  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(500)
  uno_match_target?: number;
}

export class UpdateGameDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  name?: Record<string, string>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  description?: Record<string, string>;

  @ApiPropertyOptional({ type: 'array', items: { type: 'object' } })
  @IsOptional()
  @IsArray()
  rules?: Array<Record<string, string>>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  min_players?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  max_players?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  min_bet?: number;

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  default_bets?: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  house_edge?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  socket_code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  turn_timer_seconds?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(500)
  uno_match_target?: number;
}
