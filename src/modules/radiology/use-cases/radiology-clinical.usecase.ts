/**
 * Clinical radiology — scan types, requests, findings, reports, images.
 * Complements the scaffolded /radiology CRUD which maps onto requests.
 */

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';

const REQUEST_STATUSES = [
  'PENDING',
  'SCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'REPORT_PENDING',
] as const;

@Injectable()
export class RadiologyClinicalUseCase {
  public constructor(private readonly prisma: PrismaService) {}

  public async listScanTypes(filters?: { active?: boolean; search?: string }) {
    const q = filters?.search?.trim();
    const rows = await this.prisma.scanTypes.findMany({
      where: {
        ...(filters?.active === undefined ? {} : { is_active: filters.active }),
        ...(q
          ? {
              OR: [
                { scan_type: { contains: q, mode: 'insensitive' } },
                { category: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
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
  }) {
    const name = input.scanType.trim();
    if (!name) throw new BadRequestException('scanType is required');
    const row = await this.prisma.scanTypes.create({
      data: {
        scan_type: name,
        category: input.category?.trim() || null,
        description: input.description?.trim() || null,
        standard_price: input.standardPrice ?? 0,
        typical_duration_minutes: input.typicalDurationMinutes ?? null,
        contrast_required: Boolean(input.contrastRequired),
        is_active: true,
      },
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
      isActive?: boolean;
    },
  ) {
    const existing = await this.prisma.scanTypes.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException('Scan type not found');
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
        ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
      },
    });
    return this.mapScanType(row);
  }

  public async listRequests(filters?: {
    status?: string;
    patientId?: string;
    search?: string;
    take?: number;
    skip?: number;
  }) {
    const take = Math.min(Math.max(filters?.take ?? 50, 1), 100);
    const skip = Math.max(filters?.skip ?? 0, 0);
    const q = filters?.search?.trim();
    const where = {
      ...(filters?.status ? { status: filters.status.toUpperCase() } : {}),
      ...(filters?.patientId ? { patient_id: filters.patientId } : {}),
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

  public async getRequest(id: string) {
    const r = await this.prisma.radiologyRequests.findFirst({
      where: { id },
      include: {
        ...this.requestInclude(),
        radiology_findings_request_id: true,
        radiology_reports_request_id: true,
        radiology_images_request_id: true,
      },
    });
    if (!r) throw new NotFoundException('Radiology request not found');
    return this.mapRequestDetail(r);
  }

  public async upsertFindings(
    requestId: string,
    input: { radiologistId: string; findingsText?: string; status?: string },
  ) {
    await this.getRequest(requestId);
    const existing = await this.prisma.findings.findFirst({
      where: { request_id: requestId },
    });
    const data = {
      radiologist_id: input.radiologistId,
      findings_text: input.findingsText ?? null,
      status: (input.status || 'DRAFT').toUpperCase(),
    };
    const row = existing
      ? await this.prisma.findings.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.findings.create({
          data: { request_id: requestId, ...data },
        });
    return row;
  }

  public async upsertReport(
    requestId: string,
    input: {
      radiologistId: string;
      finalImpression?: string;
      conclusion?: string;
      recommendations?: string;
      signature?: string;
    },
  ) {
    let findings = await this.prisma.findings.findFirst({
      where: { request_id: requestId },
    });
    if (!findings) {
      findings = await this.prisma.findings.create({
        data: {
          request_id: requestId,
          radiologist_id: input.radiologistId,
          status: 'DRAFT',
        },
      });
    }
    const existing = await this.prisma.reports.findFirst({
      where: { request_id: requestId },
    });
    const data = {
      findings_id: findings.id,
      final_impression: input.finalImpression ?? null,
      conclusion: input.conclusion ?? null,
      recommendations: input.recommendations ?? null,
      radiologist_signature: input.signature ?? null,
      signed_at: input.signature ? new Date() : null,
    };
    return existing
      ? this.prisma.reports.update({ where: { id: existing.id }, data })
      : this.prisma.reports.create({
          data: { request_id: requestId, ...data },
        });
  }

  public async addImage(
    requestId: string,
    input: {
      filePath: string;
      modality?: string;
      seriesDescription?: string;
      numberOfImages?: number;
      uploadedBy: string;
    },
  ) {
    await this.getRequest(requestId);
    if (!input.filePath?.trim()) {
      throw new BadRequestException('filePath is required');
    }
    return this.prisma.images.create({
      data: {
        request_id: requestId,
        file_path: input.filePath.trim(),
        modality: input.modality ?? null,
        series_description: input.seriesDescription ?? null,
        number_of_images: input.numberOfImages ?? 1,
        uploaded_by: input.uploadedBy,
      },
    });
  }

  public assertStatus(status: string) {
    const s = status.toUpperCase();
    if (!REQUEST_STATUSES.includes(s as (typeof REQUEST_STATUSES)[number])) {
      throw new BadRequestException(
        `status must be one of ${REQUEST_STATUSES.join(', ')}`,
      );
    }
    return s;
  }

  private requestInclude() {
    return {
      patient: {
        include: { user: { include: { core_profiles_user_id: true } } },
      },
      requesting_doctor: {
        include: { user: { include: { core_profiles_user_id: true } } },
      },
      scan_type: true,
    } as const;
  }

  private mapScanType(r: {
    id: string;
    scan_type: string;
    category: string | null;
    description: string | null;
    standard_price: { toNumber?: () => number } | number;
    typical_duration_minutes: number | null;
    contrast_required: boolean;
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
      isActive: r.is_active,
    };
  }

  private profileName(
    profiles?: { first_name: string; last_name: string }[],
  ) {
    const p = profiles?.[0];
    return p ? `${p.first_name} ${p.last_name}` : null;
  }

  private mapRequest(r: {
    id: string;
    request_number: string;
    status: string;
    priority: string;
    clinical_indication: string | null;
    created_at: Date;
    patient: {
      patient_number: string;
      user: { core_profiles_user_id: { first_name: string; last_name: string }[] };
    };
    requesting_doctor: {
      user: { core_profiles_user_id: { first_name: string; last_name: string }[] };
    } | null;
    scan_type: { scan_type: string };
  }) {
    return {
      id: r.id,
      requestNumber: r.request_number,
      patientName:
        this.profileName(r.patient.user.core_profiles_user_id) ||
        r.patient.patient_number,
      mrn: r.patient.patient_number,
      scan: r.scan_type.scan_type,
      requestedBy:
        this.profileName(r.requesting_doctor?.user.core_profiles_user_id) ||
        'Clinical team',
      indication: r.clinical_indication,
      priority: r.priority,
      status: r.status,
      createdAt: r.created_at.toISOString(),
    };
  }

  private mapRequestDetail(
    r: Parameters<RadiologyClinicalUseCase['mapRequest']>[0] & {
      radiology_findings_request_id:
        | Array<{
            id: string;
            findings_text: string | null;
            status: string;
          }>
        | {
            id: string;
            findings_text: string | null;
            status: string;
          }
        | null;
      radiology_reports_request_id:
        | Array<{
            id: string;
            final_impression: string | null;
            conclusion: string | null;
            recommendations: string | null;
            signed_at: Date | null;
          }>
        | {
            id: string;
            final_impression: string | null;
            conclusion: string | null;
            recommendations: string | null;
            signed_at: Date | null;
          }
        | null;
      radiology_images_request_id: Array<{
        id: string;
        file_path: string;
        modality: string | null;
        series_description: string | null;
        number_of_images: number | null;
        created_at: Date;
      }>;
    },
  ) {
    const findingsList = Array.isArray(r.radiology_findings_request_id)
      ? r.radiology_findings_request_id
      : r.radiology_findings_request_id
        ? [r.radiology_findings_request_id]
        : [];
    const reportsList = Array.isArray(r.radiology_reports_request_id)
      ? r.radiology_reports_request_id
      : r.radiology_reports_request_id
        ? [r.radiology_reports_request_id]
        : [];
    const imagesList = Array.isArray(r.radiology_images_request_id)
      ? r.radiology_images_request_id
      : [];
    const report = reportsList[0];
    return {
      ...this.mapRequest(r),
      findings: findingsList[0] ?? null,
      report: report
        ? {
            ...report,
            signedAt: report.signed_at?.toISOString() ?? null,
          }
        : null,
      images: imagesList.map((img) => ({
        id: img.id,
        filePath: img.file_path,
        modality: img.modality,
        seriesDescription: img.series_description,
        numberOfImages: img.number_of_images,
        createdAt: img.created_at.toISOString(),
      })),
    };
  }
}
