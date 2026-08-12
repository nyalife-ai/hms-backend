import { resolveRevenueAccountCode, REVENUE_ACCOUNT_CODES } from '../domain/service-revenue-account';

describe('resolveRevenueAccountCode', () => {
  it('maps legacy system fee codes', () => {
    expect(resolveRevenueAccountCode({ serviceCode: 'CONSULT' })).toBe(
      REVENUE_ACCOUNT_CODES.CONSULTATION,
    );
    expect(resolveRevenueAccountCode({ serviceCode: 'LAB' })).toBe(
      REVENUE_ACCOUNT_CODES.LABORATORY,
    );
    expect(resolveRevenueAccountCode({ serviceCode: 'MED' })).toBe(
      REVENUE_ACCOUNT_CODES.PHARMACY,
    );
    expect(resolveRevenueAccountCode({ serviceCode: 'RAD' })).toBe(
      REVENUE_ACCOUNT_CODES.RADIOLOGY,
    );
    expect(resolveRevenueAccountCode({ serviceCode: 'IPD' })).toBe(
      REVENUE_ACCOUNT_CODES.ADMISSION,
    );
  });

  it('maps triage consultation fee schedule codes', () => {
    expect(
      resolveRevenueAccountCode({
        serviceCode: '000-01.',
        category: 'Consultation',
        serviceName: 'Specialist Consultation - Office',
      }),
    ).toBe(REVENUE_ACCOUNT_CODES.CONSULTATION);
  });

  it('maps categories from the clinic fee schedule', () => {
    expect(
      resolveRevenueAccountCode({ category: 'Laboratory', serviceCode: '001-042' }),
    ).toBe(REVENUE_ACCOUNT_CODES.LABORATORY);
    expect(
      resolveRevenueAccountCode({ category: 'Imaging', serviceCode: '001-010' }),
    ).toBe(REVENUE_ACCOUNT_CODES.RADIOLOGY);
    expect(
      resolveRevenueAccountCode({ category: 'Delivery', serviceCode: '000-120' }),
    ).toBe(REVENUE_ACCOUNT_CODES.ADMISSION);
    expect(
      resolveRevenueAccountCode({ category: 'Procedure', serviceCode: '000-055' }),
    ).toBe(REVENUE_ACCOUNT_CODES.CONSULTATION);
    expect(
      resolveRevenueAccountCode({ category: 'Immunization', serviceCode: '002-003' }),
    ).toBe(REVENUE_ACCOUNT_CODES.CONSULTATION);
  });
});
