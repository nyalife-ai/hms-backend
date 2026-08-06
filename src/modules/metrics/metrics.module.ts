import { Global, Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { MetricsAuthGuard } from './guards/metrics-auth.guard';

/**
 * Global Prometheus metrics module.
 *
 * Provides {@link MetricsService} for HTTP interceptors and the `/metrics`
 * scrape endpoint. Domain-specific listeners belong in feature modules.
 */
@Global()
@Module({
  controllers: [MetricsController],
  providers: [MetricsService, MetricsAuthGuard],
  exports: [MetricsService],
})
export class MetricsModule {}
