/**
 * File: admission.mapper.ts
 * Module: admissions
 * Purpose: Entity ↔ DTO mapper.
 */

import type { Admission } from '../domain/admission.entity';
import type { AdmissionResponseDto } from '../dto';

export class AdmissionMapper {
  public static toResponse(entity: Admission): AdmissionResponseDto {
    return {
      id: entity.getId(),
      name: entity.getName().getValue(),
      description: entity.getDescription(),
      createdAt: entity.getCreatedAt(),
      updatedAt: entity.getUpdatedAt(),
    };
  }

  public static toResponseList(items: readonly Admission[]): AdmissionResponseDto[] {
    return items.map((e) => this.toResponse(e));
  }
}
