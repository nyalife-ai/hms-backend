/**
 * File: bed.mapper.ts
 * Module: beds
 * Purpose: Entity ↔ DTO mapper.
 */

import type { Bed } from '../domain/bed.entity';
import type { BedResponseDto } from '../dto';

export class BedMapper {
  public static toResponse(entity: Bed): BedResponseDto {
    return {
      id: entity.getId(),
      name: entity.getName().getValue(),
      description: entity.getDescription(),
      wardId: entity.getWardId(),
      status: entity.getStatus(),
      createdAt: entity.getCreatedAt(),
      updatedAt: entity.getUpdatedAt(),
    };
  }

  public static toResponseList(items: readonly Bed[]): BedResponseDto[] {
    return items.map((e) => this.toResponse(e));
  }
}
