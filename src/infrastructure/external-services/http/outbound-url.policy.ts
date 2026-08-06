import { BlockList, isIP } from 'node:net';
import { promises as dns } from 'node:dns';

/**
 * Production-safe outbound URL policy to mitigate SSRF.
 *
 * Defaults (production): HTTPS-only, no URL credentials, no private /
 * loopback / link-local / CGNAT / multicast / reserved destinations,
 * DNS results re-checked after resolution, optional exact host allowlist.
 */
export interface DnsLookupAddress {
  readonly address: string;
  readonly family: 4 | 6;
}

export interface DnsResolver {
  resolve(hostname: string): Promise<readonly DnsLookupAddress[]>;
}

export interface OutboundUrlPolicyOptions {
  /** When true, http:// is allowed. Production default: false (HTTPS only). */
  readonly allowHttp?: boolean;
  /** Exact hostname allowlist (case-insensitive). Empty/undefined = no allowlist. */
  readonly allowedHosts?: readonly string[];
  /** Injected DNS resolver for hermetic tests. Defaults to system DNS. */
  readonly resolver?: DnsResolver;
}

export class OutboundUrlPolicyError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'OutboundUrlPolicyError';
  }
}

const blockedDestinations = new BlockList();
// IPv4: this-network, RFC1918, loopback, link-local, CGNAT, multicast, reserved
blockedDestinations.addSubnet('0.0.0.0', 8, 'ipv4');
blockedDestinations.addSubnet('10.0.0.0', 8, 'ipv4');
blockedDestinations.addSubnet('127.0.0.0', 8, 'ipv4');
blockedDestinations.addSubnet('169.254.0.0', 16, 'ipv4');
blockedDestinations.addSubnet('172.16.0.0', 12, 'ipv4');
blockedDestinations.addSubnet('192.168.0.0', 16, 'ipv4');
blockedDestinations.addSubnet('100.64.0.0', 10, 'ipv4');
blockedDestinations.addSubnet('224.0.0.0', 4, 'ipv4');
blockedDestinations.addSubnet('240.0.0.0', 4, 'ipv4');
// IPv6: loopback, link-local, ULA, multicast
blockedDestinations.addAddress('::1', 'ipv6');
blockedDestinations.addSubnet('fe80::', 10, 'ipv6');
blockedDestinations.addSubnet('fc00::', 7, 'ipv6');
blockedDestinations.addSubnet('ff00::', 8, 'ipv6');

export const systemDnsResolver: DnsResolver = {
  async resolve(hostname: string): Promise<readonly DnsLookupAddress[]> {
    const results = await dns.lookup(hostname, { all: true, verbatim: true });
    return results.map((entry) => ({
      address: entry.address,
      family: entry.family as 4 | 6,
    }));
  },
};

export class OutboundUrlPolicy {
  private readonly allowHttp: boolean;
  private readonly allowedHosts: ReadonlySet<string> | undefined;
  private readonly resolver: DnsResolver;

  public constructor(options: OutboundUrlPolicyOptions = {}) {
    this.allowHttp = options.allowHttp === true;
    this.allowedHosts =
      options.allowedHosts === undefined || options.allowedHosts.length === 0
        ? undefined
        : new Set(options.allowedHosts.map((host) => host.toLowerCase()));
    this.resolver = options.resolver ?? systemDnsResolver;
  }

  /**
   * Validates that `rawUrl` is safe for an outbound request.
   * Throws {@link OutboundUrlPolicyError} on any policy violation.
   */
  public async assertSafe(rawUrl: string): Promise<URL> {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new OutboundUrlPolicyError('Invalid outbound URL');
    }

    if (parsed.username !== '' || parsed.password !== '') {
      throw new OutboundUrlPolicyError('URL credentials are not allowed');
    }

    const protocol = parsed.protocol.toLowerCase();
    if (protocol === 'https:') {
      // allowed
    } else if (protocol === 'http:') {
      if (!this.allowHttp) {
        throw new OutboundUrlPolicyError('Only HTTPS URLs are allowed');
      }
    } else {
      throw new OutboundUrlPolicyError('Unsupported URL protocol');
    }

    const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (hostname === '' || hostname === 'localhost') {
      throw new OutboundUrlPolicyError(
        'Localhost destinations are not allowed',
      );
    }

    if (this.allowedHosts !== undefined && !this.allowedHosts.has(hostname)) {
      throw new OutboundUrlPolicyError('Host is not in the allowlist');
    }

    const literalFamily = isIP(hostname);
    if (literalFamily !== 0) {
      this.assertPublicAddress(hostname, literalFamily as 4 | 6);
      return parsed;
    }

    let addresses: readonly DnsLookupAddress[];
    try {
      addresses = await this.resolver.resolve(hostname);
    } catch {
      throw new OutboundUrlPolicyError('DNS resolution failed');
    }

    if (addresses.length === 0) {
      throw new OutboundUrlPolicyError('DNS resolution returned no addresses');
    }

    for (const entry of addresses) {
      this.assertPublicAddress(entry.address, entry.family);
    }

    return parsed;
  }

  private assertPublicAddress(address: string, family: 4 | 6): void {
    const unmapped = unwrapIpv4Mapped(address);
    if (unmapped !== undefined) {
      if (blockedDestinations.check(unmapped, 'ipv4')) {
        throw new OutboundUrlPolicyError(
          'Private or reserved destination is not allowed',
        );
      }
      return;
    }

    const type = family === 6 ? 'ipv6' : 'ipv4';
    if (blockedDestinations.check(address, type)) {
      throw new OutboundUrlPolicyError(
        'Private or reserved destination is not allowed',
      );
    }
  }
}

/** Default production policy: HTTPS-only, system DNS, no allowlist. */
export const productionOutboundUrlPolicy = new OutboundUrlPolicy();

function unwrapIpv4Mapped(address: string): string | undefined {
  const lower = address.toLowerCase();
  const dotted = lower.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) {
    return dotted[1];
  }
  const hex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hex) {
    return undefined;
  }
  const high = Number.parseInt(hex[1], 16);
  const low = Number.parseInt(hex[2], 16);
  return `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
}
