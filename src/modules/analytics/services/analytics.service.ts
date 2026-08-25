/**
 * Live analytics aggregations via Prisma (no mock data).
 */

import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma';
import { PrismaService } from '../../../database/prisma/prisma.service';
import {
  AnalyticsQueryDto,
  type AnalyticsDomain,
} from '../dto/analytics-query.dto';
import { def } from '../metrics/metric-definitions';
import {
  type AnalyticsPayload,
  breakdown,
  dec,
  kpi,
  series,
  table,
} from '../analytics.types';
import {
  alignSeriesByIndex,
  bucketKey,
  changePercent,
  enumerateBuckets,
  resolvePeriod,
  startOfDay,
  toYmd,
  type ResolvedPeriod,
} from './period.util';

type Range = { gte: Date; lte: Date };

@Injectable()
export class AnalyticsService {
  public constructor(private readonly prisma: PrismaService) {}

  public async getDomain(
    domain: AnalyticsDomain,
    query: AnalyticsQueryDto,
  ): Promise<AnalyticsPayload> {
    const period = resolvePeriod(query);
    switch (domain) {
      case 'overview':
        return this.overview(period, query);
      case 'financial':
      case 'billing':
        return this.financial(period, query, domain);
      case 'appointments':
        return this.appointments(period, query);
      case 'patients':
        return this.patients(period, query);
      case 'laboratory':
        return this.laboratory(period, query);
      case 'pharmacy':
        return this.pharmacy(period, query);
      case 'ipd':
        return this.ipd(period, query);
      case 'radiology':
        return this.radiology(period, query);
      case 'insurance':
        return this.insurance(period, query);
      case 'staff':
        return this.staff(period, query);
      case 'void-audit':
        return this.voidAudit(period, query);
      case 'follow-ups':
        return this.followUps(period, query);
      default:
        return this.empty(domain, period);
    }
  }

  private meta(domain: string, period: ResolvedPeriod) {
    return {
      from: toYmd(period.from),
      to: toYmd(period.to),
      compareFrom: period.compareFrom ? toYmd(period.compareFrom) : null,
      compareTo: period.compareTo ? toYmd(period.compareTo) : null,
      granularity: period.granularity,
      preset: period.preset,
      compare: period.compare,
      generatedAt: new Date().toISOString(),
      currency: 'KES' as const,
      domain,
    };
  }

  private empty(domain: string, period: ResolvedPeriod): AnalyticsPayload {
    return {
      meta: this.meta(domain, period),
      kpis: [],
      series: [],
      breakdowns: [],
      tables: [],
    };
  }

  private range(from: Date, to: Date): Range {
    return { gte: from, lte: to };
  }

  /** Align previous-period bucket values onto current points by equal-length index. */
  private withPreviousByIndex(
    current: Array<{ period: string; value: number }>,
    previous: Array<{ period: string; value: number }> | null,
  ): Array<{ period: string; value: number; previousValue: number | null }> {
    return alignSeriesByIndex(current, previous);
  }

  private bucketValues(
    from: Date,
    to: Date,
    granularity: ResolvedPeriod['granularity'],
    events: Array<{ at: Date; amount?: number }>,
  ): Array<{ period: string; value: number }> {
    const buckets = enumerateBuckets(from, to, granularity);
    const map = new Map(buckets.map((b) => [b, 0]));
    for (const e of events) {
      const k = bucketKey(new Date(e.at), granularity);
      if (map.has(k)) {
        map.set(k, (map.get(k) ?? 0) + (e.amount ?? 1));
      }
    }
    return buckets.map((periodKey) => ({
      period: periodKey,
      value: map.get(periodKey) ?? 0,
    }));
  }

  private async seriesPointsWithCompare(
    period: ResolvedPeriod,
    loadEvents: (
      from: Date,
      to: Date,
    ) => Promise<Array<{ at: Date; amount?: number }>>,
    round?: (n: number) => number,
  ): Promise<
    Array<{ period: string; value: number; previousValue: number | null }>
  > {
    const applyRound = (pts: Array<{ period: string; value: number }>) =>
      round
        ? pts.map((p) => ({ ...p, value: round(p.value) }))
        : pts;

    const current = applyRound(
      this.bucketValues(
        period.from,
        period.to,
        period.granularity,
        await loadEvents(period.from, period.to),
      ),
    );

    if (!period.compareFrom || !period.compareTo) {
      return this.withPreviousByIndex(current, null);
    }

    const previous = applyRound(
      this.bucketValues(
        period.compareFrom,
        period.compareTo,
        period.granularity,
        await loadEvents(period.compareFrom, period.compareTo),
      ),
    );

    return this.withPreviousByIndex(current, previous);
  }

  private async countInRange(
    model: {
      count: (args: { where: Record<string, unknown> }) => Promise<number>;
    },
    where: Record<string, unknown>,
    period: ResolvedPeriod,
  ): Promise<{ current: number; previous: number | null }> {
    const current = await model.count({ where });
    if (!period.compareFrom || !period.compareTo) {
      return { current, previous: null };
    }
    return { current, previous: null };
  }

  private kpiPair(
    key: Parameters<typeof def>[0],
    label: string,
    current: number,
    previous: number | null,
    unit: 'count' | 'currency' | 'percent' | 'hours' | 'days',
  ) {
    return kpi({
      key,
      label,
      value: current,
      previousValue: previous,
      changePercent: changePercent(current, previous),
      unit,
      definition: def(key),
    });
  }

  // ── Overview ──────────────────────────────────────────────
  private async overview(
    period: ResolvedPeriod,
    query: AnalyticsQueryDto,
  ): Promise<AnalyticsPayload> {
    const cur = this.range(period.from, period.to);
    const prev =
      period.compareFrom && period.compareTo
        ? this.range(period.compareFrom, period.compareTo)
        : null;

    const [
      patientsCur,
      patientsPrev,
      apptCur,
      apptPrev,
      apptCompletedCur,
      apptCancelledCur,
      admissionsCur,
      dischargesCur,
      currentInpatients,
      beds,
      labCur,
      labDoneCur,
      radCur,
      rxLinesCur,
      billedCur,
      billedPrev,
      collectedCur,
      collectedPrev,
      claimsCur,
      followOverdue,
    ] = await Promise.all([
      this.prisma.patients.count({
        where: { deleted_at: null, created_at: cur },
      }),
      prev
        ? this.prisma.patients.count({
            where: { deleted_at: null, created_at: prev },
          })
        : Promise.resolve(null),
      this.prisma.appointments.count({
        where: {
          deleted_at: null,
          appointment_date: cur,
          ...(query.doctorId ? { doctor_id: query.doctorId } : {}),
        },
      }),
      prev
        ? this.prisma.appointments.count({
            where: {
              deleted_at: null,
              appointment_date: prev,
              ...(query.doctorId ? { doctor_id: query.doctorId } : {}),
            },
          })
        : Promise.resolve(null),
      this.prisma.appointments.count({
        where: {
          deleted_at: null,
          appointment_date: cur,
          status: 'COMPLETED',
        },
      }),
      this.prisma.appointments.count({
        where: {
          deleted_at: null,
          appointment_date: cur,
          status: 'CANCELLED',
        },
      }),
      this.prisma.admissions.count({ where: { admission_date: cur } }),
      this.prisma.admissions.count({
        where: { discharge_date: cur },
      }),
      this.prisma.admissions.count({ where: { status: 'ADMITTED' } }),
      this.prisma.beds.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.laboratoryRequests.count({ where: { request_date: cur } }),
      this.prisma.laboratoryRequests.count({
        where: {
          request_date: cur,
          status: { in: ['COMPLETED', 'RELEASED', 'RESULTS_READY'] },
        },
      }),
      this.prisma.radiologyRequests.count({ where: { created_at: cur } }),
      this.prisma.prescriptionLines.count({
        where: { dispensed_at: cur },
      }),
      this.sumInvoices(cur),
      prev ? this.sumInvoices(prev) : Promise.resolve(null),
      this.sumPayments(cur, query.paymentMethodId),
      prev
        ? this.sumPayments(prev, query.paymentMethodId)
        : Promise.resolve(null),
      this.prisma.insuranceClaims.count({
        where: { submission_date: cur },
      }),
      this.prisma.followUps.count({
        where: {
          status: 'SCHEDULED',
          follow_up_date: { lt: startOfDay(new Date()) },
        },
      }),
    ]);

    const totalBeds = beds.reduce((s, b) => s + b._count._all, 0);
    const occupied =
      beds.find((b) => b.status === 'OCCUPIED')?._count._all ?? 0;
    const occupancy =
      totalBeds > 0 ? Math.round((occupied / totalBeds) * 1000) / 10 : 0;

    const patientSeries = await this.timeSeriesCounts(
      period,
      async (r) =>
        this.prisma.patients.count({
          where: { deleted_at: null, created_at: r },
        }),
      (d) => d.created_at,
      'patients',
    );

    const revenueSeries = await this.invoiceSeries(period);
    const apptByStatus = await this.prisma.appointments.groupBy({
      by: ['status'],
      where: { deleted_at: null, appointment_date: cur },
      _count: { _all: true },
    });

    return {
      meta: this.meta('overview', period),
      kpis: [
        this.kpiPair(
          'patients.registered',
          'New patients',
          patientsCur,
          patientsPrev,
          'count',
        ),
        this.kpiPair(
          'appointments.total',
          'Appointments',
          apptCur,
          apptPrev,
          'count',
        ),
        this.kpiPair(
          'appointments.completed',
          'Completed appointments',
          apptCompletedCur,
          null,
          'count',
        ),
        this.kpiPair(
          'appointments.cancelled',
          'Cancelled appointments',
          apptCancelledCur,
          null,
          'count',
        ),
        this.kpiPair(
          'ipd.admissions',
          'Admissions',
          admissionsCur,
          null,
          'count',
        ),
        this.kpiPair(
          'ipd.discharges',
          'Discharges',
          dischargesCur,
          null,
          'count',
        ),
        this.kpiPair(
          'ipd.current_inpatients',
          'Current inpatients',
          currentInpatients,
          null,
          'count',
        ),
        this.kpiPair(
          'ipd.occupancy_pct',
          'Bed occupancy',
          occupancy,
          null,
          'percent',
        ),
        this.kpiPair('lab.requests', 'Lab requests', labCur, null, 'count'),
        this.kpiPair(
          'lab.completed',
          'Lab completed',
          labDoneCur,
          null,
          'count',
        ),
        this.kpiPair(
          'radiology.requests',
          'Radiology requests',
          radCur,
          null,
          'count',
        ),
        this.kpiPair(
          'pharmacy.dispensed_lines',
          'Dispensed lines',
          rxLinesCur,
          null,
          'count',
        ),
        this.kpiPair(
          'revenue.billed',
          'Billed',
          billedCur,
          billedPrev,
          'currency',
        ),
        this.kpiPair(
          'revenue.collected',
          'Collected',
          collectedCur,
          collectedPrev,
          'currency',
        ),
        this.kpiPair(
          'claims.submitted',
          'Claims submitted',
          claimsCur,
          null,
          'count',
        ),
        this.kpiPair(
          'followups.overdue',
          'Overdue follow-ups',
          followOverdue,
          null,
          'count',
        ),
      ],
      series: [
        series({
          key: 'patients.registrations',
          label: 'Patient registrations',
          points: patientSeries,
        }),
        series({
          key: 'revenue.billed',
          label: 'Billed revenue',
          points: revenueSeries,
        }),
      ],
      breakdowns: [
        breakdown({
          key: 'appointments.by_status',
          label: 'Appointments by status',
          rows: apptByStatus.map((r) => ({
            name: r.status,
            value: r._count._all,
          })),
        }),
        breakdown({
          key: 'beds.by_status',
          label: 'Beds by status',
          rows: beds.map((b) => ({
            name: b.status,
            value: b._count._all,
          })),
        }),
      ],
      tables: [
        table({
          key: 'overview.snapshot',
          label: 'Operational snapshot',
          columns: ['Metric', 'Value'],
          rows: [
            { Metric: 'New patients', Value: patientsCur },
            { Metric: 'Appointments', Value: apptCur },
            { Metric: 'Current inpatients', Value: currentInpatients },
            { Metric: 'Bed occupancy %', Value: occupancy },
            { Metric: 'Billed (KES)', Value: billedCur },
            { Metric: 'Collected (KES)', Value: collectedCur },
          ],
        }),
      ],
    };
  }

  private async sumInvoices(range: Range): Promise<number> {
    const agg = await this.prisma.invoices.aggregate({
      where: {
        deleted_at: null,
        is_voided: false,
        invoice_date: range,
        status: { not: 'DRAFT' },
      },
      _sum: { total_amount: true },
    });
    return dec(agg._sum.total_amount);
  }

  private async sumPayments(
    range: Range,
    paymentMethodId?: string,
  ): Promise<number> {
    const agg = await this.prisma.payments.aggregate({
      where: {
        status: 'COMPLETED',
        payment_date: range,
        ...(paymentMethodId ? { payment_method_id: paymentMethodId } : {}),
      },
      _sum: { amount: true },
    });
    return dec(agg._sum.amount);
  }

  private async sumAllocations(range: Range): Promise<number> {
    const agg = await this.prisma.paymentAllocations.aggregate({
      where: { allocated_at: range },
      _sum: { allocated_amount: true },
    });
    return dec(agg._sum.allocated_amount);
  }

  private async outstandingInPeriod(range: Range): Promise<number> {
    const invoices = await this.prisma.invoices.findMany({
      where: {
        deleted_at: null,
        is_voided: false,
        invoice_date: range,
        status: { notIn: ['DRAFT', 'CANCELLED', 'PAID'] },
      },
      select: {
        total_amount: true,
        billing_payment_allocations_invoice_id: {
          select: { allocated_amount: true },
        },
        billing_credit_notes_invoice_id: {
          select: { amount: true },
        },
      },
    });
    let sum = 0;
    for (const inv of invoices) {
      const allocated = inv.billing_payment_allocations_invoice_id.reduce(
        (s, a) => s + dec(a.allocated_amount),
        0,
      );
      const credits = inv.billing_credit_notes_invoice_id.reduce(
        (s, c) => s + dec(c.amount),
        0,
      );
      const rem = dec(inv.total_amount) - allocated - credits;
      if (rem > 0) sum += rem;
    }
    return Math.round(sum * 100) / 100;
  }

  private async invoiceSeries(period: ResolvedPeriod) {
    return this.seriesPointsWithCompare(
      period,
      async (from, to) => {
        const rows = await this.prisma.invoices.findMany({
          where: {
            deleted_at: null,
            is_voided: false,
            invoice_date: this.range(from, to),
            status: { not: 'DRAFT' },
          },
          select: { invoice_date: true, total_amount: true },
        });
        return rows.map((r) => ({
          at: new Date(r.invoice_date),
          amount: dec(r.total_amount),
        }));
      },
      (n) => Math.round(n * 100) / 100,
    );
  }

  private async timeSeriesCounts(
    period: ResolvedPeriod,
    _countFn: (r: Range) => Promise<number>,
    dateOf: (row: { created_at: Date }) => Date,
    mode: 'patients' | 'generic',
  ) {
    if (mode === 'patients') {
      return this.seriesPointsWithCompare(period, async (from, to) => {
        const rows = await this.prisma.patients.findMany({
          where: {
            deleted_at: null,
            created_at: this.range(from, to),
          },
          select: { created_at: true },
        });
        return rows.map((r) => ({ at: dateOf(r) }));
      });
    }

    return this.withPreviousByIndex(
      enumerateBuckets(period.from, period.to, period.granularity).map(
        (periodKey) => ({ period: periodKey, value: 0 }),
      ),
      null,
    );
  }

  // ── Financial / Billing ───────────────────────────────────
  private async financial(
    period: ResolvedPeriod,
    query: AnalyticsQueryDto,
    domain: string,
  ): Promise<AnalyticsPayload> {
    const cur = this.range(period.from, period.to);
    const prev =
      period.compareFrom && period.compareTo
        ? this.range(period.compareFrom, period.compareTo)
        : null;

    const [
      billedCur,
      billedPrev,
      collectedCur,
      collectedPrev,
      allocatedCur,
      outstandingCur,
      invoiceCount,
      paymentCount,
      byMethod,
      byService,
    ] = await Promise.all([
      this.sumInvoices(cur),
      prev ? this.sumInvoices(prev) : Promise.resolve(null),
      this.sumPayments(cur, query.paymentMethodId),
      prev
        ? this.sumPayments(prev, query.paymentMethodId)
        : Promise.resolve(null),
      this.sumAllocations(cur),
      this.outstandingInPeriod(cur),
      this.prisma.invoices.count({
        where: {
          deleted_at: null,
          is_voided: false,
          invoice_date: cur,
          status: { not: 'DRAFT' },
        },
      }),
      this.prisma.payments.count({
        where: {
          status: 'COMPLETED',
          payment_date: cur,
          ...(query.paymentMethodId
            ? { payment_method_id: query.paymentMethodId }
            : {}),
        },
      }),
      this.paymentsByMethod(cur),
      this.revenueByService(cur),
    ]);

    const revenueSeries = await this.invoiceSeries(period);
    const paymentSeries = await this.paymentSeries(period);

    return {
      meta: this.meta(domain, period),
      kpis: [
        this.kpiPair(
          'revenue.billed',
          'Gross billed',
          billedCur,
          billedPrev,
          'currency',
        ),
        this.kpiPair(
          'revenue.collected',
          'Collected (cash/M-Pesa/etc.)',
          collectedCur,
          collectedPrev,
          'currency',
        ),
        this.kpiPair(
          'revenue.allocated',
          'Allocated to invoices',
          allocatedCur,
          null,
          'currency',
        ),
        this.kpiPair(
          'revenue.outstanding',
          'Outstanding receivables',
          outstandingCur,
          null,
          'currency',
        ),
        this.kpiPair('invoices.count', 'Invoices', invoiceCount, null, 'count'),
        this.kpiPair(
          'payments.count',
          'Payments',
          paymentCount,
          null,
          'count',
        ),
      ],
      series: [
        series({
          key: 'revenue.billed_trend',
          label: 'Billed over time',
          points: revenueSeries,
        }),
        series({
          key: 'revenue.collected_trend',
          label: 'Collected over time',
          points: paymentSeries,
        }),
      ],
      breakdowns: [
        breakdown({
          key: 'payments.by_method',
          label: 'Collections by payment method',
          rows: byMethod,
        }),
        breakdown({
          key: 'revenue.by_service',
          label: 'Billed by service (top 15)',
          rows: byService.slice(0, 15),
        }),
      ],
      tables: [
        table({
          key: 'financial.by_service',
          label: 'Revenue by service',
          columns: ['Service', 'Amount', '% of Total'],
          rows: (() => {
            const total = byService.reduce((s, r) => s + r.value, 0);
            return byService.slice(0, 25).map((r) => ({
              Service: r.name,
              Amount: r.value,
              '% of Total':
                total > 0
                  ? Math.round((r.value / total) * 1000) / 10
                  : 0,
            }));
          })(),
        }),
        table({
          key: 'financial.by_method',
          label: 'Payments by method',
          columns: ['Method', 'Amount'],
          rows: byMethod.map((r) => ({ Method: r.name, Amount: r.value })),
        }),
      ],
    };
  }

  private async paymentsByMethod(range: Range) {
    const rows = await this.prisma.payments.groupBy({
      by: ['payment_method_id'],
      where: { status: 'COMPLETED', payment_date: range },
      _sum: { amount: true },
    });
    const methodIds = rows
      .map((r) => r.payment_method_id)
      .filter((id): id is string => !!id);
    const methods = methodIds.length
      ? await this.prisma.paymentMethods.findMany({
          where: { id: { in: methodIds } },
          select: { id: true, method_name: true },
        })
      : [];
    const nameById = new Map(methods.map((m) => [m.id, m.method_name]));
    return rows.map((r) => ({
      name: r.payment_method_id
        ? (nameById.get(r.payment_method_id) ?? 'Unknown')
        : 'Unspecified',
      value: dec(r._sum.amount),
    }));
  }

  private async revenueByService(range: Range) {
    const items = await this.prisma.invoiceItems.findMany({
      where: {
        invoice: {
          deleted_at: null,
          is_voided: false,
          invoice_date: range,
          status: { not: 'DRAFT' },
        },
      },
      select: {
        total_price: true,
        description: true,
        service: { select: { service_name: true } },
      },
    });
    const map = new Map<string, number>();
    for (const it of items) {
      const name = it.service?.service_name || it.description || 'Other';
      map.set(name, (map.get(name) ?? 0) + dec(it.total_price));
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
      .sort((a, b) => b.value - a.value);
  }

  private async paymentSeries(period: ResolvedPeriod) {
    return this.seriesPointsWithCompare(
      period,
      async (from, to) => {
        const rows = await this.prisma.payments.findMany({
          where: {
            status: 'COMPLETED',
            payment_date: this.range(from, to),
          },
          select: { payment_date: true, amount: true },
        });
        return rows.map((r) => ({
          at: new Date(r.payment_date),
          amount: dec(r.amount),
        }));
      },
      (n) => Math.round(n * 100) / 100,
    );
  }

  // ── Appointments ──────────────────────────────────────────
  private async appointments(
    period: ResolvedPeriod,
    query: AnalyticsQueryDto,
  ): Promise<AnalyticsPayload> {
    const cur = this.range(period.from, period.to);
    const baseWhere: Prisma.AppointmentsWhereInput = {
      deleted_at: null,
      appointment_date: cur,
      ...(query.doctorId ? { doctor_id: query.doctorId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const byStatus = await this.prisma.appointments.groupBy({
      by: ['status'],
      where: baseWhere,
      _count: { _all: true },
    });
    const total = byStatus.reduce((s, r) => s + r._count._all, 0);
    const completed =
      byStatus.find((s) => s.status === 'COMPLETED')?._count._all ?? 0;
    const cancelled =
      byStatus.find((s) => s.status === 'CANCELLED')?._count._all ?? 0;
    const noShow =
      byStatus.find((s) => s.status === 'NO_SHOW')?._count._all ?? 0;
    const pending = byStatus
      .filter((s) =>
        ['SCHEDULED', 'CHECKED_IN', 'CONFIRMED', 'PENDING'].includes(s.status),
      )
      .reduce((s, r) => s + r._count._all, 0);
    const completionRate =
      total > 0 ? Math.round((completed / total) * 1000) / 10 : 0;

    const rows = await this.prisma.appointments.findMany({
      where: baseWhere,
      select: {
        appointment_date: true,
        status: true,
        doctor_id: true,
        doctor: {
          select: {
            user: {
              select: {
                core_profiles_user_id: {
                  select: { first_name: true, last_name: true },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    const doctorMap = new Map<string, number>();
    for (const r of rows) {
      const p = r.doctor?.user?.core_profiles_user_id?.[0];
      const name = p
        ? `${p.first_name} ${p.last_name}`.trim()
        : r.doctor_id.slice(0, 8);
      doctorMap.set(name, (doctorMap.get(name) ?? 0) + 1);
    }

    const trendPoints = await this.seriesPointsWithCompare(
      period,
      async (from, to) => {
        const list = await this.prisma.appointments.findMany({
          where: {
            ...baseWhere,
            appointment_date: this.range(from, to),
          },
          select: { appointment_date: true },
        });
        return list.map((r) => ({ at: new Date(r.appointment_date) }));
      },
    );

    const byDoctor = [...doctorMap.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 20);

    return {
      meta: this.meta('appointments', period),
      kpis: [
        this.kpiPair('appointments.total', 'Total', total, null, 'count'),
        this.kpiPair(
          'appointments.completed',
          'Completed',
          completed,
          null,
          'count',
        ),
        this.kpiPair(
          'appointments.pending',
          'Pending',
          pending,
          null,
          'count',
        ),
        this.kpiPair(
          'appointments.cancelled',
          'Cancelled',
          cancelled,
          null,
          'count',
        ),
        this.kpiPair(
          'appointments.no_show',
          'No-show',
          noShow,
          null,
          'count',
        ),
        this.kpiPair(
          'appointments.completion_rate',
          'Completion rate',
          completionRate,
          null,
          'percent',
        ),
      ],
      series: [
        series({
          key: 'appointments.trend',
          label: 'Appointments over time',
          points: trendPoints,
        }),
      ],
      breakdowns: [
        breakdown({
          key: 'appointments.by_status',
          label: 'By status',
          rows: byStatus.map((r) => ({
            name: r.status,
            value: r._count._all,
          })),
        }),
        breakdown({
          key: 'appointments.by_doctor',
          label: 'By doctor',
          rows: byDoctor,
        }),
      ],
      tables: [
        table({
          key: 'appointments.doctor_workload',
          label: 'Doctor workload',
          columns: ['Doctor', 'Appointments'],
          rows: byDoctor.map((r) => ({
            Doctor: r.name,
            Appointments: r.value,
          })),
        }),
      ],
    };
  }

  // ── Patients ──────────────────────────────────────────────
  private async patients(
    period: ResolvedPeriod,
    _query: AnalyticsQueryDto,
  ): Promise<AnalyticsPayload> {
    const cur = this.range(period.from, period.to);
    const prev =
      period.compareFrom && period.compareTo
        ? this.range(period.compareFrom, period.compareTo)
        : null;

    const [registered, registeredPrev, totalActive, genderRows] =
      await Promise.all([
        this.prisma.patients.count({
          where: { deleted_at: null, created_at: cur },
        }),
        prev
          ? this.prisma.patients.count({
              where: { deleted_at: null, created_at: prev },
            })
          : Promise.resolve(null),
        this.prisma.patients.count({ where: { deleted_at: null } }),
        this.prisma.$queryRaw<Array<{ gender: string | null; n: bigint }>>`
          SELECT p.gender, COUNT(*)::bigint AS n
          FROM patients.patients pt
          JOIN core.profiles p ON p.user_id = pt.user_id
          WHERE pt.deleted_at IS NULL
            AND pt.created_at >= ${period.from}
            AND pt.created_at <= ${period.to}
          GROUP BY p.gender
        `,
      ]);

    const trend = await this.timeSeriesCounts(
      period,
      async () => 0,
      (d) => d.created_at,
      'patients',
    );

    return {
      meta: this.meta('patients', period),
      kpis: [
        this.kpiPair(
          'patients.registered',
          'New registrations',
          registered,
          registeredPrev,
          'count',
        ),
        this.kpiPair(
          'patients.total_active',
          'Active patients (all time)',
          totalActive,
          null,
          'count',
        ),
      ],
      series: [
        series({
          key: 'patients.registrations',
          label: 'Registrations over time',
          points: trend,
        }),
      ],
      breakdowns: [
        breakdown({
          key: 'patients.by_gender',
          label: 'New patients by gender',
          rows: genderRows.map((r) => ({
            name: r.gender || 'Unknown',
            value: Number(r.n),
          })),
        }),
      ],
      tables: [
        table({
          key: 'patients.gender',
          label: 'Gender distribution (new in period)',
          columns: ['Gender', 'Count'],
          rows: genderRows.map((r) => ({
            Gender: r.gender || 'Unknown',
            Count: Number(r.n),
          })),
        }),
      ],
    };
  }

  // ── Laboratory ────────────────────────────────────────────
  private async laboratory(
    period: ResolvedPeriod,
    query: AnalyticsQueryDto,
  ): Promise<AnalyticsPayload> {
    const cur = this.range(period.from, period.to);
    const where: Prisma.LaboratoryRequestsWhereInput = {
      request_date: cur,
      ...(query.doctorId ? { requesting_doctor_id: query.doctorId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const byStatus = await this.prisma.laboratoryRequests.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });
    const total = byStatus.reduce((s, r) => s + r._count._all, 0);
    const completed = byStatus
      .filter((s) =>
        ['COMPLETED', 'RELEASED', 'RESULTS_READY'].includes(s.status),
      )
      .reduce((s, r) => s + r._count._all, 0);
    const pending = byStatus
      .filter((s) =>
        ['PENDING', 'PROCESSING', 'SAMPLE_COLLECTED', 'IN_PROGRESS'].includes(
          s.status,
        ),
      )
      .reduce((s, r) => s + r._count._all, 0);

    const byPriority = await this.prisma.laboratoryRequests.groupBy({
      by: ['priority'],
      where,
      _count: { _all: true },
    });

    const trendPoints = await this.seriesPointsWithCompare(
      period,
      async (from, to) => {
        const list = await this.prisma.laboratoryRequests.findMany({
          where: {
            ...where,
            request_date: this.range(from, to),
          },
          select: { request_date: true },
        });
        return list.map((r) => ({ at: new Date(r.request_date) }));
      },
    );

    const tatRows = await this.prisma.$queryRaw<
      Array<{ avg_hours: number | null; n: bigint }>
    >`
      SELECT AVG(EXTRACT(EPOCH FROM (r.verified_at - lr.request_date)) / 3600.0) AS avg_hours,
             COUNT(*)::bigint AS n
      FROM laboratory.results r
      JOIN laboratory.requests lr ON lr.id = r.request_id
      WHERE r.verified_at IS NOT NULL
        AND lr.request_date >= ${period.from}
        AND lr.request_date <= ${period.to}
    `;
    const tatN = Number(tatRows[0]?.n ?? 0);
    const tatHours =
      tatN > 0 && tatRows[0]?.avg_hours != null
        ? Math.round(Number(tatRows[0].avg_hours) * 10) / 10
        : null;

    const kpis = [
      this.kpiPair('lab.requests', 'Requests', total, null, 'count'),
      this.kpiPair('lab.completed', 'Completed', completed, null, 'count'),
      this.kpiPair('lab.pending', 'Pending', pending, null, 'count'),
    ];
    if (tatHours !== null) {
      kpis.push(
        this.kpiPair(
          'lab.avg_tat_hours',
          'Avg turnaround (hours)',
          tatHours,
          null,
          'hours',
        ),
      );
    }

    return {
      meta: this.meta('laboratory', period),
      kpis,
      series: [
        series({
          key: 'lab.requests_trend',
          label: 'Lab requests over time',
          points: trendPoints,
        }),
      ],
      breakdowns: [
        breakdown({
          key: 'lab.by_status',
          label: 'By status',
          rows: byStatus.map((r) => ({
            name: r.status,
            value: r._count._all,
          })),
        }),
        breakdown({
          key: 'lab.by_priority',
          label: 'By priority',
          rows: byPriority.map((r) => ({
            name: r.priority,
            value: r._count._all,
          })),
        }),
      ],
      tables: [
        table({
          key: 'lab.status',
          label: 'Request status',
          columns: ['Status', 'Count'],
          rows: byStatus.map((r) => ({
            Status: r.status,
            Count: r._count._all,
          })),
        }),
      ],
    };
  }

  // ── Pharmacy ──────────────────────────────────────────────
  private async pharmacy(
    period: ResolvedPeriod,
    _query: AnalyticsQueryDto,
  ): Promise<AnalyticsPayload> {
    const cur = this.range(period.from, period.to);
    const [rxCount, dispensedLines, topMeds, stockValueRows, nearExpiry] =
      await Promise.all([
        this.prisma.prescriptions.count({
          where: {
            deleted_at: null,
            is_voided: false,
            prescription_date: cur,
          },
        }),
        this.prisma.prescriptionLines.count({
          where: { dispensed_at: cur },
        }),
        this.prisma.prescriptionLines.groupBy({
          by: ['medication_id'],
          where: { dispensed_at: cur },
          _sum: { quantity: true },
          _count: { _all: true },
          orderBy: { _sum: { quantity: 'desc' } },
          take: 15,
        }),
        this.prisma.$queryRaw<Array<{ stock_value: Prisma.Decimal | null }>>`
          SELECT SUM(quantity_on_hand * unit_cost) AS stock_value
          FROM pharmacy.batches
          WHERE quantity_on_hand > 0
        `,
        this.prisma.batches.count({
          where: {
            quantity_on_hand: { gt: 0 },
            expiry_date: {
              lte: addDaysDate(new Date(), 90),
              gte: new Date(),
            },
          },
        }),
      ]);

    const medIds = topMeds.map((m) => m.medication_id);
    const meds = medIds.length
      ? await this.prisma.medications.findMany({
          where: { id: { in: medIds } },
          select: { id: true, medication_name: true },
        })
      : [];
    const medName = new Map(meds.map((m) => [m.id, m.medication_name]));

    const trendPoints = await this.seriesPointsWithCompare(period, async (from, to) => {
      const dispensedRows = await this.prisma.prescriptionLines.findMany({
        where: { dispensed_at: this.range(from, to) },
        select: { dispensed_at: true, quantity: true },
      });
      return dispensedRows
        .filter((r) => r.dispensed_at)
        .map((r) => ({
          at: new Date(r.dispensed_at!),
          amount: r.quantity,
        }));
    });

    const stockValue = dec(stockValueRows[0]?.stock_value);

    return {
      meta: this.meta('pharmacy', period),
      kpis: [
        this.kpiPair(
          'pharmacy.prescriptions',
          'Prescriptions',
          rxCount,
          null,
          'count',
        ),
        this.kpiPair(
          'pharmacy.dispensed_lines',
          'Dispensed lines',
          dispensedLines,
          null,
          'count',
        ),
        this.kpiPair(
          'pharmacy.stock_value',
          'Stock value (on hand)',
          Math.round(stockValue * 100) / 100,
          null,
          'currency',
        ),
        this.kpiPair(
          'pharmacy.near_expiry_batches',
          'Near-expiry batches (90d)',
          nearExpiry,
          null,
          'count',
        ),
      ],
      series: [
        series({
          key: 'pharmacy.dispensed_qty',
          label: 'Dispensed quantity over time',
          points: trendPoints,
        }),
      ],
      breakdowns: [
        breakdown({
          key: 'pharmacy.top_medications',
          label: 'Top dispensed medications',
          rows: topMeds.map((m) => ({
            name: medName.get(m.medication_id) ?? m.medication_id.slice(0, 8),
            value: dec(m._sum.quantity),
          })),
        }),
      ],
      tables: [
        table({
          key: 'pharmacy.top_meds',
          label: 'Top medications',
          columns: ['Medication', 'Qty dispensed', 'Lines'],
          rows: topMeds.map((m) => ({
            Medication:
              medName.get(m.medication_id) ?? m.medication_id.slice(0, 8),
            'Qty dispensed': dec(m._sum.quantity),
            Lines: m._count._all,
          })),
        }),
      ],
    };
  }

  // ── IPD ───────────────────────────────────────────────────
  private async ipd(
    period: ResolvedPeriod,
    query: AnalyticsQueryDto,
  ): Promise<AnalyticsPayload> {
    const cur = this.range(period.from, period.to);
    const wardFilter = query.wardId
      ? { bed: { ward_id: query.wardId } }
      : {};

    const [admissions, discharges, current, beds, losRows] = await Promise.all([
      this.prisma.admissions.count({
        where: { admission_date: cur, ...wardFilter },
      }),
      this.prisma.admissions.count({
        where: { discharge_date: cur, ...wardFilter },
      }),
      this.prisma.admissions.count({
        where: { status: 'ADMITTED', ...wardFilter },
      }),
      this.prisma.beds.groupBy({
        by: ['status', 'ward_id'],
        _count: { _all: true },
        ...(query.wardId ? { where: { ward_id: query.wardId } } : {}),
      }),
      this.prisma.$queryRaw<Array<{ avg_los: number | null; n: bigint }>>`
        SELECT AVG(EXTRACT(EPOCH FROM (discharge_date - admission_date)) / 86400.0) AS avg_los,
               COUNT(*)::bigint AS n
        FROM inpatient.admissions
        WHERE discharge_date IS NOT NULL
          AND discharge_date >= ${period.from}
          AND discharge_date <= ${period.to}
      `,
    ]);

    const totalBeds = beds.reduce((s, b) => s + b._count._all, 0);
    const occupied = beds
      .filter((b) => b.status === 'OCCUPIED')
      .reduce((s, b) => s + b._count._all, 0);
    const occupancy =
      totalBeds > 0 ? Math.round((occupied / totalBeds) * 1000) / 10 : 0;
    const avgLos =
      Number(losRows[0]?.n ?? 0) > 0 && losRows[0]?.avg_los != null
        ? Math.round(Number(losRows[0].avg_los) * 10) / 10
        : null;

    const wardIds = [...new Set(beds.map((b) => b.ward_id))];
    const wards = wardIds.length
      ? await this.prisma.wards.findMany({
          where: { id: { in: wardIds } },
          select: { id: true, name: true },
        })
      : [];
    const wardName = new Map(wards.map((w) => [w.id, w.name]));

    const wardUtil = new Map<string, { occupied: number; total: number }>();
    for (const b of beds) {
      const curW = wardUtil.get(b.ward_id) ?? { occupied: 0, total: 0 };
      curW.total += b._count._all;
      if (b.status === 'OCCUPIED') curW.occupied += b._count._all;
      wardUtil.set(b.ward_id, curW);
    }

    const [admissionTrend, dischargeTrend] = await Promise.all([
      this.seriesPointsWithCompare(period, async (from, to) => {
        const admRows = await this.prisma.admissions.findMany({
          where: { admission_date: this.range(from, to) },
          select: { admission_date: true },
        });
        return admRows.map((r) => ({ at: new Date(r.admission_date) }));
      }),
      this.seriesPointsWithCompare(period, async (from, to) => {
        const disRows = await this.prisma.admissions.findMany({
          where: { discharge_date: this.range(from, to) },
          select: { discharge_date: true },
        });
        return disRows
          .filter((r) => r.discharge_date)
          .map((r) => ({ at: new Date(r.discharge_date!) }));
      }),
    ]);

    const kpis = [
      this.kpiPair('ipd.admissions', 'Admissions', admissions, null, 'count'),
      this.kpiPair('ipd.discharges', 'Discharges', discharges, null, 'count'),
      this.kpiPair(
        'ipd.current_inpatients',
        'Current inpatients',
        current,
        null,
        'count',
      ),
      this.kpiPair(
        'ipd.occupancy_pct',
        'Bed occupancy',
        occupancy,
        null,
        'percent',
      ),
    ];
    if (avgLos !== null) {
      kpis.push(
        this.kpiPair(
          'ipd.avg_los_days',
          'Avg length of stay (days)',
          avgLos,
          null,
          'days',
        ),
      );
    }

    return {
      meta: this.meta('ipd', period),
      kpis,
      series: [
        series({
          key: 'ipd.admissions_trend',
          label: 'Admissions',
          points: admissionTrend,
        }),
        series({
          key: 'ipd.discharges_trend',
          label: 'Discharges',
          points: dischargeTrend,
        }),
      ],
      breakdowns: [
        breakdown({
          key: 'ipd.ward_occupancy',
          label: 'Occupied beds by ward',
          rows: [...wardUtil.entries()].map(([id, v]) => ({
            name: wardName.get(id) ?? id.slice(0, 8),
            value: v.occupied,
          })),
        }),
      ],
      tables: [
        table({
          key: 'ipd.wards',
          label: 'Ward utilization',
          columns: ['Ward', 'Occupied', 'Total', 'Occupancy %'],
          rows: [...wardUtil.entries()].map(([id, v]) => ({
            Ward: wardName.get(id) ?? id.slice(0, 8),
            Occupied: v.occupied,
            Total: v.total,
            'Occupancy %':
              v.total > 0
                ? Math.round((v.occupied / v.total) * 1000) / 10
                : 0,
          })),
        }),
      ],
    };
  }

  // ── Radiology ─────────────────────────────────────────────
  private async radiology(
    period: ResolvedPeriod,
    query: AnalyticsQueryDto,
  ): Promise<AnalyticsPayload> {
    const cur = this.range(period.from, period.to);
    const where: Prisma.RadiologyRequestsWhereInput = {
      created_at: cur,
      ...(query.doctorId ? { requesting_doctor_id: query.doctorId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const byStatus = await this.prisma.radiologyRequests.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });
    const byScan = await this.prisma.radiologyRequests.groupBy({
      by: ['scan_type_id'],
      where,
      _count: { _all: true },
      orderBy: { _count: { scan_type_id: 'desc' } },
      take: 15,
    });
    const scanIds = byScan.map((s) => s.scan_type_id);
    const scans = scanIds.length
      ? await this.prisma.scanTypes.findMany({
          where: { id: { in: scanIds } },
          select: { id: true, scan_type: true },
        })
      : [];
    const scanName = new Map(scans.map((s) => [s.id, s.scan_type]));

    const total = byStatus.reduce((s, r) => s + r._count._all, 0);
    const completed = byStatus
      .filter((s) =>
        ['COMPLETED', 'REPORTED', 'FINAL', 'SIGNED'].includes(s.status),
      )
      .reduce((s, r) => s + r._count._all, 0);
    const pending = byStatus
      .filter((s) =>
        ['PENDING', 'SCHEDULED', 'IN_PROGRESS', 'DRAFT'].includes(s.status),
      )
      .reduce((s, r) => s + r._count._all, 0);

    const trendPoints = await this.seriesPointsWithCompare(
      period,
      async (from, to) => {
        const list = await this.prisma.radiologyRequests.findMany({
          where: {
            ...where,
            created_at: this.range(from, to),
          },
          select: { created_at: true },
        });
        return list.map((r) => ({ at: new Date(r.created_at) }));
      },
    );

    return {
      meta: this.meta('radiology', period),
      kpis: [
        this.kpiPair(
          'radiology.requests',
          'Requests',
          total,
          null,
          'count',
        ),
        this.kpiPair(
          'radiology.completed',
          'Completed',
          completed,
          null,
          'count',
        ),
        this.kpiPair(
          'radiology.pending',
          'Pending',
          pending,
          null,
          'count',
        ),
      ],
      series: [
        series({
          key: 'radiology.trend',
          label: 'Requests over time',
          points: trendPoints,
        }),
      ],
      breakdowns: [
        breakdown({
          key: 'radiology.by_status',
          label: 'By status',
          rows: byStatus.map((r) => ({
            name: r.status,
            value: r._count._all,
          })),
        }),
        breakdown({
          key: 'radiology.by_modality',
          label: 'By scan type',
          rows: byScan.map((r) => ({
            name: scanName.get(r.scan_type_id) ?? 'Unknown',
            value: r._count._all,
          })),
        }),
      ],
      tables: [
        table({
          key: 'radiology.modalities',
          label: 'Scan types',
          columns: ['Scan type', 'Count'],
          rows: byScan.map((r) => ({
            'Scan type': scanName.get(r.scan_type_id) ?? 'Unknown',
            Count: r._count._all,
          })),
        }),
      ],
    };
  }

  // ── Insurance ─────────────────────────────────────────────
  private async insurance(
    period: ResolvedPeriod,
    query: AnalyticsQueryDto,
  ): Promise<AnalyticsPayload> {
    const cur = this.range(period.from, period.to);
    const where: Prisma.InsuranceClaimsWhereInput = {
      OR: [{ submission_date: cur }, { submission_date: null, created_at: cur }],
      ...(query.status ? { status: query.status } : {}),
    };

    const byStatus = await this.prisma.insuranceClaims.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
      _sum: {
        amount_claimed: true,
        amount_approved: true,
        amount_paid: true,
      },
    });

    const submitted = byStatus.reduce((s, r) => s + r._count._all, 0);
    const approvedValue = byStatus
      .filter((s) =>
        ['APPROVED', 'PARTIALLY_APPROVED', 'PAID'].includes(s.status),
      )
      .reduce((s, r) => s + dec(r._sum.amount_approved), 0);
    const deniedValue = byStatus
      .filter((s) => s.status === 'DENIED')
      .reduce((s, r) => s + dec(r._sum.amount_claimed), 0);
    const pending = byStatus
      .filter((s) =>
        ['SUBMITTED', 'PENDING', 'UNDER_REVIEW', 'DRAFT'].includes(s.status),
      )
      .reduce((s, r) => s + r._count._all, 0);

    const claims = await this.prisma.insuranceClaims.findMany({
      where,
      select: {
        status: true,
        amount_claimed: true,
        amount_approved: true,
        submission_date: true,
        created_at: true,
        insurance_policy: {
          select: {
            provider: { select: { name: true } },
          },
        },
      },
    });

    const byInsurer = new Map<string, number>();
    for (const c of claims) {
      const insurer =
        c.insurance_policy?.provider?.name ?? 'Unknown / self-pay claim';
      byInsurer.set(
        insurer,
        (byInsurer.get(insurer) ?? 0) + dec(c.amount_claimed),
      );
    }

    const trendPoints = await this.seriesPointsWithCompare(
      period,
      async (from, to) => {
        const range = this.range(from, to);
        const list = await this.prisma.insuranceClaims.findMany({
          where: {
            OR: [
              { submission_date: range },
              { submission_date: null, created_at: range },
            ],
            ...(query.status ? { status: query.status } : {}),
          },
          select: { submission_date: true, created_at: true },
        });
        return list.map((c) => ({
          at: new Date(c.submission_date ?? c.created_at),
        }));
      },
    );

    return {
      meta: this.meta('insurance', period),
      kpis: [
        this.kpiPair(
          'claims.submitted',
          'Claims',
          submitted,
          null,
          'count',
        ),
        this.kpiPair(
          'claims.approved_value',
          'Approved value',
          Math.round(approvedValue * 100) / 100,
          null,
          'currency',
        ),
        this.kpiPair(
          'claims.denied_value',
          'Denied claimed value',
          Math.round(deniedValue * 100) / 100,
          null,
          'currency',
        ),
        this.kpiPair('claims.pending', 'Pending claims', pending, null, 'count'),
      ],
      series: [
        series({
          key: 'claims.trend',
          label: 'Claims over time',
          points: trendPoints,
        }),
      ],
      breakdowns: [
        breakdown({
          key: 'claims.by_status',
          label: 'By status',
          rows: byStatus.map((r) => ({
            name: r.status,
            value: r._count._all,
          })),
        }),
        breakdown({
          key: 'claims.by_insurer',
          label: 'Claimed amount by insurer',
          rows: [...byInsurer.entries()].map(([name, value]) => ({
            name,
            value: Math.round(value * 100) / 100,
          })),
        }),
      ],
      tables: [
        table({
          key: 'claims.status_values',
          label: 'Claims by status',
          columns: ['Status', 'Count', 'Claimed', 'Approved', 'Paid'],
          rows: byStatus.map((r) => ({
            Status: r.status,
            Count: r._count._all,
            Claimed: dec(r._sum.amount_claimed),
            Approved: dec(r._sum.amount_approved),
            Paid: dec(r._sum.amount_paid),
          })),
        }),
      ],
    };
  }

  // ── Staff ─────────────────────────────────────────────────
  private async staff(
    period: ResolvedPeriod,
    _query: AnalyticsQueryDto,
  ): Promise<AnalyticsPayload> {
    const active = await this.prisma.staffProfiles.count({
      where: { is_active: true, deleted_at: null },
    });

    const byRole = await this.prisma.$queryRaw<
      Array<{ role: string; n: bigint }>
    >`
      SELECT r.name AS role, COUNT(DISTINCT sp.id)::bigint AS n
      FROM core.staff_profiles sp
      JOIN core.user_roles ur ON ur.user_id = sp.user_id
      JOIN core.roles r ON r.id = ur.role_id
      WHERE sp.is_active = true AND sp.deleted_at IS NULL
      GROUP BY r.name
      ORDER BY n DESC
    `;

    const apptByDoctor = await this.prisma.appointments.groupBy({
      by: ['doctor_id'],
      where: {
        deleted_at: null,
        appointment_date: this.range(period.from, period.to),
      },
      _count: { _all: true },
      orderBy: { _count: { doctor_id: 'desc' } },
      take: 15,
    });
    const doctorIds = apptByDoctor.map((a) => a.doctor_id);
    const doctors = doctorIds.length
      ? await this.prisma.staffProfiles.findMany({
          where: { id: { in: doctorIds } },
          select: {
            id: true,
            user: {
              select: {
                core_profiles_user_id: {
                  select: { first_name: true, last_name: true },
                  take: 1,
                },
              },
            },
          },
        })
      : [];
    const docName = new Map(
      doctors.map((d) => {
        const p = d.user?.core_profiles_user_id?.[0];
        return [
          d.id,
          p ? `${p.first_name} ${p.last_name}`.trim() : d.id.slice(0, 8),
        ];
      }),
    );

    const activitySeries = await this.seriesPointsWithCompare(
      period,
      async (from, to) => {
        const list = await this.prisma.appointments.findMany({
          where: {
            deleted_at: null,
            appointment_date: this.range(from, to),
          },
          select: { appointment_date: true },
        });
        return list.map((r) => ({ at: new Date(r.appointment_date) }));
      },
    );

    return {
      meta: this.meta('staff', period),
      kpis: [
        this.kpiPair('staff.active', 'Active staff', active, null, 'count'),
      ],
      series: [
        series({
          key: 'staff.activity',
          label: 'Appointments over time',
          points: activitySeries,
        }),
      ],
      breakdowns: [
        breakdown({
          key: 'staff.by_role',
          label: 'Staff by role',
          rows: byRole.map((r) => ({
            name: r.role,
            value: Number(r.n),
          })),
        }),
        breakdown({
          key: 'staff.doctor_appointments',
          label: 'Doctor appointment volume (period)',
          rows: apptByDoctor.map((a) => ({
            name: docName.get(a.doctor_id) ?? a.doctor_id.slice(0, 8),
            value: a._count._all,
          })),
        }),
      ],
      tables: [
        table({
          key: 'staff.roles',
          label: 'Headcount by role',
          columns: ['Role', 'Count'],
          rows: byRole.map((r) => ({
            Role: r.role,
            Count: Number(r.n),
          })),
        }),
      ],
    };
  }

  // ── Void audit ────────────────────────────────────────────
  private async voidAudit(
    period: ResolvedPeriod,
    _query: AnalyticsQueryDto,
  ): Promise<AnalyticsPayload> {
    const cur = this.range(period.from, period.to);

    const [voidInvoices, voidRx, auditByAction, auditByEntity] =
      await Promise.all([
        this.prisma.invoices.count({
          where: {
            is_voided: true,
            updated_at: cur,
          },
        }),
        this.prisma.prescriptions.count({
          where: {
            is_voided: true,
            voided_at: cur,
          },
        }),
        this.prisma.auditLogs.groupBy({
          by: ['action'],
          where: { created_at: cur },
          _count: { _all: true },
        }),
        this.prisma.auditLogs.groupBy({
          by: ['entity_type'],
          where: { created_at: cur },
          _count: { _all: true },
          orderBy: { _count: { entity_type: 'desc' } },
          take: 20,
        }),
      ]);

    const auditTotal = auditByAction.reduce((s, a) => s + a._count._all, 0);

    const voidedInvoiceRows = await this.prisma.invoices.findMany({
      where: { is_voided: true, updated_at: cur },
      select: {
        invoice_number: true,
        total_amount: true,
        void_reason: true,
        updated_at: true,
        created_by: true,
      },
      take: 50,
      orderBy: { updated_at: 'desc' },
    });

    const reasonMap = new Map<string, number>();
    for (const r of voidedInvoiceRows) {
      const reason = r.void_reason?.trim() || 'Unspecified';
      reasonMap.set(reason, (reasonMap.get(reason) ?? 0) + 1);
    }

    const voidTrend = await this.seriesPointsWithCompare(
      period,
      async (from, to) => {
        const list = await this.prisma.invoices.findMany({
          where: {
            is_voided: true,
            updated_at: this.range(from, to),
          },
          select: { updated_at: true },
        });
        return list.map((r) => ({ at: new Date(r.updated_at) }));
      },
    );

    return {
      meta: this.meta('void-audit', period),
      kpis: [
        this.kpiPair(
          'void.invoices',
          'Voided invoices',
          voidInvoices,
          null,
          'count',
        ),
        this.kpiPair(
          'void.prescriptions',
          'Voided prescriptions',
          voidRx,
          null,
          'count',
        ),
        this.kpiPair(
          'audit.events',
          'Audit events',
          auditTotal,
          null,
          'count',
        ),
      ],
      series: [
        series({
          key: 'void.trend',
          label: 'Voided invoices over time',
          points: voidTrend,
        }),
      ],
      breakdowns: [
        breakdown({
          key: 'audit.by_action',
          label: 'Audit by action',
          rows: auditByAction.map((a) => ({
            name: a.action,
            value: a._count._all,
          })),
        }),
        breakdown({
          key: 'audit.by_entity',
          label: 'Audit by entity',
          rows: auditByEntity.map((a) => ({
            name: a.entity_type,
            value: a._count._all,
          })),
        }),
        breakdown({
          key: 'void.reasons',
          label: 'Invoice void reasons',
          rows: [...reasonMap.entries()].map(([name, value]) => ({
            name,
            value,
          })),
        }),
      ],
      tables: [
        table({
          key: 'void.invoices_detail',
          label: 'Voided invoices (recent)',
          columns: ['Invoice', 'Amount', 'Reason', 'Updated'],
          rows: voidedInvoiceRows.map((r) => ({
            Invoice: r.invoice_number,
            Amount: dec(r.total_amount),
            Reason: r.void_reason || '—',
            Updated: r.updated_at.toISOString(),
          })),
        }),
      ],
    };
  }

  // ── Follow-ups ────────────────────────────────────────────
  private async followUps(
    period: ResolvedPeriod,
    query: AnalyticsQueryDto,
  ): Promise<AnalyticsPayload> {
    const cur = this.range(period.from, period.to);
    const where: Prisma.FollowUpsWhereInput = {
      follow_up_date: cur,
      ...(query.status ? { status: query.status } : {}),
    };

    const byStatus = await this.prisma.followUps.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });
    const scheduled =
      byStatus.find((s) => s.status === 'SCHEDULED')?._count._all ?? 0;
    const completed =
      byStatus.find((s) => s.status === 'COMPLETED')?._count._all ?? 0;
    const overdue = await this.prisma.followUps.count({
      where: {
        status: 'SCHEDULED',
        follow_up_date: { lt: startOfDay(new Date()) },
      },
    });

    const trendPoints = await this.seriesPointsWithCompare(
      period,
      async (from, to) => {
        const list = await this.prisma.followUps.findMany({
          where: {
            follow_up_date: this.range(from, to),
            ...(query.status ? { status: query.status } : {}),
          },
          select: { follow_up_date: true },
        });
        return list.map((r) => ({ at: new Date(r.follow_up_date) }));
      },
    );

    return {
      meta: this.meta('follow-ups', period),
      kpis: [
        this.kpiPair(
          'followups.scheduled',
          'Scheduled in period',
          scheduled,
          null,
          'count',
        ),
        this.kpiPair(
          'followups.completed',
          'Completed in period',
          completed,
          null,
          'count',
        ),
        this.kpiPair(
          'followups.overdue',
          'Overdue (now)',
          overdue,
          null,
          'count',
        ),
      ],
      series: [
        series({
          key: 'followups.trend',
          label: 'Follow-ups by date',
          points: trendPoints,
        }),
      ],
      breakdowns: [
        breakdown({
          key: 'followups.by_status',
          label: 'By status',
          rows: byStatus.map((r) => ({
            name: r.status,
            value: r._count._all,
          })),
        }),
      ],
      tables: [
        table({
          key: 'followups.status',
          label: 'Status',
          columns: ['Status', 'Count'],
          rows: byStatus.map((r) => ({
            Status: r.status,
            Count: r._count._all,
          })),
        }),
      ],
    };
  }
}

function addDaysDate(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
