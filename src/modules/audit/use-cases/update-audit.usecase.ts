/**
 * File: update-audit.usecase.ts
 * Module: audit
 * Purpose: Update audit — audit logs are append-only; this always fails via repository.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import type { UpdateAuditDto } from '../dto';
import { AuditName } from '../domain/value-objects/audit-name.vo';
import { AUDIT_REPOSITORY } from '../constants/audit.constants';
import { Audit } from '../domain/audit.entity';
import type { IAuditRepository } from '../interfaces/audit-repository.interface';

@Injectable()
export class UpdateAuditUseCase {
  public constructor(
    @Inject(AUDIT_REPOSITORY) private readonly repository: IAuditRepository,
  ) {}

  public async execute(id: string, dto: UpdateAuditDto): Promise<Result<Audit, NotFoundException | string>> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      return Result.failure(new NotFoundException('Audit', id));
    }
    try {
      const next = Audit.reconstitute(
        existing.getId(),
        {
          name: dto.name ? AuditName.create(dto.name) : existing.getName(),
          description: dto.description ?? existing.getDescription(),
          action: existing.getAction(),
          entityType: existing.getEntityType(),
          entityId: existing.getEntityId(),
          userId: existing.getUserId(),
        },
        existing.getCreatedAt(),
        new Date(),
      );
      const saved = await this.repository.save(next);
      return Result.success(saved);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'Update failed');
    }
  }
}
