import { IsBoolean, IsIn, IsMongoId, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RunGameAuditDto {
  @IsOptional()
  @IsMongoId()
  room_id?: string;

  @IsOptional()
  @IsIn(['all', 'unrefunded', 'with_refunds'])
  review_filter?: 'all' | 'unrefunded' | 'with_refunds';
}

export class ReverseGameBalanceDto {
  @IsMongoId()
  player_id: string;

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason: string;

  @IsOptional()
  @IsBoolean()
  inconclusive_override?: boolean;

  /** Admin financial TOTP; required when FINANCE_V2_ENABLED. */
  @IsOptional()
  @Matches(/^\d{6}$/)
  code?: string;
}
