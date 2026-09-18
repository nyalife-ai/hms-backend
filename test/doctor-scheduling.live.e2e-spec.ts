/**
 * Live-DB regression — doctor reassignment at triage, and appointment
 * double-booking prevention.
 * Opt-in: E2E_USE_LIVE_DB=true
 *
 * Bugs fixed:
 * - No way to correct a wrong doctor assignment from triage
 *   (PATCH /visits/:id/reassign-doctor).
 * - Two appointments could be booked for the same doctor over an
 *   overlapping time window (no server-side conflict check).
 */

import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { createLiveE2eApp } from './create-e2e-app';

describe('Live DB — doctor reassignment and appointment double-booking', () => {
  const live = process.env.E2E_USE_LIVE_DB === 'true';

  it('is opt-in via E2E_USE_LIVE_DB', () => {
    expect(typeof live).toBe('boolean');
  });

  it(
    'reassigns the triage doctor and rejects an overlapping appointment for the same doctor',
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

        const doctors = await prisma.staffProfiles.findMany({
          where: { deleted_at: null, is_active: true, position: 'Physician' },
          take: 2,
        });
        expect(doctors.length).toBeGreaterThanOrEqual(2);
        const [doctorA, doctorB] = doctors;

        // --- Reassignment ---
        const suffix = Date.now().toString(36);
        const phone = `+2547${String(Date.now()).slice(-8)}`;
        const patient = await request(http())
          .post('/ops/patients')
          .set(auth)
          .send({
            firstName: 'Reassign',
            lastName: `Test${suffix}`,
            gender: 'FEMALE',
            phone,
          });
        expect(patient.status).toBe(201);
        const mrn = patient.body.patient_number || patient.body.patientNumber;

        const checkIn = await request(http())
          .post('/visits/check-in')
          .set(auth)
          .send({
            patientName: `Reassign Test${suffix}`,
            mrn,
            age: 30,
            gender: 'Female',
            phone,
            firstVisit: true,
            payment: { method: 'CASH' },
            reasonForVisit: 'E2E reassignment check',
          });
        expect([200, 201]).toContain(checkIn.status);
        const visitId = checkIn.body.id as string;

        if (checkIn.body.stage === 'AWAITING_PAYMENT') {
          await request(http())
            .post(`/visits/${visitId}/waive-consult-fee`)
            .set(auth)
            .expect((res) => expect([200, 201]).toContain(res.status));
        }

        const triage = await request(http())
          .post(`/visits/${visitId}/triage`)
          .set(auth)
          .send({
            vitals: {
              temperature: '37.0',
              systolic: '110',
              diastolic: '70',
              pulse: '78',
              respRate: '16',
              spo2: '99',
              weightKg: '60',
            },
            doctorName: 'Wrong Doctor',
            nurseName: 'E2E Nurse',
            doctorStaffId: doctorA!.id,
            reasonForVisit: 'E2E reassignment check',
            chiefComplaint: 'Headache',
            priority: 'NORMAL',
          });
        expect([200, 201]).toContain(triage.status);
        expect(triage.body.doctorStaffId).toBe(doctorA!.id);

        const wrongReassign = await request(http())
          .patch(`/visits/${visitId}/reassign-doctor`)
          .set(auth)
          .send({ doctorStaffId: 'not-a-real-staff-id', reason: 'test' });
        expect(wrongReassign.status).toBe(400);

        const reassign = await request(http())
          .patch(`/visits/${visitId}/reassign-doctor`)
          .set(auth)
          .send({ doctorStaffId: doctorB!.id, reason: 'Wrong doctor picked at triage' });
        expect([200, 201]).toContain(reassign.status);
        expect(reassign.body.doctorStaffId).toBe(doctorB!.id);
        expect(reassign.body.stage).toBe('WAITING_DOCTOR');

        const stored = await request(http())
          .get(`/visits/${visitId}`)
          .set(auth);
        expect(stored.body.doctorStaffId).toBe(doctorB!.id);

        // --- Appointment double-booking ---
        const apptPatient = await request(http())
          .post('/ops/patients')
          .set(auth)
          .send({
            firstName: 'Booking',
            lastName: `Test${suffix}`,
            gender: 'FEMALE',
            phone: `+2547${String(Date.now() + 1).slice(-8)}`,
          });
        expect(apptPatient.status).toBe(201);
        const apptPatientId = apptPatient.body.id as string;

        // Randomize the date/slot per run so repeated invocations against a
        // shared, persistent test DB never collide with a previous run's
        // leftover appointments (which the double-booking fix would now
        // correctly, but spuriously for this test, reject as a conflict).
        const daysOut = 30 + (Date.now() % 300);
        const futureDate = new Date(Date.now() + daysOut * 86400000)
          .toISOString()
          .slice(0, 10);
        const baseHour = 6 + (Date.now() % 10);
        const baseMinute = (Date.now() % 4) * 15;
        const pad = (n: number) => String(n).padStart(2, '0');
        const baseTime = `${pad(baseHour)}:${pad(baseMinute)}`;
        const overlapTime = `${pad(baseHour)}:${pad(Math.min(baseMinute + 15, 59))}`;
        const laterTime = `${pad(baseHour + 1)}:${pad(baseMinute)}`;

        const firstAppt = await request(http())
          .post('/ops/appointments')
          .set(auth)
          .send({
            patientId: apptPatientId,
            doctorId: doctorA!.id,
            date: futureDate,
            time: baseTime,
            type: 'CONSULTATION',
            reason: 'E2E slot A',
          });
        expect([200, 201]).toContain(firstAppt.status);

        const overlapping = await request(http())
          .post('/ops/appointments')
          .set(auth)
          .send({
            patientId: apptPatientId,
            doctorId: doctorA!.id,
            date: futureDate,
            time: overlapTime,
            type: 'CONSULTATION',
            reason: 'E2E overlapping slot',
          });
        expect(overlapping.status).toBe(409);

        const nonOverlapping = await request(http())
          .post('/ops/appointments')
          .set(auth)
          .send({
            patientId: apptPatientId,
            doctorId: doctorA!.id,
            date: futureDate,
            time: laterTime,
            type: 'CONSULTATION',
            reason: 'E2E non-overlapping slot',
          });
        expect([200, 201]).toContain(nonOverlapping.status);

        const differentDoctorSameSlot = await request(http())
          .post('/ops/appointments')
          .set(auth)
          .send({
            patientId: apptPatientId,
            doctorId: doctorB!.id,
            date: futureDate,
            time: baseTime,
            type: 'CONSULTATION',
            reason: 'E2E different doctor same slot',
          });
        expect([200, 201]).toContain(differentDoctorSameSlot.status);
      } finally {
        await app.close();
      }
    },
    60_000,
  );
});
