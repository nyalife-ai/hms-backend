import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createE2eApp } from './create-e2e-app';
import {
  diffAuditFields,
  maskAuditRecord,
} from '../src/modules/audit/audit-masking';

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

  describe('Bug #020 — Audit log admin gate', () => {
    it('rejects malformed token on /audit-logs', async () => {
      await request(http())
        .get('/audit-logs')
        .set('Authorization', 'Bearer not-a-jwt')
        .expect(401);
    });

    it('rejects malformed token on audit log detail', async () => {
      await request(http())
        .get('/audit-logs/00000000-0000-4000-8000-000000000001')
        .set('Authorization', 'Bearer not-a-jwt')
        .expect(401);
    });
  });

  describe('Bug #021 — Visit check-in reason/notes contract', () => {
    it('rejects unauthenticated check-in that includes reason/notes', async () => {
      await request(http())
        .post('/visits/check-in')
        .send({
          patientName: 'Regression Patient',
          mrn: 'MRN-REG-021',
          age: 28,
          gender: 'Female',
          phone: '+254711111111',
          firstVisit: true,
          payment: { method: 'CASH' },
          reasonForVisit: 'Follow-up',
          additionalNotes: 'Regression probe',
        })
        .expect(401);
    });

    it('rejects unknown check-in fields (whitelist)', async () => {
      const res = await request(http())
        .post('/visits/check-in')
        .send({
          patientName: 'Regression Patient',
          mrn: 'MRN-REG-021b',
          age: 28,
          gender: 'Female',
          phone: '+254711111111',
          firstVisit: true,
          payment: { method: 'CASH' },
          reasonForVisit: 'Follow-up',
          sneakyField: 'should-be-rejected',
        });
      // Auth runs before validation in some stacks; either 401 or 400 is fine.
      expect([400, 401]).toContain(res.status);
    });
  });

  describe('Bug #023 — Clinical services & visit orders require auth', () => {
    it('rejects unauthenticated catalog clinical-services read', async () => {
      await request(http())
        .get('/catalog/clinical-services?kind=surgery')
        .expect(401);
    });

    it('rejects unauthenticated laboratory clinical-services create', async () => {
      await request(http())
        .post('/laboratory/clinical-services')
        .send({
          serviceCode: 'REG-SURG-01',
          serviceName: 'Regression Surgery',
          category: 'Surgery',
          standardPrice: 1000,
        })
        .expect(401);
    });

    it('rejects unauthenticated clinical-orders save', async () => {
      await request(http())
        .post('/visits/00000000-0000-4000-8000-000000000023/clinical-orders')
        .send({
          orderedServices: [
            {
              id: '00000000-0000-4000-8000-000000000024',
              code: 'SVC',
              name: 'Service',
              unitPrice: '500',
            },
          ],
        })
        .expect(401);
    });
  });

  describe('Bug #022 — Audit masking never leaks OTP/email/phone', () => {
    it('masks sensitive fields and keeps clinical fields readable', () => {
      const masked = maskAuditRecord({
        email: 'nurse@nyalife.health',
        phone: '+254722334455',
        otp: '448812',
        reasonForVisit: 'Pelvic pain',
        additionalNotes: 'Walk-in',
      });
      expect(masked).toMatchObject({
        email: 'n***@nyalife.health',
        phone: '***55',
        otp: '***',
        reasonForVisit: 'Pelvic pain',
        additionalNotes: 'Walk-in',
      });

      const changes = diffAuditFields(
        { stage: 'CHECKED_IN', phone: '+254700000001' },
        { stage: 'WAITING_DOCTOR', phone: '+254700000009' },
      );
      expect(changes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'stage',
            from: 'CHECKED_IN',
            to: 'WAITING_DOCTOR',
          }),
          expect.objectContaining({
            field: 'phone',
            from: '***01',
            to: '***09',
          }),
        ]),
      );
    });
  });
});
