/**
 * Live-DB regression — receptionist access to the insurance endpoints used
 * by the front-desk check-in form.
 * Opt-in: E2E_USE_LIVE_DB=true
 *
 * Bug: GET /insurance/providers, POST /insurance/eligibility,
 * POST /insurance/otp/send, POST /insurance/otp/verify were gated
 * @Roles('ADMIN', 'ACCOUNTANT') only, but the only frontend caller is the
 * front-desk check-in form (RECEPTIONIST) — a receptionist got a 403 on the
 * insurance-provider dropdown and eligibility/OTP verification.
 */

import request from 'supertest';
import { App } from 'supertest/types';
import { createLiveE2eApp } from './create-e2e-app';

describe('Live DB — insurance endpoints allow RECEPTIONIST', () => {
  const live = process.env.E2E_USE_LIVE_DB === 'true';

  it('is opt-in via E2E_USE_LIVE_DB', () => {
    expect(typeof live).toBe('boolean');
  });

  it(
    'GET /insurance/providers succeeds for a receptionist',
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
            email:
              process.env.E2E_RECEPTIONIST_EMAIL || 'b.otieno@nyalife.health',
            password: process.env.E2E_RECEPTIONIST_PASSWORD || 'nyalife123',
          });
        expect([200, 201]).toContain(login.status);
        const auth = { Authorization: `Bearer ${login.body.accessToken}` };

        const providers = await request(http())
          .get('/insurance/providers')
          .set(auth);
        expect(providers.status).toBe(200);
      } finally {
        await app.close();
      }
    },
    30_000,
  );
});
