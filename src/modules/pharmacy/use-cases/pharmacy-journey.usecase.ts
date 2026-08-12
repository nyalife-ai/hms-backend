/**
 * Pharmacy clinical/procurement journeys — prescriptions + purchase orders.
 * Complements PharmacyOperationsUseCase catalog/stock.
 */

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import type { Prisma } from '../../../generated/prisma';
import { HmsAuditWriter } from '../../audit/hms-audit.writer';
import { profileName, USER_PROFILE_INCLUDE } from '../pharmacy-names';

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
export class PharmacyJourneyUseCase {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly audit: HmsAuditWriter,
  ) {}

  // ── Prescriptions ─────────────────────────────────────────

  public async listPrescriptions(filters?: {
    patientId?: string;
    status?: string;
    from?: Date;
    to?: Date;
    search?: string;
    page?: number;
    limit?: number;
    consultationId?: string;
    appointmentId?: string;
    visitId?: string;
  }) {
    const { page, limit, skip } = paginateParams(filters?.page, filters?.limit);
    const status = filters?.status?.toUpperCase();
    const q = filters?.search?.trim();

    const scopeOr: Prisma.PrescriptionsWhereInput[] = [];
    if (filters?.consultationId) {
      scopeOr.push({ consultation_id: filters.consultationId });
    }
    if (filters?.appointmentId) {
      scopeOr.push({
        consultation: { appointment_id: filters.appointmentId },
      });
    }
    if (filters?.visitId) {
      const visit = await this.prisma.outpatientVisits.findUnique({
        where: { id: filters.visitId },
        select: { payload: true, patient_id: true },
      });
      const payload = (visit?.payload ?? {}) as {
        appointmentId?: string;
        pharmacy?: { prescriptionId?: string };
      };
      if (payload.pharmacy?.prescriptionId) {
        scopeOr.push({ id: payload.pharmacy.prescriptionId });
      }
      if (payload.appointmentId) {
        scopeOr.push({
          consultation: { appointment_id: payload.appointmentId },
        });
      }
    }

    if (
      (filters?.consultationId || filters?.appointmentId || filters?.visitId) &&
      !scopeOr.length
    ) {
      scopeOr.push({ id: '00000000-0000-0000-0000-000000000000' });
    }

    const searchOr: Prisma.PrescriptionsWhereInput[] | undefined = q
      ? [
          {
            patient: {
              patient_number: { contains: q, mode: 'insensitive' as const },
            },
          },
          {
            patient: {
              user: {
                core_profiles_user_id: {
                  some: {
                    OR: [
                      {
                        first_name: {
                          contains: q,
                          mode: 'insensitive' as const,
                        },
                      },
                      {
                        last_name: {
                          contains: q,
                          mode: 'insensitive' as const,
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        ]
      : undefined;

    const where: Prisma.PrescriptionsWhereInput = {
      deleted_at: null,
      ...(filters?.patientId ? { patient_id: filters.patientId } : {}),
      ...(status ? { status } : {}),
      ...(filters?.from || filters?.to
        ? {
            prescription_date: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
      ...(scopeOr.length || searchOr
        ? {
            AND: [
              ...(scopeOr.length ? [{ OR: scopeOr }] : []),
              ...(searchOr ? [{ OR: searchOr }] : []),
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.prescriptions.findMany({
        where,
        include: {
          patient: {
            include: { user: { include: { core_profiles_user_id: true } } },
          },
          rel_prescribed_by: {
            include: { user: { include: { core_profiles_user_id: true } } },
          },
          pharmacy_prescription_lines_prescription_id: {
            include: {
              medication: true,
              rel_dispensed_by: USER_PROFILE_INCLUDE,
            },
          },
          rel_voided_by: USER_PROFILE_INCLUDE,
        },
        orderBy: { prescription_date: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.prescriptions.count({ where }),
    ]);
    return {
      items: rows.map((r) => this.mapPrescription(r)),
      total,
      page,
      limit,
    };
  }

  public async getPrescription(id: string) {
    const r = await this.prisma.prescriptions.findFirst({
      where: { id, deleted_at: null },
      include: {
        patient: {
          include: { user: { include: { core_profiles_user_id: true } } },
        },
        rel_prescribed_by: {
          include: { user: { include: { core_profiles_user_id: true } } },
        },
        pharmacy_prescription_lines_prescription_id: {
          include: {
            medication: true,
            rel_dispensed_by: USER_PROFILE_INCLUDE,
          },
          orderBy: { created_at: 'asc' },
        },
        rel_voided_by: USER_PROFILE_INCLUDE,
      },
    });
    if (!r) throw new NotFoundException('Prescription not found');
    return this.mapPrescription(r);
  }

  public async createPrescription(input: {
    patientId: string;
    prescribedByStaffId: string;
    consultationId?: string;
    notes?: string;
    lines: Array<{
      medicationId: string;
      dosage: string;
      frequency: string;
      duration: string;
      quantity: number;
      instructions?: string;
    }>;
    actorUserId?: string;
  }) {
    if (!input.lines?.length) {
      throw new BadRequestException('At least one prescription line is required');
    }
    for (const line of input.lines) {
      if (!line.dosage?.trim() || !line.frequency?.trim() || !line.duration?.trim()) {
        throw new BadRequestException(
          'Each line requires dosage, frequency, and duration',
        );
      }
      if (!line.quantity || line.quantity <= 0) {
        throw new BadRequestException('Line quantity must be > 0');
      }
    }

    const patient = await this.prisma.patients.findFirst({
      where: { id: input.patientId, deleted_at: null },
    });
    if (!patient) throw new NotFoundException('Patient not found');

    const doctor = await this.prisma.staffProfiles.findFirst({
      where: { id: input.prescribedByStaffId, deleted_at: null },
    });
    if (!doctor) throw new NotFoundException('Prescribing staff not found');

    const medIds = [...new Set(input.lines.map((l) => l.medicationId))];
    const meds = await this.prisma.medications.findMany({
      where: { id: { in: medIds }, deleted_at: null, is_active: true },
    });
    if (meds.length !== medIds.length) {
      throw new BadRequestException('One or more medications are invalid');
    }

    const prescriptionNumber = `RX-${Date.now().toString(36).toUpperCase()}`;

    const created = await this.prisma.$transaction(async (tx) => {
      const rx = await tx.prescriptions.create({
        data: {
          patient_id: input.patientId,
          consultation_id: input.consultationId || null,
          prescription_number: prescriptionNumber,
          prescribed_by: input.prescribedByStaffId,
          status: 'PENDING',
          notes: input.notes?.trim() || null,
        },
      });
      await tx.prescriptionLines.createMany({
        data: input.lines.map((l) => ({
          prescription_id: rx.id,
          medication_id: l.medicationId,
          dosage: l.dosage.trim(),
          frequency: l.frequency.trim(),
          duration: l.duration.trim(),
          quantity: l.quantity,
          instructions: l.instructions?.trim() || null,
          status: 'PENDING',
        })),
      });
      return rx.id;
    });

    await this.audit.recordMutation({
      userId: input.actorUserId,
      action: 'CREATE',
      entityType: 'pharmacy.prescriptions',
      entityId: created,
    });
    return this.getPrescription(created);
  }

  public async cancelPrescription(
    id: string,
    actorUserId: string,
    reason?: string,
  ) {
    const rx = await this.prisma.prescriptions.findFirst({
      where: { id, deleted_at: null },
    });
    if (!rx) throw new NotFoundException('Prescription not found');
    if (rx.is_voided) {
      throw new BadRequestException('Prescription is voided');
    }
    if (rx.status === 'DISPENSED' || rx.status === 'CANCELLED') {
      throw new BadRequestException(
        `Cannot cancel prescription in status ${rx.status}`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.prescriptions.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          notes: reason
            ? `${rx.notes || ''} · Cancelled: ${reason}`.trim()
            : rx.notes,
        },
      });
      await tx.prescriptionLines.updateMany({
        where: { prescription_id: id, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
    });

    await this.audit.recordMutation({
      userId: actorUserId,
      action: 'UPDATE',
      entityType: 'pharmacy.prescriptions',
      entityId: id,
      newValues: { status: 'CANCELLED' },
    });
    return this.getPrescription(id);
  }

  public async voidPrescription(input: {
    prescriptionId: string;
    voidReason: string;
    voidedBy: string;
  }) {
    if (!input.voidReason?.trim()) {
      throw new BadRequestException('voidReason is required');
    }
    const rx = await this.prisma.prescriptions.findFirst({
      where: { id: input.prescriptionId, deleted_at: null },
    });
    if (!rx) throw new NotFoundException('Prescription not found');
    if (rx.is_voided) {
      throw new BadRequestException('Prescription already voided');
    }

    await this.prisma.prescriptions.update({
      where: { id: input.prescriptionId },
      data: {
        is_voided: true,
        void_reason: input.voidReason.trim(),
        voided_by: input.voidedBy,
        voided_at: new Date(),
        status: 'CANCELLED',
      },
    });

    await this.audit.recordMutation({
      userId: input.voidedBy,
      action: 'UPDATE',
      entityType: 'pharmacy.prescriptions',
      entityId: input.prescriptionId,
      newValues: { event: 'VOID' },
    });
    return this.getPrescription(input.prescriptionId);
  }

  /**
   * FEFO dispense against prescription lines.
   * Skips expired batches. Transactional + conditional decrements.
   */
  public async dispensePrescription(input: {
    prescriptionId: string;
    performedBy: string;
    lineIds?: string[];
  }) {
    return this.prisma
      .$transaction(async (tx) => {
        const rx = await tx.prescriptions.findFirst({
          where: { id: input.prescriptionId, deleted_at: null },
          include: {
            pharmacy_prescription_lines_prescription_id: {
              include: { medication: true },
            },
          },
        });
        if (!rx) throw new NotFoundException('Prescription not found');
        if (rx.is_voided) {
          throw new BadRequestException('Cannot dispense a voided prescription');
        }
        if (rx.status === 'CANCELLED' || rx.status === 'DISPENSED') {
          throw new BadRequestException(
            `Cannot dispense prescription in status ${rx.status}`,
          );
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const lines = rx.pharmacy_prescription_lines_prescription_id.filter(
          (l) =>
            l.status === 'PENDING' &&
            (!input.lineIds?.length || input.lineIds.includes(l.id)),
        );
        if (!lines.length) {
          throw new BadRequestException('No pending lines to dispense');
        }

        const warnings: string[] = [];
        let dispensedLines = 0;

        for (const line of lines) {
          let remaining = line.quantity;
          const batches = await tx.batches.findMany({
            where: {
              medication_id: line.medication_id,
              quantity_on_hand: { gt: 0 },
              expiry_date: { gte: today },
            },
            orderBy: { expiry_date: 'asc' },
          });

          for (const batch of batches) {
            if (remaining <= 0) break;
            const onHand = Number(batch.quantity_on_hand);
            const take = Math.min(onHand, remaining);
            if (take <= 0) continue;

            const updated = await tx.batches.updateMany({
              where: {
                id: batch.id,
                quantity_on_hand: { gte: take },
              },
              data: { quantity_on_hand: { decrement: take } },
            });
            if (updated.count !== 1) {
              throw new BadRequestException(
                `Concurrent stock change for ${line.medication.medication_name} — retry`,
              );
            }

            await tx.stockMovements.create({
              data: {
                batch_id: batch.id,
                movement_type: 'DISPENSE',
                quantity_change: -take,
                reference_type: 'PRESCRIPTION',
                reference_id: rx.id,
                notes: `Rx ${rx.prescription_number} · ${line.medication.medication_name}`,
                performed_by: input.performedBy,
              },
            });
            remaining -= take;
          }

          if (remaining > 0) {
            warnings.push(
              `Insufficient stock for ${line.medication.medication_name} (short ${remaining})`,
            );
            // Do not partially mark line dispensed if we couldn't fulfill — rollback whole txn
            throw new BadRequestException(
              warnings.join('; ') || 'Insufficient stock',
            );
          }

          await tx.prescriptionLines.update({
            where: { id: line.id },
            data: {
              status: 'DISPENSED',
              dispensed_by: input.performedBy,
              dispensed_at: new Date(),
            },
          });
          dispensedLines += 1;
        }

        const remainingPending = await tx.prescriptionLines.count({
          where: {
            prescription_id: rx.id,
            status: 'PENDING',
          },
        });
        const nextStatus =
          remainingPending === 0 ? 'DISPENSED' : 'PARTIALLY_DISPENSED';

        await tx.prescriptions.update({
          where: { id: rx.id },
          data: { status: nextStatus },
        });

        return { prescriptionId: rx.id, dispensedLines, status: nextStatus };
      })
      .then(async (result) => {
        await this.audit.recordMutation({
          userId: input.performedBy,
          action: 'UPDATE',
          entityType: 'pharmacy.prescriptions',
          entityId: input.prescriptionId,
          newValues: { event: 'DISPENSE', ...result },
        });
        return this.getPrescription(input.prescriptionId);
      });
  }

  private mapPrescription(r: {
    id: string;
    patient_id: string;
    consultation_id: string | null;
    prescription_number: string | null;
    prescribed_by: string;
    prescription_date: Date;
    status: string;
    notes: string | null;
    is_voided: boolean;
    void_reason: string | null;
    voided_by: string | null;
    voided_at: Date | null;
    patient: {
      patient_number: string;
      user: { core_profiles_user_id: { first_name: string; last_name: string }[] };
    };
    rel_prescribed_by: {
      user: { core_profiles_user_id: { first_name: string; last_name: string }[] };
    };
    rel_voided_by?: {
      core_profiles_user_id: { first_name: string; last_name: string }[];
    } | null;
    pharmacy_prescription_lines_prescription_id: Array<{
      id: string;
      medication_id: string;
      dosage: string;
      frequency: string;
      duration: string;
      quantity: number;
      instructions: string | null;
      status: string;
      dispensed_by: string | null;
      dispensed_at: Date | null;
      medication: { medication_name: string };
      rel_dispensed_by?: {
        core_profiles_user_id: { first_name: string; last_name: string }[];
      } | null;
    }>;
  }) {
    const pp = r.patient.user.core_profiles_user_id[0];
    const dp = r.rel_prescribed_by.user.core_profiles_user_id[0];
    return {
      id: r.id,
      patientId: r.patient_id,
      patientName: pp
        ? `${pp.first_name} ${pp.last_name}`
        : r.patient.patient_number,
      mrn: r.patient.patient_number,
      consultationId: r.consultation_id,
      prescriptionNumber: r.prescription_number,
      prescribedByStaffId: r.prescribed_by,
      prescribedBy: dp ? `Dr. ${dp.first_name} ${dp.last_name}` : '—',
      prescriptionDate: r.prescription_date.toISOString(),
      status: r.status,
      notes: r.notes,
      isVoided: r.is_voided,
      voidReason: r.void_reason,
      voidedBy: r.voided_by,
      voidedByName: profileName(r.rel_voided_by),
      voidedAt: r.voided_at?.toISOString() ?? null,
      lines: r.pharmacy_prescription_lines_prescription_id.map((l) => ({
        id: l.id,
        medicationId: l.medication_id,
        medicationName: l.medication.medication_name,
        dosage: l.dosage,
        frequency: l.frequency,
        duration: l.duration,
        quantity: l.quantity,
        instructions: l.instructions,
        status: l.status,
        dispensedBy: l.dispensed_by,
        dispensedByName: profileName(l.rel_dispensed_by),
        dispensedAt: l.dispensed_at?.toISOString() ?? null,
      })),
    };
  }

  // ── Purchase orders ───────────────────────────────────────

  public async listPurchaseOrders(filters?: {
    supplierId?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const { page, limit, skip } = paginateParams(filters?.page, filters?.limit);
    const status = filters?.status?.toUpperCase();
    const q = filters?.search?.trim();
    const where = {
      ...(filters?.supplierId ? { supplier_id: filters.supplierId } : {}),
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { order_number: { contains: q, mode: 'insensitive' as const } },
              {
                supplier: {
                  company_name: { contains: q, mode: 'insensitive' as const },
                },
              },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.purchaseOrders.findMany({
        where,
        include: {
          supplier: true,
          rel_created_by: USER_PROFILE_INCLUDE,
          pharmacy_purchase_order_lines_purchase_order_id: {
            include: { medication: true },
          },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.purchaseOrders.count({ where }),
    ]);
    return {
      items: rows.map((r) => this.mapPo(r)),
      total,
      page,
      limit,
    };
  }

  public async getPurchaseOrder(id: string) {
    const r = await this.prisma.purchaseOrders.findFirst({
      where: { id },
      include: {
        supplier: true,
        rel_created_by: USER_PROFILE_INCLUDE,
        pharmacy_purchase_order_lines_purchase_order_id: {
          include: { medication: true },
        },
      },
    });
    if (!r) throw new NotFoundException('Purchase order not found');
    return this.mapPo(r);
  }

  public async createPurchaseOrder(input: {
    supplierId: string;
    expectedDeliveryDate?: string;
    notes?: string;
    createdBy: string;
    lines: Array<{
      medicationId: string;
      quantityOrdered: number;
      unitCost: number;
    }>;
  }) {
    if (!input.lines?.length) {
      throw new BadRequestException('At least one PO line is required');
    }
    for (const l of input.lines) {
      if (l.quantityOrdered <= 0) {
        throw new BadRequestException('quantityOrdered must be > 0');
      }
      if (l.unitCost < 0) {
        throw new BadRequestException('unitCost cannot be negative');
      }
    }
    const supplier = await this.prisma.suppliers.findFirst({
      where: { id: input.supplierId, is_active: true },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');

    const orderNumber = `PO-${Date.now().toString(36).toUpperCase()}`;
    const id = await this.prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrders.create({
        data: {
          order_number: orderNumber,
          supplier_id: input.supplierId,
          order_date: new Date(),
          expected_delivery_date: input.expectedDeliveryDate
            ? new Date(input.expectedDeliveryDate)
            : null,
          status: 'DRAFT',
          notes: input.notes?.trim() || null,
          created_by: input.createdBy,
        },
      });
      await tx.purchaseOrderLines.createMany({
        data: input.lines.map((l) => ({
          purchase_order_id: po.id,
          medication_id: l.medicationId,
          quantity_ordered: l.quantityOrdered,
          unit_cost: l.unitCost,
          received_quantity: 0,
        })),
      });
      return po.id;
    });

    await this.audit.recordMutation({
      userId: input.createdBy,
      action: 'CREATE',
      entityType: 'pharmacy.purchase_orders',
      entityId: id,
    });
    return this.getPurchaseOrder(id);
  }

  public async sendPurchaseOrder(id: string, actorUserId: string) {
    const po = await this.prisma.purchaseOrders.findFirst({ where: { id } });
    if (!po) throw new NotFoundException('Purchase order not found');
    if (po.status !== 'DRAFT') {
      throw new BadRequestException('Only DRAFT purchase orders can be sent');
    }
    await this.prisma.purchaseOrders.update({
      where: { id },
      data: { status: 'SENT' },
    });
    await this.audit.recordMutation({
      userId: actorUserId,
      action: 'UPDATE',
      entityType: 'pharmacy.purchase_orders',
      entityId: id,
      newValues: { status: 'SENT' },
    });
    return this.getPurchaseOrder(id);
  }

  public async cancelPurchaseOrder(id: string, actorUserId: string) {
    const po = await this.prisma.purchaseOrders.findFirst({ where: { id } });
    if (!po) throw new NotFoundException('Purchase order not found');
    if (po.status === 'RECEIVED' || po.status === 'CANCELLED') {
      throw new BadRequestException(
        `Cannot cancel purchase order in status ${po.status}`,
      );
    }
    await this.prisma.purchaseOrders.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
    await this.audit.recordMutation({
      userId: actorUserId,
      action: 'UPDATE',
      entityType: 'pharmacy.purchase_orders',
      entityId: id,
      newValues: { status: 'CANCELLED' },
    });
    return this.getPurchaseOrder(id);
  }

  /**
   * Receive PO lines into batches + RECEIVE movements. Transactional.
   */
  public async receivePurchaseOrder(input: {
    purchaseOrderId: string;
    performedBy: string;
    receipts: Array<{
      lineId: string;
      quantity: number;
      batchNumber: string;
      expiryDate: string;
      manufacturingDate?: string;
    }>;
  }) {
    if (!input.receipts?.length) {
      throw new BadRequestException('receipts required');
    }

    return this.prisma
      .$transaction(async (tx) => {
        const po = await tx.purchaseOrders.findFirst({
          where: { id: input.purchaseOrderId },
          include: {
            pharmacy_purchase_order_lines_purchase_order_id: true,
          },
        });
        if (!po) throw new NotFoundException('Purchase order not found');
        if (po.status !== 'SENT' && po.status !== 'DRAFT') {
          throw new BadRequestException(
            `Cannot receive purchase order in status ${po.status}`,
          );
        }

        for (const receipt of input.receipts) {
          if (receipt.quantity <= 0) {
            throw new BadRequestException('Receive quantity must be > 0');
          }
          const line = po.pharmacy_purchase_order_lines_purchase_order_id.find(
            (l) => l.id === receipt.lineId,
          );
          if (!line) {
            throw new BadRequestException(`Unknown PO line ${receipt.lineId}`);
          }
          const already = Number(line.received_quantity || 0);
          const ordered = Number(line.quantity_ordered);
          if (already + receipt.quantity > ordered) {
            throw new BadRequestException(
              `Received quantity exceeds ordered for line ${receipt.lineId}`,
            );
          }

          let batch = await tx.batches.findFirst({
            where: {
              medication_id: line.medication_id,
              batch_number: receipt.batchNumber.trim(),
            },
          });
          if (batch) {
            await tx.batches.update({
              where: { id: batch.id },
              data: {
                quantity_on_hand: { increment: receipt.quantity },
                unit_cost: line.unit_cost,
              },
            });
          } else {
            batch = await tx.batches.create({
              data: {
                medication_id: line.medication_id,
                batch_number: receipt.batchNumber.trim(),
                quantity_on_hand: receipt.quantity,
                unit_cost: line.unit_cost,
                selling_price: line.unit_cost,
                manufacturing_date: receipt.manufacturingDate
                  ? new Date(receipt.manufacturingDate)
                  : null,
                expiry_date: new Date(receipt.expiryDate),
                supplier_id: po.supplier_id,
                notes: `Received from PO ${po.order_number}`,
                created_by: input.performedBy,
              },
            });
          }

          await tx.stockMovements.create({
            data: {
              batch_id: batch.id,
              movement_type: 'RECEIVE',
              quantity_change: receipt.quantity,
              reference_type: 'PURCHASE_ORDER',
              reference_id: po.id,
              notes: `PO ${po.order_number}`,
              performed_by: input.performedBy,
            },
          });

          await tx.purchaseOrderLines.update({
            where: { id: line.id },
            data: {
              received_quantity: already + receipt.quantity,
              received_at: new Date(),
            },
          });
        }

        const refreshed = await tx.purchaseOrderLines.findMany({
          where: { purchase_order_id: po.id },
        });
        const complete = refreshed.every(
          (l) => Number(l.received_quantity || 0) >= Number(l.quantity_ordered),
        );
        await tx.purchaseOrders.update({
          where: { id: po.id },
          data: {
            status: complete
              ? 'RECEIVED'
              : po.status === 'DRAFT'
                ? 'SENT'
                : po.status,
          },
        });

        return po.id;
      })
      .then(async (id) => {
        await this.audit.recordMutation({
          userId: input.performedBy,
          action: 'UPDATE',
          entityType: 'pharmacy.purchase_orders',
          entityId: id,
          newValues: { event: 'RECEIVE' },
        });
        return this.getPurchaseOrder(id);
      });
  }

  private mapPo(r: {
    id: string;
    order_number: string;
    supplier_id: string;
    order_date: Date;
    expected_delivery_date: Date | null;
    status: string;
    notes: string | null;
    created_by: string;
    supplier: { company_name: string };
    rel_created_by?: {
      core_profiles_user_id: { first_name: string; last_name: string }[];
    } | null;
    pharmacy_purchase_order_lines_purchase_order_id: Array<{
      id: string;
      medication_id: string;
      quantity_ordered: { toString(): string } | number;
      unit_cost: { toString(): string } | number;
      received_quantity: { toString(): string } | number | null;
      received_at: Date | null;
      medication: { medication_name: string };
    }>;
  }) {
    return {
      id: r.id,
      orderNumber: r.order_number,
      supplierId: r.supplier_id,
      supplierName: r.supplier.company_name,
      orderDate: r.order_date.toISOString().slice(0, 10),
      expectedDeliveryDate: r.expected_delivery_date
        ? r.expected_delivery_date.toISOString().slice(0, 10)
        : null,
      status: r.status,
      notes: r.notes,
      createdBy: r.created_by,
      createdByName: profileName(r.rel_created_by),
      lines: r.pharmacy_purchase_order_lines_purchase_order_id.map((l) => ({
        id: l.id,
        medicationId: l.medication_id,
        medicationName: l.medication.medication_name,
        quantityOrdered: Number(l.quantity_ordered),
        unitCost: Number(l.unit_cost),
        receivedQuantity: Number(l.received_quantity || 0),
        receivedAt: l.received_at?.toISOString() ?? null,
      })),
    };
  }
}
