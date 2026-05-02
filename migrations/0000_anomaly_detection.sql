-- Anomaly detection feature migration
-- Idempotent: uses IF NOT EXISTS so it is safe to run against databases
-- that may already have these objects (e.g. provisioned via `npm run db:push`).
-- Adds:
--   * alerts.alert_type (default 'threshold'), alerts.stream_key, alerts.payload
--   * metric_baselines table (rolling-window stats per tenant x stream)
--   * anomaly_stream_configs table (per-stream sensitivity)
--   * unique indexes powering upserts and per-tenant lookups

ALTER TABLE "alerts" ADD COLUMN IF NOT EXISTS "alert_type" text DEFAULT 'threshold' NOT NULL;
--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN IF NOT EXISTS "stream_key" text;
--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN IF NOT EXISTS "payload" jsonb;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "metric_baselines" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"stream_key" text NOT NULL,
	"window_start" timestamp NOT NULL,
	"mean" real NOT NULL,
	"stddev" real NOT NULL,
	"p50" real NOT NULL,
	"p95" real NOT NULL,
	"sample_count" integer NOT NULL,
	"current" real,
	"z_score" real,
	"computed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "anomaly_stream_configs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"stream_key" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sensitivity" real DEFAULT 3 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_baseline_stream_window"
	ON "metric_baselines" ("tenant_id","stream_key","window_start");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_anomaly_tenant_stream"
	ON "anomaly_stream_configs" ("tenant_id","stream_key");
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "metric_baselines"
		ADD CONSTRAINT "metric_baselines_tenant_id_tenants_id_fk"
		FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id");
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "anomaly_stream_configs"
		ADD CONSTRAINT "anomaly_stream_configs_tenant_id_tenants_id_fk"
		FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id");
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
