import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ description: 'Google OAuth ID token' })
  @IsString()
  @IsNotEmpty()
  token: string;
}
