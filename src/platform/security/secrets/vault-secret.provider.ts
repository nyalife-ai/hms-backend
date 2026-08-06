import { RemoteSecretProvider } from './remote-secret.provider';

export class VaultSecretProvider extends RemoteSecretProvider {
  protected path(name: string): string {
    return `/v1/secret/data/${name}`;
  }
}
