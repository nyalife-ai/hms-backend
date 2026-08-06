/**
 * File: document.mapper.ts
 * Module: documents
 * Purpose: Entity ↔ DTO mapper.
 */

import type { Document } from '../domain/document.entity';
import type { DocumentResponseDto } from '../dto';

export class DocumentMapper {
  public static toResponse(entity: Document): DocumentResponseDto {
    return {
      id: entity.getId(),
      name: entity.getName().getValue(),
      description: entity.getDescription(),
      createdAt: entity.getCreatedAt(),
      updatedAt: entity.getUpdatedAt(),
    };
  }

  public static toResponseList(items: readonly Document[]): DocumentResponseDto[] {
    return items.map((e) => this.toResponse(e));
  }
}
