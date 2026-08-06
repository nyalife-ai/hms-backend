import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MetricsService } from './metrics.service';
import { MetricsAuthGuard } from './guards/metrics-auth.guard';

@ApiTags('Metrics')
@Controller('metrics')
@UseGuards(MetricsAuthGuard)
@ApiBearerAuth()
export class MetricsController {
  public constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @ApiOperation({
    summary: 'Prometheus scrape endpoint',
    description:
      'Protected by METRICS_TOKEN bearer auth when configured. Open in local development when METRICS_TOKEN is unset.',
  })
  public scrape(): Promise<string> {
    return this.metricsService.getMetrics();
  }
}
