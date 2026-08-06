/**
 * Bed domain entity — inpatient.beds (db.sql). No rooms table.
 */

import { randomUUID } from 'crypto';
import { Entity } from '../../../core/domain';
import { BedName } from './value-objects/bed-name.vo';

export type BedProps = {
  /** bed_number */
  name: BedName;
  wardId: string;
  status: string;
  description?: string;
};

export class Bed extends Entity<string> {
  private props: BedProps;

  private constructor(
    id: string,
    props: BedProps,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this.props = props;
  }

  public static create(input: {
    name: string;
    wardId: string;
    status?: string;
    description?: string;
  }): Bed {
    const now = new Date();
    return new Bed(
      randomUUID(),
      {
        name: BedName.create(input.name),
        wardId: input.wardId,
        status: (input.status || 'AVAILABLE').toUpperCase(),
        description: input.description,
      },
      now,
      now,
    );
  }

  public static reconstitute(
    id: string,
    props: BedProps,
    createdAt: Date,
    updatedAt: Date,
  ): Bed {
    return new Bed(id, props, createdAt, updatedAt);
  }

  public update(patch: {
    name?: string;
    status?: string;
    description?: string;
  }): void {
    if (patch.name !== undefined) {
      this.props.name = BedName.create(patch.name);
    }
    if (patch.status !== undefined) {
      this.props.status = patch.status.toUpperCase();
    }
    if (patch.description !== undefined) {
      this.props.description = patch.description;
    }
    this.touch();
  }

  public getName(): BedName {
    return this.props.name;
  }
  public getDescription(): string | undefined {
    return this.props.description;
  }
  public getWardId(): string {
    return this.props.wardId;
  }
  public getStatus(): string {
    return this.props.status;
  }
}
