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
import {
  clinicalServiceKind,
  isSystemFeeCode,
} from '../../catalog/clinical-service.util';
import { resolveRevenueAccountCode } from '../../billing/domain/service-revenue-account';

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
  observations?: string;
  conclusion?: string;
  evidenceName?: string;
  /** Soft link to OutpatientVisits — must survive findings updates */
  visitId?: string;
  doctorName?: string;
  comments?: string;
  tests?: Array<{
    name?: string;
    unit?: string;
    range?: string;
    result?: string;
    testTypeId?: string;
  }>;
  /** Set when lab releases verified results to the ordering doctor */
  releasedToDoctorAt?: string;
  releasedToDoctorBy?: string;
};

function ageFromDob(dob: Date | null | undefined): number {
  if (!dob) return 0;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age -= 1;
  return Math.max(0, age);
}

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
    if (name.length > 255) {
      throw new BadRequestException('testName max length is 255');
    }
    if (
      input.standardPrice !== undefined &&
      (Number.isNaN(input.standardPrice) || input.standardPrice < 0)
    ) {
      throw new BadRequestException('standardPrice must be >= 0');
    }
    try {
      const categoryName = input.category?.trim() || null;
      const categoryId = categoryName
        ? await this.resolveTestCategoryId(categoryName)
        : null;
      const row = await this.prisma.testTypes.create({
        data: {
          test_name: name,
          category: categoryName,
          category_id: categoryId,
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
      if (name.length > 255) {
        throw new BadRequestException('testName max length is 255');
      }
    }
    try {
      let categoryPatch: {
        category?: string | null;
        category_id?: string | null;
      } = {};
      if (input.category !== undefined) {
        const categoryName = input.category?.trim() || null;
        categoryPatch = {
          category: categoryName,
          category_id: categoryName
            ? await this.resolveTestCategoryId(categoryName)
            : null,
        };
      }
      const row = await this.prisma.testTypes.update({
        where: { id },
        data: {
          ...(input.testName !== undefined
            ? { test_name: input.testName.trim() }
            : {}),
          ...categoryPatch,
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
    consultationId?: string;
    appointmentId?: string;
    visitId?: string;
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

    const appointmentScope = await this.labScopeWhere(
      filters?.appointmentId,
      filters?.visitId,
      filters?.consultationId,
    );

    const searchOr: Prisma.LaboratoryRequestsWhereInput[] | undefined = q
      ? [
          { request_number: { contains: q, mode: 'insensitive' } },
          {
            patient: {
              patient_number: { contains: q, mode: 'insensitive' },
            },
          },
        ]
      : undefined;

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
      ...(appointmentScope.OR || searchOr
        ? {
            AND: [
              ...(appointmentScope.OR ? [{ OR: appointmentScope.OR }] : []),
              ...(searchOr ? [{ OR: searchOr }] : []),
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
    const parsed = this.parseNotes(r.notes);
    const profile = r.patient?.user.core_profiles_user_id?.[0];
    const requestedByUser = await this.prisma.user.findFirst({
      where: { id: r.requested_by },
      include: { core_profiles_user_id: true },
    });
    const doctor = r.requesting_doctor;
    let requestingDoctorDepartment: string | null = null;
    if (doctor?.department_id) {
      const dept = await this.prisma.departments.findFirst({
        where: { id: doctor.department_id },
        select: { name: true },
      });
      requestingDoctorDepartment = dept?.name ?? null;
    }
    if (!requestingDoctorDepartment) {
      requestingDoctorDepartment =
        doctor?.specialization?.trim() ||
        doctor?.position?.trim() ||
        null;
    }
    const categories = [
      ...new Set(
        ordered
          .map((t) => t.category)
          .filter((c): c is string => Boolean(c?.trim())),
      ),
    ];
    const results = r.laboratory_results_request_id.map((res) =>
      this.mapResult(res),
    );
    return {
      ...this.mapRequest(r),
      patientPhone: profile?.phone ?? null,
      patientEmail: r.patient?.user.email ?? null,
      patientGender: profile?.gender ?? null,
      patientAge: ageFromDob(profile?.date_of_birth ?? null),
      patientDob: profile?.date_of_birth
        ? profile.date_of_birth.toISOString().slice(0, 10)
        : null,
      requestingDoctorDepartment,
      requestingDoctorSpecialization: doctor?.specialization ?? null,
      requestedByName:
        this.profileName(requestedByUser?.core_profiles_user_id) ??
        requestedByUser?.email ??
        null,
      categories,
      observations: parsed.observations ?? null,
      conclusion: parsed.conclusion ?? null,
      evidenceName: parsed.evidenceName ?? null,
      visitId: parsed.visitId ?? null,
      releasedToDoctorAt: parsed.releasedToDoctorAt ?? null,
      releasedToDoctorBy: parsed.releasedToDoctorBy ?? null,
      releasedToDoctor: Boolean(parsed.releasedToDoctorAt),
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
      samples: r.laboratory_samples_request_id.map((s) => this.mapSample(s)),
      results,
      resultCount: results.length,
      verifiedCount: results.filter((x) => x.isVerified).length,
      criticalCount: results.filter((x) => x.isCritical).length,
      allVerified:
        results.length > 0 && results.every((x) => x.isVerified),
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

  /**
   * Doctor Consultation Lab Report — authoritative LIS results for a visit.
   * Only includes requests that have been released to the doctor.
   */
  public async getVisitLabReport(visitId: string) {
    const id = visitId?.trim();
    if (!id) throw new BadRequestException('visitId is required');

    const listed = await this.listRequests({ visitId: id, take: 50, skip: 0 });
    const details = await Promise.all(
      listed.items.map((item) => this.getRequest(item.id)),
    );
    const released = details.filter((d) =>
      Boolean((d as { releasedToDoctorAt?: string | null }).releasedToDoctorAt),
    );

    const lines = released.flatMap((d) =>
      (d.results as Array<ReturnType<LabOperationsUseCase['mapResult']>>).map(
        (r) => ({
          ...r,
          requestId: d.id,
          requestNumber: d.requestNumber,
          requestStatus: d.status,
        }),
      ),
    );

    const releasedAts = released
      .map((d) => (d as { releasedToDoctorAt?: string | null }).releasedToDoctorAt)
      .filter((v): v is string => Boolean(v));
    releasedAts.sort();

    return {
      visitId: id,
      released: released.length > 0,
      releasedAt: releasedAts.length
        ? releasedAts[releasedAts.length - 1]
        : null,
      requestCount: listed.items.length,
      releasedRequestCount: released.length,
      requests: released.map((d) => ({
        id: d.id,
        requestNumber: d.requestNumber,
        status: d.status,
        observations: d.observations,
        conclusion: d.conclusion,
        releasedToDoctorAt: (d as { releasedToDoctorAt?: string | null })
          .releasedToDoctorAt,
        resultCount: d.resultCount,
        verifiedCount: d.verifiedCount,
        criticalCount: d.criticalCount,
      })),
      lines,
      observations: released
        .map((d) => d.observations)
        .filter((v): v is string => Boolean(v?.trim()))
        .join('\n\n') || null,
      conclusion: released
        .map((d) => d.conclusion)
        .filter((v): v is string => Boolean(v?.trim()))
        .join('\n\n') || null,
    };
  }

  public async updateRequestFindings(
    id: string,
    input: {
      observations?: string | null;
      conclusion?: string | null;
      evidenceName?: string | null;
      text?: string | null;
      actorUserId: string;
    },
  ) {
    const r = await this.prisma.laboratoryRequests.findFirst({
      where: { id },
      select: { id: true, notes: true },
    });
    if (!r) throw new NotFoundException('Lab request not found');
    const parsed = this.parseNotes(r.notes);
    const notes = this.encodeNotesPayload({
      orderedTestTypeIds: parsed.orderedTestTypeIds,
      text:
        input.text !== undefined
          ? input.text?.trim() || undefined
          : parsed.text,
      observations:
        input.observations !== undefined
          ? input.observations?.trim() || undefined
          : parsed.observations,
      conclusion:
        input.conclusion !== undefined
          ? input.conclusion?.trim() || undefined
          : parsed.conclusion,
      evidenceName:
        input.evidenceName !== undefined
          ? input.evidenceName?.trim() || undefined
          : parsed.evidenceName,
      // Preserve soft links / release metadata — never wipe on findings save
      visitId: parsed.visitId,
      doctorName: parsed.doctorName,
      comments: parsed.comments,
      tests: parsed.tests,
      releasedToDoctorAt: parsed.releasedToDoctorAt,
      releasedToDoctorBy: parsed.releasedToDoctorBy,
    });
    await this.prisma.laboratoryRequests.update({
      where: { id },
      data: { notes },
    });
    await this.audit.recordMutation({
      userId: input.actorUserId,
      action: 'UPDATE',
      entityType: 'laboratory.requests',
      entityId: id,
      newValues: {
        observations: input.observations,
        conclusion: input.conclusion,
        evidenceName: input.evidenceName,
      },
    });
    return this.getRequest(id);
  }

  public async resultsSummary() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

    const hasResults = { laboratory_results_request_id: { some: {} } };
    const [total, completedToday, completedThisWeek] = await Promise.all([
      this.prisma.laboratoryRequests.count({ where: hasResults }),
      this.prisma.laboratoryRequests.count({
        where: {
          ...hasResults,
          status: 'COMPLETED',
          updated_at: { gte: startOfDay },
        },
      }),
      this.prisma.laboratoryRequests.count({
        where: {
          ...hasResults,
          status: 'COMPLETED',
          updated_at: { gte: startOfWeek },
        },
      }),
    ]);
    return { total, completedToday, completedThisWeek };
  }

  public async listResultBundles(filters?: {
    search?: string;
    status?: string;
    criticalOnly?: boolean;
    unverifiedOnly?: boolean;
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
    const q = filters?.search?.trim();
    const take = Math.min(Math.max(filters?.take ?? 50, 1), 100);
    const skip = Math.max(filters?.skip ?? 0, 0);
    const resultSome: Prisma.ResultsWhereInput = {
      ...(filters?.criticalOnly ? { interpretation: 'CRITICAL' } : {}),
      ...(filters?.unverifiedOnly ? { verified_at: null } : {}),
    };
    const where: Prisma.LaboratoryRequestsWhereInput = {
      laboratory_results_request_id: { some: resultSome },
      ...(filters?.status ? { status: filters.status } : {}),
      ...(q
        ? {
            OR: [
              { request_number: { contains: q, mode: 'insensitive' } },
              {
                patient: {
                  patient_number: { contains: q, mode: 'insensitive' },
                },
              },
              {
                patient: {
                  user: {
                    core_profiles_user_id: {
                      some: {
                        OR: [
                          { first_name: { contains: q, mode: 'insensitive' } },
                          { last_name: { contains: q, mode: 'insensitive' } },
                        ],
                      },
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.laboratoryRequests.findMany({
        where,
        include: {
          ...this.requestInclude(),
          laboratory_results_request_id: {
            include: {
              parameter: { include: { test_type: true } },
              rel_performed_by: true,
              rel_verified_by: true,
            },
            orderBy: { created_at: 'asc' },
          },
        },
        orderBy: [{ updated_at: 'desc' }, { created_at: 'desc' }],
        take,
        skip,
      }),
      this.prisma.laboratoryRequests.count({ where }),
    ]);
    return {
      total,
      take,
      skip,
      items: rows.map((r) => {
        const results = r.laboratory_results_request_id.map((res) =>
          this.mapResult(res),
        );
        const panels = [
          ...new Set(
            results
              .map((x) => x.testName)
              .filter((n): n is string => Boolean(n)),
          ),
        ];
        return {
          ...this.mapRequest(r),
          results,
          resultCount: results.length,
          verifiedCount: results.filter((x) => x.isVerified).length,
          criticalCount: results.filter((x) => x.isCritical).length,
          allVerified:
            results.length > 0 && results.every((x) => x.isVerified),
          panels,
          updatedAt: r.updated_at.toISOString(),
        };
      }),
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
    return this.encodeNotesPayload({
      orderedTestTypeIds,
      ...(text?.trim() ? { text: text.trim() } : {}),
    });
  }

  public encodeNotesPayload(payload: LabNotesPayload): string | null {
    const orderedTestTypeIds = payload.orderedTestTypeIds.filter(
      (id) => typeof id === 'string',
    );
    const next: LabNotesPayload = { orderedTestTypeIds };
    if (payload.text?.trim()) next.text = payload.text.trim();
    if (payload.observations?.trim())
      next.observations = payload.observations.trim();
    if (payload.conclusion?.trim()) next.conclusion = payload.conclusion.trim();
    if (payload.evidenceName?.trim())
      next.evidenceName = payload.evidenceName.trim();
    if (payload.visitId?.trim()) next.visitId = payload.visitId.trim();
    if (payload.doctorName?.trim()) next.doctorName = payload.doctorName.trim();
    if (payload.comments?.trim()) next.comments = payload.comments.trim();
    if (Array.isArray(payload.tests) && payload.tests.length) {
      next.tests = payload.tests;
    }
    if (payload.releasedToDoctorAt?.trim()) {
      next.releasedToDoctorAt = payload.releasedToDoctorAt.trim();
    }
    if (payload.releasedToDoctorBy?.trim()) {
      next.releasedToDoctorBy = payload.releasedToDoctorBy.trim();
    }
    if (
      !next.orderedTestTypeIds.length &&
      !next.text &&
      !next.observations &&
      !next.conclusion &&
      !next.evidenceName &&
      !next.visitId &&
      !next.releasedToDoctorAt &&
      !(next.tests && next.tests.length)
    ) {
      return null;
    }
    return JSON.stringify(next);
  }

  public parseNotes(raw: string | null): LabNotesPayload {
    if (!raw?.trim()) return { orderedTestTypeIds: [] };
    try {
      const parsed = JSON.parse(raw) as LabNotesPayload & {
        tests?: Array<{ name?: string; testTypeId?: string }>;
        doctorNotes?: string;
      };
      const softLink = {
        visitId:
          typeof parsed.visitId === 'string' ? parsed.visitId : undefined,
        doctorName:
          typeof parsed.doctorName === 'string' ? parsed.doctorName : undefined,
        comments:
          typeof parsed.comments === 'string' ? parsed.comments : undefined,
        tests: Array.isArray(parsed.tests) ? parsed.tests : undefined,
        releasedToDoctorAt:
          typeof parsed.releasedToDoctorAt === 'string'
            ? parsed.releasedToDoctorAt
            : undefined,
        releasedToDoctorBy:
          typeof parsed.releasedToDoctorBy === 'string'
            ? parsed.releasedToDoctorBy
            : undefined,
      };
      const extras = {
        observations:
          typeof parsed.observations === 'string'
            ? parsed.observations
            : undefined,
        conclusion:
          typeof parsed.conclusion === 'string' ? parsed.conclusion : undefined,
        evidenceName:
          typeof parsed.evidenceName === 'string'
            ? parsed.evidenceName
            : undefined,
        ...softLink,
      };
      if (Array.isArray(parsed?.orderedTestTypeIds)) {
        return {
          orderedTestTypeIds: parsed.orderedTestTypeIds.filter(
            (id) => typeof id === 'string',
          ),
          text:
            typeof parsed.text === 'string'
              ? parsed.text
              : typeof parsed.doctorNotes === 'string'
                ? parsed.doctorNotes
                : undefined,
          ...extras,
        };
      }
      // Legacy visit notes: { tests: [{ name }] }
      if (Array.isArray(parsed?.tests)) {
        const ids = parsed.tests
          .map((t) => t.testTypeId)
          .filter((id): id is string => typeof id === 'string');
        return {
          orderedTestTypeIds: ids,
          text:
            typeof parsed.text === 'string'
              ? parsed.text
              : typeof parsed.doctorNotes === 'string'
                ? parsed.doctorNotes
                : undefined,
          ...extras,
        };
      }
    } catch {
      /* free-text notes */
    }
    return { orderedTestTypeIds: [], text: raw };
  }

  public async resolveOrderedPanels(notes: string | null) {
    const { orderedTestTypeIds, text } = this.parseNotes(notes);
    let ids = orderedTestTypeIds;
    if (!ids.length && notes?.trim()) {
      try {
        const parsed = JSON.parse(notes) as {
          tests?: Array<{ name?: string }>;
        };
        const names = (parsed.tests ?? [])
          .map((t) => t.name?.trim())
          .filter(Boolean) as string[];
        if (names.length) {
          const found = await this.prisma.testTypes.findMany({
            where: {
              is_active: true,
              OR: names.map((name) => ({
                test_name: { equals: name, mode: 'insensitive' },
              })),
            },
            select: { id: true },
          });
          ids = found.map((t) => t.id);
        }
      } catch {
        /* ignore */
      }
    }
    if (!ids.length) {
      return [] as Array<{
        id: string;
        testName: string;
        category: string | null;
        parameters: ReturnType<LabOperationsUseCase['mapParameter']>[];
        notesText?: string;
      }>;
    }
    const types = await this.prisma.testTypes.findMany({
      where: { id: { in: ids } },
      include: {
        laboratory_test_parameters_test_type_id: {
          where: { is_active: true },
          orderBy: { display_order: 'asc' },
        },
      },
    });
    const byId = new Map(types.map((t) => [t.id, t]));
    return ids
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

  /** Scope lab requests to a consultation, appointment, and/or outpatient visit. */
  private async labScopeWhere(
    appointmentId?: string,
    visitId?: string,
    consultationId?: string,
  ): Promise<Prisma.LaboratoryRequestsWhereInput> {
    const or: Prisma.LaboratoryRequestsWhereInput[] = [];
    if (consultationId) {
      or.push({ consultation_id: consultationId });
    }
    if (appointmentId) {
      or.push({ consultation: { appointment_id: appointmentId } });
      const visits = await this.prisma.outpatientVisits.findMany({
        where: { payload: { path: ['appointmentId'], equals: appointmentId } },
        select: { id: true },
        take: 20,
      });
      for (const v of visits) {
        or.push({ notes: { contains: v.id } });
        or.push({
          request_number: `LAB-${v.id.slice(0, 8).toUpperCase()}`,
        });
      }
    }
    if (visitId) {
      or.push({ notes: { contains: visitId } });
      or.push({
        request_number: `LAB-${visitId.slice(0, 8).toUpperCase()}`,
      });
    }
    if (!or.length) return {};
    return { OR: or };
  }

  private async resolveTestCategoryId(name: string): Promise<string> {
    const trimmed = name.trim();
    const slug = trimmed
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 100);
    const row = await this.prisma.testCategories.upsert({
      where: { name: trimmed },
      create: { name: trimmed, slug: slug || 'general', is_active: true },
      update: { is_active: true },
    });
    return row.id;
  }

  private async resolveServiceCategoryId(name: string): Promise<string> {
    const trimmed = name.trim();
    const slug = trimmed
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 100);
    const row = await this.prisma.serviceCategories.upsert({
      where: { name: trimmed },
      create: { name: trimmed, slug: slug || 'general', is_active: true },
      update: { is_active: true },
    });
    return row.id;
  }

  private async resolveServiceRevenueAccountId(input: {
    category?: string | null;
    serviceCode: string;
    serviceName: string;
  }): Promise<string | null> {
    const accountCode = resolveRevenueAccountCode(input);
    const account = await this.prisma.accounts.findUnique({
      where: { account_code: accountCode },
    });
    if (
      !account ||
      !account.is_active ||
      !account.is_postable ||
      account.account_type !== 'REVENUE'
    ) {
      return null;
    }
    return account.id;
  }

  private mapTestType(
    t: {
      id: string;
      test_name: string;
      category: string | null;
      category_id?: string | null;
      description: string | null;
      units?: string | null;
      normal_range?: string | null;
      template?: Prisma.JsonValue | null;
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
      categoryId: t.category_id ?? null,
      description: t.description,
      units: t.units ?? null,
      normalRange: t.normal_range ?? null,
      template: t.template ?? null,
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
      visitId: parsed.visitId ?? null,
      releasedToDoctorAt: parsed.releasedToDoctorAt ?? null,
      releasedToDoctorBy: parsed.releasedToDoctorBy ?? null,
      releasedToDoctor: Boolean(parsed.releasedToDoctorAt),
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
    rel_performed_by?: { email: string | null } | null;
    rel_verified_by?: { email: string | null } | null;
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

  // ── Clinical services / procedures / surgeries (billing.services) ────────

  async listClinicalServices(query: {
    search?: string;
    category?: string;
    kind?: 'service' | 'surgery';
    active?: boolean;
    take?: number;
    skip?: number;
  }) {
    const take = Math.min(Math.max(query.take ?? 50, 1), 200);
    const skip = Math.max(query.skip ?? 0, 0);
    const q = query.search?.trim();
    const where: Prisma.ServicesWhereInput = {
      ...(query.active !== undefined ? { is_active: query.active } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(q
        ? {
            OR: [
              { service_code: { contains: q, mode: 'insensitive' } },
              { service_name: { contains: q, mode: 'insensitive' } },
              { category: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.services.count({ where }),
      this.prisma.services.findMany({
        where,
        orderBy: [{ category: 'asc' }, { service_name: 'asc' }],
        skip,
        take: take * 3, // over-fetch then filter system fee codes / kind
      }),
    ]);

    const items = rows
      .filter((r) => !isSystemFeeCode(r.service_code))
      .map((r) => ({
        id: r.id,
        serviceCode: r.service_code,
        serviceName: r.service_name,
        category: r.category,
        categoryId: r.category_id,
        description: r.description,
        standardPrice: r.standard_price.toString(),
        isActive: r.is_active,
        kind: clinicalServiceKind(r.category),
      }))
      .filter((r) => (query.kind ? r.kind === query.kind : true))
      .slice(0, take);

    return {
      items,
      total: query.kind || q ? items.length : Math.max(0, total - 5),
      page: Math.floor(skip / take) + 1,
      limit: take,
    };
  }

  async createClinicalService(input: {
    serviceCode: string;
    serviceName: string;
    category?: string;
    description?: string;
    standardPrice: string | number;
    isActive?: boolean;
    actorUserId: string;
  }) {
    const code = input.serviceCode.trim().toUpperCase();
    if (!code) throw new BadRequestException('Service code is required');
    if (isSystemFeeCode(code)) {
      throw new BadRequestException(
        `${code} is a system fee-schedule code and cannot be created here`,
      );
    }
    const name = input.serviceName.trim();
    if (!name) throw new BadRequestException('Service name is required');

    try {
      const categoryName = input.category?.trim() || null;
      const categoryId = categoryName
        ? await this.resolveServiceCategoryId(categoryName)
        : null;
      const revenueAccountId = await this.resolveServiceRevenueAccountId({
        category: categoryName,
        serviceCode: code,
        serviceName: name,
      });
      const row = await this.prisma.services.create({
        data: {
          service_code: code,
          service_name: name,
          category: categoryName,
          category_id: categoryId,
          description: input.description?.trim() || null,
          standard_price: new Prisma.Decimal(Number(input.standardPrice) || 0),
          revenue_account_id: revenueAccountId,
          is_active: input.isActive ?? true,
        },
      });
      await this.audit.recordMutation({
        userId: input.actorUserId,
        action: 'CREATE',
        entityType: 'billing.services',
        entityId: row.id,
        newValues: { serviceCode: row.service_code, via: 'laboratory' },
      });
      return {
        id: row.id,
        serviceCode: row.service_code,
        serviceName: row.service_name,
        category: row.category,
        categoryId: row.category_id,
        description: row.description,
        standardPrice: row.standard_price.toString(),
        isActive: row.is_active,
        kind: clinicalServiceKind(row.category),
      };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(`Service code ${code} already exists`);
      }
      throw err;
    }
  }

  async updateClinicalService(
    id: string,
    input: {
      serviceName?: string;
      category?: string | null;
      description?: string | null;
      standardPrice?: string | number;
      isActive?: boolean;
      actorUserId: string;
    },
  ) {
    const existing = await this.prisma.services.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Service not found');
    if (isSystemFeeCode(existing.service_code)) {
      throw new BadRequestException(
        'System fee-schedule services cannot be edited from laboratory',
      );
    }

    const data: Prisma.ServicesUpdateInput = {};
    if (input.serviceName !== undefined)
      data.service_name = input.serviceName.trim();
    if (input.category !== undefined) {
      const categoryName = input.category?.trim() || null;
      data.category = categoryName;
      data.category_rel = categoryName
        ? { connect: { id: await this.resolveServiceCategoryId(categoryName) } }
        : { disconnect: true };
    }
    if (input.description !== undefined) data.description = input.description;
    if (input.standardPrice !== undefined) {
      data.standard_price = new Prisma.Decimal(Number(input.standardPrice) || 0);
    }
    if (input.isActive !== undefined) data.is_active = input.isActive;

    const nextCategory =
      input.category !== undefined ? input.category?.trim() || null : existing.category;
    const nextName =
      input.serviceName !== undefined ? input.serviceName.trim() : existing.service_name;
    const nextActive = input.isActive ?? existing.is_active;
    if (nextActive && !existing.revenue_account_id) {
      const revenueAccountId = await this.resolveServiceRevenueAccountId({
        category: nextCategory,
        serviceCode: existing.service_code,
        serviceName: nextName,
      });
      if (revenueAccountId) data.revenue_account_id = revenueAccountId;
    }

    const row = await this.prisma.services.update({ where: { id }, data });
    await this.audit.recordMutation({
      userId: input.actorUserId,
      action: 'UPDATE',
      entityType: 'billing.services',
      entityId: row.id,
      oldValues: { serviceCode: existing.service_code },
      newValues: { serviceCode: row.service_code, via: 'laboratory' },
    });
    return {
      id: row.id,
      serviceCode: row.service_code,
      serviceName: row.service_name,
      category: row.category,
      categoryId: row.category_id,
      description: row.description,
      standardPrice: row.standard_price.toString(),
      isActive: row.is_active,
      kind: clinicalServiceKind(row.category),
    };
  }
}
