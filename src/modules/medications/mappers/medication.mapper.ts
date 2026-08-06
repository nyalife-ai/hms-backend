/**
 * File: medication.mapper.ts
 * Module: medications
 * Purpose: Entity ↔ DTO mapper.
 */

import type { Medication } from '../domain/medication.entity';
import type { MedicationResponseDto } from '../dto';

export class MedicationMapper {
  public static toResponse(entity: Medication): MedicationResponseDto {
    return {
      id: entity.getId(),
      name: entity.getName().getValue(),
      description: entity.getDescription(),
      createdAt: entity.getCreatedAt(),
      updatedAt: entity.getUpdatedAt(),
    };
  }

  public static toResponseList(items: readonly Medication[]): MedicationResponseDto[] {
    return items.map((e) => this.toResponse(e));
  }
}
