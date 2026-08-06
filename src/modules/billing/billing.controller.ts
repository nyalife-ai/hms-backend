import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/user.decorator';
import type { AuthUserPublic } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { BillingSettlementService } from './billing-settlement.service';
import { CheckoutService } from './checkout.service';

class StkCheckoutDto {
  @ApiProperty()
  @IsString()
  visitId!: string;

  @ApiProperty({ example: '254708374149' })
  @IsString()
  phone!: string;

  @ApiProperty({ enum: ['RECEPTION', 'PHARMACY'] })
  @IsIn(['RECEPTION', 'PHARMACY'])
  source!: 'RECEPTION' | 'PHARMACY';
}

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(
    private readonly checkout: CheckoutService,
    private readonly settlement: BillingSettlementService,
  ) {}

  @Get('fees')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'ACCOUNTANT', 'RECEPTIONIST', 'PHARMACIST', 'DOCTOR')
  @ApiOperation({ summary: 'OPD fee schedule (CONSULT / LAB / MED)' })
  fees() {
    return this.settlement.getFeeSchedule();
  }

  @Get('mpesa/mode')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'ACCOUNTANT', 'RECEPTIONIST', 'PHARMACIST')
  mode() {
    return { mode: this.checkout.mode() };
  }

  @Post('checkout/stk')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'ACCOUNTANT', 'RECEPTIONIST', 'PHARMACIST')
  @ApiOperation({ summary: 'Start M-Pesa STK Push for a visit checkout' })
  stk(
    @Body() body: StkCheckoutDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.checkout.initiateStk({
      visitId: body.visitId,
      phone: body.phone,
      source: body.source,
      actorUserId: user.id,
    });
  }

  @Get('checkout/:id/status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'ACCOUNTANT', 'RECEPTIONIST', 'PHARMACIST')
  @ApiOperation({ summary: 'Poll STK status; finalizes receipt on success' })
  status(@Param('id') id: string) {
    return this.checkout.getStatus(id);
  }

  @Public()
  @Post('mpesa/callback')
  @ApiOperation({
    summary:
      'Safaricom Daraja STK callback (public; requires MPESA_CALLBACK_SECRET in production)',
  })
  callback(
    @Body() body: Record<string, unknown>,
    @Req() req: { headers: Record<string, string | string[] | undefined> },
  ) {
    return this.checkout.handleCallback(body, {
      secretHeader: String(
        req.headers['x-mpesa-callback-secret'] ||
          req.headers['x-callback-secret'] ||
          '',
      ),
    });
  }

  @Get('receipts/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'ACCOUNTANT', 'RECEPTIONIST', 'PHARMACIST')
  receipt(@Param('id') id: string) {
    return this.checkout.getReceipt(id);
  }
}
