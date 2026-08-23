/**
 * PharmacyController — delegation coverage via proxied collaborators.
 */

import { PharmacyController } from '../pharmacy.controller';

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

describe('PharmacyController', () => {
  const service = proxyMock();
  const dispense = proxyMock();
  const ops = proxyMock();
  const journey = proxyMock();
  const controller = new PharmacyController(service, dispense, ops, journey);
  const user = { id: 'u1', role: 'ADMIN', staffProfileId: 'st1' } as never;
  const body = {
    name: 'x',
    notes: 'n',
    status: 'OPEN',
    reason: 'r',
    patientId: '00000000-0000-4000-8000-000000000001',
    wardId: '00000000-0000-4000-8000-000000000001',
    bedId: '00000000-0000-4000-8000-000000000001',
    doctorId: '00000000-0000-4000-8000-000000000001',
  } as never;
  const id = '00000000-0000-4000-8000-000000000001';

  async function invoke(method: string) {
    const fn = (controller as any)[method] as Function;
    expect(typeof fn).toBe('function');
    const n = fn.length;
    const args: unknown[] = [];
    for (let i = 0; i < n; i++) {
      if (i === n - 1 && n >= 2) args.push(user);
      else if (i === 0 && /^(get|update|delete|deactivate|activate|cancel|void|send|receive|verify|correct|collect|enter|release|convert|expire|finalize|mark|transfer|discharge|findOne|remove|order|record|createNursing|upsert)/.test(method))
        args.push(id);
      else if (i === 0 && method.startsWith('list')) args.push('true');
      else if (i === 0 && (method.startsWith('create') || method === 'admit' || method === 'reserve' || method === 'dispenseVisit' || method === 'adjust' || method === 'damage' || method === 'expiry' || method === 'returnStock'))
        args.push(body);
      else if (method.startsWith('list') || method === 'visitReport' || method === 'findAll')
        args.push(i % 2 === 0 ? 'true' : '1');
      else args.push(body);
    }
    // admit/reserve need user as last when length fits
    if ((method === 'admit' || method === 'reserve' || method === 'createNursingNote' || method === 'recordVitals' || method === 'orderWardMedication') && n >= 2) {
      args[n - 1] = user;
      args[0] = method === 'admit' || method === 'reserve' ? body : id;
      if (n >= 3) args[1] = body;
    }
    if (['transfer', 'transferOut', 'discharge', 'markDeceased', 'updateBedStatus', 'convertReservation', 'cancelReservation'].includes(method) && n >= 2) {
      args[0] = id;
      args[1] = body;
      if (n >= 3) args[2] = user;
    }
    await Promise.resolve(fn.apply(controller, args));
  }

  beforeEach(() => jest.clearAllMocks());

  it('invokes all HTTP handlers without throwing', async () => {
    await invoke('overview');
    await invoke('dispenseVisit');
    await invoke('listSuppliers');
    await invoke('getSupplier');
    await invoke('createSupplier');
    await invoke('updateSupplier');
    await invoke('deactivateSupplier');
    await invoke('activateSupplier');
    await invoke('listCategories');
    await invoke('getCategory');
    await invoke('createCategory');
    await invoke('updateCategory');
    await invoke('listMedications');
    await invoke('getMedication');
    await invoke('createMedication');
    await invoke('updateMedication');
    await invoke('deleteMedication');
    await invoke('listBatches');
    await invoke('getBatch');
    await invoke('createBatch');
    await invoke('updateBatch');
    await invoke('listMovements');
    await invoke('adjust');
    await invoke('damage');
    await invoke('expiry');
    await invoke('returnStock');
    await invoke('listPrescriptions');
    await invoke('getPrescription');
    await invoke('createPrescription');
    await invoke('cancelPrescription');
    await invoke('voidPrescription');
    await invoke('dispensePrescription');
    await invoke('listPos');
    await invoke('getPo');
    await invoke('createPo');
    await invoke('sendPo');
    await invoke('cancelPo');
    await invoke('receivePo');
    await invoke('create');
    await invoke('findAll');
    await invoke('findOne');
    await invoke('update');
    await invoke('remove');
  });
});
