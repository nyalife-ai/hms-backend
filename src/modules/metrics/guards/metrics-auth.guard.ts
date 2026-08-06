import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

/**
 * Bearer-token guard for `/metrics`.
 *
 * - Production: METRICS_TOKEN is required (fail closed when missing).
 * - Non-production: missing token allows local scrapers.
 */
@Injectable()
export class MetricsAuthGuard implements CanActivate {
  private readonly token: string | undefined;
  private readonly isProduction: boolean;

  public constructor(private readonly configService: ConfigService) {
    this.token =
      configService.get<string>('METRICS_TOKEN') ??
      configService.get<string>('metrics.token');
    this.isProduction =
      (configService.get<string>('app.environment') ??
        configService.get<string>('NODE_ENV') ??
        process.env.NODE_ENV) === 'production';
  }

  public canActivate(context: ExecutionContext): boolean {
    if (!this.token) {
      if (this.isProduction) {
        throw new UnauthorizedException('Metrics token is not configured');
      }
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const authHeader = req.headers.authorization ?? '';
    const provided = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!provided || !this.areTokensEqual(provided, this.token)) {
      throw new UnauthorizedException('Invalid metrics token');
    }
    return true;
  }

  private areTokensEqual(left: string, right: string): boolean {
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
