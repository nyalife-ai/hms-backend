import type { PrismaClient } from '../src/generated/prisma';

function timeToday(hours: number, minutes = 0): Date {
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d;
}

export async function seedOps(prisma: PrismaClient): Promise<void> {
  const admin = await prisma.user.findUnique({
    where: { email: 'admin@nyalife.health' },
  });
  const doctor = await prisma.staffProfiles.findFirst({
    where: { user: { email: 'a.okello@nyalife.health' } },
  });
  const radioDoc = await prisma.staffProfiles.findFirst({
    where: { user: { email: 'm.achieng@nyalife.health' } },
  });
  if (!admin || !doctor) {
    console.warn('Ops seed skipped — admin/doctor missing');
    return;
  }

  const patients = await prisma.patients.findMany({
    include: { user: { include: { core_profiles_user_id: true } } },
  });
  const byMrn = Object.fromEntries(patients.map((p) => [p.patient_number, p]));

  const gm = await prisma.departments.findFirst({ where: { code: 'GM' } });
  const wardsSpec = [
    { name: 'Ward A — General', ward_type: 'GENERAL', capacity: 24, occupied: 19 },
    { name: 'Ward B — Maternity', ward_type: 'MATERNITY', capacity: 16, occupied: 11 },
    { name: 'Ward C — Pediatrics', ward_type: 'PEDIATRIC', capacity: 20, occupied: 14 },
    { name: 'ICU', ward_type: 'ICU', capacity: 8, occupied: 6 },
  ] as const;

  for (const w of wardsSpec) {
    const ward = await prisma.wards.upsert({
      where: { name: w.name },
      create: {
        name: w.name,
        ward_type: w.ward_type,
        capacity: w.capacity,
        department_id: gm?.id,
        daily_rate: 2500,
        is_active: true,
      },
      update: { capacity: w.capacity, is_active: true },
    });

    const existingBeds = await prisma.beds.count({ where: { ward_id: ward.id } });
    if (existingBeds === 0) {
      for (let i = 1; i <= w.capacity; i += 1) {
        await prisma.beds.create({
          data: {
            ward_id: ward.id,
            bed_number: String(i).padStart(2, '0'),
            status: i <= w.occupied ? 'OCCUPIED' : 'AVAILABLE',
          },
        });
      }
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayCount = await prisma.appointments.count({
    where: { appointment_date: today },
  });
  if (todayCount === 0) {
    const apptSpecs: Array<{
      mrn: string;
      hour: number;
      minute?: number;
      type: string;
      status: string;
      doctorId?: string;
    }> = [
      { mrn: 'MRN-00412', hour: 9, type: 'CONSULTATION', status: 'ARRIVED' },
      { mrn: 'MRN-00329', hour: 9, minute: 30, type: 'FOLLOW_UP', status: 'SCHEDULED' },
      {
        mrn: 'MRN-00398',
        hour: 10,
        minute: 15,
        type: 'CONSULTATION',
        status: 'CONFIRMED',
        doctorId: radioDoc?.id,
      },
      { mrn: 'MRN-00377', hour: 11, type: 'NEW_PATIENT', status: 'SCHEDULED' },
      { mrn: 'MRN-00355', hour: 14, type: 'FOLLOW_UP', status: 'SCHEDULED' },
    ];

    for (const a of apptSpecs) {
      const patient = byMrn[a.mrn];
      if (!patient) continue;
      const start = timeToday(a.hour, a.minute ?? 0);
      const end = new Date(start.getTime() + 30 * 60_000);
      await prisma.appointments.create({
        data: {
          patient_id: patient.id,
          doctor_id: a.doctorId || doctor.id,
          appointment_date: today,
          start_time: start,
          end_time: end,
          status: a.status,
          appointment_type: a.type,
          created_by: admin.id,
        },
      });
    }
  }

  const scanTypes = [
    { scan_type: 'Chest X-Ray', category: 'X-Ray' },
    { scan_type: 'Abdominal Ultrasound', category: 'Ultrasound' },
    { scan_type: 'Echocardiogram', category: 'Ultrasound' },
  ] as const;
  for (const s of scanTypes) {
    await prisma.scanTypes.upsert({
      where: { scan_type: s.scan_type },
      create: { ...s, is_active: true, standard_price: 2500 },
      update: { is_active: true },
    });
  }

  const chest = await prisma.scanTypes.findUnique({
    where: { scan_type: 'Chest X-Ray' },
  });
  const us = await prisma.scanTypes.findUnique({
    where: { scan_type: 'Abdominal Ultrasound' },
  });
  const echo = await prisma.scanTypes.findUnique({
    where: { scan_type: 'Echocardiogram' },
  });

  const radSpecs = [
    { mrn: 'MRN-00398', scan: chest, status: 'SCHEDULED', num: 'RAD-2026-001' },
    { mrn: 'MRN-00341', scan: us, status: 'SCHEDULED', num: 'RAD-2026-002' },
    { mrn: 'MRN-00377', scan: echo, status: 'IN_PROGRESS', num: 'RAD-2026-003' },
  ];
  for (const r of radSpecs) {
    const patient = byMrn[r.mrn];
    if (!patient || !r.scan) continue;
    await prisma.radiologyRequests.upsert({
      where: { request_number: r.num },
      create: {
        request_number: r.num,
        patient_id: patient.id,
        scan_type_id: r.scan.id,
        requesting_doctor_id: doctor.id,
        requested_by: admin.id,
        status: r.status,
        priority: 'ROUTINE',
        clinical_indication: 'Clinical review',
      },
      update: { status: r.status },
    });
  }

  const invoiceSpecs = [
    { mrn: 'MRN-00412', number: 'INV-2026-0841', amount: 12500, status: 'ISSUED', daysAgo: 2 },
    { mrn: 'MRN-00355', number: 'INV-2026-0838', amount: 48200, status: 'PAID', daysAgo: 6 },
    { mrn: 'MRN-00341', number: 'INV-2026-0832', amount: 9700, status: 'PARTIALLY_PAID', daysAgo: 9 },
    { mrn: 'MRN-00377', number: 'INV-2026-0819', amount: 31400, status: 'ISSUED', daysAgo: 19 },
  ] as const;

  for (const inv of invoiceSpecs) {
    const patient = byMrn[inv.mrn];
    if (!patient) continue;
    const issued = new Date();
    issued.setDate(issued.getDate() - inv.daysAgo);
    const due = new Date(issued);
    due.setDate(due.getDate() + 14);
    await prisma.invoices.upsert({
      where: { invoice_number: inv.number },
      create: {
        invoice_number: inv.number,
        patient_id: patient.id,
        invoice_date: issued,
        due_date: due,
        subtotal: inv.amount,
        total_amount: inv.amount,
        status: inv.status,
        created_by: admin.id,
      },
      update: {
        total_amount: inv.amount,
        status: inv.status,
      },
    });
  }

  const threads = [
    {
      name: 'Dr. Amina Okello',
      preview: 'Please review the CBC results for Mary Atieno.',
      unread: 2,
    },
    {
      name: 'Ward A Nurses',
      preview: 'Bed 12 transfer completed, notes updated.',
      unread: 0,
    },
    {
      name: 'Pharmacy Desk',
      preview: 'Amlodipine 5mg is below reorder level.',
      unread: 1,
    },
    {
      name: 'Front Office',
      preview: 'Two walk-ins added to Dr. Okello\'s queue.',
      unread: 0,
    },
  ];

  for (const t of threads) {
    const existing = await prisma.conversations.findFirst({
      where: { name: t.name, conversation_type: 'DIRECT' },
    });
    if (existing) {
      await prisma.conversations.update({
        where: { id: existing.id },
        data: {
          metadata: { preview: t.preview, unread: t.unread },
        },
      });
      continue;
    }
    await prisma.conversations.create({
      data: {
        conversation_type: 'DIRECT',
        name: t.name,
        created_by: admin.id,
        metadata: { preview: t.preview, unread: t.unread },
      },
    });
  }

  // Seed a few outpatient visits if empty
  const visitCount = await prisma.outpatientVisits.count();
  if (visitCount === 0) {
    const joseph = byMrn['MRN-00412'];
    const lucy = byMrn['MRN-00329'];
    if (joseph) {
      await prisma.outpatientVisits.create({
        data: {
          patient_id: joseph.id,
          patient_name: 'Joseph Kamau',
          mrn: 'MRN-00412',
          age: 46,
          gender: 'Male',
          phone: '+254 712 345 678',
          stage: 'CHECKED_IN',
          checked_in_at: new Date(Date.now() - 12 * 60_000),
          payload: { payment: { method: 'CASH' } },
        },
      });
    }
    if (lucy) {
      await prisma.outpatientVisits.create({
        data: {
          patient_id: lucy.id,
          patient_name: 'Lucy Wambui',
          mrn: 'MRN-00329',
          age: 39,
          gender: 'Female',
          phone: '+254 719 456 802',
          stage: 'WAITING_DOCTOR',
          checked_in_at: new Date(Date.now() - 35 * 60_000),
          payload: {
            payment: {
              method: 'INSURANCE',
              provider: 'SHA (Social Health Authority)',
              policyNumber: 'SHA-88231',
              status: 'APPROVED',
              memberName: 'Lucy Wambui',
              benefitBalance: 180000,
            },
            nurseName: 'Grace Wanjiru',
            doctorName: 'Dr. Amina Okello',
            vitals: {
              temperature: '37.8',
              systolic: '124',
              diastolic: '82',
              pulse: '88',
              respRate: '18',
              spo2: '97',
              weightKg: '68',
            },
          },
        },
      });
    }
  }

  // Patient insurance policies for real eligibility lookups
  const sha = await prisma.insuranceProviders.findFirst({ where: { code: 'SHA' } });
  if (sha) {
    const policySpecs = [
      { mrn: 'MRN-00329', number: 'SHA-88231' },
      { mrn: 'MRN-00412', number: 'SHA-11002' },
      { mrn: 'MRN-00355', number: 'SHA-44119' },
    ];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(today);
    expiry.setFullYear(expiry.getFullYear() + 1);
    for (const p of policySpecs) {
      const patient = byMrn[p.mrn];
      if (!patient) continue;
      const existing = await prisma.insurancePolicies.findFirst({
        where: { patient_id: patient.id, policy_number: p.number },
      });
      if (existing) continue;
      await prisma.insurancePolicies.create({
        data: {
          patient_id: patient.id,
          provider_id: sha.id,
          policy_number: p.number,
          start_date: today,
          expiry_date: expiry,
          is_active: true,
        },
      });
    }
  }

  // Fee schedule + chart of accounts foundation
  const { ensureBillingFoundation } = await import(
    '../src/modules/billing/finance/ensure-foundation.ts'
  );
  await ensureBillingFoundation(prisma);

  console.log('Ops seed: wards, appointments, radiology, invoices, conversations, visits, policies, fees');
}
