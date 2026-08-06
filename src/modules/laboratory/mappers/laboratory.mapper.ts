/**
 * File: laboratory.mapper.ts
 * Module: laboratory
 * Purpose: Entity ↔ DTO mapper.
 */

import type { Laboratory } from '../domain/laboratory.entity';
import type { LaboratoryResponseDto } from '../dto';

export class LaboratoryMapper {
  public static toResponse(entity: Laboratory): LaboratoryResponseDto {
    return {
      id: entity.getId(),
      name: entity.getName().getValue(),
      description: entity.getDescription(),
      createdAt: entity.getCreatedAt(),
      updatedAt: entity.getUpdatedAt(),
    };
  }

  public static toResponseList(items: readonly Laboratory[]): LaboratoryResponseDto[] {
    return items.map((e) => this.toResponse(e));
  }
}
