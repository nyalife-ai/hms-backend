/**
 * Backfill clinical.follow_ups from outpatient visit payloads that include followUpDate.
 *
 * Usage: npx ts-node --transpile-only scripts/backfill-follow-ups-from-visits.ts
 */
import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma';

type VisitPayload = {
  followUpDate?: string;
  appointmentId?: string;
  clinicalRecord?: { followUpInstructions?: string };
};

function dateOnly(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        patient_id: string | null;
        mrn: string;
        payload: unknown;
        reason_for_visit: string | null;
      }>
    >`
      SELECT id, patient_id, mrn, payload, reason_for_visit
      FROM clinical.outpatient_visits
      WHERE COALESCE(payload->>'followUpDate', '') <> ''
    `;

    let created = 0;
    let skipped = 0;

    for (const row of rows) {
      const payload = (row.payload ?? {}) as VisitPayload;
      const followUpDateRaw = payload.followUpDate?.slice(0, 10);
      if (!followUpDateRaw) {
        skipped += 1;
        continue;
      }

      let patientId = row.patient_id;
      if (!patientId) {
        const patient = await prisma.patients.findFirst({
          where: { patient_number: row.mrn, deleted_at: null },
          select: { id: true },
        });
        patientId = patient?.id ?? null;
      }
      if (!patientId) {
        skipped += 1;
        continue;
      }

      let consultation = payload.appointmentId
        ? await prisma.consultations.findFirst({
            where: { appointment_id: payload.appointmentId, deleted_at: null },
            select: { id: true, created_by: true },
          })
        : null;
      if (!consultation) {
        consultation = await prisma.consultations.findFirst({
          where: { patient_id: patientId, deleted_at: null },
          orderBy: { consultation_date: 'desc' },
          select: { id: true, created_by: true },
        });
      }
      if (!consultation) {
        skipped += 1;
        continue;
      }

      const day = dateOnly(followUpDateRaw);
      const next = new Date(day);
      next.setUTCDate(next.getUTCDate() + 1);
      const existing = await prisma.followUps.findFirst({
        where: {
          consultation_id: consultation.id,
          follow_up_date: { gte: day, lt: next },
        },
        select: { id: true },
      });
      if (existing) {
        skipped += 1;
        continue;
      }

      await prisma.followUps.create({
        data: {
          patient_id: patientId,
          consultation_id: consultation.id,
          follow_up_date: day,
          reason:
            payload.clinicalRecord?.followUpInstructions?.trim() ||
            row.reason_for_visit?.trim() ||
            'Follow-up from visit',
          status: 'SCHEDULED',
          created_by: consultation.created_by,
        },
      });
      created += 1;
    }

    console.log(JSON.stringify({ scanned: rows.length, created, skipped }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
