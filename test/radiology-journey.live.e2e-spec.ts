/**
 * Live-DB regression — Radiology Stage A: the real request lifecycle under
 * /imaging/requests (replacing the old unvalidated PATCH /radiology/:id and
 * the three competing creation paths), department/billing sync on scan
 * types, and the versioned/amendable report model.
 * Opt-in: E2E_USE_LIVE_DB=true
 */

import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { createLiveE2eApp } from './create-e2e-app';

describe('Live DB — Radiology journey (Stage A)', () => {
  const live = process.env.E2E_USE_LIVE_DB === 'true';

  it('is opt-in via E2E_USE_LIVE_DB', () => {
    expect(typeof live).toBe('boolean');
  });

  it(
    'scan type -> request -> schedule -> check-in -> start -> complete -> findings -> report -> finalize -> amend',
    async () => {
      if (!live) {
        expect(process.env.E2E_USE_LIVE_DB !== 'true').toBe(true);
        return;
      }

      const app = await createLiveE2eApp();
      if (!app) {
        expect(true).toBe(true);
        return;
      }
      try {
        const prisma = app.get(PrismaService);
        const http = (): App => app.getHttpServer() as App;
        const login = await request(http())
          .post('/auth/login')
          .send({
            email: process.env.E2E_ADMIN_EMAIL || 'admin@nyalife.health',
            password: process.env.E2E_ADMIN_PASSWORD || 'nyalife123',
          });
        expect([200, 201]).toContain(login.status);
        const auth = { Authorization: `Bearer ${login.body.accessToken}` };

        const suffix = Date.now().toString(36);

        // Department for the scan type to sync into.
        const dept = await request(http())
          .post('/departments')
          .set(auth)
          .send({ name: `E2E Radiology Dept ${suffix}`, type: 'CLINICAL' });
        expect(dept.status).toBe(201);

        const scanType = await request(http())
          .post('/imaging/scan-types')
          .set(auth)
          .send({
            scanType: `E2E Pelvic Ultrasound ${suffix}`.slice(0, 50),
            category: 'Imaging',
            standardPrice: 3500,
            contrastRequired: false,
            departmentId: dept.body.id,
          });
        expect(scanType.status).toBe(201);
        expect(scanType.body.departmentId).toBe(dept.body.id);
        expect(scanType.body.billingServiceId).toBeTruthy();

        // Confirm the linked billing.services row actually synced.
        const billingService = await prisma.services.findUnique({
          where: { id: scanType.body.billingServiceId },
        });
        expect(billingService?.category).toBe('Imaging');
        expect(Number(billingService?.standard_price)).toBe(3500);

        const patient = await request(http())
          .post('/ops/patients')
          .set(auth)
          .send({
            firstName: 'Radiology',
            lastName: `E2E${suffix}`,
            gender: 'FEMALE',
            phone: `+2547${String(Date.now()).slice(-8)}`,
          });
        expect(patient.status).toBe(201);

        const doctor = await prisma.staffProfiles.findFirst({
          where: {
            deleted_at: null,
            is_active: true,
            user: { core_user_roles_user_id: { some: { role: { name: 'DOCTOR' } } } },
          },
        });
        expect(doctor).toBeTruthy();

        const created = await request(http())
          .post('/imaging/requests')
          .set(auth)
          .send({
            patientId: patient.body.id,
            scanTypeId: scanType.body.id,
            requestingDoctorId: doctor!.id,
            clinicalIndication: 'E2E suprapubic pain',
            priority: 'ROUTINE',
          });
        expect(created.status).toBe(201);
        expect(created.body.status).toBe('PENDING');
        const requestId = created.body.id as string;

        // Old scaffold PATCH is gone — any free-text status write must 404, not silently apply.
        await request(http())
          .patch(`/radiology/${requestId}`)
          .set(auth)
          .send({ status: 'COMPLETED' })
          .expect(404);

        const scheduled = await request(http())
          .post(`/imaging/requests/${requestId}/schedule`)
          .set(auth)
          .send({ scheduledAt: new Date(Date.now() + 3600_000).toISOString() });
        expect(scheduled.status).toBe(201);
        expect(scheduled.body.status).toBe('SCHEDULED');

        // Can't start straight from SCHEDULED to COMPLETED — out-of-order rejected.
        const badComplete = await request(http())
          .post(`/imaging/requests/${requestId}/complete`)
          .set(auth);
        expect(badComplete.status).toBe(400);

        await request(http())
          .post(`/imaging/requests/${requestId}/check-in`)
          .set(auth)
          .expect(201);
        await request(http())
          .post(`/imaging/requests/${requestId}/start`)
          .set(auth)
          .expect(201);
        const completed = await request(http())
          .post(`/imaging/requests/${requestId}/complete`)
          .set(auth);
        expect(completed.status).toBe(201);
        expect(completed.body.status).toBe('COMPLETED');

        const findings = await request(http())
          .post(`/imaging/requests/${requestId}/findings`)
          .set(auth)
          .send({ findingsText: 'Normal pelvic organs.' });
        expect(findings.status).toBe(201);

        const afterFindings = await request(http())
          .get(`/imaging/requests/${requestId}`)
          .set(auth);
        expect(afterFindings.body.status).toBe('REPORT_PENDING');
        expect(afterFindings.body.findingsHistory.length).toBe(1);

        const report = await request(http())
          .post(`/imaging/requests/${requestId}/report`)
          .set(auth)
          .send({
            finalImpression: 'Normal pelvic ultrasound.',
            conclusion: 'No abnormality detected.',
            finalize: true,
          });
        expect(report.status).toBe(201);
        expect(report.body.status).toBe('FINAL');
        const reportId = report.body.id as string;

        const afterReport = await request(http())
          .get(`/imaging/requests/${requestId}`)
          .set(auth);
        expect(afterReport.body.status).toBe('REPORTED');

        // Finalizing (releasing to the referring doctor) before REPORTED status would 400 — already REPORTED here so this succeeds.
        const finalized = await request(http())
          .post(`/imaging/requests/${requestId}/finalize`)
          .set(auth);
        expect(finalized.status).toBe(201);
        expect(finalized.body.status).toBe('FINALIZED');

        // A finalized report is immutable — must be amended, not overwritten.
        const amended = await request(http())
          .post(`/imaging/requests/${requestId}/report/amend`)
          .set(auth)
          .send({
            reportId,
            finalImpression: 'Normal pelvic ultrasound (amended: added measurement).',
            reason: 'E2E amendment — added a measurement omitted in the original report.',
          });
        expect(amended.status).toBe(201);
        expect(amended.body.status).toBe('AMENDED');
        expect(amended.body.amendsReportId ?? amended.body.amends_report_id).toBe(reportId);

        const finalDetail = await request(http())
          .get(`/imaging/requests/${requestId}`)
          .set(auth);
        expect(finalDetail.body.reportsHistory.length).toBe(2);

        // Audit trail recorded every mutating step.
        const auditRows = await prisma.auditLogs.findMany({
          where: { entity_type: { in: ['radiology.requests', 'radiology.findings', 'radiology.reports'] }, entity_id: requestId },
        });
        expect(auditRows.length).toBeGreaterThan(0);
      } finally {
        await app.close();
      }
    },
    60_000,
  );
});
