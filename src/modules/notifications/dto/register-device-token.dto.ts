/**
 * Register / refresh an FCM (or APNs-via-FCM) device token for the signed-in user.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDeviceTokenDto {
  @ApiProperty({
    description: 'FCM registration token from the client SDK',
    example: 'dXyz...long-token',
  })
  @IsString()
  @MinLength(32)
  @MaxLength(512)
  token!: string;

  @ApiProperty({
    enum: ['ANDROID', 'IOS', 'WEB'],
    example: 'ANDROID',
  })
  @IsIn(['ANDROID', 'IOS', 'WEB'])
  platform!: 'ANDROID' | 'IOS' | 'WEB';

  @ApiPropertyOptional({
    description: 'Stable client device id for upsert when the FCM token rotates',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  deviceId?: string;
}
