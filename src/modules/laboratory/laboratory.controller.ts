/**
 * Laboratory HTTP API — full domain under /laboratory/*
 */

import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/user.decorator';
import type { AuthUserPublic, HmsRole } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { LabJourneyUseCase } from './use-cases/lab-journey.usecase';
import { LabOperationsUseCase } from './use-cases/lab-operations.usecase';

const LAB_READ: HmsRole[] = [
  'ADMIN',
  'DOCTOR',
  'LAB_TECHNICIAN',
  'NURSE',
];
const LAB_CONFIG: HmsRole[] = ['ADMIN', 'LAB_TECHNICIAN'];
const LAB_REQUEST_CREATE: HmsRole[] = [
  'ADMIN',
  'DOCTOR',
  'LAB_TECHNICIAN',
  'NURSE',
];
const LAB_TECH: HmsRole[] = ['ADMIN', 'LAB_TECHNICIAN'];
const LAB_VERIFY: HmsRole[] = ['ADMIN', 'LAB_TECHNICIAN'];
const LAB_CORRECT: HmsRole[] = ['ADMIN', 'SUPER_ADMIN'];

@ApiTags('Laboratory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('laboratory')
export class LaboratoryController {
  public constructor(
    private readonly ops: LabOperationsUseCase,
    private readonly journey: LabJourneyUseCase,
  ) {}

  // ── Overview ──────────────────────────────────────────────
  @Get('overview')
  @Roles(...LAB_READ)
  overview() {
    return this.ops.overview();
  }

  @Post('repair-released-visits')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({
    summary:
      'Repair LAB_PENDING visits whose lab requests were already released to the doctor',
  })
  repairReleasedVisits(@CurrentUser() user: AuthUserPublic) {
    return this.journey.repairReleasedVisitStages(user.id);
  }

  @Get('visit-report')
  @Roles(...LAB_READ)
  @ApiOperation({
    summary:
      'Doctor Lab Report — released LIS results for an outpatient visit',
  })
  visitReport(@Query('visitId') visitId?: string) {
    return this.ops.getVisitLabReport(visitId ?? '');
  }

  // ── Clinical services / procedures / surgeries (before :id routes)
  @Get('clinical-services')
  @Roles(...LAB_READ)
  @ApiOperation({
    summary: 'List clinical services & procedures managed for doctor orders',
  })
  listClinicalServices(
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('kind') kind?: 'service' | 'surgery',
    @Query('active') active?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.ops.listClinicalServices({
      search,
      category,
      kind,
      active:
        active === 'true' ? true : active === 'false' ? false : undefined,
      take: take ? Number(take) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
  }

  @Post('clinical-services')
  @Roles(...LAB_CONFIG)
  @ApiOperation({ summary: 'Create a clinical service / procedure / surgery' })
  createClinicalService(
    @Body()
    body: {
      serviceCode: string;
      serviceName: string;
      category?: string;
      description?: string;
      standardPrice: string | number;
      isActive?: boolean;
    },
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.ops.createClinicalService({
      ...body,
      actorUserId: user.id,
    });
  }

  @Patch('clinical-services/:id')
  @Roles(...LAB_CONFIG)
  @ApiOperation({ summary: 'Update a clinical service / procedure / surgery' })
  updateClinicalService(
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    body: {
      serviceName?: string;
      category?: string | null;
      description?: string | null;
      standardPrice?: string | number;
      isActive?: boolean;
    },
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.ops.updateClinicalService(id, {
      ...body,
      actorUserId: user.id,
    });
  }

  // ── Test types ────────────────────────────────────────────
  @Get('test-types')
  @Roles(...LAB_READ)
  listTestTypes(
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('active') active?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.ops.listTestTypes({
      search,
      category,
      active:
        active === 'true' ? true : active === 'false' ? false : undefined,
      take: take ? Number(take) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
  }

  @Get('test-types/:id')
  @Roles(...LAB_READ)
  getTestType(@Param('id', ParseUUIDPipe) id: string) {
    return this.ops.getTestType(id);
  }

  @Post('test-types')
  @Roles(...LAB_CONFIG)
  createTestType(
    @CurrentUser() user: AuthUserPublic,
    @Body()
    body: {
      testName: string;
      category?: string;
      description?: string;
      standardPrice?: number;
    },
  ) {
    return this.ops.createTestType({ ...body, actorUserId: user.id });
  }

  @Patch('test-types/:id')
  @Roles(...LAB_CONFIG)
  updateTestType(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPublic,
    @Body()
    body: {
      testName?: string;
      category?: string | null;
      description?: string | null;
      standardPrice?: number;
      isActive?: boolean;
    },
  ) {
    return this.ops.updateTestType(id, { ...body, actorUserId: user.id });
  }

  @Post('test-types/:id/deactivate')
  @Roles(...LAB_CONFIG)
  deactivateTestType(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.ops.setTestTypeActive(id, false, user.id);
  }

  @Post('test-types/:id/activate')
  @Roles(...LAB_CONFIG)
  activateTestType(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.ops.setTestTypeActive(id, true, user.id);
  }

  // ── Parameters ────────────────────────────────────────────
  @Get('parameters')
  @Roles(...LAB_READ)
  listParameters(
    @Query('testTypeId') testTypeId?: string,
    @Query('active') active?: string,
    @Query('search') search?: string,
  ) {
    return this.ops.listParameters({
      testTypeId,
      active:
        active === 'true' ? true : active === 'false' ? false : undefined,
      search,
    });
  }

  @Get('parameters/:id')
  @Roles(...LAB_READ)
  getParameter(@Param('id', ParseUUIDPipe) id: string) {
    return this.ops.getParameter(id);
  }

  @Post('parameters')
  @Roles(...LAB_CONFIG)
  createParameter(
    @CurrentUser() user: AuthUserPublic,
    @Body()
    body: {
      testTypeId: string;
      parameterName: string;
      unitOfMeasurement?: string;
      normalReferenceRange?: string;
      displayOrder?: number;
    },
  ) {
    return this.ops.createParameter({ ...body, actorUserId: user.id });
  }

  @Patch('parameters/:id')
  @Roles(...LAB_CONFIG)
  updateParameter(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPublic,
    @Body()
    body: {
      parameterName?: string;
      unitOfMeasurement?: string | null;
      normalReferenceRange?: string | null;
      displayOrder?: number;
      isActive?: boolean;
    },
  ) {
    return this.ops.updateParameter(id, { ...body, actorUserId: user.id });
  }

  // ── Requests ──────────────────────────────────────────────
  @Get('requests')
  @Roles(...LAB_READ)
  listRequests(
    @Query('patientId') patientId?: string,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('requestingDoctorId') requestingDoctorId?: string,
    @Query('consultationId') consultationId?: string,
    @Query('appointmentId') appointmentId?: string,
    @Query('visitId') visitId?: string,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.ops.listRequests({
      patientId,
      status,
      priority,
      requestingDoctorId,
      consultationId,
      appointmentId,
      visitId,
      search,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      take: take ? Number(take) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
  }

  @Get('requests/:id')
  @Roles(...LAB_READ)
  getRequest(@Param('id', ParseUUIDPipe) id: string) {
    return this.ops.getRequest(id);
  }

  @Post('requests/:id/release-to-doctor')
  @Roles(...LAB_VERIFY)
  @ApiOperation({
    summary:
      'Release verified results to the ordering doctor (LAB_RESULT_RELEASED)',
  })
  releaseToDoctor(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.journey.releaseToDoctor({
      requestId: id,
      actorUserId: user.id,
    });
  }

  @Patch('requests/:id/findings')
  @Roles(...LAB_TECH)
  @ApiOperation({ summary: 'Update observations / conclusion / evidence meta' })
  updateFindings(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPublic,
    @Body()
    body: {
      observations?: string | null;
      conclusion?: string | null;
      evidenceName?: string | null;
      text?: string | null;
    },
  ) {
    return this.ops.updateRequestFindings(id, {
      ...body,
      actorUserId: user.id,
    });
  }

  @Post('requests')
  @Roles(...LAB_REQUEST_CREATE)
  @ApiOperation({ summary: 'Create laboratory request' })
  createRequest(
    @Body()
    body: {
      patientId: string;
      requestingDoctorId?: string;
      consultationId?: string;
      testTypeIds?: string[];
      testTypeId?: string;
      priority?: string;
      notes?: string;
    },
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.journey.createRequest({
      ...body,
      requestedBy: user.id,
    });
  }

  @Post('requests/:id/cancel')
  @Roles(...LAB_REQUEST_CREATE)
  cancelRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.journey.cancelRequest(id, user.id);
  }

  @Post('requests/:id/samples')
  @Roles(...LAB_TECH)
  @ApiOperation({ summary: 'Register specimen for a request' })
  collectSample(
    @Param('id', ParseUUIDPipe) requestId: string,
    @Body()
    body: {
      collectedBy?: string;
      sampleType?: string;
      notes?: string;
      collectedDate?: string;
    },
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.journey.collectSample({
      requestId,
      collectedBy: body.collectedBy || user.id,
      sampleType: body.sampleType,
      notes: body.notes,
      collectedDate: body.collectedDate,
    });
  }

  @Post('requests/:id/results')
  @Roles(...LAB_TECH)
  @ApiOperation({ summary: 'Enter a lab result (or batch via lines[])' })
  enterResult(
    @Param('id', ParseUUIDPipe) requestId: string,
    @Body()
    body: {
      parameterId?: string;
      resultValue?: string;
      interpretation?: string;
      notes?: string;
      lines?: Array<{
        parameterId: string;
        resultValue: string;
        interpretation?: string;
        notes?: string;
      }>;
    },
    @CurrentUser() user: AuthUserPublic,
  ) {
    if (body.lines?.length) {
      return this.journey.enterResultsBatch({
        requestId,
        performedBy: user.id,
        lines: body.lines,
      });
    }
    return this.journey.enterResult({
      requestId,
      parameterId: body.parameterId!,
      resultValue: body.resultValue!,
      interpretation: body.interpretation,
      notes: body.notes,
      performedBy: user.id,
    });
  }

  @Post('requests/:id/results/:resultId/verify')
  @Roles(...LAB_VERIFY)
  @ApiOperation({ summary: 'Verify a result; completes request when all done' })
  verify(
    @Param('id', ParseUUIDPipe) requestId: string,
    @Param('resultId', ParseUUIDPipe) resultId: string,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.journey.verifyResult({
      requestId,
      resultId,
      verifiedBy: user.id,
    });
  }

  @Post('requests/:id/results/:resultId/correct')
  @Roles(...LAB_CORRECT)
  @ApiOperation({ summary: 'Admin correction — clears verification' })
  correct(
    @Param('id', ParseUUIDPipe) requestId: string,
    @Param('resultId', ParseUUIDPipe) resultId: string,
    @CurrentUser() user: AuthUserPublic,
    @Body()
    body: {
      resultValue: string;
      interpretation?: string;
      notes?: string;
    },
  ) {
    return this.journey.correctResult({
      requestId,
      resultId,
      resultValue: body.resultValue,
      interpretation: body.interpretation,
      notes: body.notes,
      actorUserId: user.id,
    });
  }

  // ── Samples ───────────────────────────────────────────────
  @Get('samples')
  @Roles(...LAB_READ)
  listSamples(
    @Query('requestId') requestId?: string,
    @Query('patientId') patientId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.ops.listSamples({
      requestId,
      patientId,
      status,
      search,
      take: take ? Number(take) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
  }

  @Get('samples/:id')
  @Roles(...LAB_READ)
  getSample(@Param('id', ParseUUIDPipe) id: string) {
    return this.ops.getSample(id);
  }

  @Post('samples/:id/status')
  @Roles(...LAB_TECH)
  updateSampleStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPublic,
    @Body() body: { status: string; notes?: string },
  ) {
    return this.journey.updateSampleStatus({
      sampleId: id,
      status: body.status,
      notes: body.notes,
      actorUserId: user.id,
    });
  }

  // ── Results ───────────────────────────────────────────────
  @Get('results/summary')
  @Roles(...LAB_READ)
  resultsSummary() {
    return this.ops.resultsSummary();
  }

  @Get('results/bundles')
  @Roles(...LAB_READ)
  @ApiOperation({
    summary: 'Lab results grouped by request (one row per request)',
  })
  listResultBundles(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('criticalOnly') criticalOnly?: string,
    @Query('unverifiedOnly') unverifiedOnly?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.ops.listResultBundles({
      search,
      status,
      criticalOnly: criticalOnly === 'true',
      unverifiedOnly: unverifiedOnly === 'true',
      take: take ? Number(take) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
  }

  @Get('results')
  @Roles(...LAB_READ)
  listResults(
    @Query('requestId') requestId?: string,
    @Query('criticalOnly') criticalOnly?: string,
    @Query('unverifiedOnly') unverifiedOnly?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.ops.listResults({
      requestId,
      criticalOnly: criticalOnly === 'true',
      unverifiedOnly: unverifiedOnly === 'true',
      take: take ? Number(take) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
  }

  @Get('results/:requestId')
  @Roles(...LAB_READ)
  @ApiOperation({ summary: 'Result report detail for a lab request' })
  getResultReport(@Param('requestId', ParseUUIDPipe) requestId: string) {
    return this.ops.getRequest(requestId);
  }
}
