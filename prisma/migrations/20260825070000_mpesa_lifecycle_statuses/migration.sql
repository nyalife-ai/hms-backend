-- Expand M-Pesa lifecycle statuses used by STK queue/worker/finalize path.
-- FINALIZING was already written by code but was missing from the CHECK constraint.
ALTER TABLE billing.mpesa_transactions
  DROP CONSTRAINT IF EXISTS mpesa_transactions_status_check;

ALTER TABLE billing.mpesa_transactions
  ADD CONSTRAINT mpesa_transactions_status_check
  CHECK (
    status IN (
      'QUEUED',
      'PROCESSING',
      'PENDING',
      'FINALIZING',
      'SUCCESS',
      'FAILED',
      'CANCELLED',
      'TIMEOUT'
    )
  );
