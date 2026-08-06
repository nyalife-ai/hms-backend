import type { DynamicModule, ModuleMetadata, Type } from '@nestjs/common';

export interface DynamicModuleParts {
  readonly imports?: ModuleMetadata['imports'];
  readonly providers?: ModuleMetadata['providers'];
  readonly exports?: ModuleMetadata['exports'];
  readonly global?: boolean;
}

/** Creates a normalized Nest dynamic-module descriptor. */
export const buildDynamicModule = (
  module: Type<unknown>,
  parts: DynamicModuleParts = {},
): DynamicModule => ({
  module,
  global: parts.global,
  imports: parts.imports ?? [],
  providers: parts.providers ?? [],
  exports: parts.exports ?? [],
});

/** Copies supported module metadata into a dynamic-module descriptor. */
export const dynamicModuleFromMetadata = (
  module: Type<unknown>,
  metadata: ModuleMetadata,
): DynamicModule =>
  buildDynamicModule(module, {
    imports: metadata.imports,
    providers: metadata.providers,
    exports: metadata.exports,
  });
