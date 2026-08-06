import { ValidationException } from '../../core';
import { TenantRegistry } from './tenant-registry';
import type {
  TenantConfiguration,
  TenantRequestLike,
  TenantResolverOptions,
} from './tenancy.types';

type HeaderMap = NonNullable<TenantRequestLike['headers']>;
type HeaderRaw = HeaderMap[string];

export class TenantResolver {
  public constructor(
    private readonly registry: TenantRegistry,
    private readonly options: Readonly<TenantResolverOptions>,
  ) {}

  public resolve(
    request: Readonly<TenantRequestLike>,
  ): Readonly<TenantConfiguration> {
    const tenantId = this.resolveId(request);
    return this.registry.get(tenantId);
  }

  private resolveId(request: Readonly<TenantRequestLike>): string {
    switch (this.options.strategy) {
      case 'header':
        return this.fromHeader(request);
      case 'subdomain':
        return this.fromSubdomain(request);
      case 'explicit':
        return this.requireId(
          request.explicitTenantId ?? request.tenantId,
          'explicit tenant id',
        );
    }
  }

  private fromHeader(request: Readonly<TenantRequestLike>): string {
    const expected = (this.options.headerName ?? 'x-tenant-id').toLowerCase();
    const headers = request.headers ?? {};
    const entry = Object.entries(headers).find(
      ([name]) => name.toLowerCase() === expected,
    );
    return this.requireId(this.headerValue(entry?.[1]), `header '${expected}'`);
  }

  private fromSubdomain(request: Readonly<TenantRequestLike>): string {
    const hostHeader = this.headerValue(request.headers?.host);
    const hostnameSource = request.hostname ?? request.host ?? hostHeader;
    const hostname =
      typeof hostnameSource === 'string'
        ? hostnameSource.split(':')[0]?.toLowerCase()
        : undefined;
    const baseDomain = this.options.baseDomain?.toLowerCase();
    if (
      !hostname ||
      (baseDomain !== undefined && !hostname.endsWith(`.${baseDomain}`))
    ) {
      throw new ValidationException('A valid tenant subdomain is required');
    }
    return this.requireId(hostname.split('.')[0], 'tenant subdomain');
  }

  private headerValue(raw: HeaderRaw): string | undefined {
    if (typeof raw === 'string') {
      return raw;
    }
    if (isReadonlyStringArray(raw)) {
      return raw[0];
    }
    return undefined;
  }

  private requireId(candidate: string | undefined, source: string): string {
    const value = candidate?.trim();
    if (!value) {
      throw new ValidationException(`Missing ${source}`);
    }
    return value;
  }
}

function isReadonlyStringArray(
  value: HeaderRaw,
): value is ReadonlyArray<string> {
  return (
    Array.isArray(value) && (value.length === 0 || typeof value[0] === 'string')
  );
}
