/**
 * File: insurance-policy.mapper.ts
 * Module: insurance-policies
 * Purpose: Entity ↔ DTO mapper.
 */

import type { InsurancePolicy } from '../domain/insurance-policy.entity';
import type { InsurancePolicyResponseDto } from '../dto';

export class InsurancePolicyMapper {
  public static toResponse(entity: InsurancePolicy): InsurancePolicyResponseDto {
    return {
      id: entity.getId(),
      name: entity.getName().getValue(),
      description: entity.getDescription(),
      createdAt: entity.getCreatedAt(),
      updatedAt: entity.getUpdatedAt(),
    };
  }

  public static toResponseList(items: readonly InsurancePolicy[]): InsurancePolicyResponseDto[] {
    return items.map((e) => this.toResponse(e));
  }
}
