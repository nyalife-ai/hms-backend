/**
 * Billing finance HTTP API — masters, invoices, payments, claims, journals.
 * Checkout/fees/mpesa/receipts remain on BillingController.
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
import { BillingFinanceService } from './billing-finance.service';
import { BillingSettlementService } from './billing-settlement.service';

const BILLING_OPS = [
  'ADMIN',
  'ACCOUNTANT',
  'RECEPTIONIST',
] as const satisfies readonly HmsRole[];
/** Chart of accounts / journals / tax / periods — finance only. */
const BILLING_ACCT = [
  'ADMIN',
  'ACCOUNTANT',
] as const satisfies readonly HmsRole[];
/** Invoice/service reads for ops desks + fee lookups for clinical/pharmacy. */
const BILLING_READ = [
  'ADMIN',
  'ACCOUNTANT',
  'RECEPTIONIST',
  'PHARMACIST',
  'DOCTOR',
] as const satisfies readonly HmsRole[];

function parsePage(value?: string): number | undefined {
  if (value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseBool(value?: string): boolean | undefined {
  if (value === undefined || value === '') return undefined;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return undefined;
}

@ApiTags('billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('billing')
export class BillingFinanceController {
  public constructor(
    private readonly finance: BillingFinanceService,
    private readonly settlement: BillingSettlementService,
  ) {}

  // ── Overview & quote ─────────────────────────────────────────────────────

  @Get('overview')
  @Roles(...BILLING_OPS)
  @ApiOperation({ summary: 'Billing finance overview for today' })
  overview() {
    return this.finance.overview();
  }

  @Get('quote/visit')
  @Roles(...BILLING_OPS)
  @ApiOperation({ summary: 'Server-authoritative OPD visit quote' })
  quoteVisit(
    @Query('consultCount') consultCount?: string,
    @Query('labCount') labCount?: string,
    @Query('medCount') medCount?: string,
  ) {
    return this.settlement.quoteVisit({
      consultCount: parsePage(consultCount),
      labCount: parsePage(labCount),
      medCount: parsePage(medCount),
    });
  }

  // ── Services ─────────────────────────────────────────────────────────────

  @Get('services')
  @Roles(...BILLING_READ)
  listServices(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('active') active?: string,
    @Query('category') category?: string,
  ) {
    return this.finance.listServices({
      page: parsePage(page),
      limit: parsePage(limit),
      search,
      active: parseBool(active),
      category,
    });
  }

  @Get('services/summary')
  @Roles(...BILLING_READ)
  @ApiOperation({ summary: 'Service catalog KPI counts' })
  servicesSummary() {
    return this.finance.servicesSummary();
  }

  @Get('services/:id')
  @Roles(...BILLING_READ)
  getService(@Param('id', ParseUUIDPipe) id: string) {
    return this.finance.getService(id);
  }

  @Post('services')
  @Roles(...BILLING_ACCT)
  createService(
    @Body()
    body: {
      serviceCode: string;
      serviceName: string;
      category?: string;
      description?: string;
      standardPrice: string | number;
      revenueAccountId?: string;
      isActive?: boolean;
    },
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.finance.createService({
      ...body,
      actorUserId: user.id,
    });
  }

  @Patch('services/:id')
  @Roles(...BILLING_ACCT)
  updateService(
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    body: {
      serviceName?: string;
      category?: string | null;
      description?: string | null;
      standardPrice?: string | number;
      revenueAccountId?: string | null;
      isActive?: boolean;
    },
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.finance.updateService(id, {
      ...body,
      actorUserId: user.id,
    });
  }

  // ── Accounts ─────────────────────────────────────────────────────────────

  @Get('accounts')
  @Roles(...BILLING_ACCT)
  listAccounts(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('accountType') accountType?: string,
    @Query('active') active?: string,
    @Query('postable') postable?: string,
  ) {
    return this.finance.listAccounts({
      page: parsePage(page),
      limit: parsePage(limit),
      search,
      accountType,
      active: parseBool(active),
      postable: parseBool(postable),
    });
  }

  @Get('accounts/summary')
  @Roles(...BILLING_ACCT)
  @ApiOperation({ summary: 'Chart of accounts KPI counts' })
  accountsSummary() {
    return this.finance.accountsSummary();
  }

  @Post('accounts')
  @Roles(...BILLING_ACCT)
  createAccount(
    @Body()
    body: {
      accountCode: string;
      accountName: string;
      parentId?: string;
      accountType: string;
      normalBalance: string;
      isPostable?: boolean;
      isActive?: boolean;
      description?: string;
    },
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.finance.createAccount({
      ...body,
      actorUserId: user.id,
    });
  }

  @Patch('accounts/:id')
  @Roles(...BILLING_ACCT)
  updateAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    body: {
      accountName?: string;
      parentId?: string | null;
      accountType?: string;
      normalBalance?: string;
      isPostable?: boolean;
      isActive?: boolean;
      description?: string | null;
    },
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.finance.updateAccount(id, {
      ...body,
      actorUserId: user.id,
    });
  }

  // ── Tax rates ────────────────────────────────────────────────────────────

  @Get('tax-rates')
  @Roles(...BILLING_ACCT)
  listTaxRates(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('active') active?: string,
  ) {
    return this.finance.listTaxRates({
      page: parsePage(page),
      limit: parsePage(limit),
      search,
      active: parseBool(active),
    });
  }

  @Post('tax-rates')
  @Roles(...BILLING_ACCT)
  createTaxRate(
    @Body()
    body: {
      taxName: string;
      taxCode: string;
      ratePercentage: string | number;
      liabilityAccountId: string;
      isActive?: boolean;
    },
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.finance.createTaxRate({
      ...body,
      actorUserId: user.id,
    });
  }

  @Patch('tax-rates/:id')
  @Roles(...BILLING_ACCT)
  updateTaxRate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    body: {
      taxName?: string;
      ratePercentage?: string | number;
      liabilityAccountId?: string;
      isActive?: boolean;
    },
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.finance.updateTaxRate(id, {
      ...body,
      actorUserId: user.id,
    });
  }

  // ── Posting periods ──────────────────────────────────────────────────────

  @Get('posting-periods')
  @Roles(...BILLING_ACCT)
  listPeriods(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.finance.listPeriods({
      page: parsePage(page),
      limit: parsePage(limit),
      status,
    });
  }

  @Post('posting-periods')
  @Roles(...BILLING_ACCT)
  createPeriod(
    @Body()
    body: {
      periodName: string;
      startDate: string;
      endDate: string;
      fiscalYear: number;
      status?: 'OPEN' | 'CLOSED' | 'LOCKED';
    },
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.finance.createPeriod({
      ...body,
      actorUserId: user.id,
    });
  }

  @Patch('posting-periods/:id/status')
  @Roles(...BILLING_ACCT)
  setPeriodStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { status: 'OPEN' | 'CLOSED' | 'LOCKED' },
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.finance.setPeriodStatus(id, body.status, user.id);
  }

  // ── Payment methods ──────────────────────────────────────────────────────

  @Get('payment-methods')
  @Roles(...BILLING_READ)
  listPaymentMethods(@Query('active') active?: string) {
    return this.finance.listPaymentMethods({
      active: parseBool(active),
    });
  }

  @Patch('payment-methods/:id')
  @Roles(...BILLING_ACCT)
  updatePaymentMethod(
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    body: {
      glAccountId?: string;
      isActive?: boolean;
      methodName?: string;
    },
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.finance.updatePaymentMethod(id, {
      ...body,
      actorUserId: user.id,
    });
  }

  // ── Invoices ─────────────────────────────────────────────────────────────

  @Get('invoices')
  @Roles(...BILLING_READ)
  listInvoices(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('patientId') patientId?: string,
  ) {
    return this.finance.listInvoices({
      page: parsePage(page),
      limit: parsePage(limit),
      search,
      status,
      from,
      to,
      patientId,
    });
  }

  @Get('invoices/summary')
  @Roles(...BILLING_READ)
  @ApiOperation({ summary: 'Invoice register KPI counts' })
  invoicesSummary() {
    return this.finance.invoicesSummary();
  }

  @Get('invoices/:id')
  @Roles(...BILLING_READ)
  getInvoice(@Param('id', ParseUUIDPipe) id: string) {
    return this.finance.getInvoice(id);
  }

  @Post('invoices')
  @Roles(...BILLING_OPS)
  createInvoice(
    @Body()
    body: {
      patientId: string;
      invoiceDate?: string;
      dueDate?: string;
      discount?: string | number;
      taxRateId?: string;
      notes?: string;
      consultationId?: string;
      admissionId?: string;
      lines: Array<{
        serviceId?: string;
        description?: string;
        quantity: string | number;
        unitPrice?: string | number;
      }>;
    },
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.finance.createInvoice({
      ...body,
      actorUserId: user.id,
    });
  }

  @Post('invoices/:id/issue')
  @Roles(...BILLING_OPS)
  issueInvoice(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.finance.issueInvoice(id, user.id);
  }

  @Patch('invoices/:id')
  @Roles(...BILLING_OPS)
  @ApiOperation({ summary: 'Update draft invoice (discount / notes)' })
  updateDraftInvoice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { discount?: string | number; notes?: string },
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.finance.updateDraftInvoice(id, {
      ...body,
      actorUserId: user.id,
    });
  }

  @Post('invoices/:id/collect')
  @Roles(...BILLING_OPS)
  @ApiOperation({
    summary:
      'Collect payment against an invoice (apply draft discount → issue → pay + JE/JL + visit sync)',
  })
  collectInvoice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    body: {
      paymentMethodId?: string;
      mode?: 'CASH' | 'MPESA';
      amount?: string | number;
      discount?: string | number;
      transactionReference?: string;
      mpesaReceipt?: string;
      notes?: string;
    },
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.settlement.collectOnInvoice({
      invoiceId: id,
      ...body,
      actorUserId: user.id,
    });
  }

  @Post('invoices/:id/void')
  @Roles(...BILLING_ACCT)
  voidInvoice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { reason: string },
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.finance.voidInvoice(id, body.reason, user.id);
  }

  // ── Payments ─────────────────────────────────────────────────────────────

  @Get('payments')
  @Roles(...BILLING_READ)
  listPayments(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('methodId') methodId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('patientId') patientId?: string,
  ) {
    return this.finance.listPayments({
      page: parsePage(page),
      limit: parsePage(limit),
      search,
      status,
      methodId,
      from,
      to,
      patientId,
    });
  }

  @Get('payments/summary')
  @Roles(...BILLING_READ)
  @ApiOperation({ summary: 'Payments KPI counts' })
  paymentsSummary() {
    return this.finance.paymentsSummary();
  }

  @Get('payments/:id')
  @Roles(...BILLING_READ)
  getPayment(@Param('id', ParseUUIDPipe) id: string) {
    return this.finance.getPayment(id);
  }

  @Post('payments')
  @Roles(...BILLING_OPS)
  createPayment(
    @Body()
    body: {
      patientId: string;
      amount: string | number;
      paymentMethodId: string;
      transactionReference?: string;
      paymentDate?: string;
      notes?: string;
      allocateToInvoiceId?: string;
    },
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.finance.createPayment({
      ...body,
      actorUserId: user.id,
    });
  }

  @Post('payments/:id/allocate')
  @Roles(...BILLING_OPS)
  allocatePayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { invoiceId: string; amount: string | number },
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.finance.allocatePayment(
      id,
      body.invoiceId,
      body.amount,
      user.id,
    );
  }

  // ── Claims ───────────────────────────────────────────────────────────────

  @Get('claims')
  @Roles(...BILLING_READ)
  listClaims(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('patientId') patientId?: string,
  ) {
    return this.finance.listClaims({
      page: parsePage(page),
      limit: parsePage(limit),
      search,
      status,
      patientId,
    });
  }

  @Get('claims/summary')
  @Roles(...BILLING_READ)
  @ApiOperation({ summary: 'Insurance claims KPI counts' })
  claimsSummary() {
    return this.finance.claimsSummary();
  }

  @Get('claims/:id')
  @Roles(...BILLING_READ)
  getClaim(@Param('id', ParseUUIDPipe) id: string) {
    return this.finance.getClaim(id);
  }

  @Post('claims')
  @Roles(...BILLING_OPS)
  createClaim(
    @Body()
    body: {
      invoiceId: string;
      amountClaimed: string | number;
      insurancePolicyId?: string;
      notes?: string;
    },
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.finance.createClaim({
      ...body,
      actorUserId: user.id,
    });
  }

  @Patch('claims/:id/status')
  @Roles(...BILLING_ACCT)
  transitionClaim(
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    body: {
      status: string;
      amountApproved?: string | number;
      denialReason?: string;
      notes?: string;
    },
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.finance.transitionClaim(id, {
      ...body,
      actorUserId: user.id,
    });
  }

  @Post('claims/:id/record-payment')
  @Roles(...BILLING_ACCT)
  recordClaimPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    body: {
      amount: string | number;
      transactionReference?: string;
      notes?: string;
    },
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.finance.recordClaimPayment(id, {
      ...body,
      actorUserId: user.id,
    });
  }

  // ── Journals ─────────────────────────────────────────────────────────────

  @Get('journals')
  @Roles(...BILLING_ACCT)
  listJournals(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.finance.listJournals({
      page: parsePage(page),
      limit: parsePage(limit),
      search,
      status,
      from,
      to,
    });
  }

  @Get('journals/summary')
  @Roles(...BILLING_ACCT)
  @ApiOperation({ summary: 'Journal entries KPI counts' })
  journalsSummary() {
    return this.finance.journalsSummary();
  }

  @Get('journals/:id')
  @Roles(...BILLING_ACCT)
  getJournal(@Param('id', ParseUUIDPipe) id: string) {
    return this.finance.getJournal(id);
  }

  @Post('journals')
  @Roles(...BILLING_ACCT)
  createManualJournal(
    @Body()
    body: {
      entryDate?: string;
      description?: string;
      lines: Array<{
        accountId: string;
        direction: 'DEBIT' | 'CREDIT';
        amount: string | number;
        description?: string;
      }>;
    },
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.finance.createManualJournal({
      ...body,
      actorUserId: user.id,
    });
  }

  @Post('journals/:id/post')
  @Roles(...BILLING_ACCT)
  postJournal(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.finance.postJournal(id, user.id);
  }

  @Post('journals/:id/reverse')
  @Roles(...BILLING_ACCT)
  reverseJournal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { reason?: string },
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.finance.reverseJournalEntry(id, user.id, body?.reason);
  }
}
