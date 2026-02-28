import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, real, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const organizations = pgTable("organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  adminEmail: text("admin_email").notNull(),
  mode: text("mode").notNull().default("standard"),
});

export const insertOrganizationSchema = createInsertSchema(organizations).omit({ id: true });
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type Organization = typeof organizations.$inferSelect;

export const tenants = pgTable("tenants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  adminEmail: text("admin_email").notNull(),
  primaryDomain: text("primary_domain").notNull(),
  status: text("status").notNull().default("Healthy"),
  consentStatus: text("consent_status").notNull().default("Pending"),
  consentedBy: text("consented_by"),
  consentedAt: timestamp("consented_at"),
  azureTenantId: text("azure_tenant_id"),
  azureClientId: text("azure_client_id"),
});

export const insertTenantSchema = createInsertSchema(tenants).omit({ id: true });
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type Tenant = typeof tenants.$inferSelect;

export const monitoredSystems = pgTable("monitored_systems", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull().default("Healthy"),
  latency: text("latency"),
});

export const insertMonitoredSystemSchema = createInsertSchema(monitoredSystems).omit({ id: true });
export type InsertMonitoredSystem = z.infer<typeof insertMonitoredSystemSchema>;
export type MonitoredSystem = typeof monitoredSystems.$inferSelect;

export const syntheticTests = pgTable("synthetic_tests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  type: text("type").notNull(),
  target: text("target").notNull(),
  interval: text("interval").notNull().default("5 min"),
  status: text("status").notNull().default("Active"),
  authContext: text("auth_context").default("delegated"),
  timeout: integer("timeout").default(30),
  collectNetworkPhases: boolean("collect_network_phases").default(true),
  collectDomTiming: boolean("collect_dom_timing").default(true),
});

export const insertSyntheticTestSchema = createInsertSchema(syntheticTests).omit({ id: true });
export type InsertSyntheticTest = z.infer<typeof insertSyntheticTestSchema>;
export type SyntheticTest = typeof syntheticTests.$inferSelect;

export const alertRules = pgTable("alert_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  description: text("description"),
  metric: text("metric").notNull(),
  condition: text("condition").notNull().default("gt"),
  threshold: integer("threshold").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  channels: jsonb("channels").$type<{ type: string; target: string }[]>().default([]),
});

export const insertAlertRuleSchema = createInsertSchema(alertRules).omit({ id: true });
export type InsertAlertRule = z.infer<typeof insertAlertRuleSchema>;
export type AlertRule = typeof alertRules.$inferSelect;

export const metrics = pgTable("metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  testId: varchar("test_id").references(() => syntheticTests.id),
  metricName: text("metric_name").notNull(),
  value: real("value").notNull(),
  unit: text("unit").default("ms"),
  site: text("site"),
  status: text("status").default("Success"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const insertMetricSchema = createInsertSchema(metrics).omit({ id: true });
export type InsertMetric = z.infer<typeof insertMetricSchema>;
export type Metric = typeof metrics.$inferSelect;

export const alerts = pgTable("alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  ruleId: varchar("rule_id").references(() => alertRules.id),
  title: text("title").notNull(),
  severity: text("severity").notNull().default("warning"),
  message: text("message"),
  acknowledged: boolean("acknowledged").notNull().default(false),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const insertAlertSchema = createInsertSchema(alerts).omit({ id: true });
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type Alert = typeof alerts.$inferSelect;

export const testRuns = pgTable("test_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  testId: varchar("test_id").notNull().references(() => syntheticTests.id),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  status: text("status").notNull().default("running"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  durationMs: real("duration_ms"),
  results: jsonb("results").$type<Record<string, any>>(),
  error: text("error"),
});

export const insertTestRunSchema = createInsertSchema(testRuns).omit({ id: true });
export type InsertTestRun = z.infer<typeof insertTestRunSchema>;
export type TestRun = typeof testRuns.$inferSelect;
