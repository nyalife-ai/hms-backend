/**
 * Insurance adapters — Manual / Switch sandbox / Slade sandbox + live paths.
 */

import {
  ManualAdapter,
  Slade360Adapter,
  SwitchAdapter,
} from '../adapters';
import type { Slade360Client } from '../slade360.client';

describe('ManualAdapter', () => {
  const adapter = new ManualAdapter('Britam');

  it('verifies eligibility without OTP and submits claims', async () => {
    expect(await adapter.verifyEligibility('')).toEqual(
      expect.objectContaining({ ok: false }),
    );
    const ok = await adapter.verifyEligibility('POL-1');
    expect(ok).toEqual(
      expect.objectContaining({
        ok: true,
        requiresOtp: false,
        coverage: expect.objectContaining({ scheme: 'Britam' }),
      }),
    );
    expect(await adapter.sendOtp()).toEqual(
      expect.objectContaining({ ok: false }),
    );
    expect(await adapter.verifyOtp()).toEqual(
      expect.objectContaining({ verified: false }),
    );
    const claim = await adapter.submitClaim({
      memberNumber: 'POL-1',
      patientName: 'Ann',
      total: 1000,
      items: [{ description: 'Consult', amount: 1000 }],
    });
    expect(claim.ok).toBe(true);
    expect(claim.claimId).toMatch(/^MAN-/);
    expect(await adapter.getClaimStatus()).toBe('SUBMITTED');
  });
});

describe('SwitchAdapter (sandbox)', () => {
  const adapter = new SwitchAdapter({
    channel: 'SHA',
    scheme: 'SHA',
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  async function flush(ms = 1000) {
    await jest.advanceTimersByTimeAsync(ms);
  }

  it('rejects empty member and runs sandbox eligibility → OTP → claim', async () => {
    expect(await adapter.verifyEligibility('  ')).toEqual(
      expect.objectContaining({ ok: false }),
    );

    const eligP = adapter.verifyEligibility('SHA-12345');
    await flush(800);
    const elig = await eligP;
    expect(elig.ok).toBe(true);
    expect(elig.sessionId).toBeTruthy();

    const otpP = adapter.sendOtp(elig.sessionId!);
    await flush(700);
    const otp = await otpP;
    expect(otp).toEqual(
      expect.objectContaining({ ok: true, sandboxOtp: '123456' }),
    );

    const badP = adapter.verifyOtp(elig.sessionId!, '12');
    await flush(700);
    expect(await badP).toEqual(
      expect.objectContaining({ verified: false }),
    );

    const verifyP = adapter.verifyOtp(elig.sessionId!, '123456');
    await flush(700);
    const verified = await verifyP;
    expect(verified.verified).toBe(true);
    expect(verified.authorizationCode).toMatch(/^AUTH-/);

    const claimP = adapter.submitClaim({
      memberNumber: 'SHA-12345',
      patientName: 'Ann',
      total: 500,
      items: [{ description: 'Fee', amount: 500 }],
    });
    await flush(900);
    const claim = await claimP;
    expect(claim.ok).toBe(true);

    const statusP = adapter.getClaimStatus(claim.claimId!);
    await flush(500);
    expect(await statusP).toBe('SUBMITTED');
  });

  it('returns expired session errors in sandbox OTP flow', async () => {
    const sendP = adapter.sendOtp('sess_missing');
    await flush(700);
    expect(await sendP).toEqual(expect.objectContaining({ ok: false }));

    const verifyP = adapter.verifyOtp('sess_missing', '123456');
    await flush(700);
    expect(await verifyP).toEqual(
      expect.objectContaining({ verified: false }),
    );
  });

  it('calls live SHA HTTP when configured', async () => {
    const live = new SwitchAdapter({
      channel: 'SHA',
      scheme: 'SHA',
      baseUrl: 'https://sha.example',
      apiKey: 'key',
      providerCode: 'NYA',
    });
    expect(live.live).toBe(true);

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, requiresOtp: true, sessionId: 's1' }),
      text: async () => '',
    });
    global.fetch = fetchMock as never;

    await expect(live.verifyEligibility('M1')).resolves.toEqual(
      expect.objectContaining({ sessionId: 's1' }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://sha.example/v1/eligibility',
      expect.objectContaining({ method: 'POST' }),
    );

    fetchMock.mockResolvedValueOnce({
      ok: false,
      text: async () => 'boom',
    });
    await expect(live.verifyEligibility('M1')).rejects.toThrow(/responded/);

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, sandboxOtp: '1' }),
      text: async () => '',
    });
    await live.sendOtp('s1');
    await live.verifyOtp('s1', '123456');
    await live.submitClaim({
      memberNumber: 'M1',
      patientName: 'A',
      total: 1,
      items: [{ description: 'x', amount: 1 }],
    });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ACCEPTED' }),
      text: async () => '',
    });
    await expect(live.getClaimStatus('c1')).resolves.toBe('ACCEPTED');
  });
});

describe('Slade360Adapter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  function sandboxAdapter() {
    const client = {
      configured: false,
      memberEligibility: jest.fn(),
      sendOtp: jest.fn(),
      startVisit: jest.fn(),
      reserveFromAuthorization: jest.fn(),
      createClaim: jest.fn(),
      submitInvoice: jest.fn(),
      getClaim: jest.fn(),
      getClaimRemittance: jest.fn(),
    };
    return {
      client,
      adapter: new Slade360Adapter({
        client: client as unknown as Slade360Client,
        scheme: 'Jubilee',
        payerSladeCode: '457',
        payerName: 'Jubilee',
        locationCode: 'T01',
        locationName: 'Clinic',
      }),
    };
  }

  async function flush(ms = 1000) {
    await jest.advanceTimersByTimeAsync(ms);
  }

  it('runs sandbox eligibility → OTP → claim → status', async () => {
    const { adapter } = sandboxAdapter();
    expect(adapter.live).toBe(false);

    expect(await adapter.verifyEligibility('')).toEqual(
      expect.objectContaining({ ok: false }),
    );

    const eligP = adapter.verifyEligibility('JUB-100');
    await flush(800);
    const elig = await eligP;
    expect(elig.ok).toBe(true);
    expect(elig.requiresOtp).toBe(true);
    expect(elig.benefits?.[0].benefitCode).toBe('BEN/001');

    const sendP = adapter.sendOtp(elig.sessionId!);
    await flush(700);
    expect(await sendP).toEqual(
      expect.objectContaining({ ok: true, sandboxOtp: '123456' }),
    );

    expect(await adapter.sendOtp('bad')).toEqual(
      expect.objectContaining({ ok: false }),
    );

    const badCode = adapter.verifyOtp(elig.sessionId!, 'abc');
    expect(await badCode).toEqual(
      expect.objectContaining({ verified: false }),
    );

    const verifyP = adapter.verifyOtp(elig.sessionId!, '123456');
    await flush(700);
    const verified = await verifyP;
    expect(verified.verified).toBe(true);
    expect(verified.authToken).toMatch(/^SANDBOX-AUTH-/);

    const claimP = adapter.submitClaim({
      memberNumber: 'JUB-100',
      patientName: 'Ann',
      total: 2000,
      items: [{ description: 'Consult', amount: 2000 }],
      authToken: verified.authToken,
    });
    await flush(900);
    const claim = await claimP;
    expect(claim.ok).toBe(true);
    expect(claim.claimId).toMatch(/^CLM-/);

    const statusP = adapter.getClaimStatus(claim.claimId!);
    await flush(500);
    expect(await statusP).toBe('SUBMITTED');

    // Fresh CLM-* id (parts[1] is base36 timestamp) stays SUBMITTED within 15s
    const pendingId = `CLM-${Date.now().toString(36).toUpperCase()}-99`;
    const pendingP = adapter.getClaimStatus(pendingId);
    await flush(500);
    expect(await pendingP).toBe('SUBMITTED');
  });

  it('covers live eligibility / OTP / claim / status with mocked client', async () => {
    const client = {
      configured: true,
      memberEligibility: jest.fn(),
      sendOtp: jest.fn(),
      startVisit: jest.fn(),
      reserveFromAuthorization: jest.fn(),
      createClaim: jest.fn(),
      submitInvoice: jest.fn(),
      getClaim: jest.fn(),
      getClaimRemittance: jest.fn(),
    };
    const adapter = new Slade360Adapter({
      client: client as unknown as Slade360Client,
      scheme: 'Jubilee',
      payerSladeCode: '457',
      payerName: 'Jubilee',
      locationCode: 'T01',
      locationName: 'Clinic',
    });
    expect(adapter.live).toBe(true);

    client.memberEligibility.mockResolvedValue({
      isActive: false,
      benefits: [],
    });
    expect(await adapter.verifyEligibility('M1')).toEqual(
      expect.objectContaining({ ok: false, coverage: expect.objectContaining({ status: 'INACTIVE' }) }),
    );

    client.memberEligibility.mockResolvedValue({
      isActive: true,
      member: { full_name: 'Ann W', phone: '+254712345678' },
      benefits: [{ status: 'USED', benefit_type: 'OUTPATIENT', benefit_code: 'B1' }],
      beneficiary_id: '10',
      beneficiary_contact: '99',
    });
    expect(await adapter.verifyEligibility('M1')).toEqual(
      expect.objectContaining({ ok: false }),
    );

    client.memberEligibility.mockResolvedValue({
      isActive: true,
      member: { first_name: 'Ann', last_name: 'W' },
      benefits: [
        {
          status: 'AVAILABLE',
          benefit_type: 'OUTPATIENT',
          benefit_code: 'BEN/001',
          available_balance: '75000',
          name: 'OP',
        },
      ],
      beneficiary_id: '10',
      contacts: [{ id: 99, phone: '+254712345678' }],
      policy_number: 'POL',
      scheme_name: 'Jubilee',
      scheme_code: 'JUB',
    });
    const elig = await adapter.verifyEligibility('M1');
    expect(elig.ok).toBe(true);
    expect(elig.sessionId).toBeTruthy();

    client.memberEligibility.mockRejectedValue(new Error('down'));
    expect(await adapter.verifyEligibility('M1')).toEqual(
      expect.objectContaining({ ok: false, error: 'down' }),
    );

    client.sendOtp.mockResolvedValue({ otp: '654321' });
    expect(await adapter.sendOtp(elig.sessionId!)).toEqual(
      expect.objectContaining({ ok: true, sandboxOtp: '654321' }),
    );
    client.sendOtp.mockRejectedValue(new Error('otp fail'));
    expect(await adapter.sendOtp(elig.sessionId!)).toEqual(
      expect.objectContaining({ ok: false }),
    );

    client.startVisit.mockResolvedValue({
      auth_token: 'AUTH-LIVE',
      edi_auth_guid: 'GUID-1',
    });
    const verified = await adapter.verifyOtp(elig.sessionId!, '654321');
    expect(verified.verified).toBe(true);
    expect(verified.authToken).toBe('AUTH-LIVE');

    client.startVisit.mockResolvedValue({});
    // new eligibility for fresh session
    client.memberEligibility.mockResolvedValue({
      isActive: true,
      member: { name: 'Bob' },
      benefits: [
        {
          status: 'AVAILABLE',
          benefit_type: 'OUTPATIENT',
          benefit_code: 'BEN/001',
          balance: 1000,
        },
      ],
      beneficiary_id: '11',
      beneficiary_contact: { contact_id: 88 },
    });
    const elig2 = await adapter.verifyEligibility('M2');
    expect(await adapter.verifyOtp(elig2.sessionId!, '111111')).toEqual(
      expect.objectContaining({ ok: false }),
    );

    client.startVisit.mockRejectedValue(new Error('start fail'));
    const elig3 = await adapter.verifyEligibility('M3');
    expect(await adapter.verifyOtp(elig3.sessionId!, '111111')).toEqual(
      expect.objectContaining({ ok: false }),
    );

    // submit claim live
    expect(
      await adapter.submitClaim({
        memberNumber: 'M1',
        patientName: 'Ann',
        total: 100,
        items: [{ description: 'Fee', amount: 100 }],
      }),
    ).toEqual(expect.objectContaining({ ok: false }));

    client.reserveFromAuthorization.mockRejectedValue(new Error('skip'));
    client.createClaim.mockResolvedValue({
      id: 'claim-uuid',
      claim_id: 55,
      workflow_state: 'APPROVED',
    });
    client.submitInvoice.mockResolvedValue({ id: 'inv-1' });
    const claim = await adapter.submitClaim({
      memberNumber: 'M1',
      patientName: 'Ann',
      total: 100,
      items: [{ description: 'Fee', amount: 100, code: 'C1' }],
      authToken: 'AUTH-LIVE',
      ediAuthGuid: 'GUID-1',
      diagnosis: 'J06.9 - Acute URI',
      icd10Codes: [{ code: 'J06.9', description: 'URI' }],
    });
    expect(claim).toEqual(
      expect.objectContaining({
        ok: true,
        claimId: 'claim-uuid',
        status: 'ACCEPTED',
      }),
    );

    client.createClaim.mockResolvedValue({});
    expect(
      await adapter.submitClaim({
        memberNumber: 'M1',
        patientName: 'Ann',
        total: 1,
        items: [{ description: 'x', amount: 1 }],
        authToken: 'AUTH',
      }),
    ).toEqual(expect.objectContaining({ ok: false }));

    client.createClaim.mockResolvedValue({ id: 'c2', workflow_state: 'PENDING' });
    client.submitInvoice.mockRejectedValue(new Error('inv fail'));
    expect(
      await adapter.submitClaim({
        memberNumber: 'M1',
        patientName: 'Ann',
        total: 1,
        items: [{ description: 'x', amount: 1 }],
        authToken: 'AUTH',
        diagnosis: 'Headache',
      }),
    ).toEqual(
      expect.objectContaining({
        ok: true,
        error: expect.stringContaining('invoice failed'),
      }),
    );

    client.createClaim.mockRejectedValue(new Error('claim fail'));
    expect(
      await adapter.submitClaim({
        memberNumber: 'M1',
        patientName: 'Ann',
        total: 1,
        items: [{ description: 'x', amount: 1 }],
        authToken: 'AUTH',
      }),
    ).toEqual(expect.objectContaining({ ok: false }));

    client.getClaim.mockResolvedValue({ workflow_state: 'REJECTED' });
    expect(await adapter.getClaimStatus('c1')).toBe('REJECTED');

    client.getClaim.mockResolvedValue({ workflow_state: 'PENDING', claim_id: 9 });
    client.getClaimRemittance.mockResolvedValue({ approved_amount: 100 });
    expect(await adapter.getClaimStatus('c1')).toBe('ACCEPTED');

    client.getClaimRemittance.mockRejectedValue(new Error('none'));
    expect(await adapter.getClaimStatus('c1')).toBe('SUBMITTED');

    client.getClaim.mockRejectedValue(new Error('gone'));
    expect(await adapter.getClaimStatus('c1')).toBe('SUBMITTED');
  });

  it('errors when configured client has no payer code on claim', async () => {
    const client = {
      configured: true,
      memberEligibility: jest.fn(),
      sendOtp: jest.fn(),
      startVisit: jest.fn(),
      reserveFromAuthorization: jest.fn(),
      createClaim: jest.fn(),
      submitInvoice: jest.fn(),
      getClaim: jest.fn(),
      getClaimRemittance: jest.fn(),
    };
    const adapter = new Slade360Adapter({
      client: client as unknown as Slade360Client,
      scheme: 'Jubilee',
      payerSladeCode: '',
      payerName: 'Jubilee',
      locationCode: 'T01',
      locationName: 'Clinic',
    });
    expect(adapter.live).toBe(false);
    // submitClaim gates on client.configured (not live), then requires payer code
    expect(
      await adapter.submitClaim({
        memberNumber: 'M',
        patientName: 'A',
        total: 1,
        items: [{ description: 'x', amount: 1 }],
        authToken: 'AUTH',
      }),
    ).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.stringContaining('payer slade code'),
      }),
    );
  });
});
