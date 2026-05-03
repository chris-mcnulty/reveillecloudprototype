-- Alert rules: add stream_key column for scoping (e.g. Copilot surface filter).
-- Idempotent: safe to run against databases that may already have this column
-- (e.g. when this project's primary workflow is `npm run db:push`).

ALTER TABLE "alert_rules" ADD COLUMN IF NOT EXISTS "stream_key" text;
