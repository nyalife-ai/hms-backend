/**
 * Laboratory domain operations — test types, parameters, lists, overview.
 * Source of truth: db.sql laboratory.*
 *
 * Note: schema has no request↔test_type junction. Ordered panels are stored
 * as structured JSON in requests.notes: { orderedTestTypeIds: string[], text?: string }.
 */

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../../generated/prisma';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { HmsAuditWriter } from '../../audit/hms-audit.writer';

export const LAB_PRIORITIES = ['NORMAL', 'URGENT', 'STAT'] as const;
export const LAB_REQUEST_STATUSES = [
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
] as const;
export const LAB_SAMPLE_STATUSES = [
  'REGISTERED',
  'IN_PROGRESS',
  'PENDING_RESULTS',
  'COMPLETED',
  'CANCELLED',
] as const;
export const LAB_INTERPRETATIONS = [
  'NORMAL',
  'HIGH',
  'LOW',
  'CRITICAL',
] as const;

export type LabNotesPayload = {
  orderedTestTypeIds: string[];
  text?: string;
};

@Injectable()
export class LabOperationsUseCase {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly audit: HmsAuditWriter,
  ) {}

  // ── Overview ──────────────────────────────────────────────

  public async overview() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [
      activeTestTypes,
      pendingRequests,
      urgentRequests,
      statRequests,
      samplesRegistered,
      samplesInProgress,
      awaitingVerification,
      criticalUnverified,
      todaysCompleted,
    ] = await Promise.all([
      this.prisma.testTypes.count({ where: { is_active: true } }),
      this.prisma.laboratoryRequests.count({ where: { status: 'PENDING' } }),
      this.prisma.laboratoryRequests.count({
        where: {
          priority: 'URGENT',
          status: { in: ['PENDING', 'IN_PROGRESS'] },
        },
      }),
      this.prisma.laboratoryRequests.count({
        where: {
          priority: 'STAT',
          status: { in: ['PENDING', 'IN_PROGRESS'] },
        },
      }),
      this.prisma.samples.count({ where: { status: 'REGISTERED' } }),
      this.prisma.samples.count({
        where: { status: { in: ['IN_PROGRESS', 'PENDING_RESULTS'] } },
      }),
      this.prisma.results.count({
        where: { verified_at: null, performed_at: { not: null } },
      }),
      this.prisma.results.count({
        where: { interpretation: 'CRITICAL', verified_at: null },
      }),
      this.prisma.laboratoryRequests.count({
        where: { status: 'COMPLETED', updated_at: { gte: startOfDay } },
      }),
    ]);

    return {
      activeTestTypes,
      pendingRequests,
      urgentRequests,
      statRequests,
      samplesRegistered,
      samplesAwaitingProcessing: samplesInProgress,
      resultsAwaitingVerification: awaitingVerification,
      criticalUnverified,
      todaysCompleted,
    };
  }

  // ── Test types ────────────────────────────────────────────

  public async listTestTypes(filters?: {
    search?: string;
    category?: string;
    active?: boolean;
    take?: number;
    skip?: number;
  }) {
    const q = filters?.search?.trim();
    const take = Math.min(Math.max(filters?.take ?? 50, 1), 200);
    const skip = Math.max(filters?.skip ?? 0, 0);
    const where: Prisma.TestTypesWhereInput = {
      ...(filters?.active !== undefined
        ? { is_active: filters.active }
        : {}),
      ...(filters?.category ? { category: filters.category } : {}),
      ...(q
        ? {
            OR: [
              { test_name: { contains: q, mode: 'insensitive' } },
              { category: { contains: q, mode: 'insensitive' } },
              { description: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.testTypes.findMany({
        where,
        include: {
          laboratory_test_parameters_test_type_id: {
            where: { is_active: true },
            orderBy: { display_order: 'asc' },
            select: {
              id: true,
              parameter_name: true,
              unit_of_measurement: true,
              normal_reference_range: true,
              display_order: true,
              is_active: true,
            },
          },
        },
        orderBy: { test_name: 'asc' },
        take,
        skip,
      }),
      this.prisma.testTypes.count({ where }),
    ]);
    return {
      total,
      take,
      skip,
      items: rows.map((t) => this.mapTestType(t)),
    };
  }

  public async getTestType(id: string) {
    const t = await this.prisma.testTypes.findFirst({
      where: { id },
      include: {
        laboratory_test_parameters_test_type_id: {
          orderBy: { display_order: 'asc' },
        },
      },
    });
    if (!t) throw new NotFoundException('Test type not found');
    return this.mapTestType(t, true);
  }

  public async createTestType(input: {
    testName: string;
    category?: string;
    description?: string;
    standardPrice?: number;
    actorUserId?: string;
  }) {
    const name = input.testName?.trim();
    if (!name) throw new BadRequestException('testName is required');
    if (name.length > 100) {
      throw new BadRequestException('testName max length is 100');
    }
    if (
      input.standardPrice !== undefined &&
      (Number.isNaN(input.standardPrice) || input.standardPrice < 0)
    ) {
      throw new BadRequestException('standardPrice must be >= 0');
    }
    try {
      const row = await this.prisma.testTypes.create({
        data: {
          test_name: name,
          category: input.category?.trim() || null,
          description: input.description?.trim() || null,
          standard_price: input.standardPrice ?? 0,
          is_active: true,
        },
        include: { laboratory_test_parameters_test_type_id: true },
      });
      await this.audit.recordMutation({
        userId: input.actorUserId,
        action: 'CREATE',
        entityType: 'laboratory.test_types',
        entityId: row.id,
      });
      return this.mapTestType(row, true);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('Test name already exists');
      }
      throw err;
    }
  }

  public async updateTestType(
    id: string,
    input: {
      testName?: string;
      category?: string | null;
      description?: string | null;
      standardPrice?: number;
      isActive?: boolean;
      actorUserId?: string;
    },
  ) {
    await this.getTestType(id);
    if (
      input.standardPrice !== undefined &&
      (Number.isNaN(input.standardPrice) || input.standardPrice < 0)
    ) {
      throw new BadRequestException('standardPrice must be >= 0');
    }
    if (input.testName !== undefined) {
      const name = input.testName.trim();
      if (!name) throw new BadRequestException('testName cannot be empty');
      if (name.length > 100) {
        throw new BadRequestException('testName max length is 100');
      }
    }
    try {
      const row = await this.prisma.testTypes.update({
        where: { id },
        data: {
          ...(input.testName !== undefined
            ? { test_name: input.testName.trim() }
            : {}),
          ...(input.category !== undefined
            ? { category: input.category?.trim() || null }
            : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.standardPrice !== undefined
            ? { standard_price: input.standardPrice }
            : {}),
          ...(input.isActive !== undefined
            ? { is_active: input.isActive }
            : {}),
        },
        include: {
          laboratory_test_parameters_test_type_id: {
            orderBy: { display_order: 'asc' },
          },
        },
      });
      await this.audit.recordMutation({
        userId: input.actorUserId,
        action: 'UPDATE',
        entityType: 'laboratory.test_types',
        entityId: id,
      });
      return this.mapTestType(row, true);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('Test name already exists');
      }
      throw err;
    }
  }

  public async setTestTypeActive(
    id: string,
    isActive: boolean,
    actorUserId?: string,
  ) {
    return this.updateTestType(id, { isActive, actorUserId });
  }

  // ── Parameters ────────────────────────────────────────────

  public async listParameters(filters?: {
    testTypeId?: string;
    active?: boolean;
    search?: string;
  }) {
    const q = filters?.search?.trim();
    const rows = await this.prisma.testParameters.findMany({
      where: {
        ...(filters?.testTypeId ? { test_type_id: filters.testTypeId } : {}),
        ...(filters?.active !== undefined
          ? { is_active: filters.active }
          : {}),
        ...(q
          ? { parameter_name: { contains: q, mode: 'insensitive' } }
          : {}),
      },
      include: { test_type: true },
      orderBy: [{ display_order: 'asc' }, { parameter_name: 'asc' }],
      take: 300,
    });
    return rows.map((p) => this.mapParameter(p));
  }

  public async getParameter(id: string) {
    const p = await this.prisma.testParameters.findFirst({
      where: { id },
      include: { test_type: true },
    });
    if (!p) throw new NotFoundException('Parameter not found');
    return this.mapParameter(p);
  }

  public async createParameter(input: {
    testTypeId: string;
    parameterName: string;
    unitOfMeasurement?: string;
    normalReferenceRange?: string;
    displayOrder?: number;
    actorUserId?: string;
  }) {
    await this.getTestType(input.testTypeId);
    const name = input.parameterName?.trim();
    if (!name) throw new BadRequestException('parameterName is required');
    if (name.length > 100) {
      throw new BadRequestException('parameterName max length is 100');
    }
    const row = await this.prisma.testParameters.create({
      data: {
        test_type_id: input.testTypeId,
        parameter_name: name,
        unit_of_measurement: input.unitOfMeasurement?.trim() || null,
        normal_reference_range: input.normalReferenceRange?.trim() || null,
        display_order: input.displayOrder ?? 0,
        is_active: true,
      },
      include: { test_type: true },
    });
    await this.audit.recordMutation({
      userId: input.actorUserId,
      action: 'CREATE',
      entityType: 'laboratory.test_parameters',
      entityId: row.id,
    });
    return this.mapParameter(row);
  }

  public async updateParameter(
    id: string,
    input: {
      parameterName?: string;
      unitOfMeasurement?: string | null;
      normalReferenceRange?: string | null;
      displayOrder?: number;
      isActive?: boolean;
      actorUserId?: string;
    },
  ) {
    await this.getParameter(id);
    if (input.parameterName !== undefined) {
      const name = input.parameterName.trim();
      if (!name) throw new BadRequestException('parameterName cannot be empty');
    }
    const row = await this.prisma.testParameters.update({
      where: { id },
      data: {
        ...(input.parameterName !== undefined
          ? { parameter_name: input.parameterName.trim() }
          : {}),
        ...(input.unitOfMeasurement !== undefined
          ? { unit_of_measurement: input.unitOfMeasurement }
          : {}),
        ...(input.normalReferenceRange !== undefined
          ? { normal_reference_range: input.normalReferenceRange }
          : {}),
        ...(input.displayOrder !== undefined
          ? { display_order: input.displayOrder }
          : {}),
        ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
      },
      include: { test_type: true },
    });
    await this.audit.recordMutation({
      userId: input.actorUserId,
      action: 'UPDATE',
      entityType: 'laboratory.test_parameters',
      entityId: id,
    });
    return this.mapParameter(row);
  }

  // ── Requests (read) ───────────────────────────────────────

  public async listRequests(filters?: {
    patientId?: string;
    status?: string;
    priority?: string;
    requestingDoctorId?: string;
    search?: string;
    from?: Date;
    to?: Date;
    take?: number;
    skip?: number;
  }) {
    if (filters?.status) {
      const s = filters.status.toUpperCase();
      if (!LAB_REQUEST_STATUSES.includes(s as (typeof LAB_REQUEST_STATUSES)[number])) {
        throw new BadRequestException(
          `status must be one of ${LAB_REQUEST_STATUSES.join(', ')}`,
        );
      }
      filters.status = s;
    }
    if (filters?.priority) {
      const p = filters.priority.toUpperCase();
      if (!LAB_PRIORITIES.includes(p as (typeof LAB_PRIORITIES)[number])) {
        throw new BadRequestException(
          `priority must be one of ${LAB_PRIORITIES.join(', ')}`,
        );
      }
      filters.priority = p;
    }
    const q = filters?.search?.trim();
    const take = Math.min(Math.max(filters?.take ?? 50, 1), 100);
    const skip = Math.max(filters?.skip ?? 0, 0);
    const where: Prisma.LaboratoryRequestsWhereInput = {
      ...(filters?.patientId ? { patient_id: filters.patientId } : {}),
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.priority ? { priority: filters.priority } : {}),
      ...(filters?.requestingDoctorId
        ? { requesting_doctor_id: filters.requestingDoctorId }
        : {}),
      ...(filters?.from || filters?.to
        ? {
            request_date: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              { request_number: { contains: q, mode: 'insensitive' } },
              {
                patient: {
                  patient_number: { contains: q, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.laboratoryRequests.findMany({
        where,
        include: this.requestInclude(),
        orderBy: [{ request_date: 'desc' }, { created_at: 'desc' }],
        take,
        skip,
      }),
      this.prisma.laboratoryRequests.count({ where }),
    ]);
    return {
      total,
      take,
      skip,
      items: rows.map((r) => this.mapRequest(r)),
    };
  }

  public async getRequest(id: string) {
    const r = await this.prisma.laboratoryRequests.findFirst({
      where: { id },
      include: {
        ...this.requestInclude(),
        laboratory_samples_request_id: {
          include: {
            rel_collected_by: {
              include: { user: { include: { core_profiles_user_id: true } } },
            },
          },
          orderBy: { created_at: 'asc' },
        },
        laboratory_results_request_id: {
          include: {
            parameter: { include: { test_type: true } },
            rel_performed_by: true,
            rel_verified_by: true,
          },
          orderBy: { created_at: 'asc' },
        },
      },
    });
    if (!r) throw new NotFoundException('Lab request not found');
    const ordered = await this.resolveOrderedPanels(r.notes);
    return {
      ...this.mapRequest(r),
      samples: r.laboratory_samples_request_id.map((s) => this.mapSample(s)),
      results: r.laboratory_results_request_id.map((res) =>
        this.mapResult(res),
      ),
      orderedTestTypes: ordered,
      resultEntryParameters: ordered.flatMap((t) =>
        t.parameters.map((p) => ({
          ...p,
          testTypeId: t.id,
          testName: t.testName,
        })),
      ),
    };
  }

  // ── Samples (read) ────────────────────────────────────────

  public async listSamples(filters?: {
    requestId?: string;
    patientId?: string;
    status?: string;
    search?: string;
    take?: number;
    skip?: number;
  }) {
    if (filters?.status) {
      const s = filters.status.toUpperCase();
      if (!LAB_SAMPLE_STATUSES.includes(s as (typeof LAB_SAMPLE_STATUSES)[number])) {
        throw new BadRequestException(
          `status must be one of ${LAB_SAMPLE_STATUSES.join(', ')}`,
        );
      }
      filters.status = s;
    }
    const q = filters?.search?.trim();
    const take = Math.min(Math.max(filters?.take ?? 50, 1), 100);
    const skip = Math.max(filters?.skip ?? 0, 0);
    const where: Prisma.SamplesWhereInput = {
      ...(filters?.requestId ? { request_id: filters.requestId } : {}),
      ...(filters?.patientId ? { patient_id: filters.patientId } : {}),
      ...(filters?.status ? { status: filters.status } : {}),
      ...(q
        ? {
            OR: [
              { sample_id: { contains: q, mode: 'insensitive' } },
              { sample_type: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.samples.findMany({
        where,
        include: {
          request: true,
          patient: {
            include: { user: { include: { core_profiles_user_id: true } } },
          },
          rel_collected_by: {
            include: { user: { include: { core_profiles_user_id: true } } },
          },
        },
        orderBy: { collected_at: 'desc' },
        take,
        skip,
      }),
      this.prisma.samples.count({ where }),
    ]);
    return {
      total,
      take,
      skip,
      items: rows.map((s) => this.mapSample(s)),
    };
  }

  public async getSample(id: string) {
    const s = await this.prisma.samples.findFirst({
      where: { id },
      include: {
        request: true,
        patient: {
          include: { user: { include: { core_profiles_user_id: true } } },
        },
        rel_collected_by: {
          include: { user: { include: { core_profiles_user_id: true } } },
        },
      },
    });
    if (!s) throw new NotFoundException('Sample not found');
    return this.mapSample(s);
  }

  // ── Results (read) ────────────────────────────────────────

  public async listResults(filters?: {
    requestId?: string;
    criticalOnly?: boolean;
    unverifiedOnly?: boolean;
    take?: number;
    skip?: number;
  }) {
    const take = Math.min(Math.max(filters?.take ?? 50, 1), 100);
    const skip = Math.max(filters?.skip ?? 0, 0);
    const where: Prisma.ResultsWhereInput = {
      ...(filters?.requestId ? { request_id: filters.requestId } : {}),
      ...(filters?.criticalOnly ? { interpretation: 'CRITICAL' } : {}),
      ...(filters?.unverifiedOnly ? { verified_at: null } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.results.findMany({
        where,
        include: {
          parameter: { include: { test_type: true } },
          request: {
            include: {
              patient: {
                include: { user: { include: { core_profiles_user_id: true } } },
              },
            },
          },
          rel_performed_by: true,
          rel_verified_by: true,
        },
        orderBy: { created_at: 'desc' },
        take,
        skip,
      }),
      this.prisma.results.count({ where }),
    ]);
    return {
      total,
      take,
      skip,
      items: rows.map((r) => this.mapResult(r)),
    };
  }

  // ── Helpers ───────────────────────────────────────────────

  public encodeNotes(
    orderedTestTypeIds: string[],
    text?: string | null,
  ): string | null {
    if (!orderedTestTypeIds.length && !text?.trim()) return null;
    const payload: LabNotesPayload = {
      orderedTestTypeIds,
      ...(text?.trim() ? { text: text.trim() } : {}),
    };
    return JSON.stringify(payload);
  }

  public parseNotes(raw: string | null): LabNotesPayload {
    if (!raw?.trim()) return { orderedTestTypeIds: [] };
    try {
      const parsed = JSON.parse(raw) as LabNotesPayload;
      if (Array.isArray(parsed?.orderedTestTypeIds)) {
        return {
          orderedTestTypeIds: parsed.orderedTestTypeIds.filter(
            (id) => typeof id === 'string',
          ),
          text: typeof parsed.text === 'string' ? parsed.text : undefined,
        };
      }
    } catch {
      /* free-text notes from visit path */
    }
    return { orderedTestTypeIds: [], text: raw };
  }

  public async resolveOrderedPanels(notes: string | null) {
    const { orderedTestTypeIds, text } = this.parseNotes(notes);
    if (!orderedTestTypeIds.length) {
      return [] as Array<{
        id: string;
        testName: string;
        category: string | null;
        parameters: ReturnType<LabOperationsUseCase['mapParameter']>[];
        notesText?: string;
      }>;
    }
    const types = await this.prisma.testTypes.findMany({
      where: { id: { in: orderedTestTypeIds } },
      include: {
        laboratory_test_parameters_test_type_id: {
          where: { is_active: true },
          orderBy: { display_order: 'asc' },
        },
      },
    });
    const byId = new Map(types.map((t) => [t.id, t]));
    return orderedTestTypeIds
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((t) => ({
        id: t!.id,
        testName: t!.test_name,
        category: t!.category,
        notesText: text,
        parameters: t!.laboratory_test_parameters_test_type_id.map((p) =>
          this.mapParameter({ ...p, test_type: t! }),
        ),
      }));
  }

  private requestInclude() {
    return {
      patient: {
        include: { user: { include: { core_profiles_user_id: true } } },
      },
      requesting_doctor: {
        include: { user: { include: { core_profiles_user_id: true } } },
      },
      consultation: true,
    } as const;
  }

  private profileName(
    profiles: { first_name: string; last_name: string }[] | undefined,
  ) {
    const p = profiles?.[0];
    return p ? `${p.first_name} ${p.last_name}`.trim() : null;
  }

  private mapTestType(
    t: {
      id: string;
      test_name: string;
      category: string | null;
      description: string | null;
      standard_price: Prisma.Decimal | number;
      is_active: boolean;
      laboratory_test_parameters_test_type_id?: Array<{
        id: string;
        parameter_name: string;
        unit_of_measurement: string | null;
        normal_reference_range: string | null;
        display_order: number;
        is_active: boolean;
        test_type_id?: string;
      }>;
    },
    withParams = false,
  ) {
    const params = t.laboratory_test_parameters_test_type_id ?? [];
    return {
      id: t.id,
      testName: t.test_name,
      category: t.category,
      description: t.description,
      standardPrice: Number(t.standard_price),
      isActive: t.is_active,
      parameterCount: params.length,
      ...(withParams || params.length
        ? {
            parameters: params.map((p) => ({
              id: p.id,
              testTypeId: p.test_type_id ?? t.id,
              parameterName: p.parameter_name,
              unitOfMeasurement: p.unit_of_measurement,
              normalReferenceRange: p.normal_reference_range,
              displayOrder: p.display_order,
              isActive: p.is_active,
              testName: t.test_name,
            })),
          }
        : {}),
    };
  }

  private mapParameter(p: {
    id: string;
    test_type_id: string;
    parameter_name: string;
    unit_of_measurement: string | null;
    normal_reference_range: string | null;
    display_order: number;
    is_active: boolean;
    test_type?: { test_name: string };
  }) {
    return {
      id: p.id,
      testTypeId: p.test_type_id,
      testName: p.test_type?.test_name ?? null,
      parameterName: p.parameter_name,
      unitOfMeasurement: p.unit_of_measurement,
      normalReferenceRange: p.normal_reference_range,
      displayOrder: p.display_order,
      isActive: p.is_active,
    };
  }

  public mapRequest(r: {
    id: string;
    request_number: string | null;
    patient_id: string;
    requesting_doctor_id: string | null;
    consultation_id: string | null;
    priority: string;
    request_date: Date;
    status: string;
    notes: string | null;
    requested_by: string;
    patient?: {
      patient_number: string;
      user: { core_profiles_user_id: { first_name: string; last_name: string }[] };
    };
    requesting_doctor?: {
      user: { core_profiles_user_id: { first_name: string; last_name: string }[] };
    } | null;
    consultation?: { id: string } | null;
  }) {
    const parsed = this.parseNotes(r.notes);
    return {
      id: r.id,
      requestNumber: r.request_number,
      patientId: r.patient_id,
      patientName: this.profileName(r.patient?.user.core_profiles_user_id) ?? '—',
      mrn: r.patient?.patient_number ?? null,
      requestingDoctorId: r.requesting_doctor_id,
      requestingDoctor:
        this.profileName(r.requesting_doctor?.user.core_profiles_user_id) ??
        null,
      consultationId: r.consultation_id,
      priority: r.priority,
      requestDate: r.request_date.toISOString(),
      status: r.status,
      notes: parsed.text ?? (parsed.orderedTestTypeIds.length ? null : r.notes),
      orderedTestTypeIds: parsed.orderedTestTypeIds,
      requestedBy: r.requested_by,
    };
  }

  public mapSample(s: {
    id: string;
    sample_id: string;
    request_id: string;
    patient_id: string;
    sample_type: string;
    collected_date: Date;
    collected_at: Date;
    collected_by: string;
    status: string;
    notes: string | null;
    request?: { request_number: string | null; status: string };
    patient?: {
      patient_number: string;
      user: { core_profiles_user_id: { first_name: string; last_name: string }[] };
    };
    rel_collected_by?: {
      user: { core_profiles_user_id: { first_name: string; last_name: string }[] };
    };
  }) {
    return {
      id: s.id,
      sampleId: s.sample_id,
      requestId: s.request_id,
      requestNumber: s.request?.request_number ?? null,
      requestStatus: s.request?.status ?? null,
      patientId: s.patient_id,
      patientName: this.profileName(s.patient?.user.core_profiles_user_id) ?? '—',
      mrn: s.patient?.patient_number ?? null,
      sampleType: s.sample_type,
      collectedDate: s.collected_date.toISOString().slice(0, 10),
      collectedAt: s.collected_at.toISOString(),
      collectedBy: s.collected_by,
      collectedByName:
        this.profileName(s.rel_collected_by?.user.core_profiles_user_id) ?? null,
      status: s.status,
      notes: s.notes,
    };
  }

  public mapResult(r: {
    id: string;
    request_id: string;
    parameter_id: string;
    result_value: string | null;
    interpretation: string | null;
    notes: string | null;
    performed_by: string | null;
    performed_at: Date | null;
    verified_by: string | null;
    verified_at: Date | null;
    parameter?: {
      parameter_name: string;
      unit_of_measurement: string | null;
      normal_reference_range: string | null;
      test_type?: { id: string; test_name: string };
    };
    request?: {
      request_number: string | null;
      patient?: {
        patient_number: string;
        user: {
          core_profiles_user_id: { first_name: string; last_name: string }[];
        };
      };
    };
    rel_performed_by?: { email: string } | null;
    rel_verified_by?: { email: string } | null;
  }) {
    return {
      id: r.id,
      requestId: r.request_id,
      requestNumber: r.request?.request_number ?? null,
      patientName:
        this.profileName(r.request?.patient?.user.core_profiles_user_id) ?? null,
      mrn: r.request?.patient?.patient_number ?? null,
      parameterId: r.parameter_id,
      parameterName: r.parameter?.parameter_name ?? null,
      unitOfMeasurement: r.parameter?.unit_of_measurement ?? null,
      normalReferenceRange: r.parameter?.normal_reference_range ?? null,
      testTypeId: r.parameter?.test_type?.id ?? null,
      testName: r.parameter?.test_type?.test_name ?? null,
      resultValue: r.result_value,
      interpretation: r.interpretation,
      notes: r.notes,
      performedBy: r.performed_by,
      performedByEmail: r.rel_performed_by?.email ?? null,
      performedAt: r.performed_at?.toISOString() ?? null,
      verifiedBy: r.verified_by,
      verifiedByEmail: r.rel_verified_by?.email ?? null,
      verifiedAt: r.verified_at?.toISOString() ?? null,
      isCritical: r.interpretation === 'CRITICAL',
      isVerified: Boolean(r.verified_at),
    };
  }
}
