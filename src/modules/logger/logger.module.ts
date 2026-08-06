import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppLogger } from './logger.service';

/**
 * Global logger module.  Marked @Global so AppLogger can be injected
 * anywhere without re-importing LoggerModule in each feature module.
 *
 * Usage:
 *   constructor(private readonly logger: AppLogger) {
 *     this.logger.setContext(MyService.name);
 *   }
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [AppLogger],
  exports: [AppLogger],
})
export class LoggerModule {}
