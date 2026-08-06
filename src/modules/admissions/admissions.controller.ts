/**
 * File: admissions.controller.ts
 * Module: admissions
 * Purpose: Read-compatible scaffold. Clinical mutations must use /ipd/*.
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  GoneException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  CreateAdmissionDto,
  AdmissionsQueryDto,
  UpdateAdmissionDto,
} from './dto';
import { AdmissionsService } from './admissions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { IpdOperationsUseCase } from '../inpatient/use-cases/ipd-operations.usecase';

const IPD_MUTATION_HINT =
  'Clinical admission mutations use /ipd/admissions (admit, transfer, transfer-out, discharge). Scaffold CRUD is not the source of truth.';

@ApiTags('Admissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admissions')
export class AdmissionsController {
  public constructor(
    private readonly service: AdmissionsService,
    private readonly ops: IpdOperationsUseCase,
  ) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Deprecated — use POST /ipd/admissions' })
  create(@Body() _dto: CreateAdmissionDto) {
    throw new GoneException(IPD_MUTATION_HINT);
  }

  @Get()
  @Roles('ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST')
  @ApiOperation({
    summary: 'List admissions (prefer GET /ipd/admissions for clinical board)',
  })
  findAll(@Query() query: AdmissionsQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @Roles('ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST')
  @ApiOperation({
    summary: 'Get admission detail via IPD (prefer GET /ipd/admissions/:id)',
  })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.ops.getAdmission(id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'DOCTOR')
  @ApiOperation({ summary: 'Deprecated — use /ipd admission workflows' })
  update(
    @Param('id', ParseUUIDPipe) _id: string,
    @Body() _dto: UpdateAdmissionDto,
  ) {
    throw new GoneException(IPD_MUTATION_HINT);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Deprecated — discharge or transfer-out via /ipd instead of delete',
  })
  remove(@Param('id', ParseUUIDPipe) _id: string) {
    throw new GoneException(IPD_MUTATION_HINT);
  }
}
