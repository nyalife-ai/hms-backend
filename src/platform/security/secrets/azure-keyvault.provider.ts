import { RemoteSecretProvider } from './remote-secret.provider';

export class AzureKeyVaultProvider extends RemoteSecretProvider {
  protected path(name: string): string {
    return `/secrets/${name}`;
  }
}
