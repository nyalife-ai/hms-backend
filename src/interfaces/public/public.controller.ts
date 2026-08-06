import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';

/**
 * Public Controller.
 *
 * Unauthenticated endpoints used by load balancers, Kubernetes probes,
 * and clients that need basic API metadata without credentials.
 */
@ApiTags('Public')
@Controller('public')
export class PublicController {
  constructor(@Optional() private readonly configService?: ConfigService) {}

  /**
   * Liveness-style health check. Prefer Terminus-based `/health` routes
   * from HealthModule for readiness (DB/Redis) checks.
   */
  @Public()
  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check API process health' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'API process is running',
    schema: {
      example: {
        status: 'healthy',
        timestamp: '2026-07-25T12:00:00.000Z',
      },
    },
  })
  getHealth() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Non-sensitive API metadata for clients and integrations.
   */
  @Public()
  @Get('info')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get basic API metadata' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'API metadata retrieved successfully',
    schema: {
      example: {
        name: 'api',
        version: '1.0.0',
        environment: 'development',
        documentation: '/api/docs',
      },
    },
  })
  getInfo() {
    return {
      name:
        this.configService?.get<string>('app.name') ||
        process.env.APP_NAME ||
        'api',
      version: process.env.npm_package_version || '1.0.0',
      environment:
        this.configService?.get<string>('app.environment') ||
        process.env.NODE_ENV ||
        'development',
      documentation: '/api/docs',
    };
  }
}
