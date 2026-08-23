/**
 * File: diagnoses.controller.ts
 * Module: diagnoses
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
import { CreateDiagnosDto, DiagnosesQueryDto, UpdateDiagnosDto } from './dto';
import { DiagnosesService } from './diagnoses.service';

@ApiTags('Diagnoses')
@ApiBearerAuth()
@Controller('diagnoses')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'DOCTOR')
export class DiagnosesController {
  public constructor(private readonly service: DiagnosesService) {}

  @Post()
  @ApiOperation({ summary: 'Create diagnos' })
  create(@Body() dto: CreateDiagnosDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List diagnoses (paginated)' })
  findAll(@Query() query: DiagnosesQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get diagnos by id' })
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update diagnos' })
  update(@Param('id') id: string, @Body() dto: UpdateDiagnosDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Soft-delete diagnos' })
  remove(@Param('id') id: string) {
    return this.service.softDelete(id);
  }
}
