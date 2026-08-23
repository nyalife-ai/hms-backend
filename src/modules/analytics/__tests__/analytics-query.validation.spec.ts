import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { AnalyticsQueryDto } from '../dto/analytics-query.dto';
import { AnalyticsService } from '../services/analytics.service';
import { resolvePeriod } from '../services/period.util';

describe('AnalyticsQueryDto', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  it('accepts known filters', async () => {
    const dto = await pipe.transform(
      {
        preset: 'last_7_days',
        compare: 'previous_period',
        granularity: 'day',
      },
      { type: 'query', metatype: AnalyticsQueryDto },
    );
    expect(dto.preset).toBe('last_7_days');
  });

  it('rejects unknown query keys', async () => {
    await expect(
      pipe.transform(
        { preset: 'last_7_days', bogus: 'x' },
        { type: 'query', metatype: AnalyticsQueryDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('AnalyticsService financial void exclusion', () => {
  it('sumInvoices path excludes voided invoices via where clause', async () => {
    const aggregate = jest.fn().mockResolvedValue({
      _sum: { total_amount: { toNumber: () => 500 } },
    });
    const prisma = {
      invoices: {
        aggregate,
        count: jest.fn().mockResolvedValue(3),
        findMany: jest.fn().mockResolvedValue([]),
      },
      payments: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      paymentAllocations: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { allocated_amount: 0 },
        }),
      },
      paymentMethods: { findMany: jest.fn().mockResolvedValue([]) },
      invoiceItems: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new AnalyticsService(prisma as never);
    const period = resolvePeriod({
      preset: 'last_30_days',
      compare: 'none',
      now: new Date(2026, 7, 23),
    });
    const payload = await (service as any).financial(period, {}, 'financial');
    expect(aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          is_voided: false,
          deleted_at: null,
        }),
      }),
    );
    const billed = payload.kpis.find((k: { key: string }) => k.key === 'revenue.billed');
    expect(billed.value).toBe(500);
  });
});
