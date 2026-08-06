/**
 * File: audit.mapper.ts
 * Module: audit
 * Purpose: Entity ↔ DTO mapper.
 */

import type { Audit } from '../domain/audit.entity';
import type { AuditResponseDto } from '../dto';

export class AuditMapper {
  public static toResponse(entity: Audit): AuditResponseDto {
    return {
      id: entity.getId(),
      name: entity.getName().getValue(),
      description: entity.getDescription(),
      createdAt: entity.getCreatedAt(),
      updatedAt: entity.getUpdatedAt(),
    };
  }

  public static toResponseList(items: readonly Audit[]): AuditResponseDto[] {
    return items.map((e) => this.toResponse(e));
  }
}
