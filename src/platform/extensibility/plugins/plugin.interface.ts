export type PluginState =
  'registered' | 'installed' | 'initialized' | 'started' | 'stopped';

export interface PluginContext {
  readonly services: ReadonlyMap<string | symbol, unknown>;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface Plugin {
  readonly name: string;
  readonly version: string;
  readonly dependencies?: readonly string[];
  install(context: PluginContext): void | Promise<void>;
  initialize(context: PluginContext): void | Promise<void>;
  start(context: PluginContext): void | Promise<void>;
  stop(context: PluginContext): void | Promise<void>;
}

export interface PluginFailure {
  readonly plugin: string;
  readonly transition: Exclude<PluginState, 'registered'>;
  readonly error: Error;
  readonly timestamp: Date;
}
