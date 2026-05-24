import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  TOURNAMENT_MVP_PLAYER_COUNT,
} from '../constants/tournament.constants';

const I18N_TITLE_EXAMPLE = {
  es: 'Torneo Connect Four',
  en: 'Connect Four Tournament',
  fr: 'Tournoi Connect Four',
  de: 'Connect Four Turnier',
  it: 'Torneo Connect Four',
  pt: 'Torneio Connect Four',
};

const I18N_DESC_EXAMPLE = {
  es: 'Compite por el premio mayor.',
  en: 'Compete for the top prize.',
  fr: 'Participez pour le grand prix.',
  de: 'Kämpfe um den Hauptpreis.',
  it: 'Competi per il primo premio.',
  pt: 'Compita pelo prêmio principal.',
};

export class CreateTournamentDto {
  @ApiProperty({ example: I18N_TITLE_EXAMPLE })
  @IsObject()
  title: Record<string, string>;

  @ApiPropertyOptional({ example: I18N_DESC_EXAMPLE })
  @IsOptional()
  @IsObject()
  description?: Record<string, string>;

  @ApiProperty()
  @IsString()
  gameId: string;

  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  buyIn: number;

  @ApiProperty({ default: TOURNAMENT_MVP_PLAYER_COUNT })
  @IsNumber()
  @Min(2)
  @Max(1000)
  maxPlayers: number = TOURNAMENT_MVP_PLAYER_COUNT;

  @ApiProperty({ default: TOURNAMENT_MVP_PLAYER_COUNT })
  @IsNumber()
  @Min(2)
  @Max(1000)
  minPlayers: number = TOURNAMENT_MVP_PLAYER_COUNT;

  @ApiPropertyOptional({ default: 5 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  groupCount?: number;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  groupSize?: number;

  @ApiProperty()
  @IsDateString()
  startsAt: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  registrationOpensAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  registrationClosesAt?: string;

  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @IsNumber()
  @Min(15)
  @Max(180)
  turnTimerSeconds?: number;

  @ApiPropertyOptional({ default: 300 })
  @IsOptional()
  @IsNumber()
  @Min(60)
  @Max(900)
  betweenRoundsPauseSeconds?: number;

  @ApiPropertyOptional({ default: 90 })
  @IsOptional()
  @IsNumber()
  @Min(30)
  @Max(180)
  presenceWindowSeconds?: number;

  @ApiPropertyOptional({ default: 60 })
  @IsOptional()
  @IsNumber()
  @Min(30)
  @Max(300)
  rematchDelaySeconds?: number;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  houseFeePercent?: number;

  @ApiPropertyOptional({ default: 70 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  firstPlacePercent?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  secondPlacePercent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bracketSeed?: string;
}

export class UpdateTournamentDto {
  @ApiPropertyOptional({ example: I18N_TITLE_EXAMPLE })
  @IsOptional()
  @IsObject()
  title?: Record<string, string>;

  @ApiPropertyOptional({ example: I18N_DESC_EXAMPLE })
  @IsOptional()
  @IsObject()
  description?: Record<string, string>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gameId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  buyIn?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(2)
  @Max(1000)
  maxPlayers?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(2)
  @Max(1000)
  minPlayers?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  groupCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  groupSize?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  registrationOpensAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  registrationClosesAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(15)
  @Max(180)
  turnTimerSeconds?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(60)
  @Max(900)
  betweenRoundsPauseSeconds?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(30)
  @Max(180)
  presenceWindowSeconds?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(30)
  @Max(300)
  rematchDelaySeconds?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  houseFeePercent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  firstPlacePercent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  secondPlacePercent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bracketSeed?: string;
}
