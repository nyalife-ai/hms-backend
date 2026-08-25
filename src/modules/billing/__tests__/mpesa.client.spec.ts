/**
 * MpesaClient — OAuth cache, STK push/query, phone normalize, env config.
 */

import {
  MpesaClient,
  loadMpesaConfigFromEnv,
  type MpesaConfig,
} from '../mpesa.client';

const baseConfig = (): MpesaConfig => ({
  consumerKey: 'key',
  consumerSecret: 'secret',
  shortcode: '174379',
  passkey: 'pass',
  callbackUrl: 'https://example.com/billing/mpesa/callback',
  env: 'sandbox',
  transactionType: 'CustomerPayBillOnline',
});

describe('MpesaClient', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    MpesaClient.clearTokenCache();
    jest.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    MpesaClient.clearTokenCache();
  });

  it('reports configured when credentials are present', () => {
    const client = new MpesaClient(baseConfig());
    expect(client.configured).toBe(true);
    client.updateConfig({ ...baseConfig(), consumerKey: '  ' });
    expect(client.configured).toBe(false);
  });

  it('normalizes Kenyan phone numbers and rejects invalid ones', () => {
    expect(MpesaClient.normalizePhone('0712345678')).toBe('254712345678');
    expect(MpesaClient.normalizePhone('+254712345678')).toBe('254712345678');
    expect(MpesaClient.normalizePhone('254712345678')).toBe('254712345678');
    expect(MpesaClient.normalizePhone('712345678')).toBe('254712345678');
    expect(MpesaClient.normalizePhone('0112345678')).toBe('254112345678');
    expect(MpesaClient.normalizePhone('254112345678')).toBe('254112345678');
    expect(() => MpesaClient.normalizePhone('123')).toThrow(/Invalid M-Pesa phone/i);
  });

  it('loads sandbox and production config from env', () => {
    const sandbox = loadMpesaConfigFromEnv({
      MPESA_CONSUMER_KEY: 'k',
      MPESA_CONSUMER_SECRET: 's',
      MPESA_PASSKEY: 'p',
      PUBLIC_URL: 'https://clinic.test/',
    });
    expect(sandbox.env).toBe('sandbox');
    expect(sandbox.callbackUrl).toBe(
      'https://clinic.test/billing/mpesa/callback',
    );
    expect(sandbox.shortcode).toBe('174379');

    const prod = loadMpesaConfigFromEnv({
      MPESA_ENV: 'production',
      MPESA_CALLBACK_URL: 'https://cb.test/cb',
      MPESA_SHORTCODE: '123456',
      MPESA_TRANSACTION_TYPE: 'CustomerBuyGoodsOnline',
    });
    expect(prod.env).toBe('production');
    expect(prod.callbackUrl).toBe('https://cb.test/cb');
    expect(prod.shortcode).toBe('123456');
    expect(prod.transactionType).toBe('CustomerBuyGoodsOnline');
  });

  it('fetches and caches OAuth tokens; uses production base URL', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({ access_token: 'tok-1', expires_in: '3600' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            MerchantRequestID: 'm1',
            CheckoutRequestID: 'c1',
            ResponseCode: '0',
            ResponseDescription: 'Success',
            CustomerMessage: 'Success',
          }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new MpesaClient({ ...baseConfig(), env: 'production' });
    const t1 = await client.getAccessToken();
    const t2 = await client.getAccessToken();
    expect(t1).toBe('tok-1');
    expect(t2).toBe('tok-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      'https://api.safaricom.co.ke',
    );

    await client.stkPush({
      phone: '0712345678',
      amount: 10.4,
      accountReference: 'VISIT-ABCDEFGHIJK',
      description: 'Consult fee long',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const stkBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(stkBody.Amount).toBe(10);
    expect(stkBody.AccountReference).toHaveLength(12);
    expect(stkBody.TransactionDesc).toHaveLength(13);
    expect(stkBody.PhoneNumber).toBe('254712345678');
  });

  it('rejects OAuth failures and missing access_token', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'unauthorized',
    }) as unknown as typeof fetch;
    const client = new MpesaClient(baseConfig());
    await expect(client.getAccessToken()).rejects.toThrow(/OAuth failed/);

    MpesaClient.clearTokenCache();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({}),
    }) as unknown as typeof fetch;
    await expect(client.getAccessToken()).rejects.toThrow(/missing access_token/);
  });

  it('stkPush surfaces non-JSON and Daraja error responses', async () => {
    const client = new MpesaClient(baseConfig());
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({ access_token: 'tok', expires_in: 3600 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'not-json',
      }) as unknown as typeof fetch;

    await expect(
      client.stkPush({
        phone: '0712345678',
        amount: 1,
        accountReference: 'A',
        description: 'D',
      }),
    ).rejects.toThrow(/non-JSON/);

    MpesaClient.clearTokenCache();
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({ access_token: 'tok2', expires_in: 100 }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () =>
          JSON.stringify({
            ResponseCode: '1',
            errorMessage: 'Insufficient funds',
          }),
      }) as unknown as typeof fetch;

    await expect(
      client.stkPush({
        phone: '0712345678',
        amount: 1,
        accountReference: 'A',
        description: 'D',
      }),
    ).rejects.toThrow(/Insufficient funds/);
  });

  it('stkQuery parses JSON and rejects non-JSON', async () => {
    const client = new MpesaClient(baseConfig());
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({ access_token: 'tok', expires_in: 3600 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            ResponseCode: '0',
            ResponseDescription: 'ok',
            ResultCode: '0',
          }),
      }) as unknown as typeof fetch;

    const q = await client.stkQuery('checkout-1');
    expect(q.ResultCode).toBe('0');

    MpesaClient.clearTokenCache();
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({ access_token: 'tok3', expires_in: 3600 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '<html>',
      }) as unknown as typeof fetch;

    await expect(client.stkQuery('checkout-2')).rejects.toThrow(/non-JSON/);
  });
});
