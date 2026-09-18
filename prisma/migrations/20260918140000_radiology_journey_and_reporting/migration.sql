-- Radiology expansion, Stage A: real request lifecycle, department/billing
-- linkage, and versioned/templated reporting (amendment history).

-- Scan types: patient prep instructions, department, and an optional link to
-- a billing.services row (mirrors how Lab syncs its clinical-services catalog).
ALTER TABLE radiology.scan_types
  ADD COLUMN preparation_instructions TEXT,
  ADD COLUMN department_id UUID REFERENCES core.departments(id) ON DELETE SET NULL,
  ADD COLUMN billing_service_id UUID REFERENCES billing.services(id) ON DELETE SET NULL;

CREATE INDEX idx_scantype_department ON radiology.scan_types(department_id);

-- Requests: full lifecycle timestamps + cancellation reason, and broaden the
-- status check constraint to the real state machine (was PENDING/SCHEDULED/
-- IN_PROGRESS/COMPLETED/CANCELLED only).
ALTER TABLE radiology.requests
  ADD COLUMN cancellation_reason TEXT,
  ADD COLUMN scheduled_at TIMESTAMPTZ,
  ADD COLUMN checked_in_at TIMESTAMPTZ,
  ADD COLUMN started_at TIMESTAMPTZ,
  ADD COLUMN completed_at TIMESTAMPTZ,
  ADD COLUMN reported_at TIMESTAMPTZ,
  ADD COLUMN finalized_at TIMESTAMPTZ,
  ADD COLUMN cancelled_at TIMESTAMPTZ;

ALTER TABLE radiology.requests DROP CONSTRAINT requests_status_check;
ALTER TABLE radiology.requests ADD CONSTRAINT requests_status_check CHECK (status IN (
  'PENDING', 'SCHEDULED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED',
  'REPORT_PENDING', 'REPORTED', 'FINALIZED', 'CANCELLED', 'NO_SHOW'
));

CREATE INDEX idx_radreq_scheduled ON radiology.requests(scheduled_at);

-- Findings: allow more than one row per request so amendment/read history
-- can be kept instead of overwriting the only record in place.
ALTER TABLE radiology.findings DROP CONSTRAINT findings_request_id_key;

-- Reports: same 1:1 -> history relaxation, plus versioning/template/amendment
-- columns. A report is now DRAFT -> FINAL, optionally superseded by an
-- AMENDED report that points back at the one it amends.
ALTER TABLE radiology.reports DROP CONSTRAINT reports_findings_id_key;
ALTER TABLE radiology.reports
  ADD COLUMN template_id UUID,
  ADD COLUMN sections_data JSONB,
  ADD COLUMN version INT NOT NULL DEFAULT 1,
  ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'FINAL', 'AMENDED')),
  ADD COLUMN amends_report_id UUID REFERENCES radiology.reports(id) ON DELETE SET NULL,
  ADD COLUMN finalized_by UUID REFERENCES core.users(id),
  ADD COLUMN finalized_at TIMESTAMPTZ,
  ADD COLUMN amendment_reason TEXT;

-- Report templates: admin-configurable, data-driven sections per modality.
CREATE TABLE radiology.report_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL UNIQUE,
  modality VARCHAR(50),
  body_region VARCHAR(100),
  sections JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE radiology.reports
  ADD CONSTRAINT reports_template_id_fkey
  FOREIGN KEY (template_id) REFERENCES radiology.report_templates(id) ON DELETE SET NULL;
