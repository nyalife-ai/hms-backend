/**
 * AfricasTalkingSmsAdapter + config loader.
 */

import { AfricasTalkingSmsAdapter } from '../adapters/africastalking-sms.adapter';
import {
  isAfricasTalkingConfigured,
  loadAfricasTalkingOptions,
} from '../adapters/africastalking.config';

describe('loadAfricasTalkingOptions', () => {
  const prevUser = process.env.AFRICASTALKING_USERNAME;
  const prevKey = process.env.AFRICASTALKING_API_KEY;
  const prevFrom = process.env.AFRICASTALKING_FROM;
  const prevEnv = process.env.AFRICASTALKING_ENV;

  afterEach(() => {
    const restore = (k: string, v: string | undefined) => {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    };
    restore('AFRICASTALKING_USERNAME', prevUser);
    restore('AFRICASTALKING_API_KEY', prevKey);
    restore('AFRICASTALKING_FROM', prevFrom);
    restore('AFRICASTALKING_ENV', prevEnv);
  });

  it('returns null when credentials are missing', () => {
    delete process.env.AFRICASTALKING_USERNAME;
    delete process.env.AFRICASTALKING_API_KEY;
    expect(loadAfricasTalkingOptions()).toBeNull();
    expect(isAfricasTalkingConfigured()).toBe(false);
  });

  it('loads sandbox options from env', () => {
    process.env.AFRICASTALKING_USERNAME = 'sandbox';
    process.env.AFRICASTALKING_API_KEY = 'key';
    process.env.AFRICASTALKING_FROM = 'NYALIFE';
    process.env.AFRICASTALKING_ENV = 'sandbox';
    const opts = loadAfricasTalkingOptions();
    expect(opts).toEqual(
      expect.objectContaining({
        username: 'sandbox',
        apiKey: 'key',
        from: 'NYALIFE',
        env: 'sandbox',
      }),
    );
    expect(isAfricasTalkingConfigured()).toBe(true);
  });

  it('maps production env', () => {
    process.env.AFRICASTALKING_USERNAME = 'u';
    process.env.AFRICASTALKING_API_KEY = 'k';
    process.env.AFRICASTALKING_ENV = 'production';
    expect(loadAfricasTalkingOptions()?.env).toBe('production');
  });
});

describe('AfricasTalkingSmsAdapter', () => {
  it('requires username and apiKey', () => {
    expect(
      () => new AfricasTalkingSmsAdapter({ username: '', apiKey: 'k' }),
    ).toThrow(/username/);
    expect(
      () => new AfricasTalkingSmsAdapter({ username: 'u', apiKey: '' }),
    ).toThrow(/apiKey/);
  });

  it('sends via injectable client and normalizes KE numbers', async () => {
    const client = {
      request: jest.fn().mockResolvedValue({
        status: 201,
        body: JSON.stringify({
          SMSMessageData: {
            Recipients: [
              { messageId: 'ATX1', statusCode: 101, status: 'Success' },
            ],
          },
        }),
      }),
    };
    const adapter = new AfricasTalkingSmsAdapter({
      username: 'sandbox',
      apiKey: 'key',
      from: 'NYA',
      env: 'sandbox',
      client: client as never,
    });

    const result = await adapter.send({
      to: '0712345678',
      body: 'Hello patient',
    });

    expect(result).toEqual({
      provider: 'africastalking',
      messageId: 'ATX1',
      accepted: true,
    });
    expect(client.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.sandbox.africastalking.com/version1/messaging',
        method: 'POST',
        headers: expect.objectContaining({ apiKey: 'key' }),
      }),
    );
    const body = client.request.mock.calls[0][0].body as string;
    expect(body).toContain('to=%2B254712345678');
    expect(body).toContain('message=Hello+patient');
  });

  it('uses production base URL and rejects empty body/recipients', async () => {
    const client = {
      request: jest.fn().mockResolvedValue({
        status: 200,
        body: JSON.stringify({
          SMSMessageData: {
            Recipients: [{ messageId: 'P1', statusCode: 100 }],
          },
        }),
      }),
    };
    const adapter = new AfricasTalkingSmsAdapter({
      username: 'prod',
      apiKey: 'key',
      env: 'production',
      client: client as never,
    });

    await expect(adapter.send({ to: '', body: 'x' })).rejects.toThrow(
      /recipient phone/,
    );
    await expect(
      adapter.send({ to: '+254700000000', body: '  ' }),
    ).rejects.toThrow(/message body/);

    await adapter.send({ to: '+254700000000', body: 'Ok', from: 'HMS' });
    expect(client.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.africastalking.com/version1/messaging',
      }),
    );
  });

  it('throws on HTTP errors and AT rejection payloads', async () => {
    const client = {
      request: jest
        .fn()
        .mockResolvedValueOnce({ status: 500, body: 'boom' })
        .mockResolvedValueOnce({
          status: 200,
          body: JSON.stringify({
            SMSMessageData: {
              Recipients: [{ statusCode: 403, status: 'Failed' }],
            },
          }),
        }),
    };
    const adapter = new AfricasTalkingSmsAdapter({
      username: 'u',
      apiKey: 'k',
      client: client as never,
    });

    await expect(
      adapter.send({ to: '+254711111111', body: 'Hi' }),
    ).rejects.toThrow(/HTTP 500/);
    await expect(
      adapter.send({ to: '+254711111111', body: 'Hi' }),
    ).rejects.toThrow(/rejected SMS/);
  });
});
