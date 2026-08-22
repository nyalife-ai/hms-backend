/**
 * File: notification-response.dto.ts
 * Module: notifications
 * Purpose: Notification response DTO.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class NotificationResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() notificationType!: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional() body?: string | null;
  @ApiProperty() priority!: string;
  @ApiProperty() isRead!: boolean;
  @ApiPropertyOptional() readAt?: Date | null;
  @ApiPropertyOptional() expiresAt?: Date | null;
  @ApiPropertyOptional() entityType?: string | null;
  @ApiPropertyOptional() entityId?: string | null;
  @ApiPropertyOptional() actionPath?: string | null;
  @ApiProperty() deliveryStatus!: string;
  @ApiPropertyOptional() wsDeliveredAt?: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
