/**
 * File: audit.controller.ts
 * Module: audit
 * Purpose: HTTP controller with Swagger + pagination query.
 */

import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
// import { Public } from '../../common/decorators/public.decorator';
import type { CreateAuditDto, AuditQueryDto, UpdateAuditDto } from './dto';
import { AuditService } from './audit.service';

@ApiTags('Audit')
@Controller('audit')
export class AuditController {
  public constructor(private readonly service: AuditService) {}

  @Post()
  @ApiOperation({ summary: 'Create audit' })
  create(@Body() dto: CreateAuditDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List audit (paginated)' })
  // @Public()
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
  @ApiOperation({ summary: 'Soft-delete audit' })
  remove(@Param('id') id: string) {
    return this.service.softDelete(id);
  }
}
