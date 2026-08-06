/**
 * File: vital-sign.mapper.ts
 * Module: vital-signs
 * Purpose: Entity ↔ DTO mapper.
 */

import type { VitalSign } from '../domain/vital-sign.entity';
import type { VitalSignResponseDto } from '../dto';

export class VitalSignMapper {
  public static toResponse(entity: VitalSign): VitalSignResponseDto {
    return {
      id: entity.getId(),
      name: entity.getName().getValue(),
      description: entity.getDescription(),
      createdAt: entity.getCreatedAt(),
      updatedAt: entity.getUpdatedAt(),
    };
  }

  public static toResponseList(items: readonly VitalSign[]): VitalSignResponseDto[] {
    return items.map((e) => this.toResponse(e));
  }
}
