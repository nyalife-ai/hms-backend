/**
 * Radiology configuration/read-side — scan types, report templates, and
 * request read/list/mapping shared by RadiologyJourneyUseCase.
 * Mirrors laboratory/use-cases/lab-operations.usecase.ts.
 */

import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '../../../generated/prisma';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { STORAGE_PROVIDER, type StorageProvider } from '../../../platform/storage';
import { HmsAuditWriter } from '../../audit/hms-audit.writer';
import { resolveRevenueAccountCode } from '../../billing/domain/service-revenue-account';
import { generateRadiologyReportDocx } from '../reporting/radiology-report.docx';

export const MAX_RADIOLOGY_IMAGE_BYTES = 25 * 1024 * 1024;

const FACILITY_SETTING_KEYS = [
  'hospital_name',
  'contact_address',
  'hospital_address',
  'contact_phone',
  'hospital_phone',
  'contact_email',
  'hospital_email',
] as const;

const FACILITY_DEFAULTS: Record<(typeof FACILITY_SETTING_KEYS)[number], string> = {
  hospital_name: "NyaLife Women's Clinic",
  contact_address: '',
  hospital_address: '7514-00200, Nairobi',
  contact_phone: '',
  hospital_phone: '+254746516514',
  contact_email: '',
  hospital_email: 'info@nyalifewomensclinic.com',
};

function ageFromDob(dob: Date | null | undefined): number | null {
  if (!dob) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age -= 1;
  return Math.max(0, age);
}

export const IMAGING_PRIORITIES = ['ROUTINE', 'URGENT', 'STAT'] as const;
export const IMAGING_REQUEST_STATUSES = [
  'PENDING',
  'SCHEDULED',
  'CHECKED_IN',
  'IN_PROGRESS',
  'COMPLETED',
  'REPORT_PENDING',
  'REPORTED',
  'FINALIZED',
  'CANCELLED',
  'NO_SHOW',
] as const;

@Injectable()
export class RadiologyOperationsUseCase {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly audit: HmsAuditWriter,
    @Optional()
    @Inject(STORAGE_PROVIDER)
    private readonly storage?: StorageProvider,
  ) {}

  // ── Scan types ─────────────────────────────────────────────

  public async listScanTypes(filters?: {
    active?: boolean;
    departmentId?: string;
    search?: string;
  }) {
    const q = filters?.search?.trim();
    const rows = await this.prisma.scanTypes.findMany({
      where: {
        ...(filters?.active === undefined ? {} : { is_active: filters.active }),
        ...(filters?.departmentId ? { department_id: filters.departmentId } : {}),
        ...(q
          ? {
              OR: [
                { scan_type: { contains: q, mode: 'insensitive' as const } },
                { category: { contains: q, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      include: { department: true },
      orderBy: { scan_type: 'asc' },
    });
    return rows.map((r) => this.mapScanType(r));
  }

  public async createScanType(input: {
    scanType: string;
    category?: string;
    description?: string;
    standardPrice?: number;
    typicalDurationMinutes?: number;
    contrastRequired?: boolean;
    preparationInstructions?: string;
    departmentId?: string;
    actorUserId: string;
  }) {
    const name = input.scanType.trim();
    if (!name) throw new BadRequestException('scanType is required');
    if (input.departmentId) {
      await this.assertDepartmentExists(input.departmentId);
    }

    const billingServiceId = await this.syncBillingService({
      scanType: name,
      category: input.category,
      standardPrice: input.standardPrice ?? 0,
      actorUserId: input.actorUserId,
    });

    const row = await this.prisma.scanTypes.create({
      data: {
        scan_type: name,
        category: input.category?.trim() || null,
        description: input.description?.trim() || null,
        standard_price: input.standardPrice ?? 0,
        typical_duration_minutes: input.typicalDurationMinutes ?? null,
        contrast_required: Boolean(input.contrastRequired),
        preparation_instructions: input.preparationInstructions?.trim() || null,
        department_id: input.departmentId || null,
        billing_service_id: billingServiceId,
        is_active: true,
      },
      include: { department: true },
    });
    await this.audit.recordMutation({
      userId: input.actorUserId,
      action: 'CREATE',
      entityType: 'radiology.scan_types',
      entityId: row.id,
      newValues: { scanType: row.scan_type },
    });
    return this.mapScanType(row);
  }

  public async updateScanType(
    id: string,
    input: {
      scanType?: string;
      category?: string;
      description?: string;
      standardPrice?: number;
      typicalDurationMinutes?: number;
      contrastRequired?: boolean;
      preparationInstructions?: string;
      departmentId?: string | null;
      isActive?: boolean;
      actorUserId: string;
    },
  ) {
    const existing = await this.prisma.scanTypes.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException('Scan type not found');
    if (input.departmentId) {
      await this.assertDepartmentExists(input.departmentId);
    }

    let billingServiceId = existing.billing_service_id;
    if (input.scanType !== undefined || input.standardPrice !== undefined) {
      billingServiceId = await this.syncBillingService({
        existingServiceId: existing.billing_service_id,
        scanType: input.scanType?.trim() || existing.scan_type,
        category: input.category ?? existing.category ?? undefined,
        standardPrice: input.standardPrice ?? Number(existing.standard_price),
        actorUserId: input.actorUserId,
      });
    }

    const row = await this.prisma.scanTypes.update({
      where: { id },
      data: {
        ...(input.scanType ? { scan_type: input.scanType.trim() } : {}),
        ...(input.category !== undefined
          ? { category: input.category.trim() || null }
          : {}),
        ...(input.description !== undefined
          ? { description: input.description.trim() || null }
          : {}),
        ...(input.standardPrice !== undefined
          ? { standard_price: input.standardPrice }
          : {}),
        ...(input.typicalDurationMinutes !== undefined
          ? { typical_duration_minutes: input.typicalDurationMinutes }
          : {}),
        ...(input.contrastRequired !== undefined
          ? { contrast_required: input.contrastRequired }
          : {}),
        ...(input.preparationInstructions !== undefined
          ? { preparation_instructions: input.preparationInstructions.trim() || null }
          : {}),
        ...(input.departmentId !== undefined
          ? { department_id: input.departmentId || null }
          : {}),
        ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
        billing_service_id: billingServiceId,
      },
      include: { department: true },
    });
    await this.audit.recordMutation({
      userId: input.actorUserId,
      action: 'UPDATE',
      entityType: 'radiology.scan_types',
      entityId: id,
      newValues: input,
    });
    return this.mapScanType(row);
  }

  /** Keep a linked billing.services row (category "Imaging") in sync with the scan type's name/price. */
  private async syncBillingService(input: {
    existingServiceId?: string | null;
    scanType: string;
    category?: string;
    standardPrice: number;
    actorUserId: string;
  }): Promise<string | null> {
    const code = `RAD-${input.scanType
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40)}`;

    if (input.existingServiceId) {
      const row = await this.prisma.services.update({
        where: { id: input.existingServiceId },
        data: {
          service_name: input.scanType,
          standard_price: new Prisma.Decimal(input.standardPrice),
        },
      });
      return row.id;
    }

    const accountCode = resolveRevenueAccountCode({
      category: 'Imaging',
      serviceCode: code,
      serviceName: input.scanType,
    });
    const account = await this.prisma.accounts.findUnique({
      where: { account_code: accountCode },
    });
    const revenueAccountId =
      account && account.is_active && account.is_postable && account.account_type === 'REVENUE'
        ? account.id
        : null;

    try {
      const row = await this.prisma.services.create({
        data: {
          service_code: code,
          service_name: input.scanType,
          category: 'Imaging',
          description: 'Radiology scan type (synced)',
          standard_price: new Prisma.Decimal(input.standardPrice),
          revenue_account_id: revenueAccountId,
          is_active: true,
        },
      });
      await this.audit.recordMutation({
        userId: input.actorUserId,
        action: 'CREATE',
        entityType: 'billing.services',
        entityId: row.id,
        newValues: { serviceCode: row.service_code, via: 'radiology' },
      });
      return row.id;
    } catch (err) {
      // Service code collision (e.g. re-created scan type with the same
      // name) — link to the existing row instead of failing scan-type save.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existingService = await this.prisma.services.findUnique({
          where: { service_code: code },
        });
        return existingService?.id ?? null;
      }
      throw err;
    }
  }

  private async assertDepartmentExists(departmentId: string): Promise<void> {
    const dept = await this.prisma.departments.findFirst({
      where: { id: departmentId, is_active: true },
    });
    if (!dept) throw new BadRequestException('Department not found or inactive');
  }

  // ── Report templates ──────────────────────────────────────

  public async listReportTemplates(filters?: { active?: boolean; modality?: string }) {
    const rows = await this.prisma.reportTemplates.findMany({
      where: {
        ...(filters?.active === undefined ? {} : { is_active: filters.active }),
        ...(filters?.modality ? { modality: filters.modality } : {}),
      },
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => this.mapReportTemplate(r));
  }

  public async getReportTemplate(id: string) {
    const row = await this.prisma.reportTemplates.findFirst({ where: { id } });
    if (!row) throw new NotFoundException('Report template not found');
    return this.mapReportTemplate(row);
  }

  public async createReportTemplate(input: {
    name: string;
    modality?: string;
    bodyRegion?: string;
    sections?: Array<{ key: string; label: string; type: string; required?: boolean }>;
    actorUserId: string;
  }) {
    const name = input.name.trim();
    if (!name) throw new BadRequestException('name is required');
    try {
      const row = await this.prisma.reportTemplates.create({
        data: {
          name,
          modality: input.modality?.trim() || null,
          body_region: input.bodyRegion?.trim() || null,
          sections: (input.sections ?? []) as unknown as Prisma.InputJsonValue,
          is_active: true,
        },
      });
      await this.audit.recordMutation({
        userId: input.actorUserId,
        action: 'CREATE',
        entityType: 'radiology.report_templates',
        entityId: row.id,
        newValues: { name: row.name },
      });
      return this.mapReportTemplate(row);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException(`Report template "${name}" already exists`);
      }
      throw err;
    }
  }

  public async updateReportTemplate(
    id: string,
    input: {
      name?: string;
      modality?: string;
      bodyRegion?: string;
      sections?: Array<{ key: string; label: string; type: string; required?: boolean }>;
      isActive?: boolean;
      actorUserId: string;
    },
  ) {
    const existing = await this.prisma.reportTemplates.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException('Report template not found');
    const row = await this.prisma.reportTemplates.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name.trim() } : {}),
        ...(input.modality !== undefined
          ? { modality: input.modality.trim() || null }
          : {}),
        ...(input.bodyRegion !== undefined
          ? { body_region: input.bodyRegion.trim() || null }
          : {}),
        ...(input.sections !== undefined
          ? { sections: input.sections as unknown as Prisma.InputJsonValue }
          : {}),
        ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
      },
    });
    await this.audit.recordMutation({
      userId: input.actorUserId,
      action: 'UPDATE',
      entityType: 'radiology.report_templates',
      entityId: id,
      newValues: input,
    });
    return this.mapReportTemplate(row);
  }

  // ── Overview ───────────────────────────────────────────────

  public async overview() {
    const [byStatus, activeScanTypes, todaysCompleted, urgent] = await Promise.all([
      this.prisma.radiologyRequests.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.scanTypes.count({ where: { is_active: true } }),
      this.prisma.radiologyRequests.count({
        where: { completed_at: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      }),
      this.prisma.radiologyRequests.count({
        where: { priority: { in: ['URGENT', 'STAT'] }, status: { notIn: ['FINALIZED', 'CANCELLED', 'NO_SHOW'] } },
      }),
    ]);
    const counts: Record<string, number> = {};
    for (const row of byStatus) counts[row.status] = row._count._all;
    return {
      activeScanTypes,
      todaysCompleted,
      urgentOutstanding: urgent,
      pending: counts.PENDING ?? 0,
      scheduled: counts.SCHEDULED ?? 0,
      checkedIn: counts.CHECKED_IN ?? 0,
      inProgress: counts.IN_PROGRESS ?? 0,
      completed: counts.COMPLETED ?? 0,
      reportPending: counts.REPORT_PENDING ?? 0,
      reported: counts.REPORTED ?? 0,
      finalized: counts.FINALIZED ?? 0,
      cancelled: counts.CANCELLED ?? 0,
      noShow: counts.NO_SHOW ?? 0,
    };
  }

  // ── Requests: read side ───────────────────────────────────

  public async listRequests(filters?: {
    status?: string;
    priority?: string;
    patientId?: string;
    requestingDoctorId?: string;
    departmentId?: string;
    modality?: string;
    search?: string;
    from?: string;
    to?: string;
    take?: number;
    skip?: number;
  }) {
    const take = Math.min(Math.max(filters?.take ?? 20, 1), 200);
    const skip = Math.max(filters?.skip ?? 0, 0);
    const q = filters?.search?.trim();
    const where: Prisma.RadiologyRequestsWhereInput = {
      ...(filters?.status ? { status: filters.status.toUpperCase() } : {}),
      ...(filters?.priority ? { priority: filters.priority.toUpperCase() } : {}),
      ...(filters?.patientId ? { patient_id: filters.patientId } : {}),
      ...(filters?.requestingDoctorId
        ? { requesting_doctor_id: filters.requestingDoctorId }
        : {}),
      ...(filters?.departmentId || filters?.modality
        ? {
            scan_type: {
              ...(filters.departmentId ? { department_id: filters.departmentId } : {}),
              ...(filters.modality
                ? { category: { equals: filters.modality, mode: 'insensitive' } }
                : {}),
            },
          }
        : {}),
      ...(filters?.from || filters?.to
        ? {
            created_at: {
              ...(filters.from ? { gte: new Date(filters.from) } : {}),
              ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              { request_number: { contains: q, mode: 'insensitive' as const } },
              {
                patient: {
                  patient_number: { contains: q, mode: 'insensitive' as const },
                },
              },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.radiologyRequests.findMany({
        where,
        include: this.requestInclude(),
        orderBy: { created_at: 'desc' },
        take,
        skip,
      }),
      this.prisma.radiologyRequests.count({ where }),
    ]);
    return {
      items: rows.map((r) => this.mapRequest(r)),
      total,
      page: Math.floor(skip / take) + 1,
      limit: take,
    };
  }

  public async getRequestRow(id: string) {
    const r = await this.prisma.radiologyRequests.findFirst({
      where: { id },
      include: this.requestInclude(),
    });
    if (!r) throw new NotFoundException('Radiology request not found');
    return r;
  }

  public async getRequest(id: string) {
    const r = await this.prisma.radiologyRequests.findFirst({
      where: { id },
      include: {
        ...this.requestInclude(),
        radiology_findings_request_id: { orderBy: { created_at: 'desc' } },
        radiology_reports_request_id: { orderBy: { created_at: 'desc' } },
        radiology_images_request_id: { orderBy: { created_at: 'desc' } },
      },
    });
    if (!r) throw new NotFoundException('Radiology request not found');
    return this.mapRequestDetail(r);
  }

  /**
   * Real multipart upload — mirrors communication/services/messaging.service.ts's
   * uploadAttachment: file bytes go to the StorageProvider under a namespaced
   * key, and the DB row stores that key (never a client-supplied path).
   */
  public async uploadImage(
    requestId: string,
    input: {
      buffer: Buffer;
      originalname: string;
      mimetype?: string;
      size?: number;
      modality?: string;
      seriesDescription?: string;
      numberOfImages?: number;
      uploadedBy: string;
    },
  ) {
    await this.getRequestRow(requestId);
    if (!this.storage) {
      throw new ServiceUnavailableException('Storage is not configured');
    }
    if (!input.buffer?.length) {
      throw new BadRequestException('File is required');
    }
    const size = input.size ?? input.buffer.length;
    if (size > MAX_RADIOLOGY_IMAGE_BYTES) {
      throw new BadRequestException('File exceeds the 25MB limit');
    }

    const safeName = (input.originalname || 'image')
      .replace(/[^\w.\-]+/g, '_')
      .slice(0, 180);
    const key = `radiology/${requestId}/${randomUUID()}-${safeName}`;
    await this.storage.put(key, input.buffer, {
      contentType: input.mimetype,
    });

    const row = await this.prisma.images.create({
      data: {
        request_id: requestId,
        file_path: key,
        file_name: input.originalname || safeName,
        mime_type: input.mimetype ?? null,
        file_size: BigInt(size),
        modality: input.modality ?? null,
        series_description: input.seriesDescription ?? null,
        number_of_images: input.numberOfImages ?? 1,
        uploaded_by: input.uploadedBy,
      },
    });
    await this.audit.recordMutation({
      userId: input.uploadedBy,
      action: 'CREATE',
      entityType: 'radiology.images',
      entityId: row.id,
      newValues: { requestId, fileName: row.file_name, fileSize: size },
    });
    return {
      id: row.id,
      fileName: row.file_name,
      mimeType: row.mime_type,
      fileSize: row.file_size != null ? Number(row.file_size) : null,
      modality: row.modality,
      seriesDescription: row.series_description,
      numberOfImages: row.number_of_images,
      createdAt: row.created_at.toISOString(),
    };
  }

  private async getImageRow(imageId: string) {
    const image = await this.prisma.images.findFirst({ where: { id: imageId } });
    if (!image) throw new NotFoundException('Image not found');
    return image;
  }

  /** Short-lived signed URL for a cloud storage backend (S3/MinIO/Azure/GCS). */
  public async getImageDownload(imageId: string) {
    const image = await this.getImageRow(imageId);
    if (!this.storage) {
      throw new ServiceUnavailableException('Storage is not configured');
    }
    let url: string | null = null;
    try {
      url = await this.storage.signedUrl(image.file_path, {
        expiresInSeconds: 300,
        operation: 'get',
      });
    } catch {
      // Local/in-memory storage drivers don't produce a fetchable URL —
      // callers fall back to streaming via getImageBuffer/content below.
    }
    return {
      id: image.id,
      fileName: image.file_name,
      mimeType: image.mime_type,
      fileSize: image.file_size != null ? Number(image.file_size) : null,
      url,
    };
  }

  /** Authenticated content stream — the reliable path regardless of storage backend. */
  public async getImageBuffer(imageId: string) {
    const image = await this.getImageRow(imageId);
    if (!this.storage) {
      throw new ServiceUnavailableException('Storage is not configured');
    }
    const buffer = await this.storage.get(image.file_path);
    return {
      buffer,
      fileName: image.file_name || 'image',
      mimeType: image.mime_type || 'application/octet-stream',
    };
  }

  /** Remove an uploaded image — deletes the stored object, then the DB row. */
  public async deleteImage(imageId: string, actorUserId: string) {
    const image = await this.getImageRow(imageId);
    if (this.storage) {
      await this.storage.delete(image.file_path);
    }
    await this.prisma.images.delete({ where: { id: imageId } });
    await this.audit.recordMutation({
      userId: actorUserId,
      action: 'DELETE',
      entityType: 'radiology.images',
      entityId: imageId,
      oldValues: { requestId: image.request_id, fileName: image.file_name },
    });
  }

  /** Render the current finalized/amended report as a branded DOCX. */
  public async generateReportDocx(requestId: string): Promise<Buffer> {
    const r = await this.prisma.radiologyRequests.findFirst({
      where: { id: requestId },
      include: {
        ...this.requestInclude(),
        patient: {
          include: { user: { include: { core_profiles_user_id: true } } },
        },
        radiology_findings_request_id: { orderBy: { created_at: 'desc' }, take: 1 },
        radiology_reports_request_id: { orderBy: { created_at: 'desc' } },
      },
    });
    if (!r) throw new NotFoundException('Radiology request not found');

    const report = r.radiology_reports_request_id.find(
      (rep) => rep.status === 'FINAL' || rep.status === 'AMENDED',
    );
    if (!report) {
      throw new BadRequestException('No finalized report is available to export for this request');
    }

    const profile = r.patient.user.core_profiles_user_id[0];
    const settingsRows = await this.prisma.settings.findMany({
      where: { key: { in: [...FACILITY_SETTING_KEYS] } },
    });
    const settings = Object.fromEntries(settingsRows.map((s) => [s.key, s.value])) as Partial<
      Record<(typeof FACILITY_SETTING_KEYS)[number], string>
    >;
    const facilityValue = (
      primary: (typeof FACILITY_SETTING_KEYS)[number],
      fallback: (typeof FACILITY_SETTING_KEYS)[number],
    ): string =>
      settings[primary] || settings[fallback] || FACILITY_DEFAULTS[primary] || FACILITY_DEFAULTS[fallback];

    const radiologist = report.finalized_by
      ? await this.prisma.staffProfiles.findFirst({
          where: { user_id: report.finalized_by },
          include: { user: { include: { core_profiles_user_id: true } } },
        })
      : null;

    let templateSections: Array<{ key: string; label: string; type: string }> | undefined;
    if (report.template_id) {
      const template = await this.prisma.reportTemplates.findFirst({
        where: { id: report.template_id },
      });
      templateSections = this.mapReportTemplate(template!).sections;
    }

    const age = ageFromDob(profile?.date_of_birth ?? null);
    const findingsText = r.radiology_findings_request_id[0]?.findings_text ?? null;

    return generateRadiologyReportDocx({
      facility: {
        name: facilityValue('hospital_name', 'hospital_name'),
        addressLine: facilityValue('contact_address', 'hospital_address'),
        contactLine: [
          facilityValue('contact_phone', 'hospital_phone'),
          facilityValue('contact_email', 'hospital_email'),
        ]
          .filter(Boolean)
          .join(' · '),
      },
      patient: {
        name: this.profileName(r.patient.user.core_profiles_user_id) || r.patient.patient_number,
        patientNumber: r.patient.patient_number,
        age: age === null ? '—' : `${age} yrs`,
        sex: profile?.gender || '—',
      },
      visit: {
        date: (report.finalized_at ?? r.created_at).toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }),
        visitId: r.request_number,
      },
      study: {
        description: r.scan_type.scan_type,
        clinicalHistory: r.clinical_indication,
      },
      findingsHtml: findingsText,
      report: {
        version: report.version,
        status: report.status,
        sectionsData: (report.sections_data as Record<string, unknown> | null) ?? null,
        templateSections,
        finalImpressionHtml: report.final_impression,
        conclusion: report.conclusion,
        recommendations: report.recommendations,
        signedAt: report.signed_at?.toISOString() ?? null,
      },
      clinicians: {
        sonographerName: this.profileName(radiologist?.user.core_profiles_user_id) || null,
        sonographerTitle: radiologist?.position || radiologist?.qualification || null,
        referringDoctorName:
          this.profileName(r.requesting_doctor?.user.core_profiles_user_id) || null,
        referringDoctorTitle: null,
      },
    });
  }

  public requestInclude() {
    return {
      patient: {
        include: { user: { include: { core_profiles_user_id: true } } },
      },
      requesting_doctor: {
        include: { user: { include: { core_profiles_user_id: true } } },
      },
      scan_type: { include: { department: true } },
    } as const;
  }

  public mapScanType(r: {
    id: string;
    scan_type: string;
    category: string | null;
    description: string | null;
    standard_price: { toNumber?: () => number } | number;
    typical_duration_minutes: number | null;
    contrast_required: boolean;
    preparation_instructions: string | null;
    department_id: string | null;
    department?: { id: string; name: string } | null;
    billing_service_id: string | null;
    is_active: boolean;
  }) {
    const price =
      typeof r.standard_price === 'number'
        ? r.standard_price
        : Number(r.standard_price?.toNumber?.() ?? r.standard_price);
    return {
      id: r.id,
      scanType: r.scan_type,
      category: r.category,
      description: r.description,
      standardPrice: price,
      typicalDurationMinutes: r.typical_duration_minutes,
      contrastRequired: r.contrast_required,
      preparationInstructions: r.preparation_instructions,
      departmentId: r.department_id,
      departmentName: r.department?.name ?? null,
      billingServiceId: r.billing_service_id,
      isActive: r.is_active,
    };
  }

  public mapReportTemplate(r: {
    id: string;
    name: string;
    modality: string | null;
    body_region: string | null;
    sections: unknown;
    is_active: boolean;
  }) {
    return {
      id: r.id,
      name: r.name,
      modality: r.modality,
      bodyRegion: r.body_region,
      sections: (r.sections ?? []) as Array<{
        key: string;
        label: string;
        type: string;
        required?: boolean;
      }>,
      isActive: r.is_active,
    };
  }

  private profileName(profiles?: { first_name: string; last_name: string }[]) {
    const p = profiles?.[0];
    return p ? `${p.first_name} ${p.last_name}` : null;
  }

  public mapRequest(r: {
    id: string;
    request_number: string;
    status: string;
    priority: string;
    clinical_indication: string | null;
    scheduled_at: Date | null;
    checked_in_at: Date | null;
    started_at: Date | null;
    completed_at: Date | null;
    reported_at: Date | null;
    finalized_at: Date | null;
    cancelled_at: Date | null;
    cancellation_reason: string | null;
    created_at: Date;
    patient_id: string;
    patient: {
      patient_number: string;
      user: { core_profiles_user_id: { first_name: string; last_name: string }[] };
    };
    requesting_doctor_id: string | null;
    requesting_doctor: {
      user: { core_profiles_user_id: { first_name: string; last_name: string }[] };
    } | null;
    scan_type: {
      id: string;
      scan_type: string;
      category: string | null;
      contrast_required: boolean;
      preparation_instructions: string | null;
      department: { id: string; name: string } | null;
    };
  }) {
    return {
      id: r.id,
      requestNumber: r.request_number,
      patientId: r.patient_id,
      patientName:
        this.profileName(r.patient.user.core_profiles_user_id) || r.patient.patient_number,
      mrn: r.patient.patient_number,
      scanTypeId: r.scan_type.id,
      scan: r.scan_type.scan_type,
      modality: r.scan_type.category,
      contrastRequired: r.scan_type.contrast_required,
      preparationInstructions: r.scan_type.preparation_instructions,
      departmentId: r.scan_type.department?.id ?? null,
      departmentName: r.scan_type.department?.name ?? null,
      requestingDoctorId: r.requesting_doctor_id,
      requestedBy:
        this.profileName(r.requesting_doctor?.user.core_profiles_user_id) || 'Clinical team',
      indication: r.clinical_indication,
      priority: r.priority,
      status: r.status,
      scheduledAt: r.scheduled_at?.toISOString() ?? null,
      checkedInAt: r.checked_in_at?.toISOString() ?? null,
      startedAt: r.started_at?.toISOString() ?? null,
      completedAt: r.completed_at?.toISOString() ?? null,
      reportedAt: r.reported_at?.toISOString() ?? null,
      finalizedAt: r.finalized_at?.toISOString() ?? null,
      cancelledAt: r.cancelled_at?.toISOString() ?? null,
      cancellationReason: r.cancellation_reason,
      createdAt: r.created_at.toISOString(),
    };
  }

  public mapRequestDetail(
    r: Parameters<RadiologyOperationsUseCase['mapRequest']>[0] & {
      radiology_findings_request_id: Array<{
        id: string;
        findings_text: string | null;
        status: string;
        radiologist_id: string;
        created_at: Date;
        updated_at: Date;
      }>;
      radiology_reports_request_id: Array<{
        id: string;
        findings_id: string;
        final_impression: string | null;
        conclusion: string | null;
        recommendations: string | null;
        sections_data: unknown;
        template_id: string | null;
        version: number;
        status: string;
        radiologist_signature: string | null;
        signed_at: Date | null;
        finalized_at: Date | null;
        amends_report_id: string | null;
        amendment_reason: string | null;
        created_at: Date;
      }>;
      radiology_images_request_id: Array<{
        id: string;
        file_name: string | null;
        mime_type: string | null;
        file_size: bigint | null;
        modality: string | null;
        series_description: string | null;
        number_of_images: number | null;
        created_at: Date;
      }>;
    },
  ) {
    return {
      ...this.mapRequest(r),
      findingsHistory: r.radiology_findings_request_id.map((f) => ({
        id: f.id,
        findingsText: f.findings_text,
        status: f.status,
        radiologistId: f.radiologist_id,
        createdAt: f.created_at.toISOString(),
        updatedAt: f.updated_at.toISOString(),
      })),
      reportsHistory: r.radiology_reports_request_id.map((rep) => ({
        id: rep.id,
        findingsId: rep.findings_id,
        finalImpression: rep.final_impression,
        conclusion: rep.conclusion,
        recommendations: rep.recommendations,
        sectionsData: rep.sections_data,
        templateId: rep.template_id,
        version: rep.version,
        status: rep.status,
        signature: rep.radiologist_signature,
        signedAt: rep.signed_at?.toISOString() ?? null,
        finalizedAt: rep.finalized_at?.toISOString() ?? null,
        amendsReportId: rep.amends_report_id,
        amendmentReason: rep.amendment_reason,
        createdAt: rep.created_at.toISOString(),
      })),
      images: r.radiology_images_request_id.map((img) => ({
        id: img.id,
        fileName: img.file_name,
        mimeType: img.mime_type,
        fileSize: img.file_size != null ? Number(img.file_size) : null,
        modality: img.modality,
        seriesDescription: img.series_description,
        numberOfImages: img.number_of_images,
        createdAt: img.created_at.toISOString(),
      })),
    };
  }
}
