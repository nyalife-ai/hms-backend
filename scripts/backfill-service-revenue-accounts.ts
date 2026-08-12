/**
 * One-off / ops script: link active services missing revenue_account_id
 * to the correct postable REVENUE leaf (4100–4500).
 *
 * Usage: npx ts-node --transpile-only scripts/backfill-service-revenue-accounts.ts
 */
import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma';
import {
  backfillServiceRevenueAccounts,
  ensureBillingFoundation,
} from '../src/modules/billing/finance/ensure-foundation';

async function main() {
  const prisma = new PrismaClient();
  try {
    await ensureBillingFoundation(prisma);
    const before = await prisma.services.count({
      where: { is_active: true, revenue_account_id: null },
    });
    const result = await backfillServiceRevenueAccounts(prisma);
    console.log(
      JSON.stringify(
        {
          unmappedBefore: before,
          updated: result.updated,
          stillUnmapped: result.stillUnmapped,
        },
        null,
        2,
      ),
    );
    const sample = await prisma.services.findFirst({
      where: {
        OR: [{ service_code: '000-01.' }, { service_code: '000-01' }],
      },
      include: {
        category_rel: true,
      },
    });
    if (sample) {
      const acct = sample.revenue_account_id
        ? await prisma.accounts.findUnique({
            where: { id: sample.revenue_account_id },
          })
        : null;
      console.log(
        `Sample 000-01: ${sample.service_code} → ${acct?.account_code ?? 'UNMAPPED'} ${acct?.account_name ?? ''}`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
