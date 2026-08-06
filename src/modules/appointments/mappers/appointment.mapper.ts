/**
 * File: appointment.mapper.ts
 * Module: appointments
 * Purpose: Entity ↔ DTO mapper.
 */

import type { Appointment } from '../domain/appointment.entity';
import type { AppointmentResponseDto } from '../dto';

export class AppointmentMapper {
  public static toResponse(entity: Appointment): AppointmentResponseDto {
    return {
      id: entity.getId(),
      name: entity.getName().getValue(),
      description: entity.getDescription(),
      createdAt: entity.getCreatedAt(),
      updatedAt: entity.getUpdatedAt(),
    };
  }

  public static toResponseList(items: readonly Appointment[]): AppointmentResponseDto[] {
    return items.map((e) => this.toResponse(e));
  }
}
