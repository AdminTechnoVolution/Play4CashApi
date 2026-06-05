import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ContactMessageStatus } from '../schemas/contact-message.schema';

export class UpdateContactDto {
  @ApiPropertyOptional({ enum: ContactMessageStatus })
  @IsOptional()
  @IsEnum(ContactMessageStatus)
  status?: ContactMessageStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  admin_notes?: string;
}
