import type { PrismaClient } from '../src/generated/prisma';
import * as bcrypt from 'bcryptjs';

const DEPARTMENTS = [
  { name: 'General Medicine', code: 'GM', location: 'Main Building – 2nd Floor', head: 'Dr. Amina Okello', description: 'Handles routine check-ups, acute illnesses, and chronic disease management.' },
  { name: 'Pediatrics', code: 'PED', location: "Children's Wing – 3rd Floor", head: 'Dr. Sophia Muthoni', description: 'Care for infants, children, and adolescents.' },
  { name: 'Cardiology', code: 'CARD', location: 'Heart Center – 4th Floor', head: 'Dr. Kevin Ndegwa', description: 'Heart disease prevention, diagnosis, and intervention.' },
  { name: 'Orthopedics', code: 'ORTH', location: 'Surgical Block – 3rd Floor', head: 'Dr. Daniel Omondi', description: 'Bone, joint, and muscle conditions including trauma.' },
  { name: 'Dermatology', code: 'DERM', location: 'Outpatient Clinic – 2nd Floor', head: 'Dr. Wanja Kariuki', description: 'Medical and cosmetic skin treatments.' },
  { name: 'Neurology', code: 'NEURO', location: 'Neuro Center – 5th Floor', head: 'Dr. Laila Hassan', description: 'Brain, nerve, and spinal disorders.' },
  { name: 'Radiology', code: 'RAD', location: 'Diagnostic Wing – 1st Floor', head: 'Dr. Mercy Achieng', description: 'X-ray, CT, MRI, and ultrasound imaging.' },
  { name: 'Maternity Care', code: 'MAT', location: 'Maternity Tower – 4th & 5th Floor', head: null, description: 'Prenatal care, delivery, and newborn services.' },
] as const;

const EXTRA_DOCTORS: Array<{
  email: string;
  first_name: string;
  last_name: string;
  employee_id: string;
  specialty: string;
  deptCode: string;
  phone: string;
}> = [
  { email: 'k.ndegwa@nyalife.health', first_name: 'Kevin', last_name: 'Ndegwa', employee_id: 'EMP-015', specialty: 'Cardiology', deptCode: 'CARD', phone: '+254 712 000 102' },
  { email: 's.muthoni@nyalife.health', first_name: 'Sophia', last_name: 'Muthoni', employee_id: 'EMP-016', specialty: 'Pediatrics', deptCode: 'PED', phone: '+254 712 000 103' },
  { email: 'd.omondi@nyalife.health', first_name: 'Daniel', last_name: 'Omondi', employee_id: 'EMP-017', specialty: 'Orthopedics', deptCode: 'ORTH', phone: '+254 712 000 104' },
  { email: 'w.kariuki@nyalife.health', first_name: 'Wanja', last_name: 'Kariuki', employee_id: 'EMP-018', specialty: 'Dermatology', deptCode: 'DERM', phone: '+254 712 000 105' },
  { email: 'l.hassan@nyalife.health', first_name: 'Laila', last_name: 'Hassan', employee_id: 'EMP-019', specialty: 'Neurology', deptCode: 'NEURO', phone: '+254 712 000 106' },
  { email: 'a.mehta@nyalife.health', first_name: 'Arjun', last_name: 'Mehta', employee_id: 'EMP-020', specialty: 'Pulmonology', deptCode: 'GM', phone: '+254 712 000 108' },
];

const PATIENTS = [
  { email: 'joseph.kamau@patient.nyalife.health', first_name: 'Joseph', last_name: 'Kamau', mrn: 'MRN-00412', dob: '1980-03-12', gender: 'MALE' as const, phone: '+254 712 345 678' },
  { email: 'mary.atieno@patient.nyalife.health', first_name: 'Mary', last_name: 'Atieno', mrn: 'MRN-00398', dob: '1993-07-21', gender: 'FEMALE' as const, phone: '+254 733 221 004' },
  { email: 'david.mutua@patient.nyalife.health', first_name: 'David', last_name: 'Mutua', mrn: 'MRN-00377', dob: '1965-01-08', gender: 'MALE' as const, phone: '+254 701 887 340' },
  { email: 'esther.chebet@patient.nyalife.health', first_name: 'Esther', last_name: 'Chebet', mrn: 'MRN-00355', dob: '1999-11-30', gender: 'FEMALE' as const, phone: '+254 728 993 015' },
  { email: 'ali.hassan@patient.nyalife.health', first_name: 'Ali', last_name: 'Hassan', mrn: 'MRN-00341', dob: '1972-05-19', gender: 'MALE' as const, phone: '+254 745 110 267' },
  { email: 'lucy.wambui@patient.nyalife.health', first_name: 'Lucy', last_name: 'Wambui', mrn: 'MRN-00329', dob: '1987-09-04', gender: 'FEMALE' as const, phone: '+254 719 456 802' },
];

const MED_CATEGORIES = [
  'Antibiotic',
  'Analgesic',
  'Antidiabetic',
  'Antihypertensive',
  'Antacid',
] as const;

const MEDICATIONS = [
  { name: 'Amoxicillin 500mg', category: 'Antibiotic', stock: 420, expiry: '2027-02-15', unit: 'capsules' },
  { name: 'Paracetamol 500mg', category: 'Analgesic', stock: 85, expiry: '2026-11-30', unit: 'tablets' },
  { name: 'Metformin 850mg', category: 'Antidiabetic', stock: 310, expiry: '2027-06-01', unit: 'tablets' },
  { name: 'Amlodipine 5mg', category: 'Antihypertensive', stock: 45, expiry: '2026-10-12', unit: 'tablets' },
  { name: 'Omeprazole 20mg', category: 'Antacid', stock: 260, expiry: '2027-01-20', unit: 'capsules' },
] as const;

const LAB_TESTS = [
  { name: 'Complete Blood Count', category: 'Hematology', unit: 'cells/µL', range: '4,500 – 11,000' },
  { name: 'Blood Glucose (Fasting)', category: 'Chemistry', unit: 'mmol/L', range: '3.9 – 5.6' },
  { name: 'Lipid Profile (Total Cholesterol)', category: 'Chemistry', unit: 'mmol/L', range: '< 5.2' },
  { name: 'HbA1c', category: 'Chemistry', unit: '%', range: '4.0 – 5.6' },
  { name: 'Malaria RDT', category: 'Microbiology', unit: '', range: 'Negative' },
  { name: 'Urinalysis', category: 'Urinalysis', unit: '', range: 'Normal' },
] as const;

const STAFF_DEPT: Record<string, string> = {
  'admin@nyalife.health': 'GM',
  'a.okello@nyalife.health': 'GM',
  'g.wanjiru@nyalife.health': 'GM',
  'b.otieno@nyalife.health': 'GM',
  'f.njeri@nyalife.health': 'GM',
  's.kiptoo@nyalife.health': 'GM',
  'm.achieng@nyalife.health': 'RAD',
  'p.mwangi@nyalife.health': 'GM',
};

export async function seedCatalog(prisma: PrismaClient): Promise<void> {
  const passwordHash = await bcrypt.hash('nyalife123', 10);
  const doctorRole = await prisma.roles.findUnique({ where: { name: 'DOCTOR' } });
  if (!doctorRole) throw new Error('DOCTOR role missing — run roles seed first');

  const deptByCode: Record<string, string> = {};
  for (const d of DEPARTMENTS) {
    const row = await prisma.departments.upsert({
      where: { code: d.code },
      create: {
        name: d.name,
        code: d.code,
        type: 'CLINICAL',
        description: `${d.location}\n${d.description}`,
        head_name: d.head,
        head_position: d.head ? 'Department Head' : null,
        is_active: true,
      },
      update: {
        name: d.name,
        description: `${d.location}\n${d.description}`,
        head_name: d.head,
        is_active: true,
      },
    });
    deptByCode[d.code] = row.id;
  }

  for (const doc of EXTRA_DOCTORS) {
    const user = await prisma.user.upsert({
      where: { email: doc.email },
      create: {
        email: doc.email,
        password_hash: passwordHash,
        is_active: true,
        email_verified_at: new Date(),
      },
      update: { is_active: true, password_hash: passwordHash },
    });

    await prisma.profiles.upsert({
      where: { user_id: user.id },
      create: {
        user_id: user.id,
        first_name: doc.first_name,
        last_name: doc.last_name,
        phone: doc.phone,
        gender: 'OTHER',
      },
      update: {
        first_name: doc.first_name,
        last_name: doc.last_name,
        phone: doc.phone,
      },
    });

    await prisma.staffProfiles.upsert({
      where: { user_id: user.id },
      create: {
        user_id: user.id,
        employee_id: doc.employee_id,
        department_id: deptByCode[doc.deptCode],
        position: 'Physician',
        specialization: doc.specialty,
        join_date: new Date('2021-06-01'),
        is_active: doc.email !== 's.muthoni@nyalife.health' && doc.email !== 'a.mehta@nyalife.health',
      },
      update: {
        department_id: deptByCode[doc.deptCode],
        specialization: doc.specialty,
        is_active: doc.email !== 's.muthoni@nyalife.health' && doc.email !== 'a.mehta@nyalife.health',
      },
    });

    await prisma.userRoles.upsert({
      where: {
        user_id_role_id: { user_id: user.id, role_id: doctorRole.id },
      },
      create: { user_id: user.id, role_id: doctorRole.id },
      update: {},
    });
  }

  // Attach existing demo staff to departments
  for (const [email, code] of Object.entries(STAFF_DEPT)) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) continue;
    await prisma.staffProfiles.updateMany({
      where: { user_id: user.id },
      data: { department_id: deptByCode[code] },
    });
    if (email === 'a.okello@nyalife.health') {
      await prisma.staffProfiles.updateMany({
        where: { user_id: user.id },
        data: { specialization: 'General Medicine' },
      });
    }
  }

  for (const p of PATIENTS) {
    const user = await prisma.user.upsert({
      where: { email: p.email },
      create: {
        email: p.email,
        password_hash: null,
        is_active: true,
      },
      update: { is_active: true },
    });

    await prisma.profiles.upsert({
      where: { user_id: user.id },
      create: {
        user_id: user.id,
        first_name: p.first_name,
        last_name: p.last_name,
        date_of_birth: new Date(p.dob),
        gender: p.gender,
        phone: p.phone,
      },
      update: {
        first_name: p.first_name,
        last_name: p.last_name,
        date_of_birth: new Date(p.dob),
        gender: p.gender,
        phone: p.phone,
      },
    });

    const existingPatient = await prisma.patients.findUnique({
      where: { user_id: user.id },
    });
    if (existingPatient) {
      await prisma.patients.update({
        where: { id: existingPatient.id },
        data: { patient_number: p.mrn },
      });
    } else {
      await prisma.patients.create({
        data: {
          user_id: user.id,
          patient_number: p.mrn,
        },
      });
    }
  }

  const catByName: Record<string, string> = {};
  for (const name of MED_CATEGORIES) {
    const row = await prisma.categories.upsert({
      where: { category_name: name },
      create: { category_name: name, is_active: true },
      update: { is_active: true },
    });
    catByName[name] = row.id;
  }

  const admin = await prisma.user.findUnique({
    where: { email: 'admin@nyalife.health' },
  });
  if (!admin) throw new Error('admin user missing for medication batch seed');

  for (const med of MEDICATIONS) {
    const row = await prisma.medications.upsert({
      where: { medication_name: med.name },
      create: {
        medication_name: med.name,
        category_id: catByName[med.category],
        unit: med.unit,
        is_active: true,
        standard_selling_price: 0,
      },
      update: {
        category_id: catByName[med.category],
        unit: med.unit,
        is_active: true,
      },
    });

    const batchNumber = `BATCH-${med.name.slice(0, 3).toUpperCase()}-01`;
    const existing = await prisma.batches.findUnique({
      where: {
        medication_id_batch_number: {
          medication_id: row.id,
          batch_number: batchNumber,
        },
      },
    });
    if (!existing) {
      await prisma.batches.create({
        data: {
          medication_id: row.id,
          batch_number: batchNumber,
          quantity_on_hand: med.stock,
          unit_cost: 10,
          selling_price: 25,
          expiry_date: new Date(med.expiry),
          created_by: admin.id,
        },
      });
    } else {
      await prisma.batches.update({
        where: { id: existing.id },
        data: {
          quantity_on_hand: med.stock,
          expiry_date: new Date(med.expiry),
        },
      });
    }
  }

  for (const [i, test] of LAB_TESTS.entries()) {
    const type = await prisma.testTypes.upsert({
      where: { test_name: test.name },
      create: {
        test_name: test.name,
        category: test.category,
        is_active: true,
        standard_price: 500,
      },
      update: {
        category: test.category,
        is_active: true,
      },
    });

    const params = await prisma.testParameters.findMany({
      where: { test_type_id: type.id },
    });
    if (params.length === 0) {
      await prisma.testParameters.create({
        data: {
          test_type_id: type.id,
          parameter_name: test.name,
          unit_of_measurement: test.unit || null,
          normal_reference_range: test.range || null,
          display_order: i,
          is_active: true,
        },
      });
    }
  }

  console.log('Catalog seed:');
  console.log(`  ${DEPARTMENTS.length} departments`);
  console.log(`  ${EXTRA_DOCTORS.length} additional doctors`);
  console.log(`  ${PATIENTS.length} patients`);
  console.log(`  ${MEDICATIONS.length} medications`);
  console.log(`  ${LAB_TESTS.length} lab tests`);
}
