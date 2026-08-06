/**
 * File: find-audit-by-id.usecase.ts
 * Module: audit
 * Purpose: Find audit by id.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { AUDIT_REPOSITORY } from '../constants/audit.constants';
import type { Audit } from '../domain/audit.entity';
import type { IAuditRepository } from '../interfaces/audit-repository.interface';

@Injectable()
export class FindAuditByIdUseCase {
  public constructor(
    @Inject(AUDIT_REPOSITORY) private readonly repository: IAuditRepository,
  ) {}

  public async execute(id: string): Promise<Result<Audit, NotFoundException>> {
    const entity = await this.repository.findById(id);
    if (!entity) {
      return Result.failure(new NotFoundException('Audit', id));
    }
    return Result.success(entity);
  }
}
