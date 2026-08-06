export interface ServiceInstance {
  readonly id: string;
  readonly serviceName: string;
  readonly endpoint: string;
  readonly healthy: boolean;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface ServiceDiscovery {
  register(instance: ServiceInstance): void;
  deregister(serviceName: string, instanceId: string): boolean;
  resolve(serviceName: string): readonly ServiceInstance[];
  pick(serviceName: string): ServiceInstance | undefined;
}
