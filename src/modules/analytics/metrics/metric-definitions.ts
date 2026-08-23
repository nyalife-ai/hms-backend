/**
 * Single source of truth for analytics KPI business definitions.
 * Reports/exports must use the same keys and meanings.
 */

export const METRIC_DEFINITIONS = {
  'patients.registered':
    'Count of patient records created in the period (deleted_at IS NULL).',
  'patients.total_active':
    'Count of non-deleted patient records existing at period end.',
  'appointments.total':
    'Appointments with appointment_date in the period (deleted_at IS NULL).',
  'appointments.completed':
    'Appointments in period with status COMPLETED.',
  'appointments.cancelled':
    'Appointments in period with status CANCELLED.',
  'appointments.no_show':
    'Appointments in period with status NO_SHOW.',
  'appointments.pending':
    'Appointments in period with status SCHEDULED or CHECKED_IN (or similar non-terminal).',
  'appointments.completion_rate':
    'completed / total appointments in period × 100 (0 if total is 0).',
  'revenue.billed':
    'Sum of Invoices.total_amount where invoice_date in period, is_voided=false, deleted_at IS NULL.',
  'revenue.collected':
    'Sum of Payments.amount where payment_date in period and status COMPLETED. Does not include insurance claim amounts.',
  'revenue.allocated':
    'Sum of PaymentAllocations.allocated_amount where allocated_at in period.',
  'revenue.outstanding':
    'Sum of (invoice.total_amount − allocated − credit notes) for non-void, non-deleted invoices with remaining balance > 0 at query time, restricted to invoices with invoice_date in period.',
  'invoices.count':
    'Count of non-void, non-deleted invoices with invoice_date in period.',
  'payments.count':
    'Count of COMPLETED payments with payment_date in period.',
  'claims.submitted':
    'Insurance claims with submission_date in period (any status after draft submission).',
  'claims.approved_value':
    'Sum of amount_approved for claims with submission_date in period and approved-like status.',
  'claims.denied_value':
    'Sum of amount_claimed for claims denied in period (status DENIED).',
  'claims.pending':
    'Count of claims in SUBMITTED/PENDING/UNDER_REVIEW status with submission_date in period.',
  'lab.requests':
    'Laboratory requests with request_date in period.',
  'lab.completed':
    'Laboratory requests in period with status COMPLETED or RESULTS_READY / RELEASED equivalents.',
  'lab.pending':
    'Laboratory requests in period still PENDING/PROCESSING/SAMPLE_COLLECTED.',
  'lab.avg_tat_hours':
    'Average hours from request_date to first verified_at on results, for requests verified in period. Omitted when insufficient timestamps.',
  'pharmacy.prescriptions':
    'Non-void, non-deleted prescriptions with prescription_date in period.',
  'pharmacy.dispensed_lines':
    'Prescription lines with dispensed_at in period.',
  'pharmacy.stock_value':
    'Sum of quantity_on_hand × unit_cost across batches (point-in-time).',
  'pharmacy.near_expiry_batches':
    'Batches with quantity_on_hand > 0 and expiry_date within next 90 days (point-in-time).',
  'ipd.admissions':
    'Admissions with admission_date in period.',
  'ipd.discharges':
    'Admissions with discharge_date in period.',
  'ipd.current_inpatients':
    'Admissions currently ADMITTED (point-in-time).',
  'ipd.occupancy_pct':
    'Occupied beds / total beds × 100 (point-in-time). Occupied = status OCCUPIED.',
  'ipd.avg_los_days':
    'Average (discharge_date − admission_date) in days for discharges in period.',
  'radiology.requests':
    'Radiology requests created in period.',
  'radiology.completed':
    'Radiology requests in period with completed/reported status.',
  'radiology.pending':
    'Radiology requests in period still pending/in progress.',
  'followups.scheduled':
    'Follow-ups with follow_up_date in period and status SCHEDULED.',
  'followups.completed':
    'Follow-ups with follow_up_date in period and status COMPLETED.',
  'followups.overdue':
    'Follow-ups with status SCHEDULED and follow_up_date before today (point-in-time).',
  'staff.active':
    'Staff profiles with is_active=true and deleted_at IS NULL (point-in-time).',
  'void.invoices':
    'Invoices with is_voided=true updated/voided in period (uses updated_at when voided_at absent).',
  'void.prescriptions':
    'Prescriptions with is_voided=true and voided_at in period.',
  'audit.events':
    'Audit log rows with created_at in period.',
} as const;

export type MetricKey = keyof typeof METRIC_DEFINITIONS;

export function def(key: MetricKey): string {
  return METRIC_DEFINITIONS[key];
}
