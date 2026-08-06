/**
 * File: diagnos.mapper.ts
 * Module: diagnoses
 * Purpose: Entity ↔ DTO mapper.
 */

import type { Diagnos } from '../domain/diagnos.entity';
import type { DiagnosResponseDto } from '../dto';

export class DiagnosMapper {
  public static toResponse(entity: Diagnos): DiagnosResponseDto {
    return {
      id: entity.getId(),
      name: entity.getName().getValue(),
      description: entity.getDescription(),
      createdAt: entity.getCreatedAt(),
      updatedAt: entity.getUpdatedAt(),
    };
  }

  public static toResponseList(items: readonly Diagnos[]): DiagnosResponseDto[] {
    return items.map((e) => this.toResponse(e));
  }
}
