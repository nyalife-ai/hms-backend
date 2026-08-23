/**
 * Slade360Client — OAuth token + EDI/IS request helpers with fetch mocks.
 */

import {
  loadSladeConfigFromEnv,
  parsePayerCodes,
  Slade360Client,
} from '../slade360.client';

describe('loadSladeConfigFromEnv / parsePayerCodes', () => {
  it('loads defaults and env overrides', () => {
    const cfg = loadSladeConfigFromEnv({
      SLADE_CLIENT_ID: ' id ',
      SLADE_SECRET_KEY: ' secret ',
      SLADE_BASE_URL: 'https://edi.example/',
      SLADE_ELIGIBILITY_MEMBER_PARAM: 'member_no',
      SLADE_ELIGIBILITY_PAYER_PARAM: 'payer_code',
    } as NodeJS.ProcessEnv);
    expect(cfg.clientId).toBe('id');
    expect(cfg.clientSecret).toBe('secret');
    expect(cfg.ediBaseUrl).toBe('https://edi.example/');
    expect(cfg.memberParam).toBe('member_no');
    expect(cfg.payerParam).toBe('payer_code');
  });

  it('parses payer code maps with Jubilee default', () => {
    expect(parsePayerCodes()).toEqual({ JUBILEE: '457' });
    expect(parsePayerCodes('AAR:123, Britam:999')).toEqual({
      JUBILEE: '457',
      AAR: '123',
      BRITAM: '999',
    });
  });
});

describe('Slade360Client', () => {
  const baseConfig = {
    clientId: 'cid',
    clientSecret: 'sec',
    tokenUrl: 'https://auth.example/token',
    ediBaseUrl: 'https://edi.example',
    isBaseUrl: 'https://is.example',
    memberParam: 'member_number',
    payerParam: 'payer',
  };

  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as never;
  });

  it('reports configured only when credentials + EDI base present', () => {
    expect(new Slade360Client(baseConfig).configured).toBe(true);
    expect(
      new SpadeClient({ ...baseConfig, clientId: '' }).configured,
    ).toBe(false);
  });

  it('fetches and caches access tokens', async () => {
    const client = new Slade360Client(baseConfig);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({ access_token: 'tok1', expires_in: 3600 }),
    });
    await expect(client.getAccessToken()).resolves.toBe('tok1');
    // cached
    await expect(client.getAccessToken()).resolves.toBe('tok1');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce({
      ok: false,
      text: async () => 'denied',
    });
    const fresh = new Slade360Client(baseConfig);
    await expect(fresh.getAccessToken()).rejects.toThrow(/token request failed/);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () => 'not-json',
    });
    await expect(new Slade360Client(baseConfig).getAccessToken()).rejects.toThrow(
      /not JSON/,
    );

    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({}),
    });
    await expect(new Slade360Client(baseConfig).getAccessToken()).rejects.toThrow(
      /missing access_token/,
    );
  });

  it('issues authenticated EDI/IS requests and maps errors', async () => {
    const client = new Slade360Client(baseConfig);
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({ access_token: 'tok', expires_in: 3600 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ id: '1' }),
      });

    await expect(client.sendOtp(99)).resolves.toEqual({ id: '1' });

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({ access_token: 'tok2', expires_in: 3600 }),
      })
      .mockResolvedValueOnce({
        ok: false,
        text: async () => 'plain-error',
      });
    const client2 = new Slade360Client(baseConfig);
    await expect(client2.listRemittances()).rejects.toThrow(/→ /);
  });

  it('retries member eligibility on 400/404/422 param errors', async () => {
    const client = new Slade360Client(baseConfig);
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({ access_token: 'tok', expires_in: 3600 }),
      })
      .mockResolvedValueOnce({
        ok: false,
        text: async () => JSON.stringify({ detail: 'bad params' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ isActive: true }),
      });

    // First GET fails with 400-like message from request(), second attempt succeeds.
    // Need token once then two eligibility GETs — but first failure throws and
    // retries use same cached token.
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({ access_token: 'tok', expires_in: 3600 }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ detail: 'bad' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ isActive: true }),
      });

    // Patch: request builds error as `Slade360 ${path} → ${res.status}`
    // so status must be on response. Our mock needs res.status.
    const result = await client.memberEligibility('M1', '457');
    expect(result).toEqual({ isActive: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('covers remaining endpoint helpers', async () => {
    const client = new SpadeClient(baseConfig);
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({ access_token: 'tok', expires_in: 3600 }),
      })
      .mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ ok: true }),
      });

    await client.startVisit({
      beneficiary_id: 1,
      factors: ['OTP'],
      benefit_type: 'OUTPATIENT',
      benefit_code: 'B1',
      policy_number: 'P',
      policy_effective_date: '2023-01-01',
      otp: '123456',
      beneficiary_contact: 2,
    });
    await client.validateAuthorizationToken({ token: 't' });
    await client.reserveFromAuthorization({
      invoice_number: 'INV',
      amount: 10,
      edi_auth_guid: 'g',
    });
    await client.createClaim({ member_number: 'x' });
    await client.uploadClaimAttachment({
      claim: 'c',
      attachment: 'a',
      attachment_type: 'pdf',
    });
    await client.submitInvoice({ claim: 'c' });
    await client.uploadInvoiceAttachment({
      invoice: 'i',
      attachment: 'a',
    });
    await client.getClaim('claim-1');
    await client.getClaimRemittance(55);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(5);
  });
});

/** Alias so typo-safe rename if needed */
class SpadeClient extends Slade360Client {}
