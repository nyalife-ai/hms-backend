import type {
  RemoteSecretConfig,
  SecretHttpClient,
  SecretProvider,
} from './secret-provider.interface';

interface SecretResponse {
  readonly value?: string;
  readonly data?: { readonly value?: string };
}

export abstract class RemoteSecretProvider implements SecretProvider {
  protected abstract path(name: string): string;

  public constructor(
    protected readonly config: RemoteSecretConfig,
    protected readonly http: SecretHttpClient,
  ) {}

  public async get(name: string): Promise<string | null> {
    const response = await this.http.get<SecretResponse>(
      `${this.config.baseUrl}${this.path(encodeURIComponent(name))}`,
      this.config.token
        ? { authorization: `Bearer ${this.config.token}` }
        : undefined,
    );
    return response.value ?? response.data?.value ?? null;
  }
}
