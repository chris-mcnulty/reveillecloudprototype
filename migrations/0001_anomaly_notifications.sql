-- Anomaly notification settings (per-tenant)
-- Idempotent: safe to run against databases that may already have these objects
-- (e.g. when this project's primary workflow is `npm run db:push`).

CREATE TABLE IF NOT EXISTS "anomaly_notification_settings" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "tenant_id" varchar NOT NULL,
        "email_enabled" boolean DEFAULT false NOT NULL,
        "email_recipients" text[] DEFAULT ARRAY[]::text[] NOT NULL,
        "email_severities" text[] DEFAULT ARRAY['critical']::text[] NOT NULL,
        "teams_enabled" boolean DEFAULT false NOT NULL,
        "teams_webhook_url" text,
        "teams_severities" text[] DEFAULT ARRAY['warning','critical']::text[] NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_anomaly_notify_tenant"
        ON "anomaly_notification_settings" ("tenant_id");
--> statement-breakpoint

DO $$ BEGIN
        ALTER TABLE "anomaly_notification_settings"
                ADD CONSTRAINT "anomaly_notification_settings_tenant_id_tenants_id_fk"
                FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id");
EXCEPTION
        WHEN duplicate_object THEN null;
END $$;
