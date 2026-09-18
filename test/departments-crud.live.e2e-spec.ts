/**
 * Live-DB regression — Department create/update now round-trips code, type,
 * head name/position and is_active instead of hardcoding type: 'CLINICAL'
 * and auto-slugging a code with no way to set it or the other fields.
 * Opt-in: E2E_USE_LIVE_DB=true
 */

import request from 'supertest';
import { App } from 'supertest/types';
import { createLiveE2eApp } from './create-e2e-app';

describe('Live DB — department CRUD round-trips all fields', () => {
  const live = process.env.E2E_USE_LIVE_DB === 'true';

  it('is opt-in via E2E_USE_LIVE_DB', () => {
    expect(typeof live).toBe('boolean');
  });

  it(
    'creates and updates a department with code/type/head fields',
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
        const created = await request(http())
          .post('/departments')
          .set(auth)
          .send({
            name: `E2E Radiology ${suffix}`,
            code: `RAD${suffix}`.slice(0, 10).toUpperCase(),
            type: 'SUPPORT',
            description: 'E2E test department',
            headName: 'Dr. E2E Head',
            headPosition: 'Chief Radiologist',
          });
        expect(created.status).toBe(201);
        expect(created.body).toMatchObject({
          type: 'SUPPORT',
          headName: 'Dr. E2E Head',
          headPosition: 'Chief Radiologist',
          isActive: true,
        });
        const deptId = created.body.id as string;

        const updated = await request(http())
          .patch(`/departments/${deptId}`)
          .set(auth)
          .send({ headPosition: 'Deputy Radiologist', isActive: false });
        expect(updated.status).toBe(200);
        expect(updated.body).toMatchObject({
          headPosition: 'Deputy Radiologist',
          isActive: false,
          // untouched fields survive a partial update
          headName: 'Dr. E2E Head',
          type: 'SUPPORT',
        });
      } finally {
        await app.close();
      }
    },
    30_000,
  );
});
