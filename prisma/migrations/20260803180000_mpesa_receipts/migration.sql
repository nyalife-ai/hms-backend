-- M-Pesa STK checkouts + printable HMS receipts
CREATE TABLE billing.mpesa_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    checkout_request_id VARCHAR(100) NOT NULL UNIQUE,
    merchant_request_id VARCHAR(100),
    phone VARCHAR(20) NOT NULL,
    amount NUMERIC(15,2) NOT NULL,
    account_reference VARCHAR(50) NOT NULL,
    description VARCHAR(200),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'CANCELLED')),
    result_code VARCHAR(20),
    result_desc TEXT,
    mpesa_receipt_number VARCHAR(50),
    visit_id UUID REFERENCES clinical.outpatient_visits(id) ON DELETE SET NULL,
    patient_id UUID REFERENCES patients.patients(id) ON DELETE SET NULL,
    source VARCHAR(30) NOT NULL DEFAULT 'RECEPTION'
        CHECK (source IN ('RECEPTION', 'PHARMACY')),
    initiated_by UUID NOT NULL REFERENCES core.users(id),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mpesa_status ON billing.mpesa_transactions(status);
CREATE INDEX idx_mpesa_visit ON billing.mpesa_transactions(visit_id);
CREATE INDEX idx_mpesa_created ON billing.mpesa_transactions(created_at DESC);

CREATE TABLE billing.receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_number VARCHAR(40) NOT NULL UNIQUE,
    patient_id UUID NOT NULL REFERENCES patients.patients(id),
    visit_id UUID REFERENCES clinical.outpatient_visits(id) ON DELETE SET NULL,
    invoice_id UUID REFERENCES billing.invoices(id) ON DELETE SET NULL,
    payment_id UUID REFERENCES billing.payments(id) ON DELETE SET NULL,
    mpesa_transaction_id UUID REFERENCES billing.mpesa_transactions(id) ON DELETE SET NULL,
    channel VARCHAR(20) NOT NULL
        CHECK (channel IN ('MPESA', 'CASH', 'INSURANCE')),
    amount NUMERIC(15,2) NOT NULL,
    issued_by UUID NOT NULL REFERENCES core.users(id),
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_receipts_patient ON billing.receipts(patient_id);
CREATE INDEX idx_receipts_visit ON billing.receipts(visit_id);
CREATE INDEX idx_receipts_issued ON billing.receipts(issued_at DESC);
