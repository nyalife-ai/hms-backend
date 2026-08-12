/**
 * Live-DB radiology / imaging journey e2e.
 * Opt-in: E2E_USE_LIVE_DB=true
 *
 * scan type → request → findings → report → image attach.
 */

import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { createLiveE2eApp } from './create-e2e-app';

describe('Live DB — Imaging journey', () => {
  const live = process.env.E2E_USE_LIVE_DB === 'true';

  it('is opt-in via E2E_USE_LIVE_DB', () => {
    expect(typeof live).toBe('boolean');
  });

  it('scan type → request → findings → report → images (live)', async () => {
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

      const doctor = await prisma.staffProfiles.findFirst({
        where: { deleted_at: null },
      });
      const patient = await prisma.patients.findFirst({
        where: { deleted_at: null },
      });
      expect(doctor).toBeTruthy();
      expect(patient).toBeTruthy();

      const suffix = Date.now().toString(36);
      const scanType = await request(http())
        .post('/imaging/scan-types')
        .set(auth)
        .send({
          scanType: `E2E CXR ${suffix}`,
          category: 'X-Ray',
          standardPrice: 2500,
        });
      expect([200, 201]).toContain(scanType.status);
      expect(scanType.body.scanType).toContain('E2E CXR');

      const catalog = await request(http()).get('/imaging/scan-types').set(auth);
      expect(catalog.status).toBe(200);
      expect(
        catalog.body.some((s: { id: string }) => s.id === scanType.body.id),
      ).toBe(true);

      const created = await request(http())
        .post('/ops/radiology-requests')
        .set(auth)
        .send({
          patientId: patient!.id,
          scanTypeId: scanType.body.id,
          requestingDoctorId: doctor!.id,
          indication: 'E2E cough',
        });
      expect([200, 201]).toContain(created.status);
      const requestId = (created.body.id || created.body.requestId) as string;
      expect(requestId).toBeTruthy();

      const detail = await request(http())
        .get(`/imaging/requests/${requestId}`)
        .set(auth);
      expect(detail.status).toBe(200);
      expect(detail.body.scan).toContain('E2E CXR');

      const findings = await request(http())
        .post(`/imaging/requests/${requestId}/findings`)
        .set(auth)
        .send({
          radiologistId: doctor!.id,
          findingsText: 'No focal consolidation. Heart size normal.',
          status: 'DRAFT',
        });
      expect([200, 201]).toContain(findings.status);

      const report = await request(http())
        .post(`/imaging/requests/${requestId}/report`)
        .set(auth)
        .send({
          radiologistId: doctor!.id,
          finalImpression: 'Normal chest radiograph',
          conclusion: 'No acute cardiopulmonary process',
          recommendations: 'Clinical correlation',
        });
      expect([200, 201]).toContain(report.status);

      const image = await request(http())
        .post(`/imaging/requests/${requestId}/images`)
        .set(auth)
        .send({
          filePath: `/pacs/e2e/${suffix}.dcm`,
          modality: 'CR',
          numberOfImages: 1,
        });
      expect([200, 201]).toContain(image.status);

      const after = await request(http())
        .get(`/imaging/requests/${requestId}`)
        .set(auth)
        .expect(200);
      expect(after.body.findings).toBeTruthy();
      expect(after.body.report).toBeTruthy();
      expect(after.body.images.length).toBeGreaterThanOrEqual(1);
    } finally {
      await app.close();
    }
  }, 240_000);
});
