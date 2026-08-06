import { Inject, Injectable } from '@nestjs/common';
import { DATABASE_ADAPTER } from '../providers/database.tokens';
import type { DatabaseAdapter } from '../contracts/database-adapter.interface';
import type { DatabaseHealth } from '../contracts/database-health';

@Injectable()
export class DatabaseHealthService {
  public constructor(
    @Inject(DATABASE_ADAPTER) private readonly adapter: DatabaseAdapter,
  ) {}

  public check(): Promise<DatabaseHealth> {
    return this.adapter.healthCheck();
  }
}
