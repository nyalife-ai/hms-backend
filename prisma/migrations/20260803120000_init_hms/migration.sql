-- NyaLife HMS initial schema (from repo root db.sql)
-- Requires PostgreSQL 13+ / Supabase. Migrations use DIRECT_URL (not the pooler).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS patients;
CREATE SCHEMA IF NOT EXISTS clinical;
CREATE SCHEMA IF NOT EXISTS inpatient;
CREATE SCHEMA IF NOT EXISTS pharmacy;
CREATE SCHEMA IF NOT EXISTS laboratory;
CREATE SCHEMA IF NOT EXISTS radiology;
CREATE SCHEMA IF NOT EXISTS billing;
CREATE SCHEMA IF NOT EXISTS communications;

-- 1. core.users - Authentication only
CREATE TABLE core.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    email_verified_at TIMESTAMPTZ,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_users_email ON core.users(email);
CREATE INDEX idx_users_active ON core.users(is_active) WHERE deleted_at IS NULL;

-- 2. core.profiles - Shared PII for all users (staff & patients)
CREATE TABLE core.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES core.users(id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    date_of_birth DATE,
    gender VARCHAR(20) CHECK (gender IN ('MALE', 'FEMALE', 'OTHER')),
    phone VARCHAR(30),
    address TEXT,
    city VARCHAR(100),
    country VARCHAR(100),
    postal_code VARCHAR(20),
    profile_image VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_profiles_user ON core.profiles(user_id);
CREATE INDEX idx_profiles_name ON core.profiles(first_name, last_name);

-- 3. core.staff_profiles - HR data for employees
CREATE TABLE core.staff_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES core.users(id) ON DELETE CASCADE,
    employee_id VARCHAR(30) NOT NULL UNIQUE,
    department_id UUID,
    position VARCHAR(100),
    specialization VARCHAR(100),
    qualification TEXT,
    join_date DATE NOT NULL,
    emergency_contact_name VARCHAR(100),
    emergency_contact_phone VARCHAR(30),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_staff_user ON core.staff_profiles(user_id);
CREATE INDEX idx_staff_employee_id ON core.staff_profiles(employee_id);
CREATE INDEX idx_staff_department ON core.staff_profiles(department_id);

-- 4. core.roles - RBAC roles
CREATE TABLE core.roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. core.permissions - Granular permissions
CREATE TABLE core.permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL UNIQUE,
    description TEXT,
    module VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_permissions_module ON core.permissions(module);

-- 6. core.user_roles - Pivot: users to roles (many-to-many)
CREATE TABLE core.user_roles (
    user_id UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES core.roles(id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    granted_by UUID REFERENCES core.users(id) ON DELETE SET NULL,
    PRIMARY KEY (user_id, role_id)
);

CREATE INDEX idx_user_roles_role ON core.user_roles(role_id);

-- 7. core.role_permissions - Pivot: roles to permissions (many-to-many)
CREATE TABLE core.role_permissions (
    role_id UUID NOT NULL REFERENCES core.roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES core.permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE INDEX idx_role_permissions_permission ON core.role_permissions(permission_id);

-- 8. core.audit_logs - Data change tracking (immutable)
CREATE TABLE core.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES core.users(id) ON DELETE SET NULL,
    action VARCHAR(20) NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'RESTORE')),
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID NOT NULL,
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON core.audit_logs(user_id);
CREATE INDEX idx_audit_entity ON core.audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_created ON core.audit_logs(created_at);

-- 9. core.access_logs - HIPAA access tracking (high volume)
CREATE TABLE core.access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
    patient_id UUID,
    entity_type VARCHAR(100),
    entity_id UUID,
    ip_address VARCHAR(45),
    user_agent TEXT,
    accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_access_user ON core.access_logs(user_id);
CREATE INDEX idx_access_patient ON core.access_logs(patient_id);
CREATE INDEX idx_access_at ON core.access_logs(accessed_at);

-- 10. core.settings - System configuration (key-value)
CREATE TABLE core.settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(100) NOT NULL UNIQUE,
    value TEXT NOT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'number', 'boolean', 'json')),
    group_name VARCHAR(50) NOT NULL DEFAULT 'general',
    label VARCHAR(150),
    description TEXT,
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    updated_by UUID REFERENCES core.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_settings_group ON core.settings(group_name);

-- 11. core.insurance_providers - Master insurance companies
CREATE TABLE core.insurance_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    code VARCHAR(30) NOT NULL UNIQUE,
    logo_path VARCHAR(500),
    contact_person VARCHAR(100),
    phone VARCHAR(30),
    email VARCHAR(150),
    address TEXT,
    claim_submission_method VARCHAR(50) CHECK (claim_submission_method IN ('PORTAL', 'EMAIL', 'API', 'MANUAL')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_insurance_active ON core.insurance_providers(is_active);

-- 12. core.departments - Hospital organizational structure
CREATE TABLE core.departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    code VARCHAR(10) NOT NULL UNIQUE,
    type VARCHAR(20) NOT NULL DEFAULT 'CLINICAL' CHECK (type IN ('CLINICAL', 'ADMINISTRATIVE', 'SUPPORT')),
    description TEXT,
    head_name VARCHAR(100),
    head_position VARCHAR(100),
    head_image VARCHAR(500),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add FK now that departments exists
ALTER TABLE core.staff_profiles
    ADD CONSTRAINT fk_staff_department FOREIGN KEY (department_id)
    REFERENCES core.departments(id) ON DELETE SET NULL;

CREATE INDEX idx_departments_active ON core.departments(is_active);

-- 1. patients.patients - Core clinical demographics
CREATE TABLE patients.patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES core.users(id) ON DELETE CASCADE,
    patient_number VARCHAR(30) NOT NULL UNIQUE,
    blood_group VARCHAR(5) CHECK (blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
    allergies TEXT,
    chronic_diseases TEXT,
    occupation VARCHAR(100),
    marital_status VARCHAR(20) CHECK (marital_status IN ('SINGLE','MARRIED','DIVORCED','WIDOWED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_patients_number ON patients.patients(patient_number);
CREATE INDEX idx_patients_user ON patients.patients(user_id);

-- 2. patients.insurance_policies - Layer 2 of insurance
CREATE TABLE patients.insurance_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients.patients(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES core.insurance_providers(id),
    policy_number VARCHAR(100) NOT NULL,
    group_number VARCHAR(50),
    member_type VARCHAR(20) NOT NULL DEFAULT 'PRINCIPAL' CHECK (member_type IN ('PRINCIPAL','DEPENDENT')),
    principal_policy_id UUID REFERENCES patients.insurance_policies(id) ON DELETE SET NULL,
    start_date DATE NOT NULL,
    expiry_date DATE NOT NULL,
    copay_amount NUMERIC(12,2) DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_policies_patient ON patients.insurance_policies(patient_id);
CREATE INDEX idx_policies_provider ON patients.insurance_policies(provider_id);
CREATE INDEX idx_policies_active ON patients.insurance_policies(is_active, expiry_date);

-- 3. patients.emergency_contacts
CREATE TABLE patients.emergency_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients.patients(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    relationship VARCHAR(50),
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_emergency_patient ON patients.emergency_contacts(patient_id);

-- 4. patients.documents - DMS
CREATE TABLE patients.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients.patients(id) ON DELETE CASCADE,
    document_type VARCHAR(50) NOT NULL CHECK (document_type IN (
        'CONSENT_FORM','PAST_RECORD','ID_COPY','LAB_REPORT','RADIOLOGY_IMAGE','OTHER'
    )),
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    mime_type VARCHAR(50),
    file_size BIGINT,
    is_confidential BOOLEAN NOT NULL DEFAULT FALSE,
    uploaded_by UUID NOT NULL REFERENCES core.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_documents_patient ON patients.documents(patient_id);
CREATE INDEX idx_documents_type ON patients.documents(document_type);

-- 5. patients.data_consents - GDPR
CREATE TABLE patients.data_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients.patients(id) ON DELETE CASCADE,
    consent_type VARCHAR(50) NOT NULL,
    version VARCHAR(20) NOT NULL DEFAULT '1.0',
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    granted_by UUID NOT NULL REFERENCES core.users(id),
    ip_address VARCHAR(45),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_consents_patient ON patients.data_consents(patient_id);
CREATE INDEX idx_consents_type ON patients.data_consents(consent_type);

-- 6. patients.advanced_directives - HIPAA
CREATE TABLE patients.advanced_directives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients.patients(id) ON DELETE CASCADE,
    directive_type VARCHAR(50) NOT NULL CHECK (directive_type IN (
        'DNR','ORGAN_DONOR','LIVING_WILL','HEALTHCARE_PROXY','OTHER'
    )),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVOKED')),
    details TEXT,
    signed_at TIMESTAMPTZ,
    witness_name VARCHAR(100),
    witness_signature VARCHAR(500),
    document_path VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_directives_patient ON patients.advanced_directives(patient_id);
CREATE INDEX idx_directives_active ON patients.advanced_directives(patient_id, status) WHERE status = 'ACTIVE';

-- 1. clinical.appointments
CREATE TABLE clinical.appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients.patients(id),
    doctor_id UUID NOT NULL REFERENCES core.staff_profiles(id),
    appointment_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN (
        'SCHEDULED','CONFIRMED','ARRIVED','COMPLETED','NO_SHOW','CANCELLED'
    )),
    appointment_type VARCHAR(30) CHECK (appointment_type IN ('NEW_PATIENT','FOLLOW_UP','CONSULTATION','EMERGENCY')),
    reason TEXT,
    notes TEXT,
    created_by UUID NOT NULL REFERENCES core.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_appt_patient ON clinical.appointments(patient_id);
CREATE INDEX idx_appt_doctor ON clinical.appointments(doctor_id);
CREATE INDEX idx_appt_date ON clinical.appointments(appointment_date);
CREATE INDEX idx_appt_status ON clinical.appointments(status);

-- 2. clinical.consultations
CREATE TABLE clinical.consultations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID UNIQUE REFERENCES clinical.appointments(id) ON DELETE SET NULL,
    patient_id UUID NOT NULL REFERENCES patients.patients(id),
    doctor_id UUID NOT NULL REFERENCES core.staff_profiles(id),
    consultation_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    chief_complaint TEXT,
    history_present_illness TEXT,
    past_medical_history TEXT,
    family_history TEXT,
    social_history TEXT,
    physical_examination TEXT,
    treatment_plan TEXT,
    follow_up_instructions TEXT,
    notes TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS','COMPLETED','CANCELLED')),
    consultation_type VARCHAR(20) NOT NULL DEFAULT 'IN_PERSON' CHECK (consultation_type IN ('IN_PERSON','TELEHEALTH')),
    priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('NORMAL','URGENT','EMERGENCY')),
    created_by UUID NOT NULL REFERENCES core.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_consult_patient ON clinical.consultations(patient_id);
CREATE INDEX idx_consult_doctor ON clinical.consultations(doctor_id);
CREATE INDEX idx_consult_date ON clinical.consultations(consultation_date);
CREATE INDEX idx_consult_status ON clinical.consultations(status);

-- 3. clinical.diagnoses - Extracted for reporting
CREATE TABLE clinical.diagnoses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consultation_id UUID NOT NULL REFERENCES clinical.consultations(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients.patients(id),
    icd10_code VARCHAR(20),
    description TEXT NOT NULL,
    diagnosis_type VARCHAR(20) NOT NULL DEFAULT 'PRIMARY' CHECK (diagnosis_type IN ('PRIMARY','SECONDARY','DIFFERENTIAL')),
    onset_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_diag_consult ON clinical.diagnoses(consultation_id);
CREATE INDEX idx_diag_patient ON clinical.diagnoses(patient_id);
CREATE INDEX idx_diag_icd ON clinical.diagnoses(icd10_code);

-- 4. clinical.procedures - Extracted for reporting
CREATE TABLE clinical.procedures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consultation_id UUID NOT NULL REFERENCES clinical.consultations(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients.patients(id),
    cpt_code VARCHAR(20),
    description TEXT NOT NULL,
    performer_id UUID REFERENCES core.staff_profiles(id),
    outcome TEXT,
    performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_proc_consult ON clinical.procedures(consultation_id);
CREATE INDEX idx_proc_patient ON clinical.procedures(patient_id);
CREATE INDEX idx_proc_performed ON clinical.procedures(performed_at);

-- 5. clinical.vital_signs
CREATE TABLE clinical.vital_signs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients.patients(id),
    consultation_id UUID REFERENCES clinical.consultations(id) ON DELETE SET NULL,
    blood_pressure VARCHAR(20),
    heart_rate INT,
    respiratory_rate INT,
    temperature NUMERIC(4,1),
    weight NUMERIC(5,2),
    height NUMERIC(5,2),
    bmi NUMERIC(5,2),
    pain_level INT CHECK (pain_level BETWEEN 0 AND 10),
    oxygen_saturation INT CHECK (oxygen_saturation BETWEEN 0 AND 100),
    notes TEXT,
    measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recorded_by UUID NOT NULL REFERENCES core.users(id),
    is_voided BOOLEAN NOT NULL DEFAULT FALSE,
    void_reason VARCHAR(255),
    voided_by UUID REFERENCES core.users(id),
    voided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vitals_patient ON clinical.vital_signs(patient_id);
CREATE INDEX idx_vitals_consult ON clinical.vital_signs(consultation_id);
CREATE INDEX idx_vitals_measured ON clinical.vital_signs(measured_at);

-- 6. clinical.follow_ups
CREATE TABLE clinical.follow_ups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients.patients(id),
    consultation_id UUID NOT NULL REFERENCES clinical.consultations(id),
    follow_up_date DATE NOT NULL,
    follow_up_type VARCHAR(50),
    reason TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED','COMPLETED','CANCELLED','NO_SHOW')),
    notes TEXT,
    created_by UUID NOT NULL REFERENCES core.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_followup_patient ON clinical.follow_ups(patient_id);
CREATE INDEX idx_followup_consult ON clinical.follow_ups(consultation_id);
CREATE INDEX idx_followup_date ON clinical.follow_ups(follow_up_date);

-- 7. clinical.telehealth_consents
CREATE TABLE clinical.telehealth_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients.patients(id),
    appointment_id UUID REFERENCES clinical.appointments(id),
    patient_signature_path TEXT,
    doctor_signature_path TEXT,
    verbal_consent_obtained BOOLEAN NOT NULL DEFAULT FALSE,
    consent_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (consent_status IN ('PENDING','SIGNED','DECLINED')),
    signed_at TIMESTAMPTZ,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_teleconsent_patient ON clinical.telehealth_consents(patient_id);
CREATE INDEX idx_teleconsent_appt ON clinical.telehealth_consents(appointment_id);

-- 8. clinical.unavailability - Doctor scheduling guardrail
CREATE TABLE clinical.unavailability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id UUID NOT NULL REFERENCES core.staff_profiles(id),
    block_date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    reason VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_unavail_doctor ON clinical.unavailability(doctor_id);
CREATE INDEX idx_unavail_date ON clinical.unavailability(block_date);
CREATE UNIQUE INDEX idx_unavail_unique ON clinical.unavailability(doctor_id, block_date, start_time, end_time);

-- 1. inpatient.wards
CREATE TABLE inpatient.wards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    ward_type VARCHAR(20) NOT NULL CHECK (ward_type IN (
        'GENERAL','ICU','NICU','MATERNITY','PEDIATRIC','PRIVATE','SEMI_PRIVATE'
    )),
    department_id UUID REFERENCES core.departments(id),
    daily_rate NUMERIC(12,2) NOT NULL DEFAULT 0,
    capacity INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wards_dept ON inpatient.wards(department_id);

-- 2. inpatient.beds
CREATE TABLE inpatient.beds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ward_id UUID NOT NULL REFERENCES inpatient.wards(id) ON DELETE CASCADE,
    bed_number VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE','OCCUPIED','MAINTENANCE','RESERVED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (ward_id, bed_number)
);

CREATE INDEX idx_beds_ward ON inpatient.beds(ward_id);
CREATE INDEX idx_beds_status ON inpatient.beds(status);

-- 3. inpatient.admissions
CREATE TABLE inpatient.admissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients.patients(id),
    bed_id UUID REFERENCES inpatient.beds(id),
    admitting_doctor_id UUID NOT NULL REFERENCES core.staff_profiles(id),
    admission_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    discharge_date TIMESTAMPTZ,
    primary_diagnosis TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'ADMITTED' CHECK (status IN ('ADMITTED','DISCHARGED','TRANSFERRED','DECEASED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admit_patient ON inpatient.admissions(patient_id);
CREATE INDEX idx_admit_bed ON inpatient.admissions(bed_id);
CREATE INDEX idx_admit_status ON inpatient.admissions(status);
CREATE INDEX idx_admit_date ON inpatient.admissions(admission_date);

-- 4. inpatient.bed_transfers - HIPAA audit trail
CREATE TABLE inpatient.bed_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admission_id UUID NOT NULL REFERENCES inpatient.admissions(id) ON DELETE CASCADE,
    old_bed_id UUID REFERENCES inpatient.beds(id),
    new_bed_id UUID NOT NULL REFERENCES inpatient.beds(id),
    transfer_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reason TEXT,
    authorized_by UUID NOT NULL REFERENCES core.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transfer_admission ON inpatient.bed_transfers(admission_id);
CREATE INDEX idx_transfer_date ON inpatient.bed_transfers(transfer_date);

-- 5. inpatient.bed_reservations - Pre-admission holds
CREATE TABLE inpatient.bed_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bed_id UUID NOT NULL REFERENCES inpatient.beds(id),
    patient_id UUID NOT NULL REFERENCES patients.patients(id),
    expected_admission_date DATE NOT NULL,
    reserved_by UUID NOT NULL REFERENCES core.users(id),
    expires_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'RESERVED' CHECK (status IN ('RESERVED','CONVERTED','EXPIRED','CANCELLED')),
    admission_id UUID REFERENCES inpatient.admissions(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reservation_bed ON inpatient.bed_reservations(bed_id);
CREATE INDEX idx_reservation_patient ON inpatient.bed_reservations(patient_id);
CREATE INDEX idx_reservation_status ON inpatient.bed_reservations(status);

-- 6. inpatient.nursing_notes
CREATE TABLE inpatient.nursing_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admission_id UUID NOT NULL REFERENCES inpatient.admissions(id) ON DELETE CASCADE,
    nurse_id UUID NOT NULL REFERENCES core.staff_profiles(id),
    notes_text TEXT NOT NULL,
    vital_signs_snapshot JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nursing_admission ON inpatient.nursing_notes(admission_id);
CREATE INDEX idx_nursing_nurse ON inpatient.nursing_notes(nurse_id);
CREATE INDEX idx_nursing_created ON inpatient.nursing_notes(created_at);

-- 7. inpatient.discharge_summaries
CREATE TABLE inpatient.discharge_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admission_id UUID NOT NULL UNIQUE REFERENCES inpatient.admissions(id) ON DELETE CASCADE,
    discharge_diagnosis TEXT,
    summary_of_treatment TEXT,
    discharge_medications TEXT,
    follow_up_instructions TEXT,
    discharging_doctor_id UUID NOT NULL REFERENCES core.staff_profiles(id),
    finalized_at TIMESTAMPTZ,
    finalized_by UUID REFERENCES core.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_discharge_admission ON inpatient.discharge_summaries(admission_id);

-- 1. pharmacy.suppliers
CREATE TABLE pharmacy.suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name VARCHAR(150) NOT NULL,
    contact_person VARCHAR(100),
    phone VARCHAR(30),
    email VARCHAR(150),
    address TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. pharmacy.categories
CREATE TABLE pharmacy.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. pharmacy.medications
CREATE TABLE pharmacy.medications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medication_name VARCHAR(150) NOT NULL UNIQUE,
    generic_name VARCHAR(150),
    category_id UUID REFERENCES pharmacy.categories(id),
    form VARCHAR(30) CHECK (form IN ('TABLET','CAPSULE','SYRUP','INJECTION','CREAM','OTHER')),
    strength VARCHAR(50),
    unit VARCHAR(20),
    standard_selling_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    description TEXT,
    side_effects TEXT,
    contraindications TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_med_category ON pharmacy.medications(category_id);
CREATE INDEX idx_med_name ON pharmacy.medications(medication_name);

-- 4. pharmacy.batches
CREATE TABLE pharmacy.batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medication_id UUID NOT NULL REFERENCES pharmacy.medications(id),
    batch_number VARCHAR(50) NOT NULL,
    quantity_on_hand NUMERIC(12,2) NOT NULL DEFAULT 0,
    unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
    selling_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    manufacturing_date DATE,
    expiry_date DATE NOT NULL,
    supplier_id UUID REFERENCES pharmacy.suppliers(id),
    notes TEXT,
    created_by UUID NOT NULL REFERENCES core.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (medication_id, batch_number)
);

CREATE INDEX idx_batch_med ON pharmacy.batches(medication_id);
CREATE INDEX idx_batch_supplier ON pharmacy.batches(supplier_id);
CREATE INDEX idx_batch_expiry ON pharmacy.batches(expiry_date);

-- 5. pharmacy.stock_movements - Single source of truth for inventory
CREATE TABLE pharmacy.stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES pharmacy.batches(id),
    movement_type VARCHAR(20) NOT NULL CHECK (movement_type IN (
        'RECEIVE','DISPENSE','ADJUSTMENT','EXPIRY','DAMAGE','TRANSFER','RETURN'
    )),
    quantity_change NUMERIC(12,2) NOT NULL,
    reference_type VARCHAR(30) CHECK (reference_type IN (
        'PURCHASE_ORDER','PRESCRIPTION','ADJUSTMENT','STOCK_TAKE','RETURN'
    )),
    reference_id UUID,
    notes TEXT,
    performed_by UUID NOT NULL REFERENCES core.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_movement_batch ON pharmacy.stock_movements(batch_id);
CREATE INDEX idx_movement_type ON pharmacy.stock_movements(movement_type);
CREATE INDEX idx_movement_created ON pharmacy.stock_movements(created_at);

-- 6. pharmacy.prescriptions
CREATE TABLE pharmacy.prescriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients.patients(id),
    consultation_id UUID REFERENCES clinical.consultations(id) ON DELETE SET NULL,
    prescription_number VARCHAR(64) UNIQUE,
    prescribed_by UUID NOT NULL REFERENCES core.staff_profiles(id),
    prescription_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(25) NOT NULL DEFAULT 'PENDING' CHECK (status IN (
        'PENDING','DISPENSED','PARTIALLY_DISPENSED','CANCELLED'
    )),
    notes TEXT,
    is_voided BOOLEAN NOT NULL DEFAULT FALSE,
    void_reason VARCHAR(255),
    voided_by UUID REFERENCES core.users(id),
    voided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_presc_patient ON pharmacy.prescriptions(patient_id);
CREATE INDEX idx_presc_status ON pharmacy.prescriptions(status);
CREATE INDEX idx_presc_date ON pharmacy.prescriptions(prescription_date);

-- 7. pharmacy.prescription_lines
CREATE TABLE pharmacy.prescription_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prescription_id UUID NOT NULL REFERENCES pharmacy.prescriptions(id) ON DELETE CASCADE,
    medication_id UUID NOT NULL REFERENCES pharmacy.medications(id),
    dosage VARCHAR(50) NOT NULL,
    frequency VARCHAR(50) NOT NULL,
    duration VARCHAR(50) NOT NULL,
    quantity INT NOT NULL,
    instructions TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','DISPENSED','CANCELLED')),
    dispensed_by UUID REFERENCES core.users(id),
    dispensed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_prescline_presc ON pharmacy.prescription_lines(prescription_id);
CREATE INDEX idx_prescline_med ON pharmacy.prescription_lines(medication_id);

-- 8. pharmacy.purchase_orders
CREATE TABLE pharmacy.purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(50) NOT NULL UNIQUE,
    supplier_id UUID NOT NULL REFERENCES pharmacy.suppliers(id),
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expected_delivery_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SENT','RECEIVED','CANCELLED')),
    notes TEXT,
    created_by UUID NOT NULL REFERENCES core.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_po_supplier ON pharmacy.purchase_orders(supplier_id);
CREATE INDEX idx_po_status ON pharmacy.purchase_orders(status);

-- 9. pharmacy.purchase_order_lines
CREATE TABLE pharmacy.purchase_order_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID NOT NULL REFERENCES pharmacy.purchase_orders(id) ON DELETE CASCADE,
    medication_id UUID NOT NULL REFERENCES pharmacy.medications(id),
    quantity_ordered NUMERIC(12,2) NOT NULL,
    unit_cost NUMERIC(12,2) NOT NULL,
    received_quantity NUMERIC(12,2) DEFAULT 0,
    received_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pol_po ON pharmacy.purchase_order_lines(purchase_order_id);
CREATE INDEX idx_pol_med ON pharmacy.purchase_order_lines(medication_id);

-- 1. laboratory.test_types
CREATE TABLE laboratory.test_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_name VARCHAR(100) NOT NULL UNIQUE,
    category VARCHAR(50),
    description TEXT,
    standard_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. laboratory.test_parameters
CREATE TABLE laboratory.test_parameters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_type_id UUID NOT NULL REFERENCES laboratory.test_types(id) ON DELETE CASCADE,
    parameter_name VARCHAR(100) NOT NULL,
    unit_of_measurement VARCHAR(30),
    normal_reference_range VARCHAR(100),
    display_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_testparam_type ON laboratory.test_parameters(test_type_id);

-- 3. laboratory.requests
CREATE TABLE laboratory.requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_number VARCHAR(50) UNIQUE,
    patient_id UUID NOT NULL REFERENCES patients.patients(id),
    requesting_doctor_id UUID REFERENCES core.staff_profiles(id),
    consultation_id UUID REFERENCES clinical.consultations(id) ON DELETE SET NULL,
    priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('NORMAL','URGENT','STAT')),
    request_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','IN_PROGRESS','COMPLETED','CANCELLED')),
    notes TEXT,
    requested_by UUID NOT NULL REFERENCES core.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_labreq_patient ON laboratory.requests(patient_id);
CREATE INDEX idx_labreq_doctor ON laboratory.requests(requesting_doctor_id);
CREATE INDEX idx_labreq_status ON laboratory.requests(status);
CREATE INDEX idx_labreq_date ON laboratory.requests(request_date);

-- 4. laboratory.samples
CREATE TABLE laboratory.samples (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sample_id VARCHAR(30) NOT NULL UNIQUE,
    request_id UUID NOT NULL REFERENCES laboratory.requests(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients.patients(id),
    sample_type VARCHAR(50) NOT NULL,
    collected_date DATE NOT NULL,
    collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    collected_by UUID NOT NULL REFERENCES core.staff_profiles(id),
    status VARCHAR(20) NOT NULL DEFAULT 'REGISTERED' CHECK (status IN (
        'REGISTERED','IN_PROGRESS','PENDING_RESULTS','COMPLETED','CANCELLED'
    )),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sample_request ON laboratory.samples(request_id);
CREATE INDEX idx_sample_patient ON laboratory.samples(patient_id);
CREATE INDEX idx_sample_status ON laboratory.samples(status);

-- 5. laboratory.results
CREATE TABLE laboratory.results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES laboratory.requests(id) ON DELETE CASCADE,
    parameter_id UUID NOT NULL REFERENCES laboratory.test_parameters(id),
    result_value VARCHAR(100),
    interpretation VARCHAR(20) CHECK (interpretation IN ('NORMAL','HIGH','LOW','CRITICAL')),
    notes TEXT,
    performed_by UUID REFERENCES core.users(id),
    performed_at TIMESTAMPTZ,
    verified_by UUID REFERENCES core.users(id),
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_result_request ON laboratory.results(request_id);
CREATE INDEX idx_result_param ON laboratory.results(parameter_id);

-- 1. radiology.scan_types
CREATE TABLE radiology.scan_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_type VARCHAR(50) NOT NULL UNIQUE,
    category VARCHAR(50),
    description TEXT,
    standard_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    typical_duration_minutes INT,
    contrast_required BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. radiology.requests
CREATE TABLE radiology.requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_number VARCHAR(50) NOT NULL UNIQUE,
    patient_id UUID NOT NULL REFERENCES patients.patients(id),
    requesting_doctor_id UUID REFERENCES core.staff_profiles(id),
    consultation_id UUID REFERENCES clinical.consultations(id) ON DELETE SET NULL,
    scan_type_id UUID NOT NULL REFERENCES radiology.scan_types(id),
    clinical_indication TEXT,
    priority VARCHAR(20) NOT NULL DEFAULT 'ROUTINE' CHECK (priority IN ('ROUTINE','URGENT','STAT')),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN (
        'PENDING','SCHEDULED','IN_PROGRESS','COMPLETED','CANCELLED'
    )),
    requested_by UUID NOT NULL REFERENCES core.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_radreq_patient ON radiology.requests(patient_id);
CREATE INDEX idx_radreq_doctor ON radiology.requests(requesting_doctor_id);
CREATE INDEX idx_radreq_scan ON radiology.requests(scan_type_id);
CREATE INDEX idx_radreq_status ON radiology.requests(status);

-- 3. radiology.findings
CREATE TABLE radiology.findings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL UNIQUE REFERENCES radiology.requests(id) ON DELETE CASCADE,
    radiologist_id UUID NOT NULL REFERENCES core.staff_profiles(id),
    findings_text TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','FINALIZED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_findings_request ON radiology.findings(request_id);
CREATE INDEX idx_findings_rad ON radiology.findings(radiologist_id);

-- 4. radiology.reports - Immutable once signed
CREATE TABLE radiology.reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    findings_id UUID NOT NULL UNIQUE REFERENCES radiology.findings(id) ON DELETE CASCADE,
    request_id UUID NOT NULL REFERENCES radiology.requests(id) ON DELETE CASCADE,
    final_impression TEXT,
    conclusion TEXT,
    recommendations TEXT,
    radiologist_signature TEXT,
    signed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_report_findings ON radiology.reports(findings_id);
CREATE INDEX idx_report_request ON radiology.reports(request_id);

-- 5. radiology.images - File references only
CREATE TABLE radiology.images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES radiology.requests(id) ON DELETE CASCADE,
    file_path VARCHAR(500) NOT NULL,
    modality VARCHAR(30),
    series_description VARCHAR(255),
    number_of_images INT DEFAULT 1,
    file_size BIGINT,
    uploaded_by UUID NOT NULL REFERENCES core.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_image_request ON radiology.images(request_id);

-- 1. billing.services - Master catalog of billable services
CREATE TABLE billing.services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_code VARCHAR(30) NOT NULL UNIQUE,
    service_name VARCHAR(150) NOT NULL,
    category VARCHAR(50),
    description TEXT,
    standard_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    revenue_account_id UUID,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. billing.accounts - Hierarchical chart of accounts (IPSAS backbone)
CREATE TABLE billing.accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_code VARCHAR(30) NOT NULL UNIQUE,
    account_name VARCHAR(150) NOT NULL,
    parent_id UUID REFERENCES billing.accounts(id) ON DELETE SET NULL,
    account_type VARCHAR(20) NOT NULL CHECK (account_type IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
    normal_balance VARCHAR(10) NOT NULL CHECK (normal_balance IN ('DEBIT','CREDIT')),
    is_postable BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_account_parent ON billing.accounts(parent_id);
CREATE INDEX idx_account_type ON billing.accounts(account_type);

-- Link services to accounts
ALTER TABLE billing.services
    ADD CONSTRAINT fk_service_account FOREIGN KEY (revenue_account_id)
    REFERENCES billing.accounts(id) ON DELETE SET NULL;

-- 3. billing.posting_periods - Fiscal period control
CREATE TABLE billing.posting_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_name VARCHAR(50) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED','LOCKED')),
    fiscal_year INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_period_dates ON billing.posting_periods(start_date, end_date);

-- 4. billing.journal_entries - Immutable financial transactions
CREATE TABLE billing.journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_number VARCHAR(30) NOT NULL UNIQUE,
    posting_period_id UUID NOT NULL REFERENCES billing.posting_periods(id),
    entry_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','POSTED','REVERSED')),
    reference_type VARCHAR(30) CHECK (reference_type IN ('INVOICE','PAYMENT','CREDIT_NOTE','ADJUSTMENT','MANUAL')),
    reference_id UUID,
    description TEXT,
    reversal_of_id UUID REFERENCES billing.journal_entries(id),
    created_by UUID NOT NULL REFERENCES core.users(id),
    posted_by UUID REFERENCES core.users(id),
    posted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_je_period ON billing.journal_entries(posting_period_id);
CREATE INDEX idx_je_date ON billing.journal_entries(entry_date);
CREATE INDEX idx_je_status ON billing.journal_entries(status);
CREATE INDEX idx_je_reference ON billing.journal_entries(reference_type, reference_id);

-- 5. billing.journal_lines - Debits and credits
CREATE TABLE billing.journal_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_entry_id UUID NOT NULL REFERENCES billing.journal_entries(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES billing.accounts(id),
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('DEBIT','CREDIT')),
    amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_jl_entry ON billing.journal_lines(journal_entry_id);
CREATE INDEX idx_jl_account ON billing.journal_lines(account_id);

-- 6. billing.invoices
CREATE TABLE billing.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number VARCHAR(30) NOT NULL UNIQUE,
    patient_id UUID NOT NULL REFERENCES patients.patients(id),
    consultation_id UUID REFERENCES clinical.consultations(id) ON DELETE SET NULL,
    admission_id UUID REFERENCES inpatient.admissions(id) ON DELETE SET NULL,
    invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL,
    subtotal NUMERIC(15,2) NOT NULL DEFAULT 0,
    discount NUMERIC(15,2) NOT NULL DEFAULT 0,
    tax NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
        'DRAFT','ISSUED','PARTIALLY_PAID','PAID','VOIDED'
    )),
    is_voided BOOLEAN NOT NULL DEFAULT FALSE,
    void_reason TEXT,
    notes TEXT,
    created_by UUID NOT NULL REFERENCES core.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_inv_patient ON billing.invoices(patient_id);
CREATE INDEX idx_inv_status ON billing.invoices(status);
CREATE INDEX idx_inv_date ON billing.invoices(invoice_date);

-- 7. billing.invoice_items
CREATE TABLE billing.invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES billing.invoices(id) ON DELETE CASCADE,
    service_id UUID REFERENCES billing.services(id),
    description VARCHAR(255) NOT NULL,
    quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
    unit_price NUMERIC(12,2) NOT NULL,
    total_price NUMERIC(15,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invitem_invoice ON billing.invoice_items(invoice_id);
CREATE INDEX idx_invitem_service ON billing.invoice_items(service_id);

-- 8. billing.credit_notes
CREATE TABLE billing.credit_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credit_note_number VARCHAR(30) NOT NULL UNIQUE,
    invoice_id UUID NOT NULL REFERENCES billing.invoices(id),
    patient_id UUID NOT NULL REFERENCES patients.patients(id),
    reason TEXT NOT NULL,
    amount NUMERIC(15,2) NOT NULL,
    issued_by UUID NOT NULL REFERENCES core.users(id),
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    journal_entry_id UUID REFERENCES billing.journal_entries(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cn_invoice ON billing.credit_notes(invoice_id);
CREATE INDEX idx_cn_patient ON billing.credit_notes(patient_id);

-- 9. billing.payments
CREATE TABLE billing.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_number VARCHAR(30) NOT NULL UNIQUE,
    patient_id UUID NOT NULL REFERENCES patients.patients(id),
    amount NUMERIC(15,2) NOT NULL,
    payment_method_id UUID,
    transaction_reference VARCHAR(100),
    payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('PENDING','COMPLETED','FAILED','REFUNDED')),
    notes TEXT,
    received_by UUID NOT NULL REFERENCES core.users(id),
    journal_entry_id UUID REFERENCES billing.journal_entries(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pay_patient ON billing.payments(patient_id);
CREATE INDEX idx_pay_method ON billing.payments(payment_method_id);
CREATE INDEX idx_pay_date ON billing.payments(payment_date);

-- 10. billing.payment_allocations - Links payments to invoices
CREATE TABLE billing.payment_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL REFERENCES billing.payments(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL REFERENCES billing.invoices(id) ON DELETE CASCADE,
    allocated_amount NUMERIC(15,2) NOT NULL,
    allocated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (payment_id, invoice_id)
);

CREATE INDEX idx_alloc_payment ON billing.payment_allocations(payment_id);
CREATE INDEX idx_alloc_invoice ON billing.payment_allocations(invoice_id);

-- 11. billing.insurance_claims
CREATE TABLE billing.insurance_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_number VARCHAR(50) NOT NULL UNIQUE,
    invoice_id UUID NOT NULL REFERENCES billing.invoices(id),
    patient_id UUID NOT NULL REFERENCES patients.patients(id),
    insurance_policy_id UUID REFERENCES patients.insurance_policies(id),
    amount_claimed NUMERIC(15,2) NOT NULL,
    amount_approved NUMERIC(15,2) DEFAULT 0,
    amount_paid NUMERIC(15,2) DEFAULT 0,
    status VARCHAR(25) NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
        'DRAFT','SUBMITTED','UNDER_REVIEW','APPROVED','PARTIALLY_PAID','PAID','DENIED'
    )),
    submission_date TIMESTAMPTZ,
    denial_reason TEXT,
    notes TEXT,
    created_by UUID NOT NULL REFERENCES core.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_claim_invoice ON billing.insurance_claims(invoice_id);
CREATE INDEX idx_claim_patient ON billing.insurance_claims(patient_id);
CREATE INDEX idx_claim_status ON billing.insurance_claims(status);

-- 12. billing.bank_accounts
CREATE TABLE billing.bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_name VARCHAR(100) NOT NULL,
    account_number VARCHAR(50) NOT NULL,
    account_name VARCHAR(150) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'KES',
    gl_account_id UUID NOT NULL REFERENCES billing.accounts(id),
    current_balance NUMERIC(15,2) NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bank_gl ON billing.bank_accounts(gl_account_id);

-- 13. billing.bank_transactions
CREATE TABLE billing.bank_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_account_id UUID NOT NULL REFERENCES billing.bank_accounts(id),
    transaction_date DATE NOT NULL,
    amount NUMERIC(15,2) NOT NULL,
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('DEBIT','CREDIT')),
    reference VARCHAR(100),
    description TEXT,
    is_reconciled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_btxn_account ON billing.bank_transactions(bank_account_id);
CREATE INDEX idx_btxn_date ON billing.bank_transactions(transaction_date);
CREATE INDEX idx_btxn_reconciled ON billing.bank_transactions(is_reconciled);

-- 14. billing.bank_reconciliations
CREATE TABLE billing.bank_reconciliations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_account_id UUID NOT NULL REFERENCES billing.bank_accounts(id),
    reconciliation_date DATE NOT NULL,
    opening_balance NUMERIC(15,2) NOT NULL,
    closing_balance NUMERIC(15,2) NOT NULL,
    statement_balance NUMERIC(15,2) NOT NULL,
    performed_by UUID NOT NULL REFERENCES core.users(id),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recon_account ON billing.bank_reconciliations(bank_account_id);
CREATE INDEX idx_recon_date ON billing.bank_reconciliations(reconciliation_date);

-- 15. billing.budgets
CREATE TABLE billing.budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    budget_name VARCHAR(150) NOT NULL,
    fiscal_year INT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','ACTIVE','CLOSED')),
    approved_by UUID REFERENCES core.users(id),
    approved_at TIMESTAMPTZ,
    notes TEXT,
    created_by UUID NOT NULL REFERENCES core.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_budget_year ON billing.budgets(fiscal_year);

-- 16. billing.budget_items
CREATE TABLE billing.budget_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    budget_id UUID NOT NULL REFERENCES billing.budgets(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES billing.accounts(id),
    period_month INT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    planned_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (budget_id, account_id, period_month)
);

CREATE INDEX idx_buditem_budget ON billing.budget_items(budget_id);
CREATE INDEX idx_buditem_account ON billing.budget_items(account_id);

-- 17. billing.payment_methods
CREATE TABLE billing.payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    method_name VARCHAR(50) NOT NULL UNIQUE,
    method_code VARCHAR(20) NOT NULL UNIQUE,
    gl_account_id UUID NOT NULL REFERENCES billing.accounts(id),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Now link payments to payment_methods
ALTER TABLE billing.payments
    ADD CONSTRAINT fk_payment_method FOREIGN KEY (payment_method_id)
    REFERENCES billing.payment_methods(id) ON DELETE SET NULL;

-- 18. billing.tax_rates
CREATE TABLE billing.tax_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tax_name VARCHAR(50) NOT NULL,
    tax_code VARCHAR(20) NOT NULL UNIQUE,
    rate_percentage NUMERIC(5,2) NOT NULL,
    liability_account_id UUID NOT NULL REFERENCES billing.accounts(id),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1. communications.conversations
CREATE TABLE communications.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_type VARCHAR(20) NOT NULL CHECK (conversation_type IN ('DIRECT','GROUP')),
    name VARCHAR(150),
    avatar VARCHAR(500),
    created_by UUID NOT NULL REFERENCES core.users(id),
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_conv_type ON communications.conversations(conversation_type);

-- 2. communications.conversation_participants
CREATE TABLE communications.conversation_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES communications.conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('ADMIN','MEMBER')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_read_message_id UUID,
    is_muted BOOLEAN NOT NULL DEFAULT FALSE,
    left_at TIMESTAMPTZ,
    UNIQUE (conversation_id, user_id)
);

CREATE INDEX idx_cpart_conv ON communications.conversation_participants(conversation_id);
CREATE INDEX idx_cpart_user ON communications.conversation_participants(user_id);

-- 3. communications.messages - E2EE encrypted content
CREATE TABLE communications.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES communications.conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES core.users(id),
    parent_message_id UUID REFERENCES communications.messages(id) ON DELETE SET NULL,
    message_type VARCHAR(20) NOT NULL CHECK (message_type IN ('TEXT','IMAGE','VIDEO','FILE','VIEW_ONCE')),
    encrypted_payload TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    edited_at TIMESTAMPTZ,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    view_once_expires_at TIMESTAMPTZ
);

CREATE INDEX idx_msg_conv ON communications.messages(conversation_id);
CREATE INDEX idx_msg_sender ON communications.messages(sender_id);
CREATE INDEX idx_msg_parent ON communications.messages(parent_message_id);
CREATE INDEX idx_msg_created ON communications.messages(created_at);

-- Update conversation_participants FK
ALTER TABLE communications.conversation_participants
    ADD CONSTRAINT fk_cpart_last_read FOREIGN KEY (last_read_message_id)
    REFERENCES communications.messages(id) ON DELETE SET NULL;

-- 4. communications.message_attachments
CREATE TABLE communications.message_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES communications.messages(id) ON DELETE CASCADE,
    file_path VARCHAR(500) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(50),
    file_size BIGINT,
    thumbnail_path VARCHAR(500),
    encryption_key_hash VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_attach_msg ON communications.message_attachments(message_id);

-- 5. communications.message_delivery_receipts
CREATE TABLE communications.message_delivery_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES communications.messages(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
    delivery_status VARCHAR(20) NOT NULL DEFAULT 'SENT' CHECK (delivery_status IN ('SENT','DELIVERED','READ','VIEWED')),
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    viewed_at TIMESTAMPTZ,
    UNIQUE (message_id, recipient_id)
);

CREATE INDEX idx_receipt_msg ON communications.message_delivery_receipts(message_id);
CREATE INDEX idx_receipt_recipient ON communications.message_delivery_receipts(recipient_id);
CREATE INDEX idx_receipt_status ON communications.message_delivery_receipts(delivery_status);

-- 6. communications.message_reactions
CREATE TABLE communications.message_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES communications.messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
    reaction_type VARCHAR(30) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (message_id, user_id, reaction_type)
);

CREATE INDEX idx_reaction_msg ON communications.message_reactions(message_id);
CREATE INDEX idx_reaction_user ON communications.message_reactions(user_id);

-- 7. communications.message_edit_history
CREATE TABLE communications.message_edit_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES communications.messages(id) ON DELETE CASCADE,
    original_encrypted_payload TEXT NOT NULL,
    edited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    edited_by UUID NOT NULL REFERENCES core.users(id)
);

CREATE INDEX idx_edithist_msg ON communications.message_edit_history(message_id);

-- 8. communications.notification_providers
CREATE TABLE communications.notification_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_name VARCHAR(100) NOT NULL,
    provider_type VARCHAR(30) NOT NULL CHECK (provider_type IN (
        'FIREBASE_PUSH','TWILIO_SMS','SENDGRID_EMAIL','AFRICASTALKING','CUSTOM'
    )),
    credentials JSONB NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    priority INT NOT NULL DEFAULT 10,
    rate_limit_per_minute INT DEFAULT 60,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. communications.notification_templates
CREATE TABLE communications.notification_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_key VARCHAR(100) NOT NULL UNIQUE,
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('PUSH','SMS','EMAIL')),
    subject VARCHAR(255),
    body_template TEXT NOT NULL,
    locale VARCHAR(10) NOT NULL DEFAULT 'en',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (template_key, channel, locale)
);

-- 10. communications.notifications
CREATE TABLE communications.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    encrypted_body TEXT,
    priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_user ON communications.notifications(user_id);
CREATE INDEX idx_notif_read ON communications.notifications(user_id, is_read);
CREATE INDEX idx_notif_created ON communications.notifications(created_at);

-- 11. communications.notification_delivery_logs
CREATE TABLE communications.notification_delivery_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID NOT NULL REFERENCES communications.notifications(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES communications.notification_providers(id),
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('PUSH','SMS','EMAIL')),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENT','DELIVERED','FAILED')),
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    error_message TEXT,
    retry_count INT NOT NULL DEFAULT 0,
    external_id VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ndlog_notif ON communications.notification_delivery_logs(notification_id);
CREATE INDEX idx_ndlog_provider ON communications.notification_delivery_logs(provider_id);
CREATE INDEX idx_ndlog_status ON communications.notification_delivery_logs(status);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at (example for core.users)
-- Repeat for other tables as needed
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON core.users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON core.profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_staff_updated_at
    BEFORE UPDATE ON core.staff_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patients_updated_at
    BEFORE UPDATE ON patients.patients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_appointments_updated_at
    BEFORE UPDATE ON clinical.appointments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_consultations_updated_at
    BEFORE UPDATE ON clinical.consultations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at
    BEFORE UPDATE ON billing.invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Supabase role grants (no-op on plain Postgres where these roles are absent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA core, patients, clinical, inpatient, pharmacy, laboratory, radiology, billing, communications TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA core TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA patients TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA clinical TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA inpatient TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pharmacy TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA laboratory TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA radiology TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA billing TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA communications TO authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA core, patients, clinical, inpatient, pharmacy, laboratory, radiology, billing, communications TO service_role';
    EXECUTE 'GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA core, patients, clinical, inpatient, pharmacy, laboratory, radiology, billing, communications TO service_role';
    EXECUTE 'GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA core, patients, clinical, inpatient, pharmacy, laboratory, radiology, billing, communications TO service_role';
  END IF;
END $$;
