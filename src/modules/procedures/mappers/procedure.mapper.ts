/**
 * File: procedure.mapper.ts
 * Module: procedures
 * Purpose: Entity ↔ DTO mapper.
 */

import type { Procedure } from '../domain/procedure.entity';
import type { ProcedureResponseDto } from '../dto';

export class ProcedureMapper {
  public static toResponse(entity: Procedure): ProcedureResponseDto {
    return {
      id: entity.getId(),
      name: entity.getName().getValue(),
      description: entity.getDescription(),
      createdAt: entity.getCreatedAt(),
      updatedAt: entity.getUpdatedAt(),
    };
  }

  public static toResponseList(items: readonly Procedure[]): ProcedureResponseDto[] {
    return items.map((e) => this.toResponse(e));
  }
}
