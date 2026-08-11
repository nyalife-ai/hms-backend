import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { HmsRole } from '../auth/auth.types';
import { IpdJourneyUseCase } from './use-cases/ipd-journey.usecase';
import { IpdOperationsUseCase } from './use-cases/ipd-operations.usecase';

const IPD_ROLES: HmsRole[] = [
  'ADMIN',
  'DOCTOR',
  'NURSE',
  'RECEPTIONIST',
];

class DischargePrescriptionLineDto {
  @ApiProperty()
  @IsUUID()
  medicationId!: string;

  @ApiProperty()
  @IsString()
  dosage!: string;

  @ApiProperty()
  @IsString()
  frequency!: string;

  @ApiProperty()
  @IsString()
  duration!: string;

  @ApiProperty()
  @IsNumber()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  instructions?: string;
}

class DischargeAdmissionDto {
  @ApiProperty()
  @IsUUID()
  dischargingDoctorId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  diagnosis?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  summary?: string;

  @ApiPropertyOptional({ description: 'Free-text discharge medication notes' })
  @IsOptional()
  @IsString()
  medications?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  followUpInstructions?: string;

  @ApiPropertyOptional({
    type: [DischargePrescriptionLineDto],
    description: 'Formulary lines — creates a pharmacy prescription on discharge',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DischargePrescriptionLineDto)
  prescriptionLines?: DischargePrescriptionLineDto[];
}

@ApiTags('IPD Journey')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ipd')
export class InpatientController {
  constructor(
    private readonly journey: IpdJourneyUseCase,
    private readonly ops: IpdOperationsUseCase,
  ) {}

  @Get('overview')
  @Roles(...IPD_ROLES)
  overview() {
    return this.ops.overview();
  }

  // ── Wards ──────────────────────────────────────────────────────────
  @Get('wards')
  @Roles(...IPD_ROLES)
  listWards(
    @Query('active') active?: string,
    @Query('wardType') wardType?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.ops.listWards({
      active:
        active === 'true' ? true : active === 'false' ? false : undefined,
      wardType,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
      search,
    });
  }

  @Get('wards/:id')
  @Roles(...IPD_ROLES)
  getWard(@Param('id', ParseUUIDPipe) id: string) {
    return this.ops.getWard(id);
  }

  @Post('wards')
  @Roles('ADMIN')
  createWard(
    @Body()
    body: {
      name: string;
      wardType: string;
      departmentId?: string;
      dailyRate?: number;
      capacity?: number;
      isActive?: boolean;
    },
  ) {
    return this.journey.createWard(body);
  }

  @Patch('wards/:id')
  @Roles('ADMIN')
  updateWard(
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    body: {
      name?: string;
      wardType?: string;
      departmentId?: string;
      dailyRate?: number;
      capacity?: number;
      isActive?: boolean;
    },
  ) {
    return this.ops.updateWard(id, body);
  }

  @Post('wards/:id/deactivate')
  @Roles('ADMIN')
  deactivateWard(@Param('id', ParseUUIDPipe) id: string) {
    return this.ops.deactivateWard(id);
  }

  // ── Beds ───────────────────────────────────────────────────────────
  @Get('beds')
  @Roles(...IPD_ROLES)
  listBeds(
    @Query('wardId') wardId?: string,
    @Query('status') status?: string,
    @Query('available') available?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.ops.listBeds({
      wardId,
      status: available === 'true' ? 'AVAILABLE' : status,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
      search,
    });
  }

  @Post('beds')
  @Roles('ADMIN')
  createBed(@Body() body: { wardId: string; bedNumber: string }) {
    return this.journey.createBed(body);
  }

  @Post('beds/bulk')
  @Roles('ADMIN')
  createBedsBulk(
    @Body() body: { wardId: string; bedNumbers: string[] },
  ) {
    return this.ops.createBedsBulk(body);
  }

  @Patch('beds/:id/status')
  @Roles('ADMIN', 'NURSE')
  updateBedStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user?: { id?: string } },
    @Body() body: { status: string },
  ) {
    return this.ops.updateBedStatus(id, body.status, req.user?.id);
  }

  // ── Admissions ─────────────────────────────────────────────────────
  @Get('admissions')
  @Roles(...IPD_ROLES)
  listAdmissions(
    @Query('status') status?: string,
    @Query('patientId') patientId?: string,
    @Query('active') active?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.ops.listAdmissions({
      status,
      patientId,
      activeOnly: active === 'true',
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
      search,
    });
  }

  @Get('admissions/active')
  @Roles(...IPD_ROLES)
  listActive() {
    return this.journey.listActiveAdmissions();
  }

  @Get('admissions/:id')
  @Roles(...IPD_ROLES)
  getAdmission(@Param('id', ParseUUIDPipe) id: string) {
    return this.ops.getAdmission(id);
  }

  @Post('admissions')
  @Roles('ADMIN', 'DOCTOR', 'RECEPTIONIST')
  admit(
    @Req() req: { user?: { id?: string } },
    @Body()
    body: {
      patientId: string;
      bedId: string;
      admittingDoctorId: string;
      primaryDiagnosis?: string;
    },
  ) {
    return this.journey.admit({
      ...body,
      actorUserId: req.user?.id,
    });
  }

  @Post('admissions/:id/transfer')
  @Roles('ADMIN', 'DOCTOR', 'NURSE')
  transfer(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user?: { id?: string } },
    @Body()
    body: { newBedId: string; reason?: string; authorizedBy?: string },
  ) {
    return this.journey.transfer({
      admissionId: id,
      newBedId: body.newBedId,
      reason: body.reason,
      authorizedBy: body.authorizedBy || req.user?.id || '',
    });
  }

  @Post('admissions/:id/transfer-out')
  @Roles('ADMIN', 'DOCTOR')
  transferOut(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user?: { id?: string } },
    @Body()
    body: { reason: string; destination?: string; authorizedBy?: string },
  ) {
    return this.journey.transferOut({
      admissionId: id,
      reason: body.reason,
      destination: body.destination,
      authorizedBy: body.authorizedBy || req.user?.id || '',
    });
  }

  @Post('admissions/:id/discharge')
  @Roles('ADMIN', 'DOCTOR')
  @ApiOperation({
    summary:
      'Discharge an admitted patient. Optional prescriptionLines create a formal pharmacy Rx.',
  })
  discharge(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user?: { id?: string } },
    @Body() body: DischargeAdmissionDto,
  ) {
    return this.journey.discharge({
      admissionId: id,
      dischargingDoctorId: body.dischargingDoctorId,
      diagnosis: body.diagnosis,
      summary: body.summary,
      medications: body.medications,
      followUpInstructions: body.followUpInstructions,
      prescriptionLines: body.prescriptionLines,
      finalizedBy: req.user?.id || body.dischargingDoctorId,
    });
  }

  @Post('admissions/:id/deceased')
  @Roles('ADMIN', 'DOCTOR')
  markDeceased(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user?: { id?: string } },
    @Body() body?: { notes?: string },
  ) {
    return this.ops.markDeceased({
      admissionId: id,
      actorUserId: req.user?.id || '',
      notes: body?.notes,
    });
  }

  @Get('admissions/:id/transfers')
  @Roles(...IPD_ROLES)
  transferHistory(@Param('id', ParseUUIDPipe) id: string) {
    return this.journey.listTransfers(id);
  }

  @Get('admissions/:id/nursing-notes')
  @Roles(...IPD_ROLES)
  listNursingNotes(@Param('id', ParseUUIDPipe) id: string) {
    return this.ops.listNursingNotes(id);
  }

  @Post('admissions/:id/nursing-notes')
  @Roles('ADMIN', 'NURSE', 'DOCTOR')
  createNursingNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user?: { id?: string } },
    @Body()
    body: {
      nurseId?: string;
      notesText: string;
      vitalSignsSnapshot?: Record<string, unknown>;
    },
  ) {
    return this.ops.addNursingNote({
      admissionId: id,
      nurseId: body.nurseId || req.user?.id || '',
      notesText: body.notesText,
      vitalSignsSnapshot: body.vitalSignsSnapshot,
      actorUserId: req.user?.id,
    });
  }

  @Get('admissions/:id/discharge-summary')
  @Roles(...IPD_ROLES)
  getDischargeSummary(@Param('id', ParseUUIDPipe) id: string) {
    return this.ops.getDischargeSummary(id);
  }

  @Post('admissions/:id/discharge-summary')
  @Roles('ADMIN', 'DOCTOR')
  upsertDischargeSummary(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user?: { id?: string } },
    @Body()
    body: {
      dischargeDiagnosis?: string;
      summaryOfTreatment?: string;
      dischargeMedications?: string;
      followUpInstructions?: string;
      dischargingDoctorId: string;
    },
  ) {
    return this.ops.upsertDischargeSummary({
      admissionId: id,
      ...body,
      actorUserId: req.user?.id,
    });
  }

  @Post('admissions/:id/discharge-summary/finalize')
  @Roles('ADMIN', 'DOCTOR')
  finalizeDischargeSummary(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.ops.finalizeDischargeSummary(id, req.user?.id || '');
  }

  // ── Reservations ───────────────────────────────────────────────────
  @Get('reservations')
  @Roles(...IPD_ROLES)
  listReservations(
    @Query('status') status?: string,
    @Query('bedId') bedId?: string,
    @Query('patientId') patientId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.ops.listReservations({
      status,
      bedId,
      patientId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
      search,
    });
  }

  @Post('reservations')
  @Roles('ADMIN', 'RECEPTIONIST', 'NURSE')
  reserve(
    @Req() req: { user?: { id?: string } },
    @Body()
    body: {
      bedId: string;
      patientId: string;
      expectedAdmissionDate: string;
      expiresAt: string;
      reservedBy?: string;
    },
  ) {
    return this.ops.reserveBed({
      bedId: body.bedId,
      patientId: body.patientId,
      expectedAdmissionDate: body.expectedAdmissionDate,
      expiresAt: body.expiresAt,
      reservedBy: body.reservedBy || req.user?.id || '',
    });
  }

  @Post('reservations/:id/cancel')
  @Roles('ADMIN', 'RECEPTIONIST', 'NURSE')
  cancelReservation(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.ops.cancelReservation(id, req.user?.id || '');
  }

  @Post('reservations/:id/expire')
  @Roles('ADMIN')
  expireReservation(@Param('id', ParseUUIDPipe) id: string) {
    return this.ops.expireReservation(id);
  }

  @Post('reservations/:id/convert')
  @Roles('ADMIN', 'DOCTOR', 'RECEPTIONIST')
  convertReservation(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user?: { id?: string } },
    @Body()
    body: { admittingDoctorId: string; primaryDiagnosis?: string },
  ) {
    return this.ops.convertReservation({
      reservationId: id,
      admittingDoctorId: body.admittingDoctorId,
      primaryDiagnosis: body.primaryDiagnosis,
      actorUserId: req.user?.id || '',
    });
  }

  @Get('nursing-notes/:id')
  @Roles(...IPD_ROLES)
  getNursingNote(@Param('id', ParseUUIDPipe) id: string) {
    return this.ops.getNursingNote(id);
  }
}
