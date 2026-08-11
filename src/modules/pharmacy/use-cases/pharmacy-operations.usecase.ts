/**
 * Pharmacy domain operations — suppliers, categories, medications, batches,
 * stock ledger mutations, prescriptions, purchase orders.
 * Source of truth: db.sql pharmacy.*
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
import { profileName, USER_PROFILE_INCLUDE } from '../pharmacy-names';

const MED_FORMS = [
  'TABLET',
  'CAPSULE',
  'SYRUP',
  'INJECTION',
  'CREAM',
  'OTHER',
] as const;

const RX_STATUSES = [
  'PENDING',
  'DISPENSED',
  'PARTIALLY_DISPENSED',
  'CANCELLED',
] as const;

const PO_STATUSES = ['DRAFT', 'SENT', 'RECEIVED', 'CANCELLED'] as const;

function paginateParams(page?: number, limit?: number) {
  const resolvedLimit = Math.min(Math.max(limit ?? 50, 1), 100);
  const resolvedPage = Math.max(page ?? 1, 1);
  return {
    page: resolvedPage,
    limit: resolvedLimit,
    skip: (resolvedPage - 1) * resolvedLimit,
  };
}

@Injectable()
export class PharmacyOperationsUseCase {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly audit: HmsAuditWriter,
  ) {}

  // ── Overview ──────────────────────────────────────────────

  public async overview() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const in30 = new Date();
    in30.setDate(in30.getDate() + 30);

    const [
      medications,
      activeSuppliers,
      pendingRx,
      openPos,
      lowStock,
      expiringSoon,
      expiredBatches,
      todaysDispenses,
    ] = await Promise.all([
      this.prisma.medications.count({
        where: { is_active: true, deleted_at: null },
      }),
      this.prisma.suppliers.count({ where: { is_active: true } }),
      this.prisma.prescriptions.count({
        where: {
          deleted_at: null,
          is_voided: false,
          status: { in: ['PENDING', 'PARTIALLY_DISPENSED'] },
        },
      }),
      this.prisma.purchaseOrders.count({
        where: { status: { in: ['DRAFT', 'SENT'] } },
      }),
      this.prisma.batches.count({
        where: { quantity_on_hand: { gt: 0, lte: 10 } },
      }),
      this.prisma.batches.count({
        where: {
          quantity_on_hand: { gt: 0 },
          expiry_date: { gte: startOfDay, lte: in30 },
        },
      }),
      this.prisma.batches.count({
        where: {
          quantity_on_hand: { gt: 0 },
          expiry_date: { lt: startOfDay },
        },
      }),
      this.prisma.stockMovements.count({
        where: {
          movement_type: 'DISPENSE',
          created_at: { gte: startOfDay },
        },
      }),
    ]);

    return {
      medications,
      activeSuppliers,
      pendingPrescriptions: pendingRx,
      openPurchaseOrders: openPos,
      lowStockBatches: lowStock,
      expiringSoonBatches: expiringSoon,
      expiredBatchesWithStock: expiredBatches,
      todaysDispenses,
    };
  }

  // ── Suppliers ─────────────────────────────────────────────

  public async listSuppliers(filters?: {
    active?: boolean;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const { page, limit, skip } = paginateParams(filters?.page, filters?.limit);
    const q = filters?.search?.trim();
    const where = {
      ...(filters?.active !== undefined
        ? { is_active: filters.active }
        : {}),
      ...(q
        ? {
            OR: [
              { company_name: { contains: q, mode: 'insensitive' as const } },
              { contact_person: { contains: q, mode: 'insensitive' as const } },
              { email: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.suppliers.findMany({
        where,
        orderBy: { company_name: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.suppliers.count({ where }),
    ]);
    return {
      items: rows.map((s) => this.mapSupplier(s)),
      total,
      page,
      limit,
    };
  }

  public async getSupplier(id: string) {
    const s = await this.prisma.suppliers.findFirst({ where: { id } });
    if (!s) throw new NotFoundException('Supplier not found');
    return this.mapSupplier(s);
  }

  public async createSupplier(input: {
    companyName: string;
    contactPerson?: string;
    phone?: string;
    email?: string;
    address?: string;
    actorUserId?: string;
  }) {
    if (!input.companyName?.trim()) {
      throw new BadRequestException('companyName is required');
    }
    const row = await this.prisma.suppliers.create({
      data: {
        company_name: input.companyName.trim(),
        contact_person: input.contactPerson?.trim() || null,
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        address: input.address?.trim() || null,
        is_active: true,
      },
    });
    await this.audit.recordMutation({
      userId: input.actorUserId,
      action: 'CREATE',
      entityType: 'pharmacy.suppliers',
      entityId: row.id,
    });
    return this.mapSupplier(row);
  }

  public async updateSupplier(
    id: string,
    input: {
      companyName?: string;
      contactPerson?: string | null;
      phone?: string | null;
      email?: string | null;
      address?: string | null;
      isActive?: boolean;
      actorUserId?: string;
    },
  ) {
    await this.getSupplier(id);
    const row = await this.prisma.suppliers.update({
      where: { id },
      data: {
        ...(input.companyName !== undefined
          ? { company_name: input.companyName.trim() }
          : {}),
        ...(input.contactPerson !== undefined
          ? { contact_person: input.contactPerson }
          : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
      },
    });
    await this.audit.recordMutation({
      userId: input.actorUserId,
      action: 'UPDATE',
      entityType: 'pharmacy.suppliers',
      entityId: id,
    });
    return this.mapSupplier(row);
  }

  public async setSupplierActive(
    id: string,
    isActive: boolean,
    actorUserId?: string,
  ) {
    return this.updateSupplier(id, { isActive, actorUserId });
  }

  private mapSupplier(s: {
    id: string;
    company_name: string;
    contact_person: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    is_active: boolean;
  }) {
    return {
      id: s.id,
      companyName: s.company_name,
      contactPerson: s.contact_person,
      phone: s.phone,
      email: s.email,
      address: s.address,
      isActive: s.is_active,
    };
  }

  // ── Categories ────────────────────────────────────────────

  public async listCategories(active?: boolean) {
    const rows = await this.prisma.categories.findMany({
      where: active === undefined ? undefined : { is_active: active },
      orderBy: { category_name: 'asc' },
      take: 200,
    });
    return rows.map((c) => ({
      id: c.id,
      categoryName: c.category_name,
      description: c.description,
      isActive: c.is_active,
    }));
  }

  public async getCategory(id: string) {
    const c = await this.prisma.categories.findFirst({ where: { id } });
    if (!c) throw new NotFoundException('Category not found');
    return {
      id: c.id,
      categoryName: c.category_name,
      description: c.description,
      isActive: c.is_active,
    };
  }

  public async createCategory(input: {
    categoryName: string;
    description?: string;
    actorUserId?: string;
  }) {
    const name = input.categoryName?.trim();
    if (!name) throw new BadRequestException('categoryName is required');
    try {
      const row = await this.prisma.categories.create({
        data: {
          category_name: name,
          description: input.description?.trim() || null,
          is_active: true,
        },
      });
      await this.audit.recordMutation({
        userId: input.actorUserId,
        action: 'CREATE',
        entityType: 'pharmacy.categories',
        entityId: row.id,
      });
      return {
        id: row.id,
        categoryName: row.category_name,
        description: row.description,
        isActive: row.is_active,
      };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('Category name already exists');
      }
      throw err;
    }
  }

  public async updateCategory(
    id: string,
    input: {
      categoryName?: string;
      description?: string | null;
      isActive?: boolean;
      actorUserId?: string;
    },
  ) {
    await this.getCategory(id);
    try {
      const row = await this.prisma.categories.update({
        where: { id },
        data: {
          ...(input.categoryName !== undefined
            ? { category_name: input.categoryName.trim() }
            : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
        },
      });
      await this.audit.recordMutation({
        userId: input.actorUserId,
        action: 'UPDATE',
        entityType: 'pharmacy.categories',
        entityId: id,
      });
      return {
        id: row.id,
        categoryName: row.category_name,
        description: row.description,
        isActive: row.is_active,
      };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('Category name already exists');
      }
      throw err;
    }
  }

  // ── Medications ───────────────────────────────────────────

  public async listMedications(filters?: {
    search?: string;
    categoryId?: string;
    form?: string;
    active?: boolean;
    page?: number;
    limit?: number;
  }) {
    if (filters?.form) {
      const form = filters.form.toUpperCase();
      if (!MED_FORMS.includes(form as (typeof MED_FORMS)[number])) {
        throw new BadRequestException(
          `form must be one of ${MED_FORMS.join(', ')}`,
        );
      }
      filters.form = form;
    }
    const { page, limit, skip } = paginateParams(filters?.page, filters?.limit);
    const q = filters?.search?.trim();
    const where = {
      deleted_at: null,
      ...(filters?.active !== undefined
        ? { is_active: filters.active }
        : { is_active: true }),
      ...(filters?.categoryId ? { category_id: filters.categoryId } : {}),
      ...(filters?.form ? { form: filters.form } : {}),
      ...(q
        ? {
            OR: [
              { medication_name: { contains: q, mode: 'insensitive' as const } },
              { generic_name: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.medications.findMany({
        where,
        include: {
          category: true,
          pharmacy_batches_medication_id: {
            select: { quantity_on_hand: true, expiry_date: true },
          },
        },
        orderBy: { medication_name: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.medications.count({ where }),
    ]);
    return {
      items: rows.map((m) => {
        const batches = m.pharmacy_batches_medication_id;
        const stock = batches.reduce(
          (s, b) => s + Number(b.quantity_on_hand),
          0,
        );
        return {
          id: m.id,
          medicationName: m.medication_name,
          genericName: m.generic_name,
          categoryId: m.category_id,
          categoryName: m.category?.category_name ?? null,
          form: m.form,
          strength: m.strength,
          unit: m.unit,
          standardSellingPrice: Number(m.standard_selling_price),
          description: m.description,
          sideEffects: m.side_effects,
          contraindications: m.contraindications,
          isActive: m.is_active,
          quantityOnHand: stock,
          batchCount: batches.length,
        };
      }),
      total,
      page,
      limit,
    };
  }

  public async getMedication(id: string) {
    const m = await this.prisma.medications.findFirst({
      where: { id, deleted_at: null },
      include: {
        category: true,
        pharmacy_batches_medication_id: {
          orderBy: { expiry_date: 'asc' },
          take: 100,
          include: { supplier: true },
        },
      },
    });
    if (!m) throw new NotFoundException('Medication not found');
    return {
      id: m.id,
      medicationName: m.medication_name,
      genericName: m.generic_name,
      categoryId: m.category_id,
      categoryName: m.category?.category_name ?? null,
      form: m.form,
      strength: m.strength,
      unit: m.unit,
      standardSellingPrice: Number(m.standard_selling_price),
      description: m.description,
      sideEffects: m.side_effects,
      contraindications: m.contraindications,
      isActive: m.is_active,
      batches: m.pharmacy_batches_medication_id.map((b) =>
        this.mapBatch(b),
      ),
    };
  }

  public async createMedication(input: {
    medicationName: string;
    genericName?: string;
    categoryId?: string;
    form?: string;
    strength?: string;
    unit?: string;
    standardSellingPrice?: number;
    description?: string;
    sideEffects?: string;
    contraindications?: string;
    actorUserId?: string;
  }) {
    const name = input.medicationName?.trim();
    if (!name) throw new BadRequestException('medicationName is required');
    let form = input.form?.toUpperCase();
    if (form && !MED_FORMS.includes(form as (typeof MED_FORMS)[number])) {
      throw new BadRequestException(
        `form must be one of ${MED_FORMS.join(', ')}`,
      );
    }
    if (
      input.standardSellingPrice !== undefined &&
      input.standardSellingPrice < 0
    ) {
      throw new BadRequestException('standardSellingPrice cannot be negative');
    }
    if (input.categoryId) {
      await this.getCategory(input.categoryId);
    }
    try {
      const row = await this.prisma.medications.create({
        data: {
          medication_name: name,
          generic_name: input.genericName?.trim() || null,
          category_id: input.categoryId || null,
          form: form || null,
          strength: input.strength?.trim() || null,
          unit: input.unit?.trim() || null,
          standard_selling_price: input.standardSellingPrice ?? 0,
          description: input.description?.trim() || null,
          side_effects: input.sideEffects?.trim() || null,
          contraindications: input.contraindications?.trim() || null,
          is_active: true,
        },
      });
      await this.audit.recordMutation({
        userId: input.actorUserId,
        action: 'CREATE',
        entityType: 'pharmacy.medications',
        entityId: row.id,
      });
      return this.getMedication(row.id);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('Medication name already exists');
      }
      throw err;
    }
  }

  public async updateMedication(
    id: string,
    input: {
      medicationName?: string;
      genericName?: string | null;
      categoryId?: string | null;
      form?: string | null;
      strength?: string | null;
      unit?: string | null;
      standardSellingPrice?: number;
      description?: string | null;
      sideEffects?: string | null;
      contraindications?: string | null;
      isActive?: boolean;
      actorUserId?: string;
    },
  ) {
    await this.getMedication(id);
    if (input.form) {
      const form = input.form.toUpperCase();
      if (!MED_FORMS.includes(form as (typeof MED_FORMS)[number])) {
        throw new BadRequestException(
          `form must be one of ${MED_FORMS.join(', ')}`,
        );
      }
      input.form = form;
    }
    if (
      input.standardSellingPrice !== undefined &&
      input.standardSellingPrice < 0
    ) {
      throw new BadRequestException('standardSellingPrice cannot be negative');
    }
    try {
      await this.prisma.medications.update({
        where: { id },
        data: {
          ...(input.medicationName !== undefined
            ? { medication_name: input.medicationName.trim() }
            : {}),
          ...(input.genericName !== undefined
            ? { generic_name: input.genericName }
            : {}),
          ...(input.categoryId !== undefined
            ? { category_id: input.categoryId }
            : {}),
          ...(input.form !== undefined ? { form: input.form } : {}),
          ...(input.strength !== undefined ? { strength: input.strength } : {}),
          ...(input.unit !== undefined ? { unit: input.unit } : {}),
          ...(input.standardSellingPrice !== undefined
            ? { standard_selling_price: input.standardSellingPrice }
            : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.sideEffects !== undefined
            ? { side_effects: input.sideEffects }
            : {}),
          ...(input.contraindications !== undefined
            ? { contraindications: input.contraindications }
            : {}),
          ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
        },
      });
      await this.audit.recordMutation({
        userId: input.actorUserId,
        action: 'UPDATE',
        entityType: 'pharmacy.medications',
        entityId: id,
      });
      return this.getMedication(id);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('Medication name already exists');
      }
      throw err;
    }
  }

  public async softDeleteMedication(id: string, actorUserId?: string) {
    await this.getMedication(id);
    await this.prisma.medications.update({
      where: { id },
      data: { deleted_at: new Date(), is_active: false },
    });
    await this.audit.recordMutation({
      userId: actorUserId,
      action: 'DELETE',
      entityType: 'pharmacy.medications',
      entityId: id,
    });
    return { id, deleted: true };
  }

  // ── Batches ───────────────────────────────────────────────

  public async listBatches(filters?: {
    medicationId?: string;
    supplierId?: string;
    expiringBefore?: Date;
    expiredOnly?: boolean;
    withStock?: boolean;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const { page, limit, skip } = paginateParams(filters?.page, filters?.limit);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const q = filters?.search?.trim();
    const where = {
      ...(filters?.medicationId
        ? { medication_id: filters.medicationId }
        : {}),
      ...(filters?.supplierId ? { supplier_id: filters.supplierId } : {}),
      ...(filters?.withStock ? { quantity_on_hand: { gt: 0 } } : {}),
      ...(filters?.expiredOnly
        ? { expiry_date: { lt: today } }
        : filters?.expiringBefore
          ? { expiry_date: { lte: filters.expiringBefore } }
          : {}),
      ...(q
        ? {
            OR: [
              { batch_number: { contains: q, mode: 'insensitive' as const } },
              {
                medication: {
                  medication_name: { contains: q, mode: 'insensitive' as const },
                },
              },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.batches.findMany({
        where,
        include: {
          medication: true,
          supplier: true,
          rel_created_by: USER_PROFILE_INCLUDE,
        },
        orderBy: [{ expiry_date: 'asc' }, { batch_number: 'asc' }],
        skip,
        take: limit,
      }),
      this.prisma.batches.count({ where }),
    ]);
    return {
      items: rows.map((b) => this.mapBatch(b)),
      total,
      page,
      limit,
    };
  }

  public async getBatch(id: string) {
    const b = await this.prisma.batches.findFirst({
      where: { id },
      include: {
        medication: true,
        supplier: true,
        rel_created_by: USER_PROFILE_INCLUDE,
      },
    });
    if (!b) throw new NotFoundException('Batch not found');
    return this.mapBatch(b);
  }

  public async createBatch(input: {
    medicationId: string;
    batchNumber: string;
    quantityOnHand: number;
    unitCost?: number;
    sellingPrice?: number;
    manufacturingDate?: string;
    expiryDate: string;
    supplierId?: string;
    notes?: string;
    createdBy: string;
  }) {
    if (!input.batchNumber?.trim()) {
      throw new BadRequestException('batchNumber is required');
    }
    if (input.quantityOnHand < 0) {
      throw new BadRequestException('quantityOnHand cannot be negative');
    }
    if ((input.unitCost ?? 0) < 0 || (input.sellingPrice ?? 0) < 0) {
      throw new BadRequestException('Costs/prices cannot be negative');
    }
    await this.getMedication(input.medicationId);
    if (input.supplierId) await this.getSupplier(input.supplierId);

    return this.prisma
      .$transaction(async (tx) => {
        let batch;
        try {
          batch = await tx.batches.create({
            data: {
              medication_id: input.medicationId,
              batch_number: input.batchNumber.trim(),
              quantity_on_hand: input.quantityOnHand,
              unit_cost: input.unitCost ?? 0,
              selling_price: input.sellingPrice ?? 0,
              manufacturing_date: input.manufacturingDate
                ? new Date(input.manufacturingDate)
                : null,
              expiry_date: new Date(input.expiryDate),
              supplier_id: input.supplierId || null,
              notes: input.notes?.trim() || null,
              created_by: input.createdBy,
            },
          });
        } catch (err) {
          if (
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === 'P2002'
          ) {
            throw new ConflictException(
              'Batch number already exists for this medication',
            );
          }
          throw err;
        }

        if (input.quantityOnHand > 0) {
          await tx.stockMovements.create({
            data: {
              batch_id: batch.id,
              movement_type: 'RECEIVE',
              quantity_change: input.quantityOnHand,
              reference_type: null,
              notes: 'Initial batch stock',
              performed_by: input.createdBy,
            },
          });
        }
        return batch.id;
      })
      .then(async (id) => {
        await this.audit.recordMutation({
          userId: input.createdBy,
          action: 'CREATE',
          entityType: 'pharmacy.batches',
          entityId: id,
        });
        return this.getBatch(id);
      });
  }

  public async updateBatchMeta(
    id: string,
    input: {
      notes?: string | null;
      sellingPrice?: number;
      unitCost?: number;
      actorUserId?: string;
    },
  ) {
    await this.getBatch(id);
    if (
      (input.sellingPrice !== undefined && input.sellingPrice < 0) ||
      (input.unitCost !== undefined && input.unitCost < 0)
    ) {
      throw new BadRequestException('Costs/prices cannot be negative');
    }
    await this.prisma.batches.update({
      where: { id },
      data: {
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.sellingPrice !== undefined
          ? { selling_price: input.sellingPrice }
          : {}),
        ...(input.unitCost !== undefined ? { unit_cost: input.unitCost } : {}),
      },
    });
    await this.audit.recordMutation({
      userId: input.actorUserId,
      action: 'UPDATE',
      entityType: 'pharmacy.batches',
      entityId: id,
      newValues: { metaOnly: true },
    });
    return this.getBatch(id);
  }

  private mapBatch(b: {
    id: string;
    medication_id: string;
    batch_number: string;
    quantity_on_hand: Prisma.Decimal | number;
    unit_cost: Prisma.Decimal | number;
    selling_price: Prisma.Decimal | number;
    manufacturing_date: Date | null;
    expiry_date: Date;
    supplier_id: string | null;
    notes: string | null;
    created_by: string;
    medication?: { medication_name: string };
    supplier?: { company_name: string } | null;
    rel_created_by?: {
      core_profiles_user_id: { first_name: string; last_name: string }[];
    } | null;
  }) {
    return {
      id: b.id,
      medicationId: b.medication_id,
      medicationName: b.medication?.medication_name ?? null,
      batchNumber: b.batch_number,
      quantityOnHand: Number(b.quantity_on_hand),
      unitCost: Number(b.unit_cost),
      sellingPrice: Number(b.selling_price),
      manufacturingDate: b.manufacturing_date
        ? b.manufacturing_date.toISOString().slice(0, 10)
        : null,
      expiryDate: b.expiry_date.toISOString().slice(0, 10),
      supplierId: b.supplier_id,
      supplierName: b.supplier?.company_name ?? null,
      notes: b.notes,
      createdBy: b.created_by,
      createdByName: profileName(b.rel_created_by),
      expired: b.expiry_date.getTime() < Date.now(),
    };
  }

  // ── Stock mutations ───────────────────────────────────────

  public async listMovements(filters?: {
    batchId?: string;
    movementType?: string;
    take?: number;
  }) {
    const rows = await this.prisma.stockMovements.findMany({
      where: {
        ...(filters?.batchId ? { batch_id: filters.batchId } : {}),
        ...(filters?.movementType
          ? { movement_type: filters.movementType.toUpperCase() }
          : {}),
      },
      include: {
        batch: { include: { medication: true } },
        rel_performed_by: USER_PROFILE_INCLUDE,
      },
      orderBy: { created_at: 'desc' },
      take: Math.min(Math.max(filters?.take ?? 100, 1), 200),
    });
    return rows.map((m) => ({
      id: m.id,
      batchId: m.batch_id,
      batchNumber: m.batch.batch_number,
      medicationName: m.batch.medication.medication_name,
      movementType: m.movement_type,
      quantityChange: Number(m.quantity_change),
      referenceType: m.reference_type,
      referenceId: m.reference_id,
      notes: m.notes,
      performedBy: m.performed_by,
      performedByName: profileName(m.rel_performed_by),
      createdAt: m.created_at.toISOString(),
    }));
  }

  /** Delta adjustment (positive or negative). */
  public async adjustStock(input: {
    batchId: string;
    quantityChange: number;
    reason: string;
    performedBy: string;
  }) {
    if (!input.quantityChange || input.quantityChange === 0) {
      throw new BadRequestException('quantityChange must be non-zero');
    }
    if (!input.reason?.trim()) {
      throw new BadRequestException('reason is required');
    }
    return this.applyStockDelta({
      batchId: input.batchId,
      quantityChange: input.quantityChange,
      movementType: 'ADJUSTMENT',
      referenceType: 'ADJUSTMENT',
      notes: input.reason.trim(),
      performedBy: input.performedBy,
    });
  }

  public async damageStock(input: {
    batchId: string;
    quantity: number;
    reason: string;
    performedBy: string;
  }) {
    if (input.quantity <= 0) {
      throw new BadRequestException('quantity must be positive');
    }
    if (!input.reason?.trim()) {
      throw new BadRequestException('reason is required');
    }
    return this.applyStockDelta({
      batchId: input.batchId,
      quantityChange: -input.quantity,
      movementType: 'DAMAGE',
      referenceType: 'ADJUSTMENT',
      notes: input.reason.trim(),
      performedBy: input.performedBy,
    });
  }

  public async writeOffExpiry(input: {
    batchId: string;
    quantity?: number;
    performedBy: string;
    notes?: string;
  }) {
    const batch = await this.getBatch(input.batchId);
    if (!batch.expired) {
      throw new BadRequestException('Batch is not expired');
    }
    const qty = input.quantity ?? batch.quantityOnHand;
    if (qty <= 0) {
      throw new BadRequestException('No stock to write off');
    }
    return this.applyStockDelta({
      batchId: input.batchId,
      quantityChange: -qty,
      movementType: 'EXPIRY',
      referenceType: 'STOCK_TAKE',
      notes: input.notes?.trim() || 'Expired stock write-off',
      performedBy: input.performedBy,
    });
  }

  public async returnStock(input: {
    batchId: string;
    quantity: number;
    reason: string;
    performedBy: string;
    referenceId?: string;
  }) {
    if (input.quantity <= 0) {
      throw new BadRequestException('quantity must be positive');
    }
    if (!input.reason?.trim()) {
      throw new BadRequestException('reason is required');
    }
    return this.applyStockDelta({
      batchId: input.batchId,
      quantityChange: input.quantity,
      movementType: 'RETURN',
      referenceType: 'RETURN',
      referenceId: input.referenceId,
      notes: input.reason.trim(),
      performedBy: input.performedBy,
    });
  }

  private async applyStockDelta(input: {
    batchId: string;
    quantityChange: number;
    movementType: string;
    referenceType: string | null;
    referenceId?: string;
    notes: string;
    performedBy: string;
  }) {
    return this.prisma
      .$transaction(async (tx) => {
        const batch = await tx.batches.findFirst({
          where: { id: input.batchId },
        });
        if (!batch) throw new NotFoundException('Batch not found');

        if (input.quantityChange < 0) {
          const need = Math.abs(input.quantityChange);
          const updated = await tx.batches.updateMany({
            where: {
              id: input.batchId,
              quantity_on_hand: { gte: need },
            },
            data: { quantity_on_hand: { decrement: need } },
          });
          if (updated.count !== 1) {
            throw new BadRequestException('Insufficient stock on batch');
          }
        } else {
          await tx.batches.update({
            where: { id: input.batchId },
            data: { quantity_on_hand: { increment: input.quantityChange } },
          });
        }

        const movement = await tx.stockMovements.create({
          data: {
            batch_id: input.batchId,
            movement_type: input.movementType,
            quantity_change: input.quantityChange,
            reference_type: input.referenceType,
            reference_id: input.referenceId || null,
            notes: input.notes,
            performed_by: input.performedBy,
          },
        });
        return movement;
      })
      .then(async (movement) => {
        await this.audit.recordMutation({
          userId: input.performedBy,
          action: 'UPDATE',
          entityType: 'pharmacy.stock_movements',
          entityId: movement.id,
          newValues: {
            movementType: input.movementType,
            quantityChange: input.quantityChange,
            batchId: input.batchId,
          },
        });
        return {
          id: movement.id,
          batchId: movement.batch_id,
          movementType: movement.movement_type,
          quantityChange: Number(movement.quantity_change),
        };
      });
  }
}
