/**
 * Ward domain entity — inpatient.wards (db.sql).
 */

import { randomUUID } from 'crypto';
import { Entity } from '../../../core/domain';
import { WardName } from './value-objects/ward-name.vo';

export type WardProps = {
  name: WardName;
  wardType: string;
  departmentId?: string | null;
  dailyRate: number;
  capacity: number;
  isActive: boolean;
  /** Optional free-text note — not a DB column; ignored on persist. */
  description?: string;
};

export class Ward extends Entity<string> {
  private props: WardProps;

  private constructor(
    id: string,
    props: WardProps,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this.props = props;
  }

  public static create(input: {
    name: string;
    wardType?: string;
    departmentId?: string;
    dailyRate?: number;
    capacity?: number;
    description?: string;
  }): Ward {
    const now = new Date();
    return new Ward(
      randomUUID(),
      {
        name: WardName.create(input.name),
        wardType: (input.wardType || 'GENERAL').toUpperCase(),
        departmentId: input.departmentId,
        dailyRate: input.dailyRate ?? 0,
        capacity: input.capacity ?? 0,
        isActive: true,
        description: input.description,
      },
      now,
      now,
    );
  }

  public static reconstitute(
    id: string,
    props: WardProps,
    createdAt: Date,
    updatedAt: Date,
  ): Ward {
    return new Ward(id, props, createdAt, updatedAt);
  }

  public update(patch: {
    name?: string;
    wardType?: string;
    departmentId?: string | null;
    dailyRate?: number;
    capacity?: number;
    description?: string;
    isActive?: boolean;
  }): void {
    if (patch.name !== undefined) {
      this.props.name = WardName.create(patch.name);
    }
    if (patch.wardType !== undefined) {
      this.props.wardType = patch.wardType.toUpperCase();
    }
    if (patch.departmentId !== undefined) {
      this.props.departmentId = patch.departmentId;
    }
    if (patch.dailyRate !== undefined) this.props.dailyRate = patch.dailyRate;
    if (patch.capacity !== undefined) this.props.capacity = patch.capacity;
    if (patch.description !== undefined) {
      this.props.description = patch.description;
    }
    if (patch.isActive !== undefined) this.props.isActive = patch.isActive;
    this.touch();
  }

  public getName(): WardName {
    return this.props.name;
  }
  public getDescription(): string | undefined {
    return this.props.description;
  }
  public getWardType(): string {
    return this.props.wardType;
  }
  public getDepartmentId(): string | null | undefined {
    return this.props.departmentId;
  }
  public getDailyRate(): number {
    return this.props.dailyRate;
  }
  public getCapacity(): number {
    return this.props.capacity;
  }
  public getIsActive(): boolean {
    return this.props.isActive;
  }
}
