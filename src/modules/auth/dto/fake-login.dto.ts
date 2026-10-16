import { IsEmail, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Restricted to a reserved test-only domain (RFC 2606 `.test` TLD) so this endpoint
 * can never mint a session for a real user's email address, even by coincidence.
 */
export const FAKE_LOGIN_EMAIL_PATTERN = /^[a-z0-9._-]+@play4cash\.test$/;

export class FakeLoginDto {
  @ApiProperty({ description: 'Must be under the reserved play4cash.test domain', example: 'e2e-alice@play4cash.test' })
  @IsEmail()
  @Matches(FAKE_LOGIN_EMAIL_PATTERN, {
    message: 'email must be under the reserved play4cash.test domain',
  })
  email: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  name?: string;
}
