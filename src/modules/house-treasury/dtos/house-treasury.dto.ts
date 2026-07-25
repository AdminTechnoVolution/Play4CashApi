import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsIn,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { HouseLedgerType } from '../schemas/house-ledger.schema';

export class CreateHouseWithdrawalDto {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount: number;
  @Type(() => Date) @IsDate() occurred_at: Date;
  @IsString() @Length(3, 120) purpose: string;
  @IsString() @Length(2, 60) category: string;
  @IsString() @Length(3, 180) destination: string;
  @IsString() @Length(3, 180) external_reference: string;
  @IsOptional() @IsString() @Length(0, 1000) notes?: string;
  @IsString() @Length(8, 160) idempotency_key: string;
}

export class CreateHouseAdjustmentDto {
  @IsIn(['credit', 'debit']) direction: 'credit' | 'debit';
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount: number;
  @Type(() => Date) @IsDate() occurred_at: Date;
  @IsString() @Length(10, 500) reason: string;
  @IsMongoId() correction_of: string;
  @IsString() @Length(8, 160) idempotency_key: string;
}

export class HouseLedgerQueryDto {
  @IsOptional() @IsEnum(HouseLedgerType) type?: HouseLedgerType;
  @IsOptional() @IsString() game_code?: string;
  @IsOptional() @IsMongoId() room_id?: string;
  @IsOptional() @IsMongoId() tournament_id?: string;
  @IsOptional() @IsMongoId() administrator_id?: string;
  @IsOptional() @Type(() => Date) @IsDate() from?: Date;
  @IsOptional() @Type(() => Date) @IsDate() to?: Date;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(200) limit = 25;
}

