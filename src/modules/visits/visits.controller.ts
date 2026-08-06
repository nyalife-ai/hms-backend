import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/user.decorator';
import type { AuthUserPublic } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  CheckInDto,
  ClaimStatusDto,
  CompleteConsultationDto,
  FinalizeBillingDto,
  LabResultsDto,
  OrderLabsDto,
  TriageDto,
} from './dto/visits.dto';
import { VisitsService } from './visits.service';

@ApiTags('visits')
@ApiBearerAuth()
@Controller('visits')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VisitsController {
  constructor(private readonly visits: VisitsService) {}

  @Get()
  @ApiOperation({ summary: 'List all visits in the patient flow' })
  findAll() {
    return this.visits.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.visits.findOne(id);
  }

  @Post('check-in')
  @Roles('ADMIN', 'RECEPTIONIST')
  @ApiOperation({ summary: 'Front desk check-in' })
  checkIn(@Body() body: CheckInDto) {
    return this.visits.checkIn(body);
  }

  @Post(':id/triage')
  @Roles('ADMIN', 'NURSE')
  recordTriage(@Param('id') id: string, @Body() body: TriageDto) {
    return this.visits.recordTriage(
      id,
      body.vitals,
      body.doctorName,
      body.nurseName,
    );
  }

  @Post(':id/start-consultation')
  @Roles('ADMIN', 'DOCTOR')
  startConsultation(@Param('id') id: string) {
    return this.visits.startConsultation(id);
  }

  @Post(':id/order-labs')
  @Roles('ADMIN', 'DOCTOR')
  orderLabs(
    @Param('id') id: string,
    @Body() body: OrderLabsDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.visits.orderLabs(id, body.tests, body.notes ?? '', user.id);
  }

  @Post(':id/lab-results')
  @Roles('ADMIN', 'LAB_TECHNICIAN')
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
  @Roles('ADMIN', 'DOCTOR')
  complete(@Param('id') id: string, @Body() body: CompleteConsultationDto) {
    return this.visits.completeConsultation(id, body);
  }

  @Post(':id/billing')
  @Roles('ADMIN', 'ACCOUNTANT', 'RECEPTIONIST')
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
  @Roles('ADMIN', 'ACCOUNTANT', 'RECEPTIONIST')
  updateClaimStatus(
    @Param('id') id: string,
    @Body() body: ClaimStatusDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.visits.updateClaimStatus(id, body.status, user.id);
  }

  @Post(':id/sign-off')
  @Roles('ADMIN', 'ACCOUNTANT', 'RECEPTIONIST')
  @ApiOperation({
    summary: 'Sign off patient after claim acceptance (or cash settlement)',
  })
  signOff(@Param('id') id: string) {
    return this.visits.signOff(id);
  }
}
