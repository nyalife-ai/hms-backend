import { RemoteSecretProvider } from './remote-secret.provider';

export class GcpSecretProvider extends RemoteSecretProvider {
  protected path(name: string): string {
    return `/secrets/${name}/versions/latest`;
  }
}
