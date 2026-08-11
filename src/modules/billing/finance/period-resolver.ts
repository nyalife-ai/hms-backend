/**
 * Resolve an OPEN posting period for an entry date.
 */

import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../../database/prisma/prisma.service';

export type PeriodRow = {
  id: string;
  period_name: string;
  status: string;
  start_date: Date;
  end_date: Date;
  fiscal_year: number;
};

export async function resolveOpenPeriod(
  prisma: Pick<PrismaService, 'postingPeriods'>,
  entryDate: Date,
): Promise<PeriodRow> {
  const d = new Date(entryDate);
  d.setHours(0, 0, 0, 0);
  const period = await prisma.postingPeriods.findFirst({
    where: {
      start_date: { lte: d },
      end_date: { gte: d },
    },
    orderBy: { start_date: 'desc' },
  });
  if (!period) {
    throw new BadRequestException(
      'No posting period covers this date. Create an open posting period first.',
    );
  }
  if (period.status === 'CLOSED' || period.status === 'LOCKED') {
    throw new BadRequestException(
      `Posting period ${period.period_name} is ${period.status.toLowerCase()}`,
    );
  }
  if (period.status !== 'OPEN') {
    throw new BadRequestException(
      `Posting period ${period.period_name} is not open`,
    );
  }
  return period;
}
