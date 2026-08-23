/**
 * VisitsController — delegates to VisitsService.
 */

import { VisitsController } from '../visits.controller';
import { VisitsService } from '../visits.service';

describe('VisitsController', () => {
  const visits = {
    findAll: jest.fn().mockResolvedValue([]),
    listSymptomCatalogue: jest.fn().mockReturnValue({ symptoms: [] }),
    getTriageSummary: jest.fn().mockResolvedValue({ id: 'v1' }),
    findOne: jest.fn().mockResolvedValue({ id: 'v1' }),
    checkIn: jest.fn().mockResolvedValue({ id: 'v1' }),
    updateReception: jest.fn().mockResolvedValue({ id: 'v1' }),
    recordTriage: jest.fn().mockResolvedValue({ id: 'v1' }),
    chargeConsultFee: jest.fn().mockResolvedValue({ id: 'v1' }),
    waiveConsultFee: jest.fn().mockResolvedValue({ id: 'v1' }),
    collectConsultFee: jest.fn().mockResolvedValue({ id: 'v1' }),
    startConsultation: jest.fn().mockResolvedValue({ id: 'v1' }),
    saveClinicalRecord: jest.fn().mockResolvedValue({ id: 'v1' }),
    saveClinicalOrders: jest.fn().mockResolvedValue({ id: 'v1' }),
    orderLabs: jest.fn().mockResolvedValue({ id: 'v1' }),
    submitLabResults: jest.fn().mockResolvedValue({ id: 'v1' }),
    completeConsultation: jest.fn().mockResolvedValue({ id: 'v1' }),
    finalizeBilling: jest.fn().mockResolvedValue({ id: 'v1' }),
    updateClaimStatus: jest.fn().mockResolvedValue({ id: 'v1' }),
    signOff: jest.fn().mockResolvedValue({ id: 'v1' }),
  };

  const controller = new VisitsController(visits as unknown as VisitsService);
  const user = { id: 'u1', role: 'DOCTOR' } as never;

  beforeEach(() => jest.clearAllMocks());

  it('lists visits and symptom catalogue', async () => {
    await controller.findAll(user, 'appt-1');
    expect(visits.findAll).toHaveBeenCalledWith(user, 'appt-1');
    expect(controller.symptomCatalogue()).toEqual({ symptoms: [] });
  });

  it('reads visit + triage summary', async () => {
    await controller.triageSummary('v1', user);
    expect(visits.getTriageSummary).toHaveBeenCalledWith('v1', user);
    await controller.findOne('v1', user);
    expect(visits.findOne).toHaveBeenCalledWith('v1', user);
  });

  it('runs front-desk and fee workflow endpoints', async () => {
    await controller.checkIn({ patientName: 'Ann' } as never, user);
    expect(visits.checkIn).toHaveBeenCalledWith(
      expect.objectContaining({ patientName: 'Ann' }),
      'u1',
    );
    await controller.updateReception('v1', { reasonForVisit: 'Fever' } as never);
    await controller.recordTriage('v1', { priority: 'URGENT' } as never, user);
    await controller.chargeConsultFee('v1', user);
    await controller.waiveConsultFee('v1');
    await controller.collectConsultFee(
      'v1',
      { mode: 'CASH', transactionReference: 'T1' } as never,
      user,
    );
    expect(visits.collectConsultFee).toHaveBeenCalledWith(
      'v1',
      'u1',
      'CASH',
      expect.objectContaining({ transactionReference: 'T1' }),
    );
  });

  it('runs clinical and billing endpoints', async () => {
    await controller.startConsultation('v1');
    await controller.saveClinicalNotes('v1', {
      clinicalRecord: { notes: 'ok' },
    } as never);
    await controller.saveClinicalOrders('v1', { orderedServices: [] } as never);
    await controller.orderLabs(
      'v1',
      { tests: ['CBC'], notes: 'fasting' } as never,
      user,
    );
    await controller.submitLabResults(
      'v1',
      { tests: [], comments: 'n' } as never,
      user,
    );
    await controller.complete('v1', { diagnosis: 'URI' } as never, user);
    await controller.finalizeBilling(
      'v1',
      { total: 1000, claimId: 'c1' } as never,
      user,
    );
    await controller.updateClaimStatus(
      'v1',
      { status: 'APPROVED' } as never,
      user,
    );
    await controller.signOff('v1');
    expect(visits.signOff).toHaveBeenCalledWith('v1');
  });
});
