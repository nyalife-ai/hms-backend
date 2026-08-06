/**
 * File: follow-ups.controller.ts
 * Module: follow-ups
 * Purpose: HTTP controller with Swagger + pagination query.
 */

import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
// import { Public } from '../../common/decorators/public.decorator';
import type { CreateFollowUpDto, FollowUpsQueryDto, UpdateFollowUpDto } from './dto';
import { FollowUpsService } from './follow-ups.service';

@ApiTags('FollowUps')
@Controller('follow-ups')
export class FollowUpsController {
  public constructor(private readonly service: FollowUpsService) {}

  @Post()
  @ApiOperation({ summary: 'Create follow-up' })
  create(@Body() dto: CreateFollowUpDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List follow-ups (paginated)' })
  // @Public()
  findAll(@Query() query: FollowUpsQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get follow-up by id' })
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update follow-up' })
  update(@Param('id') id: string, @Body() dto: UpdateFollowUpDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete follow-up' })
  remove(@Param('id') id: string) {
    return this.service.softDelete(id);
  }
}
