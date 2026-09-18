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
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/user.decorator';
import type { AuthUserPublic, HmsRole } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  MAX_RADIOLOGY_IMAGE_BYTES,
  RadiologyOperationsUseCase,
} from './use-cases/radiology-operations.usecase';
import { RadiologyJourneyUseCase } from './use-cases/radiology-journey.usecase';
import {
  AddImageDto,
  AmendReportDto,
  CancelImagingRequestDto,
  CreateImagingRequestDto,
  CreateReportTemplateDto,
  CreateScanTypeDto,
  EnterFindingsDto,
  EnterReportDto,
  ScheduleImagingRequestDto,
  UpdateReportTemplateDto,
  UpdateScanTypeDto,
} from './dto/imaging-body.dto';
import {
  ImagingReportTemplatesQueryDto,
  ImagingRequestsQueryDto,
  ImagingScanTypesQueryDto,
} from './dto/imaging-query.dto';
import { resolveListPagination } from '../../platform/api/pagination/pagination-query.dto';

const RAD: HmsRole[] = ['ADMIN', 'SUPER_ADMIN', 'RADIOLOGIST', 'DOCTOR'];
const RAD_CONFIG: HmsRole[] = ['ADMIN', 'SUPER_ADMIN', 'RADIOLOGIST'];

function requireRadiologistId(body: { radiologistId?: string }, user: AuthUserPublic): string {
  const id = body.radiologistId || user.staffProfileId;
  if (!id) {
    throw new BadRequestException(
      'radiologistId is required (admin must select a radiologist).',
    );
  }
  return id;
}

@ApiTags('Imaging')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('imaging')
export class ImagingController {
  public constructor(
    private readonly ops: RadiologyOperationsUseCase,
    private readonly journey: RadiologyJourneyUseCase,
  ) {}

  @Get('overview')
  @Roles(...RAD)
  overview() {
    return this.ops.overview();
  }

  // ── Scan types ─────────────────────────────────────────────

  @Get('scan-types')
  @Roles(...RAD)
  listScanTypes(@Query() query: ImagingScanTypesQueryDto) {
    return this.ops.listScanTypes({
      active: query.active === 'true' ? true : query.active === 'false' ? false : undefined,
      departmentId: query.departmentId,
      search: query.search,
    });
  }

  @Post('scan-types')
  @Roles(...RAD_CONFIG)
  @ApiOperation({ summary: 'Create radiology scan type' })
  createScanType(@Body() body: CreateScanTypeDto, @CurrentUser() user: AuthUserPublic) {
    return this.ops.createScanType({ ...body, actorUserId: user.id });
  }

  @Patch('scan-types/:id')
  @Roles(...RAD_CONFIG)
  updateScanType(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateScanTypeDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.ops.updateScanType(id, { ...body, actorUserId: user.id });
  }

  // ── Report templates ──────────────────────────────────────

  @Get('report-templates')
  @Roles(...RAD)
  listReportTemplates(@Query() query: ImagingReportTemplatesQueryDto) {
    return this.ops.listReportTemplates({
      active: query.active === 'true' ? true : query.active === 'false' ? false : undefined,
      modality: query.modality,
    });
  }

  @Get('report-templates/:id')
  @Roles(...RAD)
  getReportTemplate(@Param('id', ParseUUIDPipe) id: string) {
    return this.ops.getReportTemplate(id);
  }

  @Post('report-templates')
  @Roles(...RAD_CONFIG)
  createReportTemplate(
    @Body() body: CreateReportTemplateDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.ops.createReportTemplate({ ...body, actorUserId: user.id });
  }

  @Patch('report-templates/:id')
  @Roles(...RAD_CONFIG)
  updateReportTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateReportTemplateDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.ops.updateReportTemplate(id, { ...body, actorUserId: user.id });
  }

  // ── Requests: read ─────────────────────────────────────────

  @Get('requests')
  @Roles(...RAD)
  listRequests(@Query() query: ImagingRequestsQueryDto) {
    const page = resolveListPagination(query);
    return this.ops.listRequests({
      status: query.status,
      priority: query.priority,
      patientId: query.patientId,
      requestingDoctorId: query.requestingDoctorId,
      departmentId: query.departmentId,
      modality: query.modality,
      search: query.search,
      from: query.from,
      to: query.to,
      take: page.take,
      skip: page.skip,
    });
  }

  @Get('requests/:id')
  @Roles(...RAD)
  getRequest(@Param('id', ParseUUIDPipe) id: string) {
    return this.ops.getRequest(id);
  }

  @Get('requests/:id/report/docx')
  @Roles(...RAD)
  @ApiOperation({ summary: 'Download the current finalized/amended report as a DOCX' })
  async downloadReportDocx(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const buffer = await this.ops.generateReportDocx(id);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="radiology-report-${id}.docx"`,
    });
    return new StreamableFile(buffer);
  }

  // ── Requests: lifecycle ────────────────────────────────────

  @Post('requests')
  @Roles('ADMIN', 'SUPER_ADMIN', 'DOCTOR', 'RADIOLOGIST')
  @ApiOperation({ summary: 'Create imaging request (the one canonical creation path)' })
  createRequest(@Body() body: CreateImagingRequestDto, @CurrentUser() user: AuthUserPublic) {
    return this.journey.createRequest({ ...body, requestedBy: user.id });
  }

  @Post('requests/:id/schedule')
  @Roles(...RAD_CONFIG)
  scheduleRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ScheduleImagingRequestDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.journey.scheduleRequest(id, { ...body, actorUserId: user.id });
  }

  @Post('requests/:id/check-in')
  @Roles(...RAD_CONFIG)
  checkIn(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUserPublic) {
    return this.journey.checkIn(id, user.id);
  }

  @Post('requests/:id/start')
  @Roles(...RAD_CONFIG)
  startExam(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUserPublic) {
    return this.journey.startExam(id, user.id);
  }

  @Post('requests/:id/complete')
  @Roles(...RAD_CONFIG)
  completeExam(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUserPublic) {
    return this.journey.completeExam(id, user.id);
  }

  @Post('requests/:id/cancel')
  @Roles(...RAD)
  cancelRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CancelImagingRequestDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.journey.cancelRequest(id, { ...body, actorUserId: user.id });
  }

  @Post('requests/:id/no-show')
  @Roles(...RAD_CONFIG)
  markNoShow(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUserPublic) {
    return this.journey.markNoShow(id, user.id);
  }

  @Post('requests/:id/finalize')
  @Roles(...RAD_CONFIG)
  @ApiOperation({ summary: 'Release the reported request to the referring doctor' })
  finalizeRequest(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUserPublic) {
    return this.journey.finalizeRequest(id, user.id);
  }

  // ── Findings / report ──────────────────────────────────────

  @Post('requests/:id/findings')
  @Roles(...RAD_CONFIG)
  enterFindings(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPublic,
    @Body() body: EnterFindingsDto,
  ) {
    return this.journey.enterFindings(id, {
      ...body,
      radiologistId: requireRadiologistId(body, user),
      actorUserId: user.id,
    });
  }

  @Post('requests/:id/report')
  @Roles(...RAD_CONFIG)
  enterReport(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPublic,
    @Body() body: EnterReportDto,
  ) {
    return this.journey.enterReport(id, {
      ...body,
      radiologistId: requireRadiologistId(body, user),
      actorUserId: user.id,
    });
  }

  @Post('requests/:id/report/amend')
  @Roles(...RAD_CONFIG)
  amendReport(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPublic,
    @Body() body: AmendReportDto,
  ) {
    return this.journey.amendReport(id, {
      ...body,
      radiologistId: requireRadiologistId(body, user),
      actorUserId: user.id,
    });
  }

  @Post('requests/:id/images')
  @Roles(...RAD_CONFIG)
  @ApiOperation({ summary: 'Upload a study image/attachment for this request' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_RADIOLOGY_IMAGE_BYTES },
    }),
  )
  uploadImage(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedImageFile | undefined,
    @CurrentUser() user: AuthUserPublic,
    @Body() body: AddImageDto,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File is required');
    }
    return this.ops.uploadImage(id, {
      buffer: file.buffer,
      originalname: file.originalname || 'image',
      mimetype: file.mimetype,
      size: file.size,
      ...body,
      uploadedBy: user.id,
    });
  }

  @Get('images/:id/download')
  @Roles(...RAD)
  @ApiOperation({ summary: 'Get image download metadata / signed URL' })
  downloadImage(@Param('id', ParseUUIDPipe) id: string) {
    return this.ops.getImageDownload(id);
  }

  @Get('images/:id/content')
  @Roles(...RAD)
  @ApiOperation({ summary: 'Stream image content (authenticated)' })
  async streamImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const image = await this.ops.getImageBuffer(id);
    const inline = image.mimeType.startsWith('image/') || image.mimeType === 'application/pdf';
    const safeName = image.fileName.replace(/"/g, '');
    res.set({
      'Content-Type': image.mimeType,
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${safeName}"`,
    });
    return new StreamableFile(image.buffer);
  }
}

type UploadedImageFile = {
  buffer?: Buffer;
  originalname?: string;
  mimetype?: string;
  size?: number;
};
