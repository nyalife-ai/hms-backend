/**
 * File: ward.mapper.ts
 * Module: wards
 * Purpose: Entity ↔ DTO mapper.
 */

import type { Ward } from '../domain/ward.entity';
import type { WardResponseDto } from '../dto';

export class WardMapper {
  public static toResponse(entity: Ward): WardResponseDto {
    return {
      id: entity.getId(),
      name: entity.getName().getValue(),
      description: entity.getDescription(),
      wardType: entity.getWardType(),
      departmentId: entity.getDepartmentId() ?? undefined,
      dailyRate: entity.getDailyRate(),
      capacity: entity.getCapacity(),
      isActive: entity.getIsActive(),
      createdAt: entity.getCreatedAt(),
      updatedAt: entity.getUpdatedAt(),
    };
  }

  public static toResponseList(items: readonly Ward[]): WardResponseDto[] {
    return items.map((e) => this.toResponse(e));
  }
}
