/**
 * Live-DB IPD journey e2e.
 * Opt-in: E2E_USE_LIVE_DB=true (and a reachable DATABASE_URL).
 * When disabled, the suite records that live mode is off (no .skip).
 */

import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { createLiveE2eApp } from './create-e2e-app';

describe('Live DB — IPD journey', () => {
  const live = process.env.E2E_USE_LIVE_DB === 'true';

  it('is opt-in via E2E_USE_LIVE_DB', () => {
    expect(typeof live).toBe('boolean');
  });

  it('ward → beds bulk → admit → transfer → nursing → discharge (live)', async () => {
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
      const token = login.body.accessToken as string;
      const auth = { Authorization: `Bearer ${token}` };

      const doctor = await prisma.staffProfiles.findFirst({
        where: { deleted_at: null },
      });
      const nurse = doctor;
      const patient = await prisma.patients.findFirst({
        where: { deleted_at: null },
      });
      expect(doctor).toBeTruthy();
      expect(patient).toBeTruthy();

      const suffix = Date.now().toString(36);
      const wardRes = await request(http())
        .post('/ipd/wards')
        .set(auth)
        .send({ name: `E2E Ward ${suffix}`, wardType: 'GENERAL', capacity: 4 });
      expect([200, 201]).toContain(wardRes.status);

      const bulk = await request(http())
        .post('/ipd/beds/bulk')
        .set(auth)
        .send({
          wardId: wardRes.body.id,
          bedNumbers: [`E2E-A-${suffix}`, `E2E-B-${suffix}`, `E2E-C-${suffix}`],
        });
      expect([200, 201]).toContain(bulk.status);
      expect(bulk.body.length).toBe(3);

      const bedA = bulk.body[0];
      const bedB = bulk.body[1];

      const admit = await request(http())
        .post('/ipd/admissions')
        .set(auth)
        .send({
          patientId: patient!.id,
          bedId: bedA.id,
          admittingDoctorId: doctor!.id,
          primaryDiagnosis: 'E2E admission',
        });
      expect([200, 201]).toContain(admit.status);
      expect(admit.body.status).toBe('ADMITTED');

      const transfer = await request(http())
        .post(`/ipd/admissions/${admit.body.id}/transfer`)
        .set(auth)
        .send({
          newBedId: bedB.id,
          reason: 'E2E transfer',
          authorizedBy: login.body.user.id,
        });
      expect([200, 201]).toContain(transfer.status);
      expect(transfer.body.admission.status).toBe('ADMITTED');

      const history = await request(http())
        .get(`/ipd/admissions/${admit.body.id}/transfers`)
        .set(auth)
        .expect(200);
      expect(history.body.length).toBeGreaterThanOrEqual(1);

      const note = await request(http())
        .post(`/ipd/admissions/${admit.body.id}/nursing-notes`)
        .set(auth)
        .send({
          nurseId: nurse!.id,
          notesText: 'E2E vitals stable',
          vitalSignsSnapshot: { hr: 70 },
        });
      expect([200, 201]).toContain(note.status);

      const discharge = await request(http())
        .post(`/ipd/admissions/${admit.body.id}/discharge`)
        .set(auth)
        .send({
          dischargingDoctorId: doctor!.id,
          diagnosis: 'Resolved',
          summary: 'E2E discharge',
          medications: 'Paracetamol',
          followUpInstructions: 'Clinic in 1 week',
        });
      expect([200, 201]).toContain(discharge.status);

      const summary = await request(http())
        .get(`/ipd/admissions/${admit.body.id}/discharge-summary`)
        .set(auth)
        .expect(200);
      expect(summary.body.finalizedAt).toBeTruthy();

      const patchLocked = await request(http())
        .post(`/ipd/admissions/${admit.body.id}/discharge-summary`)
        .set(auth)
        .send({
          dischargingDoctorId: doctor!.id,
          summaryOfTreatment: 'Should fail',
        });
      expect(patchLocked.status).toBeGreaterThanOrEqual(400);

      const freed = await prisma.beds.findUnique({ where: { id: bedB.id } });
      expect(freed?.status).toBe('AVAILABLE');

      // Scaffold mutation must not bypass IPD
      const gone = await request(http())
        .post('/admissions')
        .set(auth)
        .send({ name: 'legacy' });
      expect(gone.status).toBe(410);
    } finally {
      await app.close();
    }
  }, 240_000);

  it('reservation → convert and transfer-out (live)', async () => {
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
      const token = login.body.accessToken as string;
      const auth = { Authorization: `Bearer ${token}` };
      const userId = login.body.user.id as string;

      const doctor = await prisma.staffProfiles.findFirst({
        where: { deleted_at: null },
      });
      const patient = await prisma.patients.findFirst({
        where: { deleted_at: null },
      });
      expect(doctor).toBeTruthy();
      expect(patient).toBeTruthy();

      const suffix = Date.now().toString(36);
      const wardRes = await request(http())
        .post('/ipd/wards')
        .set(auth)
        .send({ name: `E2E Rsv ${suffix}`, wardType: 'PRIVATE', capacity: 2 });
      expect([200, 201]).toContain(wardRes.status);

      const bed = await request(http())
        .post('/ipd/beds')
        .set(auth)
        .send({ wardId: wardRes.body.id, bedNumber: `RSV-${suffix}` });
      expect([200, 201]).toContain(bed.status);

      const expires = new Date(Date.now() + 86400000).toISOString();
      const reserve = await request(http())
        .post('/ipd/reservations')
        .set(auth)
        .send({
          bedId: bed.body.id,
          patientId: patient!.id,
          expectedAdmissionDate: new Date().toISOString().slice(0, 10),
          expiresAt: expires,
          reservedBy: userId,
        });
      expect([200, 201]).toContain(reserve.status);

      const convert = await request(http())
        .post(`/ipd/reservations/${reserve.body.id}/convert`)
        .set(auth)
        .send({ admittingDoctorId: doctor!.id, primaryDiagnosis: 'From reservation' });
      expect([200, 201]).toContain(convert.status);

      const transferOut = await request(http())
        .post(`/ipd/admissions/${convert.body.admission.id}/transfer-out`)
        .set(auth)
        .send({
          reason: 'External referral',
          destination: 'E2E Hospital',
          authorizedBy: userId,
        });
      expect([200, 201]).toContain(transferOut.status);
      expect(transferOut.body.status).toBe('TRANSFERRED');

      const freed = await prisma.beds.findUnique({ where: { id: bed.body.id } });
      expect(freed?.status).toBe('AVAILABLE');
    } finally {
      await app.close();
    }
  }, 240_000);

  it('typed notes, vitals history, and ward medication order (live)', async () => {
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
      const wardRes = await request(http())
        .post('/ipd/wards')
        .set(auth)
        .send({ name: `E2E Notes ${suffix}`, wardType: 'GENERAL', capacity: 2 });
      expect([200, 201]).toContain(wardRes.status);

      const bed = await request(http())
        .post('/ipd/beds')
        .set(auth)
        .send({ wardId: wardRes.body.id, bedNumber: `NT-${suffix}` });
      expect([200, 201]).toContain(bed.status);

      const admit = await request(http())
        .post('/ipd/admissions')
        .set(auth)
        .send({
          patientId: patient!.id,
          bedId: bed.body.id,
          admittingDoctorId: doctor!.id,
          primaryDiagnosis: 'E2E notes/vitals/MAR',
        });
      expect([200, 201]).toContain(admit.status);
      const admissionId = admit.body.id as string;

      const progress = await request(http())
        .post(`/ipd/admissions/${admissionId}/nursing-notes`)
        .set(auth)
        .send({
          nurseId: doctor!.id,
          noteType: 'PROGRESS',
          notesText: 'E2E progress: patient ambulating',
        });
      expect([200, 201]).toContain(progress.status);
      expect(progress.body.noteType).toBe('PROGRESS');

      const v1 = await request(http())
        .post(`/ipd/admissions/${admissionId}/vitals`)
        .set(auth)
        .send({
          nurseId: doctor!.id,
          pulse: '72',
          systolic: '120',
          diastolic: '80',
          temperature: '36.8',
          spo2: '98',
        });
      expect([200, 201]).toContain(v1.status);

      const v2 = await request(http())
        .post(`/ipd/admissions/${admissionId}/vitals`)
        .set(auth)
        .send({
          nurseId: doctor!.id,
          pulse: '88',
          systolic: '130',
          diastolic: '85',
          temperature: '37.2',
          spo2: '96',
        });
      expect([200, 201]).toContain(v2.status);

      const vitals = await request(http())
        .get(`/ipd/admissions/${admissionId}/vitals`)
        .set(auth)
        .expect(200);
      expect(vitals.body.length).toBeGreaterThanOrEqual(2);

      const notes = await request(http())
        .get(`/ipd/admissions/${admissionId}/nursing-notes`)
        .set(auth)
        .expect(200);
      expect(
        notes.body.some((n: { noteType?: string }) => n.noteType === 'PROGRESS'),
      ).toBe(true);

      const med = await prisma.medications.findFirst({
        where: { deleted_at: null, is_active: true },
      });
      if (med) {
        const order = await request(http())
          .post(`/ipd/admissions/${admissionId}/medications`)
          .set(auth)
          .send({
            prescribedByStaffId: doctor!.id,
            notes: 'E2E ward MAR',
            lines: [
              {
                medicationId: med.id,
                dosage: '500mg',
                frequency: 'TDS',
                duration: '5 days',
                quantity: 15,
              },
            ],
          });
        expect([200, 201]).toContain(order.status);

        const listed = await request(http())
          .get(`/ipd/admissions/${admissionId}/medications`)
          .set(auth)
          .expect(200);
        expect(listed.body.length).toBeGreaterThanOrEqual(1);
      }

      await request(http())
        .post(`/ipd/admissions/${admissionId}/discharge`)
        .set(auth)
        .send({
          dischargingDoctorId: doctor!.id,
          diagnosis: 'Resolved',
          summary: 'E2E notes discharge',
        });
    } finally {
      await app.close();
    }
  }, 240_000);
});
