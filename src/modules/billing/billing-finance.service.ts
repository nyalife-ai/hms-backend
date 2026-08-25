/**
 * Billing & finance orchestration — masters, invoices, payments, claims, journals.
 */

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createDomainEventId } from '../../core/domain';
import type { Prisma } from '../../generated/prisma';
import { PrismaService } from '../../database/prisma/prisma.service';
import { HmsAuditWriter } from '../audit/hms-audit.writer';
import { Money } from '../../shared/money/money';
import {
  assertAccountTypeBalance,
  assertPostableActiveAccount,
} from './domain/account-rules';
import {
  assertClaimAmounts,
  assertClaimTransition,
} from './domain/claim-lifecycle';
import {
  calculateInvoiceTotals,
  outstandingBalance,
} from './domain/invoice-calculator';
import {
  assertInvoiceTransition,
  statusFromOutstanding,
} from './domain/invoice-lifecycle';
import {
  assertNonNegative,
  assertPositive,
  moneyFrom,
  moneyToDecimal,
  moneyZero,
} from './domain/money';
import {
  createAndPostJournal,
  postDraftJournal,
  reverseJournal,
  type JournalLineInput,
} from './finance/journal.engine';
import { resolveRevenueAccountCode } from './domain/service-revenue-account';
import { nextDocumentNumber, withNumberRetry } from './finance/numbering';

export const CONTROL_CODES = {
  AR: '1100',
  CASH: '1000',
  MPESA: '1010',
} as const;

type Tx = Prisma.TransactionClient;

const TAX_RATE_META = /\[\[taxRateId:([0-9a-f-]{36})\]\]/i;
const patientProfileInclude = {
  user: { include: { core_profiles_user_id: true } },
} as const;

function withTaxRateMeta(
  notes: string | null | undefined,
  taxRateId?: string | null,
): string | null {
  const cleaned = (notes ?? '').replace(TAX_RATE_META, '').trim();
  if (!taxRateId) return cleaned || null;
  return `${cleaned}\n[[taxRateId:${taxRateId}]]`.trim();
}

function parseTaxRateId(notes: string | null | undefined): string | null {
  const m = notes?.match(TAX_RATE_META);
  return m?.[1] ?? null;
}

function displayNotes(notes: string | null | undefined): string | null {
  if (!notes) return null;
  return notes.replace(TAX_RATE_META, '').trim() || null;
}

/** Canonical invoice money fields — amountPaid is an alias of allocated. */
function invoiceMoneyFields(input: {
  totalAmount: string;
  allocated: string;
  outstanding: string;
  status: string;
  subtotal: string;
  discount: string;
  tax: string;
}) {
  return {
    subtotal: input.subtotal,
    discount: input.discount,
    tax: input.tax,
    totalAmount: input.totalAmount,
    allocated: input.allocated,
    amountPaid: input.allocated,
    outstanding: input.outstanding,
    balance: input.outstanding,
    status: input.status,
  };
}

function patientDisplayName(patient: {
  patient_number: string;
  user: { core_profiles_user_id: Array<{ first_name: string; last_name: string }> };
}): string {
  const p = patient.user.core_profiles_user_id[0];
  return p ? `${p.first_name} ${p.last_name}`.trim() : patient.patient_number;
}

function startOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function asDateOnly(value?: string | Date | null, fallback?: Date): Date {
  if (value) {
    const d = value instanceof Date ? new Date(value) : new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException('Invalid date');
    }
    d.setHours(0, 0, 0, 0);
    return d;
  }
  return fallback ?? startOfDay();
}

@Injectable()
export class BillingFinanceService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly audit: HmsAuditWriter,
    private readonly events: EventEmitter2,
  ) {}

  // ── Helpers ──────────────────────────────────────────────────────────────

  private paginate(page?: number, limit?: number) {
    const p = Math.max(page ?? 1, 1);
    const l = Math.min(Math.max(limit ?? 50, 1), 100);
    return { page: p, limit: l, skip: (p - 1) * l };
  }

  private async requireArAccount(tx: Tx) {
    const account = await tx.accounts.findUnique({
      where: { account_code: CONTROL_CODES.AR },
    });
    if (!account) {
      throw new BadRequestException(
        `Control account AR (${CONTROL_CODES.AR}) is not configured`,
      );
    }
    assertPostableActiveAccount(account);
    return account;
  }

  private patientSearchWhere(q?: string): Prisma.PatientsWhereInput | undefined {
    const term = q?.trim();
    if (!term) return undefined;
    return {
      OR: [
        { patient_number: { contains: term, mode: 'insensitive' } },
        { user: { email: { contains: term, mode: 'insensitive' } } },
        {
          user: {
            core_profiles_user_id: {
              some: {
                OR: [
                  { first_name: { contains: term, mode: 'insensitive' } },
                  { last_name: { contains: term, mode: 'insensitive' } },
                  { phone: { contains: term, mode: 'insensitive' } },
                ],
              },
            },
          },
        },
      ],
    };
  }

  private async requireRevenueAccount(tx: Tx, accountId: string) {
    const account = await tx.accounts.findUnique({ where: { id: accountId } });
    if (!account) throw new BadRequestException('Revenue account not found');
    if (account.account_type !== 'REVENUE') {
      throw new BadRequestException('Service revenue account must be REVENUE');
    }
    assertPostableActiveAccount(account);
    return account;
  }

  /** Resolve a postable REVENUE account id from category/code/name heuristics. */
  private async resolveDefaultRevenueAccountId(
    tx: Tx | PrismaService,
    input: {
      category?: string | null;
      serviceCode?: string | null;
      serviceName?: string | null;
    },
  ): Promise<string | null> {
    const accountCode = resolveRevenueAccountCode(input);
    const account = await tx.accounts.findUnique({
      where: { account_code: accountCode },
    });
    if (!account || !account.is_active || !account.is_postable) return null;
    if (account.account_type !== 'REVENUE') return null;
    return account.id;
  }

  private async requireLiabilityAccount(tx: Tx, accountId: string) {
    const account = await tx.accounts.findUnique({ where: { id: accountId } });
    if (!account) throw new BadRequestException('Liability account not found');
    if (account.account_type !== 'LIABILITY') {
      throw new BadRequestException('Tax liability account must be LIABILITY');
    }
    assertPostableActiveAccount(account);
    return account;
  }

  private assertTaxRatePercentage(rate: string | number) {
    const n = Number(rate);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      throw new BadRequestException('Tax rate must be between 0 and 100');
    }
  }

  private async allocatedSum(
    tx: Tx | PrismaService,
    invoiceId: string,
  ): Promise<Money> {
    const agg = await tx.paymentAllocations.aggregate({
      where: {
        invoice_id: invoiceId,
        payment: { status: 'COMPLETED' },
      },
      _sum: { allocated_amount: true },
    });
    return moneyFrom(agg._sum.allocated_amount?.toString() ?? '0');
  }

  private async paymentAllocatedSum(
    tx: Tx | PrismaService,
    paymentId: string,
  ): Promise<Money> {
    const agg = await tx.paymentAllocations.aggregate({
      where: { payment_id: paymentId },
      _sum: { allocated_amount: true },
    });
    return moneyFrom(agg._sum.allocated_amount?.toString() ?? '0');
  }

  private async refreshInvoiceStatus(
    tx: Tx,
    invoiceId: string,
  ): Promise<string> {
    const invoice = await tx.invoices.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === 'DRAFT' || invoice.status === 'VOIDED') {
      return invoice.status;
    }
    const allocated = await this.allocatedSum(tx, invoiceId);
    const outstanding = outstandingBalance(
      invoice.total_amount.toString(),
      moneyToDecimal(allocated),
    );
    const next = statusFromOutstanding(
      moneyFrom(invoice.total_amount.toString()),
      outstanding,
      invoice.status,
    );
    if (next !== invoice.status) {
      assertInvoiceTransition(invoice.status, next);
      await tx.invoices.update({
        where: { id: invoiceId },
        data: { status: next },
      });
    }
    return next;
  }

  private async postPaymentAllocationJournal(
    tx: Tx,
    input: {
      paymentId: string;
      paymentNumber: string;
      invoiceNumber: string;
      amount: Money;
      glAccountId: string;
      actorUserId: string;
      paymentDate: Date;
    },
  ) {
    const ar = await this.requireArAccount(tx);
    const je = await createAndPostJournal(tx, {
      entryDate: startOfDay(input.paymentDate),
      referenceType: 'PAYMENT',
      referenceId: input.paymentId,
      description: `Payment ${input.paymentNumber} → ${input.invoiceNumber}`,
      createdBy: input.actorUserId,
      lines: [
        {
          accountId: input.glAccountId,
          direction: 'DEBIT',
          amount: moneyToDecimal(input.amount),
          description: `Receipt ${input.paymentNumber}`,
        },
        {
          accountId: ar.id,
          direction: 'CREDIT',
          amount: moneyToDecimal(input.amount),
          description: `AR relief ${input.invoiceNumber}`,
        },
      ],
    });
    await tx.payments.update({
      where: { id: input.paymentId },
      data: { journal_entry_id: je.id },
    });
    return je;
  }

  // ── Services master ──────────────────────────────────────────────────────

  async listServices(query: {
    page?: number;
    limit?: number;
    search?: string;
    active?: boolean;
    category?: string;
  }) {
    const { page, limit, skip } = this.paginate(query.page, query.limit);
    const q = query.search?.trim();
    const where: Prisma.ServicesWhereInput = {
      ...(query.active !== undefined ? { is_active: query.active } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(q
        ? {
            OR: [
              { service_code: { contains: q, mode: 'insensitive' } },
              { service_name: { contains: q, mode: 'insensitive' } },
              { category: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.services.count({ where }),
      this.prisma.services.findMany({
        where,
        orderBy: { service_code: 'asc' },
        skip,
        take: limit,
      }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        serviceCode: r.service_code,
        serviceName: r.service_name,
        category: r.category,
        description: r.description,
        standardPrice: r.standard_price.toString(),
        revenueAccountId: r.revenue_account_id,
        isActive: r.is_active,
      })),
      total,
      page,
      limit,
    };
  }

  async getService(id: string) {
    const row = await this.prisma.services.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Service not found');
    return {
      id: row.id,
      serviceCode: row.service_code,
      serviceName: row.service_name,
      category: row.category,
      description: row.description,
      standardPrice: row.standard_price.toString(),
      revenueAccountId: row.revenue_account_id,
      isActive: row.is_active,
    };
  }

  async createService(input: {
    serviceCode: string;
    serviceName: string;
    category?: string;
    description?: string;
    standardPrice: string | number;
    revenueAccountId?: string;
    isActive?: boolean;
    actorUserId: string;
  }) {
    const price = moneyFrom(input.standardPrice);
    assertNonNegative(price, 'Standard price');
    const isActive = input.isActive ?? true;
    const serviceCode = input.serviceCode.trim();
    const serviceName = input.serviceName.trim();
    const categoryName = input.category?.trim() || null;
    let revenueAccountId = input.revenueAccountId ?? null;
    if (!revenueAccountId && isActive) {
      revenueAccountId = await this.resolveDefaultRevenueAccountId(
        this.prisma,
        {
          category: categoryName,
          serviceCode,
          serviceName,
        },
      );
    }
    if (isActive && revenueAccountId) {
      await this.requireRevenueAccount(this.prisma, revenueAccountId);
    }
    let categoryId: string | null = null;
    if (categoryName) {
      const slug = categoryName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 100);
      const cat = await this.prisma.serviceCategories.upsert({
        where: { name: categoryName },
        create: {
          name: categoryName,
          slug: slug || 'general',
          is_active: true,
        },
        update: { is_active: true },
      });
      categoryId = cat.id;
    }
    const row = await this.prisma.services.create({
      data: {
        service_code: serviceCode,
        service_name: serviceName,
        category: categoryName,
        category_id: categoryId,
        description: input.description?.trim() || null,
        standard_price: moneyToDecimal(price),
        revenue_account_id: revenueAccountId,
        is_active: isActive,
      },
    });
    await this.audit.recordMutation({
      userId: input.actorUserId,
      action: 'CREATE',
      entityType: 'billing.services',
      entityId: row.id,
      newValues: { serviceCode: row.service_code },
    });
    return this.getService(row.id);
  }

  async updateService(
    id: string,
    input: {
      serviceName?: string;
      category?: string | null;
      description?: string | null;
      standardPrice?: string | number;
      revenueAccountId?: string | null;
      isActive?: boolean;
      actorUserId: string;
    },
  ) {
    const existing = await this.prisma.services.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Service not found');
    const nextActive = input.isActive ?? existing.is_active;
    let nextRevenue =
      input.revenueAccountId !== undefined
        ? input.revenueAccountId
        : existing.revenue_account_id;
    if (nextActive && !nextRevenue) {
      nextRevenue = await this.resolveDefaultRevenueAccountId(this.prisma, {
        category:
          input.category !== undefined ? input.category : existing.category,
        serviceCode: existing.service_code,
        serviceName:
          input.serviceName !== undefined
            ? input.serviceName
            : existing.service_name,
      });
    }
    if (nextActive && nextRevenue) {
      await this.requireRevenueAccount(this.prisma, nextRevenue);
    }
    const data: Prisma.ServicesUpdateInput = {};
    if (input.serviceName !== undefined)
      data.service_name = input.serviceName.trim();
    if (input.category !== undefined) data.category = input.category;
    if (input.description !== undefined) data.description = input.description;
    if (input.standardPrice !== undefined) {
      const price = moneyFrom(input.standardPrice);
      assertNonNegative(price, 'Standard price');
      data.standard_price = moneyToDecimal(price);
    }
    if (input.revenueAccountId !== undefined || nextRevenue !== existing.revenue_account_id)
      data.revenue_account_id = nextRevenue;
    if (input.isActive !== undefined) data.is_active = input.isActive;
    const row = await this.prisma.services.update({ where: { id }, data });
    await this.audit.recordMutation({
      userId: input.actorUserId,
      action: 'UPDATE',
      entityType: 'billing.services',
      entityId: row.id,
      oldValues: { serviceCode: existing.service_code },
      newValues: { serviceCode: row.service_code },
    });
    return this.getService(row.id);
  }

  // ── Accounts ─────────────────────────────────────────────────────────────

  async listAccounts(query: {
    page?: number;
    limit?: number;
    search?: string;
    accountType?: string;
    active?: boolean;
    postable?: boolean;
  }) {
    const { page, limit, skip } = this.paginate(query.page, query.limit);
    const q = query.search?.trim();
    const where: Prisma.AccountsWhereInput = {
      ...(query.accountType
        ? { account_type: query.accountType.toUpperCase() }
        : {}),
      ...(query.active !== undefined ? { is_active: query.active } : {}),
      ...(query.postable !== undefined ? { is_postable: query.postable } : {}),
      ...(q
        ? {
            OR: [
              { account_code: { contains: q, mode: 'insensitive' } },
              { account_name: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.accounts.count({ where }),
      this.prisma.accounts.findMany({
        where,
        include: { parent: true },
        orderBy: { account_code: 'asc' },
        skip,
        take: limit,
      }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        accountCode: r.account_code,
        accountName: r.account_name,
        parentId: r.parent_id,
        parentCode: r.parent?.account_code ?? null,
        parentName: r.parent?.account_name ?? null,
        accountType: r.account_type,
        normalBalance: r.normal_balance,
        isPostable: r.is_postable,
        isActive: r.is_active,
        description: r.description,
      })),
      total,
      page,
      limit,
    };
  }

  async createAccount(input: {
    accountCode: string;
    accountName: string;
    parentId?: string;
    accountType: string;
    normalBalance: string;
    isPostable?: boolean;
    isActive?: boolean;
    description?: string;
    actorUserId: string;
  }) {
    assertAccountTypeBalance(input.accountType, input.normalBalance);
    if (input.parentId) {
      const parent = await this.prisma.accounts.findUnique({
        where: { id: input.parentId },
      });
      if (!parent) throw new BadRequestException('Parent account not found');
    }
    const row = await this.prisma.accounts.create({
      data: {
        account_code: input.accountCode.trim(),
        account_name: input.accountName.trim(),
        parent_id: input.parentId ?? null,
        account_type: input.accountType.toUpperCase(),
        normal_balance: input.normalBalance.toUpperCase(),
        is_postable: input.isPostable ?? true,
        is_active: input.isActive ?? true,
        description: input.description?.trim() || null,
      },
    });
    await this.audit.recordMutation({
      userId: input.actorUserId,
      action: 'CREATE',
      entityType: 'billing.accounts',
      entityId: row.id,
      newValues: { accountCode: row.account_code },
    });
    return row;
  }

  async updateAccount(
    id: string,
    input: {
      accountName?: string;
      parentId?: string | null;
      accountType?: string;
      normalBalance?: string;
      isPostable?: boolean;
      isActive?: boolean;
      description?: string | null;
      actorUserId: string;
    },
  ) {
    const existing = await this.prisma.accounts.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Account not found');
    const lineCount = await this.prisma.journalLines.count({
      where: { account_id: id },
    });
    const changingType =
      (input.accountType !== undefined &&
        input.accountType.toUpperCase() !== existing.account_type) ||
      (input.normalBalance !== undefined &&
        input.normalBalance.toUpperCase() !== existing.normal_balance);
    if (changingType && lineCount > 0) {
      throw new BadRequestException(
        'Cannot change account type or normal balance after journal lines exist',
      );
    }
    if (input.accountType !== undefined || input.normalBalance !== undefined) {
      assertAccountTypeBalance(
        input.accountType ?? existing.account_type,
        input.normalBalance ?? existing.normal_balance,
      );
    }
    if (input.parentId) {
      if (input.parentId === id) {
        throw new BadRequestException('Account cannot be its own parent');
      }
      const parent = await this.prisma.accounts.findUnique({
        where: { id: input.parentId },
      });
      if (!parent) throw new BadRequestException('Parent account not found');
    }
    const row = await this.prisma.accounts.update({
      where: { id },
      data: {
        ...(input.accountName !== undefined
          ? { account_name: input.accountName.trim() }
          : {}),
        ...(input.parentId !== undefined ? { parent_id: input.parentId } : {}),
        ...(input.accountType !== undefined
          ? { account_type: input.accountType.toUpperCase() }
          : {}),
        ...(input.normalBalance !== undefined
          ? { normal_balance: input.normalBalance.toUpperCase() }
          : {}),
        ...(input.isPostable !== undefined
          ? { is_postable: input.isPostable }
          : {}),
        ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
      },
    });
    await this.audit.recordMutation({
      userId: input.actorUserId,
      action: 'UPDATE',
      entityType: 'billing.accounts',
      entityId: row.id,
      oldValues: { accountCode: existing.account_code },
      newValues: { accountCode: row.account_code },
    });
    return row;
  }

  // ── Tax rates ────────────────────────────────────────────────────────────

  async listTaxRates(query: {
    page?: number;
    limit?: number;
    search?: string;
    active?: boolean;
  }) {
    const { page, limit, skip } = this.paginate(query.page, query.limit);
    const q = query.search?.trim();
    const where: Prisma.TaxRatesWhereInput = {
      ...(query.active !== undefined ? { is_active: query.active } : {}),
      ...(q
        ? {
            OR: [
              { tax_code: { contains: q, mode: 'insensitive' } },
              { tax_name: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.taxRates.count({ where }),
      this.prisma.taxRates.findMany({
        where,
        include: { liability_account: true },
        orderBy: { tax_code: 'asc' },
        skip,
        take: limit,
      }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        taxName: r.tax_name,
        taxCode: r.tax_code,
        ratePercentage: r.rate_percentage.toString(),
        liabilityAccountId: r.liability_account_id,
        liabilityAccountCode: r.liability_account.account_code,
        isActive: r.is_active,
      })),
      total,
      page,
      limit,
    };
  }

  async createTaxRate(input: {
    taxName: string;
    taxCode: string;
    ratePercentage: string | number;
    liabilityAccountId: string;
    isActive?: boolean;
    actorUserId: string;
  }) {
    this.assertTaxRatePercentage(input.ratePercentage);
    await this.requireLiabilityAccount(this.prisma, input.liabilityAccountId);
    const row = await this.prisma.taxRates.create({
      data: {
        tax_name: input.taxName.trim(),
        tax_code: input.taxCode.trim(),
        rate_percentage: moneyToDecimal(moneyFrom(input.ratePercentage)),
        liability_account_id: input.liabilityAccountId,
        is_active: input.isActive ?? true,
      },
    });
    await this.audit.recordMutation({
      userId: input.actorUserId,
      action: 'CREATE',
      entityType: 'billing.tax_rates',
      entityId: row.id,
      newValues: { taxCode: row.tax_code },
    });
    return row;
  }

  async updateTaxRate(
    id: string,
    input: {
      taxName?: string;
      ratePercentage?: string | number;
      liabilityAccountId?: string;
      isActive?: boolean;
      actorUserId: string;
    },
  ) {
    const existing = await this.prisma.taxRates.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Tax rate not found');
    if (input.ratePercentage !== undefined) {
      this.assertTaxRatePercentage(input.ratePercentage);
    }
    if (input.liabilityAccountId) {
      await this.requireLiabilityAccount(this.prisma, input.liabilityAccountId);
    }
    const row = await this.prisma.taxRates.update({
      where: { id },
      data: {
        ...(input.taxName !== undefined
          ? { tax_name: input.taxName.trim() }
          : {}),
        ...(input.ratePercentage !== undefined
          ? {
              rate_percentage: moneyToDecimal(
                moneyFrom(input.ratePercentage),
              ),
            }
          : {}),
        ...(input.liabilityAccountId
          ? { liability_account_id: input.liabilityAccountId }
          : {}),
        ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
      },
    });
    await this.audit.recordMutation({
      userId: input.actorUserId,
      action: 'UPDATE',
      entityType: 'billing.tax_rates',
      entityId: row.id,
    });
    return row;
  }

  // ── Posting periods ──────────────────────────────────────────────────────

  async listPeriods(query: { page?: number; limit?: number; status?: string }) {
    const { page, limit, skip } = this.paginate(query.page, query.limit);
    const where: Prisma.PostingPeriodsWhereInput = {
      ...(query.status ? { status: query.status.toUpperCase() } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.postingPeriods.count({ where }),
      this.prisma.postingPeriods.findMany({
        where,
        orderBy: { start_date: 'desc' },
        skip,
        take: limit,
      }),
    ]);
    return { items: rows, total, page, limit };
  }

  async createPeriod(input: {
    periodName: string;
    startDate: string | Date;
    endDate: string | Date;
    fiscalYear: number;
    status?: 'OPEN' | 'CLOSED' | 'LOCKED';
    actorUserId: string;
  }) {
    const start = asDateOnly(input.startDate);
    const end = asDateOnly(input.endDate);
    if (end < start) {
      throw new BadRequestException('Period end date must be on or after start');
    }
    const row = await this.prisma.postingPeriods.create({
      data: {
        period_name: input.periodName.trim(),
        start_date: start,
        end_date: end,
        fiscal_year: input.fiscalYear,
        status: (input.status ?? 'OPEN').toUpperCase(),
      },
    });
    await this.audit.recordMutation({
      userId: input.actorUserId,
      action: 'CREATE',
      entityType: 'billing.posting_periods',
      entityId: row.id,
      newValues: { periodName: row.period_name },
    });
    return row;
  }

  async setPeriodStatus(
    id: string,
    status: 'OPEN' | 'CLOSED' | 'LOCKED',
    actorUserId: string,
  ) {
    const existing = await this.prisma.postingPeriods.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Posting period not found');
    const next = status.toUpperCase();
    if (!['OPEN', 'CLOSED', 'LOCKED'].includes(next)) {
      throw new BadRequestException('Status must be OPEN, CLOSED, or LOCKED');
    }
    const row = await this.prisma.postingPeriods.update({
      where: { id },
      data: { status: next },
    });
    await this.audit.recordMutation({
      userId: actorUserId,
      action: 'UPDATE',
      entityType: 'billing.posting_periods',
      entityId: row.id,
      oldValues: { status: existing.status },
      newValues: { status: row.status },
    });
    return row;
  }

  // ── Payment methods ──────────────────────────────────────────────────────

  async listPaymentMethods(query?: { active?: boolean }) {
    const rows = await this.prisma.paymentMethods.findMany({
      where: {
        ...(query?.active !== undefined ? { is_active: query.active } : {}),
      },
      include: { gl_account: true },
      orderBy: { method_code: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      methodName: r.method_name,
      methodCode: r.method_code,
      glAccountId: r.gl_account_id,
      glAccountCode: r.gl_account.account_code,
      isActive: r.is_active,
    }));
  }

  async updatePaymentMethod(
    id: string,
    input: {
      glAccountId?: string;
      isActive?: boolean;
      methodName?: string;
      actorUserId: string;
    },
  ) {
    const existing = await this.prisma.paymentMethods.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Payment method not found');
    if (input.glAccountId) {
      const gl = await this.prisma.accounts.findUnique({
        where: { id: input.glAccountId },
      });
      if (!gl) throw new BadRequestException('GL account not found');
      assertPostableActiveAccount(gl);
    }
    const row = await this.prisma.paymentMethods.update({
      where: { id },
      data: {
        ...(input.glAccountId ? { gl_account_id: input.glAccountId } : {}),
        ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
        ...(input.methodName !== undefined
          ? { method_name: input.methodName.trim() }
          : {}),
      },
    });
    await this.audit.recordMutation({
      userId: input.actorUserId,
      action: 'UPDATE',
      entityType: 'billing.payment_methods',
      entityId: row.id,
    });
    return this.listPaymentMethods().then((all) =>
      all.find((m) => m.id === id),
    );
  }

  // ── Invoices ─────────────────────────────────────────────────────────────

  async listInvoices(query: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    from?: string | Date;
    to?: string | Date;
    patientId?: string;
  }) {
    const { page, limit, skip } = this.paginate(query.page, query.limit);
    const q = query.search?.trim();
    const patientWhere = this.patientSearchWhere(q);
    const where: Prisma.InvoicesWhereInput = {
      deleted_at: null,
      ...(query.status ? { status: query.status.toUpperCase() } : {}),
      ...(query.patientId ? { patient_id: query.patientId } : {}),
      ...(query.from || query.to
        ? {
            invoice_date: {
              ...(query.from ? { gte: asDateOnly(query.from) } : {}),
              ...(query.to ? { lte: asDateOnly(query.to) } : {}),
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              { invoice_number: { contains: q, mode: 'insensitive' } },
              ...(patientWhere ? [{ patient: patientWhere }] : []),
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.invoices.count({ where }),
      this.prisma.invoices.findMany({
        where,
        include: {
          patient: { include: patientProfileInclude },
          billing_payment_allocations_invoice_id: {
            where: { payment: { status: 'COMPLETED' } },
            select: { allocated_amount: true },
          },
        },
        orderBy: { invoice_date: 'desc' },
        skip,
        take: limit,
      }),
    ]);
    return {
      items: rows.map((r) => {
        const allocated = r.billing_payment_allocations_invoice_id.reduce(
          (sum, a) => sum.add(moneyFrom(a.allocated_amount.toString())),
          moneyZero(),
        );
        const outstanding =
          r.status === 'VOIDED' || r.status === 'DRAFT'
            ? moneyZero()
            : outstandingBalance(
                r.total_amount.toString(),
                moneyToDecimal(allocated),
              );
        const allocatedStr = moneyToDecimal(allocated);
        const outstandingStr = moneyToDecimal(outstanding);
        return {
          id: r.id,
          invoiceNumber: r.invoice_number,
          patientId: r.patient_id,
          patientName: patientDisplayName(r.patient),
          patientMrn: r.patient.patient_number,
          invoiceDate: r.invoice_date,
          dueDate: r.due_date,
          ...invoiceMoneyFields({
            subtotal: r.subtotal.toString(),
            discount: r.discount.toString(),
            tax: r.tax.toString(),
            totalAmount: r.total_amount.toString(),
            allocated: allocatedStr,
            outstanding: outstandingStr,
            status: r.status,
          }),
          notes: displayNotes(r.notes),
        };
      }),
      total,
      page,
      limit,
    };
  }

  async getInvoice(id: string) {
    const row = await this.prisma.invoices.findUnique({
      where: { id },
      include: {
        patient: { include: patientProfileInclude },
        billing_invoice_items_invoice_id: {
          include: { service: true },
          orderBy: { created_at: 'asc' },
        },
        billing_payment_allocations_invoice_id: {
          include: {
            payment: {
              include: { payment_method: true },
            },
          },
        },
        billing_insurance_claims_invoice_id: {
          select: {
            id: true,
            claim_number: true,
            status: true,
            amount_claimed: true,
            amount_approved: true,
            amount_paid: true,
          },
        },
      },
    });
    if (!row || row.deleted_at) throw new NotFoundException('Invoice not found');
    const allocated = row.billing_payment_allocations_invoice_id
      .filter((a) => a.payment.status === 'COMPLETED')
      .reduce(
        (sum, a) => sum.add(moneyFrom(a.allocated_amount.toString())),
        moneyZero(),
      );
    const outstanding =
      row.status === 'VOIDED' || row.status === 'DRAFT'
        ? moneyZero()
        : outstandingBalance(
            row.total_amount.toString(),
            moneyToDecimal(allocated),
          );
    const allocatedStr = moneyToDecimal(allocated);
    const outstandingStr = moneyToDecimal(outstanding);
    return {
      id: row.id,
      invoiceNumber: row.invoice_number,
      patientId: row.patient_id,
      patientName: patientDisplayName(row.patient),
      patientMrn: row.patient.patient_number,
      consultationId: row.consultation_id,
      admissionId: row.admission_id,
      invoiceDate: row.invoice_date,
      dueDate: row.due_date,
      ...invoiceMoneyFields({
        subtotal: row.subtotal.toString(),
        discount: row.discount.toString(),
        tax: row.tax.toString(),
        totalAmount: row.total_amount.toString(),
        allocated: allocatedStr,
        outstanding: outstandingStr,
        status: row.status,
      }),
      isVoided: row.is_voided,
      voidReason: row.void_reason,
      notes: displayNotes(row.notes),
      items: row.billing_invoice_items_invoice_id.map((i) => ({
        id: i.id,
        serviceId: i.service_id,
        serviceCode: i.service?.service_code ?? null,
        serviceName: i.service?.service_name ?? null,
        description: i.description,
        quantity: i.quantity.toString(),
        unitPrice: i.unit_price.toString(),
        totalPrice: i.total_price.toString(),
      })),
      allocations: row.billing_payment_allocations_invoice_id.map((a) => ({
        id: a.id,
        paymentId: a.payment_id,
        paymentNumber: a.payment.payment_number,
        methodCode: a.payment.payment_method?.method_code ?? null,
        allocatedAmount: a.allocated_amount.toString(),
        allocatedAt: a.allocated_at,
        paymentStatus: a.payment.status,
      })),
      claims: row.billing_insurance_claims_invoice_id.map((c) => ({
        id: c.id,
        claimNumber: c.claim_number,
        status: c.status,
        amountClaimed: c.amount_claimed.toString(),
        amountApproved: c.amount_approved?.toString() ?? null,
        amountPaid: c.amount_paid?.toString() ?? null,
      })),
    };
  }

  async createInvoice(input: {
    patientId: string;
    invoiceDate?: string | Date;
    dueDate?: string | Date;
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
    actorUserId: string;
  }) {
    if (!input.lines?.length) {
      throw new BadRequestException('Invoice must have at least one line item');
    }
    const patient = await this.prisma.patients.findUnique({
      where: { id: input.patientId },
    });
    if (!patient || patient.deleted_at) {
      throw new NotFoundException('Patient not found');
    }

    let taxRatePercentage: string | null = null;
    if (input.taxRateId) {
      const taxRate = await this.prisma.taxRates.findUnique({
        where: { id: input.taxRateId },
      });
      if (!taxRate || !taxRate.is_active) {
        throw new BadRequestException('Tax rate not found or inactive');
      }
      taxRatePercentage = taxRate.rate_percentage.toString();
    }

    const resolvedLines: Array<{
      serviceId: string | null;
      description: string;
      quantity: string | number;
      unitPrice: string | number;
    }> = [];

    for (const line of input.lines) {
      let description = line.description?.trim();
      let unitPrice = line.unitPrice;
      let serviceId = line.serviceId ?? null;
      if (line.serviceId) {
        const service = await this.prisma.services.findUnique({
          where: { id: line.serviceId },
        });
        if (!service) throw new BadRequestException('Service not found');
        if (!service.is_active) {
          throw new BadRequestException(
            `Service ${service.service_code} is inactive`,
          );
        }
        if (unitPrice === undefined || unitPrice === null || unitPrice === '') {
          unitPrice = service.standard_price.toString();
        }
        if (!description) description = service.service_name;
        serviceId = service.id;
      }
      if (!description) {
        throw new BadRequestException('Line description is required');
      }
      if (unitPrice === undefined || unitPrice === null || unitPrice === '') {
        throw new BadRequestException('Line unit price is required');
      }
      resolvedLines.push({
        serviceId,
        description,
        quantity: line.quantity,
        unitPrice,
      });
    }

    const totals = calculateInvoiceTotals({
      lines: resolvedLines,
      discount: input.discount ?? 0,
      taxRatePercentage,
    });

    const invoiceDate = asDateOnly(input.invoiceDate);
    let dueDate = input.dueDate ? asDateOnly(input.dueDate) : new Date(invoiceDate);
    if (!input.dueDate) dueDate.setDate(dueDate.getDate() + 14);

    const created = await withNumberRetry(async (attempt) => {
      const invoiceNumber = await nextDocumentNumber(
        this.prisma,
        'INV',
        attempt,
      );
      return this.prisma.invoices.create({
        data: {
          invoice_number: invoiceNumber,
          patient_id: input.patientId,
          consultation_id: input.consultationId ?? null,
          admission_id: input.admissionId ?? null,
          invoice_date: invoiceDate,
          due_date: dueDate,
          subtotal: totals.subtotal,
          discount: totals.discount,
          tax: totals.tax,
          total_amount: totals.totalAmount,
          status: 'DRAFT',
          notes: withTaxRateMeta(input.notes, input.taxRateId),
          created_by: input.actorUserId,
          billing_invoice_items_invoice_id: {
            create: resolvedLines.map((line, idx) => ({
              service_id: line.serviceId,
              description: line.description,
              quantity: totals.lines[idx].quantity,
              unit_price: totals.lines[idx].unitPrice,
              total_price: totals.lines[idx].totalPrice,
            })),
          },
        },
      });
    });

    await this.audit.recordMutation({
      userId: input.actorUserId,
      action: 'CREATE',
      entityType: 'billing.invoices',
      entityId: created.id,
      newValues: {
        invoiceNumber: created.invoice_number,
        totalAmount: totals.totalAmount,
      },
    });
    return this.getInvoice(created.id);
  }

  /**
   * Apply (or change) discount on a DRAFT invoice and recalculate totals.
   * Issued invoices cannot be discounted this way — void/credit instead.
   */
  async updateDraftInvoice(
    id: string,
    input: {
      discount?: string | number;
      notes?: string;
      actorUserId: string;
    },
  ) {
    const invoice = await this.prisma.invoices.findUnique({
      where: { id },
      include: {
        billing_invoice_items_invoice_id: true,
      },
    });
    if (!invoice || invoice.deleted_at) {
      throw new NotFoundException('Invoice not found');
    }
    if (invoice.status !== 'DRAFT') {
      throw new BadRequestException(
        'Only draft invoices can be edited — issue or void and recreate if needed',
      );
    }

    const taxRateId = parseTaxRateId(invoice.notes);
    let taxRatePercentage: string | null = null;
    if (taxRateId) {
      const taxRate = await this.prisma.taxRates.findUnique({
        where: { id: taxRateId },
      });
      if (!taxRate) {
        throw new BadRequestException('Invoice tax rate no longer exists');
      }
      taxRatePercentage = taxRate.rate_percentage.toString();
    }

    const items = invoice.billing_invoice_items_invoice_id;
    const totals = calculateInvoiceTotals({
      lines: items.map((i) => ({
        quantity: i.quantity.toString(),
        unitPrice: i.unit_price.toString(),
      })),
      discount: input.discount ?? invoice.discount.toString(),
      taxRatePercentage,
    });

    await this.prisma.$transaction(async (tx) => {
      await Promise.all(
        items.map((item, i) =>
          tx.invoiceItems.update({
            where: { id: item.id },
            data: {
              quantity: totals.lines[i].quantity,
              unit_price: totals.lines[i].unitPrice,
              total_price: totals.lines[i].totalPrice,
            },
          }),
        ),
      );
      await tx.invoices.update({
        where: { id },
        data: {
          subtotal: totals.subtotal,
          discount: totals.discount,
          tax: totals.tax,
          total_amount: totals.totalAmount,
          ...(input.notes !== undefined
            ? {
                notes: withTaxRateMeta(
                  input.notes,
                  taxRateId,
                ),
              }
            : {}),
        },
      });
    });

    await this.audit.recordMutation({
      userId: input.actorUserId,
      action: 'UPDATE',
      entityType: 'billing.invoices',
      entityId: id,
      newValues: {
        discount: totals.discount,
        totalAmount: totals.totalAmount,
      },
    });
    return this.getInvoice(id);
  }

  async issueInvoice(id: string, actorUserId: string) {
    const invoiceId = await this.prisma.$transaction(
      async (tx) => {
        const invoice = await tx.invoices.findUnique({
          where: { id },
          include: {
            billing_invoice_items_invoice_id: {
              include: { service: true },
            },
          },
        });
        if (!invoice || invoice.deleted_at) {
          throw new NotFoundException('Invoice not found');
        }
        if (invoice.status !== 'DRAFT') {
          throw new BadRequestException('Only draft invoices can be issued');
        }

        const taxRateId = parseTaxRateId(invoice.notes);
        let taxRatePercentage: string | null = null;
        let taxLiabilityAccountId: string | null = null;
        if (taxRateId) {
          const taxRate = await tx.taxRates.findUnique({
            where: { id: taxRateId },
          });
          if (!taxRate) {
            throw new BadRequestException('Invoice tax rate no longer exists');
          }
          taxRatePercentage = taxRate.rate_percentage.toString();
          taxLiabilityAccountId = taxRate.liability_account_id;
          await this.requireLiabilityAccount(tx, taxLiabilityAccountId);
        }

        const items = invoice.billing_invoice_items_invoice_id;
        if (!items.length) {
          throw new BadRequestException('Invoice has no line items');
        }

        // Batch-validate revenue accounts (avoid N+1 inside the transaction)
        const revenueIds = [
          ...new Set(
            items
              .map((i) => i.service?.revenue_account_id)
              .filter((x): x is string => Boolean(x)),
          ),
        ];
        const revenueAccounts = revenueIds.length
          ? await tx.accounts.findMany({ where: { id: { in: revenueIds } } })
          : [];
        const revenueById = new Map(revenueAccounts.map((a) => [a.id, a]));

        const revenueByAccount = new Map<
          string,
          { accountId: string; lineTotalMinor: number }
        >();
        for (const item of items) {
          if (!item.service_id || !item.service) {
            throw new BadRequestException(
              'All lines must reference an active service with a revenue account before issue',
            );
          }
          if (!item.service.is_active) {
            throw new BadRequestException(
              `Service ${item.service.service_code} is inactive`,
            );
          }
          if (!item.service.revenue_account_id) {
            throw new BadRequestException(
              `Service ${item.service.service_code} has no revenue account`,
            );
          }
          const acct = revenueById.get(item.service.revenue_account_id);
          if (!acct) {
            throw new BadRequestException(
              `Revenue account for ${item.service.service_code} was not found`,
            );
          }
          assertPostableActiveAccount(acct);
          if (acct.account_type !== 'REVENUE') {
            throw new BadRequestException(
              `Account ${acct.account_code} must be a REVENUE account`,
            );
          }
          const key = item.service.revenue_account_id;
          const prev = revenueByAccount.get(key);
          const lineMinor = moneyFrom(item.total_price.toString()).amount;
          if (prev) prev.lineTotalMinor += lineMinor;
          else
            revenueByAccount.set(key, {
              accountId: key,
              lineTotalMinor: lineMinor,
            });
        }

        const totals = calculateInvoiceTotals({
          lines: items.map((i) => ({
            quantity: i.quantity.toString(),
            unitPrice: i.unit_price.toString(),
          })),
          discount: invoice.discount.toString(),
          taxRatePercentage,
        });
        assertPositive(moneyFrom(totals.totalAmount), 'Invoice total');

        const ar = await this.requireArAccount(tx);
        const netRevenue = moneyFrom(totals.taxable);
        const groups = [...revenueByAccount.values()];
        const ratios = groups.map((g) => g.lineTotalMinor);
        const revenueShares =
          netRevenue.isZero() || ratios.every((r) => r === 0)
            ? groups.map(() => moneyZero())
            : netRevenue.allocate(ratios);

        const jeLines: JournalLineInput[] = [
          {
            accountId: ar.id,
            direction: 'DEBIT',
            amount: totals.totalAmount,
            description: `AR ${invoice.invoice_number}`,
          },
        ];
        groups.forEach((g, idx) => {
          const share = revenueShares[idx];
          if (!share.isPositive()) return;
          jeLines.push({
            accountId: g.accountId,
            direction: 'CREDIT',
            amount: moneyToDecimal(share),
            description: `Revenue ${invoice.invoice_number}`,
          });
        });
        const taxAmt = moneyFrom(totals.tax);
        if (taxAmt.isPositive()) {
          if (!taxLiabilityAccountId) {
            throw new BadRequestException(
              'Tax amount present but no tax rate liability account on invoice',
            );
          }
          jeLines.push({
            accountId: taxLiabilityAccountId,
            direction: 'CREDIT',
            amount: totals.tax,
            description: `Tax ${invoice.invoice_number}`,
          });
        }

        assertInvoiceTransition(invoice.status, 'ISSUED');
        const je = await createAndPostJournal(tx, {
          entryDate: invoice.invoice_date,
          referenceType: 'INVOICE',
          referenceId: invoice.id,
          description: `Issue ${invoice.invoice_number}`,
          createdBy: actorUserId,
          lines: jeLines,
        });

        // Only touch lines whose computed amounts changed (fewer round-trips
        // on high-latency poolers such as Supabase).
        const lineUpdates = items.flatMap((item, i) => {
          const line = totals.lines[i];
          const sameQty = item.quantity.toString() === line.quantity;
          const sameUnit = item.unit_price.toString() === line.unitPrice;
          const sameTotal = item.total_price.toString() === line.totalPrice;
          if (sameQty && sameUnit && sameTotal) return [];
          return [
            tx.invoiceItems.update({
              where: { id: item.id },
              data: {
                quantity: line.quantity,
                unit_price: line.unitPrice,
                total_price: line.totalPrice,
              },
            }),
          ];
        });
        if (lineUpdates.length) await Promise.all(lineUpdates);

        const baseNotes = displayNotes(invoice.notes);
        const updated = await tx.invoices.update({
          where: { id },
          data: {
            subtotal: totals.subtotal,
            discount: totals.discount,
            tax: totals.tax,
            total_amount: totals.totalAmount,
            status: 'ISSUED',
            notes: withTaxRateMeta(
              `${baseNotes ? `${baseNotes}\n` : ''}[[je:${je.id}]]`,
              taxRateId,
            ),
          },
        });

        return { invoiceId: updated.id, journalEntryId: je.id, totals };
      },
      // Interactive tx over remote poolers needs headroom; default 5s is too low.
      { maxWait: 20_000, timeout: 60_000 },
    );

    await this.audit.recordMutation({
      userId: actorUserId,
      action: 'UPDATE',
      entityType: 'billing.invoices',
      entityId: invoiceId.invoiceId,
      oldValues: { status: 'DRAFT' },
      newValues: {
        status: 'ISSUED',
        journalEntryId: invoiceId.journalEntryId,
        totalAmount: invoiceId.totals.totalAmount,
      },
    });
    const issued = await this.getInvoice(invoiceId.invoiceId);
    this.emitDomainEvent('invoice.issued', {
      invoiceId: issued.id,
      invoiceNumber: issued.invoiceNumber,
      patientId: issued.patientId,
    });
    return issued;
  }

  async voidInvoice(id: string, reason: string, actorUserId: string) {
    if (!reason?.trim()) {
      throw new BadRequestException('Void reason is required');
    }
    const invoiceId = await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoices.findUnique({ where: { id } });
      if (!invoice || invoice.deleted_at) {
        throw new NotFoundException('Invoice not found');
      }
      if (!['DRAFT', 'ISSUED'].includes(invoice.status)) {
        throw new BadRequestException(
          'Only draft or issued invoices without allocations can be voided',
        );
      }
      const allocCount = await tx.paymentAllocations.count({
        where: { invoice_id: id },
      });
      if (allocCount > 0) {
        throw new BadRequestException(
          'Cannot void an invoice that has payment allocations',
        );
      }
      assertInvoiceTransition(invoice.status, 'VOIDED');

      if (invoice.status === 'ISSUED') {
        const je = await tx.journalEntries.findFirst({
          where: {
            reference_type: 'INVOICE',
            reference_id: invoice.id,
            status: 'POSTED',
          },
          orderBy: { created_at: 'desc' },
        });
        if (je) {
          await reverseJournal(tx, je.id, actorUserId, reason.trim());
        }
      }

      const updated = await tx.invoices.update({
        where: { id },
        data: {
          status: 'VOIDED',
          is_voided: true,
          void_reason: reason.trim(),
        },
      });
      await this.audit.recordMutation({
        userId: actorUserId,
        action: 'UPDATE',
        entityType: 'billing.invoices',
        entityId: updated.id,
        oldValues: { status: invoice.status },
        newValues: { status: 'VOIDED', reason: reason.trim() },
      });
      return updated.id;
    });
    return this.getInvoice(invoiceId);
  }

  // ── Payments ─────────────────────────────────────────────────────────────

  async listPayments(query: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    methodId?: string;
    from?: string | Date;
    to?: string | Date;
    patientId?: string;
  }) {
    const { page, limit, skip } = this.paginate(query.page, query.limit);
    const q = query.search?.trim();
    const patientWhere = this.patientSearchWhere(q);
    const where: Prisma.PaymentsWhereInput = {
      ...(query.status ? { status: query.status.toUpperCase() } : {}),
      ...(query.methodId ? { payment_method_id: query.methodId } : {}),
      ...(query.patientId ? { patient_id: query.patientId } : {}),
      ...(query.from || query.to
        ? {
            payment_date: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: endOfDay(new Date(query.to)) } : {}),
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              { payment_number: { contains: q, mode: 'insensitive' } },
              { transaction_reference: { contains: q, mode: 'insensitive' } },
              ...(patientWhere ? [{ patient: patientWhere }] : []),
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.payments.count({ where }),
      this.prisma.payments.findMany({
        where,
        include: {
          patient: { include: patientProfileInclude },
          payment_method: true,
          billing_payment_allocations_payment_id: true,
        },
        orderBy: { payment_date: 'desc' },
        skip,
        take: limit,
      }),
    ]);
    return {
      items: rows.map((r) => {
        const allocated = r.billing_payment_allocations_payment_id.reduce(
          (sum, a) => sum.add(moneyFrom(a.allocated_amount.toString())),
          moneyZero(),
        );
        return {
          id: r.id,
          paymentNumber: r.payment_number,
          patientId: r.patient_id,
          patientName: patientDisplayName(r.patient),
          patientMrn: r.patient.patient_number,
          amount: r.amount.toString(),
          allocated: moneyToDecimal(allocated),
          unallocated: moneyToDecimal(
            moneyFrom(r.amount.toString()).subtract(allocated),
          ),
          paymentMethodId: r.payment_method_id,
          methodCode: r.payment_method?.method_code ?? null,
          transactionReference: r.transaction_reference,
          paymentDate: r.payment_date,
          status: r.status,
          notes: r.notes,
          journalEntryId: r.journal_entry_id,
        };
      }),
      total,
      page,
      limit,
    };
  }

  async getPayment(id: string) {
    const row = await this.prisma.payments.findUnique({
      where: { id },
      include: {
        patient: { include: patientProfileInclude },
        payment_method: true,
        billing_payment_allocations_payment_id: {
          include: { invoice: true },
        },
      },
    });
    if (!row) throw new NotFoundException('Payment not found');
    const allocated = row.billing_payment_allocations_payment_id.reduce(
      (sum, a) => sum.add(moneyFrom(a.allocated_amount.toString())),
      moneyZero(),
    );
    return {
      id: row.id,
      paymentNumber: row.payment_number,
      patientId: row.patient_id,
      patientName: patientDisplayName(row.patient),
      patientMrn: row.patient.patient_number,
      amount: row.amount.toString(),
      allocated: moneyToDecimal(allocated),
      unallocated: moneyToDecimal(
        moneyFrom(row.amount.toString()).subtract(allocated),
      ),
      paymentMethodId: row.payment_method_id,
      methodCode: row.payment_method?.method_code ?? null,
      transactionReference: row.transaction_reference,
      paymentDate: row.payment_date,
      status: row.status,
      notes: row.notes,
      journalEntryId: row.journal_entry_id,
      allocations: row.billing_payment_allocations_payment_id.map((a) => ({
        id: a.id,
        invoiceId: a.invoice_id,
        invoiceNumber: a.invoice.invoice_number,
        allocatedAmount: a.allocated_amount.toString(),
        allocatedAt: a.allocated_at,
      })),
    };
  }

  async createPayment(input: {
    patientId: string;
    amount: string | number;
    paymentMethodId: string;
    transactionReference?: string;
    paymentDate?: string | Date;
    notes?: string;
    allocateToInvoiceId?: string;
    actorUserId: string;
    /** When true, caller emits a richer domain event (e.g. M-Pesa finalize). */
    skipDomainEvent?: boolean;
    domainPayload?: Record<string, string | undefined>;
  }) {
    const amount = moneyFrom(input.amount);
    assertPositive(amount, 'Payment amount');

    const created = await this.prisma.$transaction(
      async (tx) => {
        const patient = await tx.patients.findUnique({
          where: { id: input.patientId },
        });
        if (!patient || patient.deleted_at) {
          throw new NotFoundException('Patient not found');
        }
        const method = await tx.paymentMethods.findUnique({
          where: { id: input.paymentMethodId },
          include: { gl_account: true },
        });
        if (!method || !method.is_active) {
          throw new BadRequestException('Payment method not found or inactive');
        }
        assertPostableActiveAccount(method.gl_account);

        if (input.transactionReference?.trim()) {
          const dup = await tx.payments.findFirst({
            where: {
              transaction_reference: input.transactionReference.trim(),
              status: 'COMPLETED',
            },
          });
          if (dup) {
            throw new BadRequestException(
              'A completed payment with this transaction reference already exists',
            );
          }
        }

        const paymentDate = input.paymentDate
          ? new Date(input.paymentDate)
          : new Date();

        const payment = await withNumberRetry(async (attempt) => {
          const paymentNumber = await nextDocumentNumber(tx, 'PAY', attempt);
          return tx.payments.create({
            data: {
              payment_number: paymentNumber,
              patient_id: input.patientId,
              amount: moneyToDecimal(amount),
              payment_method_id: method.id,
              transaction_reference: input.transactionReference?.trim() || null,
              payment_date: paymentDate,
              status: 'COMPLETED',
              notes: input.notes?.trim() || null,
              received_by: input.actorUserId,
            },
          });
        });

        if (input.allocateToInvoiceId) {
          const inv = await tx.invoices.findUnique({
            where: { id: input.allocateToInvoiceId },
          });
          if (!inv || inv.deleted_at) {
            throw new NotFoundException('Invoice not found');
          }
          if (inv.status === 'PAID' || inv.status === 'VOIDED') {
            throw new BadRequestException(
              `Invoice ${inv.invoice_number} is already ${inv.status}`,
            );
          }
          await this.allocatePaymentInTx(tx, {
            paymentId: payment.id,
            invoiceId: input.allocateToInvoiceId,
            amount: moneyToDecimal(amount),
            actorUserId: input.actorUserId,
            allowCapToOutstanding: true,
          });
        }

        return {
          id: payment.id,
          paymentNumber: payment.payment_number,
        };
      },
      { maxWait: 20_000, timeout: 60_000 },
    );

    await this.audit.recordMutation({
      userId: input.actorUserId,
      action: 'CREATE',
      entityType: 'billing.payments',
      entityId: created.id,
      newValues: {
        paymentNumber: created.paymentNumber,
        amount: moneyToDecimal(amount),
      },
    });

    // Domain event after commit — notification failures must not roll back payment.
    if (!input.skipDomainEvent) {
      this.emitDomainEvent('payment.received', {
        patientId: input.patientId,
        paymentId: created.id,
        amount: moneyToDecimal(amount),
        invoiceId: input.allocateToInvoiceId,
        purpose: input.domainPayload?.purpose ?? 'PAYMENT',
        visitId: input.domainPayload?.visitId,
        ...input.domainPayload,
      });
    }

    return this.getPayment(created.id);
  }

  async allocatePayment(
    paymentId: string,
    invoiceId: string,
    amount: string | number,
    actorUserId: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await this.allocatePaymentInTx(tx, {
        paymentId,
        invoiceId,
        amount,
        actorUserId,
        allowCapToOutstanding: false,
      });
      await this.audit.recordMutation({
        userId: actorUserId,
        action: 'UPDATE',
        entityType: 'billing.payments',
        entityId: paymentId,
        newValues: { allocatedInvoiceId: invoiceId, amount },
      });
    });
    return this.getPayment(paymentId);
  }

  private async allocatePaymentInTx(
    tx: Tx,
    input: {
      paymentId: string;
      invoiceId: string;
      amount: string | number;
      actorUserId: string;
      allowCapToOutstanding: boolean;
    },
  ) {
    const payment = await tx.payments.findUnique({
      where: { id: input.paymentId },
      include: { payment_method: { include: { gl_account: true } } },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== 'COMPLETED') {
      throw new BadRequestException('Only completed payments can be allocated');
    }
    if (!payment.payment_method) {
      throw new BadRequestException('Payment has no payment method');
    }
    assertPostableActiveAccount(payment.payment_method.gl_account);

    const invoice = await tx.invoices.findUnique({
      where: { id: input.invoiceId },
    });
    if (!invoice || invoice.deleted_at) {
      throw new NotFoundException('Invoice not found');
    }
    // Re-read under transaction to reduce double-pay races (status may flip to PAID)
    if (invoice.status === 'PAID' || invoice.status === 'VOIDED') {
      throw new BadRequestException(
        `Cannot allocate payment — invoice is ${invoice.status}`,
      );
    }
    if (!['ISSUED', 'PARTIALLY_PAID'].includes(invoice.status)) {
      throw new BadRequestException(
        'Payments can only be allocated to issued or partially paid invoices',
      );
    }
    if (invoice.patient_id !== payment.patient_id) {
      throw new BadRequestException(
        'Payment and invoice must belong to the same patient',
      );
    }

    const existingAlloc = await tx.paymentAllocations.findUnique({
      where: {
        payment_id_invoice_id: {
          payment_id: payment.id,
          invoice_id: invoice.id,
        },
      },
    });
    if (existingAlloc) {
      throw new BadRequestException(
        'This payment is already allocated to that invoice',
      );
    }

    let allocAmount = moneyFrom(input.amount);
    assertPositive(allocAmount, 'Allocation amount');

    const alreadyOnPayment = await this.paymentAllocatedSum(tx, payment.id);
    const remainingOnPayment = moneyFrom(payment.amount.toString()).subtract(
      alreadyOnPayment,
    );
    if (allocAmount.compareTo(remainingOnPayment) > 0) {
      throw new BadRequestException(
        'Allocation exceeds the unallocated payment balance',
      );
    }

    const alreadyOnInvoice = await this.allocatedSum(tx, invoice.id);
    const outstanding = outstandingBalance(
      invoice.total_amount.toString(),
      moneyToDecimal(alreadyOnInvoice),
    );
    if (input.allowCapToOutstanding && allocAmount.compareTo(outstanding) > 0) {
      allocAmount = outstanding;
    }
    if (!allocAmount.isPositive()) {
      throw new BadRequestException('Nothing left to allocate on this invoice');
    }
    if (allocAmount.compareTo(outstanding) > 0) {
      throw new BadRequestException(
        'Allocation exceeds the invoice outstanding balance',
      );
    }

    await tx.paymentAllocations.create({
      data: {
        payment_id: payment.id,
        invoice_id: invoice.id,
        allocated_amount: moneyToDecimal(allocAmount),
      },
    });
    await this.refreshInvoiceStatus(tx, invoice.id);
    await this.postPaymentAllocationJournal(tx, {
      paymentId: payment.id,
      paymentNumber: payment.payment_number,
      invoiceNumber: invoice.invoice_number,
      amount: allocAmount,
      glAccountId: payment.payment_method.gl_account_id,
      actorUserId: input.actorUserId,
      paymentDate: payment.payment_date,
    });
  }

  // ── Claims ───────────────────────────────────────────────────────────────

  async listClaims(query: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    patientId?: string;
  }) {
    const { page, limit, skip } = this.paginate(query.page, query.limit);
    const q = query.search?.trim();
    const patientWhere = this.patientSearchWhere(q);
    const where: Prisma.InsuranceClaimsWhereInput = {
      ...(query.status ? { status: query.status.toUpperCase() } : {}),
      ...(query.patientId ? { patient_id: query.patientId } : {}),
      ...(q
        ? {
            OR: [
              { claim_number: { contains: q, mode: 'insensitive' } },
              ...(patientWhere ? [{ patient: patientWhere }] : []),
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.insuranceClaims.count({ where }),
      this.prisma.insuranceClaims.findMany({
        where,
        include: {
          patient: { include: patientProfileInclude },
          invoice: true,
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        claimNumber: r.claim_number,
        invoiceId: r.invoice_id,
        invoiceNumber: r.invoice.invoice_number,
        patientId: r.patient_id,
        patientName: patientDisplayName(r.patient),
        patientMrn: r.patient.patient_number,
        amountClaimed: r.amount_claimed.toString(),
        amountApproved: r.amount_approved?.toString() ?? null,
        amountPaid: r.amount_paid?.toString() ?? null,
        status: r.status,
        submissionDate: r.submission_date,
      })),
      total,
      page,
      limit,
    };
  }

  async getClaim(id: string) {
    const row = await this.prisma.insuranceClaims.findUnique({
      where: { id },
      include: {
        patient: { include: patientProfileInclude },
        invoice: true,
      },
    });
    if (!row) throw new NotFoundException('Claim not found');
    return {
      id: row.id,
      claimNumber: row.claim_number,
      invoiceId: row.invoice_id,
      invoiceNumber: row.invoice.invoice_number,
      patientId: row.patient_id,
      patientName: patientDisplayName(row.patient),
      patientMrn: row.patient.patient_number,
      insurancePolicyId: row.insurance_policy_id,
      amountClaimed: row.amount_claimed.toString(),
      amountApproved: row.amount_approved?.toString() ?? null,
      amountPaid: row.amount_paid?.toString() ?? null,
      status: row.status,
      submissionDate: row.submission_date,
      denialReason: row.denial_reason,
      notes: row.notes,
    };
  }

  async createClaim(input: {
    invoiceId: string;
    amountClaimed: string | number;
    insurancePolicyId?: string;
    notes?: string;
    actorUserId: string;
  }) {
    const invoice = await this.prisma.invoices.findUnique({
      where: { id: input.invoiceId },
    });
    if (!invoice || invoice.deleted_at) {
      throw new NotFoundException('Invoice not found');
    }
    if (!['ISSUED', 'PARTIALLY_PAID'].includes(invoice.status)) {
      throw new BadRequestException(
        'Claims require an issued or partially paid invoice',
      );
    }
    assertClaimAmounts({ claimed: input.amountClaimed });
    const claimed = moneyFrom(input.amountClaimed);
    assertPositive(claimed, 'Amount claimed');

    const created = await withNumberRetry(async (attempt) => {
      const claimNumber = await nextDocumentNumber(this.prisma, 'CLM', attempt);
      return this.prisma.insuranceClaims.create({
        data: {
          claim_number: claimNumber,
          invoice_id: invoice.id,
          patient_id: invoice.patient_id,
          insurance_policy_id: input.insurancePolicyId ?? null,
          amount_claimed: moneyToDecimal(claimed),
          amount_approved: '0',
          amount_paid: '0',
          status: 'DRAFT',
          notes: input.notes?.trim() || null,
          created_by: input.actorUserId,
        },
      });
    });
    await this.audit.recordMutation({
      userId: input.actorUserId,
      action: 'CREATE',
      entityType: 'billing.insurance_claims',
      entityId: created.id,
      newValues: { claimNumber: created.claim_number },
    });
    return this.getClaim(created.id);
  }


  private emitDomainEvent(
    type: string,
    payload: Record<string, string | undefined>,
  ): void {
    this.events.emit(type, {
      id: createDomainEventId(),
      type,
      occurredAt: new Date().toISOString(),
      payload,
    });
  }

  async transitionClaim(
    id: string,
    input: {
      status: string;
      amountApproved?: string | number;
      denialReason?: string;
      notes?: string;
      actorUserId: string;
    },
  ) {
    const existing = await this.prisma.insuranceClaims.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Claim not found');
    const next = input.status.toUpperCase();
    assertClaimTransition(existing.status, next);
    assertClaimAmounts({
      claimed: existing.amount_claimed.toString(),
      approved:
        input.amountApproved ?? existing.amount_approved?.toString() ?? null,
      paid: existing.amount_paid?.toString() ?? null,
    });
    const row = await this.prisma.insuranceClaims.update({
      where: { id },
      data: {
        status: next,
        ...(input.amountApproved !== undefined
          ? {
              amount_approved: moneyToDecimal(
                moneyFrom(input.amountApproved),
              ),
            }
          : {}),
        ...(next === 'SUBMITTED' && !existing.submission_date
          ? { submission_date: new Date() }
          : {}),
        ...(input.denialReason !== undefined
          ? { denial_reason: input.denialReason }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
    });
    await this.audit.recordMutation({
      userId: input.actorUserId,
      action: 'UPDATE',
      entityType: 'billing.insurance_claims',
      entityId: row.id,
      oldValues: { status: existing.status },
      newValues: { status: row.status },
    });
    
    const nextStatus = next;
    if (nextStatus === 'SUBMITTED') {
      this.emitDomainEvent('insurance_claim.submitted', {
        claimId: row.id,
        claimNumber: row.claim_number,
        patientId: row.patient_id,
      });
    } else if (nextStatus === 'APPROVED') {
      this.emitDomainEvent('insurance_claim.approved', {
        claimId: row.id,
        claimNumber: row.claim_number,
        patientId: row.patient_id,
      });
    } else if (nextStatus === 'DENIED' || nextStatus === 'REJECTED') {
      this.emitDomainEvent('insurance_claim.denied', {
        claimId: row.id,
        claimNumber: row.claim_number,
        patientId: row.patient_id,
      });
    }
    return this.getClaim(row.id);
  }

  async recordClaimPayment(
    id: string,
    input: {
      amount: string | number;
      actorUserId: string;
      transactionReference?: string;
      notes?: string;
    },
  ) {
    const payAmount = moneyFrom(input.amount);
    assertPositive(payAmount, 'Claim payment amount');

    const claimId = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.insuranceClaims.findUnique({
        where: { id },
        include: { invoice: true },
      });
      if (!claim) throw new NotFoundException('Claim not found');
      if (
        !['APPROVED', 'PARTIALLY_PAID', 'UNDER_REVIEW'].includes(claim.status)
      ) {
        throw new BadRequestException(
          'Claim must be approved or under review to record payment',
        );
      }

      const previousPaid = moneyFrom(claim.amount_paid?.toString() ?? '0');
      const newPaid = previousPaid.add(payAmount);
      assertClaimAmounts({
        claimed: claim.amount_claimed.toString(),
        approved: claim.amount_approved?.toString() ?? null,
        paid: moneyToDecimal(newPaid),
      });

      const method =
        (await tx.paymentMethods.findUnique({
          where: { method_code: 'INSURANCE' },
          include: { gl_account: true },
        })) ||
        (await tx.paymentMethods.findUnique({
          where: { method_code: 'CASH' },
          include: { gl_account: true },
        }));
      if (!method || !method.is_active) {
        throw new BadRequestException(
          'No INSURANCE or CASH payment method is configured',
        );
      }
      assertPostableActiveAccount(method.gl_account);

      const payment = await withNumberRetry(async (attempt) => {
        const paymentNumber = await nextDocumentNumber(tx, 'PAY', attempt);
        return tx.payments.create({
          data: {
            payment_number: paymentNumber,
            patient_id: claim.patient_id,
            amount: moneyToDecimal(payAmount),
            payment_method_id: method.id,
            transaction_reference: input.transactionReference?.trim() || null,
            payment_date: new Date(),
            status: 'COMPLETED',
            notes:
              input.notes?.trim() ||
              `Insurance claim ${claim.claim_number} payment`,
            received_by: input.actorUserId,
          },
        });
      });

      await this.allocatePaymentInTx(tx, {
        paymentId: payment.id,
        invoiceId: claim.invoice_id,
        amount: moneyToDecimal(payAmount),
        actorUserId: input.actorUserId,
        allowCapToOutstanding: false,
      });

      const approved = moneyFrom(
        claim.amount_approved?.toString() || claim.amount_claimed.toString(),
      );
      const nextStatus = newPaid.compareTo(approved) >= 0 ? 'PAID' : 'PARTIALLY_PAID';
      if (claim.status !== nextStatus) {
        assertClaimTransition(claim.status, nextStatus);
      }
      await tx.insuranceClaims.update({
        where: { id: claim.id },
        data: {
          amount_paid: moneyToDecimal(newPaid),
          status: nextStatus,
        },
      });

      await this.audit.recordMutation({
        userId: input.actorUserId,
        action: 'UPDATE',
        entityType: 'billing.insurance_claims',
        entityId: claim.id,
        newValues: {
          amountPaid: moneyToDecimal(newPaid),
          status: nextStatus,
          paymentId: payment.id,
        },
      });
      return claim.id;
    });
    return this.getClaim(claimId);
  }

  // ── Journals ─────────────────────────────────────────────────────────────

  async listJournals(query: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    from?: string | Date;
    to?: string | Date;
  }) {
    const { page, limit, skip } = this.paginate(query.page, query.limit);
    const q = query.search?.trim();
    const where: Prisma.JournalEntriesWhereInput = {
      ...(query.status ? { status: query.status.toUpperCase() } : {}),
      ...(query.from || query.to
        ? {
            entry_date: {
              ...(query.from ? { gte: asDateOnly(query.from) } : {}),
              ...(query.to ? { lte: asDateOnly(query.to) } : {}),
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              { entry_number: { contains: q, mode: 'insensitive' } },
              { description: { contains: q, mode: 'insensitive' } },
              { reference_type: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.journalEntries.count({ where }),
      this.prisma.journalEntries.findMany({
        where,
        orderBy: { entry_date: 'desc' },
        skip,
        take: limit,
      }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        entryNumber: r.entry_number,
        entryDate: r.entry_date,
        status: r.status,
        referenceType: r.reference_type,
        referenceId: r.reference_id,
        description: r.description,
        postedAt: r.posted_at,
      })),
      total,
      page,
      limit,
    };
  }

  async getJournal(id: string) {
    const row = await this.prisma.journalEntries.findUnique({
      where: { id },
      include: {
        billing_journal_lines_journal_entry_id: {
          include: { account: true },
          orderBy: { created_at: 'asc' },
        },
        posting_period: true,
      },
    });
    if (!row) throw new NotFoundException('Journal entry not found');
    return {
      id: row.id,
      entryNumber: row.entry_number,
      entryDate: row.entry_date,
      status: row.status,
      referenceType: row.reference_type,
      referenceId: row.reference_id,
      description: row.description,
      postingPeriodId: row.posting_period_id,
      postingPeriodName: row.posting_period.period_name,
      reversalOfId: row.reversal_of_id,
      postedAt: row.posted_at,
      lines: row.billing_journal_lines_journal_entry_id.map((l) => ({
        id: l.id,
        accountId: l.account_id,
        accountCode: l.account.account_code,
        accountName: l.account.account_name,
        direction: l.direction,
        amount: l.amount.toString(),
        description: l.description,
      })),
    };
  }

  async createManualJournal(input: {
    entryDate?: string | Date;
    description?: string;
    lines: JournalLineInput[];
    actorUserId: string;
  }) {
    const entryDate = asDateOnly(input.entryDate);
    const created = await this.prisma.$transaction(async (tx) => {
      return createAndPostJournal(tx, {
        entryDate,
        referenceType: 'MANUAL',
        description: input.description,
        lines: input.lines,
        createdBy: input.actorUserId,
        status: 'DRAFT',
      });
    });
    await this.audit.recordMutation({
      userId: input.actorUserId,
      action: 'CREATE',
      entityType: 'billing.journal_entries',
      entityId: created.id,
      newValues: { entryNumber: created.entryNumber, status: 'DRAFT' },
    });
    return this.getJournal(created.id);
  }

  async postJournal(id: string, actorUserId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      return postDraftJournal(tx, id, actorUserId);
    });
    await this.audit.recordMutation({
      userId: actorUserId,
      action: 'UPDATE',
      entityType: 'billing.journal_entries',
      entityId: result.id,
      newValues: { status: 'POSTED' },
    });
    return this.getJournal(result.id);
  }

  async reverseJournalEntry(
    id: string,
    actorUserId: string,
    reason?: string,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      return reverseJournal(tx, id, actorUserId, reason);
    });
    await this.audit.recordMutation({
      userId: actorUserId,
      action: 'UPDATE',
      entityType: 'billing.journal_entries',
      entityId: id,
      newValues: {
        status: 'REVERSED',
        reversalEntryId: result.id,
        reason,
      },
    });
    return this.getJournal(result.id);
  }

  // ── Overview ─────────────────────────────────────────────────────────────

  async overview() {
    const from = startOfDay();
    const to = endOfDay();

    const [issuedToday, paymentsToday, openInvoices, pendingClaims] =
      await Promise.all([
        this.prisma.invoices.findMany({
          where: {
            status: { in: ['ISSUED', 'PARTIALLY_PAID', 'PAID'] },
            invoice_date: { gte: from, lte: startOfDay(to) },
            deleted_at: null,
            is_voided: false,
          },
          select: { total_amount: true },
        }),
        this.prisma.payments.aggregate({
          where: {
            status: 'COMPLETED',
            payment_date: { gte: from, lte: to },
          },
          _sum: { amount: true },
        }),
        this.prisma.invoices.findMany({
          where: {
            status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
            deleted_at: null,
            is_voided: false,
          },
          include: {
            billing_payment_allocations_invoice_id: {
              where: { payment: { status: 'COMPLETED' } },
              select: { allocated_amount: true },
            },
          },
        }),
        this.prisma.insuranceClaims.count({
          where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } },
        }),
      ]);

    const issuedTotal = issuedToday.reduce(
      (sum, r) => sum.add(moneyFrom(r.total_amount.toString())),
      moneyZero(),
    );
    let outstandingAr = moneyZero();
    for (const inv of openInvoices) {
      const allocated = inv.billing_payment_allocations_invoice_id.reduce(
        (sum, a) => sum.add(moneyFrom(a.allocated_amount.toString())),
        moneyZero(),
      );
      outstandingAr = outstandingAr.add(
        outstandingBalance(
          inv.total_amount.toString(),
          moneyToDecimal(allocated),
        ),
      );
    }

    return {
      todayIssuedInvoicesTotal: moneyToDecimal(issuedTotal),
      todayIssuedInvoiceCount: issuedToday.length,
      todayCompletedPaymentsTotal: (
        paymentsToday._sum.amount?.toString() ?? '0'
      ),
      outstandingAr: moneyToDecimal(outstandingAr),
      pendingClaimsCount: pendingClaims,
    };
  }

  async invoicesSummary() {
    const [total, grouped, openInvoices] = await Promise.all([
      this.prisma.invoices.count({
        where: { deleted_at: null, is_voided: false },
      }),
      this.prisma.invoices.groupBy({
        by: ['status'],
        where: { deleted_at: null, is_voided: false },
        _count: { _all: true },
      }),
      this.prisma.invoices.findMany({
        where: {
          status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
          deleted_at: null,
          is_voided: false,
        },
        include: {
          billing_payment_allocations_invoice_id: {
            where: { payment: { status: 'COMPLETED' } },
            select: { allocated_amount: true },
          },
        },
      }),
    ]);
    const byStatus = Object.fromEntries(
      grouped.map((g) => [g.status, g._count._all]),
    );
    let outstandingKes = moneyZero();
    for (const inv of openInvoices) {
      const allocated = inv.billing_payment_allocations_invoice_id.reduce(
        (sum, a) => sum.add(moneyFrom(a.allocated_amount.toString())),
        moneyZero(),
      );
      outstandingKes = outstandingKes.add(
        outstandingBalance(
          inv.total_amount.toString(),
          moneyToDecimal(allocated),
        ),
      );
    }
    return {
      total,
      draft: byStatus.DRAFT ?? 0,
      issued: byStatus.ISSUED ?? 0,
      partiallyPaid: byStatus.PARTIALLY_PAID ?? 0,
      paid: byStatus.PAID ?? 0,
      outstandingKes: moneyToDecimal(outstandingKes),
    };
  }

  async paymentsSummary() {
    const from = startOfDay();
    const to = endOfDay();
    const [total, grouped, completedToday, completedSum, allocatedSum] =
      await Promise.all([
        this.prisma.payments.count(),
        this.prisma.payments.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
        this.prisma.payments.aggregate({
          where: {
            status: 'COMPLETED',
            payment_date: { gte: from, lte: to },
          },
          _sum: { amount: true },
        }),
        this.prisma.payments.aggregate({
          where: { status: 'COMPLETED' },
          _sum: { amount: true },
        }),
        this.prisma.paymentAllocations.aggregate({
          where: { payment: { status: 'COMPLETED' } },
          _sum: { allocated_amount: true },
        }),
      ]);
    const byStatus = Object.fromEntries(
      grouped.map((g) => [g.status, g._count._all]),
    );
    const completed = moneyFrom(completedSum._sum.amount?.toString() ?? '0');
    const allocated = moneyFrom(
      allocatedSum._sum.allocated_amount?.toString() ?? '0',
    );
    const unallocated = completed.subtract(allocated);
    return {
      total,
      completedTodayKes: completedToday._sum.amount?.toString() ?? '0',
      pending: byStatus.PENDING ?? 0,
      unallocatedKes: moneyToDecimal(
        unallocated.isNegative() ? moneyZero() : unallocated,
      ),
    };
  }

  async claimsSummary() {
    const [total, grouped] = await Promise.all([
      this.prisma.insuranceClaims.count(),
      this.prisma.insuranceClaims.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ]);
    const byStatus = Object.fromEntries(
      grouped.map((g) => [g.status, g._count._all]),
    );
    return {
      total,
      draft: byStatus.DRAFT ?? 0,
      inFlight:
        (byStatus.SUBMITTED ?? 0) + (byStatus.UNDER_REVIEW ?? 0),
      approved: byStatus.APPROVED ?? 0,
      denied: byStatus.DENIED ?? 0,
    };
  }

  async servicesSummary() {
    const [total, active] = await Promise.all([
      this.prisma.services.count(),
      this.prisma.services.count({ where: { is_active: true } }),
    ]);
    return {
      total,
      active,
      inactive: total - active,
    };
  }

  async accountsSummary() {
    const [total, activePostable, grouped] = await Promise.all([
      this.prisma.accounts.count(),
      this.prisma.accounts.count({
        where: { is_active: true, is_postable: true },
      }),
      this.prisma.accounts.groupBy({
        by: ['account_type'],
        _count: { _all: true },
      }),
    ]);
    const byType = Object.fromEntries(
      grouped.map((g) => [g.account_type, g._count._all]),
    );
    return {
      total,
      activePostable,
      byType,
    };
  }

  async journalsSummary() {
    const [total, grouped] = await Promise.all([
      this.prisma.journalEntries.count(),
      this.prisma.journalEntries.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ]);
    const byStatus = Object.fromEntries(
      grouped.map((g) => [g.status, g._count._all]),
    );
    return {
      total,
      draft: byStatus.DRAFT ?? 0,
      posted: byStatus.POSTED ?? 0,
      reversed: byStatus.REVERSED ?? 0,
    };
  }

  // ── Visit quote ──────────────────────────────────────────────────────────

  /**
   * Resolve which billing.services row is used for triage OPD consultation fees.
   * Priority:
   * 1. core.settings.consultation_fee_service_code (if that service is active)
   * 2. Active Consultation-category service with code 000-01. (clinic fee schedule)
   * 3. First active Consultation-category service by code
   * 4. Legacy CONSULT system code
   */
  async resolveConsultFeeService(): Promise<{
    id: string;
    serviceCode: string;
    serviceName: string;
    standardPrice: string;
    category: string | null;
  }> {
    const configured = await this.prisma.settings.findUnique({
      where: { key: 'consultation_fee_service_code' },
    });
    const preferred = configured?.value?.trim();
    if (preferred) {
      const row = await this.prisma.services.findFirst({
        where: { service_code: preferred, is_active: true },
      });
      if (row) {
        return {
          id: row.id,
          serviceCode: row.service_code,
          serviceName: row.service_name,
          standardPrice: row.standard_price.toString(),
          category: row.category,
        };
      }
    }

    const office = await this.prisma.services.findFirst({
      where: {
        is_active: true,
        OR: [
          { service_code: '000-01.' },
          { service_code: '000-01' },
        ],
      },
    });
    if (office) {
      return {
        id: office.id,
        serviceCode: office.service_code,
        serviceName: office.service_name,
        standardPrice: office.standard_price.toString(),
        category: office.category,
      };
    }

    const fromCategory = await this.prisma.services.findFirst({
      where: {
        is_active: true,
        category: { equals: 'Consultation', mode: 'insensitive' },
        NOT: { service_code: { in: ['LAB', 'MED', 'RAD', 'IPD'] } },
      },
      orderBy: { service_code: 'asc' },
    });
    if (fromCategory) {
      return {
        id: fromCategory.id,
        serviceCode: fromCategory.service_code,
        serviceName: fromCategory.service_name,
        standardPrice: fromCategory.standard_price.toString(),
        category: fromCategory.category,
      };
    }

    const legacy = await this.prisma.services.findFirst({
      where: { service_code: 'CONSULT', is_active: true },
    });
    if (!legacy) {
      throw new BadRequestException(
        'No consultation fee service is configured. Set one under Settings → General or Billing → Fee schedule.',
      );
    }
    return {
      id: legacy.id,
      serviceCode: legacy.service_code,
      serviceName: legacy.service_name,
      standardPrice: legacy.standard_price.toString(),
      category: legacy.category,
    };
  }

  async quoteVisitLines(input: {
    consultCount?: number;
    labCount?: number;
    medCount?: number;
    discount?: string | number;
    taxRateId?: string;
  }) {
    const consultCount = Math.max(0, Number(input.consultCount ?? 0));
    const labCount = Math.max(0, Number(input.labCount ?? 0));
    const medCount = Math.max(0, Number(input.medCount ?? 0));

    if (consultCount + labCount + medCount <= 0) {
      throw new BadRequestException('At least one fee line count is required');
    }

    const codes: Array<{ code: string; count: number }> = [];
    let consultService:
      | Awaited<ReturnType<BillingFinanceService['resolveConsultFeeService']>>
      | null = null;

    if (consultCount > 0) {
      consultService = await this.resolveConsultFeeService();
      codes.push({ code: consultService.serviceCode, count: consultCount });
    }
    if (labCount > 0) codes.push({ code: 'LAB', count: labCount });
    if (medCount > 0) codes.push({ code: 'MED', count: medCount });

    const services = await this.prisma.services.findMany({
      where: {
        service_code: { in: codes.map((c) => c.code) },
        is_active: true,
      },
    });
    const byCode = new Map(services.map((s) => [s.service_code, s]));

    let taxRatePercentage: string | null = null;
    if (input.taxRateId) {
      const taxRate = await this.prisma.taxRates.findUnique({
        where: { id: input.taxRateId },
      });
      if (!taxRate || !taxRate.is_active) {
        throw new BadRequestException('Tax rate not found or inactive');
      }
      taxRatePercentage = taxRate.rate_percentage.toString();
    }

    const lines = codes.map((c) => {
      const service =
        consultService && c.code === consultService.serviceCode
          ? {
              id: consultService.id,
              service_code: consultService.serviceCode,
              service_name: consultService.serviceName,
              standard_price: consultService.standardPrice,
            }
          : byCode.get(c.code);
      if (!service) {
        throw new BadRequestException(
          `Fee schedule service ${c.code} is not configured`,
        );
      }
      return {
        serviceId: service.id,
        serviceCode: service.service_code,
        description: service.service_name,
        quantity: c.count,
        unitPrice: String(service.standard_price),
      };
    });

    let taxCode: string | null = null;
    if (input.taxRateId) {
      const taxRate = await this.prisma.taxRates.findUnique({
        where: { id: input.taxRateId },
        select: { tax_code: true },
      });
      taxCode = taxRate?.tax_code ?? null;
    }

    const totals = calculateInvoiceTotals({
      lines,
      discount: input.discount ?? 0,
      taxRatePercentage,
    });

    return {
      lines: lines.map((line, idx) => ({
        ...line,
        quantity: totals.lines[idx].quantity,
        unitPrice: totals.lines[idx].unitPrice,
        totalPrice: totals.lines[idx].totalPrice,
      })),
      subtotal: totals.subtotal,
      discount: totals.discount,
      tax: totals.tax,
      totalAmount: totals.totalAmount,
      taxRatePercentage,
      taxCode,
    };
  }
}
