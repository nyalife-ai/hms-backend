import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/user.decorator';
import type { AuthUserPublic } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  ClaimStatusQueryDto,
  EligibilityDto,
  OtpSendDto,
  OtpVerifyDto,
  SubmitClaimDto,
  SyncVisitClaimDto,
} from './dto/insurance.dto';
import { InsuranceService } from './insurance.service';

@ApiTags('insurance')
@ApiBearerAuth()
@Controller('insurance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InsuranceController {
  constructor(private readonly insurance: InsuranceService) {}

  @Get('providers')
  @ApiOperation({ summary: 'List insurance providers and integration channels' })
  providers() {
    return this.insurance.listProviders();
  }

  @Post('eligibility')
  @Roles('ADMIN', 'RECEPTIONIST')
  eligibility(@Body() body: EligibilityDto) {
    return this.insurance.verifyEligibility(body.providerId, body.memberNumber);
  }

  @Post('otp/send')
  @Roles('ADMIN', 'RECEPTIONIST')
  sendOtp(@Body() body: OtpSendDto) {
    return this.insurance.sendOtp(body.providerId, body.sessionId);
  }

  @Post('otp/verify')
  @Roles('ADMIN', 'RECEPTIONIST')
  verifyOtp(@Body() body: OtpVerifyDto) {
    return this.insurance.verifyOtp(
      body.providerId,
      body.sessionId,
      body.code,
      {
        benefitCode: body.benefitCode,
        benefitType: body.benefitType,
      },
    );
  }

  @Post('claims')
  @Roles('ADMIN', 'ACCOUNTANT', 'RECEPTIONIST')
  submitClaim(
    @Body() body: SubmitClaimDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.insurance.submitClaim(body.providerId, body.claim, user.id, {
      mrn: body.mrn,
      visitId: body.visitId,
      diagnosis: body.claim.diagnosis,
    });
  }

  @Post('claims/status')
  @Roles('ADMIN', 'ACCOUNTANT', 'RECEPTIONIST')
  claimStatus(@Body() body: ClaimStatusQueryDto) {
    return this.insurance.getClaimStatus(body.providerId, body.claimId);
  }

  @Post('claims/sync')
  @Roles('ADMIN', 'ACCOUNTANT', 'RECEPTIONIST')
  @ApiOperation({
    summary:
      'Poll insurer for claim status and sign off the visit when accepted',
  })
  syncVisitClaim(
    @Body() body: SyncVisitClaimDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.insurance.syncVisitClaim(
      body.providerId,
      body.visitId,
      user.id,
    );
  }
}
