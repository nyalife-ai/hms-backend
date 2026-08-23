/**
 * InpatientController — HTTP delegation with proxied journey/ops.
 */

import { InpatientController } from '../inpatient.controller';

function proxyMock(): any {
  return new Proxy(
    {},
    {
      get: (target, prop) => {
        if (prop === 'then') return undefined;
        if (!target[prop as string]) {
          target[prop as string] = jest.fn().mockResolvedValue({ ok: String(prop) });
        }
        return target[prop as string];
      },
    },
  );
}

describe('InpatientController', () => {
  const journey = proxyMock();
  const ops = proxyMock();
  const controller = new InpatientController(journey, ops);
  const user = {
    id: 'u1',
    role: 'DOCTOR',
    staffProfileId: '00000000-0000-4000-8000-000000000099',
  } as never;
  const req = { user: { id: 'u1' } };
  const id = '00000000-0000-4000-8000-000000000001';
  const doctorId = '00000000-0000-4000-8000-000000000099';

  beforeEach(() => jest.clearAllMocks());

  it('delegates ward, bed, admission, and clinical handlers', async () => {
    await controller.overview();
    await controller.listWards('true', 'GENERAL', '1', '20', 'q');
    await controller.getWard(id);
    await controller.createWard({
      name: 'Ward A',
      wardType: 'GENERAL',
    } as never);
    await controller.updateWard(id, { name: 'Ward B' } as never);
    await controller.deactivateWard(id);

    await controller.listBeds(id, 'AVAILABLE', 'true', '1', '20', 'q');
    await controller.createBed({ wardId: id, bedNumber: 'B1' });
    await controller.createBedsBulk({ wardId: id, bedNumbers: ['B2', 'B3'] });
    await controller.updateBedStatus(id, req, { status: 'AVAILABLE' });

    await controller.listAdmissions('ACTIVE', id, 'true', '1', '20', 'q');
    await controller.listActive();
    await controller.getAdmission(id);

    await controller.admit(user, {
      patientId: id,
      bedId: id,
      admittingDoctorId: doctorId,
    });
    await controller.transfer(id, req, { newBedId: id, reason: 'move' });
    await controller.transferOut(id, req, { reason: 'referral' });
    await controller.discharge(id, user, {
      dischargingDoctorId: doctorId,
      diagnosis: 'resolved',
    } as never);
    await controller.markDeceased(id, req, { notes: 'n' });
    await controller.transferHistory(id);

    await controller.listNursingNotes(id);
    await controller.createNursingNote(id, user, { note: 'ok' } as never);
    await controller.listVitals(id);
    await controller.recordVitals(id, user, { pulse: 80 } as never);
    await controller.listWardMedications(id);
    await controller.orderWardMedication(id, user, {
      medicationId: id,
    } as never);

    await controller.getDischargeSummary(id);
    await controller.upsertDischargeSummary(id, req, { summary: 's' } as never);
    await controller.finalizeDischargeSummary(id, req);

    await controller.listReservations(
      'OPEN',
      id,
      id,
      '2026-01-01',
      '2026-12-31',
      '1',
      '20',
      'q',
    );
    await controller.reserve(req, { patientId: id, wardId: id } as never);
    await controller.cancelReservation(id, req);
    await controller.expireReservation(id);
    await controller.convertReservation(id, user, { bedId: id } as never);
    await controller.getNursingNote(id);

    expect(ops.overview).toHaveBeenCalled();
    expect(journey.admit).toHaveBeenCalled();
    expect(journey.discharge).toHaveBeenCalled();
  });
});
