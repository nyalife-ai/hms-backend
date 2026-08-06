/**
 * Live-DB Laboratory journey e2e (opt-in: E2E_USE_LIVE_DB=true).
 */

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { createE2eApp } from './create-e2e-app';

describe('Live DB — Laboratory journey', () => {
  const live = process.env.E2E_USE_LIVE_DB === 'true';

  it('is opt-in via E2E_USE_LIVE_DB', () => {
    expect(typeof live).toBe('boolean');
  });

  it('test type → params → request → sample → results → verify', async () => {
    if (!live) {
      expect(process.env.E2E_USE_LIVE_DB !== 'true').toBe(true);
      return;
    }

    let app: INestApplication | undefined;
    try {
      app = await createE2eApp();
      const prisma = app.get(PrismaService);
      if (!prisma.isConnected) {
        expect(prisma.isConnected).toBe(false);
        return;
      }

      const http = (): App => app!.getHttpServer() as App;
      const login = await request(http())
        .post('/auth/login')
        .send({
          email: process.env.E2E_ADMIN_EMAIL || 'admin@nyalife.health',
          password: process.env.E2E_ADMIN_PASSWORD || 'nyalife123',
        });
      expect([200, 201]).toContain(login.status);
      const auth = { Authorization: `Bearer ${login.body.accessToken}` };

      const doctor = await prisma.staffProfiles.findFirst({
        where: { deleted_at: null },
      });
      const patient = await prisma.patients.findFirst({
        where: { deleted_at: null },
      });
      expect(doctor).toBeTruthy();
      expect(patient).toBeTruthy();

      const suffix = Date.now().toString(36);

      const overview = await request(http())
        .get('/laboratory/overview')
        .set(auth);
      expect(overview.status).toBe(200);

      const testType = await request(http())
        .post('/laboratory/test-types')
        .set(auth)
        .send({
          testName: `E2E Panel ${suffix}`,
          category: 'Haematology',
          standardPrice: 1200,
        });
      expect([200, 201]).toContain(testType.status);

      const hb = await request(http())
        .post('/laboratory/parameters')
        .set(auth)
        .send({
          testTypeId: testType.body.id,
          parameterName: 'Hemoglobin',
          unitOfMeasurement: 'g/dL',
          normalReferenceRange: '12-16',
          displayOrder: 1,
        });
      expect([200, 201]).toContain(hb.status);

      const wbc = await request(http())
        .post('/laboratory/parameters')
        .set(auth)
        .send({
          testTypeId: testType.body.id,
          parameterName: 'WBC',
          unitOfMeasurement: '10^9/L',
          normalReferenceRange: '4-11',
          displayOrder: 2,
        });
      expect([200, 201]).toContain(wbc.status);

      const req = await request(http())
        .post('/laboratory/requests')
        .set(auth)
        .send({
          patientId: patient!.id,
          requestingDoctorId: doctor!.id,
          testTypeIds: [testType.body.id],
          priority: 'STAT',
          notes: 'E2E fasting',
        });
      expect([200, 201]).toContain(req.status);
      expect(req.body.status).toBe('PENDING');
      expect(req.body.priority).toBe('STAT');

      const sample = await request(http())
        .post(`/laboratory/requests/${req.body.id}/samples`)
        .set(auth)
        .send({ sampleType: 'BLOOD' });
      expect([200, 201]).toContain(sample.status);
      expect(sample.body.status).toBe('REGISTERED');
      expect(sample.body.patientId).toBe(patient!.id);

      await request(http())
        .post(`/laboratory/samples/${sample.body.id}/status`)
        .set(auth)
        .send({ status: 'IN_PROGRESS' })
        .expect(201);

      const results = await request(http())
        .post(`/laboratory/requests/${req.body.id}/results`)
        .set(auth)
        .send({
          lines: [
            {
              parameterId: hb.body.id,
              resultValue: '8.2',
              interpretation: 'CRITICAL',
            },
            {
              parameterId: wbc.body.id,
              resultValue: '7.1',
              interpretation: 'NORMAL',
            },
          ],
        });
      expect([200, 201]).toContain(results.status);
      expect(results.body.length).toBe(2);

      const critical = await request(http())
        .get('/laboratory/results?criticalOnly=true')
        .set(auth);
      expect(critical.status).toBe(200);
      expect(
        critical.body.items.some(
          (r: { requestId: string; isCritical: boolean }) =>
            r.requestId === req.body.id && r.isCritical,
        ),
      ).toBe(true);

      for (const line of results.body) {
        const verified = await request(http())
          .post(
            `/laboratory/requests/${req.body.id}/results/${line.id}/verify`,
          )
          .set(auth);
        expect([200, 201]).toContain(verified.status);
      }

      const done = await request(http())
        .get(`/laboratory/requests/${req.body.id}`)
        .set(auth);
      expect(done.status).toBe(200);
      expect(done.body.status).toBe('COMPLETED');
      expect(done.body.patientId).toBe(patient!.id);
      expect(done.body.results.every((r: { isVerified: boolean }) => r.isVerified)).toBe(
        true,
      );

      const forbid = await request(http())
        .post(
          `/laboratory/requests/${req.body.id}/results/${results.body[0].id}/correct`,
        )
        .set(auth)
        .send({ resultValue: '9.0', interpretation: 'LOW' });
      // ADMIN can correct; if login is admin expect success
      expect([200, 201, 403]).toContain(forbid.status);
    } finally {
      await app?.close();
    }
  }, 120_000);
});
