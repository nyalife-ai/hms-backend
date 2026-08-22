-- Minimal FCM/APNs device registration store (communications schema).
CREATE TABLE IF NOT EXISTS communications.device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  token VARCHAR(512) NOT NULL,
  platform VARCHAR(20) NOT NULL,
  device_id VARCHAR(100),
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS device_tokens_token_key
  ON communications.device_tokens (token);

CREATE INDEX IF NOT EXISTS device_tokens_user_id_is_active_idx
  ON communications.device_tokens (user_id, is_active);
