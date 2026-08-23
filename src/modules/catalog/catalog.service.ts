import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import type { AuthUserPublic } from '../auth/auth.types';
import {
  DOCTORS as FALLBACK_DOCTORS,
  LAB_TEST_CATALOG as FALLBACK_LAB,
  MEDICATIONS as FALLBACK_MEDS,
  PATIENTS as FALLBACK_PATIENTS,
} from './catalog.data';
import {
  clinicalServiceKind,
  isSystemFeeCode,
} from './clinical-service.util';
import type {
  CatalogDepartment,
  CatalogDoctor,
  CatalogInsurer,
  CatalogClinicalService,
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

/** Hide synthetic / missing patient emails from API consumers. */
function displayEmail(email: string | null | undefined): string {
  if (!email?.trim()) return '';
  if (email.toLowerCase().endsWith('@patient.nyalife.health')) return '';
  return email.trim();
}

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async listPatients(options?: {
    page?: number;
    limit?: number;
    search?: string;
    gender?: string;
    status?: string;
  }): Promise<{
    items: CatalogPatient[];
    total: number;
    page: number;
    limit: number;
  }> {
    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
    const page = Math.max(options?.page ?? 1, 1);
    const skip = (page - 1) * limit;

    if (!this.prisma.isConnected) {
      let items = FALLBACK_PATIENTS.map((p) => ({ ...p }));
      const q = options?.search?.trim().toLowerCase();
      if (q) {
        items = items.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.mrn.toLowerCase().includes(q) ||
            p.phone.toLowerCase().includes(q),
        );
      }
      if (options?.gender) {
        const g = options.gender.toLowerCase();
        items = items.filter((p) => p.gender.toLowerCase() === g);
      }
      const total = items.length;
      return { items: items.slice(skip, skip + limit), total, page, limit };
    }

    const q = options?.search?.trim();
    let genderDb: string | undefined;
    if (options?.gender) {
      const g = options.gender.toUpperCase();
      if (g === 'MALE' || g === 'FEMALE' || g === 'OTHER') genderDb = g;
      else if (options.gender === 'Male') genderDb = 'MALE';
      else if (options.gender === 'Female') genderDb = 'FEMALE';
      else if (options.gender === 'Other') genderDb = 'OTHER';
    }

    const status = options?.status?.toUpperCase();
    const profileSearch = q
      ? {
          some: {
            OR: [
              { first_name: { contains: q, mode: 'insensitive' as const } },
              { last_name: { contains: q, mode: 'insensitive' as const } },
              { phone: { contains: q, mode: 'insensitive' as const } },
            ],
          },
        }
      : undefined;

    const where = {
      deleted_at: null as null,
      ...(genderDb
        ? { user: { core_profiles_user_id: { some: { gender: genderDb } } } }
        : {}),
      ...(status === 'ADMITTED'
        ? { inpatient_admissions_patient_id: { some: { status: 'ADMITTED' } } }
        : status === 'ACTIVE'
          ? { inpatient_admissions_patient_id: { none: { status: 'ADMITTED' } } }
          : {}),
      ...(q
        ? {
            OR: [
              { patient_number: { contains: q, mode: 'insensitive' as const } },
              { user: { email: { contains: q, mode: 'insensitive' as const } } },
              { user: { core_profiles_user_id: profileSearch! } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.patients.findMany({
        where,
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
      }),
      this.prisma.patients.count({ where }),
    ]);

    const items = rows.map((row) => {
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
        status: admitted ? ('Admitted' as const) : ('Active' as const),
      };
    });

    return { items, total, page, limit };
  }

  async patientSummary(): Promise<{
    total: number;
    female: number;
    male: number;
    other: number;
    recent7d: number;
  }> {
    if (!this.prisma.isConnected) {
      return { total: 0, female: 0, male: 0, other: 0, recent7d: 0 };
    }

    const since = new Date();
    since.setDate(since.getDate() - 7);

    const [total, female, male, other, recent7d] = await Promise.all([
      this.prisma.patients.count({ where: { deleted_at: null } }),
      this.prisma.patients.count({
        where: {
          deleted_at: null,
          user: { core_profiles_user_id: { some: { gender: 'FEMALE' } } },
        },
      }),
      this.prisma.patients.count({
        where: {
          deleted_at: null,
          user: { core_profiles_user_id: { some: { gender: 'MALE' } } },
        },
      }),
      this.prisma.patients.count({
        where: {
          deleted_at: null,
          user: { core_profiles_user_id: { some: { gender: 'OTHER' } } },
        },
      }),
      this.prisma.patients.count({
        where: { deleted_at: null, created_at: { gte: since } },
      }),
    ]);

    return { total, female, male, other, recent7d };
  }

  async getPatientDetail(id: string) {
    if (!this.prisma.isConnected) {
      throw new NotFoundException('Patient not found');
    }

    const row = await this.prisma.patients.findFirst({
      where: { id, deleted_at: null },
      include: {
        user: { include: { core_profiles_user_id: true } },
        patients_emergency_contacts_patient_id: {
          orderBy: [{ is_primary: 'desc' }, { created_at: 'asc' }],
          take: 3,
        },
        clinical_appointments_patient_id: {
          where: { deleted_at: null },
          orderBy: [{ appointment_date: 'desc' }, { start_time: 'desc' }],
          take: 50,
          include: {
            doctor: {
              include: { user: { include: { core_profiles_user_id: true } } },
            },
          },
        },
        clinical_consultations_patient_id: {
          where: { deleted_at: null },
          orderBy: { consultation_date: 'desc' },
          take: 50,
          include: {
            doctor: {
              include: { user: { include: { core_profiles_user_id: true } } },
            },
            clinical_diagnoses_consultation_id: true,
          },
        },
        clinical_outpatient_visits_patient_id: {
          orderBy: { checked_in_at: 'desc' },
          take: 50,
        },
        clinical_vital_signs_patient_id: {
          where: { is_voided: false },
          orderBy: { measured_at: 'desc' },
          take: 50,
        },
        clinical_follow_ups_patient_id: {
          where: { status: 'SCHEDULED' },
          orderBy: { follow_up_date: 'asc' },
          take: 50,
          include: {
            consultation: {
              include: {
                doctor: {
                  include: {
                    user: { include: { core_profiles_user_id: true } },
                  },
                },
              },
            },
          },
        },
        patients_insurance_policies_patient_id: {
          where: { is_active: true },
          orderBy: { created_at: 'desc' },
          take: 5,
          include: { provider: true },
        },
        _count: {
          select: {
            pharmacy_prescriptions_patient_id: {
              where: { deleted_at: null, is_voided: false },
            },
            clinical_vital_signs_patient_id: {
              where: { is_voided: false },
            },
            clinical_consultations_patient_id: {
              where: { deleted_at: null },
            },
          },
        },
      },
    });

    if (!row) {
      throw new NotFoundException('Patient not found');
    }

    const profile = row.user.core_profiles_user_id[0];
    const name = profile
      ? `${profile.first_name} ${profile.last_name}`
      : row.patient_number;
    const gender = mapGender(profile?.gender);
    const dob = profile?.date_of_birth
      ? profile.date_of_birth.toISOString().slice(0, 10)
      : '';
    const created = row.created_at;
    const ymd = created.toISOString().slice(0, 10).replace(/-/g, '');
    const seq = row.patient_number.replace(/\D/g, '').slice(-4).padStart(4, '0');
    const referenceCode = `PAT-${ymd}-${seq}`;

    const statusMap: Record<string, string> = {
      SCHEDULED: 'Pending',
      CONFIRMED: 'Pending',
      ARRIVED: 'Checked In',
      COMPLETED: 'Completed',
      CANCELLED: 'Cancelled',
      NO_SHOW: 'Cancelled',
    };

    const emergency = row.patients_emergency_contacts_patient_id[0];

    const appointments = row.clinical_appointments_patient_id.map((a) => {
      const dp = a.doctor.user.core_profiles_user_id[0];
      const doctorName = dp
        ? `Dr. ${dp.first_name} ${dp.last_name}`
        : a.doctor.user.email;
      const start = a.start_time;
      const time = `${String(start.getHours()).padStart(2, '0')}:${String(
        start.getMinutes(),
      ).padStart(2, '0')}`;
      return {
        id: a.id,
        kind: 'appointment' as const,
        appointmentNumber: `APT-${a.id.replace(/-/g, '').slice(0, 6).toUpperCase()}`,
        date: a.appointment_date.toISOString().slice(0, 10),
        time,
        provider: doctorName,
        status: statusMap[a.status] || a.status,
        rawStatus: a.status,
        reason: a.reason || '',
      };
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const scheduledFollowUps = row.clinical_follow_ups_patient_id
      .filter((f) => {
        const d = new Date(f.follow_up_date);
        d.setHours(0, 0, 0, 0);
        return d >= today;
      })
      .map((f) => {
        const dp = f.consultation.doctor.user.core_profiles_user_id[0];
        const doctorName = dp
          ? `Dr. ${dp.first_name} ${dp.last_name}`
          : f.consultation.doctor.user.email;
        return {
          id: f.id,
          kind: 'follow-up' as const,
          followUpType: f.follow_up_type || 'Follow-up',
          date: f.follow_up_date.toISOString().slice(0, 10),
          time: '',
          provider: doctorName,
          status: f.status,
          reason: f.reason,
          consultationId: f.consultation_id,
        };
      });

    const consultations = row.clinical_consultations_patient_id.map((c) => {
      const dp = c.doctor.user.core_profiles_user_id[0];
      const physician = dp
        ? `Dr. ${dp.first_name} ${dp.last_name}`
        : c.doctor.user.email;
      const diagnoses = c.clinical_diagnoses_consultation_id.map((d) => ({
        id: d.id,
        type: d.diagnosis_type,
        code: d.icd10_code || null,
        description: d.description,
      }));
      const primaryDx =
        diagnoses.find((d) => d.type === 'PRIMARY') || diagnoses[0];
      return {
        id: c.id,
        date: c.consultation_date.toISOString(),
        physician,
        doctorId: c.doctor_id,
        diagnosis: primaryDx?.description || c.chief_complaint || '—',
        chiefComplaint: c.chief_complaint || '',
        diagnoses,
        status: c.status,
        notes: c.notes || '',
      };
    });

    type VitalsHistoryItem = {
      id: string;
      measuredAt: string;
      bloodPressure: string;
      heartRate: number | null;
      respiratoryRate: number | null;
      temperature: number | null;
      weight: number | null;
      height: number | null;
      bmi: number | null;
      oxygenSaturation: number | null;
      painLevel: number | null;
      notes: string;
      urgencyLevel?: string;
      source: 'VITAL_SIGNS' | 'TRIAGE';
      recordedBy: string;
    };

    const tableVitals: VitalsHistoryItem[] =
      row.clinical_vital_signs_patient_id.map((v) => ({
        id: v.id,
        measuredAt: v.measured_at.toISOString(),
        bloodPressure: v.blood_pressure || '',
        heartRate: v.heart_rate,
        respiratoryRate: v.respiratory_rate,
        temperature: v.temperature != null ? Number(v.temperature) : null,
        weight: v.weight != null ? Number(v.weight) : null,
        height: v.height != null ? Number(v.height) : null,
        bmi: v.bmi != null ? Number(v.bmi) : null,
        oxygenSaturation: v.oxygen_saturation,
        painLevel: v.pain_level,
        notes: v.notes || '',
        urgencyLevel:
          (v as { urgency_level?: string }).urgency_level === 'EMERGENCY'
            ? 'EMERGENCY'
            : 'NORMAL',
        source: 'VITAL_SIGNS' as const,
        recordedBy: v.recorded_by,
      }));

    // Also pull walk-in / denormalized visits that may lack patient_id FK
    const orphanVisits = await this.prisma.outpatientVisits.findMany({
      where: {
        patient_id: null,
        mrn: row.patient_number,
      },
      orderBy: { checked_in_at: 'desc' },
      take: 50,
    });
    const linkedVisits = row.clinical_outpatient_visits_patient_id ?? [];
    const seenVisitIds = new Set(linkedVisits.map((v) => v.id));
    const allOpVisits = [
      ...linkedVisits,
      ...orphanVisits.filter((v) => !seenVisitIds.has(v.id)),
    ];

    const payloadVitals: VitalsHistoryItem[] = [];
    for (const visit of allOpVisits) {
      const payload = (visit.payload ?? {}) as {
        vitals?: {
          temperature?: string;
          systolic?: string;
          diastolic?: string;
          pulse?: string;
          respRate?: string;
          spo2?: string;
          weightKg?: string;
          heightCm?: string;
          bmi?: string;
          painScore?: string;
          bloodGlucose?: string;
          recordedAt?: string;
          recordedBy?: string;
        };
        nurseName?: string;
      };
      const v = payload.vitals;
      if (!v) continue;
      const measuredAt =
        v.recordedAt ||
        visit.triage_completed_at?.toISOString() ||
        visit.checked_in_at.toISOString();
      const sys = v.systolic?.trim();
      const dia = v.diastolic?.trim();
      const bp =
        sys && dia ? `${sys}/${dia}` : sys || dia || '';
      const pulse = v.pulse ? Number(v.pulse) : NaN;
      const rr = v.respRate ? Number(v.respRate) : NaN;
      const spo2 = v.spo2 ? Number(v.spo2) : NaN;
      const temp = v.temperature ? Number(v.temperature) : NaN;
      const weight = v.weightKg ? Number(v.weightKg) : NaN;
      const height = v.heightCm ? Number(v.heightCm) : NaN;
      const bmi = v.bmi ? Number(v.bmi) : NaN;
      const pain = v.painScore ? Number(v.painScore) : NaN;
      payloadVitals.push({
        id: `visit-vitals-${visit.id}`,
        measuredAt,
        bloodPressure: bp,
        heartRate: Number.isFinite(pulse) ? pulse : null,
        respiratoryRate: Number.isFinite(rr) ? rr : null,
        temperature: Number.isFinite(temp) ? temp : null,
        weight: Number.isFinite(weight) ? weight : null,
        height: Number.isFinite(height) ? height : null,
        bmi: Number.isFinite(bmi) ? bmi : null,
        oxygenSaturation: Number.isFinite(spo2) ? spo2 : null,
        painLevel: Number.isFinite(pain) ? pain : null,
        notes: v.bloodGlucose
          ? `Blood glucose: ${v.bloodGlucose}`
          : '',
        urgencyLevel: 'NORMAL',
        source: 'TRIAGE',
        recordedBy: v.recordedBy || payload.nurseName || '—',
      });
    }

    // Prefer table rows when timestamps collide with triage payload (same measurement).
    const vitalsHistory = [...tableVitals, ...payloadVitals]
      .filter((item, index, arr) => {
        if (item.source === 'VITAL_SIGNS') return true;
        const minute = item.measuredAt.slice(0, 16);
        const dup = arr.some(
          (other, j) =>
            j !== index &&
            other.source === 'VITAL_SIGNS' &&
            other.measuredAt.slice(0, 16) === minute &&
            other.bloodPressure === item.bloodPressure &&
            other.heartRate === item.heartRate,
        );
        return !dup;
      })
      .sort((a, b) => (a.measuredAt < b.measuredAt ? 1 : -1));

    const latestVitalsRow = vitalsHistory[0] ?? null;

    const visitTimeline = [
      ...appointments.map((a) => ({
        id: a.id,
        kind: 'appointment' as const,
        label: a.appointmentNumber,
        date: a.date,
        time: a.time,
        when: `${a.date}T${a.time}:00`,
        provider: a.provider,
        status: a.status,
        summary: a.reason || '',
        href: `/appointments/${a.id}`,
      })),
      ...allOpVisits.map((v) => {
        const payload = (v.payload ?? {}) as {
          appointmentId?: string;
          doctorName?: string;
          diagnosis?: string;
          reasonForVisit?: string;
        };
        const apptId = payload.appointmentId;
        const when = v.checked_in_at.toISOString();
        return {
          id: v.id,
          kind: 'visit' as const,
          label: `Visit · ${v.stage.replace(/_/g, ' ')}`,
          date: when.slice(0, 10),
          time: when.slice(11, 16),
          when,
          provider: payload.doctorName || '—',
          status: v.stage,
          summary:
            v.reason_for_visit ||
            payload.reasonForVisit ||
            payload.diagnosis ||
            '',
          href: apptId ? `/appointments/${apptId}` : `/consultations/${v.id}`,
          appointmentId: apptId || null,
        };
      }),
      ...consultations.map((c) => ({
        id: c.id,
        kind: 'consultation' as const,
        label: 'Consultation',
        date: c.date.slice(0, 10),
        time: new Date(c.date).toISOString().slice(11, 16),
        when: c.date,
        provider: c.physician,
        status: c.status,
        summary: c.diagnosis,
        href: `/patients/${row.id}?consultationId=${c.id}`,
      })),
    ].sort((a, b) => (a.when < b.when ? 1 : -1));

    const scheduledAppointments = appointments.filter(
      (a) => a.rawStatus === 'SCHEDULED' || a.rawStatus === 'CONFIRMED',
    );
    const scheduledVisits =
      scheduledAppointments.length + scheduledFollowUps.length;

    const insurance = row.patients_insurance_policies_patient_id.map((p) => ({
      id: p.id,
      providerName: p.provider?.name || 'Insurance',
      memberId: p.policy_number || '',
      policyNumber: p.policy_number || '',
      status: p.is_active ? 'ACTIVE' : 'INACTIVE',
    }));

    return {
      id: row.id,
      mrn: row.patient_number,
      referenceCode,
      name,
      firstName: profile?.first_name || '',
      lastName: profile?.last_name || '',
      age: ageFromDob(profile?.date_of_birth ?? null),
      gender: gender === 'Other' ? 'Other' : gender,
      phone: profile?.phone || '',
      email: displayEmail(row.user.email),
      address: profile?.address || '',
      city: profile?.city || '',
      country: profile?.country || '',
      postalCode: profile?.postal_code || '',
      dateOfBirth: dob,
      bloodGroup: row.blood_group || '',
      occupation: row.occupation || '',
      maritalStatus: row.marital_status || '',
      allergies: row.allergies || '',
      chronicDiseases: row.chronic_diseases || '',
      registeredAt: row.created_at.toISOString(),
      emergencyContact: emergency
        ? {
            name: emergency.name,
            phone: emergency.phone,
            relationship: emergency.relationship || 'Next of kin',
          }
        : null,
      insurance,
      physical: {
        height: latestVitalsRow?.height ?? null,
        weight: latestVitalsRow?.weight ?? null,
      },
      counts: {
        scheduledVisits,
        consultations: row._count.clinical_consultations_patient_id,
        vitals: vitalsHistory.length,
        prescriptions: row._count.pharmacy_prescriptions_patient_id,
        encounters: visitTimeline.length,
      },
      latestVitals: latestVitalsRow
        ? {
            measuredAt: latestVitalsRow.measuredAt,
            bloodPressure: latestVitalsRow.bloodPressure,
            heartRate: latestVitalsRow.heartRate,
            temperature: latestVitalsRow.temperature,
            weight: latestVitalsRow.weight,
            height: latestVitalsRow.height,
            oxygenSaturation: latestVitalsRow.oxygenSaturation,
            respiratoryRate: latestVitalsRow.respiratoryRate,
            bmi: latestVitalsRow.bmi,
            painLevel: latestVitalsRow.painLevel,
            source: latestVitalsRow.source,
          }
        : null,
      appointments,
      scheduledAppointments,
      scheduledFollowUps,
      consultations,
      vitalsHistory,
      visitTimeline,
    };
  }

  async listDoctors(options?: {
    page?: number;
    limit?: number;
    search?: string;
    departmentId?: string;
  }): Promise<{
    items: CatalogDoctor[];
    total: number;
    page: number;
    limit: number;
  }> {
    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
    const page = Math.max(options?.page ?? 1, 1);
    const skip = (page - 1) * limit;

    if (!this.prisma.isConnected) {
      let items = FALLBACK_DOCTORS.map((d) => ({ ...d, userId: d.id }));
      const q = options?.search?.trim().toLowerCase();
      if (q) {
        items = items.filter(
          (d) =>
            d.name.toLowerCase().includes(q) ||
            d.specialty.toLowerCase().includes(q),
        );
      }
      const total = items.length;
      return { items: items.slice(skip, skip + limit), total, page, limit };
    }

    const q = options?.search?.trim();
    const where = {
      deleted_at: null as null,
      is_active: true,
      ...(options?.departmentId ? { department_id: options.departmentId } : {}),
      user: {
        deleted_at: null,
        is_active: true,
        core_user_roles_user_id: {
          some: { role: { name: { in: ['DOCTOR', 'RADIOLOGIST'] } } },
        },
      },
      ...(q
        ? {
            OR: [
              { specialization: { contains: q, mode: 'insensitive' as const } },
              { position: { contains: q, mode: 'insensitive' as const } },
              { user: { email: { contains: q, mode: 'insensitive' as const } } },
              {
                user: {
                  core_profiles_user_id: {
                    some: {
                      OR: [
                        { first_name: { contains: q, mode: 'insensitive' as const } },
                        { last_name: { contains: q, mode: 'insensitive' as const } },
                        { phone: { contains: q, mode: 'insensitive' as const } },
                      ],
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.staffProfiles.findMany({
        where,
        include: {
          user: {
            include: {
              core_profiles_user_id: true,
              core_user_roles_user_id: { include: { role: true } },
            },
          },
        },
        orderBy: { employee_id: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.staffProfiles.count({ where }),
    ]);

    const items = rows.map((row) => {
      const profile = row.user.core_profiles_user_id[0];
      const role = row.user.core_user_roles_user_id[0]?.role.name;
      const first = profile?.first_name ?? '';
      const last = profile?.last_name ?? '';
      const titled =
        first && !first.startsWith('Dr')
          ? `Dr. ${first} ${last}`.trim()
          : `${first} ${last}`.trim() || row.user.email || 'Doctor';
      return {
        id: row.id,
        userId: row.user_id,
        name: titled,
        specialty: row.specialization || row.position || role || 'General',
        hours: 'Mon – Fri (08:00 – 17:00)',
        available: row.is_active,
        phone: profile?.phone ?? '',
        email: displayEmail(row.user.email),
      };
    });

    return { items, total, page, limit };
  }

  async listDepartments(options?: {
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<{
    items: CatalogDepartment[];
    total: number;
    page: number;
    limit: number;
  }> {
    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
    const page = Math.max(options?.page ?? 1, 1);
    const skip = (page - 1) * limit;

    if (!this.prisma.isConnected) {
      return { items: [], total: 0, page, limit };
    }

    const q = options?.search?.trim();
    const where = {
      is_active: true,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' as const } },
              { code: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [depts, total] = await Promise.all([
      this.prisma.departments.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.departments.count({ where }),
    ]);

    const deptIds = depts.map((d) => d.id);
    const staff = deptIds.length
      ? await this.prisma.staffProfiles.findMany({
          where: { deleted_at: null, department_id: { in: deptIds } },
          include: {
            user: {
              include: {
                core_user_roles_user_id: { include: { role: true } },
              },
            },
          },
        })
      : [];

    const items = depts.map((d) => {
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

    return { items, total, page, limit };
  }

  async listMedications(options?: {
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<{
    items: CatalogMedication[];
    total: number;
    page: number;
    limit: number;
  }> {
    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
    const page = Math.max(options?.page ?? 1, 1);
    const skip = (page - 1) * limit;

    if (!this.prisma.isConnected) {
      let items = FALLBACK_MEDS.map((m) => ({ ...m, unit: 'units' }));
      const q = options?.search?.trim().toLowerCase();
      if (q) {
        items = items.filter(
          (m) =>
            m.name.toLowerCase().includes(q) ||
            m.category.toLowerCase().includes(q),
        );
      }
      const total = items.length;
      return { items: items.slice(skip, skip + limit), total, page, limit };
    }

    const q = options?.search?.trim();
    const where = {
      deleted_at: null,
      is_active: true,
      ...(q
        ? {
            OR: [
              { medication_name: { contains: q, mode: 'insensitive' as const } },
              { generic_name: { contains: q, mode: 'insensitive' as const } },
              {
                category: {
                  category_name: { contains: q, mode: 'insensitive' as const },
                },
              },
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
            orderBy: { expiry_date: 'asc' },
            take: 20,
          },
        },
        orderBy: { medication_name: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.medications.count({ where }),
    ]);

    const items = rows.map((row) => {
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

    return { items, total, page, limit };
  }

  private async fetchAllMedicationsForInventory(): Promise<CatalogMedication[]> {
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
        unit: row.units || param?.unit_of_measurement || '',
        range: row.normal_range || param?.normal_reference_range || '',
      };
    });
  }

  /**
   * Billable clinical services/procedures/surgeries for doctor order pickers.
   * Excludes OPD fee-schedule codes (CONSULT / LAB / MED / …).
   */
  async listClinicalServices(options?: {
    kind?: 'service' | 'surgery';
    search?: string;
  }): Promise<CatalogClinicalService[]> {
    if (!this.prisma.isConnected) return [];

    const q = options?.search?.trim();
    const rows = await this.prisma.services.findMany({
      where: {
        is_active: true,
        ...(q
          ? {
              OR: [
                { service_code: { contains: q, mode: 'insensitive' } },
                { service_name: { contains: q, mode: 'insensitive' } },
                { category: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ category: 'asc' }, { service_name: 'asc' }],
      take: 500,
    });

    return rows
      .filter((r) => !isSystemFeeCode(r.service_code))
      .map((r) => {
        const kind = clinicalServiceKind(r.category);
        return {
          id: r.id,
          code: r.service_code,
          name: r.service_name,
          category: r.category,
          description: r.description,
          standardPrice: r.standard_price.toString(),
          kind,
        };
      })
      .filter((r) => (options?.kind ? r.kind === options.kind : true));
  }

  async listStaff(options?: {
    page?: number;
    limit?: number;
    search?: string;
    role?: string;
    status?: string;
  }): Promise<{
    items: CatalogStaff[];
    total: number;
    page: number;
    limit: number;
  }> {
    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
    const page = Math.max(options?.page ?? 1, 1);
    const skip = (page - 1) * limit;

    if (!this.prisma.isConnected) {
      return { items: [], total: 0, page, limit };
    }

    const q = options?.search?.trim();
    const roleFilter = options?.role?.trim().toUpperCase();
    const activeOnly =
      options?.status === 'active' ||
      options?.status === 'Active' ||
      options?.status?.toUpperCase() === 'ACTIVE';

    const where = {
      deleted_at: null as null,
      ...(activeOnly ? { is_active: true } : {}),
      ...(roleFilter
        ? {
            user: {
              core_user_roles_user_id: {
                some: { role: { name: roleFilter } },
              },
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              { employee_id: { contains: q, mode: 'insensitive' as const } },
              { position: { contains: q, mode: 'insensitive' as const } },
              { user: { email: { contains: q, mode: 'insensitive' as const } } },
              {
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
              {
                user: {
                  core_user_roles_user_id: {
                    some: {
                      role: {
                        name: { contains: q, mode: 'insensitive' as const },
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
      this.prisma.staffProfiles.findMany({
        where,
        include: {
          user: {
            include: {
              core_profiles_user_id: true,
              core_user_roles_user_id: { include: { role: true } },
            },
          },
        },
        orderBy: { employee_id: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.staffProfiles.count({ where }),
    ]);

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

    const items = rows.map((row) => {
      const profile = row.user.core_profiles_user_id[0];
      const role = row.user.core_user_roles_user_id[0]?.role.name ?? 'STAFF';
      const name =
        (profile
          ? `${profile.first_name} ${profile.last_name}`
          : row.user.email) || 'Staff';
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
        status: (row.is_active ? 'Active' : 'On Leave') as CatalogStaff['status'],
      };
    });

    return { items, total, page, limit };
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

  async listAppointments(
    options?: {
      page?: number;
      limit?: number;
      search?: string;
      status?: string;
      doctorId?: string;
      from?: string;
      to?: string;
    },
    actor?: AuthUserPublic,
  ): Promise<{
    items: Array<Record<string, unknown>>;
    total: number;
    page: number;
    limit: number;
  }> {
    const limitCap = options?.from && options?.to ? 500 : 100;
    const limit = Math.min(Math.max(options?.limit ?? 50, 1), limitCap);
    const page = Math.max(options?.page ?? 1, 1);
    const skip = (page - 1) * limit;

    if (!this.prisma.isConnected) {
      return { items: [], total: 0, page, limit };
    }

    // DOCTOR: always force their staff profile — ignore client doctorId
    let scopedDoctorId = options?.doctorId;
    if (actor?.role === 'DOCTOR') {
      if (!actor.staffProfileId) {
        return { items: [], total: 0, page, limit };
      }
      scopedDoctorId = actor.staffProfileId;
    }

    const q = options?.search?.trim();
    const statusMapDb: Record<string, string[]> = {
      Pending: ['ARRIVED'],
      Scheduled: ['SCHEDULED', 'CONFIRMED'],
      'Checked In': ['ARRIVED'],
      Completed: ['COMPLETED'],
      Cancelled: ['CANCELLED', 'NO_SHOW'],
      SCHEDULED: ['SCHEDULED'],
      CONFIRMED: ['CONFIRMED'],
      ARRIVED: ['ARRIVED'],
      COMPLETED: ['COMPLETED'],
      CANCELLED: ['CANCELLED'],
    };
    const statusFilter = options?.status
      ? statusMapDb[options.status] || [options.status.toUpperCase()]
      : undefined;

    const where = {
      deleted_at: null as null,
      ...(scopedDoctorId ? { doctor_id: scopedDoctorId } : {}),
      ...(statusFilter ? { status: { in: statusFilter } } : {}),
      ...(options?.from || options?.to
        ? {
            appointment_date: {
              ...(options.from ? { gte: new Date(options.from) } : {}),
              ...(options.to ? { lte: new Date(options.to) } : {}),
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              {
                patient: {
                  patient_number: { contains: q, mode: 'insensitive' as const },
                },
              },
              {
                patient: {
                  user: {
                    email: { contains: q, mode: 'insensitive' as const },
                  },
                },
              },
              {
                patient: {
                  user: {
                    core_profiles_user_id: {
                      some: {
                        OR: [
                          { first_name: { contains: q, mode: 'insensitive' as const } },
                          { last_name: { contains: q, mode: 'insensitive' as const } },
                          { phone: { contains: q, mode: 'insensitive' as const } },
                        ],
                      },
                    },
                  },
                },
              },
              {
                doctor: {
                  user: {
                    core_profiles_user_id: {
                      some: {
                        OR: [
                          { first_name: { contains: q, mode: 'insensitive' as const } },
                          { last_name: { contains: q, mode: 'insensitive' as const } },
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
      this.prisma.appointments.findMany({
        where,
        include: {
          patient: {
            include: { user: { include: { core_profiles_user_id: true } } },
          },
          doctor: {
            include: { user: { include: { core_profiles_user_id: true } } },
          },
        },
        orderBy: [{ appointment_date: 'asc' }, { start_time: 'asc' }],
        skip,
        take: limit,
      }),
      this.prisma.appointments.count({ where }),
    ]);

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

    const items = rows.map((r) => {
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
        doctorId: r.doctor_id,
        department: r.doctor.specialization || 'General',
        date: r.appointment_date.toISOString().slice(0, 10),
        time,
        type: typeMap[r.appointment_type || ''] || r.appointment_type || 'Consultation',
        status: statusMap[r.status] || r.status,
        rawStatus: r.status,
      };
    });

    return { items, total, page, limit };
  }

  /**
   * KPI strip for Appointments ledger:
   * - pending = checked-in / waiting (ARRIVED)
   * - scheduled = booked upcoming (SCHEDULED + CONFIRMED)
   * - completed = COMPLETED
   * - total = all non-deleted
   */
  async appointmentSummary(actor?: AuthUserPublic): Promise<{
    total: number;
    pending: number;
    scheduled: number;
    completed: number;
    cancelled: number;
  }> {
    if (!this.prisma.isConnected) {
      return {
        total: 0,
        pending: 0,
        scheduled: 0,
        completed: 0,
        cancelled: 0,
      };
    }

    if (actor?.role === 'DOCTOR' && !actor.staffProfileId) {
      return {
        total: 0,
        pending: 0,
        scheduled: 0,
        completed: 0,
        cancelled: 0,
      };
    }

    const where = {
      deleted_at: null as null,
      ...(actor?.role === 'DOCTOR' && actor.staffProfileId
        ? { doctor_id: actor.staffProfileId }
        : {}),
    };

    const groups = await this.prisma.appointments.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });

    const counts: Record<string, number> = {};
    let total = 0;
    for (const g of groups) {
      counts[g.status] = g._count._all;
      total += g._count._all;
    }

    return {
      total,
      pending: counts.ARRIVED ?? 0,
      scheduled: (counts.SCHEDULED ?? 0) + (counts.CONFIRMED ?? 0),
      completed: counts.COMPLETED ?? 0,
      cancelled: (counts.CANCELLED ?? 0) + (counts.NO_SHOW ?? 0),
    };
  }

  async getAppointmentDetail(id: string) {
    if (!this.prisma.isConnected) {
      throw new NotFoundException('Appointment not found');
    }

    const r = await this.prisma.appointments.findFirst({
      where: { id, deleted_at: null },
      include: {
        patient: {
          include: { user: { include: { core_profiles_user_id: true } } },
        },
        doctor: {
          include: { user: { include: { core_profiles_user_id: true } } },
        },
        clinical_consultations_appointment_id: {
          where: { deleted_at: null },
          include: {
            clinical_diagnoses_consultation_id: true,
            laboratory_requests_consultation_id: true,
            pharmacy_prescriptions_consultation_id: {
              where: { deleted_at: null, is_voided: false },
              include: {
                pharmacy_prescription_lines_prescription_id: {
                  include: { medication: true },
                },
              },
            },
          },
          orderBy: { consultation_date: 'desc' },
        },
      },
    });

    if (!r) {
      throw new NotFoundException('Appointment not found');
    }

    const pp = r.patient.user.core_profiles_user_id[0];
    const dp = r.doctor.user.core_profiles_user_id[0];
    const doctorName = dp
      ? `Dr. ${dp.first_name} ${dp.last_name}`
      : r.doctor.user.email;
    const patientName = pp
      ? `${pp.first_name} ${pp.last_name}`
      : r.patient.patient_number;
    const start = r.start_time;
    const time = `${String(start.getHours()).padStart(2, '0')}:${String(
      start.getMinutes(),
    ).padStart(2, '0')}`;

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
      FOLLOW_UP: 'Follow Up',
      CONSULTATION: 'Consultation',
      EMERGENCY: 'Emergency',
    };

    let departmentName = r.doctor.specialization || 'General';
    if (r.doctor.department_id) {
      const dept = await this.prisma.departments.findFirst({
        where: { id: r.doctor.department_id },
        select: { name: true },
      });
      if (dept?.name) departmentName = dept.name;
    }

    const consultations = r.clinical_consultations_appointment_id;
    const labRequests = consultations.flatMap((c) =>
      c.laboratory_requests_consultation_id.map((lab) => {
        let testLabel = lab.notes?.trim() || 'Laboratory request';
        try {
          const parsed = JSON.parse(lab.notes || '') as {
            tests?: Array<{ name?: string }>;
          };
          if (parsed.tests?.length) {
            testLabel = parsed.tests
              .map((t) => t.name)
              .filter(Boolean)
              .join(', ');
          }
        } catch {
          /* plain notes */
        }
        return {
          id: lab.id,
          requestNumber: lab.request_number || lab.id.slice(0, 8).toUpperCase(),
          test: testLabel || 'Laboratory request',
          priority: lab.priority,
          status: lab.status,
          requestedAt: lab.request_date.toISOString(),
        };
      }),
    );

    const prescriptions = consultations.flatMap((c) =>
      c.pharmacy_prescriptions_consultation_id.flatMap((rx) =>
        rx.pharmacy_prescription_lines_prescription_id.map((line) => ({
          id: line.id,
          prescriptionId: rx.id,
          prescriptionNumber:
            rx.prescription_number || rx.id.slice(0, 8).toUpperCase(),
          medication: line.medication?.medication_name || 'Medication',
          regimen: [line.dosage, line.frequency, line.duration]
            .filter(Boolean)
            .join(' · '),
          status: line.status || rx.status,
        })),
      ),
    );

    const clinicalNotes = consultations
      .map((c) => {
        const parts = [
          c.chief_complaint,
          c.history_present_illness,
          c.physical_examination,
          c.treatment_plan,
          c.notes,
        ]
          .map((x) => x?.trim())
          .filter(Boolean);
        if (!parts.length) return null;
        return {
          id: c.id,
          date: c.consultation_date.toISOString(),
          status: c.status,
          text: parts.join('\n\n'),
        };
      })
      .filter(
        (n): n is { id: string; date: string; status: string; text: string } =>
          !!n,
      );

    // Enrich from outpatient pipeline (front-desk → triage → consult flow)
    const dayStart = new Date(r.appointment_date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(r.appointment_date);
    dayEnd.setHours(23, 59, 59, 999);

    const opVisit =
      (await this.prisma.outpatientVisits.findFirst({
        where: {
          OR: [
            { payload: { path: ['appointmentId'], equals: id } },
            {
              patient_id: r.patient_id,
              checked_in_at: { gte: dayStart, lte: dayEnd },
            },
            {
              mrn: r.patient.patient_number,
              checked_in_at: { gte: dayStart, lte: dayEnd },
            },
          ],
        },
        orderBy: { checked_in_at: 'desc' },
      })) || null;

    const opPayload = (opVisit?.payload ?? {}) as {
      reasonForVisit?: string;
      additionalNotes?: string;
      diagnosis?: string;
      doctorName?: string;
      nurseName?: string;
      prescriptions?: Array<{
        medication?: string;
        medicationId?: string;
        dosage?: string;
        frequency?: string;
        duration?: string;
      }>;
      pharmacy?: { prescriptionId?: string; prescriptionNumber?: string };
      labOrder?: { notes?: string; tests?: Array<{ name?: string }> };
    };

    let reason =
      r.reason?.trim() ||
      opVisit?.reason_for_visit?.trim() ||
      opPayload.reasonForVisit?.trim() ||
      '';
    let additionalNotes =
      opVisit?.additional_notes?.trim() ||
      opPayload.additionalNotes?.trim() ||
      '';
    let notes = r.notes?.trim() || '';
    if (additionalNotes && !notes) notes = additionalNotes;
    else if (additionalNotes && notes && !notes.includes(additionalNotes)) {
      notes = `${notes}\n\n${additionalNotes}`;
    }

    if (opPayload.diagnosis?.trim()) {
      clinicalNotes.push({
        id: `visit-dx-${opVisit!.id}`,
        date: opVisit!.checked_in_at.toISOString(),
        status: opVisit!.stage,
        text: [
          `Diagnosis: ${opPayload.diagnosis.trim()}`,
          opPayload.doctorName ? `Physician: ${opPayload.doctorName}` : '',
          opPayload.nurseName ? `Nurse: ${opPayload.nurseName}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      });
    }

    // Same-day consultations not linked via appointment_id
    const unlinkedConsults = await this.prisma.consultations.findMany({
      where: {
        patient_id: r.patient_id,
        deleted_at: null,
        appointment_id: null,
        consultation_date: { gte: dayStart, lte: dayEnd },
      },
      include: {
        clinical_diagnoses_consultation_id: true,
        pharmacy_prescriptions_consultation_id: {
          where: { deleted_at: null, is_voided: false },
          include: {
            pharmacy_prescription_lines_prescription_id: {
              include: { medication: true },
            },
          },
        },
        laboratory_requests_consultation_id: true,
      },
      orderBy: { consultation_date: 'desc' },
      take: 10,
    });

    for (const c of unlinkedConsults) {
      if (consultations.some((x) => x.id === c.id)) continue;
      const parts = [
        c.chief_complaint,
        c.history_present_illness,
        c.physical_examination,
        c.treatment_plan,
        c.notes,
      ]
        .map((x) => x?.trim())
        .filter(Boolean);
      if (parts.length) {
        clinicalNotes.push({
          id: c.id,
          date: c.consultation_date.toISOString(),
          status: c.status,
          text: parts.join('\n\n'),
        });
      }
      for (const rx of c.pharmacy_prescriptions_consultation_id) {
        for (const line of rx.pharmacy_prescription_lines_prescription_id) {
          if (prescriptions.some((p) => p.id === line.id)) continue;
          prescriptions.push({
            id: line.id,
            prescriptionId: rx.id,
            prescriptionNumber:
              rx.prescription_number || rx.id.slice(0, 8).toUpperCase(),
            medication: line.medication?.medication_name || 'Medication',
            regimen: [line.dosage, line.frequency, line.duration]
              .filter(Boolean)
              .join(' · '),
            status: line.status || rx.status,
          });
        }
      }
    }

    // Visit-payload prescriptions (HMS consult desk)
    for (const [idx, line] of (opPayload.prescriptions ?? []).entries()) {
      if (!line.medication?.trim()) continue;
      const syntheticId = `visit-rx-${opVisit?.id ?? id}-${idx}`;
      if (prescriptions.some((p) => p.id === syntheticId)) continue;
      prescriptions.push({
        id: syntheticId,
        prescriptionId: opPayload.pharmacy?.prescriptionId || syntheticId,
        prescriptionNumber:
          opPayload.pharmacy?.prescriptionNumber ||
          `VIS-${(opVisit?.id || id).replace(/-/g, '').slice(0, 6).toUpperCase()}`,
        medication: line.medication,
        regimen: [line.dosage, line.frequency, line.duration]
          .filter(Boolean)
          .join(' · '),
        status: 'PRESCRIBED',
      });
    }

    // Pharmacy Rx created for this patient on the visit day / linked id
    const pharmacyWhere: Array<Record<string, unknown>> = [
      {
        patient_id: r.patient_id,
        deleted_at: null,
        is_voided: false,
        created_at: { gte: dayStart, lte: dayEnd },
      },
    ];
    if (opPayload.pharmacy?.prescriptionId) {
      pharmacyWhere.push({ id: opPayload.pharmacy.prescriptionId });
    }
    const pharmacyRx = await this.prisma.prescriptions.findMany({
      where: { OR: pharmacyWhere },
      include: {
        pharmacy_prescription_lines_prescription_id: {
          include: { medication: true },
        },
      },
      take: 20,
    });
    for (const rx of pharmacyRx) {
      for (const line of rx.pharmacy_prescription_lines_prescription_id) {
        if (prescriptions.some((p) => p.id === line.id)) continue;
        prescriptions.push({
          id: line.id,
          prescriptionId: rx.id,
          prescriptionNumber:
            rx.prescription_number || rx.id.slice(0, 8).toUpperCase(),
          medication: line.medication?.medication_name || 'Medication',
          regimen: [line.dosage, line.frequency, line.duration]
            .filter(Boolean)
            .join(' · '),
          status: line.status || rx.status,
        });
      }
    }

    const gender = mapGender(pp?.gender);
    const consultationRows = [
      ...consultations.map((c) => {
        const primaryDx =
          c.clinical_diagnoses_consultation_id.find(
            (d) => d.diagnosis_type === 'PRIMARY',
          ) || c.clinical_diagnoses_consultation_id[0];
        return {
          id: c.id,
          date: c.consultation_date.toISOString(),
          diagnosis: primaryDx?.description || c.chief_complaint || '—',
          status: c.status,
        };
      }),
      ...unlinkedConsults
        .filter((c) => !consultations.some((x) => x.id === c.id))
        .map((c) => {
          const primaryDx =
            c.clinical_diagnoses_consultation_id.find(
              (d) => d.diagnosis_type === 'PRIMARY',
            ) || c.clinical_diagnoses_consultation_id[0];
          return {
            id: c.id,
            date: c.consultation_date.toISOString(),
            diagnosis: primaryDx?.description || c.chief_complaint || '—',
            status: c.status,
          };
        }),
    ];

    return {
      id: r.id,
      visitId: opVisit?.id ?? null,
      appointmentNumber: `APT-${r.id.replace(/-/g, '').slice(0, 6).toUpperCase()}`,
      date: r.appointment_date.toISOString().slice(0, 10),
      time,
      status: statusMap[r.status] || r.status,
      rawStatus: r.status,
      type: typeMap[r.appointment_type || ''] || r.appointment_type || 'Consultation',
      reason,
      notes,
      additionalNotes,
      bookedAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
      patient: {
        id: r.patient_id,
        name: patientName,
        mrn: r.patient.patient_number,
        phone: pp?.phone || '',
        email: displayEmail(r.patient.user.email),
        gender: gender === 'Other' ? 'Female' : gender,
        bloodGroup: r.patient.blood_group || '',
        age: ageFromDob(pp?.date_of_birth ?? null),
      },
      provider: {
        id: r.doctor_id,
        name: doctorName,
        title: r.doctor.position || 'Physician',
        specialization: r.doctor.specialization || 'General',
        department: departmentName,
      },
      counts: {
        consultations: consultationRows.length,
        labRequests: labRequests.length,
        prescriptions: prescriptions.length,
      },
      consultations: consultationRows,
      labRequests,
      prescriptions,
      clinicalNotes,
    };
  }

  async listInventory() {
    const meds = await this.fetchAllMedicationsForInventory();
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

  async listRadiologyQueue(options?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
  }): Promise<{
    items: Array<Record<string, unknown>>;
    total: number;
    page: number;
    limit: number;
  }> {
    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
    const page = Math.max(options?.page ?? 1, 1);
    const skip = (page - 1) * limit;

    if (!this.prisma.isConnected) {
      return { items: [], total: 0, page, limit };
    }

    const q = options?.search?.trim();
    const statusFilter = options?.status?.toUpperCase();

    const where = {
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(q
        ? {
            OR: [
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
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.radiologyRequests.findMany({
        where,
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
        skip,
        take: limit,
      }),
      this.prisma.radiologyRequests.count({ where }),
    ]);

    const statusMap: Record<string, string> = {
      PENDING: 'Scheduled',
      SCHEDULED: 'Scheduled',
      IN_PROGRESS: 'In Progress',
      COMPLETED: 'Completed',
      CANCELLED: 'Cancelled',
    };
    const items = rows.map((r) => {
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

    return { items, total, page, limit };
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
      this.listDoctors({ page: 1, limit: 1 }).then((d) => d.total),
      this.prisma.invoices.count({
        where: {
          deleted_at: null,
          status: { in: ['ISSUED', 'PARTIALLY_PAID', 'DRAFT'] },
        },
      }),
      this.listDepartments({ page: 1, limit: 100 }),
      this.listAppointments({ page: 1, limit: 8 }),
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
      for (const d of depts.items.slice(0, 6)) {
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
      recentAppointments: recentAppointments.items.slice(0, 6),
      ageStages: ageBuckets,
      revenueSeries,
      inventoryUsageSeries,
      reports,
    };
  }
}
