import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ContactMessageType } from '../schemas/contact-message.schema';

export class SubmitContactDto {
  @ApiProperty({ enum: ContactMessageType, example: ContactMessageType.COMMENT })
  @IsEnum(ContactMessageType)
  type: ContactMessageType;

  @ApiProperty({ minLength: 10, maxLength: 2000 })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  message: string;

  @ApiProperty({ type: [String], example: [] })
  @ValidateIf((dto: SubmitContactDto) => !dto.all_games)
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  game_ids: string[] = [];

  @ApiProperty({ example: false })
  @IsBoolean()
  all_games: boolean;
}
