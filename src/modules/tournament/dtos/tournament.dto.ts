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
  TOURNAMENT_GROUP_SIZE,
  TOURNAMENT_MAX_PLAYERS,
  TOURNAMENT_MIN_PLAYERS,
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

  @ApiProperty({ default: 8, description: 'Even number — players are grouped in pairs (groupSize 2)' })
  @IsNumber()
  @Min(TOURNAMENT_MIN_PLAYERS)
  @Max(TOURNAMENT_MAX_PLAYERS)
  maxPlayers: number = 8;

  @ApiProperty({ default: 4, description: 'Even number, at least 2, cannot exceed maxPlayers' })
  @IsNumber()
  @Min(TOURNAMENT_MIN_PLAYERS)
  @Max(TOURNAMENT_MAX_PLAYERS)
  minPlayers: number = 4;

  @ApiPropertyOptional({
    default: TOURNAMENT_GROUP_SIZE,
    description: 'Must be 2 (pairs). groupCount is derived as maxPlayers / 2.',
  })
  @IsOptional()
  @IsNumber()
  @Min(TOURNAMENT_GROUP_SIZE)
  @Max(TOURNAMENT_GROUP_SIZE)
  groupSize?: number;

  @ApiPropertyOptional({
    description: 'Optional; defaults to maxPlayers / 2. Must match when provided.',
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(TOURNAMENT_MAX_PLAYERS / TOURNAMENT_GROUP_SIZE)
  groupCount?: number;

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
  @Min(TOURNAMENT_MIN_PLAYERS)
  @Max(TOURNAMENT_MAX_PLAYERS)
  maxPlayers?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(TOURNAMENT_MIN_PLAYERS)
  @Max(TOURNAMENT_MAX_PLAYERS)
  minPlayers?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(TOURNAMENT_MAX_PLAYERS / TOURNAMENT_GROUP_SIZE)
  groupCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(TOURNAMENT_GROUP_SIZE)
  @Max(TOURNAMENT_GROUP_SIZE)
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
