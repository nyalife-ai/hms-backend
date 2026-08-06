export type { SecretProvider } from '../../architecture/secret-provider.interface';

export interface SecretHttpClient {
  get<T>(url: string, headers?: Readonly<Record<string, string>>): Promise<T>;
}

export interface RemoteSecretConfig {
  readonly baseUrl: string;
  readonly token?: string;
}
