/**
 * PatientPortalController — ownership-scoped self-service routes.
 */

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PatientPortalController } from '../patient-portal.controller';

const USER = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const PID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PROFILE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function patientRow() {
  return {
    id: PID,
    patient_number: 'MRN-10001',
    blood_group: 'O+',
    allergies: 'None',
    user: {
      core_profiles_user_id: [
        {
          id: PROFILE,
          first_name: 'Amina',
          last_name: 'Wanjiru',
          phone: '0700111222',
          gender: 'FEMALE',
          date_of_birth: new Date('1990-01-01'),
          address: 'Nairobi',
        },
      ],
    },
  };
}

describe('PatientPortalController', () => {
  let prisma: any;
  let audit: { recordAccess: jest.Mock; recordMutation: jest.Mock };
  let controller: PatientPortalController;
  const req = { user: { id: USER, role: 'PATIENT' } as any };

  beforeEach(() => {
    prisma = {
      patients: { findFirst: jest.fn() },
      profiles: { update: jest.fn() },
      appointments: { findMany: jest.fn() },
      prescriptions: { findMany: jest.fn() },
      laboratoryRequests: { findMany: jest.fn() },
      invoices: { findMany: jest.fn() },
    };
    audit = {
      recordAccess: jest.fn().mockResolvedValue(undefined),
      recordMutation: jest.fn().mockResolvedValue(undefined),
    };
    controller = new PatientPortalController(prisma, audit as any);
  });

  it('profile returns mapped fields and records access', async () => {
    prisma.patients.findFirst.mockResolvedValue(patientRow());
    const res = await controller.profile(req);
    expect(res).toEqual(
      expect.objectContaining({
        patientId: PID,
        mrn: 'MRN-10001',
        firstName: 'Amina',
        bloodGroup: 'O+',
      }),
    );
    expect(audit.recordAccess).toHaveBeenCalled();
  });

  it('requireOwnPatient throws when missing', async () => {
    prisma.patients.findFirst.mockResolvedValue(null);
    await expect(controller.profile(req)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updateProfile updates core profile fields', async () => {
    prisma.patients.findFirst.mockResolvedValue(patientRow());
    prisma.profiles.update.mockResolvedValue({ id: PROFILE });
    await expect(
      controller.updateProfile(req, {
        firstName: 'Ami',
        lastName: 'W',
        phone: '0711',
        address: 'Mombasa',
      }),
    ).resolves.toEqual({ ok: true });
    expect(audit.recordMutation).toHaveBeenCalled();

    prisma.patients.findFirst.mockResolvedValue({
      ...patientRow(),
      user: { core_profiles_user_id: [] },
    });
    await expect(controller.updateProfile(req, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('appointments / prescriptions / lab-results / invoices map rows', async () => {
    prisma.patients.findFirst.mockResolvedValue(patientRow());
    prisma.appointments.findMany.mockResolvedValue([
      {
        id: 'a1',
        appointment_date: new Date('2026-08-20T00:00:00.000Z'),
        status: 'SCHEDULED',
        appointment_type: 'OPD',
        reason: 'ANC',
      },
    ]);
    expect(await controller.appointments(req)).toEqual([
      expect.objectContaining({ id: 'a1', date: '2026-08-20', type: 'OPD' }),
    ]);

    prisma.prescriptions.findMany.mockResolvedValue([
      {
        id: 'p1',
        prescription_number: 'RX-1',
        prescription_date: new Date('2026-08-01T00:00:00.000Z'),
        status: 'ACTIVE',
        pharmacy_prescription_lines_prescription_id: [
          {
            dosage: '1',
            frequency: 'BD',
            status: 'PENDING',
            medication: { medication_name: 'Amox' },
          },
        ],
      },
    ]);
    const rx = await controller.prescriptions(req);
    expect(rx[0].lines[0].medication).toBe('Amox');

    prisma.laboratoryRequests.findMany.mockResolvedValue([
      {
        id: 'l1',
        request_number: 'LAB-1',
        status: 'COMPLETED',
        laboratory_results_request_id: [
          {
            result_value: '5.0',
            interpretation: 'N',
            verified_at: new Date('2026-08-02'),
            parameter: { parameter_name: 'Hb' },
          },
        ],
      },
    ]);
    const labs = await controller.labResults(req);
    expect(labs[0].results[0].parameter).toBe('Hb');

    prisma.invoices.findMany.mockResolvedValue([
      {
        id: 'i1',
        invoice_number: 'INV-1',
        invoice_date: new Date('2026-08-03T00:00:00.000Z'),
        total_amount: 1500,
        status: 'PAID',
      },
    ]);
    const inv = await controller.invoices(req);
    expect(inv[0]).toEqual(
      expect.objectContaining({ number: 'INV-1', total: 1500 }),
    );
  });

  it('assertOwnership enforces same user', () => {
    expect(() =>
      controller.assertOwnership(req.user, USER),
    ).not.toThrow();
    expect(() =>
      controller.assertOwnership(req.user, 'other'),
    ).toThrow(ForbiddenException);
  });
});
