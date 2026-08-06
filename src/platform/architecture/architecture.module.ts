import { Global, Module } from '@nestjs/common';
import { CLOCK } from './tokens/injection.tokens';
import { ModuleRegistry } from './module-registry';
import { SystemClock } from './system-clock';

@Global()
@Module({
  providers: [
    ModuleRegistry,
    SystemClock,
    { provide: CLOCK, useExisting: SystemClock },
  ],
  exports: [ModuleRegistry, CLOCK],
})
export class ArchitectureModule {}
