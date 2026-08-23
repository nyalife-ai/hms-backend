import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsExportService } from './services/analytics-export.service';
import { AnalyticsService } from './services/analytics.service';

@Module({
  imports: [PrismaModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsExportService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
