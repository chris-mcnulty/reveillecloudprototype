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

export const scheduledJobRuns = pgTable("scheduled_job_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobType: text("job_type").notNull(),
  tenantId: varchar("tenant_id"),
  testId: varchar("test_id"),
  testName: text("test_name"),
  status: text("status").notNull().default("pending"),
  result: jsonb("result").$type<Record<string, any>>(),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertScheduledJobRunSchema = createInsertSchema(scheduledJobRuns).omit({
  id: true,
  createdAt: true,
});
export type InsertScheduledJobRun = z.infer<typeof insertScheduledJobRunSchema>;
export type ScheduledJobRun = typeof scheduledJobRuns.$inferSelect;

export const usageReports = pgTable("usage_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  reportType: text("report_type").notNull(),
  reportDate: text("report_date"),
  data: jsonb("data").$type<Record<string, any>>().notNull(),
  collectedAt: timestamp("collected_at").notNull().defaultNow(),
});

export const insertUsageReportSchema = createInsertSchema(usageReports).omit({ id: true });
export type InsertUsageReport = z.infer<typeof insertUsageReportSchema>;
export type UsageReport = typeof usageReports.$inferSelect;

export const serviceHealthIncidents = pgTable("service_health_incidents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id"),
  externalId: text("external_id").notNull(),
  service: text("service").notNull(),
  status: text("status").notNull(),
  title: text("title").notNull(),
  classification: text("classification").notNull().default("incident"),
  startDateTime: timestamp("start_date_time"),
  endDateTime: timestamp("end_date_time"),
  lastUpdatedAt: timestamp("last_updated_at"),
  details: jsonb("details").$type<Record<string, any>>(),
  collectedAt: timestamp("collected_at").notNull().defaultNow(),
});

export const insertServiceHealthIncidentSchema = createInsertSchema(serviceHealthIncidents).omit({ id: true });
export type InsertServiceHealthIncident = z.infer<typeof insertServiceHealthIncidentSchema>;
export type ServiceHealthIncident = typeof serviceHealthIncidents.$inferSelect;

export const auditLogEntries = pgTable("audit_log_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  operation: text("operation").notNull(),
  userId: text("user_id"),
  userEmail: text("user_email"),
  objectId: text("object_id"),
  itemType: text("item_type"),
  siteUrl: text("site_url"),
  timestamp: timestamp("timestamp").notNull(),
  clientIp: text("client_ip"),
  details: jsonb("details").$type<Record<string, any>>(),
  collectedAt: timestamp("collected_at").notNull().defaultNow(),
});

export const insertAuditLogEntrySchema = createInsertSchema(auditLogEntries).omit({ id: true });
export type InsertAuditLogEntry = z.infer<typeof insertAuditLogEntrySchema>;
export type AuditLogEntry = typeof auditLogEntries.$inferSelect;

export const adminAuditLog = pgTable("admin_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id"),
  userId: text("user_id"),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  details: jsonb("details").$type<Record<string, any>>(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const insertAdminAuditLogSchema = createInsertSchema(adminAuditLog).omit({ id: true });
export type InsertAdminAuditLog = z.infer<typeof insertAdminAuditLogSchema>;
export type AdminAuditLog = typeof adminAuditLog.$inferSelect;

export const powerPlatformEnvironments = pgTable("power_platform_environments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  environmentId: text("environment_id").notNull(),
  displayName: text("display_name").notNull(),
  environmentType: text("environment_type"),
  region: text("region"),
  state: text("state"),
  properties: jsonb("properties").$type<Record<string, any>>(),
  collectedAt: timestamp("collected_at").notNull().defaultNow(),
});

export const insertPowerPlatformEnvironmentSchema = createInsertSchema(powerPlatformEnvironments).omit({ id: true });
export type InsertPowerPlatformEnvironment = z.infer<typeof insertPowerPlatformEnvironmentSchema>;
export type PowerPlatformEnvironment = typeof powerPlatformEnvironments.$inferSelect;

export const powerPlatformResources = pgTable("power_platform_resources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  environmentId: text("environment_id").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id").notNull(),
  displayName: text("display_name").notNull(),
  owner: text("owner"),
  status: text("status"),
  lastModifiedDate: text("last_modified_date"),
  lastRunDate: text("last_run_date"),
  details: jsonb("details").$type<Record<string, any>>(),
  collectedAt: timestamp("collected_at").notNull().defaultNow(),
});

export const insertPowerPlatformResourceSchema = createInsertSchema(powerPlatformResources).omit({ id: true });
export type InsertPowerPlatformResource = z.infer<typeof insertPowerPlatformResourceSchema>;
export type PowerPlatformResource = typeof powerPlatformResources.$inferSelect;

export const agentTraces = pgTable("agent_traces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  agentName: text("agent_name").notNull(),
  platform: text("platform").notNull(),
  status: text("status").notNull().default("running"),
  totalDurationMs: real("total_duration_ms"),
  errorSummary: text("error_summary"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
});

export const insertAgentTraceSchema = createInsertSchema(agentTraces).omit({ id: true });
export type InsertAgentTrace = z.infer<typeof insertAgentTraceSchema>;
export type AgentTrace = typeof agentTraces.$inferSelect;

export const agentTraceSpans = pgTable("agent_trace_spans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  traceId: varchar("trace_id").notNull().references(() => agentTraces.id),
  spanName: text("span_name").notNull(),
  spanType: text("span_type").notNull(),
  serviceName: text("service_name").notNull(),
  endpoint: text("endpoint"),
  durationMs: real("duration_ms"),
  statusCode: integer("status_code"),
  status: text("status").notNull().default("success"),
  errorMessage: text("error_message"),
  startOffset: real("start_offset").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
});

export const insertAgentTraceSpanSchema = createInsertSchema(agentTraceSpans).omit({ id: true });
export type InsertAgentTraceSpan = z.infer<typeof insertAgentTraceSpanSchema>;
export type AgentTraceSpan = typeof agentTraceSpans.$inferSelect;

export const copilotInteractions = pgTable("copilot_interactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  interactionId: text("interaction_id").notNull().unique(),
  requestId: text("request_id"),
  sessionId: text("session_id"),
  interactionType: text("interaction_type").notNull(),
  appClass: text("app_class"),
  userId: text("user_id"),
  userName: text("user_name"),
  bodyContent: text("body_content"),
  bodyContentType: text("body_content_type"),
  contexts: jsonb("contexts").$type<any[]>(),
  attachments: jsonb("attachments").$type<any[]>(),
  links: jsonb("links").$type<any[]>(),
  mentions: jsonb("mentions").$type<any[]>(),
  rawData: jsonb("raw_data").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").notNull(),
  collectedAt: timestamp("collected_at").notNull().defaultNow(),
});

export const insertCopilotInteractionSchema = createInsertSchema(copilotInteractions).omit({ id: true, collectedAt: true });
export type InsertCopilotInteraction = z.infer<typeof insertCopilotInteractionSchema>;
export type CopilotInteraction = typeof copilotInteractions.$inferSelect;

export const mcpServers = pgTable("mcp_servers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  description: text("description"),
  transportType: text("transport_type").notNull(),
  command: text("command"),
  args: jsonb("args").$type<string[]>(),
  env: jsonb("env").$type<Record<string, string>>(),
  url: text("url"),
  apiKey: text("api_key"),
  authType: text("auth_type").default("none"),
  status: text("status").notNull().default("unknown"),
  lastHeartbeat: timestamp("last_heartbeat"),
  uptime: integer("uptime").default(0),
  restartCount: integer("restart_count").default(0),
  version: text("version"),
  capabilities: jsonb("capabilities").$type<Record<string, any>>(),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  registeredAt: timestamp("registered_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertMcpServerSchema = createInsertSchema(mcpServers).omit({ id: true, registeredAt: true, updatedAt: true });
export type InsertMcpServer = z.infer<typeof insertMcpServerSchema>;
export type McpServer = typeof mcpServers.$inferSelect;

export const mcpToolCalls = pgTable("mcp_tool_calls", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: varchar("server_id").notNull().references(() => mcpServers.id),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  traceId: varchar("trace_id").references(() => agentTraces.id),
  sessionId: text("session_id"),
  method: text("method").notNull(),
  toolName: text("tool_name"),
  params: jsonb("params").$type<Record<string, any>>(),
  result: jsonb("result").$type<Record<string, any>>(),
  errorCode: integer("error_code"),
  errorMessage: text("error_message"),
  durationMs: real("duration_ms"),
  status: text("status").notNull().default("success"),
  calledAt: timestamp("called_at").notNull().defaultNow(),
});

export const insertMcpToolCallSchema = createInsertSchema(mcpToolCalls).omit({ id: true });
export type InsertMcpToolCall = z.infer<typeof insertMcpToolCallSchema>;
export type McpToolCall = typeof mcpToolCalls.$inferSelect;
