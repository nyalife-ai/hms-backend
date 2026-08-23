import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/user.decorator';
import type { AuthUserPublic } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FRONT_DESK_ROLES, VISIT_FLOW_ROLES } from '../auth/role-sets';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  CheckInDto,
  ClaimStatusDto,
  CollectConsultFeeDto,
  CompleteConsultationDto,
  FinalizeBillingDto,
  LabResultsDto,
  OrderLabsDto,
  SaveClinicalOrdersDto,
  SaveClinicalRecordDto,
  TriageDto,
  UpdateReceptionDto,
} from './dto/visits.dto';
import { VisitsService } from './visits.service';

@ApiTags('visits')
@ApiBearerAuth()
@Controller('visits')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VisitsController {
  constructor(private readonly visits: VisitsService) {}

  @Get()
  @Roles(...VISIT_FLOW_ROLES)
  @ApiOperation({ summary: 'List all visits in the patient flow' })
  @ApiQuery({ name: 'appointmentId', required: false })
  findAll(
    @CurrentUser() user: AuthUserPublic,
    @Query('appointmentId') appointmentId?: string,
  ) {
    return this.visits.findAll(user, appointmentId);
  }

  @Get('symptom-catalogue')
  @Roles(...VISIT_FLOW_ROLES)
  @ApiOperation({
    summary:
      'Symptom catalogue + triage reason/condition/red-flag options for clinical intake',
  })
  symptomCatalogue() {
    return this.visits.listSymptomCatalogue();
  }

  @Get(':id/triage-summary')
  @Roles(...VISIT_FLOW_ROLES)
  @ApiOperation({
    summary:
      'Structured triage summary for doctor consultation (read-only intake record)',
  })
  triageSummary(
    @Param('id') id: string,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.visits.getTriageSummary(id, user);
  }

  @Get(':id')
  @Roles(...VISIT_FLOW_ROLES)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUserPublic) {
    return this.visits.findOne(id, user);
  }

  @Post('check-in')
  @Roles(...FRONT_DESK_ROLES)
  @ApiOperation({
    summary:
      'Front desk check-in (auto-creates consult-fee draft invoice when system setting is enabled)',
  })
  checkIn(
    @Body() body: CheckInDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.visits.checkIn(body, user.id);
  }

  @Patch(':id/reception')
  @Roles('ADMIN', 'SUPER_ADMIN', 'RECEPTIONIST')
  @ApiOperation({
    summary:
      'Update reception administrative reason / notes (clinical RFV is owned by triage after intake)',
  })
  updateReception(
    @Param('id') id: string,
    @Body() body: UpdateReceptionDto,
  ) {
    return this.visits.updateReception(id, body);
  }

  @Post(':id/triage')
  @Roles('ADMIN', 'SUPER_ADMIN', 'NURSE')
  @ApiOperation({
    summary:
      'Complete structured clinical triage intake (vitals, symptoms, history, screening, urgency) and send to doctor queue',
  })
  recordTriage(
    @Param('id') id: string,
    @Body() body: TriageDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.visits.recordTriage(id, body, user);
  }

  @Post(':id/charge-consult-fee')
  @Roles('ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT')
  @ApiOperation({
    summary:
      'Manually create consult-fee draft (normally automatic on check-in when enabled)',
  })
  chargeConsultFee(
    @Param('id') id: string,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.visits.chargeConsultFee(id, user.id);
  }

  @Post(':id/waive-consult-fee')
  @Roles('ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT')
  @ApiOperation({ summary: 'Waive consultation fee for a visit' })
  waiveConsultFee(@Param('id') id: string) {
    return this.visits.waiveConsultFee(id);
  }

  @Post(':id/collect-consult-fee')
  @Roles('ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT', 'RECEPTIONIST')
  @ApiOperation({
    summary: 'Finance desk: issue consult invoice and collect cash/M-Pesa',
  })
  collectConsultFee(
    @Param('id') id: string,
    @Body() body: CollectConsultFeeDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.visits.collectConsultFee(id, user.id, body.mode, {
      transactionReference: body.transactionReference,
      mpesaReceipt: body.mpesaReceipt,
    });
  }

  @Post(':id/start-consultation')
  @Roles('ADMIN', 'SUPER_ADMIN', 'DOCTOR')
  startConsultation(@Param('id') id: string) {
    return this.visits.startConsultation(id);
  }

  @Post(':id/clinical-notes')
  @Roles('ADMIN', 'SUPER_ADMIN', 'DOCTOR')
  @ApiOperation({
    summary: 'Save full clinical consultation narrative mid-consult',
  })
  saveClinicalNotes(
    @Param('id') id: string,
    @Body() body: SaveClinicalRecordDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.visits.saveClinicalRecord(
      id,
      body.clinicalRecord as never,
      user.id,
    );
  }

  @Post(':id/clinical-orders')
  @Roles('ADMIN', 'SUPER_ADMIN', 'DOCTOR')
  @ApiOperation({
    summary: 'Save ordered services / procedures / surgeries mid-consult',
  })
  saveClinicalOrders(
    @Param('id') id: string,
    @Body() body: SaveClinicalOrdersDto,
  ) {
    return this.visits.saveClinicalOrders(id, body as never);
  }

  @Post(':id/order-labs')
  @Roles('ADMIN', 'SUPER_ADMIN', 'DOCTOR')
  orderLabs(
    @Param('id') id: string,
    @Body() body: OrderLabsDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.visits.orderLabs(id, body.tests, body.notes ?? '', user.id);
  }

  @Post(':id/lab-results')
  @Roles('ADMIN', 'SUPER_ADMIN', 'LAB_TECHNICIAN')
  submitLabResults(
    @Param('id') id: string,
    @Body() body: LabResultsDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.visits.submitLabResults(
      id,
      body.tests,
      body.comments ?? '',
      user.id,
    );
  }

  @Post(':id/complete')
  @Roles('ADMIN', 'SUPER_ADMIN', 'DOCTOR')
  complete(
    @Param('id') id: string,
    @Body() body: CompleteConsultationDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.visits.completeConsultation(id, body as never, user.id);
  }

  @Post(':id/billing')
  @Roles('ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT', 'RECEPTIONIST')
  finalizeBilling(
    @Param('id') id: string,
    @Body() body: FinalizeBillingDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.visits.finalizeBilling(
      id,
      body.total,
      user.id,
      body.claimId,
    );
  }

  @Patch(':id/claim-status')
  @Roles('ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT', 'RECEPTIONIST')
  updateClaimStatus(
    @Param('id') id: string,
    @Body() body: ClaimStatusDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.visits.updateClaimStatus(id, body.status, user.id);
  }

  @Post(':id/sign-off')
  @Roles('ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT', 'RECEPTIONIST')
  @ApiOperation({
    summary: 'Sign off patient after claim acceptance (or cash settlement)',
  })
  signOff(@Param('id') id: string) {
    return this.visits.signOff(id);
  }
}
