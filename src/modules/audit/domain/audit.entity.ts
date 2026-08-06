/**
 * File: audit.entity.ts
 * Module: audit
 * Purpose: Domain entity for audit log entries (core.audit_logs).
 */

import { randomUUID } from 'crypto';
import { Entity } from '../../../core/domain';
import { AuditName } from './value-objects/audit-name.vo';

export type AuditProps = {
  name: AuditName;
  description?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  userId?: string;
};

export class Audit extends Entity<string> {
  private name: AuditName;
  private description?: string;
  private action?: string;
  private entityType?: string;
  private entityId?: string;
  private userId?: string;

  private constructor(
    id: string,
    props: AuditProps,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this.name = props.name;
    this.description = props.description;
    this.action = props.action;
    this.entityType = props.entityType;
    this.entityId = props.entityId;
    this.userId = props.userId;
  }

  public static create(input: {
    name: string;
    description?: string;
    action?: string;
    entityType?: string;
    entityId?: string;
    userId?: string;
  }): Audit {
    const now = new Date();
    return new Audit(
      randomUUID(),
      {
        name: AuditName.create(input.name),
        description: input.description,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        userId: input.userId,
      },
      now,
      now,
    );
  }

  public static reconstitute(
    id: string,
    props: AuditProps,
    createdAt: Date,
    updatedAt: Date,
  ): Audit {
    return new Audit(id, props, createdAt, updatedAt);
  }

  public getName(): AuditName {
    return this.name;
  }

  public getDescription(): string | undefined {
    return this.description;
  }

  public getAction(): string | undefined {
    return this.action;
  }

  public getEntityType(): string | undefined {
    return this.entityType;
  }

  public getEntityId(): string | undefined {
    return this.entityId;
  }

  public getUserId(): string | undefined {
    return this.userId;
  }
}
