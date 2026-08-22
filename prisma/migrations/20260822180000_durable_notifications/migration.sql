-- Durable notification fields: idempotency, navigation refs, delivery vs read.
ALTER TABLE "communications"."notifications"
  ADD COLUMN IF NOT EXISTS "idempotency_key" VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "entity_type" VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "entity_id" UUID,
  ADD COLUMN IF NOT EXISTS "action_path" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "delivery_status" VARCHAR(20) NOT NULL DEFAULT 'QUEUED',
  ADD COLUMN IF NOT EXISTS "ws_delivered_at" TIMESTAMPTZ(6);

CREATE UNIQUE INDEX IF NOT EXISTS "notifications_idempotency_key_key"
  ON "communications"."notifications" ("idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "notifications_user_id_is_read_idx"
  ON "communications"."notifications" ("user_id", "is_read");

-- Per-user notification sound preference (default ON).
ALTER TABLE "core"."profiles"
  ADD COLUMN IF NOT EXISTS "notification_sound_enabled" BOOLEAN NOT NULL DEFAULT true;
