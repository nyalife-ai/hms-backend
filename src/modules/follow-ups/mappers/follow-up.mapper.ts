/**
 * File: follow-up.mapper.ts
 * Module: follow-ups
 * Purpose: Entity ↔ DTO mapper.
 */

import type { FollowUp } from '../domain/follow-up.entity';
import type { FollowUpResponseDto } from '../dto';

export class FollowUpMapper {
  public static toResponse(entity: FollowUp): FollowUpResponseDto {
    return {
      id: entity.getId(),
      name: entity.getName().getValue(),
      description: entity.getDescription(),
      createdAt: entity.getCreatedAt(),
      updatedAt: entity.getUpdatedAt(),
    };
  }

  public static toResponseList(items: readonly FollowUp[]): FollowUpResponseDto[] {
    return items.map((e) => this.toResponse(e));
  }
}
