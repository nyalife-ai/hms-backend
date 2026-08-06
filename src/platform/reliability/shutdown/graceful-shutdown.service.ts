import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ActiveRequestTracker } from './active-request.tracker';
import type { TimeoutScheduler } from './active-request.tracker';

export type ShutdownSignal = 'SIGTERM' | 'SIGINT';
export type ShutdownHook = () => Promise<void> | void;

export interface ProcessSignalEmitter {
  on(signal: ShutdownSignal, listener: () => void): void;
  off(signal: ShutdownSignal, listener: () => void): void;
}

export interface ShutdownLogger {
  error(message: string, error?: unknown): void;
}

export interface GracefulShutdownOptions {
  readonly hookTimeoutMs?: number;
  readonly drainTimeoutMs?: number;
}

interface RegisteredHook {
  readonly name: string;
  readonly hook: ShutdownHook;
  readonly order: number;
}

const processEmitter: ProcessSignalEmitter = {
  on: (signal: ShutdownSignal, listener: () => void): void => {
    process.on(signal, listener);
  },
  off: (signal: ShutdownSignal, listener: () => void): void => {
    process.off(signal, listener);
  },
};

const timers: TimeoutScheduler = {
  schedule: (callback: () => void, milliseconds: number): NodeJS.Timeout =>
    setTimeout(callback, milliseconds),
  cancel: (handle: unknown): void => clearTimeout(handle as NodeJS.Timeout),
};

export class GracefulShutdownService implements OnModuleInit, OnModuleDestroy {
  private readonly hooks = new Map<string, RegisteredHook>();
  private readonly hookTimeoutMs: number;
  private readonly drainTimeoutMs: number;
  private shutdownPromise: Promise<void> | undefined;
  private listening = false;
  private readonly signalListener = (): void => {
    void this.shutdown();
  };

  public constructor(
    private readonly activeRequests: ActiveRequestTracker,
    private readonly emitter: ProcessSignalEmitter = processEmitter,
    private readonly logger: ShutdownLogger = new Logger(
      GracefulShutdownService.name,
    ),
    private readonly timeoutScheduler: TimeoutScheduler = timers,
    options: GracefulShutdownOptions = {},
  ) {
    this.hookTimeoutMs = options.hookTimeoutMs ?? 10_000;
    this.drainTimeoutMs = options.drainTimeoutMs ?? 30_000;
    this.validateTimeout(this.hookTimeoutMs, 'Hook');
    this.validateTimeout(this.drainTimeoutMs, 'Drain');
  }

  public onModuleInit(): void {
    if (this.listening) {
      return;
    }
    this.emitter.on('SIGTERM', this.signalListener);
    this.emitter.on('SIGINT', this.signalListener);
    this.listening = true;
  }

  public onModuleDestroy(): Promise<void> {
    this.stopListening();
    return this.shutdown();
  }

  public register(name: string, hook: ShutdownHook, order = 0): () => void {
    if (name.trim().length === 0) {
      throw new TypeError('Shutdown hook name cannot be empty');
    }
    if (!Number.isFinite(order)) {
      throw new RangeError('Shutdown hook order must be finite');
    }
    if (this.shutdownPromise) {
      throw new Error('Cannot register a hook after shutdown has started');
    }
    this.hooks.set(name, { name, hook, order });
    return (): void => {
      this.hooks.delete(name);
    };
  }

  public shutdown(): Promise<void> {
    this.shutdownPromise ??= this.performShutdown();
    return this.shutdownPromise;
  }

  private async performShutdown(): Promise<void> {
    this.stopListening();
    const drained = await this.activeRequests.drain(this.drainTimeoutMs);
    if (!drained) {
      this.logger.error(
        `Active requests did not drain within ${this.drainTimeoutMs}ms`,
      );
    }

    const orderedHooks = [...this.hooks.values()].sort(
      (left: RegisteredHook, right: RegisteredHook): number =>
        left.order - right.order,
    );
    for (const registered of orderedHooks) {
      try {
        await this.withTimeout(registered.hook, registered.name);
      } catch (error: unknown) {
        this.logger.error(`Shutdown hook "${registered.name}" failed`, error);
      }
    }
  }

  private withTimeout(hook: ShutdownHook, name: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: unknown): void => {
        if (settled) {
          return;
        }
        settled = true;
        this.timeoutScheduler.cancel(timeoutHandle);
        if (error !== undefined) {
          reject(toError(error));
        } else {
          resolve();
        }
      };
      const timeoutHandle = this.timeoutScheduler.schedule(
        (): void =>
          finish(
            new Error(
              `Shutdown hook "${name}" timed out after ${this.hookTimeoutMs}ms`,
            ),
          ),
        this.hookTimeoutMs,
      );
      Promise.resolve()
        .then(hook)
        .then(
          (): void => finish(),
          (error: unknown): void => finish(error),
        );
    });
  }

  private stopListening(): void {
    if (!this.listening) {
      return;
    }
    this.emitter.off('SIGTERM', this.signalListener);
    this.emitter.off('SIGINT', this.signalListener);
    this.listening = false;
  }

  private validateTimeout(value: number, label: string): void {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(
        `${label} timeout must be a non-negative finite number`,
      );
    }
  }
}

function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  if (
    typeof error === 'string' ||
    typeof error === 'number' ||
    typeof error === 'boolean' ||
    typeof error === 'bigint'
  ) {
    return new Error(String(error));
  }
  try {
    return new Error(JSON.stringify(error));
  } catch {
    return new Error('Unknown shutdown hook failure');
  }
}
