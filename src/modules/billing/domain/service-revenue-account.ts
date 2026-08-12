/**
 * Maps billable services to postable REVENUE leaf accounts (4100–4500).
 * Used when seeding, backfilling, and creating services without an explicit GL link.
 */

export const REVENUE_ACCOUNT_CODES = {
  CONSULTATION: '4100',
  LABORATORY: '4200',
  RADIOLOGY: '4300',
  PHARMACY: '4400',
  ADMISSION: '4500',
} as const;

export type RevenueAccountCode =
  (typeof REVENUE_ACCOUNT_CODES)[keyof typeof REVENUE_ACCOUNT_CODES];

const LAB_CATEGORY =
  /^(laboratory|hematology|chemistry|microbiology|serology|pathology|biochemistry|parasitology|reproductive)$/i;

const IMAGING_CATEGORY = /^imaging$/i;
const CONSULT_CATEGORY = /^consultation$/i;
const ADMISSION_CATEGORY = /^(delivery|admission|inpatient|ipd)$/i;
const PHARMACY_CATEGORY = /^(pharmacy|medication|drug)$/i;

/** Resolve the chart account *code* for a service row. */
export function resolveRevenueAccountCode(input: {
  category?: string | null;
  serviceCode?: string | null;
  serviceName?: string | null;
}): RevenueAccountCode {
  const code = (input.serviceCode ?? '').trim().toUpperCase();
  const category = (input.category ?? '').trim();
  const name = (input.serviceName ?? '').trim().toLowerCase();

  // Legacy OPD system fee codes
  switch (code) {
    case 'CONSULT':
      return REVENUE_ACCOUNT_CODES.CONSULTATION;
    case 'LAB':
      return REVENUE_ACCOUNT_CODES.LABORATORY;
    case 'MED':
      return REVENUE_ACCOUNT_CODES.PHARMACY;
    case 'RAD':
      return REVENUE_ACCOUNT_CODES.RADIOLOGY;
    case 'IPD':
      return REVENUE_ACCOUNT_CODES.ADMISSION;
    default:
      break;
  }

  if (CONSULT_CATEGORY.test(category)) {
    return REVENUE_ACCOUNT_CODES.CONSULTATION;
  }
  if (IMAGING_CATEGORY.test(category)) {
    return REVENUE_ACCOUNT_CODES.RADIOLOGY;
  }
  if (LAB_CATEGORY.test(category)) {
    return REVENUE_ACCOUNT_CODES.LABORATORY;
  }
  if (ADMISSION_CATEGORY.test(category)) {
    return REVENUE_ACCOUNT_CODES.ADMISSION;
  }
  if (PHARMACY_CATEGORY.test(category)) {
    return REVENUE_ACCOUNT_CODES.PHARMACY;
  }

  // Fee-schedule consultation band (000-01 … 000-04)
  if (/^000-0[1-4]/.test(code)) {
    return REVENUE_ACCOUNT_CODES.CONSULTATION;
  }

  if (/consult/i.test(name)) {
    return REVENUE_ACCOUNT_CODES.CONSULTATION;
  }
  if (/ultrasound|x-ray|xray|scan|imaging|echocardiogram|mammogram/i.test(name)) {
    return REVENUE_ACCOUNT_CODES.RADIOLOGY;
  }
  if (/lab\b|blood count|glucose|culture|specimen/i.test(name)) {
    return REVENUE_ACCOUNT_CODES.LABORATORY;
  }
  if (/delivery|admission|inpatient|ward/i.test(name)) {
    return REVENUE_ACCOUNT_CODES.ADMISSION;
  }

  // Procedures, immunization, antenatal, general services → consultation revenue
  return REVENUE_ACCOUNT_CODES.CONSULTATION;
}
