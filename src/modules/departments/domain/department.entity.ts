/**
 * File: department.entity.ts
 * Module: departments
 * Purpose: Domain entity extending core Entity<string>.
 */

import { randomUUID } from 'crypto';
import { Entity } from '../../../core/domain';
import { DepartmentName } from './value-objects/department-name.vo';

export type DepartmentType = 'CLINICAL' | 'ADMINISTRATIVE' | 'SUPPORT';

export type DepartmentProps = {
  name: DepartmentName;
  code?: string;
  type?: DepartmentType;
  description?: string;
  headName?: string;
  headPosition?: string;
  isActive?: boolean;
};

export class Department extends Entity<string> {
  private name: DepartmentName;
  private code?: string;
  private type?: DepartmentType;
  private description?: string;
  private headName?: string;
  private headPosition?: string;
  private isActive?: boolean;

  private constructor(
    id: string,
    props: DepartmentProps,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this.name = props.name;
    this.code = props.code;
    this.type = props.type;
    this.description = props.description;
    this.headName = props.headName;
    this.headPosition = props.headPosition;
    this.isActive = props.isActive;
  }

  public static create(input: {
    name: string;
    code?: string;
    type?: DepartmentType;
    description?: string;
    headName?: string;
    headPosition?: string;
    isActive?: boolean;
  }): Department {
    const now = new Date();
    return new Department(
      randomUUID(),
      {
        name: DepartmentName.create(input.name),
        code: input.code,
        type: input.type,
        description: input.description,
        headName: input.headName,
        headPosition: input.headPosition,
        isActive: input.isActive,
      },
      now,
      now,
    );
  }

  public static reconstitute(
    id: string,
    props: DepartmentProps,
    createdAt: Date,
    updatedAt: Date,
  ): Department {
    return new Department(id, props, createdAt, updatedAt);
  }

  public getName(): DepartmentName {
    return this.name;
  }

  public getCode(): string | undefined {
    return this.code;
  }

  public getType(): DepartmentType | undefined {
    return this.type;
  }

  public getDescription(): string | undefined {
    return this.description;
  }

  public getHeadName(): string | undefined {
    return this.headName;
  }

  public getHeadPosition(): string | undefined {
    return this.headPosition;
  }

  public getIsActive(): boolean | undefined {
    return this.isActive;
  }
}
