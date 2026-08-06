import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { TenantConfiguration, TenantPrincipal } from './tenancy.types';

interface TenantContextState {
  readonly tenant: Readonly<TenantConfiguration>;
  readonly principal?: Readonly<TenantPrincipal>;
}

@Injectable()
export class TenantContext {
  private readonly storage = new AsyncLocalStorage<TenantContextState>();

  public run<T>(
    tenant: Readonly<TenantConfiguration>,
    fn: () => T,
    principal?: Readonly<TenantPrincipal>,
  ): T {
    return this.storage.run({ tenant, principal }, fn);
  }

  public current(): Readonly<TenantConfiguration> | undefined {
    return this.storage.getStore()?.tenant;
  }

  public currentPrincipal(): Readonly<TenantPrincipal> | undefined {
    return this.storage.getStore()?.principal;
  }

  public requireCurrent(): Readonly<TenantConfiguration> {
    const tenant = this.current();
    if (!tenant) {
      throw new Error('No tenant is active in the current context');
    }
    return tenant;
  }
}
