export type VersioningStrategy = 'url' | 'header' | 'url-or-header';

export interface VersioningOptions {
  readonly defaultVersion: string;
  readonly supportedVersions: readonly string[];
  readonly strategy?: VersioningStrategy;
  readonly headerName?: string;
}

export interface VersionRequest {
  readonly url: string;
  readonly headers?: Readonly<
    Record<string, string | readonly string[] | undefined>
  >;
}
