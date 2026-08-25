/**
 * Analytics HTTP API — aggregated live metrics per domain.
 */

import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/user.decorator';
import type { AuthUserPublic, HmsRole } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  ANALYTICS_DOMAINS,
  AnalyticsExportDto,
  AnalyticsQueryDto,
  type AnalyticsDomain,
} from './dto/analytics-query.dto';
import { AnalyticsExportService } from './services/analytics-export.service';
import { AnalyticsService } from './services/analytics.service';

const ALL_REPORTS: HmsRole[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'ACCOUNTANT',
  'DOCTOR',
  'NURSE',
  'RECEPTIONIST',
  'PHARMACIST',
  'LAB_TECHNICIAN',
  'RADIOLOGIST',
];

const FINANCE: HmsRole[] = ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'];

const DOMAIN_ROLES: Record<AnalyticsDomain, HmsRole[]> = {
  overview: ALL_REPORTS,
  financial: FINANCE,
  billing: FINANCE,
  insurance: FINANCE,
  'void-audit': FINANCE,
  appointments: [
    'SUPER_ADMIN',
    'ADMIN',
    'DOCTOR',
    'NURSE',
    'RECEPTIONIST',
  ],
  patients: [
    'SUPER_ADMIN',
    'ADMIN',
    'DOCTOR',
    'NURSE',
    'RECEPTIONIST',
  ],
  laboratory: ['SUPER_ADMIN', 'ADMIN', 'LAB_TECHNICIAN', 'DOCTOR'],
  pharmacy: ['SUPER_ADMIN', 'ADMIN', 'PHARMACIST'],
  ipd: ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'NURSE'],
  radiology: ['SUPER_ADMIN', 'ADMIN', 'RADIOLOGIST', 'DOCTOR'],
  staff: ['SUPER_ADMIN', 'ADMIN'],
  'follow-ups': [
    'SUPER_ADMIN',
    'ADMIN',
    'DOCTOR',
    'RECEPTIONIST',
  ],
};

@ApiTags('Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ALL_REPORTS)
@Controller('analytics')
export class AnalyticsController {
  public constructor(
    private readonly analytics: AnalyticsService,
    private readonly exports: AnalyticsExportService,
  ) {}

  @Get('overview')
  @ApiOperation({ summary: 'Role-scoped operational analytics overview' })
  overview(@Query() query: AnalyticsQueryDto, @CurrentUser() user: AuthUserPublic) {
    this.assertDomain('overview', user.role);
    return this.analytics.getDomain('overview', query, user.role);
  }

  @Get('financial')
  financial(@Query() query: AnalyticsQueryDto, @CurrentUser() user: AuthUserPublic) {
    this.assertDomain('financial', user.role);
    return this.analytics.getDomain('financial', query, user.role);
  }

  @Get('billing')
  billing(@Query() query: AnalyticsQueryDto, @CurrentUser() user: AuthUserPublic) {
    this.assertDomain('billing', user.role);
    return this.analytics.getDomain('billing', query, user.role);
  }

  @Get('appointments')
  appointments(
    @Query() query: AnalyticsQueryDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    this.assertDomain('appointments', user.role);
    return this.analytics.getDomain('appointments', query);
  }

  @Get('patients')
  patients(@Query() query: AnalyticsQueryDto, @CurrentUser() user: AuthUserPublic) {
    this.assertDomain('patients', user.role);
    return this.analytics.getDomain('patients', query);
  }

  @Get('laboratory')
  laboratory(
    @Query() query: AnalyticsQueryDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    this.assertDomain('laboratory', user.role);
    return this.analytics.getDomain('laboratory', query);
  }

  @Get('pharmacy')
  pharmacy(@Query() query: AnalyticsQueryDto, @CurrentUser() user: AuthUserPublic) {
    this.assertDomain('pharmacy', user.role);
    return this.analytics.getDomain('pharmacy', query);
  }

  @Get('ipd')
  ipd(@Query() query: AnalyticsQueryDto, @CurrentUser() user: AuthUserPublic) {
    this.assertDomain('ipd', user.role);
    return this.analytics.getDomain('ipd', query);
  }

  @Get('radiology')
  radiology(@Query() query: AnalyticsQueryDto, @CurrentUser() user: AuthUserPublic) {
    this.assertDomain('radiology', user.role);
    return this.analytics.getDomain('radiology', query);
  }

  @Get('insurance')
  insurance(@Query() query: AnalyticsQueryDto, @CurrentUser() user: AuthUserPublic) {
    this.assertDomain('insurance', user.role);
    return this.analytics.getDomain('insurance', query);
  }

  @Get('staff')
  staff(@Query() query: AnalyticsQueryDto, @CurrentUser() user: AuthUserPublic) {
    this.assertDomain('staff', user.role);
    return this.analytics.getDomain('staff', query);
  }

  @Get('void-audit')
  voidAudit(@Query() query: AnalyticsQueryDto, @CurrentUser() user: AuthUserPublic) {
    this.assertDomain('void-audit', user.role);
    return this.analytics.getDomain('void-audit', query);
  }

  @Get('follow-ups')
  followUps(@Query() query: AnalyticsQueryDto, @CurrentUser() user: AuthUserPublic) {
    this.assertDomain('follow-ups', user.role);
    return this.analytics.getDomain('follow-ups', query);
  }

  @Post(':domain/export')
  @ApiOperation({ summary: 'Export analytics for a domain (same filters as GET)' })
  async export(
    @Param('domain') domain: string,
    @Body() body: AnalyticsExportDto,
    @CurrentUser() user: AuthUserPublic,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!ANALYTICS_DOMAINS.includes(domain as AnalyticsDomain)) {
      throw new BadRequestException(`Unknown analytics domain: ${domain}`);
    }
    const d = domain as AnalyticsDomain;
    this.assertDomain(d, user.role);
    const payload = await this.analytics.getDomain(d, body, user.role);
    const format = body.format ?? 'csv';
    if (format === 'xlsx') {
      const buf = this.exports.toXlsxJson(payload);
      res.set({
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="analytics-${d}.json"`,
      });
      return new StreamableFile(buf);
    }
    const buf = this.exports.toCsv(payload);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="analytics-${d}.csv"`,
    });
    return new StreamableFile(buf);
  }

  private assertDomain(domain: AnalyticsDomain, role: HmsRole) {
    const allowed = DOMAIN_ROLES[domain] ?? [];
    if (!allowed.includes(role)) {
      throw new ForbiddenException(
        `Role ${role} cannot access analytics domain ${domain}`,
      );
    }
  }
}
