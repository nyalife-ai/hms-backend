/**
 * File: prescription.mapper.ts
 * Module: prescriptions
 * Purpose: Entity ↔ DTO mapper.
 */

import type { Prescription } from '../domain/prescription.entity';
import type { PrescriptionResponseDto } from '../dto';

export class PrescriptionMapper {
  public static toResponse(entity: Prescription): PrescriptionResponseDto {
    return {
      id: entity.getId(),
      name: entity.getName().getValue(),
      description: entity.getDescription(),
      createdAt: entity.getCreatedAt(),
      updatedAt: entity.getUpdatedAt(),
    };
  }

  public static toResponseList(items: readonly Prescription[]): PrescriptionResponseDto[] {
    return items.map((e) => this.toResponse(e));
  }
}
