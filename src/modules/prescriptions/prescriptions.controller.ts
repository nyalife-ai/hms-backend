/**
 * File: prescriptions.controller.ts
 * Module: prescriptions
 * Purpose: Compatibility — clinical Rx uses /pharmacy/prescriptions.
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
  CreatePrescriptionDto,
  PrescriptionsQueryDto,
  UpdatePrescriptionDto,
} from './dto';
import { PrescriptionsService } from './prescriptions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PharmacyJourneyUseCase } from '../pharmacy/use-cases/pharmacy-journey.usecase';

const HINT =
  'Clinical prescription workflows use /pharmacy/prescriptions (create with lines, cancel, void, dispense).';

@ApiTags('Prescriptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('prescriptions')
export class PrescriptionsController {
  public constructor(
    private readonly service: PrescriptionsService,
    private readonly journey: PharmacyJourneyUseCase,
  ) {}

  @Post()
  @Roles('ADMIN', 'PHARMACIST', 'DOCTOR')
  @ApiOperation({ summary: 'Deprecated — use POST /pharmacy/prescriptions' })
  create(@Body() _dto: CreatePrescriptionDto) {
    throw new GoneException(HINT);
  }

  @Get()
  @Roles('ADMIN', 'PHARMACIST', 'DOCTOR', 'NURSE')
  findAll(@Query() query: PrescriptionsQueryDto) {
    return this.journey.listPrescriptions({
      search: query.search,
      page: query.page ?? 1,
      limit: query.limit ?? 50,
    });
  }

  @Get(':id')
  @Roles('ADMIN', 'PHARMACIST', 'DOCTOR', 'NURSE')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.journey.getPrescription(id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'PHARMACIST', 'DOCTOR')
  update(
    @Param('id', ParseUUIDPipe) _id: string,
    @Body() _dto: UpdatePrescriptionDto,
  ) {
    throw new GoneException(HINT);
  }

  @Delete(':id')
  @Roles('ADMIN')
  remove(@Param('id', ParseUUIDPipe) _id: string) {
    throw new GoneException(HINT);
  }
}
