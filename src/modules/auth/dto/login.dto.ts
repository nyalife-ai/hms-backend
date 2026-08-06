import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import type { HmsRole } from '../auth.types';

const ROLES = [
  'ADMIN',
  'DOCTOR',
  'NURSE',
  'RECEPTIONIST',
  'PHARMACIST',
  'LAB_TECHNICIAN',
  'RADIOLOGIST',
  'ACCOUNTANT',
] as const;

export class LoginDto {
  @ApiProperty({ example: 'admin@nyalife.health' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'nyalife123' })
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password!: string;
}

export class RegisterPatientDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ enum: ['MALE', 'FEMALE', 'OTHER'] })
  @IsOptional()
  @IsIn(['MALE', 'FEMALE', 'OTHER'])
  gender?: 'MALE' | 'FEMALE' | 'OTHER';

  @ApiPropertyOptional({ example: '1990-01-15' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateOfBirth?: string;
}

export class ForgotPasswordDto {
  @ApiProperty()
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(20)
  resetToken!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}

export class DemoLoginDto {
  @ApiProperty({ enum: ROLES, example: 'RECEPTIONIST' })
  @IsIn(ROLES)
  role!: HmsRole;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  @MinLength(20)
  refreshToken!: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  currentPassword!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}

export class LogoutDto {
  @ApiPropertyOptional({
    description: 'Refresh token to revoke. Omit to revoke all sessions.',
  })
  @IsOptional()
  @IsString()
  @MinLength(20)
  refreshToken?: string;
}

export class AuthUserResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  role!: HmsRole;

  @ApiProperty()
  position!: string;

  @ApiProperty({ type: [String] })
  permissions!: string[];
}

export class AuthResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty({ example: '15m' })
  expiresIn!: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: 'Bearer';

  @ApiProperty({ type: AuthUserResponseDto })
  user!: AuthUserResponseDto;
}
