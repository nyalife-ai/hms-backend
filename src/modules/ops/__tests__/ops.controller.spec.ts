/**
 * OpsController — thin delegation to OpsService.
 */

import { OpsController } from '../ops.controller';
import { OpsService } from '../ops.service';

describe('OpsController', () => {
  const ops = {
    listLabRequests: jest.fn().mockResolvedValue([]),
    listScanTypes: jest.fn().mockResolvedValue([]),
    bootstrapBillingAndPolicies: jest.fn().mockResolvedValue({ ok: true }),
    createAppointment: jest.fn().mockResolvedValue({ id: 'a1' }),
    createAdmission: jest.fn().mockResolvedValue({ id: 'adm1' }),
    createRadiologyRequest: jest.fn().mockResolvedValue({ id: 'rad1' }),
    createInvoice: jest.fn().mockResolvedValue({ id: 'inv1' }),
    createPatient: jest.fn().mockResolvedValue({ id: 'p1' }),
    createStaff: jest.fn().mockResolvedValue({ id: 's1' }),
    updateStaff: jest.fn().mockResolvedValue({ id: 's1' }),
    createMedication: jest.fn().mockResolvedValue({ id: 'm1' }),
    reorderMedication: jest.fn().mockResolvedValue({ id: 'b1' }),
    createConversation: jest.fn().mockResolvedValue({ id: 'c1' }),
    listMessages: jest.fn().mockResolvedValue([]),
    postMessage: jest.fn().mockResolvedValue({ id: 'msg1' }),
    getHospitalSettings: jest.fn().mockResolvedValue({ name: 'NyaLife' }),
    updateHospitalSettings: jest.fn().mockResolvedValue({ name: 'NyaLife' }),
    listSystemSettings: jest.fn().mockResolvedValue({ groups: [] }),
    upsertSystemSettings: jest.fn().mockResolvedValue({ groups: [] }),
    deactivateStaff: jest.fn().mockResolvedValue({ ok: true }),
  };

  const controller = new OpsController(ops as unknown as OpsService);
  const user = { id: 'u1', role: 'ADMIN' } as never;

  beforeEach(() => jest.clearAllMocks());

  it('lists lab requests and scan types', async () => {
    await controller.labRequests();
    expect(ops.listLabRequests).toHaveBeenCalled();
    await controller.scanTypes();
    expect(ops.listScanTypes).toHaveBeenCalled();
  });

  it('bootstraps billing', async () => {
    await controller.bootstrap();
    expect(ops.bootstrapBillingAndPolicies).toHaveBeenCalled();
  });

  it('creates appointments, admissions, radiology, invoices', async () => {
    await controller.createAppointment(
      {
        patientId: 'p1',
        doctorId: 'd1',
        date: '2026-08-23',
        time: '09:00',
      } as never,
      user,
    );
    expect(ops.createAppointment).toHaveBeenCalledWith(
      expect.objectContaining({ patientId: 'p1', createdBy: 'u1' }),
    );

    await controller.createAdmission(
      { patientId: 'p1', wardId: 'w1' } as never,
      user,
    );
    expect(ops.createAdmission).toHaveBeenCalledWith(
      expect.objectContaining({ wardId: 'w1', createdBy: 'u1' }),
    );

    await controller.createRadiology(
      { patientId: 'p1', scanTypeId: 'st1' } as never,
      user,
    );
    expect(ops.createRadiologyRequest).toHaveBeenCalledWith(
      expect.objectContaining({ scanTypeId: 'st1', createdBy: 'u1' }),
    );

    await controller.createInvoice(
      { patientId: 'p1', amount: 1000, description: 'Fee' } as never,
      user,
    );
    expect(ops.createInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 1000, createdBy: 'u1' }),
    );
  });

  it('manages patients and staff', async () => {
    await controller.createPatient(
      {
        firstName: 'Ann',
        lastName: 'Wanjiku',
        gender: 'Female',
        phone: '+254700',
      } as never,
      user,
    );
    expect(ops.createPatient).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: 'Ann', createdBy: 'u1' }),
    );

    await controller.createStaff({
      firstName: 'Doc',
      lastName: 'Okello',
      email: 'd@x.com',
      role: 'DOCTOR',
    } as never);
    expect(ops.createStaff).toHaveBeenCalled();

    await controller.updateStaff('s1', { firstName: 'Updated' } as never);
    expect(ops.updateStaff).toHaveBeenCalledWith('s1', { firstName: 'Updated' });

    await controller.deactivateStaff('s1');
    expect(ops.deactivateStaff).toHaveBeenCalledWith('s1');
  });

  it('manages medications and conversations', async () => {
    await controller.createMedication(
      {
        name: 'Paracetamol',
        quantity: 100,
        expiry: '2027-01-01',
      } as never,
      user,
    );
    expect(ops.createMedication).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Paracetamol', createdBy: 'u1' }),
    );

    await controller.reorder(
      { medicationId: 'm1', quantity: 50 } as never,
      user,
    );
    expect(ops.reorderMedication).toHaveBeenCalledWith(
      expect.objectContaining({ medicationId: 'm1', createdBy: 'u1' }),
    );

    await controller.createConversation(
      { name: 'Ward A', preview: 'Hello' } as never,
      user,
    );
    expect(ops.createConversation).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Ward A', createdBy: 'u1' }),
    );

    await controller.listMessages('c1', user);
    expect(ops.listMessages).toHaveBeenCalledWith('c1', 'u1');

    await controller.postMessage('c1', { body: 'Hi' } as never, user);
    expect(ops.postMessage).toHaveBeenCalledWith({
      conversationId: 'c1',
      body: 'Hi',
      senderId: 'u1',
    });
  });

  it('reads and writes hospital / system settings', async () => {
    await controller.getHospitalSettings();
    expect(ops.getHospitalSettings).toHaveBeenCalled();

    await controller.updateHospitalSettings({ name: 'Clinic' } as never, user);
    expect(ops.updateHospitalSettings).toHaveBeenCalledWith(
      { name: 'Clinic' },
      'u1',
    );

    await controller.listSystemSettings('general');
    expect(ops.listSystemSettings).toHaveBeenCalledWith('general');

    await controller.upsertSystemSettings(
      { items: [{ key: 'currency', value: 'KES' }] } as never,
      user,
    );
    expect(ops.upsertSystemSettings).toHaveBeenCalledWith(
      [{ key: 'currency', value: 'KES' }],
      'u1',
    );

    await controller.upsertSystemSettings({} as never, user);
    expect(ops.upsertSystemSettings).toHaveBeenCalledWith([], 'u1');
  });
});
