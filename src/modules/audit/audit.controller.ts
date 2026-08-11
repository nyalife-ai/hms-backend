/**
 * File: audit.controller.ts
 * Module: audit
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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { CreateAuditDto, AuditQueryDto, UpdateAuditDto } from './dto';
import { AuditService } from './audit.service';

@ApiTags('Audit')
@ApiBearerAuth()
@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AuditController {
  public constructor(private readonly service: AuditService) {}

  @Post()
  @ApiOperation({ summary: 'Create audit' })
  create(@Body() dto: CreateAuditDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List audit (paginated)' })
  findAll(@Query() query: AuditQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get audit by id' })
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update audit' })
  update(@Param('id') id: string, @Body() dto: UpdateAuditDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Soft-delete audit' })
  remove(@Param('id') id: string) {
    return this.service.softDelete(id);
  }
}
