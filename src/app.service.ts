import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Returns basic API metadata and operational status.
   * Useful for quick uptime checks and verifying the active environment.
   */
  getApiInfo() {
    return {
      name: this.configService.get<string>('app.name', 'api'),
      version: process.env.npm_package_version || '1.0.0',
      environment: this.configService.get<string>(
        'app.environment',
        'development',
      ),
      status: 'operational',
      timestamp: new Date().toISOString(),
    };
  }
}
