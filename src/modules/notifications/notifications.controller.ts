/**
 * File: notifications.controller.ts
 * Module: notifications
 * Purpose: HTTP controller — durable in-app notifications + SMS + preferences.
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/user.decorator';
import type { AuthUserPublic } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  CreateNotificationDto,
  NotificationsQueryDto,
  RegisterDeviceTokenDto,
  SendSmsDto,
  UpdateNotificationDto,
} from './dto';
import { NotificationsService } from './notifications.service';

const STAFF_ROLES = [
  'ADMIN',
  'SUPER_ADMIN',
  'RECEPTIONIST',
  'NURSE',
  'DOCTOR',
  'PHARMACIST',
  'LAB_TECHNICIAN',
  'RADIOLOGIST',
  'ACCOUNTANT',
  'PATIENT',
] as const;

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('notifications')
export class NotificationsController {
  public constructor(private readonly service: NotificationsService) {}

  @Post('sms')
  @Roles('ADMIN')
  @ApiOperation({
    summary:
      'Admin smoke-test SMS (patientId|userId + templateKey). Provider config from env. Pass ?sync=true to send inline.',
  })
  @ApiBody({ type: SendSmsDto })
  sendSms(@Body() dto: SendSmsDto, @Query('sync') sync?: string) {
    return this.service.sendSms(dto, {
      sync: sync === 'true' || sync === '1',
    });
  }

  @Get('me')
  @Roles(...STAFF_ROLES)
  @ApiOperation({
    summary: 'List current user notifications (durable notification center)',
  })
  findMine(
    @CurrentUser() user: AuthUserPublic,
    @Query() query: NotificationsQueryDto,
  ) {
    return this.service.findMine(user.id, query);
  }

  @Get('me/unread-count')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Unread notification count for current user' })
  unreadCount(@CurrentUser() user: AuthUserPublic) {
    return this.service.unreadCount(user.id);
  }

  @Get('me/preferences')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Notification preferences (sound, etc.)' })
  getPreferences(@CurrentUser() user: AuthUserPublic) {
    return this.service.getPreferences(user.id);
  }

  @Patch('me/preferences')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Update notification preferences' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        notificationSoundEnabled: { type: 'boolean' },
      },
    },
  })
  updatePreferences(
    @CurrentUser() user: AuthUserPublic,
    @Body() body: { notificationSoundEnabled?: boolean },
  ) {
    return this.service.updatePreferences(user.id, body);
  }

  @Post('me/:id/read')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Mark a notification as read' })
  markRead(
    @CurrentUser() user: AuthUserPublic,
    @Param('id') id: string,
  ) {
    return this.service.markRead(user.id, id);
  }

  @Post('me/read-all')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllRead(@CurrentUser() user: AuthUserPublic) {
    return this.service.markAllRead(user.id);
  }

  @Post('device-tokens')
  @Roles(...STAFF_ROLES)
  @ApiOperation({
    summary: 'Register/refresh the current user FCM device token (required for push)',
  })
  @ApiBody({ type: RegisterDeviceTokenDto })
  registerDeviceToken(
    @CurrentUser() user: AuthUserPublic,
    @Body() dto: RegisterDeviceTokenDto,
  ) {
    return this.service.registerDeviceToken(user.id, dto);
  }

  @Delete('device-tokens')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Deactivate an FCM device token for the current user' })
  unregisterDeviceToken(
    @CurrentUser() user: AuthUserPublic,
    @Body() body: { token: string },
  ) {
    return this.service.unregisterDeviceToken(user.id, body.token);
  }

  @Post()
  @Roles('ADMIN', 'RECEPTIONIST', 'NURSE', 'DOCTOR')
  @ApiOperation({ summary: 'Create in-app notification' })
  @ApiBody({ type: CreateNotificationDto })
  create(@Body() dto: CreateNotificationDto) {
    return this.service.create(dto);
  }

  @Get()
  @Roles('ADMIN', 'RECEPTIONIST', 'NURSE', 'DOCTOR', 'PATIENT')
  @ApiOperation({ summary: 'List notifications (paginated)' })
  findAll(
    @CurrentUser() user: AuthUserPublic,
    @Query() query: NotificationsQueryDto,
  ) {
    // Non-admins are scoped to their own notifications.
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return this.service.findMine(user.id, query);
    }
    return this.service.findAll(query);
  }

  @Get(':id')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Get notification by id' })
  findOne(
    @CurrentUser() user: AuthUserPublic,
    @Param('id') id: string,
  ) {
    return this.service.findByIdForUser(user, id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'RECEPTIONIST', 'NURSE', 'DOCTOR', 'PHARMACIST', 'LAB_TECHNICIAN', 'RADIOLOGIST', 'ACCOUNTANT', 'PATIENT')
  @ApiOperation({ summary: 'Update notification' })
  @ApiBody({ type: UpdateNotificationDto })
  update(
    @CurrentUser() user: AuthUserPublic,
    @Param('id') id: string,
    @Body() dto: UpdateNotificationDto,
  ) {
    return this.service.updateForUser(user, id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete notification' })
  remove(@Param('id') id: string) {
    return this.service.softDelete(id);
  }
}
