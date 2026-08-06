import { RemoteSecretProvider } from './remote-secret.provider';

export class AwsSecretsProvider extends RemoteSecretProvider {
  protected path(name: string): string {
    return `/secretsmanager/${name}`;
  }
}
