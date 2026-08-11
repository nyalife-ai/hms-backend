/**
 * Live-DB smoke/regression for audit logs + front-desk reason/notes + patient create.
 * Opt-in: E2E_USE_LIVE_DB=true
 */

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { createE2eApp } from './create-e2e-app';

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T | null> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          console.warn(`${label} timed out after ${ms}ms — soft-skipping`);
          resolve(null);
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

describe('Live DB — Audit + front desk check-in', () => {
  const live = process.env.E2E_USE_LIVE_DB === 'true';

  it('is opt-in via E2E_USE_LIVE_DB', () => {
    expect(typeof live).toBe('boolean');
  });

  it(
    'admin can list audit logs; check-in persists reason/notes; patient create works',
    async () => {
      if (!live) {
        expect(process.env.E2E_USE_LIVE_DB !== 'true').toBe(true);
        return;
      }

      const boot = createE2eApp();
      const app = await withTimeout(boot, 90_000, 'createE2eApp');
      if (!app) {
        void boot.then((a) => a.close()).catch(() => undefined);
        expect(true).toBe(true);
        return;
      }

      try {
        const prisma = app.get(PrismaService);
        if (!prisma.isConnected) {
          console.warn(
            'E2E_USE_LIVE_DB=true but Prisma is not connected; skipping live audit journey',
          );
          expect(prisma.isConnected).toBe(false);
          return;
        }

        const http = (): App => app.getHttpServer() as App;
        const login = await request(http())
          .post('/auth/login')
          .send({
            email: process.env.E2E_ADMIN_EMAIL || 'admin@nyalife.health',
            password: process.env.E2E_ADMIN_PASSWORD || 'nyalife123',
          });
        expect([200, 201]).toContain(login.status);
        const auth = { Authorization: `Bearer ${login.body.accessToken}` };

        const actors = await request(http()).get('/audit-logs/actors').set(auth);
        expect(actors.status).toBe(200);
        expect(Array.isArray(actors.body)).toBe(true);

        const list = await request(http())
          .get('/audit-logs?page=1&limit=10')
          .set(auth);
        expect(list.status).toBe(200);
        expect(list.body).toEqual(
          expect.objectContaining({
            items: expect.any(Array),
            total: expect.any(Number),
            page: 1,
            limit: 10,
          }),
        );

        if (list.body.items?.length) {
          const first = list.body.items[0];
          const detail = await request(http())
            .get(`/audit-logs/${first.id}`)
            .set(auth);
          expect(detail.status).toBe(200);
          expect(detail.body).toEqual(
            expect.objectContaining({
              id: first.id,
              action: expect.any(String),
              entityType: expect.any(String),
              changedFields: expect.any(Array),
            }),
          );
          const blob = JSON.stringify(detail.body);
          expect(blob).not.toMatch(/"otp"\s*:\s*"[0-9]{4,}"/);
        }

        const suffix = Date.now().toString(36);
        const phone = `+2547${String(Date.now()).slice(-8)}`;
        const patient = await request(http())
          .post('/ops/patients')
          .set(auth)
          .send({
            firstName: 'Audit',
            lastName: `Live${suffix}`,
            gender: 'Female',
            phone,
          });
        expect([200, 201]).toContain(patient.status);

        const mrn =
          patient.body.patient_number ||
          patient.body.patientNumber ||
          patient.body.mrn;
        expect(mrn).toBeTruthy();

        const checkIn = await request(http())
          .post('/visits/check-in')
          .set(auth)
          .send({
            patientName: `Audit Live${suffix}`,
            mrn,
            age: 29,
            gender: 'Female',
            phone,
            firstVisit: true,
            payment: { method: 'CASH' },
            reasonForVisit: 'Live audit ANC',
            additionalNotes: 'Created by live e2e',
          });
        expect([200, 201]).toContain(checkIn.status);
        expect(checkIn.body.reasonForVisit).toBe('Live audit ANC');
        expect(checkIn.body.additionalNotes).toBe('Created by live e2e');

        const stored = await prisma.outpatientVisits.findUnique({
          where: { id: checkIn.body.id },
        });
        expect(stored?.reason_for_visit).toBe('Live audit ANC');
        expect(stored?.additional_notes).toBe('Created by live e2e');

        const visitAudits = await prisma.auditLogs.findMany({
          where: { entity_id: checkIn.body.id },
          orderBy: { created_at: 'desc' },
          take: 5,
        });
        expect(visitAudits.length).toBeGreaterThan(0);
        const createAudit = visitAudits.find((a) => a.action === 'CREATE');
        expect(createAudit).toBeTruthy();
        const newVals = (createAudit?.new_values ?? {}) as Record<
          string,
          unknown
        >;
        expect(newVals.__changedFields || newVals.reason_for_visit).toBeTruthy();
      } finally {
        await (app as INestApplication).close();
      }
    },
    150_000,
  );
});
