/**
 * File: department.entity.ts
 * Module: departments
 * Purpose: Domain entity extending core Entity<string>.
 */

import { Entity } from '../../../core/domain';
import { generateId } from '../../../core/identity';
import { DepartmentName } from './value-objects/department-name.vo';

export type DepartmentProps = {
  name: DepartmentName;
  description?: string;
};

export class Department extends Entity<string> {
  private name: DepartmentName;
  private description?: string;

  private constructor(
    id: string,
    props: DepartmentProps,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this.name = props.name;
    this.description = props.description;
  }

  public static create(input: { name: string; description?: string }): Department {
    const now = new Date();
    return new Department(
      generateId('department'),
      {
        name: DepartmentName.create(input.name),
        description: input.description,
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

  public getDescription(): string | undefined {
    return this.description;
  }
}
