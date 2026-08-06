import { Injectable } from '@nestjs/common';
import type { SecretProvider } from './secret-provider.interface';

@Injectable()
export class EnvSecretProvider implements SecretProvider {
  public constructor(
    private readonly environment: NodeJS.ProcessEnv = process.env,
  ) {}

  public get(name: string): Promise<string | null> {
    return Promise.resolve(this.environment[name] ?? null);
  }
}
