/**
 * File: procedures.controller.ts
 * Module: procedures
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
import { CreateProcedureDto, ProceduresQueryDto, UpdateProcedureDto } from './dto';
import { ProceduresService } from './procedures.service';

@ApiTags('Procedures')
@ApiBearerAuth()
@Controller('procedures')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'DOCTOR')
export class ProceduresController {
  public constructor(private readonly service: ProceduresService) {}

  @Post()
  @ApiOperation({ summary: 'Create procedure' })
  create(@Body() dto: CreateProcedureDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List procedures (paginated)' })
  findAll(@Query() query: ProceduresQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get procedure by id' })
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update procedure' })
  update(@Param('id') id: string, @Body() dto: UpdateProcedureDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Soft-delete procedure' })
  remove(@Param('id') id: string) {
    return this.service.softDelete(id);
  }
}
