/**
 * File: pharmacy.mapper.ts
 * Module: pharmacy
 * Purpose: Entity ↔ DTO mapper.
 */

import type { Pharmacy } from '../domain/pharmacy.entity';
import type { PharmacyResponseDto } from '../dto';

export class PharmacyMapper {
  public static toResponse(entity: Pharmacy): PharmacyResponseDto {
    return {
      id: entity.getId(),
      name: entity.getName().getValue(),
      description: entity.getDescription(),
      createdAt: entity.getCreatedAt(),
      updatedAt: entity.getUpdatedAt(),
    };
  }

  public static toResponseList(items: readonly Pharmacy[]): PharmacyResponseDto[] {
    return items.map((e) => this.toResponse(e));
  }
}
