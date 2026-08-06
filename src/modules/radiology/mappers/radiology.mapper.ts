/**
 * File: radiology.mapper.ts
 * Module: radiology
 * Purpose: Entity ↔ DTO mapper.
 */

import type { Radiology } from '../domain/radiology.entity';
import type { RadiologyResponseDto } from '../dto';

export class RadiologyMapper {
  public static toResponse(entity: Radiology): RadiologyResponseDto {
    return {
      id: entity.getId(),
      name: entity.getName().getValue(),
      description: entity.getDescription(),
      createdAt: entity.getCreatedAt(),
      updatedAt: entity.getUpdatedAt(),
    };
  }

  public static toResponseList(items: readonly Radiology[]): RadiologyResponseDto[] {
    return items.map((e) => this.toResponse(e));
  }
}
