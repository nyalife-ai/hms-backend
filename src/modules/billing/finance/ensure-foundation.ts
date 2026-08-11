/**
 * Ensures minimal chart of accounts, period, payment methods, and fee services.
 * Safe to call repeatedly (upserts by account_code / service_code).
 */

import type { PrismaClient } from '../../../generated/prisma';

type Db = Pick<
  PrismaClient,
  'accounts' | 'paymentMethods' | 'services' | 'postingPeriods' | 'taxRates'
>;

export async function ensureBillingFoundation(prisma: Db): Promise<void> {
  const cash = await prisma.accounts.upsert({
    where: { account_code: '1000' },
    create: {
      account_code: '1000',
      account_name: 'Cash on Hand',
      account_type: 'ASSET',
      normal_balance: 'DEBIT',
      is_postable: true,
      is_active: true,
    },
    update: { is_active: true, is_postable: true },
  });

  const mpesa = await prisma.accounts.upsert({
    where: { account_code: '1010' },
    create: {
      account_code: '1010',
      account_name: 'M-Pesa',
      account_type: 'ASSET',
      normal_balance: 'DEBIT',
      is_postable: true,
      is_active: true,
    },
    update: { is_active: true, is_postable: true },
  });

  await prisma.accounts.upsert({
    where: { account_code: '1100' },
    create: {
      account_code: '1100',
      account_name: 'Accounts Receivable',
      account_type: 'ASSET',
      normal_balance: 'DEBIT',
      is_postable: true,
      is_active: true,
    },
    update: { is_active: true, is_postable: true },
  });

  const taxPayable = await prisma.accounts.upsert({
    where: { account_code: '2100' },
    create: {
      account_code: '2100',
      account_name: 'Tax Payable',
      account_type: 'LIABILITY',
      normal_balance: 'CREDIT',
      is_postable: true,
      is_active: true,
    },
    update: { is_active: true, is_postable: true },
  });

  const revenueParent = await prisma.accounts.upsert({
    where: { account_code: '4000' },
    create: {
      account_code: '4000',
      account_name: 'Revenue',
      account_type: 'REVENUE',
      normal_balance: 'CREDIT',
      is_postable: false,
      is_active: true,
    },
    update: { is_postable: false, is_active: true },
  });

  const revenueLeaves = [
    { code: '4100', name: 'Consultation Revenue' },
    { code: '4200', name: 'Laboratory Revenue' },
    { code: '4300', name: 'Radiology Revenue' },
    { code: '4400', name: 'Pharmacy Revenue' },
    { code: '4500', name: 'Admission Revenue' },
  ] as const;

  const leafIds: Record<string, string> = {};
  for (const leaf of revenueLeaves) {
    const row = await prisma.accounts.upsert({
      where: { account_code: leaf.code },
      create: {
        account_code: leaf.code,
        account_name: leaf.name,
        parent_id: revenueParent.id,
        account_type: 'REVENUE',
        normal_balance: 'CREDIT',
        is_postable: true,
        is_active: true,
      },
      update: {
        parent_id: revenueParent.id,
        is_active: true,
        is_postable: true,
      },
    });
    leafIds[leaf.code] = row.id;
  }

  await prisma.paymentMethods.upsert({
    where: { method_code: 'CASH' },
    create: {
      method_name: 'Cash',
      method_code: 'CASH',
      gl_account_id: cash.id,
      is_active: true,
    },
    update: { gl_account_id: cash.id, is_active: true },
  });

  await prisma.paymentMethods.upsert({
    where: { method_code: 'MPESA' },
    create: {
      method_name: 'M-Pesa',
      method_code: 'MPESA',
      gl_account_id: mpesa.id,
      is_active: true,
    },
    update: { gl_account_id: mpesa.id, is_active: true },
  });

  await prisma.paymentMethods.upsert({
    where: { method_code: 'INSURANCE' },
    create: {
      method_name: 'Insurance Remittance',
      method_code: 'INSURANCE',
      gl_account_id: mpesa.id,
      is_active: true,
    },
    update: { is_active: true },
  });

  const serviceMap = [
    {
      code: 'CONSULT',
      name: 'Outpatient Consultation',
      price: 2500,
      category: 'Clinical',
      revenue: leafIds['4100'],
    },
    {
      code: 'LAB',
      name: 'Laboratory Test',
      price: 1500,
      category: 'Laboratory',
      revenue: leafIds['4200'],
    },
    {
      code: 'MED',
      name: 'Medication Dispense',
      price: 800,
      category: 'Pharmacy',
      revenue: leafIds['4400'],
    },
    {
      code: 'RAD',
      name: 'Radiology Scan',
      price: 3000,
      category: 'Radiology',
      revenue: leafIds['4300'],
    },
    {
      code: 'IPD',
      name: 'Inpatient Daily Charge',
      price: 5000,
      category: 'IPD',
      revenue: leafIds['4500'],
    },
  ];

  for (const s of serviceMap) {
    await prisma.services.upsert({
      where: { service_code: s.code },
      create: {
        service_code: s.code,
        service_name: s.name,
        category: s.category,
        standard_price: s.price,
        revenue_account_id: s.revenue,
        is_active: true,
      },
      // Never overwrite clinic-configured prices on every ensure pass.
      update: {
        revenue_account_id: s.revenue,
        is_active: true,
      },
    });
  }

  await prisma.taxRates.upsert({
    where: { tax_code: 'VAT0' },
    create: {
      tax_name: 'VAT (zero-rated)',
      tax_code: 'VAT0',
      rate_percentage: 0,
      liability_account_id: taxPayable.id,
      is_active: false,
    },
    update: { liability_account_id: taxPayable.id },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const year = today.getFullYear();
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  const existing = await prisma.postingPeriods.findFirst({
    where: {
      fiscal_year: year,
      start_date: start,
      end_date: end,
    },
  });
  if (!existing) {
    await prisma.postingPeriods.create({
      data: {
        period_name: `FY${year}`,
        start_date: start,
        end_date: end,
        status: 'OPEN',
        fiscal_year: year,
      },
    });
  } else if (existing.status !== 'OPEN') {
    // Keep existing closed/locked periods intact; ensure at least one open window
    // covering today by creating a current-month open period if needed.
    const covers = await prisma.postingPeriods.findFirst({
      where: {
        status: 'OPEN',
        start_date: { lte: today },
        end_date: { gte: today },
      },
    });
    if (!covers) {
      const mStart = new Date(year, today.getMonth(), 1);
      const mEnd = new Date(year, today.getMonth() + 1, 0);
      await prisma.postingPeriods.create({
        data: {
          period_name: `${year}-${String(today.getMonth() + 1).padStart(2, '0')}`,
          start_date: mStart,
          end_date: mEnd,
          status: 'OPEN',
          fiscal_year: year,
        },
      });
    }
  }
}
