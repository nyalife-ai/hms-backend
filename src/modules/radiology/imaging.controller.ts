import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/user.decorator';
import type { AuthUserPublic, HmsRole } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { RadiologyClinicalUseCase } from './use-cases/radiology-clinical.usecase';
import {
  ImagingRequestsQueryDto,
  ImagingScanTypesQueryDto,
} from './dto/imaging-query.dto';
import { resolveListPagination } from '../../platform/api/pagination/pagination-query.dto';

const RAD: HmsRole[] = ['ADMIN', 'SUPER_ADMIN', 'RADIOLOGIST', 'DOCTOR'];
const RAD_CONFIG: HmsRole[] = ['ADMIN', 'SUPER_ADMIN', 'RADIOLOGIST'];

@ApiTags('Imaging')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('imaging')
export class ImagingController {
  public constructor(private readonly clinical: RadiologyClinicalUseCase) {}

  @Get('scan-types')
  @Roles(...RAD)
  listScanTypes(@Query() query: ImagingScanTypesQueryDto) {
    return this.clinical.listScanTypes({
      active:
        query.active === 'true'
          ? true
          : query.active === 'false'
            ? false
            : undefined,
      search: query.search,
    });
  }

  @Post('scan-types')
  @Roles(...RAD_CONFIG)
  @ApiOperation({ summary: 'Create radiology scan type' })
  createScanType(
    @Body()
    body: {
      scanType: string;
      category?: string;
      description?: string;
      standardPrice?: number;
      typicalDurationMinutes?: number;
      contrastRequired?: boolean;
    },
  ) {
    return this.clinical.createScanType(body);
  }

  @Patch('scan-types/:id')
  @Roles(...RAD_CONFIG)
  updateScanType(
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    body: {
      scanType?: string;
      category?: string;
      description?: string;
      standardPrice?: number;
      typicalDurationMinutes?: number;
      contrastRequired?: boolean;
      isActive?: boolean;
    },
  ) {
    return this.clinical.updateScanType(id, body);
  }

  @Get('requests')
  @Roles(...RAD)
  listRequests(@Query() query: ImagingRequestsQueryDto) {
    const page = resolveListPagination(query);
    return this.clinical.listRequests({
      status: query.status,
      patientId: query.patientId,
      search: query.search,
      take: page.take,
      skip: page.skip,
    });
  }

  @Get('requests/:id')
  @Roles(...RAD)
  getRequest(@Param('id', ParseUUIDPipe) id: string) {
    return this.clinical.getRequest(id);
  }

  @Post('requests/:id/findings')
  @Roles(...RAD_CONFIG)
  upsertFindings(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPublic,
    @Body() body: { findingsText?: string; status?: string; radiologistId?: string },
  ) {
    const radiologistId = body.radiologistId || user.staffProfileId;
    if (!radiologistId) {
      throw new BadRequestException(
        'radiologistId is required (admin must select a radiologist).',
      );
    }
    return this.clinical.upsertFindings(id, {
      radiologistId,
      findingsText: body.findingsText,
      status: body.status,
    });
  }

  @Post('requests/:id/report')
  @Roles(...RAD_CONFIG)
  upsertReport(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPublic,
    @Body()
    body: {
      radiologistId?: string;
      finalImpression?: string;
      conclusion?: string;
      recommendations?: string;
      signature?: string;
    },
  ) {
    const radiologistId = body.radiologistId || user.staffProfileId;
    if (!radiologistId) {
      throw new BadRequestException(
        'radiologistId is required (admin must select a radiologist).',
      );
    }
    return this.clinical.upsertReport(id, {
      radiologistId,
      finalImpression: body.finalImpression,
      conclusion: body.conclusion,
      recommendations: body.recommendations,
      signature: body.signature,
    });
  }

  @Post('requests/:id/images')
  @Roles(...RAD_CONFIG)
  addImage(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPublic,
    @Body()
    body: {
      filePath: string;
      modality?: string;
      seriesDescription?: string;
      numberOfImages?: number;
    },
  ) {
    return this.clinical.addImage(id, {
      ...body,
      uploadedBy: user.id,
    });
  }
}
