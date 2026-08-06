/**
 * File: patient.mapper.ts
 */

import type { Patient } from '../domain/patient.entity';
import type { PatientResponseDto } from '../dto';

export class PatientMapper {
  public static toResponse(entity: Patient): PatientResponseDto {
    return {
      id: entity.getId(),
      userId: entity.getUserId(),
      patientNumber: entity.getPatientNumber(),
      firstName: entity.getFirstName(),
      lastName: entity.getLastName(),
      name: entity.getDisplayName(),
      email: entity.getEmail(),
      phone: entity.getPhone(),
      bloodGroup: entity.getBloodGroup(),
      allergies: entity.getAllergies(),
      chronicDiseases: entity.getChronicDiseases(),
      occupation: entity.getOccupation(),
      maritalStatus: entity.getMaritalStatus(),
      createdAt: entity.getCreatedAt(),
      updatedAt: entity.getUpdatedAt(),
    };
  }

  public static toResponseList(items: readonly Patient[]): PatientResponseDto[] {
    return items.map((e) => this.toResponse(e));
  }
}
