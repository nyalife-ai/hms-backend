/**
 * File: soft-delete-audit.usecase.ts
 * Module: audit
 * Purpose: Soft-delete audit.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { AUDIT_REPOSITORY } from '../constants/audit.constants';
import type { IAuditRepository } from '../interfaces/audit-repository.interface';

@Injectable()
export class SoftDeleteAuditUseCase {
  public constructor(
    @Inject(AUDIT_REPOSITORY) private readonly repository: IAuditRepository,
  ) {}

  public async execute(id: string): Promise<Result<void, NotFoundException>> {
    if (!(await this.repository.exists(id))) {
      return Result.failure(new NotFoundException('Audit', id));
    }
    await this.repository.softDelete(id);
    return Result.success(undefined);
  }
}
