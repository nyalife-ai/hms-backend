-- Durable outpatient visit pipeline (denormalized stage machine used by HMS UI)
CREATE TABLE clinical.outpatient_visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients.patients(id) ON DELETE SET NULL,
    patient_name VARCHAR(200) NOT NULL,
    mrn VARCHAR(30) NOT NULL,
    age INT NOT NULL DEFAULT 0,
    gender VARCHAR(20) NOT NULL,
    phone VARCHAR(30) NOT NULL DEFAULT '',
    first_visit BOOLEAN NOT NULL DEFAULT FALSE,
    stage VARCHAR(30) NOT NULL,
    checked_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_op_visits_stage ON clinical.outpatient_visits(stage);
CREATE INDEX idx_op_visits_mrn ON clinical.outpatient_visits(mrn);
CREATE INDEX idx_op_visits_checked_in ON clinical.outpatient_visits(checked_in_at DESC);
