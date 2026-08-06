import {
  type VersioningOptions,
  type VersionRequest,
  type VersioningStrategy,
} from './versioning.types';

export class UnsupportedApiVersionError extends Error {
  public constructor(public readonly version: string) {
    super(`Unsupported API version: ${version}`);
    this.name = 'UnsupportedApiVersionError';
  }
}

export class VersionResolver {
  private readonly strategy: VersioningStrategy;
  private readonly headerName: string;

  public constructor(private readonly options: VersioningOptions) {
    if (
      options.supportedVersions.length === 0 ||
      !options.supportedVersions.includes(options.defaultVersion)
    ) {
      throw new Error('Default version must be included in supported versions');
    }
    this.strategy = options.strategy ?? 'url-or-header';
    this.headerName = (options.headerName ?? 'Accept-Version').toLowerCase();
  }

  public resolve(request: VersionRequest): string {
    const urlVersion = this.fromUrl(request.url);
    const headerVersion = this.fromHeaders(request.headers);
    const version =
      this.strategy === 'url'
        ? urlVersion
        : this.strategy === 'header'
          ? headerVersion
          : (urlVersion ?? headerVersion);
    const resolved = version ?? this.options.defaultVersion;
    if (!this.options.supportedVersions.includes(resolved)) {
      throw new UnsupportedApiVersionError(resolved);
    }
    return resolved;
  }

  private fromUrl(url: string): string | undefined {
    return /^\/api\/v([^/?#]+)(?:\/|$)/i.exec(url)?.[1];
  }

  private fromHeaders(headers: VersionRequest['headers']): string | undefined {
    if (!headers) return undefined;
    const entry = Object.entries(headers).find(
      ([name]) => name.toLowerCase() === this.headerName,
    )?.[1];
    return typeof entry === 'string' ? entry : entry?.[0];
  }
}
