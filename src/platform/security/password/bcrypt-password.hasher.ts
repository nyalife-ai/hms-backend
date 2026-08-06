import { Injectable } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import type { PasswordHasher } from './password-hasher.interface';

@Injectable()
export class BcryptPasswordHasher implements PasswordHasher {
  public constructor(private readonly rounds = 12) {}

  public hash(password: string): Promise<string> {
    return hash(password, this.rounds);
  }

  public verify(password: string, digest: string): Promise<boolean> {
    return compare(password, digest);
  }
}
