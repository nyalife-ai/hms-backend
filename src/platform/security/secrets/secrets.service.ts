import { Injectable } from '@nestjs/common';
import { DomainException } from '../../../core';
import type { SecretProvider } from './secret-provider.interface';

@Injectable()
export class SecretsService {
  public constructor(private readonly providers: readonly SecretProvider[]) {}

  public async get(name: string): Promise<string> {
    for (const provider of this.providers) {
      const value = await provider.get(name);
      if (value !== null) return value;
    }
    throw new DomainException(`Secret not found: ${name}`, 'SECRET_NOT_FOUND');
  }
}
