/**
 * CatalogService — fallback (disconnected) + Prisma-backed catalog reads.
 */

import { NotFoundException } from '@nestjs/common';
import { CatalogService } from '../catalog.service';

describe('CatalogService', () => {
  let prisma: Record<string, any>;
  let service: CatalogService;

  beforeEach(() => {
    prisma = {
      isConnected: false,
      patients: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
      },
      staffProfiles: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      departments: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
      },
      medications: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      testTypes: { findMany: jest.fn() },
      services: { findMany: jest.fn() },
      insuranceProviders: { findMany: jest.fn() },
      appointments: {
        findMany: jest.fn(),
        count: jest.fn(),
        groupBy: jest.fn(),
        findFirst: jest.fn(),
      },
      outpatientVisits: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
      },
      consultations: { findMany: jest.fn() },
      prescriptions: { findMany: jest.fn() },
      stockMovements: { findMany: jest.fn() },
      wards: { findMany: jest.fn() },
      radiologyRequests: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      invoices: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      conversations: { findMany: jest.fn() },
    };
    service = new CatalogService(prisma as never);
  });

  describe('disconnected fallbacks', () => {
    it('lists patients with search/gender/pagination', async () => {
      const all = await service.listPatients();
      expect(all.items.length).toBeGreaterThan(0);
      expect(all.page).toBe(1);

      const filtered = await service.listPatients({
        search: 'Joseph',
        gender: 'Male',
        page: 1,
        limit: 2,
      });
      expect(filtered.items.every((p) => p.gender === 'Male')).toBe(true);
      expect(filtered.limit).toBe(2);
    });

    it('returns empty patient summary and rejects patient detail', async () => {
      expect(await service.patientSummary()).toEqual({
        total: 0,
        female: 0,
        male: 0,
        other: 0,
        recent7d: 0,
      });
      await expect(service.getPatientDetail('p1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('lists doctors, meds, lab, insurers, inventory', async () => {
      const doctors = await service.listDoctors({ search: 'a', limit: 5 });
      expect(doctors.items.length).toBeGreaterThan(0);

      expect(await service.listDepartments()).toEqual(
        expect.objectContaining({ items: [], total: 0 }),
      );

      const meds = await service.listMedications({ search: 'a' });
      expect(meds.items.length).toBeGreaterThan(0);

      const labs = await service.listLabTests();
      expect(labs[0]).toEqual(
        expect.objectContaining({ id: 'lab-0', name: expect.any(String) }),
      );

      expect(await service.listClinicalServices()).toEqual([]);
      expect(await service.listStaff()).toEqual(
        expect.objectContaining({ items: [] }),
      );

      const insurers = await service.listInsurers();
      expect(insurers.some((i) => i.code === 'SHA')).toBe(true);

      expect(await service.listAppointments()).toEqual(
        expect.objectContaining({ items: [] }),
      );
      expect(await service.appointmentSummary()).toEqual(
        expect.objectContaining({ total: 0 }),
      );
      await expect(service.getAppointmentDetail('a1')).rejects.toBeInstanceOf(
        NotFoundException,
      );

      const inv = await service.listInventory();
      expect(inv.items.length).toBeGreaterThan(0);
      expect(inv.stats.totalItems).toBe(inv.items.length);

      expect(await service.listWards()).toEqual([]);
      expect(await service.listRadiologyQueue()).toEqual(
        expect.objectContaining({ items: [] }),
      );
      expect(await service.listInvoices()).toEqual([]);
      expect(await service.listConversations()).toEqual([]);
      expect(await service.dashboardSummary()).toEqual(
        expect.objectContaining({ patients: 0, doctors: 0 }),
      );
    });
  });

  describe('connected Prisma paths', () => {
    beforeEach(() => {
      prisma.isConnected = true;
    });

    it('lists patients from DB with gender/status mapping', async () => {
      const dob = new Date('1990-01-15');
      prisma.patients.findMany.mockResolvedValue([
        {
          id: 'p1',
          patient_number: 'MRN-1',
          created_at: new Date('2026-01-01'),
          user: {
            email: 'hidden@patient.nyalife.health',
            core_profiles_user_id: [
              {
                first_name: 'Ann',
                last_name: 'W',
                gender: 'FEMALE',
                phone: '+254',
                date_of_birth: dob,
              },
            ],
          },
          clinical_appointments_patient_id: [
            { appointment_date: new Date('2026-08-01') },
          ],
          inpatient_admissions_patient_id: [{ id: 'adm1' }],
        },
        {
          id: 'p2',
          patient_number: 'MRN-2',
          created_at: new Date('2026-02-01'),
          user: {
            email: 'real@example.com',
            core_profiles_user_id: [],
          },
          clinical_appointments_patient_id: [],
          inpatient_admissions_patient_id: [],
        },
      ]);
      prisma.patients.count.mockResolvedValue(2);

      const result = await service.listPatients({
        search: 'Ann',
        gender: 'Female',
        status: 'ADMITTED',
        page: 1,
        limit: 10,
      });
      expect(result.total).toBe(2);
      expect(result.items[0]).toEqual(
        expect.objectContaining({
          name: 'Ann W',
          gender: 'Female',
          status: 'Admitted',
        }),
      );
      expect(result.items[1].name).toBe('MRN-2');
      expect(result.items[1].status).toBe('Active');
    });

    it('computes patient summary counts', async () => {
      prisma.patients.count
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2);
      expect(await service.patientSummary()).toEqual({
        total: 10,
        female: 4,
        male: 5,
        other: 1,
        recent7d: 2,
      });
    });

    it('returns patient detail with timeline', async () => {
      const start = new Date('2026-08-20T09:30:00Z');
      prisma.patients.findFirst.mockResolvedValue({
        id: 'p1',
        patient_number: 'MRN-00412',
        created_at: new Date('2026-01-02T00:00:00Z'),
        blood_group: 'O+',
        occupation: 'Teacher',
        marital_status: 'Married',
        allergies: 'None',
        chronic_diseases: '',
        user: {
          email: 'ann@example.com',
          core_profiles_user_id: [
            {
              first_name: 'Ann',
              last_name: 'Wanjiku',
              gender: 'FEMALE',
              phone: '+254700',
              address: 'Nairobi',
              date_of_birth: new Date('1995-05-05'),
            },
          ],
        },
        patients_emergency_contacts_patient_id: [
          { name: 'Kin', phone: '+254701', relationship: 'Spouse' },
        ],
        clinical_appointments_patient_id: [
          {
            id: 'a1',
            appointment_date: new Date('2026-08-20'),
            start_time: start,
            status: 'SCHEDULED',
            doctor: {
              user: {
                email: 'doc@x.com',
                core_profiles_user_id: [
                  { first_name: 'Ada', last_name: 'Okello' },
                ],
              },
            },
          },
        ],
        clinical_consultations_patient_id: [
          {
            id: 'c1',
            consultation_date: new Date('2026-08-19T10:00:00Z'),
            chief_complaint: 'Pain',
            status: 'COMPLETED',
            doctor: {
              user: {
                email: 'doc@x.com',
                core_profiles_user_id: [
                  { first_name: 'Ada', last_name: 'Okello' },
                ],
              },
            },
            clinical_diagnoses_consultation_id: [
              { diagnosis_type: 'PRIMARY', description: 'URI' },
            ],
          },
        ],
        clinical_outpatient_visits_patient_id: [
          {
            id: 'v1',
            stage: 'TRIAGE',
            checked_in_at: new Date('2026-08-21T08:00:00Z'),
            reason_for_visit: 'Fever',
            payload: { doctorName: 'Dr Ada', appointmentId: 'a1' },
          },
        ],
        clinical_vital_signs_patient_id: [
          {
            id: 'vs1',
            measured_at: new Date('2026-08-21T08:05:00Z'),
            blood_pressure: '120/80',
            heart_rate: 72,
            respiratory_rate: 16,
            temperature: 36.8,
            weight: 70,
            height: 165,
            oxygen_saturation: 98,
            notes: '',
            urgency_level: 'NORMAL',
          },
        ],
        _count: {
          pharmacy_prescriptions_patient_id: 1,
          clinical_vital_signs_patient_id: 1,
          clinical_consultations_patient_id: 1,
        },
      });
      prisma.outpatientVisits.findMany.mockResolvedValue([
        {
          id: 'v-orphan',
          stage: 'COMPLETED',
          checked_in_at: new Date('2026-08-10T08:00:00Z'),
          reason_for_visit: null,
          payload: { diagnosis: 'Old visit' },
        },
      ]);

      const detail = await service.getPatientDetail('p1');
      expect(detail.name).toBe('Ann Wanjiku');
      expect(detail.email).toBe('ann@example.com');
      expect(detail.appointments[0].provider).toBe('Dr. Ada Okello');
      expect(detail.visitTimeline.length).toBeGreaterThan(1);
      expect(detail.counts.encounters).toBe(detail.visitTimeline.length);

      prisma.patients.findFirst.mockResolvedValue(null);
      await expect(service.getPatientDetail('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('lists doctors, departments, medications, lab, clinical services, staff', async () => {
      prisma.staffProfiles.findMany.mockResolvedValue([
        {
          id: 'd1',
          user_id: 'u1',
          is_active: true,
          specialization: 'OBGYN',
          position: 'Consultant',
          employee_id: 'EMP-1',
          department_id: 'dept1',
          user: {
            email: 'doc@nyalife.health',
            core_profiles_user_id: [
              { first_name: 'Ada', last_name: 'Okello', phone: '+254' },
            ],
            core_user_roles_user_id: [{ role: { name: 'DOCTOR' } }],
          },
        },
      ]);
      prisma.staffProfiles.count.mockResolvedValue(1);
      const doctors = await service.listDoctors({
        search: 'Ada',
        departmentId: 'dept1',
      });
      expect(doctors.items[0].name).toBe('Dr. Ada Okello');

      prisma.departments.findMany.mockResolvedValue([
        {
          id: 'dept1',
          name: 'Maternity',
          code: 'MAT',
          description: 'Floor 2\nExtra',
          head_name: 'Ada',
        },
      ]);
      prisma.departments.count.mockResolvedValue(1);
      prisma.staffProfiles.findMany.mockResolvedValue([
        {
          department_id: 'dept1',
          user: {
            core_user_roles_user_id: [{ role: { name: 'DOCTOR' } }],
          },
        },
        {
          department_id: 'dept1',
          user: {
            core_user_roles_user_id: [{ role: { name: 'NURSE' } }],
          },
        },
        {
          department_id: 'dept1',
          user: {
            core_user_roles_user_id: [{ role: { name: 'PHARMACIST' } }],
          },
        },
        {
          department_id: 'dept1',
          user: {
            core_user_roles_user_id: [{ role: { name: 'ADMIN' } }],
          },
        },
      ]);
      const depts = await service.listDepartments({ search: 'Mat' });
      expect(depts.items[0]).toEqual(
        expect.objectContaining({
          doctors: 1,
          nurses: 1,
          specialists: 1,
          support: 1,
          location: 'Floor 2',
        }),
      );

      prisma.medications.findMany.mockResolvedValue([
        {
          id: 'm1',
          medication_name: 'PCM',
          unit: 'tabs',
          category: { category_name: 'Analgesic' },
          pharmacy_batches_medication_id: [
            { quantity_on_hand: 50, expiry_date: new Date('2027-01-01') },
          ],
        },
        {
          id: 'm2',
          medication_name: 'Empty',
          unit: null,
          category: null,
          pharmacy_batches_medication_id: [],
        },
      ]);
      prisma.medications.count.mockResolvedValue(2);
      const meds = await service.listMedications({ search: 'PCM' });
      expect(meds.items[0].stock).toBe(50);
      expect(meds.items[1].expiry).toBe('—');

      prisma.testTypes.findMany.mockResolvedValue([
        {
          id: 't1',
          test_name: 'CBC',
          category: 'Hematology',
          units: 'cells',
          normal_range: '4-11',
          laboratory_test_parameters_test_type_id: [],
        },
      ]);
      expect((await service.listLabTests())[0].name).toBe('CBC');

      prisma.services.findMany.mockResolvedValue([
        {
          id: 's1',
          service_code: 'CONSULT',
          service_name: 'Consult',
          category: 'Consultation',
          description: null,
          standard_price: { toString: () => '1000' },
        },
        {
          id: 's2',
          service_code: 'CSECTION',
          service_name: 'C-Section',
          category: 'Surgery',
          description: 'Op',
          standard_price: { toString: () => '50000' },
        },
      ]);
      const clinical = await service.listClinicalServices({
        kind: 'surgery',
        search: 'C',
      });
      expect(clinical).toHaveLength(1);
      expect(clinical[0].code).toBe('CSECTION');

      prisma.staffProfiles.findMany.mockResolvedValue([
        {
          id: 'st1',
          user_id: 'u1',
          employee_id: 'EMP-1',
          is_active: true,
          department_id: 'dept1',
          position: 'Nurse',
          user: {
            email: 'n@x.com',
            core_profiles_user_id: [
              { first_name: 'Nelly', last_name: 'A' },
            ],
            core_user_roles_user_id: [{ role: { name: 'NURSE' } }],
          },
        },
        {
          id: 'st2',
          user_id: 'u2',
          employee_id: 'EMP-2',
          is_active: false,
          department_id: null,
          position: 'Clerk',
          user: {
            email: 'c@x.com',
            core_profiles_user_id: [],
            core_user_roles_user_id: [{ role: { name: 'DOCTOR' } }],
          },
        },
      ]);
      prisma.staffProfiles.count.mockResolvedValue(2);
      prisma.departments.findMany.mockResolvedValue([
        { id: 'dept1', name: 'Maternity' },
      ]);
      const staff = await service.listStaff({
        search: 'Nelly',
        role: 'nurse',
        status: 'active',
      });
      expect(staff.items[0].department).toBe('Maternity');
      expect(staff.items[1].name).toMatch(/^Dr\./);
      expect(staff.items[1].status).toBe('On Leave');
    });

    it('lists insurers and appointments with doctor scoping', async () => {
      prisma.insuranceProviders.findMany.mockResolvedValue([
        {
          id: 'i1',
          name: 'SHA',
          code: 'SHA',
          claim_submission_method: null,
        },
        {
          id: 'i2',
          name: 'Jubilee',
          code: 'JUB',
          claim_submission_method: 'API',
        },
        {
          id: 'i3',
          name: 'Manual Co',
          code: 'MAN',
          claim_submission_method: 'PORTAL',
        },
      ]);
      const insurers = await service.listInsurers();
      expect(insurers.map((i) => i.integration)).toEqual([
        'SHA',
        'SLADE',
        'MANUAL',
      ]);

      expect(
        await service.listAppointments({}, {
          role: 'DOCTOR',
        } as never),
      ).toEqual(expect.objectContaining({ items: [] }));

      prisma.appointments.findMany.mockResolvedValue([
        {
          id: 'a1',
          patient_id: 'p1',
          doctor_id: 'd1',
          appointment_date: new Date('2026-08-23'),
          start_time: new Date('2026-08-23T09:15:00'),
          status: 'ARRIVED',
          appointment_type: 'FOLLOW_UP',
          patient: {
            patient_number: 'MRN-1',
            user: {
              core_profiles_user_id: [
                {
                  first_name: 'Ann',
                  last_name: 'W',
                  phone: '+254',
                  gender: 'FEMALE',
                  date_of_birth: new Date('2000-01-01'),
                },
              ],
            },
          },
          doctor: {
            specialization: 'OBGYN',
            user: {
              email: 'd@x.com',
              core_profiles_user_id: [
                { first_name: 'Ada', last_name: 'O' },
              ],
            },
          },
        },
      ]);
      prisma.appointments.count.mockResolvedValue(1);
      const appts = await service.listAppointments(
        {
          search: 'Ann',
          status: 'Checked In',
          from: '2026-08-01',
          to: '2026-08-31',
        },
        { role: 'DOCTOR', staffProfileId: 'd1' } as never,
      );
      expect(appts.items[0]).toEqual(
        expect.objectContaining({
          status: 'Checked In',
          type: 'Follow-up',
          doctor: 'Dr. Ada O',
        }),
      );

      prisma.appointments.groupBy.mockResolvedValue([
        { status: 'ARRIVED', _count: { _all: 2 } },
        { status: 'SCHEDULED', _count: { _all: 3 } },
        { status: 'CONFIRMED', _count: { _all: 1 } },
        { status: 'COMPLETED', _count: { _all: 4 } },
        { status: 'CANCELLED', _count: { _all: 1 } },
        { status: 'NO_SHOW', _count: { _all: 1 } },
      ]);
      expect(
        await service.appointmentSummary({
          role: 'DOCTOR',
          staffProfileId: 'd1',
        } as never),
      ).toEqual({
        total: 12,
        pending: 2,
        scheduled: 4,
        completed: 4,
        cancelled: 2,
      });

      expect(
        await service.appointmentSummary({
          role: 'DOCTOR',
        } as never),
      ).toEqual(
        expect.objectContaining({ total: 0 }),
      );
    });

    it('returns appointment detail with enrichments', async () => {
      const apptDate = new Date('2026-08-23T00:00:00Z');
      prisma.appointments.findFirst.mockResolvedValue({
        id: 'a1b2c3d4',
        patient_id: 'p1',
        doctor_id: 'd1',
        appointment_date: apptDate,
        start_time: new Date('2026-08-23T10:05:00Z'),
        status: 'COMPLETED',
        appointment_type: 'CONSULTATION',
        reason: 'Review',
        notes: 'Base note',
        created_at: new Date('2026-08-20T10:00:00Z'),
        updated_at: new Date('2026-08-23T12:00:00Z'),
        patient: {
          patient_number: 'MRN-1',
          blood_group: 'A+',
          user: {
            email: 'hidden@patient.nyalife.health',
            core_profiles_user_id: [
              {
                first_name: 'Ann',
                last_name: 'W',
                phone: '+254',
                gender: 'OTHER',
                date_of_birth: new Date('1990-01-01'),
              },
            ],
          },
        },
        doctor: {
          department_id: 'dept1',
          specialization: 'General',
          position: 'Consultant',
          user: {
            email: 'doc@x.com',
            core_profiles_user_id: [
              { first_name: 'Ada', last_name: 'Okello' },
            ],
          },
        },
        clinical_consultations_appointment_id: [
          {
            id: 'c1',
            consultation_date: new Date('2026-08-23T11:00:00Z'),
            chief_complaint: 'Pain',
            history_present_illness: '2 days',
            physical_examination: 'OK',
            treatment_plan: 'Rest',
            notes: 'n',
            status: 'COMPLETED',
            clinical_diagnoses_consultation_id: [
              { diagnosis_type: 'PRIMARY', description: 'URI' },
            ],
            laboratory_requests_consultation_id: [
              {
                id: 'lab1',
                request_number: 'LR-1',
                notes: JSON.stringify({ tests: [{ name: 'CBC' }] }),
                priority: 'ROUTINE',
                status: 'PENDING',
                request_date: new Date('2026-08-23T11:05:00Z'),
              },
              {
                id: 'lab2',
                request_number: null,
                notes: 'plain',
                priority: 'URGENT',
                status: 'PENDING',
                request_date: new Date('2026-08-23T11:06:00Z'),
              },
            ],
            pharmacy_prescriptions_consultation_id: [
              {
                id: 'rx1',
                prescription_number: 'RX-1',
                status: 'ACTIVE',
                pharmacy_prescription_lines_prescription_id: [
                  {
                    id: 'line1',
                    dosage: '500mg',
                    frequency: 'BD',
                    duration: '5d',
                    status: 'PRESCRIBED',
                    medication: { medication_name: 'PCM' },
                  },
                ],
              },
            ],
          },
        ],
      });
      prisma.departments.findFirst.mockResolvedValue({ name: 'Maternity' });
      prisma.outpatientVisits.findFirst.mockResolvedValue({
        id: 'v1',
        stage: 'COMPLETED',
        checked_in_at: new Date('2026-08-23T09:00:00Z'),
        reason_for_visit: null,
        additional_notes: 'Extra note',
        payload: {
          diagnosis: 'URI confirmed',
          doctorName: 'Dr Ada',
          nurseName: 'Nelly',
          prescriptions: [
            {
              medication: 'Ibuprofen',
              dosage: '400mg',
              frequency: 'TDS',
              duration: '3d',
            },
          ],
          pharmacy: { prescriptionId: 'rx-extra', prescriptionNumber: 'RX-E' },
          labOrder: { tests: [{ name: 'UEC' }] },
        },
      });
      prisma.consultations.findMany.mockResolvedValue([
        {
          id: 'c-unlinked',
          consultation_date: new Date('2026-08-23T12:00:00Z'),
          chief_complaint: 'Follow-up',
          history_present_illness: null,
          physical_examination: null,
          treatment_plan: null,
          notes: null,
          status: 'COMPLETED',
          clinical_diagnoses_consultation_id: [],
          pharmacy_prescriptions_consultation_id: [
            {
              id: 'rx2',
              prescription_number: null,
              status: 'ACTIVE',
              pharmacy_prescription_lines_prescription_id: [
                {
                  id: 'line2',
                  dosage: '1',
                  frequency: null,
                  duration: null,
                  status: null,
                  medication: null,
                },
              ],
            },
          ],
          laboratory_requests_consultation_id: [],
        },
      ]);
      prisma.prescriptions.findMany.mockResolvedValue([
        {
          id: 'rx-extra',
          prescription_number: 'RX-E',
          status: 'ACTIVE',
          pharmacy_prescription_lines_prescription_id: [
            {
              id: 'line3',
              dosage: '10mg',
              frequency: 'OD',
              duration: '7d',
              status: 'DISPENSED',
              medication: { medication_name: 'Amox' },
            },
          ],
        },
      ]);

      const detail = await service.getAppointmentDetail('a1b2c3d4');
      expect(detail.provider.department).toBe('Maternity');
      expect(detail.patient.email).toBe('');
      expect(detail.patient.gender).toBe('Female');
      expect(detail.labRequests.length).toBeGreaterThan(0);
      expect(
        detail.prescriptions.some(
          (p: { medication: string }) => p.medication === 'Ibuprofen',
        ),
      ).toBe(true);
      expect(detail.notes).toContain('Extra note');
      expect(detail.clinicalNotes.length).toBeGreaterThan(0);

      prisma.appointments.findFirst.mockResolvedValue(null);
      await expect(service.getAppointmentDetail('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('lists inventory, wards, radiology, invoices, conversations, dashboard', async () => {
      prisma.medications.findMany.mockResolvedValue([
        {
          id: 'med-low-stock',
          medication_name: 'LowMed',
          unit: 'tabs',
          category: { category_name: 'A' },
          pharmacy_batches_medication_id: [
            { quantity_on_hand: 5, expiry_date: new Date('2027-01-01') },
          ],
        },
        {
          id: 'med-out',
          medication_name: 'OutMed',
          unit: 'tabs',
          category: { category_name: 'A' },
          pharmacy_batches_medication_id: [
            { quantity_on_hand: 0, expiry_date: new Date('2027-01-01') },
          ],
        },
      ]);
      prisma.stockMovements.findMany.mockResolvedValue([
        {
          id: 'sm1',
          movement_type: 'RECEIVE',
          quantity_change: 10,
          created_at: new Date('2026-08-23T10:00:00Z'),
          batch: { medication: { medication_name: 'PCM' } },
        },
      ]);
      const inventory = await service.listInventory();
      expect(inventory.stats.lowStock).toBe(1);
      expect(inventory.stats.outOfStock).toBe(1);
      expect(inventory.activity[0].title).toContain('RECEIVE');

      prisma.wards.findMany.mockResolvedValue([
        {
          id: 'w1',
          name: 'Ward A',
          capacity: 10,
          inpatient_beds_ward_id: [
            { status: 'OCCUPIED' },
            { status: 'AVAILABLE' },
          ],
        },
      ]);
      expect(await service.listWards()).toEqual([
        expect.objectContaining({ totalBeds: 2, occupied: 1 }),
      ]);

      prisma.radiologyRequests.findMany.mockResolvedValue([
        {
          id: 'r1',
          status: 'SCHEDULED',
          created_at: new Date('2026-08-23T10:00:00Z'),
          patient: {
            patient_number: 'MRN-1',
            user: {
              core_profiles_user_id: [
                { first_name: 'Ann', last_name: 'W' },
              ],
            },
          },
          scan_type: { scan_type: 'X-Ray' },
          requesting_doctor: {
            user: {
              core_profiles_user_id: [
                { first_name: 'Ada', last_name: 'O' },
              ],
            },
          },
        },
      ]);
      prisma.radiologyRequests.count.mockResolvedValue(1);
      const rad = await service.listRadiologyQueue({
        search: 'Ann',
        status: 'SCHEDULED',
      });
      expect(rad.items[0]).toEqual(
        expect.objectContaining({
          scan: 'X-Ray',
          requestedBy: 'Dr. Ada O',
          status: 'Scheduled',
        }),
      );

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 2);
      prisma.invoices.findMany.mockResolvedValue([
        {
          id: 'inv1',
          invoice_number: 'INV-1',
          total_amount: 1000,
          invoice_date: new Date('2026-08-01'),
          due_date: yesterday,
          status: 'ISSUED',
          patient: {
            patient_number: 'MRN-1',
            user: {
              core_profiles_user_id: [
                { first_name: 'Ann', last_name: 'W' },
              ],
            },
          },
        },
        {
          id: 'inv2',
          invoice_number: 'INV-2',
          total_amount: 500,
          invoice_date: new Date('2026-08-02'),
          due_date: new Date('2099-01-01'),
          status: 'PAID',
          patient: {
            patient_number: 'MRN-2',
            user: { core_profiles_user_id: [] },
          },
        },
        {
          id: 'inv3',
          invoice_number: 'INV-3',
          total_amount: 200,
          invoice_date: new Date('2026-08-03'),
          due_date: new Date('2099-01-01'),
          status: 'PARTIALLY_PAID',
          patient: {
            patient_number: 'MRN-3',
            user: { core_profiles_user_id: [] },
          },
        },
      ]);
      const invoices = await service.listInvoices();
      expect(invoices.map((i: { status: string }) => i.status)).toEqual([
        'Overdue',
        'Paid',
        'Partial',
      ]);

      prisma.conversations.findMany.mockResolvedValue([
        {
          id: 'c1',
          name: 'Ward chat',
          updated_at: new Date('2026-08-23T15:30:00Z'),
          metadata: { preview: 'Hi', unread: 2 },
        },
        {
          id: 'c2',
          name: null,
          updated_at: new Date('2026-08-23T15:31:00Z'),
          metadata: null,
        },
      ]);
      const convos = await service.listConversations();
      expect(convos[0].unread).toBe(2);
      expect(convos[1].with).toBe('Conversation');

      // dashboardSummary
      prisma.patients.count.mockResolvedValue(5);
      prisma.appointments.count.mockResolvedValue(3);
      prisma.outpatientVisits.count.mockResolvedValue(2);
      prisma.invoices.count.mockResolvedValue(4);
      prisma.staffProfiles.findMany.mockResolvedValue([]);
      prisma.staffProfiles.count.mockResolvedValue(7);
      prisma.departments.findMany.mockResolvedValue([]);
      prisma.departments.count.mockResolvedValue(0);
      prisma.appointments.findMany
        .mockResolvedValueOnce([]) // recent appointments via listAppointments
        .mockResolvedValueOnce([
          { doctor: { specialization: 'OBGYN' } },
          { doctor: { specialization: 'OBGYN' } },
          { doctor: { specialization: null } },
        ]);
      prisma.appointments.count.mockResolvedValue(0);
      prisma.patients.findMany.mockResolvedValue([
        {
          user: {
            core_profiles_user_id: [
              { date_of_birth: new Date('2020-01-01') },
            ],
          },
        },
        {
          user: {
            core_profiles_user_id: [
              { date_of_birth: new Date('2008-01-01') },
            ],
          },
        },
        {
          user: {
            core_profiles_user_id: [
              { date_of_birth: new Date('1995-01-01') },
            ],
          },
        },
        {
          user: {
            core_profiles_user_id: [
              { date_of_birth: new Date('1975-01-01') },
            ],
          },
        },
        {
          user: {
            core_profiles_user_id: [
              { date_of_birth: new Date('1950-01-01') },
            ],
          },
        },
        { user: { core_profiles_user_id: [] } },
      ]);
      prisma.invoices.findMany.mockResolvedValue([
        {
          invoice_date: new Date('2026-08-01'),
          total_amount: 1000,
          status: 'PAID',
        },
      ]);
      prisma.stockMovements.findMany.mockResolvedValue([
        {
          movement_type: 'DISPENSE',
          quantity_change: -5,
          created_at: new Date('2026-08-02T10:00:00Z'),
          batch: { medication: { medication_name: 'PCM' } },
        },
        {
          movement_type: 'RECEIVE',
          quantity_change: 10,
          created_at: new Date('2026-08-02T11:00:00Z'),
          batch: { medication: { medication_name: 'PCM' } },
        },
      ]);

      // Re-stub counts used inside Promise.all for dashboard
      prisma.patients.count.mockResolvedValue(5);
      prisma.appointments.count
        .mockResolvedValueOnce(3) // appointmentsToday
        .mockResolvedValueOnce(0); // listAppointments total
      prisma.outpatientVisits.count.mockResolvedValue(2);
      prisma.invoices.count.mockResolvedValue(4);

      const dash = await service.dashboardSummary();
      expect(dash.patients).toBe(5);
      expect(dash.appointmentsToday).toBe(3);
      expect(dash.activeVisits).toBe(2);
      expect(dash.doctors).toBe(7);
      expect(dash.invoicesOpen).toBe(4);
      expect(dash.deptDistribution.length).toBeGreaterThan(0);
      expect(dash.ageStages.some((b: { value: number }) => b.value > 0)).toBe(
        true,
      );
      expect(dash.reports.length).toBeGreaterThan(0);
    });
  });
});
