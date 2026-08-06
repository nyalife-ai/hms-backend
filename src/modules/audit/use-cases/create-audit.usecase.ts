/**
 * File: create-audit.usecase.ts
 * Module: audit
 * Purpose: Create audit use-case.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { CreateAuditDto } from '../dto';
import { Audit } from '../domain/audit.entity';
import { AUDIT_REPOSITORY } from '../constants/audit.constants';
import type { IAuditRepository } from '../interfaces/audit-repository.interface';

@Injectable()
export class CreateAuditUseCase {
  public constructor(
    @Inject(AUDIT_REPOSITORY) private readonly repository: IAuditRepository,
  ) {}

  public async execute(dto: CreateAuditDto): Promise<Result<Audit, string>> {
    try {
      const entity = Audit.create({
        name: dto.name,
        description: dto.description,
        action: dto.action,
        entityType: dto.entityType,
        entityId: dto.entityId,
        userId: dto.userId,
      });
      const saved = await this.repository.save(entity);
      return Result.success(saved);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'Create failed');
    }
  }
}
