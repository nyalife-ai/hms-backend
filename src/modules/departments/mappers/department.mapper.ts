/**
 * File: department.mapper.ts
 * Module: departments
 * Purpose: Entity ↔ DTO mapper.
 */

import type { Department } from '../domain/department.entity';
import type { DepartmentResponseDto } from '../dto';

export class DepartmentMapper {
  public static toResponse(entity: Department): DepartmentResponseDto {
    return {
      id: entity.getId(),
      name: entity.getName().getValue(),
      description: entity.getDescription(),
      createdAt: entity.getCreatedAt(),
      updatedAt: entity.getUpdatedAt(),
    };
  }

  public static toResponseList(items: readonly Department[]): DepartmentResponseDto[] {
    return items.map((e) => this.toResponse(e));
  }
}
