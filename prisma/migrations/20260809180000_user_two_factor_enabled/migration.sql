-- Per-account email OTP two-factor authentication
ALTER TABLE core.users
  ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT false;
