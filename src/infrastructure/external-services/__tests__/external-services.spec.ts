import { Readable } from 'node:stream';
import { Test } from '@nestjs/testing';
import { RetryExecutor, RetryPolicy } from '../../../platform/reliability';
import type { StorageProvider } from '../../../platform/storage';
import { CircuitBreakerOpenError } from '../../../platform/reliability';
import { HttpClientService } from '../http/http-client.service';
import { OutboundUrlPolicy } from '../http/outbound-url.policy';
import { SmtpEmailProvider } from '../smtp/smtp-email.provider';
import { createSmtpTransport } from '../smtp/smtp-transport.factory';
import { HttpSmsProvider } from '../sms/http-sms.provider';
import { CloudStorageClient } from '../cloud-storage/cloud-storage.client';
import { MissingDriverError } from '../../optional-driver';
import {
  EXTERNAL_HTTP_CLIENT,
  ExternalServicesModule,
} from '../external-services.module';

const immediateRetry = (): {
  executor: RetryExecutor;
  policy: RetryPolicy;
} => ({
  executor: new RetryExecutor(async () => undefined),
  policy: new RetryPolicy({ maxAttempts: 2, delayMs: 0 }),
});

/** Hermetic SSRF policy: DNS always returns a public address. */
const testUrlPolicy = new OutboundUrlPolicy({
  resolver: {
    resolve: async () => [{ address: '93.184.216.34', family: 4 }],
  },
});

describe('external services', () => {
  it('registers the hardened HTTP client in Nest', async () => {
    const module = await Test.createTestingModule({
      imports: [ExternalServicesModule.register()],
    }).compile();
    expect(module.get(EXTERNAL_HTTP_CLIENT)).toBeInstanceOf(HttpClientService);
    // Cover constructor default options branch
    expect(new HttpClientService()).toBeInstanceOf(HttpClientService);
  });

  it('performs, traces and redacts HTTP calls', async () => {
    const logs: string[] = [];
    const logger = {
      debug: jest.fn(),
      info: jest.fn((_message: string, context?: unknown) =>
        logs.push(JSON.stringify(context)),
      ),
      warn: jest.fn(),
      error: jest.fn(),
    };
    const span = {
      context: { traceId: 't', spanId: 's' },
      setAttribute: jest.fn().mockReturnThis(),
      recordException: jest.fn(),
      end: jest.fn(),
    };
    const client = new HttpClientService({
      fetch: jest.fn(async () => ({
        status: 200,
        text: async () => 'ok',
      })),
      logger,
      tracer: { startSpan: jest.fn(() => span) },
      urlPolicy: testUrlPolicy,
    });
    await expect(
      client.request({
        url: 'https://example.test/?page=1&token=hidden',
        method: 'POST',
        headers: { authorization: 'Bearer hidden' },
        body: '{}',
      }),
    ).resolves.toEqual({ status: 200, body: 'ok' });
    expect(logs.join('')).not.toContain('hidden');
    expect(span.end).toHaveBeenCalled();
  });

  it('uses global fetch defaults, redacts headers, and rejects invalid URLs', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async () => new Response('global', { status: 200 }));
    const logs: string[] = [];
    const client = new HttpClientService({
      logger: {
        debug: jest.fn(),
        info: jest.fn((_message, context) =>
          logs.push(JSON.stringify(context)),
        ),
        warn: jest.fn(),
        error: jest.fn(),
      },
      defaultTimeoutMs: 50,
      retryPolicy: new RetryPolicy({ maxAttempts: 1 }),
      urlPolicy: testUrlPolicy,
    });
    await expect(
      client.request({
        url: 'https://example.test',
        method: 'POST',
        headers: { 'x-safe': 'visible', cookie: 'secret' },
        body: '',
      }),
    ).resolves.toEqual({ status: 200, body: 'global' });
    expect(logs.join('')).toContain('visible');
    expect(logs.join('')).not.toContain('secret');
    await expect(
      client.request({
        url: 'not a valid URL',
        method: 'POST',
        headers: {},
        body: '',
      }),
    ).rejects.toThrow('Invalid outbound URL');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await expect(
      new HttpClientService({ urlPolicy: testUrlPolicy }).request({
        url: 'https://example.test',
        method: 'POST',
        headers: {},
        body: '',
      }),
    ).resolves.toEqual({ status: 200, body: 'global' });
    fetchSpy.mockRestore();
  });

  it('retries failures, maps non-2xx, exhausts, times out, and short-circuits', async () => {
    const retry = immediateRetry();
    const fetcher = jest
      .fn()
      .mockRejectedValueOnce(new Error('token=secret'))
      .mockResolvedValueOnce({ status: 204, text: async () => '' });
    const client = new HttpClientService({
      fetch: fetcher,
      retryExecutor: retry.executor,
      retryPolicy: retry.policy,
      urlPolicy: testUrlPolicy,
    });
    await expect(
      client.request({
        url: 'https://example.test',
        method: 'POST',
        headers: {},
        body: '',
      }),
    ).resolves.toEqual({ status: 204 });
    expect(fetcher).toHaveBeenCalledTimes(2);

    const bad = new HttpClientService({
      fetch: async () => ({ status: 503, text: async () => 'provider secret' }),
      retryExecutor: retry.executor,
      retryPolicy: new RetryPolicy({ maxAttempts: 1 }),
      urlPolicy: testUrlPolicy,
    });
    await expect(
      bad.request({
        url: 'https://example.test',
        method: 'POST',
        headers: {},
        body: '',
      }),
    ).rejects.toThrow('HTTP 503');

    const open = new HttpClientService({
      fetch: jest.fn(),
      urlPolicy: testUrlPolicy,
      circuitBreaker: {
        execute: async () => {
          throw new CircuitBreakerOpenError();
        },
      },
    });
    await expect(
      open.request({
        url: 'https://example.test',
        method: 'POST',
        headers: {},
        body: '',
      }),
    ).rejects.toBeInstanceOf(CircuitBreakerOpenError);

    const timeout = new HttpClientService({
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () =>
            reject(new Error('aborted')),
          );
        }),
      timer: {
        set: (callback) => {
          queueMicrotask(callback);
          return 1;
        },
        clear: jest.fn(),
      },
      retryPolicy: new RetryPolicy({ maxAttempts: 1 }),
      urlPolicy: testUrlPolicy,
    });
    await expect(
      timeout.request({
        url: 'https://example.test',
        method: 'POST',
        headers: {},
        body: '',
      }),
    ).rejects.toThrow('timed out');
  });

  it('sends SMTP with retries and never exposes transport secrets', async () => {
    const retry = immediateRetry();
    const transport = {
      sendMail: jest
        .fn()
        .mockRejectedValueOnce(new Error('password=hunter2'))
        .mockResolvedValueOnce({
          messageId: 'm1',
          accepted: ['a@example.test'],
        }),
    };
    const provider = new SmtpEmailProvider(transport, {
      retryExecutor: retry.executor,
      retryPolicy: retry.policy,
    });
    await expect(
      provider.send({
        to: ['a@example.test'],
        from: 'b@example.test',
        subject: 'Hello',
        text: 'Body',
      }),
    ).resolves.toMatchObject({
      provider: 'smtp',
      messageId: 'm1',
      accepted: true,
      attempts: 2,
    });
    expect(() =>
      createSmtpTransport({}, () => {
        throw new Error('missing');
      }),
    ).toThrow(MissingDriverError);
  });

  it('covers SMTP optional fields, rejection, and timeout', async () => {
    const logger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    const acceptedEmpty = new SmtpEmailProvider(
      {
        sendMail: jest.fn(async () => ({
          messageId: 'empty',
          accepted: [],
        })),
      },
      { logger, retryPolicy: new RetryPolicy({ maxAttempts: 1 }) },
    );
    await expect(
      acceptedEmpty.send({
        to: ['a@example.test'],
        from: 'b@example.test',
        subject: 'No body',
        html: '<p>body</p>',
      }),
    ).resolves.toMatchObject({ accepted: false });

    const acceptedUnknown = new SmtpEmailProvider({
      sendMail: jest.fn(async () => ({ messageId: 'unknown' })),
    });
    await expect(
      acceptedUnknown.send({
        to: [],
        from: 'b@example.test',
        subject: 'No recipients',
      }),
    ).resolves.toMatchObject({ accepted: true });

    const timedOut = new SmtpEmailProvider(
      {
        sendMail: jest.fn(() => new Promise(() => undefined)),
      },
      {
        retryPolicy: new RetryPolicy({ maxAttempts: 1 }),
        timeoutMs: 1,
        timer: {
          set: (callback) => {
            queueMicrotask(callback);
            return 1;
          },
          clear: jest.fn(),
        },
      },
    );
    await expect(
      timedOut.send({
        to: ['a@example.test'],
        from: 'b@example.test',
        subject: 'Timeout',
      }),
    ).rejects.toThrow('SMTP delivery failed');
  });

  it('sends SMS through the hardened HTTP port', async () => {
    const request = jest.fn(async () => ({
      status: 202,
      body: JSON.stringify({ messageId: 'sms-1' }),
    }));
    const provider = new HttpSmsProvider({
      endpoint: 'https://sms.example.test',
      client: { request },
      token: 'secret',
    });
    await expect(
      provider.send({ to: '+100000000', body: 'hello' }),
    ).resolves.toEqual({
      provider: 'http-sms',
      messageId: 'sms-1',
      accepted: true,
    });
  });

  it.each([
    [undefined, ''],
    ['', ''],
    ['plain-id', 'plain-id'],
    ['{"other":"value"}', '{"other":"value"}'],
    ['null', 'null'],
    ['{"messageId":1}', '{"messageId":1}'],
  ])('maps SMS response body %#', async (body, expected) => {
    const request = jest.fn(async () => ({ status: 200, body }));
    const provider = new HttpSmsProvider({
      endpoint: 'https://sms.test',
      client: { request },
      name: 'custom',
      timeoutMs: 5,
    });
    await expect(provider.send({ to: '1', body: 'x' })).resolves.toEqual({
      provider: 'custom',
      messageId: expected,
      accepted: true,
    });
  });

  it.each([199, 300])('rejects SMS HTTP status %s', async (status) => {
    const provider = new HttpSmsProvider({
      endpoint: 'https://sms.test',
      client: { request: jest.fn(async () => ({ status })) },
    });
    await expect(provider.send({ to: '1', body: 'x' })).rejects.toThrow(
      `HTTP ${status}`,
    );
  });

  it('wraps storage with retry and recovers after failure', async () => {
    const retry = immediateRetry();
    const get = jest
      .fn()
      .mockRejectedValueOnce(new Error('credential=secret'))
      .mockResolvedValue(Buffer.from('ok'));
    const provider: StorageProvider = {
      name: 'fake',
      put: async (key, body) => ({ key, size: body.length }),
      get,
      getStream: async () => Readable.from('ok'),
      delete: async () => true,
      exists: async () => true,
      stat: async (key) => ({ key, size: 2 }),
      signedUrl: async () => 'signed',
    };
    const client = new CloudStorageClient(provider, {
      retryExecutor: retry.executor,
      retryPolicy: retry.policy,
    });
    await expect(client.get('x')).resolves.toEqual(Buffer.from('ok'));
    await expect(client.put('x', Buffer.from('x'))).resolves.toMatchObject({
      size: 1,
    });
    await expect(client.getStream('x')).resolves.toBeInstanceOf(Readable);
    await expect(client.delete('x')).resolves.toBe(true);
    await expect(client.exists('x')).resolves.toBe(true);
    await expect(client.stat('x')).resolves.toMatchObject({ size: 2 });
    await expect(client.signedUrl('x', { expiresInSeconds: 1 })).resolves.toBe(
      'signed',
    );

    const defaults = new CloudStorageClient(provider);
    await expect(defaults.get('x')).resolves.toEqual(Buffer.from('ok'));
  });

  it('times out storage operations and records tracing hooks', async () => {
    const span = {
      context: { traceId: 'trace', spanId: 'span' },
      setAttribute: jest.fn().mockReturnThis(),
      recordException: jest.fn(),
      end: jest.fn(),
    };
    const logger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    const provider: StorageProvider = {
      name: 'pending',
      put: jest.fn(() => new Promise(() => undefined)),
      get: jest.fn(() => new Promise(() => undefined)),
      getStream: jest.fn(async () => Readable.from('')),
      delete: jest.fn(async () => false),
      exists: jest.fn(async () => false),
      stat: jest.fn(async (key) => ({ key, size: 0 })),
      signedUrl: jest.fn(async () => ''),
    };
    const client = new CloudStorageClient(provider, {
      logger,
      tracer: { startSpan: jest.fn(() => span) },
      retryPolicy: new RetryPolicy({ maxAttempts: 1 }),
      timer: {
        set: (callback) => {
          queueMicrotask(callback);
          return 1;
        },
        clear: jest.fn(),
      },
      timeoutMs: 1,
    });
    await expect(client.get('x')).rejects.toThrow(
      'External storage operation failed',
    );
    expect(span.recordException).toHaveBeenCalled();
    expect(span.end).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });
});
