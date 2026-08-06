/**
 * File: medications.controller.ts
 * Module: medications
 * Purpose: Compatibility routes — prefer /pharmacy/medications.
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
import type { CreateMedicationDto, MedicationsQueryDto, UpdateMedicationDto } from './dto';
import { MedicationsService } from './medications.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PharmacyOperationsUseCase } from '../pharmacy/use-cases/pharmacy-operations.usecase';

const HINT =
  'Medication mutations use /pharmacy/medications. Scaffold CRUD is not the clinical source of truth.';

@ApiTags('Medications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('medications')
export class MedicationsController {
  public constructor(
    private readonly service: MedicationsService,
    private readonly ops: PharmacyOperationsUseCase,
  ) {}

  @Post()
  @Roles('ADMIN', 'PHARMACIST')
  @ApiOperation({ summary: 'Deprecated — use POST /pharmacy/medications' })
  create(@Body() _dto: CreateMedicationDto) {
    throw new GoneException(HINT);
  }

  @Get()
  @Roles('ADMIN', 'PHARMACIST', 'DOCTOR', 'NURSE')
  @ApiOperation({ summary: 'List medications via pharmacy ops' })
  findAll(@Query() query: MedicationsQueryDto) {
    return this.ops.listMedications({
      search: query.search,
      take: query.limit,
    });
  }

  @Get(':id')
  @Roles('ADMIN', 'PHARMACIST', 'DOCTOR', 'NURSE')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.ops.getMedication(id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'PHARMACIST')
  update(
    @Param('id', ParseUUIDPipe) _id: string,
    @Body() _dto: UpdateMedicationDto,
  ) {
    throw new GoneException(HINT);
  }

  @Delete(':id')
  @Roles('ADMIN', 'PHARMACIST')
  remove(@Param('id', ParseUUIDPipe) _id: string) {
    throw new GoneException(HINT);
  }
}
