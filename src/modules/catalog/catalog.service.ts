import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  DOCTORS as FALLBACK_DOCTORS,
  LAB_TEST_CATALOG as FALLBACK_LAB,
  MEDICATIONS as FALLBACK_MEDS,
  PATIENTS as FALLBACK_PATIENTS,
} from './catalog.data';
import type {
  CatalogDepartment,
  CatalogDoctor,
  CatalogInsurer,
  CatalogLabTest,
  CatalogMedication,
  CatalogPatient,
  CatalogStaff,
} from './catalog.types';

function ageFromDob(dob: Date | null | undefined): number {
  if (!dob) return 0;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age -= 1;
  return Math.max(0, age);
}

function mapGender(
  g: string | null | undefined,
): 'Male' | 'Female' | 'Other' {
  if (g === 'MALE') return 'Male';
  if (g === 'FEMALE') return 'Female';
  return 'Other';
}

function insurerIntegration(code: string, method: string | null): CatalogInsurer['integration'] {
  if (code === 'SHA') return 'SHA';
  if ((method || '').toUpperCase() === 'API') return 'SLADE';
  return 'MANUAL';
}

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async listPatients(options?: {
    page?: number;
    limit?: number;
  }): Promise<CatalogPatient[]> {
    if (!this.prisma.isConnected) {
      return FALLBACK_PATIENTS.map((p) => ({ ...p }));
    }

    const limit = Math.min(Math.max(options?.limit ?? 100, 1), 200);
    const page = Math.max(options?.page ?? 1, 1);
    const skip = (page - 1) * limit;

    const rows = await this.prisma.patients.findMany({
      where: { deleted_at: null },
      include: {
        user: { include: { core_profiles_user_id: true } },
        clinical_appointments_patient_id: {
          orderBy: { appointment_date: 'desc' },
          take: 1,
          select: { appointment_date: true },
        },
        inpatient_admissions_patient_id: {
          where: { status: 'ADMITTED' },
          take: 1,
          select: { id: true },
        },
      },
      orderBy: { created_at: 'desc' },
      skip,
      take: limit,
    });

    return rows.map((row) => {
      const profile = row.user.core_profiles_user_id[0];
      const name = profile
        ? `${profile.first_name} ${profile.last_name}`
        : row.patient_number;
      const lastAppt = row.clinical_appointments_patient_id[0]?.appointment_date;
      const admitted = row.inpatient_admissions_patient_id.length > 0;
      return {
        id: row.id,
        mrn: row.patient_number,
        name,
        age: ageFromDob(profile?.date_of_birth ?? null),
        gender: mapGender(profile?.gender),
        phone: profile?.phone ?? '',
        lastVisit: lastAppt
          ? lastAppt.toISOString().slice(0, 10)
          : row.created_at.toISOString().slice(0, 10),
        status: admitted ? 'Admitted' : 'Active',
      };
    });
  }

  async listDoctors(): Promise<CatalogDoctor[]> {
    if (!this.prisma.isConnected) {
      return FALLBACK_DOCTORS.map((d) => ({
        ...d,
        userId: d.id,
      }));
    }

    const rows = await this.prisma.staffProfiles.findMany({
      where: {
        deleted_at: null,
        is_active: true,
        user: {
          deleted_at: null,
          is_active: true,
          core_user_roles_user_id: {
            some: { role: { name: { in: ['DOCTOR', 'RADIOLOGIST'] } } },
          },
        },
      },
      include: {
        user: {
          include: {
            core_profiles_user_id: true,
            core_user_roles_user_id: { include: { role: true } },
          },
        },
      },
      orderBy: { employee_id: 'asc' },
      take: 200,
    });

    return rows.map((row) => {
      const profile = row.user.core_profiles_user_id[0];
      const role = row.user.core_user_roles_user_id[0]?.role.name;
      const first = profile?.first_name ?? '';
      const last = profile?.last_name ?? '';
      const titled =
        first && !first.startsWith('Dr')
          ? `Dr. ${first} ${last}`.trim()
          : `${first} ${last}`.trim() || row.user.email;
      return {
        id: row.id,
        userId: row.user_id,
        name: titled,
        specialty: row.specialization || row.position || role || 'General',
        hours: 'Mon – Fri (08:00 – 17:00)',
        available: row.is_active,
        phone: profile?.phone ?? '',
        email: row.user.email,
      };
    });
  }

  async listDepartments(): Promise<CatalogDepartment[]> {
    if (!this.prisma.isConnected) return [];

    const depts = await this.prisma.departments.findMany({
      where: { is_active: true },
      orderBy: { name: 'asc' },
      take: 100,
    });

    const staff = await this.prisma.staffProfiles.findMany({
      where: { deleted_at: null, department_id: { not: null } },
      include: {
        user: {
          include: {
            core_user_roles_user_id: { include: { role: true } },
          },
        },
      },
      take: 500,
    });

    return depts.map((d) => {
      const members = staff.filter((s) => s.department_id === d.id);
      let doctors = 0;
      let nurses = 0;
      let specialists = 0;
      let support = 0;
      for (const m of members) {
        const role = m.user.core_user_roles_user_id[0]?.role.name;
        if (role === 'DOCTOR' || role === 'RADIOLOGIST') doctors += 1;
        else if (role === 'NURSE') nurses += 1;
        else if (role === 'LAB_TECHNICIAN' || role === 'PHARMACIST')
          specialists += 1;
        else support += 1;
      }
      return {
        id: d.id,
        name: d.name,
        code: d.code,
        location: d.description?.split('\n')[0] || d.code,
        description: d.description || '',
        staff: members.length,
        doctors,
        nurses,
        specialists,
        support,
        headName: d.head_name,
      };
    });
  }

  async listMedications(): Promise<CatalogMedication[]> {
    if (!this.prisma.isConnected) {
      return FALLBACK_MEDS.map((m) => ({ ...m, unit: 'units' }));
    }

    const rows = await this.prisma.medications.findMany({
      where: { deleted_at: null, is_active: true },
      include: {
        category: true,
        pharmacy_batches_medication_id: {
          orderBy: { expiry_date: 'asc' },
          take: 20,
        },
      },
      orderBy: { medication_name: 'asc' },
      take: 200,
    });

    return rows.map((row) => {
      const stock = row.pharmacy_batches_medication_id.reduce(
        (sum, b) => sum + Number(b.quantity_on_hand),
        0,
      );
      const nearest = row.pharmacy_batches_medication_id[0];
      return {
        id: row.id,
        name: row.medication_name,
        category: row.category?.category_name ?? 'General',
        stock: Math.round(stock),
        reorderLevel: 100,
        expiry: nearest
          ? nearest.expiry_date.toISOString().slice(0, 10)
          : '—',
        unit: row.unit ?? 'units',
      };
    });
  }

  async listLabTests(): Promise<CatalogLabTest[]> {
    if (!this.prisma.isConnected) {
      return FALLBACK_LAB.map((t, i) => ({
        id: `lab-${i}`,
        name: t.name,
        category: null,
        unit: t.unit,
        range: t.range,
      }));
    }

    const rows = await this.prisma.testTypes.findMany({
      where: { is_active: true },
      include: {
        laboratory_test_parameters_test_type_id: {
          where: { is_active: true },
          orderBy: { display_order: 'asc' },
          take: 1,
        },
      },
      orderBy: { test_name: 'asc' },
      take: 200,
    });

    return rows.map((row) => {
      const param = row.laboratory_test_parameters_test_type_id[0];
      return {
        id: row.id,
        name: row.test_name,
        category: row.category,
        unit: param?.unit_of_measurement ?? '',
        range: param?.normal_reference_range ?? '',
      };
    });
  }

  async listStaff(): Promise<CatalogStaff[]> {
    if (!this.prisma.isConnected) return [];

    const rows = await this.prisma.staffProfiles.findMany({
      where: { deleted_at: null },
      include: {
        user: {
          include: {
            core_profiles_user_id: true,
            core_user_roles_user_id: { include: { role: true } },
          },
        },
      },
      orderBy: { employee_id: 'asc' },
      take: 200,
    });

    const deptIds = [
      ...new Set(
        rows.map((r) => r.department_id).filter((id): id is string => Boolean(id)),
      ),
    ];
    const depts = deptIds.length
      ? await this.prisma.departments.findMany({
          where: { id: { in: deptIds } },
        })
      : [];
    const deptName = Object.fromEntries(depts.map((d) => [d.id, d.name]));

    return rows.map((row) => {
      const profile = row.user.core_profiles_user_id[0];
      const role = row.user.core_user_roles_user_id[0]?.role.name ?? 'STAFF';
      const name = profile
        ? `${profile.first_name} ${profile.last_name}`
        : row.user.email;
      return {
        id: row.id,
        userId: row.user_id,
        name:
          (role === 'DOCTOR' || role === 'RADIOLOGIST') &&
          !name.startsWith('Dr')
            ? `Dr. ${name}`
            : name,
        employeeId: row.employee_id,
        role,
        department: row.department_id
          ? deptName[row.department_id] ?? '—'
          : row.position ?? '—',
        status: row.is_active ? 'Active' : 'On Leave',
      };
    });
  }

  async listInsurers(): Promise<CatalogInsurer[]> {
    if (!this.prisma.isConnected) {
      return [
        { id: 'ins1', name: 'SHA (Social Health Authority)', code: 'SHA', integration: 'SHA' },
        { id: 'ins2', name: 'Jubilee Health', code: 'JUBILEE', integration: 'SLADE' },
        { id: 'ins3', name: 'AAR Insurance', code: 'AAR', integration: 'SLADE' },
        { id: 'ins4', name: 'Britam Health', code: 'BRITAM', integration: 'MANUAL' },
        { id: 'ins5', name: 'Madison Insurance', code: 'MADISON', integration: 'MANUAL' },
      ];
    }

    const rows = await this.prisma.insuranceProviders.findMany({
      where: { is_active: true },
      orderBy: { name: 'asc' },
      take: 100,
    });

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      integration: insurerIntegration(r.code, r.claim_submission_method),
    }));
  }

  async listAppointments() {
    if (!this.prisma.isConnected) return [];
    const rows = await this.prisma.appointments.findMany({
      where: { deleted_at: null },
      include: {
        patient: {
          include: { user: { include: { core_profiles_user_id: true } } },
        },
        doctor: {
          include: { user: { include: { core_profiles_user_id: true } } },
        },
      },
      orderBy: [{ appointment_date: 'asc' }, { start_time: 'asc' }],
      take: 50,
    });

    const statusMap: Record<string, string> = {
      SCHEDULED: 'Scheduled',
      CONFIRMED: 'Scheduled',
      ARRIVED: 'Checked In',
      COMPLETED: 'Completed',
      CANCELLED: 'Cancelled',
      NO_SHOW: 'Cancelled',
    };
    const typeMap: Record<string, string> = {
      NEW_PATIENT: 'New Patient',
      FOLLOW_UP: 'Follow-up',
      CONSULTATION: 'Consultation',
      EMERGENCY: 'Emergency',
    };

    return rows.map((r) => {
      const pp = r.patient.user.core_profiles_user_id[0];
      const dp = r.doctor.user.core_profiles_user_id[0];
      const doctorName = dp
        ? `Dr. ${dp.first_name} ${dp.last_name}`
        : r.doctor.user.email;
      const start = r.start_time;
      const time = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
      const gender = mapGender(pp?.gender);
      return {
        id: r.id,
        patientId: r.patient_id,
        patient: pp ? `${pp.first_name} ${pp.last_name}` : r.patient.patient_number,
        mrn: r.patient.patient_number,
        phone: pp?.phone || '',
        age: ageFromDob(pp?.date_of_birth ?? null),
        gender: gender === 'Other' ? 'Female' : gender,
        doctor: doctorName,
        department: r.doctor.specialization || 'General',
        date: r.appointment_date.toISOString().slice(0, 10),
        time,
        type: typeMap[r.appointment_type || ''] || r.appointment_type || 'Consultation',
        status: statusMap[r.status] || r.status,
        rawStatus: r.status,
      };
    });
  }

  async listInventory() {
    const meds = await this.listMedications();
    const colors = ['#2d545b', '#4a929b', '#92c5c9', '#bcdcde', '#dcedee'];
    const byCat = new Map<string, { count: number; qty: number }>();
    for (const m of meds) {
      const cur = byCat.get(m.category) || { count: 0, qty: 0 };
      cur.count += 1;
      cur.qty += m.stock;
      byCat.set(m.category, cur);
    }
    const totalQty = meds.reduce((s, m) => s + m.stock, 0) || 1;
    const categories = [...byCat.entries()].map(([name, v], i) => ({
      name,
      count: v.count,
      pct: Math.round((v.qty / totalQty) * 100),
      color: colors[i % colors.length],
    }));

    const items = meds.map((m) => {
      const pct = Math.min(100, Math.round((m.stock / Math.max(m.reorderLevel * 2, 1)) * 100));
      const status =
        m.stock <= 0 ? 'Out of Stock' : m.stock < m.reorderLevel ? 'Low' : 'Available';
      return {
        id: m.id,
        name: m.name,
        sku: m.id.slice(0, 8).toUpperCase(),
        category: m.category,
        quantity: m.stock,
        unit: m.unit,
        pct,
        expiry: m.expiry,
        status,
      };
    });

    return {
      items,
      categories,
      stats: {
        totalItems: items.length,
        lowStock: items.filter((i) => i.status === 'Low').length,
        outOfStock: items.filter((i) => i.status === 'Out of Stock').length,
        totalUnits: meds.reduce((s, m) => s + m.stock, 0),
      },
      activity: await this.listStockActivity(),
    };
  }

  private async listStockActivity() {
    if (!this.prisma.isConnected) return [];
    const rows = await this.prisma.stockMovements.findMany({
      orderBy: { created_at: 'desc' },
      take: 8,
      include: { batch: { include: { medication: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      title: `${r.movement_type} · ${r.batch.medication.medication_name}`,
      meta: `${r.quantity_change} units`,
      time: r.created_at.toISOString().slice(0, 16).replace('T', ' '),
    }));
  }

  async listWards() {
    if (!this.prisma.isConnected) return [];
    const wards = await this.prisma.wards.findMany({
      where: { is_active: true },
      include: { inpatient_beds_ward_id: true },
      orderBy: { name: 'asc' },
      take: 100,
    });
    return wards.map((w) => ({
      id: w.id,
      name: w.name,
      totalBeds: w.inpatient_beds_ward_id.length || w.capacity,
      occupied: w.inpatient_beds_ward_id.filter((b) => b.status === 'OCCUPIED')
        .length,
    }));
  }

  async listRadiologyQueue() {
    if (!this.prisma.isConnected) return [];
    const rows = await this.prisma.radiologyRequests.findMany({
      include: {
        patient: {
          include: { user: { include: { core_profiles_user_id: true } } },
        },
        scan_type: true,
        requesting_doctor: {
          include: { user: { include: { core_profiles_user_id: true } } },
        },
      },
      orderBy: { created_at: 'desc' },
      take: 40,
    });
    const statusMap: Record<string, string> = {
      PENDING: 'Scheduled',
      SCHEDULED: 'Scheduled',
      IN_PROGRESS: 'In Progress',
      COMPLETED: 'Completed',
      CANCELLED: 'Cancelled',
    };
    return rows.map((r) => {
      const pp = r.patient.user.core_profiles_user_id[0];
      const dp = r.requesting_doctor?.user.core_profiles_user_id[0];
      return {
        id: r.id,
        patient: pp
          ? `${pp.first_name} ${pp.last_name}`
          : r.patient.patient_number,
        scan: r.scan_type.scan_type,
        requestedBy: dp
          ? `Dr. ${dp.first_name} ${dp.last_name}`
          : 'Clinical team',
        scheduled: r.created_at.toISOString().slice(0, 16).replace('T', ' '),
        status: statusMap[r.status] || r.status,
        rawStatus: r.status,
      };
    });
  }

  async listInvoices() {
    if (!this.prisma.isConnected) return [];
    const rows = await this.prisma.invoices.findMany({
      where: { deleted_at: null, is_voided: false },
      include: {
        patient: {
          include: { user: { include: { core_profiles_user_id: true } } },
        },
      },
      orderBy: { invoice_date: 'desc' },
      take: 40,
    });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return rows.map((r) => {
      const pp = r.patient.user.core_profiles_user_id[0];
      let status = 'Pending';
      if (r.status === 'PAID') status = 'Paid';
      else if (r.status === 'PARTIALLY_PAID') status = 'Partial';
      else if (r.due_date < today && (r.status === 'ISSUED' || r.status === 'DRAFT'))
        status = 'Overdue';
      else if (r.status === 'ISSUED' || r.status === 'DRAFT') status = 'Pending';
      return {
        id: r.id,
        number: r.invoice_number,
        patient: pp
          ? `${pp.first_name} ${pp.last_name}`
          : r.patient.patient_number,
        amount: Number(r.total_amount),
        issued: r.invoice_date.toISOString().slice(0, 10),
        due: r.due_date.toISOString().slice(0, 10),
        status,
      };
    });
  }

  async listConversations() {
    if (!this.prisma.isConnected) return [];
    const rows = await this.prisma.conversations.findMany({
      where: { deleted_at: null },
      orderBy: { updated_at: 'desc' },
      take: 30,
    });
    return rows.map((r) => {
      const meta = (r.metadata ?? {}) as { preview?: string; unread?: number };
      return {
        id: r.id,
        with: r.name || 'Conversation',
        preview: meta.preview || 'No messages yet',
        time: r.updated_at.toISOString().slice(11, 16),
        unread: meta.unread ?? 0,
      };
    });
  }

  async dashboardSummary() {
    if (!this.prisma.isConnected) {
      return {
        patients: 0,
        appointmentsToday: 0,
        activeVisits: 0,
        doctors: 0,
        invoicesOpen: 0,
        deptDistribution: [],
        recentAppointments: [],
      };
    }
    const todayStr = new Date().toISOString().slice(0, 10);
    const today = new Date(`${todayStr}T00:00:00.000Z`);
    const [
      patients,
      appointmentsToday,
      activeVisits,
      doctors,
      invoicesOpen,
      depts,
      recentAppointments,
    ] = await Promise.all([
      this.prisma.patients.count({ where: { deleted_at: null } }),
      this.prisma.appointments.count({
        where: { appointment_date: today, deleted_at: null },
      }),
      this.prisma.outpatientVisits.count({
        where: { stage: { not: 'COMPLETED' } },
      }),
      this.listDoctors().then((d) => d.length),
      this.prisma.invoices.count({
        where: {
          deleted_at: null,
          status: { in: ['ISSUED', 'PARTIALLY_PAID', 'DRAFT'] },
        },
      }),
      this.listDepartments(),
      this.listAppointments(),
    ]);

    const colors = [
      '#f02878',
      '#1aa8b0',
      '#40c0b0',
      '#d91a66',
      '#0d8a96',
      '#ff85b3',
    ];

    // Real department load = appointment counts by doctor specialty
    const apptRows = await this.prisma.appointments.findMany({
      where: { deleted_at: null },
      include: { doctor: true },
      take: 500,
    });
    const byDept = new Map<string, number>();
    for (const a of apptRows) {
      const key = a.doctor.specialization || 'General';
      byDept.set(key, (byDept.get(key) || 0) + 1);
    }
    const deptDistribution = [...byDept.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, value], i) => ({
        name,
        value,
        color: colors[i % colors.length],
      }));
    if (deptDistribution.length === 0) {
      for (const d of depts.slice(0, 6)) {
        deptDistribution.push({
          name: d.name,
          value: 0,
          color: colors[deptDistribution.length % colors.length],
        });
      }
    }

    const patientProfiles = await this.prisma.patients.findMany({
      where: { deleted_at: null },
      include: { user: { include: { core_profiles_user_id: true } } },
      take: 500,
    });
    const profiles = patientProfiles.map(
      (p) => p.user.core_profiles_user_id[0]?.date_of_birth ?? null,
    );
    const ageBuckets = [
      { name: '0–12', value: 0 },
      { name: '13–19', value: 0 },
      { name: '20–39', value: 0 },
      { name: '40–59', value: 0 },
      { name: '60+', value: 0 },
    ];
    const now = new Date();
    for (const dob of profiles) {
      if (!dob) continue;
      const age = Math.floor(
        (now.getTime() - dob.getTime()) / (365.25 * 86400_000),
      );
      if (age <= 12) ageBuckets[0].value += 1;
      else if (age <= 19) ageBuckets[1].value += 1;
      else if (age <= 39) ageBuckets[2].value += 1;
      else if (age <= 59) ageBuckets[3].value += 1;
      else ageBuckets[4].value += 1;
    }

    const paidInvoices = await this.prisma.invoices.findMany({
      where: { deleted_at: null, is_voided: false },
      orderBy: { invoice_date: 'asc' },
      take: 90,
      select: { invoice_date: true, total_amount: true, status: true },
    });
    const revenueByDay = new Map<string, number>();
    for (const inv of paidInvoices) {
      const day = inv.invoice_date.toISOString().slice(0, 10);
      revenueByDay.set(
        day,
        (revenueByDay.get(day) || 0) + Number(inv.total_amount),
      );
    }
    const revenueSeries = [...revenueByDay.entries()].map(([date, amount]) => ({
      date,
      amount,
    }));

    const movements = await this.prisma.stockMovements.findMany({
      orderBy: { created_at: 'desc' },
      take: 14,
      include: { batch: { include: { medication: true } } },
    });
    const inventoryUsage = movements
      .filter((m) => m.movement_type === 'DISPENSE')
      .reduce(
        (acc, m) => {
          const day = m.created_at.toISOString().slice(0, 10);
          acc[day] = (acc[day] || 0) + Math.abs(Number(m.quantity_change));
          return acc;
        },
        {} as Record<string, number>,
      );
    const inventoryUsageSeries = Object.entries(inventoryUsage).map(
      ([date, units]) => ({ date, units }),
    );

    const reports = [
      invoicesOpen > 0
        ? {
            id: 'inv-open',
            title: `${invoicesOpen} invoices awaiting settlement`,
            source: 'Billing',
            time: 'live',
          }
        : null,
      activeVisits > 0
        ? {
            id: 'visits',
            title: `${activeVisits} active outpatient visits`,
            source: 'Outpatient',
            time: 'live',
          }
        : null,
      appointmentsToday > 0
        ? {
            id: 'appts',
            title: `${appointmentsToday} appointments scheduled today`,
            source: 'Scheduling',
            time: 'live',
          }
        : null,
    ].filter(Boolean);

    return {
      patients,
      appointmentsToday,
      activeVisits,
      doctors,
      invoicesOpen,
      deptDistribution,
      recentAppointments: recentAppointments.slice(0, 6),
      ageStages: ageBuckets,
      revenueSeries,
      inventoryUsageSeries,
      reports,
    };
  }
}
