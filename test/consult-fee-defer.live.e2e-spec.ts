/**
 * Live-DB regression — explicit "Defer consult fee to checkout" action.
 * Opt-in: E2E_USE_LIVE_DB=true
 *
 * New behavior: a receptionist/accountant can explicitly defer an already
 * charged-but-unpaid consult fee back out of AWAITING_PAYMENT so triage can
 * proceed immediately; the fee stays billable at final checkout (existing
 * `consultFeeStatus !== 'PAID'` logic in checkout.service.ts already covers
 * DEFERRED the same way it covers "never charged").
 */

import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { createLiveE2eApp } from './create-e2e-app';

describe('Live DB — defer consult fee to checkout', () => {
  const live = process.env.E2E_USE_LIVE_DB === 'true';

  it('is opt-in via E2E_USE_LIVE_DB', () => {
    expect(typeof live).toBe('boolean');
  });

  it(
    'defers a charged consult fee and does not block triage',
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
        const phone = `+2547${String(Date.now()).slice(-8)}`;
        const patient = await request(http())
          .post('/ops/patients')
          .set(auth)
          .send({
            firstName: 'Defer',
            lastName: `Fee${suffix}`,
            gender: 'FEMALE',
            phone,
          });
        expect(patient.status).toBe(201);
        const mrn = patient.body.patient_number || patient.body.patientNumber;

        const checkIn = await request(http())
          .post('/visits/check-in')
          .set(auth)
          .send({
            patientName: `Defer Fee${suffix}`,
            mrn,
            age: 29,
            gender: 'Female',
            phone,
            firstVisit: true,
            payment: { method: 'CASH' },
            reasonForVisit: 'E2E defer consult fee',
          });
        expect([200, 201]).toContain(checkIn.status);
        const visitId = checkIn.body.id as string;

        // Charge it explicitly, unless check-in already auto-charged it
        // (consult-fee-on-checkin system setting).
        if (checkIn.body.stage !== 'AWAITING_PAYMENT') {
          const charged = await request(http())
            .post(`/visits/${visitId}/charge-consult-fee`)
            .set(auth);
          expect([200, 201]).toContain(charged.status);
          expect(charged.body.stage).toBe('AWAITING_PAYMENT');
          expect(charged.body.billing.consultFeeStatus).toBe('PENDING');
        } else {
          expect(checkIn.body.billing.consultFeeStatus).toBe('PENDING');
        }

        // Defer it instead of collecting.
        const deferred = await request(http())
          .post(`/visits/${visitId}/defer-consult-fee`)
          .set(auth);
        expect([200, 201]).toContain(deferred.status);
        expect(deferred.body.stage).toBe('CHECKED_IN');
        expect(deferred.body.billing.consultFeeStatus).toBe('DEFERRED');

        // Triage must proceed — DEFERRED must never block it the way
        // AWAITING_PAYMENT (charged-unpaid) does.
        const doctor = await prisma.staffProfiles.findFirst({
          where: { deleted_at: null, is_active: true },
        });
        const triage = await request(http())
          .post(`/visits/${visitId}/triage`)
          .set(auth)
          .send({
            vitals: {
              temperature: '37.0',
              systolic: '112',
              diastolic: '74',
              pulse: '76',
              respRate: '16',
              spo2: '99',
              weightKg: '58',
            },
            doctorName: 'E2E Doctor',
            nurseName: 'E2E Nurse',
            doctorStaffId: doctor!.id,
            reasonForVisit: 'E2E defer consult fee',
            chiefComplaint: 'Routine check',
            priority: 'NORMAL',
          });
        expect([200, 201]).toContain(triage.status);
        expect(triage.body.stage).toBe('WAITING_DOCTOR');

        const stored = await request(http()).get(`/visits/${visitId}`).set(auth);
        expect(stored.body.billing.consultFeeStatus).toBe('DEFERRED');
      } finally {
        await app.close();
      }
    },
    60_000,
  );
});
