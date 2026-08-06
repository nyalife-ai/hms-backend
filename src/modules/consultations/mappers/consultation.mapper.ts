/**
 * File: consultation.mapper.ts
 * Module: consultations
 * Purpose: Entity ↔ DTO mapper.
 */

import type { Consultation } from '../domain/consultation.entity';
import type { ConsultationResponseDto } from '../dto';

export class ConsultationMapper {
  public static toResponse(entity: Consultation): ConsultationResponseDto {
    return {
      id: entity.getId(),
      name: entity.getName().getValue(),
      description: entity.getDescription(),
      createdAt: entity.getCreatedAt(),
      updatedAt: entity.getUpdatedAt(),
    };
  }

  public static toResponseList(items: readonly Consultation[]): ConsultationResponseDto[] {
    return items.map((e) => this.toResponse(e));
  }
}
