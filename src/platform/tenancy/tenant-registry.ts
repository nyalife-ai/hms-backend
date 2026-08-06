import { Injectable } from '@nestjs/common';
import {
  ConflictException,
  NotFoundException,
  ValidationException,
} from '../../core';
import type { TenantConfiguration, TenantId } from './tenancy.types';

@Injectable()
export class TenantRegistry {
  private readonly tenants = new Map<TenantId, Readonly<TenantConfiguration>>();

  public register(
    tenant: Readonly<TenantConfiguration>,
  ): Readonly<TenantConfiguration> {
    const id = tenant.id.trim();
    const name = tenant.name.trim();
    if (!id || !name) {
      throw new ValidationException('Tenant id and name are required');
    }
    if (this.tenants.has(id)) {
      throw new ConflictException(`Tenant '${id}' is already registered`);
    }

    const registered = Object.freeze({
      ...tenant,
      id,
      name,
      settings: Object.freeze({ ...tenant.settings }),
      metadata: Object.freeze({ ...tenant.metadata }),
      connection: tenant.connection
        ? Object.freeze({ ...tenant.connection })
        : undefined,
    });
    this.tenants.set(id, registered);
    return registered;
  }

  public get(id: TenantId): Readonly<TenantConfiguration> {
    const tenant = this.tenants.get(id.trim());
    if (!tenant) {
      throw new NotFoundException('Tenant', id);
    }
    return tenant;
  }

  public list(): ReadonlyArray<Readonly<TenantConfiguration>> {
    return Object.freeze([...this.tenants.values()]);
  }
}
