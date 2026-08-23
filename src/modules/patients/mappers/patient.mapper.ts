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
      gender: entity.getGender(),
      dateOfBirth: entity.getDateOfBirth(),
      bloodGroup: entity.getBloodGroup(),
      allergies: entity.getAllergies(),
      chronicDiseases: entity.getChronicDiseases(),
      occupation: entity.getOccupation(),
      maritalStatus: entity.getMaritalStatus(),
      address: entity.getAddress(),
      city: entity.getCity(),
      country: entity.getCountry(),
      postalCode: entity.getPostalCode(),
      emergencyContactName: entity.getEmergencyContactName(),
      emergencyContactPhone: entity.getEmergencyContactPhone(),
      createdAt: entity.getCreatedAt(),
      updatedAt: entity.getUpdatedAt(),
    };
  }

  public static toResponseList(items: readonly Patient[]): PatientResponseDto[] {
    return items.map((e) => this.toResponse(e));
  }
}
