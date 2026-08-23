/**
 * LaboratoryController — delegation coverage via proxied collaborators.
 */

import { LaboratoryController } from '../laboratory.controller';

function proxyMock(): any {
  return new Proxy(
    {} as Record<string, unknown>,
    {
      get: (target, prop) => {
        if (prop === 'then') return undefined;
        const key = String(prop);
        if (!target[key]) {
          target[key] = jest.fn().mockResolvedValue({ ok: key });
        }
        return target[key];
      },
    },
  );
}

describe('LaboratoryController', () => {
  const ops = proxyMock();
  const journey = proxyMock();
  const controller = new LaboratoryController(ops, journey);
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
      else if (i === 0 && method.startsWith('list')) args.push({});
      else if (i === 0 && (method.startsWith('create') || method === 'admit' || method === 'reserve' || method === 'dispenseVisit' || method === 'adjust' || method === 'damage' || method === 'expiry' || method === 'returnStock'))
        args.push(body);
      else if (method.startsWith('list') || method === 'visitReport' || method === 'findAll')
        args.push({});
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
    await invoke('repairReleasedVisits');
    await invoke('visitReport');
    await invoke('listClinicalServices');
    await invoke('createClinicalService');
    await invoke('updateClinicalService');
    await invoke('listTestTypes');
    await invoke('getTestType');
    await invoke('createTestType');
    await invoke('updateTestType');
    await invoke('deactivateTestType');
    await invoke('activateTestType');
    await invoke('listParameters');
    await invoke('getParameter');
    await invoke('createParameter');
    await invoke('updateParameter');
    await invoke('listRequests');
    await invoke('getRequest');
    await invoke('releaseToDoctor');
    await invoke('updateFindings');
    await invoke('createRequest');
    await invoke('cancelRequest');
    await invoke('collectSample');
    await invoke('enterResult');
    await invoke('verify');
    await invoke('correct');
    await invoke('listSamples');
    await invoke('getSample');
    await invoke('updateSampleStatus');
    await invoke('resultsSummary');
    await invoke('listResultBundles');
    await invoke('listResults');
    await invoke('getResultReport');
  });
});
