import { Injectable } from '@nestjs/common';
import { BcryptPasswordHasher } from './bcrypt-password.hasher';
import { PasswordPolicy } from './password-policy';

@Injectable()
export class PasswordService {
  public constructor(
    private readonly hasher: BcryptPasswordHasher,
    private readonly policy: PasswordPolicy,
  ) {}

  public async hash(password: string): Promise<string> {
    this.policy.validate(password);
    return this.hasher.hash(password);
  }

  public verify(password: string, digest: string): Promise<boolean> {
    return this.hasher.verify(password, digest);
  }
}
