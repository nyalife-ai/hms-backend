import {
  OutboundUrlPolicy,
  OutboundUrlPolicyError,
} from '../outbound-url.policy';
import { ExternalHttpError, HttpClientService } from '../http-client.service';
import { RetryPolicy } from '../../../../platform/reliability';
import type { DnsResolver } from '../outbound-url.policy';

const publicResolver: DnsResolver = {
  resolve: async () => [{ address: '93.184.216.34', family: 4 }],
};

const privateResolver: DnsResolver = {
  resolve: async () => [{ address: '10.0.0.1', family: 4 }],
};

const allowPublic = new OutboundUrlPolicy({ resolver: publicResolver });

describe('OutboundUrlPolicy', () => {
  it('allows a public HTTPS address after DNS resolves publicly', async () => {
    const url = await allowPublic.assertSafe('https://example.test/path');
    expect(url.hostname).toBe('example.test');
  });

  it('rejects an invalid URL', async () => {
    await expect(allowPublic.assertSafe('not a url')).rejects.toBeInstanceOf(
      OutboundUrlPolicyError,
    );
  });

  it('rejects HTTP by default (HTTPS-only)', async () => {
    await expect(allowPublic.assertSafe('http://example.test')).rejects.toThrow(
      'Only HTTPS URLs are allowed',
    );
  });

  it('rejects URL credentials', async () => {
    await expect(
      allowPublic.assertSafe('https://user:pass@example.test/'),
    ).rejects.toThrow('URL credentials are not allowed');
  });

  it('rejects localhost', async () => {
    await expect(
      allowPublic.assertSafe('https://localhost/admin'),
    ).rejects.toThrow('Localhost destinations are not allowed');
  });

  it.each([
    ['https://127.0.0.1/', 'loopback'],
    ['https://10.1.2.3/', 'RFC1918'],
    ['https://172.16.5.5/', 'RFC1918'],
    ['https://192.168.1.1/', 'RFC1918'],
    ['https://169.254.1.1/', 'link-local'],
    ['https://100.64.0.1/', 'CGNAT'],
    ['https://224.0.0.1/', 'multicast'],
    ['https://240.0.0.1/', 'reserved'],
  ])('rejects IPv4 private/literal %s (%s)', async (url) => {
    await expect(allowPublic.assertSafe(url)).rejects.toThrow(
      'Private or reserved destination is not allowed',
    );
  });

  it.each([
    ['https://[::1]/', 'loopback'],
    ['https://[fe80::1]/', 'link-local'],
    ['https://[fc00::1]/', 'ULA'],
    ['https://[fd12:3456:789a::1]/', 'ULA'],
    ['https://[::ffff:10.0.0.1]/', 'mapped private'],
    ['https://[::ffff:192.168.0.1]/', 'mapped private'],
  ])('rejects IPv6 private/literal %s (%s)', async (url) => {
    await expect(allowPublic.assertSafe(url)).rejects.toThrow(
      'Private or reserved destination is not allowed',
    );
  });

  it('rejects DNS results that resolve to a private address', async () => {
    const policy = new OutboundUrlPolicy({ resolver: privateResolver });
    await expect(policy.assertSafe('https://evil.internal')).rejects.toThrow(
      'Private or reserved destination is not allowed',
    );
  });

  it('enforces an optional exact host allowlist', async () => {
    const policy = new OutboundUrlPolicy({
      resolver: publicResolver,
      allowedHosts: ['api.partner.test'],
    });
    await expect(
      policy.assertSafe('https://api.partner.test/v1'),
    ).resolves.toBeInstanceOf(URL);
    await expect(
      policy.assertSafe('https://other.partner.test/v1'),
    ).rejects.toThrow('Host is not in the allowlist');
  });

  it('allows HTTP only when explicitly enabled', async () => {
    const policy = new OutboundUrlPolicy({
      allowHttp: true,
      resolver: publicResolver,
    });
    await expect(
      policy.assertSafe('http://example.test'),
    ).resolves.toBeInstanceOf(URL);
  });

  it('rejects unsupported protocols', async () => {
    await expect(allowPublic.assertSafe('ftp://example.test')).rejects.toThrow(
      'Unsupported URL protocol',
    );
  });

  it('rejects when DNS resolution fails or returns no addresses', async () => {
    const failing = new OutboundUrlPolicy({
      resolver: {
        resolve: async () => {
          throw new Error('NXDOMAIN');
        },
      },
    });
    await expect(failing.assertSafe('https://missing.test')).rejects.toThrow(
      'DNS resolution failed',
    );

    const empty = new OutboundUrlPolicy({
      resolver: { resolve: async () => [] },
    });
    await expect(empty.assertSafe('https://empty.test')).rejects.toThrow(
      'DNS resolution returned no addresses',
    );
  });

  it('rejects IPv4-mapped addresses returned by DNS (dotted and hex)', async () => {
    const dottedMapped = new OutboundUrlPolicy({
      resolver: {
        resolve: async () => [{ address: '::ffff:10.0.0.1', family: 6 }],
      },
    });
    await expect(
      dottedMapped.assertSafe('https://mapped-private.test'),
    ).rejects.toThrow('Private or reserved destination is not allowed');

    const publicMapped = new OutboundUrlPolicy({
      resolver: {
        resolve: async () => [{ address: '::ffff:93.184.216.34', family: 6 }],
      },
    });
    await expect(
      publicMapped.assertSafe('https://mapped-public.test'),
    ).resolves.toBeInstanceOf(URL);
  });

  it('allows a public IPv4 literal without DNS', async () => {
    await expect(
      allowPublic.assertSafe('https://93.184.216.34/'),
    ).resolves.toBeInstanceOf(URL);
  });

  it('uses the system DNS resolver when none is injected', async () => {
    const dns = await import('node:dns');
    const lookup = jest
      .spyOn(dns.promises, 'lookup')
      .mockResolvedValue([
        { address: '93.184.216.34', family: 4 },
      ] as unknown as Awaited<ReturnType<typeof dns.promises.lookup>>);

    const policy = new OutboundUrlPolicy();
    await expect(
      policy.assertSafe('https://example.test'),
    ).resolves.toBeInstanceOf(URL);
    expect(lookup).toHaveBeenCalledWith('example.test', {
      all: true,
      verbatim: true,
    });
    lookup.mockRestore();
  });
});

describe('HttpClientService SSRF hardening', () => {
  it('passes redirect: error to the fetch port', async () => {
    const fetcher = jest.fn(async () => ({
      status: 200,
      text: async () => 'ok',
    }));
    const client = new HttpClientService({
      fetch: fetcher,
      urlPolicy: allowPublic,
      retryPolicy: new RetryPolicy({ maxAttempts: 1 }),
    });
    await client.request({
      url: 'https://example.test',
      method: 'GET',
      headers: {},
      body: '',
    });
    expect(fetcher).toHaveBeenCalledWith(
      'https://example.test',
      expect.objectContaining({ redirect: 'error' }),
    );
  });

  it('never calls fetch when the outbound URL policy fails', async () => {
    const fetcher = jest.fn();
    const client = new HttpClientService({
      fetch: fetcher,
      urlPolicy: allowPublic,
      retryPolicy: new RetryPolicy({ maxAttempts: 3, delayMs: 0 }),
    });
    await expect(
      client.request({
        url: 'https://127.0.0.1/secret',
        method: 'GET',
        headers: {},
        body: '',
      }),
    ).rejects.toBeInstanceOf(ExternalHttpError);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects credentialed URLs before fetch', async () => {
    const fetcher = jest.fn();
    const client = new HttpClientService({
      fetch: fetcher,
      urlPolicy: allowPublic,
    });
    await expect(
      client.request({
        url: 'https://user:password@example.test/',
        method: 'POST',
        headers: {},
        body: '',
      }),
    ).rejects.toThrow('URL credentials are not allowed');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('maps unexpected policy errors to ExternalHttpError without calling fetch', async () => {
    const fetcher = jest.fn();
    const client = new HttpClientService({
      fetch: fetcher,
      urlPolicy: {
        assertSafe: async () => {
          throw new Error('boom');
        },
      } as unknown as OutboundUrlPolicy,
    });
    await expect(
      client.request({
        url: 'https://example.test',
        method: 'GET',
        headers: {},
        body: '',
      }),
    ).rejects.toThrow('Outbound URL policy check failed');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('redacts invalid URLs in logs when a permissive policy allows them through', async () => {
    const logs: string[] = [];
    const client = new HttpClientService({
      fetch: jest.fn(async () => ({ status: 200, text: async () => 'ok' })),
      urlPolicy: {
        assertSafe: async () => new URL('https://example.test'),
      } as unknown as OutboundUrlPolicy,
      logger: {
        debug: jest.fn(),
        info: jest.fn((_message, context) =>
          logs.push(JSON.stringify(context)),
        ),
        warn: jest.fn(),
        error: jest.fn(),
      },
      retryPolicy: new RetryPolicy({ maxAttempts: 1 }),
    });
    await client.request({
      url: 'totally not a url',
      method: 'GET',
      headers: {},
      body: '',
    });
    expect(logs.join('')).toContain('[invalid-url]');
  });
});
