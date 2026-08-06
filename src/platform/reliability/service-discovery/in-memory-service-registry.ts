import { Injectable } from '@nestjs/common';
import { assertPositiveInteger } from '../../architecture/production-defaults';
import {
  ServiceDiscovery,
  ServiceInstance,
} from './service-discovery.interface';

export interface InMemoryServiceRegistryOptions {
  /** Maximum total registered instances across all services. Defaults to 10_000. */
  readonly maxInstances?: number;
}

@Injectable()
export class InMemoryServiceRegistry implements ServiceDiscovery {
  private readonly instances = new Map<string, Map<string, ServiceInstance>>();
  private readonly cursors = new Map<string, number>();
  private readonly maxInstances: number;
  private totalInstances = 0;

  public constructor(options: InMemoryServiceRegistryOptions = {}) {
    this.maxInstances = assertPositiveInteger(
      options.maxInstances ?? 10_000,
      'InMemoryServiceRegistry maxInstances',
    );
  }

  public register(instance: ServiceInstance): void {
    if (
      instance.serviceName.trim().length === 0 ||
      instance.id.trim().length === 0
    ) {
      throw new TypeError('Service name and instance id cannot be empty');
    }
    const serviceInstances =
      this.instances.get(instance.serviceName) ??
      new Map<string, ServiceInstance>();
    const isNew = !serviceInstances.has(instance.id);
    if (isNew && this.totalInstances >= this.maxInstances) {
      throw new RangeError(
        `InMemoryServiceRegistry is full (maxInstances=${this.maxInstances})`,
      );
    }
    if (isNew) {
      this.totalInstances += 1;
    }
    serviceInstances.set(instance.id, Object.freeze({ ...instance }));
    this.instances.set(instance.serviceName, serviceInstances);
  }

  public deregister(serviceName: string, instanceId: string): boolean {
    const serviceInstances = this.instances.get(serviceName);
    if (!serviceInstances) {
      return false;
    }
    const removed = serviceInstances.delete(instanceId);
    if (removed) {
      this.totalInstances -= 1;
    }
    if (serviceInstances.size === 0) {
      this.instances.delete(serviceName);
      this.cursors.delete(serviceName);
    }
    return removed;
  }

  public resolve(serviceName: string): readonly ServiceInstance[] {
    return Object.freeze(
      [...(this.instances.get(serviceName)?.values() ?? [])].filter(
        (instance: ServiceInstance): boolean => instance.healthy,
      ),
    );
  }

  public pick(serviceName: string): ServiceInstance | undefined {
    const healthy = this.resolve(serviceName);
    if (healthy.length === 0) {
      return undefined;
    }
    const cursor = this.cursors.get(serviceName) ?? 0;
    const selected = healthy[cursor % healthy.length];
    this.cursors.set(serviceName, (cursor + 1) % healthy.length);
    return selected;
  }
}
