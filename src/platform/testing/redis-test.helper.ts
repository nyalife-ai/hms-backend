import { ContainerManager } from './container-manager';
import {
  RedisContainerDriver,
  TestConnectionInfo,
  TestContainer,
} from './container.types';

export class RedisTestHelper {
  private container: TestContainer | undefined;

  public constructor(
    private readonly driver: RedisContainerDriver,
    private readonly manager: ContainerManager = new ContainerManager(),
  ) {}

  public async start(): Promise<TestConnectionInfo> {
    const container = this.driver.createRedisContainer();
    const connectionUri = await this.manager.start(container);
    this.container = container;
    return { connectionUri, container };
  }

  public async stop(): Promise<void> {
    if (this.container !== undefined) {
      const container = this.container;
      this.container = undefined;
      await this.manager.stop(container);
    }
  }
}
