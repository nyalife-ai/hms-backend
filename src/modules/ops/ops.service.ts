import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { CONVERSATION_TYPES } from '../communication/constants/messaging.constants';
import { MessagingService } from '../communication/services/messaging.service';
import { IpdJourneyUseCase } from '../inpatient/use-cases/ipd-journey.usecase';
import { PatientsService } from '../patients/patients.service';
import { RadiologyService } from '../radiology/radiology.service';

@Injectable()
export class OpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patientsService: PatientsService,
    private readonly ipd: IpdJourneyUseCase,
    private readonly appointments: AppointmentsService,
    private readonly radiology: RadiologyService,
    private readonly messaging: MessagingService,
  ) {}

  private requireDb(): void {
    if (!this.prisma.isConnected) {
      throw new ServiceUnavailableException('Database unavailable');
    }
  }

  async createAppointment(input: {
    patientId: string;
    doctorId: string;
    date: string;
    time: string;
    type?: string;
    reason?: string;
    notes?: string;
    createdBy: string;
  }) {
    this.requireDb();
    const [h, m] = input.time.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) {
      throw new BadRequestException('time must be HH:MM');
    }
    const day = new Date(input.date);
    day.setHours(0, 0, 0, 0);
    const start = new Date(day);
    start.setHours(h, m, 0, 0);
    const end = new Date(start.getTime() + 30 * 60_000);
    const type = (input.type || 'CONSULTATION').toUpperCase().replace(/[\s-]/g, '_');
    const allowed = ['NEW_PATIENT', 'FOLLOW_UP', 'CONSULTATION', 'EMERGENCY'];
    if (!allowed.includes(type)) {
      throw new BadRequestException(`appointment type must be one of ${allowed.join(', ')}`);
    }
    return this.appointments.create({
      patientId: input.patientId,
      doctorId: input.doctorId,
      appointmentDate: input.date,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      createdBy: input.createdBy,
      name: type,
      description: input.reason?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
      status: 'SCHEDULED',
    });
  }

  async markAppointmentArrived(appointmentId: string) {
    this.requireDb();
    return this.appointments.update(appointmentId, { status: 'ARRIVED' });
  }

  async createAdmission(input: {
    patientId: string;
    wardId: string;
    createdBy: string;
    admittingDoctorId?: string;
    reason?: string;
  }) {
    this.requireDb();
    const doctorId =
      input.admittingDoctorId ||
      (
        await this.prisma.staffProfiles.findFirst({
          where: { user: { email: 'a.okello@nyalife.health' } },
        })
      )?.id;
    if (!doctorId) {
      throw new BadRequestException('Admitting doctor is required');
    }
    const bed = await this.prisma.beds.findFirst({
      where: { ward_id: input.wardId, status: 'AVAILABLE' },
      orderBy: { bed_number: 'asc' },
    });
    if (!bed) throw new BadRequestException('No available beds in this ward');

    // Domain ownership: IPD journey owns admit + bed occupancy (transactional).
    return this.ipd.admit({
      patientId: input.patientId,
      bedId: bed.id,
      admittingDoctorId: doctorId,
      primaryDiagnosis: input.reason || 'Clinical admission',
    });
  }

  async createRadiologyRequest(input: {
    patientId: string;
    scanTypeId: string;
    requestingDoctorId?: string;
    createdBy: string;
    indication?: string;
  }) {
    this.requireDb();
    const scan = await this.prisma.scanTypes.findUnique({
      where: { id: input.scanTypeId },
    });
    if (!scan) throw new NotFoundException('Scan type not found');
    const seq = await this.prisma.radiologyRequests.count();
    const requestNumber = `RAD-${new Date().getFullYear()}-${String(seq + 1).padStart(4, '0')}`;
    return this.radiology.create({
      name: requestNumber,
      patientId: input.patientId,
      scanTypeId: input.scanTypeId,
      requestedBy: input.createdBy,
      requestingDoctorId: input.requestingDoctorId,
      description: input.indication || 'Clinical imaging',
      status: 'SCHEDULED',
      priority: 'ROUTINE',
    });
  }

  async createInvoice(input: {
    patientId: string;
    amount: number;
    description: string;
    createdBy: string;
  }) {
    this.requireDb();
    const seq = await this.prisma.invoices.count();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(today);
    due.setDate(due.getDate() + 14);
    return this.prisma.invoices.create({
      data: {
        invoice_number: `INV-${new Date().getFullYear()}-${String(seq + 1).padStart(4, '0')}`,
        patient_id: input.patientId,
        invoice_date: today,
        due_date: due,
        subtotal: input.amount,
        total_amount: input.amount,
        status: 'ISSUED',
        notes: input.description,
        created_by: input.createdBy,
        billing_invoice_items_invoice_id: {
          create: [
            {
              description: input.description,
              quantity: 1,
              unit_price: input.amount,
              total_price: input.amount,
            },
          ],
        },
      },
    });
  }

  async listLabRequests() {
    this.requireDb();
    const rows = await this.prisma.laboratoryRequests.findMany({
      include: {
        patient: {
          include: { user: { include: { core_profiles_user_id: true } } },
        },
        requesting_doctor: {
          include: { user: { include: { core_profiles_user_id: true } } },
        },
      },
      orderBy: { created_at: 'desc' },
      take: 40,
    });
    return rows.map((r) => {
      const pp = r.patient.user.core_profiles_user_id[0];
      const dp = r.requesting_doctor?.user.core_profiles_user_id[0];
      let test = 'Laboratory panel';
      try {
        const notes = JSON.parse(r.notes || '{}') as {
          tests?: Array<{ name: string }>;
          doctorName?: string;
        };
        if (notes.tests?.length) {
          test = notes.tests.map((t) => t.name).join(', ');
        }
      } catch {
        /* ignore */
      }
      const statusMap: Record<string, string> = {
        PENDING: 'Pending',
        IN_PROGRESS: 'In Progress',
        COMPLETED: 'Completed',
        CANCELLED: 'Cancelled',
      };
      return {
        id: r.id,
        patient: pp
          ? `${pp.first_name} ${pp.last_name}`
          : r.patient.patient_number,
        test,
        requestedBy: dp
          ? `Dr. ${dp.first_name} ${dp.last_name}`
          : 'Clinical team',
        priority: r.priority === 'URGENT' || r.priority === 'STAT' ? 'Urgent' : 'Routine',
        status: statusMap[r.status] || r.status,
      };
    });
  }

  async listScanTypes() {
    this.requireDb();
    return this.prisma.scanTypes.findMany({
      where: { is_active: true },
      orderBy: { scan_type: 'asc' },
    });
  }

  async createPatient(input: {
    firstName: string;
    lastName: string;
    gender: 'Male' | 'Female' | 'Other';
    phone: string;
    dateOfBirth?: string;
    allergies?: string;
    chronicDiseases?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    createdBy: string;
  }) {
    this.requireDb();
    void input.createdBy;
    const genderDb =
      input.gender === 'Female'
        ? 'FEMALE'
        : input.gender === 'Other'
          ? 'OTHER'
          : 'MALE';
    const created = await this.patientsService.create({
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      gender: genderDb,
      dateOfBirth: input.dateOfBirth,
      allergies: input.allergies,
      chronicDiseases: input.chronicDiseases,
    });

    const kinName = input.emergencyContactName?.trim();
    const kinPhone = input.emergencyContactPhone?.trim();
    if (kinName || kinPhone) {
      await this.prisma.emergencyContacts.create({
        data: {
          patient_id: created.id,
          name: kinName || 'Next of kin',
          phone: kinPhone || '—',
          relationship: 'NEXT_OF_KIN',
          is_primary: true,
        },
      });
    }

    return this.prisma.patients.findFirstOrThrow({
      where: { id: created.id },
    });
  }

  async createStaff(input: {
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    specialty?: string;
    departmentId?: string;
    phone?: string;
    asDoctor?: boolean;
  }) {
    this.requireDb();
    const bcrypt = await import('bcryptjs');
    const roleName = input.role.toUpperCase();
    const role = await this.prisma.roles.findUnique({ where: { name: roleName } });
    if (!role) throw new BadRequestException(`Unknown role ${roleName}`);

    const passwordHash = await bcrypt.hash('nyalife123', 10);
    const user = await this.prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        password_hash: passwordHash,
        is_active: true,
        email_verified_at: new Date(),
      },
    });
    await this.prisma.profiles.create({
      data: {
        user_id: user.id,
        first_name: input.firstName,
        last_name: input.lastName,
        phone: input.phone,
      },
    });
    await this.prisma.userRoles.create({
      data: { user_id: user.id, role_id: role.id },
    });
    const staffCount = await this.prisma.staffProfiles.count();
    return this.prisma.staffProfiles.create({
      data: {
        user_id: user.id,
        employee_id: `EMP-${String(100 + staffCount + 1).padStart(3, '0')}`,
        department_id: input.departmentId,
        specialization: input.specialty || (input.asDoctor ? roleName : null),
        position: input.asDoctor ? 'Doctor' : roleName,
        join_date: new Date(),
        is_active: true,
      },
    });
  }

  async createMedication(input: {
    name: string;
    category?: string;
    unit?: string;
    quantity: number;
    expiry: string;
    createdBy: string;
  }) {
    this.requireDb();
    let categoryId: string | undefined;
    if (input.category) {
      const cat = await this.prisma.categories.upsert({
        where: { category_name: input.category },
        create: { category_name: input.category },
        update: {},
      });
      categoryId = cat.id;
    }
    const med = await this.prisma.medications.create({
      data: {
        medication_name: input.name,
        category_id: categoryId,
        unit: input.unit || 'units',
        is_active: true,
      },
    });
    const batch = await this.prisma.batches.create({
      data: {
        medication_id: med.id,
        batch_number: `B-${Date.now().toString(36).toUpperCase()}`,
        quantity_on_hand: input.quantity,
        expiry_date: new Date(input.expiry),
        created_by: input.createdBy,
      },
    });
    await this.prisma.stockMovements.create({
      data: {
        batch_id: batch.id,
        movement_type: 'RECEIVE',
        quantity_change: input.quantity,
        notes: 'Initial stock',
        performed_by: input.createdBy,
      },
    });
    return med;
  }

  async reorderMedication(input: {
    medicationId: string;
    quantity: number;
    createdBy: string;
  }) {
    this.requireDb();
    const med = await this.prisma.medications.findUnique({
      where: { id: input.medicationId },
    });
    if (!med) throw new NotFoundException('Medication not found');
    let batch = await this.prisma.batches.findFirst({
      where: { medication_id: med.id },
      orderBy: { created_at: 'desc' },
    });
    if (!batch) {
      batch = await this.prisma.batches.create({
        data: {
          medication_id: med.id,
          batch_number: `B-${Date.now().toString(36).toUpperCase()}`,
          quantity_on_hand: 0,
          expiry_date: new Date(Date.now() + 365 * 86400_000),
          created_by: input.createdBy,
        },
      });
    }
    const updated = await this.prisma.batches.update({
      where: { id: batch.id },
      data: {
        quantity_on_hand: {
          increment: input.quantity,
        },
      },
    });
    await this.prisma.stockMovements.create({
      data: {
        batch_id: batch.id,
        movement_type: 'RECEIVE',
        quantity_change: input.quantity,
        notes: 'Reorder receipt',
        performed_by: input.createdBy,
      },
    });
    return updated;
  }

  async createConversation(input: {
    name: string;
    preview?: string;
    createdBy: string;
    participantIds?: string[];
    type?: string;
  }) {
    this.requireDb();
    const participantIds = [
      ...new Set(
        (input.participantIds ?? []).filter((id) => id && id !== input.createdBy),
      ),
    ];

    if (participantIds.length) {
      const type = (input.type || 'DIRECT').toUpperCase();
      return this.messaging.createConversation(input.createdBy, {
        type: type as 'DIRECT' | 'GROUP' | 'DEPARTMENT' | 'TEAM' | 'SYSTEM',
        participantIds,
        name: input.name,
        initialMessage: input.preview?.trim() || undefined,
      });
    }

    // Legacy ops path: named conversation with creator only.
    const conversation = await this.prisma.conversations.create({
      data: {
        conversation_type: CONVERSATION_TYPES.DIRECT,
        name: input.name,
        created_by: input.createdBy,
        metadata: {
          preview: input.preview || 'Conversation started',
          unread: 0,
        },
      },
    });
    await this.prisma.conversationParticipants.create({
      data: {
        conversation_id: conversation.id,
        user_id: input.createdBy,
        role: 'ADMIN',
      },
    });
    if (input.preview?.trim()) {
      await this.postMessage({
        conversationId: conversation.id,
        body: input.preview.trim(),
        senderId: input.createdBy,
      });
    }
    return conversation;
  }

  async listMessages(conversationId: string, actorId?: string) {
    this.requireDb();
    if (actorId) {
      const result = await this.messaging.listMessages(actorId, conversationId, {
        limit: 200,
      });
      return result.items.map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        senderId: m.senderId,
        senderName: m.senderName,
        body: m.body,
        createdAt: m.createdAt,
      }));
    }

    const conversation = await this.prisma.conversations.findFirst({
      where: { id: conversationId, deleted_at: null },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const rows = await this.prisma.messages.findMany({
      where: { conversation_id: conversationId, is_deleted: false },
      include: {
        sender: { include: { core_profiles_user_id: true } },
      },
      orderBy: { created_at: 'asc' },
      take: 200,
    });

    return rows.map((m) => {
      const profile = m.sender.core_profiles_user_id[0];
      let text = m.encrypted_payload;
      try {
        const parsed = JSON.parse(m.encrypted_payload) as { text?: string };
        if (parsed?.text) text = parsed.text;
      } catch {
        /* plain text / base64 fallback */
      }
      return {
        id: m.id,
        conversationId: m.conversation_id,
        senderId: m.sender_id,
        senderName: profile
          ? `${profile.first_name} ${profile.last_name}`
          : m.sender.email,
        body: text,
        createdAt: m.created_at.toISOString(),
      };
    });
  }

  async postMessage(input: {
    conversationId: string;
    body: string;
    senderId: string;
  }) {
    this.requireDb();
    return this.messaging.sendMessage(input.senderId, input.conversationId, {
      body: input.body,
      messageType: 'TEXT',
    });
  }

  async getHospitalSettings() {
    this.requireDb();
    const keys = [
      'hospital.name',
      'hospital.phone',
      'hospital.email',
      'hospital.address',
      'hospital.timezone',
    ];
    const rows = await this.prisma.settings.findMany({
      where: { key: { in: keys } },
    });
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return {
      name: map['hospital.name'] || 'NyaLife Health',
      phone: map['hospital.phone'] || '',
      email: map['hospital.email'] || '',
      address: map['hospital.address'] || '',
      timezone: map['hospital.timezone'] || 'Africa/Nairobi',
    };
  }

  async updateHospitalSettings(
    input: {
      name?: string;
      phone?: string;
      email?: string;
      address?: string;
      timezone?: string;
    },
    updatedBy: string,
  ) {
    this.requireDb();
    const pairs: Array<[keyof typeof input, string, string]> = [
      ['name', 'hospital.name', 'Hospital name'],
      ['phone', 'hospital.phone', 'Hospital phone'],
      ['email', 'hospital.email', 'Hospital email'],
      ['address', 'hospital.address', 'Hospital address'],
      ['timezone', 'hospital.timezone', 'Timezone'],
    ];
    for (const [field, key, label] of pairs) {
      if (input[field] === undefined) continue;
      const value = String(input[field] ?? '');
      await this.prisma.settings.upsert({
        where: { key },
        create: {
          key,
          value,
          type: 'text',
          group_name: 'hospital',
          label,
          is_public: true,
          updated_by: updatedBy,
        },
        update: {
          value,
          updated_by: updatedBy,
        },
      });
    }
    return this.getHospitalSettings();
  }

  /** Catalog defaults for general / about / contact settings groups. */
  private settingsCatalog(): Array<{
    key: string;
    label: string;
    value: string;
    type: string;
    group_name: string;
    is_public: boolean;
  }> {
    return [
      {
        key: 'appointment_interval',
        label: 'Appointment Interval (minutes)',
        value: '30',
        type: 'number',
        group_name: 'general',
        is_public: false,
      },
      {
        key: 'consultation_fee_service_code',
        label: 'Triage Consultation Fee Service',
        value: '',
        type: 'text',
        group_name: 'general',
        is_public: false,
      },
      {
        key: 'consultation_fee_enabled',
        label: 'Charge Consultation Fee on Check-in',
        value: 'true',
        type: 'boolean',
        group_name: 'general',
        is_public: true,
      },
      {
        key: 'currency',
        label: 'Currency',
        value: 'KES',
        type: 'text',
        group_name: 'general',
        is_public: true,
      },
      {
        key: 'hospital_address',
        label: 'Hospital Address',
        value: '7514-00200, Nairobi',
        type: 'text',
        group_name: 'general',
        is_public: true,
      },
      {
        key: 'hospital_email',
        label: 'Hospital Email',
        value: 'info@nyalifewomensclinic.com',
        type: 'text',
        group_name: 'general',
        is_public: true,
      },
      {
        key: 'hospital_name',
        label: 'Hospital Name',
        value: 'Nyalife HMS',
        type: 'text',
        group_name: 'general',
        is_public: true,
      },
      {
        key: 'hospital_phone',
        label: 'Hospital Phone',
        value: '+254746516514',
        type: 'text',
        group_name: 'general',
        is_public: true,
      },
      {
        key: 'logo',
        label: 'Clinic Logo',
        value: '',
        type: 'text',
        group_name: 'general',
        is_public: true,
      },
      {
        key: 'primary_color',
        label: 'Primary Color',
        value: '#058b7c',
        type: 'text',
        group_name: 'general',
        is_public: true,
      },
      {
        key: 'secondary_color',
        label: 'Secondary Color',
        value: '#d41559',
        type: 'text',
        group_name: 'general',
        is_public: true,
      },
      {
        key: 'tax_rate',
        label: 'Standard Tax Rate (%)',
        value: '16',
        type: 'number',
        group_name: 'general',
        is_public: false,
      },
      {
        key: 'working_days',
        label: 'Working Days',
        value: 'Monday,Tuesday,Wednesday,Thursday,Friday',
        type: 'text',
        group_name: 'general',
        is_public: true,
      },
      {
        key: 'working_hours_end',
        label: 'Working Hours End',
        value: '17:00:00',
        type: 'text',
        group_name: 'general',
        is_public: true,
      },
      {
        key: 'working_hours_start',
        label: 'Working Hours Start',
        value: '08:00:00',
        type: 'text',
        group_name: 'general',
        is_public: true,
      },
      {
        key: 'about_description',
        label: 'Detailed About Description',
        value:
          "Nyalife Women's Clinic is a specialized healthcare facility dedicated to providing comprehensive obstetrics and gynecology services to women at every stage of life.",
        type: 'text',
        group_name: 'about',
        is_public: true,
      },
      {
        key: 'contact_address',
        label: 'Clinic Physical Address',
        value:
          'JemPark Complex building suite A5 in Sabaki, About 500meters from Mlolongo in Athi River, Machakos',
        type: 'text',
        group_name: 'contact',
        is_public: true,
      },
      {
        key: 'contact_email',
        label: 'Contact Email Address',
        value: 'info@nyalifewomensclinic.com',
        type: 'text',
        group_name: 'contact',
        is_public: true,
      },
      {
        key: 'contact_hours',
        label: 'Clinic Hours',
        value: 'Mon – Sat: 8:00 AM – 6:00 PM',
        type: 'text',
        group_name: 'contact',
        is_public: true,
      },
      {
        key: 'contact_maps_url',
        label: 'Google Maps Directions URL',
        value: "https://maps.google.com/?q=Nyalife+Women%27s+Clinic+Athi+River",
        type: 'text',
        group_name: 'contact',
        is_public: true,
      },
      {
        key: 'contact_phone',
        label: 'Contact Phone Number',
        value: '+254746516514',
        type: 'text',
        group_name: 'contact',
        is_public: true,
      },
      {
        key: 'instagram_url',
        label: 'Instagram Profile URL',
        value: 'https://www.instagram.com/nyalife_womenshealth',
        type: 'text',
        group_name: 'contact',
        is_public: true,
      },
      {
        key: 'linkedin_url',
        label: 'LinkedIn Profile URL',
        value: 'https://www.linkedin.com/company/nyalife-women-s-health/',
        type: 'text',
        group_name: 'contact',
        is_public: true,
      },
    ];
  }

  private async ensureSettingsSeeded(updatedBy?: string): Promise<void> {
    const catalog = this.settingsCatalog();
    const keys = catalog.map((c) => c.key);
    const existing = await this.prisma.settings.findMany({
      where: { key: { in: keys } },
      select: { key: true },
    });
    const have = new Set(existing.map((r) => r.key));
    for (const item of catalog) {
      if (have.has(item.key)) continue;
      await this.prisma.settings.create({
        data: {
          key: item.key,
          value: item.value,
          type: item.type,
          group_name: item.group_name,
          label: item.label,
          is_public: item.is_public,
          updated_by: updatedBy ?? null,
        },
      });
    }
  }

  async listSystemSettings(group?: string) {
    this.requireDb();
    await this.ensureSettingsSeeded();
    const groups = group
      ? [group]
      : ['general', 'about', 'contact'];
    const rows = await this.prisma.settings.findMany({
      where: { group_name: { in: groups } },
      orderBy: [{ group_name: 'asc' }, { key: 'asc' }],
    });
    return {
      groups: groups.map((g) => ({
        name: g,
        items: rows
          .filter((r) => r.group_name === g)
          .map((r) => ({
            key: r.key,
            label: r.label || r.key,
            value: r.value,
            type: r.type,
            groupName: r.group_name,
            isPublic: r.is_public,
            updatedAt: r.updated_at.toISOString(),
          })),
      })),
    };
  }

  async upsertSystemSettings(
    items: Array<{
      key: string;
      value: string;
      label?: string;
      type?: string;
      groupName?: string;
    }>,
    updatedBy: string,
  ) {
    this.requireDb();
    if (!items?.length) {
      throw new BadRequestException('Provide at least one setting to update');
    }
    await this.ensureSettingsSeeded(updatedBy);
    const catalog = this.settingsCatalog();
    const byKey = new Map(catalog.map((c) => [c.key, c]));

    for (const item of items) {
      const key = item.key?.trim();
      if (!key) continue;
      const def = byKey.get(key);
      if (!def && !item.groupName) {
        throw new BadRequestException(`Unknown setting key: ${key}`);
      }
      const value = String(item.value ?? '');
      if (key === 'logo' && value.length > 1_500_000) {
        throw new BadRequestException('Logo is too large (max ~1MB encoded)');
      }
      const groupName = item.groupName || def?.group_name || 'general';
      const label = item.label || def?.label || key;
      const type = item.type || def?.type || 'text';
      const isPublic = def?.is_public ?? false;

      await this.prisma.settings.upsert({
        where: { key },
        create: {
          key,
          value,
          type,
          group_name: groupName,
          label,
          is_public: isPublic,
          updated_by: updatedBy,
        },
        update: {
          value,
          type,
          group_name: groupName,
          label,
          updated_by: updatedBy,
        },
      });

      // Keep legacy hospital.* keys in sync for older consumers
      const legacy: Record<string, string> = {
        hospital_name: 'hospital.name',
        hospital_phone: 'hospital.phone',
        hospital_email: 'hospital.email',
        hospital_address: 'hospital.address',
      };
      const legacyKey = legacy[key];
      if (legacyKey) {
        await this.prisma.settings.upsert({
          where: { key: legacyKey },
          create: {
            key: legacyKey,
            value,
            type: 'text',
            group_name: 'hospital',
            label,
            is_public: true,
            updated_by: updatedBy,
          },
          update: { value, updated_by: updatedBy },
        });
      }
    }

    const groupNames = [
      ...new Set(
        items
          .map((i) => i.groupName || byKey.get(i.key)?.group_name)
          .filter((g): g is string => Boolean(g)),
      ),
    ];
    if (groupNames.length === 1) {
      return this.listSystemSettings(groupNames[0]);
    }
    return this.listSystemSettings();
  }

  async updateStaff(
    staffId: string,
    input: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      departmentId?: string | null;
      position?: string;
      specialty?: string;
    },
  ) {
    this.requireDb();
    const staff = await this.prisma.staffProfiles.findFirst({
      where: { id: staffId, deleted_at: null },
    });
    if (!staff) throw new NotFoundException('Staff member not found');

    if (input.firstName || input.lastName || input.phone !== undefined) {
      const profile = await this.prisma.profiles.findFirst({
        where: { user_id: staff.user_id },
      });
      if (profile) {
        await this.prisma.profiles.update({
          where: { id: profile.id },
          data: {
            ...(input.firstName?.trim()
              ? { first_name: input.firstName.trim() }
              : {}),
            ...(input.lastName?.trim()
              ? { last_name: input.lastName.trim() }
              : {}),
            ...(input.phone !== undefined
              ? { phone: input.phone?.trim() || null }
              : {}),
          },
        });
      }
    }

    const updated = await this.prisma.staffProfiles.update({
      where: { id: staffId },
      data: {
        ...(input.departmentId !== undefined
          ? { department_id: input.departmentId || null }
          : {}),
        ...(input.position !== undefined
          ? { position: input.position?.trim() || null }
          : {}),
        ...(input.specialty !== undefined
          ? { specialization: input.specialty?.trim() || null }
          : {}),
      },
    });
    return {
      id: updated.id,
      userId: updated.user_id,
      employeeId: updated.employee_id,
      departmentId: updated.department_id,
      position: updated.position,
      specialty: updated.specialization,
    };
  }

  async deactivateStaff(staffId: string) {
    this.requireDb();
    const staff = await this.prisma.staffProfiles.findFirst({
      where: { id: staffId, deleted_at: null },
    });
    if (!staff) throw new NotFoundException('Staff member not found');
    await this.prisma.staffProfiles.update({
      where: { id: staffId },
      data: { is_active: false, deleted_at: new Date() },
    });
    await this.prisma.user.update({
      where: { id: staff.user_id },
      data: { is_active: false },
    });
    return { ok: true, id: staffId };
  }

  /** Upsert policies + fee schedule without wiping data. */
  async bootstrapBillingAndPolicies() {
    this.requireDb();
    const sha = await this.prisma.insuranceProviders.findFirst({
      where: { code: 'SHA' },
    });
    const patients = await this.prisma.patients.findMany({ take: 20 });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(today);
    expiry.setFullYear(expiry.getFullYear() + 1);
    let policies = 0;
    if (sha) {
      for (const p of patients) {
        const number = `SHA-${p.patient_number.replace(/\D/g, '').slice(-5) || '00000'}`;
        const existing = await this.prisma.insurancePolicies.findFirst({
          where: { patient_id: p.id, provider_id: sha.id },
        });
        if (existing) continue;
        await this.prisma.insurancePolicies.create({
          data: {
            patient_id: p.id,
            provider_id: sha.id,
            policy_number: number,
            start_date: today,
            expiry_date: expiry,
            is_active: true,
          },
        });
        policies += 1;
      }
    }
    const cashAcct = await this.prisma.accounts.upsert({
      where: { account_code: '1000' },
      create: {
        account_code: '1000',
        account_name: 'Cash on Hand',
        account_type: 'ASSET',
        normal_balance: 'DEBIT',
      },
      update: {},
    });
    await this.prisma.paymentMethods.upsert({
      where: { method_code: 'CASH' },
      create: {
        method_name: 'Cash',
        method_code: 'CASH',
        gl_account_id: cashAcct.id,
      },
      update: { is_active: true },
    });
    const { ensureBillingFoundation } = await import(
      '../billing/finance/ensure-foundation'
    );
    await ensureBillingFoundation(this.prisma);
    return { policiesCreated: policies, feeSchedule: true };
  }
}
