/**
 * File: follow-up.mapper.ts
 * Module: follow-ups
 * Purpose: Entity ↔ DTO mapper.
 */

import type { FollowUp } from '../domain/follow-up.entity';
import type { FollowUpResponseDto } from '../dto';

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export class FollowUpMapper {
  public static toResponse(entity: FollowUp): FollowUpResponseDto {
    const display = entity.getDisplay();
    return {
      id: entity.getId(),
      patientId: entity.getPatientId(),
      patientName: display.patientName ?? '',
      patientMrn: display.patientMrn ?? '',
      consultationId: entity.getConsultationId(),
      appointmentId: display.appointmentId ?? null,
      doctorId: display.doctorId ?? '',
      doctorName: display.doctorName ?? '',
      followUpDate: toDateOnly(entity.getFollowUpDate()),
      followUpType: entity.getFollowUpType() ?? null,
      reason: entity.getReason(),
      status: entity.getStatus(),
      notes: entity.getNotes() ?? null,
      createdAt: entity.getCreatedAt(),
      updatedAt: entity.getUpdatedAt(),
    };
  }

  public static toResponseList(
    items: readonly FollowUp[],
  ): FollowUpResponseDto[] {
    return items.map((e) => this.toResponse(e));
  }
}
