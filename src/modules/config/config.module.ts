import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RuntimeConfigController } from './config.controller';
import { RuntimeConfigService } from './config.service';

/**
 * Runtime configuration exposure module.
 *
 * Typed env validation remains in `src/config`. This module only exposes
 * safe/non-secret snapshots for clients and operators.
 */
@Module({
  imports: [ConfigModule],
  controllers: [RuntimeConfigController],
  providers: [RuntimeConfigService],
  exports: [RuntimeConfigService],
})
export class RuntimeConfigModule {}
