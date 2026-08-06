/**
 * Staff domain entity — core.staff_profiles (db.sql).
 */

import { randomUUID } from 'crypto';
import { Entity } from '../../../core/domain';
import { StaffName } from './value-objects/staff-name.vo';

export type StaffProps = {
  name: StaffName;
  userId: string;
  employeeId: string;
  joinDate: Date;
  departmentId?: string | null;
  position?: string | null;
  specialization?: string | null;
  qualification?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  isActive: boolean;
  /** Optional free-text note — not a DB column; ignored on persist. */
  description?: string;
};

export class Staff extends Entity<string> {
  private props: StaffProps;

  private constructor(
    id: string,
    props: StaffProps,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this.props = props;
  }

  public static create(input: {
    name?: string;
    description?: string;
    userId?: string;
    employeeId?: string;
    joinDate?: string | Date;
    departmentId?: string;
    position?: string;
    specialization?: string;
    qualification?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
  }): Staff {
    if (!input.userId?.trim()) {
      throw new Error(
        'userId is required to create a staff profile (name alone is not enough)',
      );
    }
    if (!input.employeeId?.trim()) {
      throw new Error('employeeId is required to create a staff profile');
    }
    if (!input.joinDate) {
      throw new Error('joinDate is required to create a staff profile');
    }

    const joinDate =
      input.joinDate instanceof Date
        ? input.joinDate
        : new Date(input.joinDate);
    if (Number.isNaN(joinDate.getTime())) {
      throw new Error('joinDate must be a valid date');
    }

    const displayName =
      input.name?.trim() ||
      input.employeeId.trim() ||
      'Staff';
    const now = new Date();
    return new Staff(
      randomUUID(),
      {
        name: StaffName.create(displayName),
        userId: input.userId.trim(),
        employeeId: input.employeeId.trim(),
        joinDate,
        departmentId: input.departmentId,
        position: input.position,
        specialization: input.specialization,
        qualification: input.qualification,
        emergencyContactName: input.emergencyContactName,
        emergencyContactPhone: input.emergencyContactPhone,
        isActive: true,
        description: input.description,
      },
      now,
      now,
    );
  }

  public static reconstitute(
    id: string,
    props: StaffProps,
    createdAt: Date,
    updatedAt: Date,
  ): Staff {
    return new Staff(id, props, createdAt, updatedAt);
  }

  public update(patch: {
    name?: string;
    description?: string;
    departmentId?: string | null;
    position?: string | null;
    specialization?: string | null;
    qualification?: string | null;
    emergencyContactName?: string | null;
    emergencyContactPhone?: string | null;
    isActive?: boolean;
    joinDate?: Date | string;
  }): void {
    if (patch.name !== undefined) {
      this.props.name = StaffName.create(patch.name);
    }
    if (patch.description !== undefined) {
      this.props.description = patch.description;
    }
    if (patch.departmentId !== undefined) {
      this.props.departmentId = patch.departmentId;
    }
    if (patch.position !== undefined) this.props.position = patch.position;
    if (patch.specialization !== undefined) {
      this.props.specialization = patch.specialization;
    }
    if (patch.qualification !== undefined) {
      this.props.qualification = patch.qualification;
    }
    if (patch.emergencyContactName !== undefined) {
      this.props.emergencyContactName = patch.emergencyContactName;
    }
    if (patch.emergencyContactPhone !== undefined) {
      this.props.emergencyContactPhone = patch.emergencyContactPhone;
    }
    if (patch.isActive !== undefined) this.props.isActive = patch.isActive;
    if (patch.joinDate !== undefined) {
      const d =
        patch.joinDate instanceof Date
          ? patch.joinDate
          : new Date(patch.joinDate);
      if (Number.isNaN(d.getTime())) {
        throw new Error('joinDate must be a valid date');
      }
      this.props.joinDate = d;
    }
    this.touch();
  }

  public getName(): StaffName {
    return this.props.name;
  }
  public getDescription(): string | undefined {
    return this.props.description;
  }
  public getUserId(): string {
    return this.props.userId;
  }
  public getEmployeeId(): string {
    return this.props.employeeId;
  }
  public getJoinDate(): Date {
    return this.props.joinDate;
  }
  public getDepartmentId(): string | null | undefined {
    return this.props.departmentId;
  }
  public getPosition(): string | null | undefined {
    return this.props.position;
  }
  public getSpecialization(): string | null | undefined {
    return this.props.specialization;
  }
  public getQualification(): string | null | undefined {
    return this.props.qualification;
  }
  public getEmergencyContactName(): string | null | undefined {
    return this.props.emergencyContactName;
  }
  public getEmergencyContactPhone(): string | null | undefined {
    return this.props.emergencyContactPhone;
  }
  public getIsActive(): boolean {
    return this.props.isActive;
  }
}
