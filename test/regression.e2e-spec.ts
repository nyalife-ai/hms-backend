import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createE2eApp } from './create-e2e-app';

interface PublicHealthBody {
  status: string;
}

/**
 * Regression Tests — previously fixed bugs.
 *
 * Run: yarn test:regression
 */
describe('Regression Tests', () => {
  let app: INestApplication;

  const http = (): App => app.getHttpServer() as App;

  beforeAll(async () => {
    app = await createE2eApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Bug #003 — JWT Token Validation', () => {
    it('rejects malformed Bearer tokens on protected routes', async () => {
      await request(http())
        .get('/auth/me')
        .set('Authorization', 'Bearer not-a-jwt')
        .expect(401);
    });
  });

  describe('Bug #010 — Health Check Endpoints', () => {
    it('keeps /public/health available without authentication', async () => {
      const res = await request(http()).get('/public/health').expect(200);
      const body = res.body as PublicHealthBody;
      expect(body.status).toBe('healthy');
    });
  });

  describe('Bug #011 — Request ID Correlation', () => {
    it('preserves client-supplied x-request-id', async () => {
      const res = await request(http())
        .get('/public/health')
        .set('x-request-id', 'regression-req-id')
        .expect(200);

      expect(res.headers['x-request-id']).toBe('regression-req-id');
    });
  });
});
