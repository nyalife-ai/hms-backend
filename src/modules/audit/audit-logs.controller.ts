/**
 * Admin-only audit log browser (SUPER_ADMIN bypasses RolesGuard).
 */

import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuditLogsQueryDto } from './dto/audit-logs-query.dto';
import { HmsAuditQueryService } from './hms-audit-query.service';

@ApiTags('Audit logs')
@ApiBearerAuth()
@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AuditLogsController {
  public constructor(private readonly query: HmsAuditQueryService) {}

  @Get()
  @ApiOperation({ summary: 'List mutation audit logs (paginated + filters)' })
  list(@Query() query: AuditLogsQueryDto) {
    return this.query.list(query);
  }

  @Get('actors')
  @ApiOperation({ summary: 'Distinct users who appear in audit logs' })
  actors() {
    return this.query.listActors();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Audit log detail with old/new values' })
  detail(@Param('id') id: string) {
    return this.query.findById(id);
  }
}
