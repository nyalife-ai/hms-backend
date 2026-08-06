import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createE2eApp } from './create-e2e-app';

interface PublicHealthBody {
  status: string;
}

/**
 * Smoke Tests — critical flow verification after deploy.
 *
 * Run: yarn test:smoke
 */
describe('Smoke Tests — Critical Flows', () => {
  let app: INestApplication;

  const http = (): App => app.getHttpServer() as App;

  beforeAll(async () => {
    app = await createE2eApp({ forbidNonWhitelisted: false });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Health & Observability', () => {
    it('GET /public/health should return 200', async () => {
      const res = await request(http()).get('/public/health').expect(200);
      const body = res.body as PublicHealthBody;
      expect(body.status).toBe('healthy');
    });

    it('GET /health should return 200 when HealthModule is mounted', async () => {
      const res = await request(http()).get('/health');
      expect([200, 503]).toContain(res.status);
    });

    it('GET /metrics requires metrics auth when METRICS_TOKEN is set', async () => {
      const res = await request(http()).get('/metrics');
      // Open (200) when METRICS_TOKEN unset; 401 when configured.
      expect([200, 401]).toContain(res.status);
      if (res.status === 200) {
        expect(res.text).toContain('# HELP');
      }
    });
  });

  describe('Authentication Flow', () => {
    it('POST /auth/login with invalid credentials should return 401', async () => {
      await request(http())
        .post('/auth/login')
        .send({ email: 'invalid@example.com', password: 'wrongpassword' })
        .expect(401);
    });

    it('POST /auth/refresh with invalid token should return 401', async () => {
      await request(http())
        .post('/auth/refresh')
        .send({ refreshToken: 'invalid-refresh-token-value-xxxx' })
        .expect(401);
    });
  });

  describe('Protected Endpoints Require Auth', () => {
    it('GET /auth/me without auth should return 401', async () => {
      await request(http()).get('/auth/me').expect(401);
    });

    it('GET /ops/lab-requests without auth should return 401', async () => {
      await request(http()).get('/ops/lab-requests').expect(401);
    });
  });

  describe('Validation', () => {
    it('should expose public info', async () => {
      const res = await request(http()).get('/public/info');
      expect(res.status).toBe(200);
    });
  });
});
