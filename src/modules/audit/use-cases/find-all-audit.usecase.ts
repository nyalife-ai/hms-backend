/**
 * File: find-all-audit.usecase.ts
 * Module: audit
 * Purpose: Paginated list of audit.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { AuditQueryDto } from '../dto';
import { AUDIT_REPOSITORY } from '../constants/audit.constants';
import type { IAuditRepository, AuditPage } from '../interfaces/audit-repository.interface';

@Injectable()
export class FindAllAuditUseCase {
  public constructor(
    @Inject(AUDIT_REPOSITORY) private readonly repository: IAuditRepository,
  ) {}

  public async execute(query: AuditQueryDto): Promise<Result<AuditPage, string>> {
    try {
      const page = await this.repository.findMany(query);
      return Result.success(page);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'List failed');
    }
  }
}
