/**
 * File: inpatient.mapper.ts
 * Module: inpatient
 * Purpose: Entity ↔ DTO mapper.
 */

import type { Inpatient } from '../domain/inpatient.entity';
import type { InpatientResponseDto } from '../dto';

export class InpatientMapper {
  public static toResponse(entity: Inpatient): InpatientResponseDto {
    return {
      id: entity.getId(),
      name: entity.getName().getValue(),
      description: entity.getDescription(),
      createdAt: entity.getCreatedAt(),
      updatedAt: entity.getUpdatedAt(),
    };
  }

  public static toResponseList(items: readonly Inpatient[]): InpatientResponseDto[] {
    return items.map((e) => this.toResponse(e));
  }
}
