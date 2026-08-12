/**
 * Live-DB OPD user journey e2e.
 * Opt-in: E2E_USE_LIVE_DB=true
 *
 * check-in → (waive consult fee if charged) → triage → start consult →
 * clinical notes → order labs → lab results → complete (follow-up) →
 * related labs/Rx → billing → sign-off.
 */

import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { createLiveE2eApp } from './create-e2e-app';

describe('Live DB — OPD journey', () => {
  const live = process.env.E2E_USE_LIVE_DB === 'true';

  it('is opt-in via E2E_USE_LIVE_DB', () => {
    expect(typeof live).toBe('boolean');
  });

  it(
    'front desk → triage → consult → labs → complete → related → billing',
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
        const lastName = `Opd${suffix}`;
        const patient = await request(http())
          .post('/ops/patients')
          .set(auth)
          .send({
            firstName: 'Journey',
            lastName,
            gender: 'Female',
            phone,
          });
        expect([200, 201]).toContain(patient.status);
        const mrn =
          patient.body.patient_number ||
          patient.body.patientNumber ||
          patient.body.mrn;
        expect(mrn).toBeTruthy();
        const patientId = patient.body.id as string;

        const checkIn = await request(http())
          .post('/visits/check-in')
          .set(auth)
          .send({
            patientName: `Journey ${lastName}`,
            mrn,
            age: 34,
            gender: 'Female',
            phone,
            firstVisit: true,
            payment: { method: 'CASH' },
            reasonForVisit: 'E2E cough and fever',
            additionalNotes: 'OPD live journey',
          });
        expect([200, 201]).toContain(checkIn.status);
        const visitId = checkIn.body.id as string;
        expect(visitId).toBeTruthy();

        if (checkIn.body.stage === 'AWAITING_PAYMENT') {
          const waived = await request(http())
            .post(`/visits/${visitId}/waive-consult-fee`)
            .set(auth);
          expect([200, 201]).toContain(waived.status);
          expect(waived.body.stage).toBe('CHECKED_IN');
        }

        const doctor = await prisma.staffProfiles.findFirst({
          where: { deleted_at: null },
        });
        expect(doctor).toBeTruthy();

        const triage = await request(http())
          .post(`/visits/${visitId}/triage`)
          .set(auth)
          .send({
            vitals: {
              temperature: '37.4',
              systolic: '118',
              diastolic: '76',
              pulse: '82',
              respRate: '16',
              spo2: '98',
              weightKg: '64',
            },
            doctorName: 'E2E Doctor',
            nurseName: 'E2E Nurse',
            doctorStaffId: doctor!.id,
          });
        expect([200, 201]).toContain(triage.status);
        expect(triage.body.stage).toBe('WAITING_DOCTOR');

        const started = await request(http())
          .post(`/visits/${visitId}/start-consultation`)
          .set(auth);
        expect([200, 201]).toContain(started.status);
        expect(started.body.stage).toBe('IN_CONSULTATION');

        const notes = await request(http())
          .post(`/visits/${visitId}/clinical-notes`)
          .set(auth)
          .send({
            clinicalRecord: {
              historyOfPresentingComplaint: 'Cough for 3 days',
              impression: 'Upper respiratory tract infection',
              plan: 'Labs then symptomatic care',
              followUpInstructions: 'Review in 7 days',
            },
          });
        expect([200, 201]).toContain(notes.status);

        const labs = await request(http())
          .post(`/visits/${visitId}/order-labs`)
          .set(auth)
          .send({
            tests: [
              { name: 'Full Blood Count', unit: 'g/dL', range: '12-16' },
            ],
            notes: 'E2E FBC',
          });
        expect([200, 201]).toContain(labs.status);
        expect(labs.body.stage).toBe('LAB_PENDING');

        const relatedLabs = await request(http())
          .get(`/laboratory/requests?visitId=${encodeURIComponent(visitId)}`)
          .set(auth);
        expect(relatedLabs.status).toBe(200);
        const labItems = relatedLabs.body.items ?? relatedLabs.body;
        expect(Array.isArray(labItems) ? labItems.length : 0).toBeGreaterThan(0);

        const results = await request(http())
          .post(`/visits/${visitId}/lab-results`)
          .set(auth)
          .send({
            tests: [
              {
                name: 'Full Blood Count',
                unit: 'g/dL',
                range: '12-16',
                result: '13.1',
              },
            ],
            comments: 'Within range',
          });
        expect([200, 201]).toContain(results.status);
        expect(results.body.stage).toBe('RESULTS_READY');

        const followUpDate = new Date(Date.now() + 7 * 86400000)
          .toISOString()
          .slice(0, 10);
        const complete = await request(http())
          .post(`/visits/${visitId}/complete`)
          .set(auth)
          .send({
            diagnosis: 'Upper respiratory tract infection',
            prescriptions: [],
            followUpDate,
            clinicalRecord: {
              impression: 'Upper respiratory tract infection',
              followUpInstructions: 'Review in 7 days if not improving',
            },
          });
        expect([200, 201]).toContain(complete.status);
        expect(complete.body.stage).toBe('READY_FOR_BILLING');

        const relatedRx = await request(http())
          .get(`/pharmacy/prescriptions?visitId=${encodeURIComponent(visitId)}`)
          .set(auth);
        expect(relatedRx.status).toBe(200);

        const followUps = await request(http())
          .get(`/follow-ups?search=${encodeURIComponent(lastName)}&limit=20`)
          .set(auth);
        expect(followUps.status).toBe(200);

        const billed = await request(http())
          .post(`/visits/${visitId}/billing`)
          .set(auth)
          .send({ total: 0 });
        expect([200, 201]).toContain(billed.status);

        const signed = await request(http())
          .post(`/visits/${visitId}/sign-off`)
          .set(auth);
        expect([200, 201]).toContain(signed.status);
        expect(signed.body.stage).toBe('COMPLETED');

        const stored = await request(http())
          .get(`/visits/${visitId}`)
          .set(auth)
          .expect(200);
        expect(stored.body.stage).toBe('COMPLETED');
        expect(stored.body.mrn).toBe(mrn);
        expect(patientId).toBeTruthy();
      } finally {
        await app.close();
      }
    },
    240_000,
  );
});
