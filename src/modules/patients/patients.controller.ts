/**
 * File: patients.controller.ts
 * Module: patients
 * Purpose: HTTP controller with Swagger + pagination query + RBAC + ownership.
 */

import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreatePatientDto, PatientsQueryDto, UpdatePatientDto } from './dto';
import { PatientsService } from './patients.service';
import type { AuthUserPublic } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../../database/prisma/prisma.service';
import { HmsAuditWriter } from '../audit/hms-audit.writer';

@ApiTags('Patients')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('patients')
export class PatientsController {
  public constructor(
    private readonly service: PatientsService,
    private readonly prisma: PrismaService,
    private readonly audit: HmsAuditWriter,
  ) {}

  @Post()
  @Roles('ADMIN', 'RECEPTIONIST', 'NURSE', 'DOCTOR')
  @ApiOperation({ summary: 'Create patient' })
  create(@Body() dto: CreatePatientDto) {
    return this.service.create(dto);
  }

  @Get()
  @Roles('ADMIN', 'RECEPTIONIST', 'NURSE', 'DOCTOR', 'ACCOUNTANT')
  @ApiOperation({ summary: 'List patients (paginated)' })
  findAll(@Query() query: PatientsQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @Roles('ADMIN', 'RECEPTIONIST', 'NURSE', 'DOCTOR', 'ACCOUNTANT', 'PATIENT')
  @ApiOperation({ summary: 'Get patient by id (patients: own record only)' })
  async findOne(
    @Param('id') id: string,
    @Req() req: { user: AuthUserPublic },
  ) {
    await this.assertPatientOwnership(req.user, id);
    const result = await this.service.findById(id);
    await this.audit.recordAccess({
      userId: req.user.id,
      patientId: id,
      entityType: 'patients.patients',
      entityId: id,
    });
    return result;
  }

  @Patch(':id')
  @Roles('ADMIN', 'RECEPTIONIST', 'NURSE', 'DOCTOR', 'PATIENT')
  @ApiOperation({ summary: 'Update patient (patients: own record only)' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePatientDto,
    @Req() req: { user: AuthUserPublic },
  ) {
    await this.assertPatientOwnership(req.user, id);
    const result = await this.service.update(id, dto);
    await this.audit.recordMutation({
      userId: req.user.id,
      action: 'UPDATE',
      entityType: 'patients.patients',
      entityId: id,
    });
    return result;
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Soft-delete patient' })
  async remove(
    @Param('id') id: string,
    @Req() req: { user: AuthUserPublic },
  ) {
    const result = await this.service.softDelete(id);
    await this.audit.recordMutation({
      userId: req.user.id,
      action: 'DELETE',
      entityType: 'patients.patients',
      entityId: id,
    });
    return result;
  }

  private async assertPatientOwnership(
    user: AuthUserPublic,
    patientId: string,
  ): Promise<void> {
    if (user.role !== 'PATIENT') return;
    const own = await this.prisma.patients.findFirst({
      where: { id: patientId, user_id: user.id, deleted_at: null },
      select: { id: true },
    });
    if (!own) {
      throw new ForbiddenException('You can only access your own patient record');
    }
  }
}
