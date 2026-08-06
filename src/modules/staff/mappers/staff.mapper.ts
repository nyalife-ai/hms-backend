/**
 * File: staff.mapper.ts
 * Module: staff
 * Purpose: Entity ↔ DTO mapper.
 */

import type { Staff } from '../domain/staff.entity';
import type { StaffResponseDto } from '../dto';

export class StaffMapper {
  public static toResponse(entity: Staff): StaffResponseDto {
    return {
      id: entity.getId(),
      name: entity.getName().getValue(),
      description: entity.getDescription(),
      createdAt: entity.getCreatedAt(),
      updatedAt: entity.getUpdatedAt(),
    };
  }

  public static toResponseList(items: readonly Staff[]): StaffResponseDto[] {
    return items.map((e) => this.toResponse(e));
  }
}
