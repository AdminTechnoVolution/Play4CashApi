import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import {
  TOURNAMENT_MVP_PLAYER_COUNT,
} from '../constants/tournament.constants';

export class CreateTournamentDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsString()
  gameId: string;

  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  buyIn: number;

  @ApiProperty({ default: TOURNAMENT_MVP_PLAYER_COUNT })
  @IsNumber()
  @Min(TOURNAMENT_MVP_PLAYER_COUNT)
  @Max(TOURNAMENT_MVP_PLAYER_COUNT)
  maxPlayers: number = TOURNAMENT_MVP_PLAYER_COUNT;

  @ApiProperty({ default: TOURNAMENT_MVP_PLAYER_COUNT })
  @IsNumber()
  @Min(TOURNAMENT_MVP_PLAYER_COUNT)
  @Max(TOURNAMENT_MVP_PLAYER_COUNT)
  minPlayers: number = TOURNAMENT_MVP_PLAYER_COUNT;

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
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

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
