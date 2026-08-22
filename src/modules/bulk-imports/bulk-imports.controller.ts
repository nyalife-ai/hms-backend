/**
 * Bulk import HTTP API — template, example, validate, commit, error report.
 */

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/user.decorator';
import type { AuthUserPublic } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { BulkImportsService } from './bulk-imports.service';

type UploadedCsv = {
  buffer?: Buffer;
  originalname?: string;
};

@ApiTags('Bulk Imports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('bulk-imports')
export class BulkImportsController {
  public constructor(private readonly service: BulkImportsService) {}

  @Get(':resource/template')
  @Roles('ADMIN', 'RECEPTIONIST', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Download CSV template (headers only)' })
  template(
    @Param('resource') resource: string,
    @Res() res: Response,
  ): void {
    const { filename, csv } = this.service.getTemplate(resource);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    res.send(csv);
  }

  @Get(':resource/example')
  @Roles('ADMIN', 'RECEPTIONIST', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Download example CSV with sample rows' })
  example(
    @Param('resource') resource: string,
    @Res() res: Response,
  ): void {
    const { filename, csv } = this.service.getExample(resource);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    res.send(csv);
  }

  @Post(':resource/validate')
  @Roles('ADMIN', 'RECEPTIONIST', 'SUPER_ADMIN')
  @ApiOperation({
    summary: 'Upload CSV, validate, and return a preview session (no writes)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  validate(
    @Param('resource') resource: string,
    @UploadedFile() file: UploadedCsv | undefined,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.service.validate(
      resource,
      {
        buffer: file?.buffer ?? Buffer.alloc(0),
        originalname: file?.originalname,
      },
      user.id,
    );
  }

  @Post(':resource/commit')
  @Roles('ADMIN', 'RECEPTIONIST', 'SUPER_ADMIN')
  @ApiOperation({
    summary: 'Confirm a validated import session and create records',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { sessionId: { type: 'string', format: 'uuid' } },
      required: ['sessionId'],
    },
  })
  commit(
    @Param('resource') resource: string,
    @Body() body: { sessionId?: string },
    @CurrentUser() user: AuthUserPublic,
  ) {
    const sessionId = body?.sessionId?.trim();
    if (!sessionId) {
      throw new BadRequestException('sessionId is required.');
    }
    return this.service.commit(resource, sessionId, user.id);
  }

  @Get(':resource/sessions/:sessionId/errors.csv')
  @Roles('ADMIN', 'RECEPTIONIST', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Download validation error/warning report as CSV' })
  async errorsCsv(
    @Param('resource') resource: string,
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: AuthUserPublic,
    @Res() res: Response,
  ): Promise<void> {
    const { filename, csv } = await this.service.getErrorsCsv(
      resource,
      sessionId,
      user.id,
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    res.send(csv);
  }
}
