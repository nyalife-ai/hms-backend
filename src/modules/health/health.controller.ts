import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { HealthService } from './health.service';
import {
  HealthCheckResultDto,
  SystemMetricsDto,
} from './dto/health-response.dto';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  public constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aggregate dependency health checks' })
  public async healthCheck(): Promise<HealthCheckResultDto> {
    const checks = await this.healthService.checkAll();
    const allUp = Object.values(checks).every((check) => check.status === 'up');

    return {
      status: allUp ? 'ok' : 'error',
      info: allUp ? checks : undefined,
      error: allUp ? undefined : checks,
      timestamp: new Date(),
    };
  }

  @Public()
  @Get('ready')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Readiness probe for load balancers' })
  public async readinessCheck(): Promise<{ status: string }> {
    const isReady = await this.healthService.checkReady();
    return { status: isReady ? 'ready' : 'not_ready' };
  }

  @Public()
  @Get('live')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Liveness probe for process health' })
  public livenessCheck(): { status: 'alive' } {
    return { status: 'alive' };
  }

  @Public()
  @Get('metrics')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Process resource snapshot' })
  public metrics(): SystemMetricsDto {
    return this.healthService.getMetrics();
  }

  @Public()
  @Get('version')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Runtime version metadata' })
  public version(): { version: string; environment: string } {
    return {
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
    };
  }
}
