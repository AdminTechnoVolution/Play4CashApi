import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({ required: false, description: 'Optional when refresh is sent via httpOnly cookie' })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
