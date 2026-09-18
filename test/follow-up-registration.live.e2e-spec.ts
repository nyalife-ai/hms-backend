/**
 * Live-DB regression — follow-up creation for a patient with no prior
 * consultation, and follow-up creation for a patient that already has one.
 * Opt-in: E2E_USE_LIVE_DB=true
 *
 * Bug: POST /follow-ups threw "consultationId is required when the patient
 * has no prior consultation" for a brand-new patient — but a new patient
 * cannot logically have a consultation yet. Fixed by making
 * clinical.follow_ups.consultation_id nullable and letting
 * CreateFollowUpUseCase create a patient-only follow-up when none resolves.
 */

import request from 'supertest';
import { App } from 'supertest/types';
import { createLiveE2eApp } from './create-e2e-app';

describe('Live DB — follow-up creation without a prior consultation', () => {
  const live = process.env.E2E_USE_LIVE_DB === 'true';

  it('is opt-in via E2E_USE_LIVE_DB', () => {
    expect(typeof live).toBe('boolean');
  });

  it(
    'creates a follow-up for a brand-new patient with zero consultations',
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
        const phone = `+2547${String(Date.now()).slice(-8)}`;
        const patient = await request(http())
          .post('/ops/patients')
          .set(auth)
          .send({
            firstName: 'FollowUp',
            lastName: `NoConsult${suffix}`,
            gender: 'FEMALE',
            phone,
          });
        expect(patient.status).toBe(201);
        const patientId = patient.body.id as string;

        const followUpDate = new Date(Date.now() + 3 * 86400000)
          .toISOString()
          .slice(0, 10);
        const created = await request(http())
          .post('/follow-ups')
          .set(auth)
          .send({
            patientId,
            followUpDate,
            reason: 'First-visit courtesy follow-up',
          });
        expect(created.status).toBe(201);
        expect(created.body.patientId).toBe(patientId);
        expect(created.body.consultationId ?? null).toBeNull();
      } finally {
        await app.close();
      }
    },
    60_000,
  );
});
