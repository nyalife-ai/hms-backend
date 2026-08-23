/**
 * File: patient.entity.ts
 * Domain entity aligned with patients.patients + core.profiles (db.sql).
 */

import { randomUUID } from 'crypto';
import { Entity } from '../../../core/domain';

export type PatientProps = {
  userId: string;
  patientNumber: string;
  firstName: string;
  lastName: string;
  bloodGroup?: string | null;
  allergies?: string | null;
  chronicDiseases?: string | null;
  occupation?: string | null;
  maritalStatus?: string | null;
  phone?: string | null;
  email?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  postalCode?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
};

export class Patient extends Entity<string> {
  private constructor(
    id: string,
    private props: PatientProps,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
  }

  public static create(input: PatientProps & { id?: string }): Patient {
    const now = new Date();
    return new Patient(input.id ?? randomUUID(), { ...input }, now, now);
  }

  public static reconstitute(
    id: string,
    props: PatientProps,
    createdAt: Date,
    updatedAt: Date,
  ): Patient {
    return new Patient(id, props, createdAt, updatedAt);
  }

  public update(patch: Partial<Omit<PatientProps, 'userId' | 'patientNumber'>>): void {
    this.props = { ...this.props, ...patch };
    this.touch();
  }

  public getUserId(): string {
    return this.props.userId;
  }
  public getPatientNumber(): string {
    return this.props.patientNumber;
  }
  public getFirstName(): string {
    return this.props.firstName;
  }
  public getLastName(): string {
    return this.props.lastName;
  }
  public getDisplayName(): string {
    return `${this.props.firstName} ${this.props.lastName}`.trim();
  }
  public getBloodGroup(): string | null | undefined {
    return this.props.bloodGroup;
  }
  public getAllergies(): string | null | undefined {
    return this.props.allergies;
  }
  public getChronicDiseases(): string | null | undefined {
    return this.props.chronicDiseases;
  }
  public getOccupation(): string | null | undefined {
    return this.props.occupation;
  }
  public getMaritalStatus(): string | null | undefined {
    return this.props.maritalStatus;
  }
  public getPhone(): string | null | undefined {
    return this.props.phone;
  }
  public getEmail(): string | null | undefined {
    return this.props.email;
  }
  public getGender(): string | null | undefined {
    return this.props.gender;
  }
  public getDateOfBirth(): string | null | undefined {
    return this.props.dateOfBirth;
  }
  public getAddress(): string | null | undefined {
    return this.props.address;
  }
  public getCity(): string | null | undefined {
    return this.props.city;
  }
  public getCountry(): string | null | undefined {
    return this.props.country;
  }
  public getPostalCode(): string | null | undefined {
    return this.props.postalCode;
  }
  public getEmergencyContactName(): string | null | undefined {
    return this.props.emergencyContactName;
  }
  public getEmergencyContactPhone(): string | null | undefined {
    return this.props.emergencyContactPhone;
  }
  public toProps(): PatientProps {
    return { ...this.props };
  }
}
