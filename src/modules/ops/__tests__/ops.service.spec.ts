/**
 * OpsService — operational write paths with Prisma + collaborator mocks.
 */

import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { OpsService } from '../ops.service';

jest.mock('../../billing/finance/ensure-foundation', () => ({
  ensureBillingFoundation: jest.fn().mockResolvedValue(undefined),
}));

describe('OpsService', () => {
  let prisma: Record<string, any>;
  let patientsService: { create: jest.Mock };
  let ipd: { admit: jest.Mock };
  let appointments: { create: jest.Mock; update: jest.Mock };
  let radiology: { create: jest.Mock };
  let service: OpsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      isConnected: true,
      staffProfiles: {
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'staff1', user_id: 'u1' }),
        update: jest.fn().mockResolvedValue({
          id: 'staff1',
          user_id: 'u1',
          employee_id: 'EMP-101',
          department_id: 'd1',
          position: 'Doctor',
          specialization: 'OBGYN',
        }),
      },
      beds: {
        findFirst: jest.fn().mockResolvedValue({ id: 'bed1' }),
      },
      scanTypes: {
        findUnique: jest.fn().mockResolvedValue({ id: 'st1', scan_type: 'X-Ray' }),
        findMany: jest.fn().mockResolvedValue([{ id: 'st1' }]),
      },
      radiologyRequests: { count: jest.fn().mockResolvedValue(0) },
      invoices: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'inv1' }),
      },
      laboratoryRequests: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      emergencyContacts: {
        create: jest.fn().mockResolvedValue({ id: 'ec1' }),
      },
      patients: {
        findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'p1' }),
        findMany: jest.fn().mockResolvedValue([
          { id: 'p1', patient_number: 'MRN-00123' },
        ]),
      },
      roles: {
        findUnique: jest.fn().mockResolvedValue({ id: 'role1', name: 'DOCTOR' }),
      },
      user: {
        create: jest.fn().mockResolvedValue({ id: 'u1' }),
        update: jest.fn().mockResolvedValue({ id: 'u1' }),
      },
      profiles: {
        create: jest.fn().mockResolvedValue({ id: 'pr1' }),
        findFirst: jest.fn().mockResolvedValue({ id: 'pr1', user_id: 'u1' }),
        update: jest.fn().mockResolvedValue({ id: 'pr1' }),
      },
      userRoles: { create: jest.fn().mockResolvedValue({}) },
      categories: {
        upsert: jest.fn().mockResolvedValue({ id: 'cat1' }),
      },
      medications: {
        create: jest.fn().mockResolvedValue({ id: 'med1', medication_name: 'PCM' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'med1' }),
      },
      batches: {
        create: jest.fn().mockResolvedValue({ id: 'b1' }),
        findFirst: jest.fn().mockResolvedValue({ id: 'b1', quantity_on_hand: 10 }),
        update: jest.fn().mockResolvedValue({ id: 'b1', quantity_on_hand: 60 }),
      },
      stockMovements: { create: jest.fn().mockResolvedValue({}) },
      conversations: {
        create: jest.fn().mockResolvedValue({
          id: 'c1',
          metadata: { unread: 0 },
        }),
        findFirst: jest.fn().mockResolvedValue({
          id: 'c1',
          deleted_at: null,
          metadata: { unread: 0, preview: 'x' },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      conversationParticipants: { create: jest.fn().mockResolvedValue({}) },
      messages: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({
          id: 'msg1',
          conversation_id: 'c1',
          sender_id: 'u1',
          created_at: new Date('2026-08-23T10:00:00Z'),
        }),
      },
      settings: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
      },
      insuranceProviders: {
        findFirst: jest.fn().mockResolvedValue({ id: 'sha1', code: 'SHA' }),
      },
      insurancePolicies: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'pol1' }),
      },
      accounts: {
        upsert: jest.fn().mockResolvedValue({ id: 'acct1' }),
      },
      paymentMethods: {
        upsert: jest.fn().mockResolvedValue({}),
      },
    };

    patientsService = {
      create: jest.fn().mockResolvedValue({ id: 'p1' }),
    };
    ipd = { admit: jest.fn().mockResolvedValue({ id: 'adm1' }) };
    appointments = {
      create: jest.fn().mockResolvedValue({ id: 'a1' }),
      update: jest.fn().mockResolvedValue({ id: 'a1', status: 'ARRIVED' }),
    };
    radiology = { create: jest.fn().mockResolvedValue({ id: 'rad1' }) };

    service = new OpsService(
      prisma as never,
      patientsService as never,
      ipd as never,
      appointments as never,
      radiology as never,
    );
  });

  it('rejects when database is disconnected', async () => {
    prisma.isConnected = false;
    await expect(
      service.createAppointment({
        patientId: 'p1',
        doctorId: 'd1',
        date: '2026-08-23',
        time: '09:00',
        createdBy: 'u1',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('creates appointments and validates time/type', async () => {
    await service.createAppointment({
      patientId: 'p1',
      doctorId: 'd1',
      date: '2026-08-23',
      time: '09:30',
      type: 'follow-up',
      reason: 'Review',
      notes: 'note',
      createdBy: 'u1',
    });
    expect(appointments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        patientId: 'p1',
        doctorId: 'd1',
        name: 'FOLLOW_UP',
        status: 'SCHEDULED',
      }),
    );

    await expect(
      service.createAppointment({
        patientId: 'p1',
        doctorId: 'd1',
        date: '2026-08-23',
        time: 'bad',
        createdBy: 'u1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.createAppointment({
        patientId: 'p1',
        doctorId: 'd1',
        date: '2026-08-23',
        time: '09:00',
        type: 'INVALID',
        createdBy: 'u1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('marks appointment arrived', async () => {
    await service.markAppointmentArrived('a1');
    expect(appointments.update).toHaveBeenCalledWith('a1', {
      status: 'ARRIVED',
    });
  });

  it('creates admissions with doctor/bed resolution', async () => {
    prisma.staffProfiles.findFirst.mockResolvedValue({ id: 'doc1' });
    await service.createAdmission({
      patientId: 'p1',
      wardId: 'w1',
      createdBy: 'u1',
    });
    expect(ipd.admit).toHaveBeenCalledWith(
      expect.objectContaining({
        patientId: 'p1',
        bedId: 'bed1',
        admittingDoctorId: 'doc1',
      }),
    );

    prisma.staffProfiles.findFirst.mockResolvedValue(null);
    prisma.beds.findFirst.mockResolvedValue(null);
    await expect(
      service.createAdmission({
        patientId: 'p1',
        wardId: 'w1',
        createdBy: 'u1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.staffProfiles.findFirst.mockResolvedValue({ id: 'doc1' });
    await expect(
      service.createAdmission({
        patientId: 'p1',
        wardId: 'w1',
        createdBy: 'u1',
        admittingDoctorId: 'doc1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates radiology requests', async () => {
    await service.createRadiologyRequest({
      patientId: 'p1',
      scanTypeId: 'st1',
      createdBy: 'u1',
      indication: 'Pain',
    });
    expect(radiology.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: expect.stringMatching(/^RAD-/),
        patientId: 'p1',
        status: 'SCHEDULED',
      }),
    );

    prisma.scanTypes.findUnique.mockResolvedValue(null);
    await expect(
      service.createRadiologyRequest({
        patientId: 'p1',
        scanTypeId: 'missing',
        createdBy: 'u1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates invoices', async () => {
    await service.createInvoice({
      patientId: 'p1',
      amount: 2500,
      description: 'Consult',
      createdBy: 'u1',
    });
    expect(prisma.invoices.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          patient_id: 'p1',
          total_amount: 2500,
          status: 'ISSUED',
        }),
      }),
    );
  });

  it('lists lab requests with note parsing and scan types', async () => {
    prisma.laboratoryRequests.findMany.mockResolvedValue([
      {
        id: 'lr1',
        notes: JSON.stringify({ tests: [{ name: 'CBC' }, { name: 'UEC' }] }),
        priority: 'URGENT',
        status: 'PENDING',
        patient: {
          patient_number: 'MRN-1',
          user: {
            core_profiles_user_id: [{ first_name: 'Ann', last_name: 'W' }],
          },
        },
        requesting_doctor: {
          user: {
            core_profiles_user_id: [{ first_name: 'Ada', last_name: 'Okello' }],
          },
        },
      },
      {
        id: 'lr2',
        notes: 'not-json',
        priority: 'ROUTINE',
        status: 'COMPLETED',
        patient: {
          patient_number: 'MRN-2',
          user: { core_profiles_user_id: [] },
        },
        requesting_doctor: null,
      },
    ]);

    const labs = await service.listLabRequests();
    expect(labs[0]).toEqual(
      expect.objectContaining({
        test: 'CBC, UEC',
        patient: 'Ann W',
        requestedBy: 'Dr. Ada Okello',
        priority: 'Urgent',
        status: 'Pending',
      }),
    );
    expect(labs[1]).toEqual(
      expect.objectContaining({
        patient: 'MRN-2',
        requestedBy: 'Clinical team',
        priority: 'Routine',
        status: 'Completed',
      }),
    );

    await service.listScanTypes();
    expect(prisma.scanTypes.findMany).toHaveBeenCalled();
  });

  it('creates patients with optional emergency contact', async () => {
    await service.createPatient({
      firstName: 'Ann',
      lastName: 'Wanjiku',
      gender: 'Female',
      phone: '+254700',
      createdBy: 'u1',
      emergencyContactName: 'Kin',
      emergencyContactPhone: '+254701',
    });
    expect(patientsService.create).toHaveBeenCalledWith(
      expect.objectContaining({ gender: 'FEMALE' }),
    );
    expect(prisma.emergencyContacts.create).toHaveBeenCalled();

    await service.createPatient({
      firstName: 'Bob',
      lastName: 'O',
      gender: 'Other',
      phone: '+254',
      createdBy: 'u1',
    });
    expect(patientsService.create).toHaveBeenCalledWith(
      expect.objectContaining({ gender: 'OTHER' }),
    );
  });

  it('creates staff and rejects unknown roles', async () => {
    const staff = await service.createStaff({
      firstName: 'Ada',
      lastName: 'Okello',
      email: 'Ada@X.com',
      role: 'doctor',
      asDoctor: true,
      specialty: 'OBGYN',
      departmentId: 'd1',
      phone: '+254',
    });
    expect(staff.id).toBe('staff1');
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: 'ada@x.com' }),
      }),
    );

    prisma.roles.findUnique.mockResolvedValue(null);
    await expect(
      service.createStaff({
        firstName: 'X',
        lastName: 'Y',
        email: 'x@y.com',
        role: 'NOPE',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates and reorders medications', async () => {
    await service.createMedication({
      name: 'Paracetamol',
      category: 'Analgesic',
      quantity: 100,
      expiry: '2027-01-01',
      createdBy: 'u1',
    });
    expect(prisma.medications.create).toHaveBeenCalled();
    expect(prisma.stockMovements.create).toHaveBeenCalled();

    await service.reorderMedication({
      medicationId: 'med1',
      quantity: 50,
      createdBy: 'u1',
    });
    expect(prisma.batches.update).toHaveBeenCalled();

    prisma.batches.findFirst.mockResolvedValue(null);
    await service.reorderMedication({
      medicationId: 'med1',
      quantity: 10,
      createdBy: 'u1',
    });
    expect(prisma.batches.create).toHaveBeenCalled();

    prisma.medications.findUnique.mockResolvedValue(null);
    await expect(
      service.reorderMedication({
        medicationId: 'missing',
        quantity: 1,
        createdBy: 'u1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('manages conversations and messages', async () => {
    await service.createConversation({
      name: 'Ward',
      preview: 'Hello team',
      createdBy: 'u1',
    });
    expect(prisma.conversations.create).toHaveBeenCalled();
    expect(prisma.messages.create).toHaveBeenCalled();

    prisma.messages.findMany.mockResolvedValue([
      {
        id: 'm1',
        conversation_id: 'c1',
        sender_id: 'u1',
        encrypted_payload: JSON.stringify({ text: 'Hi' }),
        created_at: new Date('2026-08-23T10:00:00Z'),
        sender: {
          email: 'a@x.com',
          core_profiles_user_id: [{ first_name: 'Ada', last_name: 'O' }],
        },
      },
      {
        id: 'm2',
        conversation_id: 'c1',
        sender_id: 'u2',
        encrypted_payload: 'plain',
        created_at: new Date('2026-08-23T10:01:00Z'),
        sender: { email: 'b@x.com', core_profiles_user_id: [] },
      },
    ]);
    const msgs = await service.listMessages('c1');
    expect(msgs[0].body).toBe('Hi');
    expect(msgs[0].senderName).toBe('Ada O');
    expect(msgs[1].senderName).toBe('b@x.com');

    prisma.conversations.findFirst.mockResolvedValue(null);
    await expect(service.listMessages('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    prisma.conversations.findFirst.mockResolvedValue({
      id: 'c1',
      deleted_at: null,
      metadata: { unread: 2 },
    });
    await expect(
      service.postMessage({ conversationId: 'c1', body: '  ', senderId: 'u1' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const posted = await service.postMessage({
      conversationId: 'c1',
      body: 'New note',
      senderId: 'u1',
    });
    expect(posted.body).toBe('New note');
    expect(prisma.conversations.update).toHaveBeenCalled();
  });

  it('gets and updates hospital settings', async () => {
    prisma.settings.findMany.mockResolvedValue([
      { key: 'hospital.name', value: 'Clinic' },
      { key: 'hospital.phone', value: '+254' },
    ]);
    const settings = await service.getHospitalSettings();
    expect(settings.name).toBe('Clinic');
    expect(settings.timezone).toBe('Africa/Nairobi');

    await service.updateHospitalSettings(
      { name: 'NyaLife', phone: '+254700' },
      'u1',
    );
    expect(prisma.settings.upsert).toHaveBeenCalled();
  });

  it('lists and upserts system settings with seeding', async () => {
    prisma.settings.findMany
      .mockResolvedValueOnce([]) // ensureSettingsSeeded existing keys
      .mockResolvedValueOnce([
        {
          key: 'currency',
          label: 'Currency',
          value: 'KES',
          type: 'text',
          group_name: 'general',
          is_public: true,
          updated_at: new Date('2026-08-23T10:00:00Z'),
        },
      ]);

    const listed = await service.listSystemSettings('general');
    expect(listed.groups[0].name).toBe('general');
    expect(prisma.settings.create).toHaveBeenCalled();

    prisma.settings.findMany.mockResolvedValue([]);
    await expect(service.upsertSystemSettings([], 'u1')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    prisma.settings.findMany
      .mockResolvedValueOnce([]) // seed
      .mockResolvedValueOnce([]) // list after upsert
      .mockResolvedValueOnce([]);
    await service.upsertSystemSettings(
      [
        { key: 'currency', value: 'USD' },
        { key: 'hospital_name', value: 'NyaLife' },
        { key: 'custom_key', value: 'x', groupName: 'general' },
      ],
      'u1',
    );
    expect(prisma.settings.upsert).toHaveBeenCalled();

    await expect(
      service.upsertSystemSettings(
        [{ key: 'unknown_only', value: 'x' }],
        'u1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.upsertSystemSettings(
        [{ key: 'logo', value: 'x'.repeat(1_500_001) }],
        'u1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates and deactivates staff', async () => {
    prisma.staffProfiles.findFirst.mockResolvedValue({
      id: 'staff1',
      user_id: 'u1',
      deleted_at: null,
    });
    const updated = await service.updateStaff('staff1', {
      firstName: 'Ada',
      lastName: 'Okello',
      phone: '+254',
      departmentId: 'd1',
      position: 'Consultant',
      specialty: 'OBGYN',
    });
    expect(updated.position).toBe('Doctor');
    expect(prisma.profiles.update).toHaveBeenCalled();

    prisma.staffProfiles.findFirst.mockResolvedValue(null);
    await expect(
      service.updateStaff('missing', { firstName: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    prisma.staffProfiles.findFirst.mockResolvedValue({
      id: 'staff1',
      user_id: 'u1',
      deleted_at: null,
    });
    const deactivated = await service.deactivateStaff('staff1');
    expect(deactivated).toEqual({ ok: true, id: 'staff1' });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { is_active: false },
      }),
    );

    prisma.staffProfiles.findFirst.mockResolvedValue(null);
    await expect(service.deactivateStaff('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('bootstraps billing and SHA policies', async () => {
    const result = await service.bootstrapBillingAndPolicies();
    expect(result.feeSchedule).toBe(true);
    expect(result.policiesCreated).toBe(1);
    expect(prisma.insurancePolicies.create).toHaveBeenCalled();
    expect(prisma.paymentMethods.upsert).toHaveBeenCalled();
  });
});
