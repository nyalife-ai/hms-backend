/**
 * InsuranceService — provider routing, eligibility enrichment, claims, sync.
 */

import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InsuranceService } from '../insurance.service';

jest.mock('../adapters', () => {
  const actual = jest.requireActual('../adapters');
  return {
    ...actual,
    ManualAdapter: jest.fn().mockImplementation((name: string) => ({
      verifyEligibility: jest.fn().mockResolvedValue({
        ok: true,
        requiresOtp: false,
        coverage: { status: 'UNVERIFIED', scheme: name },
        member: { name: 'Member', phoneMasked: '••••' },
      }),
      sendOtp: jest.fn().mockResolvedValue({ ok: false, error: 'no otp' }),
      verifyOtp: jest
        .fn()
        .mockResolvedValue({ ok: false, verified: false, error: 'no otp' }),
      submitClaim: jest.fn().mockResolvedValue({
        ok: true,
        claimId: 'MAN-1',
        status: 'SUBMITTED',
      }),
      getClaimStatus: jest.fn().mockResolvedValue('SUBMITTED'),
    })),
    SwitchAdapter: jest.fn().mockImplementation(() => ({
      verifyEligibility: jest.fn().mockResolvedValue({
        ok: true,
        sessionId: 'sha-sess',
        requiresOtp: true,
        member: { name: 'SHA Member', phoneMasked: '+254' },
        coverage: { status: 'ACTIVE', scheme: 'SHA', balance: 1000 },
      }),
      sendOtp: jest.fn().mockResolvedValue({ ok: true, sandboxOtp: '123456' }),
      verifyOtp: jest.fn().mockResolvedValue({
        ok: true,
        verified: true,
        authorizationCode: 'AUTH',
      }),
      submitClaim: jest.fn().mockResolvedValue({
        ok: true,
        claimId: 'SHA-CLM',
        status: 'SUBMITTED',
      }),
      getClaimStatus: jest.fn().mockResolvedValue('ACCEPTED'),
    })),
    Slade360Adapter: jest.fn().mockImplementation(() => ({
      verifyEligibility: jest.fn().mockResolvedValue({
        ok: true,
        sessionId: 'slade-sess',
        requiresOtp: true,
        benefits: [],
        member: { name: 'Slade Member', phoneMasked: '+254' },
        coverage: { status: 'ACTIVE', scheme: 'Jubilee' },
      }),
      sendOtp: jest.fn().mockResolvedValue({ ok: true }),
      verifyOtp: jest.fn().mockResolvedValue({
        ok: true,
        verified: true,
        authToken: 'TOK',
      }),
      submitClaim: jest.fn().mockResolvedValue({
        ok: true,
        claimId: 'SLADE-CLM',
        status: 'SUBMITTED',
        invoiceNumber: 'INV-1',
      }),
      getClaimStatus: jest.fn().mockResolvedValue('SUBMITTED'),
    })),
  };
});

describe('InsuranceService', () => {
  let config: { get: jest.Mock };
  let prisma: { isConnected: boolean };
  let insuranceRepo: Record<string, jest.Mock>;
  let billing: { settleVisit: jest.Mock; syncClaimStatus: jest.Mock };
  let visits: {
    findOne: jest.Mock;
    updateClaimStatus: jest.Mock;
  };
  let service: InsuranceService;

  beforeEach(() => {
    jest.clearAllMocks();
    config = {
      get: jest.fn((key: string) => {
        if (key === 'SLADE_PAYER_CODES') return 'JUBILEE:457';
        return undefined;
      }),
    };
    prisma = { isConnected: true };
    insuranceRepo = {
      listActiveProviders: jest.fn().mockResolvedValue([
        {
          id: 'sha',
          name: 'SHA',
          code: 'SHA',
          claim_submission_method: null,
        },
        {
          id: 'jub',
          name: 'Jubilee',
          code: 'JUBILEE',
          claim_submission_method: 'API',
        },
        {
          id: 'man',
          name: 'Britam',
          code: 'BRITAM',
          claim_submission_method: 'PORTAL',
        },
      ]),
      findProviderByIdOrCode: jest.fn(),
      findActivePolicy: jest.fn().mockResolvedValue(null),
    };
    billing = {
      settleVisit: jest.fn().mockResolvedValue({
        claimNumber: 'LOCAL-1',
        invoiceNumber: 'INV-LOCAL',
      }),
      syncClaimStatus: jest.fn().mockResolvedValue(undefined),
    };
    visits = {
      findOne: jest.fn(),
      updateClaimStatus: jest.fn().mockResolvedValue({
        stage: 'COMPLETED',
        id: 'v1',
      }),
    };

    service = new InsuranceService(
      config as unknown as ConfigService,
      prisma as never,
      insuranceRepo as never,
      billing as never,
      visits as never,
    );
  });

  it('requires database for listProviders', async () => {
    prisma.isConnected = false;
    await expect(service.listProviders()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('lists providers with integration/channel/mode', async () => {
    const rows = await service.listProviders();
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.code === 'SHA')?.integration).toBe('SHA');
    expect(rows.find((r) => r.code === 'JUBILEE')?.integration).toBe('SLADE');
    expect(rows.find((r) => r.code === 'BRITAM')?.integration).toBe('MANUAL');
    expect(rows.find((r) => r.code === 'JUBILEE')?.payerSladeCode).toBe('457');
  });

  it('verifies eligibility and enriches from local policy', async () => {
    insuranceRepo.findProviderByIdOrCode.mockResolvedValue({
      id: 'man',
      name: 'Britam',
      code: 'BRITAM',
      claim_submission_method: 'PORTAL',
    });
    insuranceRepo.findActivePolicy.mockResolvedValue({
      id: 'pol1',
      patient: {
        user: {
          core_profiles_user_id: [
            { first_name: 'Ann', last_name: 'W', phone: '0712345678' },
          ],
        },
      },
    });

    const result = await service.verifyEligibility('man', 'POL-9');
    expect(result.ok).toBe(true);
    expect(result.policyId).toBe('pol1');
    expect(result.member?.name).toBe('Ann W');
    expect(result.mode).toBe('sandbox');
  });

  it('rejects unknown providers', async () => {
    insuranceRepo.findProviderByIdOrCode.mockResolvedValue(null);
    await expect(
      service.verifyEligibility('missing', 'X'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('routes sendOtp / verifyOtp / getClaimStatus', async () => {
    insuranceRepo.findProviderByIdOrCode.mockResolvedValue({
      id: 'sha',
      name: 'SHA',
      code: 'SHA',
      claim_submission_method: null,
    });
    await service.sendOtp('sha', 'sess');
    await service.verifyOtp('sha', 'sess', '123456', {
      benefitCode: 'B1',
    });
    const status = await service.getClaimStatus('sha', 'CLM-1');
    expect(status.ok).toBe(true);
    expect(billing.syncClaimStatus).toHaveBeenCalledWith('CLM-1', 'ACCEPTED');
  });

  it('submits claims with visit enrichment and settlement', async () => {
    insuranceRepo.findProviderByIdOrCode.mockResolvedValue({
      id: 'man',
      name: 'Britam',
      code: 'BRITAM',
      claim_submission_method: 'PORTAL',
    });
    visits.findOne.mockResolvedValue({
      patientName: 'Ann',
      mrn: 'MRN-1',
      diagnosis: 'URI',
      checkedInAt: '2026-08-23T08:00:00Z',
      payment: {
        policyNumber: 'POL',
        authToken: 'TOK',
        authorizationCode: 'AUTH',
        ediAuthGuid: 'GUID',
        benefitType: 'OUTPATIENT',
        schemeName: 'Britam',
        schemeCode: 'BRITAM',
      },
    });

    const result = await service.submitClaim(
      'man',
      {
        memberNumber: '',
        patientName: '',
        total: 1000,
        items: [{ description: 'Consult', amount: 1000 }],
      },
      'actor1',
      { mrn: 'MRN-1', visitId: 'v1', diagnosis: 'URI' },
    );
    expect(result.ok).toBe(true);
    expect(result.localClaimNumber).toBe('LOCAL-1');
    expect(billing.settleVisit).toHaveBeenCalled();
  });

  it('blocks Slade claim without auth token', async () => {
    insuranceRepo.findProviderByIdOrCode.mockResolvedValue({
      id: 'jub',
      name: 'Jubilee',
      code: 'JUBILEE',
      claim_submission_method: 'API',
    });
    visits.findOne.mockRejectedValue(new Error('missing'));
    const result = await service.submitClaim(
      'jub',
      {
        memberNumber: 'M',
        patientName: 'A',
        total: 1,
        items: [{ description: 'x', amount: 1 }],
      },
      'actor',
      { visitId: 'v1' },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/auth_token/);
  });

  it('submits Slade claim when auth present and settles', async () => {
    insuranceRepo.findProviderByIdOrCode.mockResolvedValue({
      id: 'jub',
      name: 'Jubilee',
      code: 'JUBILEE',
      claim_submission_method: 'API',
    });
    const result = await service.submitClaim(
      'jub',
      {
        memberNumber: 'M',
        patientName: 'A',
        total: 1,
        items: [{ description: 'x', amount: 1 }],
        authToken: 'TOK',
      },
      'actor',
      { mrn: 'MRN-1' },
    );
    expect(result.ok).toBe(true);
    expect(result.claimId).toBe('SLADE-CLM');
  });

  it('returns gateway failure without settlement', async () => {
    const { ManualAdapter } = jest.requireMock('../adapters') as {
      ManualAdapter: jest.Mock;
    };
    ManualAdapter.mockImplementationOnce(() => ({
      submitClaim: jest.fn().mockResolvedValue({ ok: false, error: 'nope' }),
    }));
    insuranceRepo.findProviderByIdOrCode.mockResolvedValue({
      id: 'man',
      name: 'Britam',
      code: 'BRITAM',
      claim_submission_method: 'PORTAL',
    });
    const result = await service.submitClaim(
      'man',
      {
        memberNumber: 'M',
        patientName: 'A',
        total: 1,
        items: [{ description: 'x', amount: 1 }],
      },
      'actor',
    );
    expect(result.ok).toBe(false);
  });

  it('continues when settlement fails after gateway success', async () => {
    billing.settleVisit.mockRejectedValue(new Error('settle fail'));
    insuranceRepo.findProviderByIdOrCode.mockResolvedValue({
      id: 'man',
      name: 'Britam',
      code: 'BRITAM',
      claim_submission_method: 'PORTAL',
    });
    const result = await service.submitClaim(
      'man',
      {
        memberNumber: 'M',
        patientName: 'A',
        total: 1,
        items: [{ description: 'x', amount: 1 }],
      },
      'actor',
      { mrn: 'MRN-1' },
    );
    expect(result.ok).toBe(true);
    expect(result.claimId).toBe('MAN-1');
  });

  it('syncs visit claim status and handles missing claim id', async () => {
    insuranceRepo.findProviderByIdOrCode.mockResolvedValue({
      id: 'sha',
      name: 'SHA',
      code: 'SHA',
      claim_submission_method: null,
    });
    visits.findOne.mockResolvedValue({ billing: {} });
    const missing = await service.syncVisitClaim('sha', 'v1', 'actor');
    expect(missing.ok).toBe(false);

    visits.findOne.mockResolvedValue({ billing: { claimId: 'CLM-1' } });
    const synced = await service.syncVisitClaim('sha', 'v1', 'actor');
    expect(synced.ok).toBe(true);
    expect(synced.signedOff).toBe(true);
    expect(visits.updateClaimStatus).toHaveBeenCalledWith(
      'v1',
      'ACCEPTED',
      'actor',
    );
  });

  it('marks SHA live when base url + api key configured', async () => {
    config.get.mockImplementation((key: string) => {
      if (key === 'SHA_BASE_URL') return 'https://sha';
      if (key === 'SHA_API_KEY') return 'key';
      if (key === 'SLADE_PAYER_CODES') return 'JUBILEE:457';
      return undefined;
    });
    service = new InsuranceService(
      config as unknown as ConfigService,
      prisma as never,
      insuranceRepo as never,
      billing as never,
      visits as never,
    );
    const rows = await service.listProviders();
    expect(rows.find((r) => r.code === 'SHA')?.mode).toBe('live');
  });
});
