/**
 * Patient portal — self-service routes with ownership enforcement.
 */

import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Patch,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma/prisma.service';
import { HmsAuditWriter } from '../audit/hms-audit.writer';
import type { AuthUserPublic } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

class UpdateMyProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;
}

@ApiTags('patient-portal')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PATIENT')
@Controller('me')
export class PatientPortalController {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly audit: HmsAuditWriter,
  ) {}

  private async requireOwnPatient(userId: string) {
    const patient = await this.prisma.patients.findFirst({
      where: { user_id: userId, deleted_at: null },
      include: {
        user: { include: { core_profiles_user_id: true } },
      },
    });
    if (!patient) {
      throw new NotFoundException('Patient profile not found for this account');
    }
    return patient;
  }

  @Get('profile')
  @ApiOperation({ summary: 'Own patient profile' })
  async profile(@Req() req: { user: AuthUserPublic }) {
    const patient = await this.requireOwnPatient(req.user.id);
    const profile = patient.user.core_profiles_user_id[0];
    await this.audit.recordAccess({
      userId: req.user.id,
      patientId: patient.id,
      entityType: 'patients.patients',
      entityId: patient.id,
    });
    return {
      patientId: patient.id,
      mrn: patient.patient_number,
      firstName: profile?.first_name,
      lastName: profile?.last_name,
      phone: profile?.phone,
      gender: profile?.gender,
      dateOfBirth: profile?.date_of_birth,
      address: profile?.address,
      bloodGroup: patient.blood_group,
      allergies: patient.allergies,
    };
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update own profile (non-clinical fields)' })
  async updateProfile(
    @Req() req: { user: AuthUserPublic },
    @Body() body: UpdateMyProfileDto,
  ) {
    const patient = await this.requireOwnPatient(req.user.id);
    const profile = patient.user.core_profiles_user_id[0];
    if (!profile) throw new NotFoundException('Profile not found');
    const updated = await this.prisma.profiles.update({
      where: { id: profile.id },
      data: {
        ...(body.firstName !== undefined ? { first_name: body.firstName } : {}),
        ...(body.lastName !== undefined ? { last_name: body.lastName } : {}),
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
        ...(body.address !== undefined ? { address: body.address } : {}),
      },
    });
    await this.audit.recordMutation({
      userId: req.user.id,
      action: 'UPDATE',
      entityType: 'core.profiles',
      entityId: updated.id,
      newValues: {
        firstName: body.firstName,
        lastName: body.lastName,
        phone: body.phone,
      },
    });
    return { ok: true };
  }

  @Get('appointments')
  @ApiOperation({ summary: 'Own appointments' })
  async appointments(@Req() req: { user: AuthUserPublic }) {
    const patient = await this.requireOwnPatient(req.user.id);
    const rows = await this.prisma.appointments.findMany({
      where: { patient_id: patient.id, deleted_at: null },
      orderBy: { appointment_date: 'desc' },
      take: 50,
    });
    await this.audit.recordAccess({
      userId: req.user.id,
      patientId: patient.id,
      entityType: 'clinical.appointments',
      entityId: patient.id,
    });
    return rows.map((r) => ({
      id: r.id,
      date: r.appointment_date.toISOString().slice(0, 10),
      status: r.status,
      type: r.appointment_type,
      reason: r.reason,
    }));
  }

  @Get('prescriptions')
  @ApiOperation({ summary: 'Own prescriptions' })
  async prescriptions(@Req() req: { user: AuthUserPublic }) {
    const patient = await this.requireOwnPatient(req.user.id);
    const rows = await this.prisma.prescriptions.findMany({
      where: { patient_id: patient.id, deleted_at: null },
      include: {
        pharmacy_prescription_lines_prescription_id: {
          include: { medication: true },
        },
      },
      orderBy: { prescription_date: 'desc' },
      take: 50,
    });
    await this.audit.recordAccess({
      userId: req.user.id,
      patientId: patient.id,
      entityType: 'pharmacy.prescriptions',
      entityId: patient.id,
    });
    return rows.map((r) => ({
      id: r.id,
      number: r.prescription_number,
      date: r.prescription_date.toISOString(),
      status: r.status,
      lines: r.pharmacy_prescription_lines_prescription_id.map((l) => ({
        medication: l.medication.medication_name,
        dosage: l.dosage,
        frequency: l.frequency,
        status: l.status,
      })),
    }));
  }

  @Get('lab-results')
  @ApiOperation({ summary: 'Own lab results (verified/completed only)' })
  async labResults(@Req() req: { user: AuthUserPublic }) {
    const patient = await this.requireOwnPatient(req.user.id);
    const requests = await this.prisma.laboratoryRequests.findMany({
      where: {
        patient_id: patient.id,
        status: { in: ['COMPLETED', 'IN_PROGRESS'] },
      },
      include: {
        laboratory_results_request_id: {
          include: { parameter: true },
          where: { verified_at: { not: null } },
        },
      },
      orderBy: { created_at: 'desc' },
      take: 40,
    });
    await this.audit.recordAccess({
      userId: req.user.id,
      patientId: patient.id,
      entityType: 'laboratory.results',
      entityId: patient.id,
    });
    return requests.map((r) => ({
      requestId: r.id,
      requestNumber: r.request_number,
      status: r.status,
      results: r.laboratory_results_request_id.map((res) => ({
        parameter: res.parameter.parameter_name,
        value: res.result_value,
        interpretation: res.interpretation,
        verifiedAt: res.verified_at,
      })),
    }));
  }

  @Get('invoices')
  @ApiOperation({ summary: 'Own invoices' })
  async invoices(@Req() req: { user: AuthUserPublic }) {
    const patient = await this.requireOwnPatient(req.user.id);
    const rows = await this.prisma.invoices.findMany({
      where: { patient_id: patient.id, deleted_at: null, is_voided: false },
      orderBy: { invoice_date: 'desc' },
      take: 40,
    });
    await this.audit.recordAccess({
      userId: req.user.id,
      patientId: patient.id,
      entityType: 'billing.invoices',
      entityId: patient.id,
    });
    return rows.map((r) => ({
      id: r.id,
      number: r.invoice_number,
      date: r.invoice_date.toISOString().slice(0, 10),
      total: Number(r.total_amount),
      status: r.status,
    }));
  }

  /** Block accidental use of staff :id patterns from this controller. */
  assertOwnership(user: AuthUserPublic, patientUserId: string): void {
    if (user.id !== patientUserId) {
      throw new ForbiddenException('You can only access your own records');
    }
  }
}
