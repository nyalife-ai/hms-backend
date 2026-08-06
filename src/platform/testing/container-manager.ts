import { TestContainer } from './container.types';

export class ContainerManager {
  private readonly started: TestContainer[] = [];

  public async start(container: TestContainer): Promise<string> {
    try {
      await container.start();
      this.started.push(container);
      return container.getConnectionUri();
    } catch (error: unknown) {
      await container.stop().catch((): void => undefined);
      throw error;
    }
  }

  public async stop(container: TestContainer): Promise<void> {
    await container.stop();
    const index = this.started.indexOf(container);
    if (index >= 0) {
      this.started.splice(index, 1);
    }
  }

  public async stopAll(): Promise<void> {
    const containers = this.started.splice(0).reverse();
    const results = await Promise.allSettled(
      containers.map(async (container): Promise<void> => container.stop()),
    );
    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (failure !== undefined) {
      throw failure.reason;
    }
  }

  public get size(): number {
    return this.started.length;
  }
}
