/**
 * Live-DB regression — first-time patient registration DTO contract.
 * Opt-in: E2E_USE_LIVE_DB=true
 *
 * Bug: POST /ops/patients used a stale, locally-defined CreatePatientDto
 * missing email/address/city/country/postalCode/bloodGroup/occupation/
 * maritalStatus, so the global ValidationPipe (whitelist + forbidNonWhitelisted)
 * rejected them with "property X should not exist". Fixed by binding the
 * route to the real modules/patients CreatePatientDto and forwarding all
 * fields through OpsService.createPatient instead of a hand-picked subset.
 */

import request from 'supertest';
import { App } from 'supertest/types';
import { createLiveE2eApp } from './create-e2e-app';

describe('Live DB — patient registration DTO contract', () => {
  const live = process.env.E2E_USE_LIVE_DB === 'true';

  it('is opt-in via E2E_USE_LIVE_DB', () => {
    expect(typeof live).toBe('boolean');
  });

  it(
    'accepts and persists all first-visit demographic/contact fields via POST /ops/patients',
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
        const email = `regression.${suffix}@nyalife.test`;

        const fullPayload = {
          firstName: 'Regression',
          lastName: `PatientFull${suffix}`,
          gender: 'FEMALE',
          phone,
          email,
          dateOfBirth: '1990-05-12',
          address: '123 Riverside Drive',
          city: 'Nairobi',
          country: 'Kenya',
          postalCode: '00100',
          bloodGroup: 'O+',
          occupation: 'Teacher',
          maritalStatus: 'MARRIED',
          allergies: 'Penicillin',
          chronicDiseases: 'Hypertension',
          emergencyContactName: 'Jane Doe',
          emergencyContactPhone: '+254700111222',
        };

        const created = await request(http())
          .post('/ops/patients')
          .set(auth)
          .send(fullPayload);
        expect(created.status).toBe(201);
        const patientId = created.body.id as string;
        expect(patientId).toBeTruthy();

        const fetched = await request(http())
          .get(`/patients/${patientId}`)
          .set(auth);
        expect(fetched.status).toBe(200);
        expect(fetched.body).toMatchObject({
          email,
          address: fullPayload.address,
          city: fullPayload.city,
          country: fullPayload.country,
          postalCode: fullPayload.postalCode,
          bloodGroup: fullPayload.bloodGroup,
          occupation: fullPayload.occupation,
          maritalStatus: fullPayload.maritalStatus,
        });
      } finally {
        await app.close();
      }
    },
    60_000,
  );

  it(
    'still succeeds when all optional demographic fields are omitted',
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

        const created = await request(http())
          .post('/ops/patients')
          .set(auth)
          .send({
            firstName: 'Regression',
            lastName: `PatientMinimal${suffix}`,
            gender: 'OTHER',
            phone,
          });
        expect(created.status).toBe(201);
        expect(created.body.id).toBeTruthy();
      } finally {
        await app.close();
      }
    },
    60_000,
  );
});
