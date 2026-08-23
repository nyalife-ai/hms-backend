/**
 * File: follow-ups.controller.ts
 * Module: follow-ups
 * Purpose: HTTP controller with Swagger + pagination query.
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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthUserPublic } from '../auth/auth.types';
import { CreateFollowUpDto, UpdateFollowUpDto } from './dto';
import { FollowUpsQueryDto } from './dto/follow-ups-query.dto';
import { FollowUpsService } from './follow-ups.service';

@ApiTags('FollowUps')
@ApiBearerAuth()
@Controller('follow-ups')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'RECEPTIONIST')
export class FollowUpsController {
  public constructor(private readonly service: FollowUpsService) {}

  @Post()
  @ApiOperation({ summary: 'Create follow-up' })
  create(@Body() dto: CreateFollowUpDto, @CurrentUser() user: AuthUserPublic) {
    return this.service.create({ ...dto, createdBy: dto.createdBy || user.id });
  }

  @Get('summary')
  @ApiOperation({
    summary:
      'Follow-up KPIs (scheduledThisMonth, completedThisMonth, dueWithin7Days, overdue)',
  })
  summary(@CurrentUser() user: AuthUserPublic) {
    return this.service.summary(user);
  }

  @Get()
  @ApiOperation({ summary: 'List follow-ups (paginated)' })
  findAll(
    @Query() query: FollowUpsQueryDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.service.findAll(query, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get follow-up by id' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUserPublic) {
    return this.service.findById(id, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update follow-up (status, date, reason, notes, type)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateFollowUpDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  @ApiOperation({ summary: 'Cancel follow-up (status → CANCELLED)' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUserPublic) {
    return this.service.softDelete(id, user);
  }
}
