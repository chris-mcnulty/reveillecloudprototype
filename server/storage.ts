import { db } from "./db";
import { eq, desc, and, gte, gt, asc, sql } from "drizzle-orm";
import { liveEvents } from "./events";
import { extractCopilotEnrichment } from "./collectors/copilotEnrichment";
import {
  organizations, type Organization, type InsertOrganization,
  tenants, type Tenant, type InsertTenant,
  monitoredSystems, type MonitoredSystem, type InsertMonitoredSystem,
  syntheticTests, type SyntheticTest, type InsertSyntheticTest,
  alertRules, type AlertRule, type InsertAlertRule,
  metrics, type Metric, type InsertMetric,
  alerts, type Alert, type InsertAlert,
  testRuns, type TestRun, type InsertTestRun,
  scheduledJobRuns, type ScheduledJobRun, type InsertScheduledJobRun,
  usageReports, type UsageReport, type InsertUsageReport,
  serviceHealthIncidents, type ServiceHealthIncident, type InsertServiceHealthIncident,
  auditLogEntries, type AuditLogEntry, type InsertAuditLogEntry,
  adminAuditLog, type AdminAuditLog, type InsertAdminAuditLog,
  powerPlatformEnvironments, type PowerPlatformEnvironment, type InsertPowerPlatformEnvironment,
  powerPlatformResources, type PowerPlatformResource, type InsertPowerPlatformResource,
  agentTraces, type AgentTrace, type InsertAgentTrace,
  agentTraceSpans, type AgentTraceSpan, type InsertAgentTraceSpan,
  copilotInteractions, type CopilotInteraction, type InsertCopilotInteraction,
  mcpServers, type McpServer, type InsertMcpServer,
  mcpToolCalls, type McpToolCall, type InsertMcpToolCall,
  entraSignIns, type EntraSignIn, type InsertEntraSignIn,
  speContainers, type SpeContainer, type InsertSpeContainer,
  speAccessEvents, type SpeAccessEvent, type InsertSpeAccessEvent,
  speSecurityEvents, type SpeSecurityEvent, type InsertSpeSecurityEvent,
  speContentTypeStats, type SpeContentTypeStat, type InsertSpeContentTypeStat,
  knownAgents, type KnownAgent, type InsertKnownAgent,
  agentDiscoverySources, type AgentDiscoverySource, type InsertAgentDiscoverySource,
  llmModels, type LlmModel, type InsertLlmModel,
  llmCalls, type LlmCall, type InsertLlmCall,
  savedViews, type SavedView, type InsertSavedView,
} from "@shared/schema";
import { or } from "drizzle-orm";

export interface IStorage {
  getOrganizations(): Promise<Organization[]>;
  getOrganization(id: string): Promise<Organization | undefined>;
  createOrganization(org: InsertOrganization): Promise<Organization>;
  updateOrganization(id: string, data: Partial<InsertOrganization>): Promise<Organization | undefined>;
  getActiveOrganization(): Promise<Organization | undefined>;

  getTenants(): Promise<Tenant[]>;
  getTenantsByOrg(orgId: string): Promise<Tenant[]>;
  getTenant(id: string): Promise<Tenant | undefined>;
  createTenant(tenant: InsertTenant): Promise<Tenant>;
  updateTenant(id: string, data: Partial<InsertTenant>): Promise<Tenant | undefined>;
  deleteTenant(id: string): Promise<void>;

  getMonitoredSystems(tenantId: string): Promise<MonitoredSystem[]>;
  getAllMonitoredSystems(): Promise<MonitoredSystem[]>;
  createMonitoredSystem(system: InsertMonitoredSystem): Promise<MonitoredSystem>;
  updateMonitoredSystem(id: string, data: Partial<InsertMonitoredSystem>): Promise<MonitoredSystem | undefined>;
  deleteMonitoredSystem(id: string): Promise<void>;

  getSyntheticTests(tenantId: string): Promise<SyntheticTest[]>;
  getSyntheticTest(id: string): Promise<SyntheticTest | undefined>;
  createSyntheticTest(test: InsertSyntheticTest): Promise<SyntheticTest>;
  updateSyntheticTest(id: string, data: Partial<InsertSyntheticTest>): Promise<SyntheticTest | undefined>;
  deleteSyntheticTest(id: string): Promise<void>;

  getAlertRules(tenantId: string): Promise<AlertRule[]>;
  createAlertRule(rule: InsertAlertRule): Promise<AlertRule>;
  updateAlertRule(id: string, data: Partial<InsertAlertRule>): Promise<AlertRule | undefined>;
  deleteAlertRule(id: string): Promise<void>;

  getMetrics(tenantId: string, since?: Date): Promise<Metric[]>;
  getLatestMetrics(tenantId: string, limit?: number): Promise<Metric[]>;
  createMetric(metric: InsertMetric): Promise<Metric>;
  getMetricsSummary(tenantId: string): Promise<{ avgLatency: number; errorCount: number; totalTests: number }>;

  getAlerts(tenantId?: string): Promise<Alert[]>;
  createAlert(alert: InsertAlert): Promise<Alert>;
  acknowledgeAlert(id: string): Promise<Alert | undefined>;

  getGlobalStats(): Promise<{ totalTenants: number; activeIncidents: number; totalTests24h: number }>;

  getTestRuns(testId: string, limit?: number): Promise<TestRun[]>;
  getTestRunsByTenant(tenantId: string, limit?: number): Promise<TestRun[]>;
  createTestRun(run: InsertTestRun): Promise<TestRun>;
  updateTestRun(id: string, data: Partial<TestRun>): Promise<TestRun | undefined>;
  getAllTests(): Promise<SyntheticTest[]>;

  createScheduledJobRun(data: InsertScheduledJobRun): Promise<ScheduledJobRun>;
  updateScheduledJobRun(id: string, data: Partial<InsertScheduledJobRun>): Promise<ScheduledJobRun | null>;
  getScheduledJobRuns(limit?: number): Promise<ScheduledJobRun[]>;
  getScheduledJobRunsByTenant(tenantId: string, limit?: number): Promise<ScheduledJobRun[]>;
  getScheduledJobRunsByType(jobType: string, limit?: number): Promise<ScheduledJobRun[]>;
  getRunningJobs(): Promise<ScheduledJobRun[]>;
  getLatestJobRunForTest(testId: string): Promise<ScheduledJobRun | null>;

  createUsageReport(report: InsertUsageReport): Promise<UsageReport>;
  getUsageReports(tenantId: string, reportType?: string, since?: Date): Promise<UsageReport[]>;
  getLatestUsageReport(tenantId: string, reportType: string): Promise<UsageReport | null>;

  upsertServiceHealthIncident(data: InsertServiceHealthIncident): Promise<ServiceHealthIncident>;
  getServiceHealthIncidents(tenantId?: string, status?: string): Promise<ServiceHealthIncident[]>;
  getActiveServiceHealthIncidents(): Promise<ServiceHealthIncident[]>;

  createAuditLogEntry(entry: InsertAuditLogEntry): Promise<AuditLogEntry>;
  getAuditLogEntries(tenantId: string, since?: Date, operation?: string, limit?: number, offset?: number): Promise<AuditLogEntry[]>;
  getAuditLogStats(tenantId: string): Promise<{ operation: string; count: number }[]>;

  createAdminAuditEntry(entry: InsertAdminAuditLog): Promise<AdminAuditLog>;
  getAdminAuditLog(tenantId?: string, since?: Date, limit?: number): Promise<AdminAuditLog[]>;

  upsertPowerPlatformEnvironment(data: InsertPowerPlatformEnvironment): Promise<PowerPlatformEnvironment>;
  getPowerPlatformEnvironments(tenantId: string): Promise<PowerPlatformEnvironment[]>;
  upsertPowerPlatformResource(data: InsertPowerPlatformResource): Promise<PowerPlatformResource>;
  getPowerPlatformResources(tenantId: string, envId?: string, resourceType?: string): Promise<PowerPlatformResource[]>;
  getPowerPlatformResourceStats(tenantId: string): Promise<{ resourceType: string; count: number }[]>;

  createAgentTrace(data: InsertAgentTrace): Promise<AgentTrace>;
  getAgentTraces(tenantId?: string, platform?: string, status?: string, limit?: number, offset?: number): Promise<{ items: AgentTrace[]; total: number }>;
  getAgentTrace(id: string): Promise<AgentTrace | undefined>;
  getAgentTraceWithSpans(id: string): Promise<{ trace: AgentTrace; spans: AgentTraceSpan[] } | undefined>;
  createAgentTraceSpan(data: InsertAgentTraceSpan): Promise<AgentTraceSpan>;
  getAgentTraceSpans(traceId: string): Promise<AgentTraceSpan[]>;
  getAgentHealthSummary(tenantId?: string): Promise<{ agentName: string; platform: string; status: string; lastInvocation: Date | null; successRate24h: number; avgLatency: number }[]>;
  deleteAgentTrace(id: string): Promise<void>;

  createCopilotInteraction(data: InsertCopilotInteraction): Promise<CopilotInteraction>;
  getCopilotInteractions(tenantId: string, options?: { userId?: string; appClass?: string; sessionId?: string; modelName?: string; attributedSurface?: string; limit?: number; offset?: number }): Promise<{ items: CopilotInteraction[]; total: number }>;
  getCopilotInteractionsByRequestId(tenantId: string, requestId: string): Promise<CopilotInteraction[]>;
  getCopilotSessionInteractions(tenantId: string, sessionId: string): Promise<CopilotInteraction[]>;
  getCopilotInteractionStats(tenantId: string): Promise<{ totalInteractions: number; uniqueUsers: number; uniqueSessions: number; appBreakdown: Record<string, number>; successRate: number }>;
  getLatestCopilotInteractionDate(tenantId: string): Promise<Date | null>;
  getLatestCopilotInteractionDateForUser(tenantId: string, userId: string): Promise<Date | null>;
  getCopilotSessions(tenantId: string, options?: { appClass?: string; userId?: string; status?: string; dateFrom?: string; dateTo?: string; modelName?: string; attributedSurface?: string; offset?: number; limit?: number; sortBy?: string; sortOrder?: string }): Promise<{ sessions: { sessionId: string; userId: string; userName: string | null; appClass: string | null; turns: number; latestTime: string; firstPrompt: string | null; promptCount: number; responseCount: number; status: string }[]; total: number }>;
  getCopilotModelStats(tenantId: string, since?: Date): Promise<{
    totalInteractions: number;
    totalResponses: number;
    avgLatencyMs: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
    emptyResponseRate: number;
    byModel: { modelLabel: string; modelName: string | null; calls: number; responseCalls: number; avgLatencyMs: number; p50LatencyMs: number; p95LatencyMs: number; p99LatencyMs: number; emptyResponseRate: number; uniqueUsers: number; surfaceBreakdown: Record<string, number>; capabilityBreakdown: Record<string, number> }[];
    bySurface: { surface: string; calls: number; avgLatencyMs: number; emptyResponseRate: number }[];
    byCapability: { capability: string; calls: number }[];
  }>;
  getCopilotModelLatencyDistribution(tenantId: string, modelLabel: string, since?: Date): Promise<{ bucket: string; count: number }[]>;
  linkCopilotPairLatency(tenantId: string, requestId: string): Promise<number>;
  backfillCopilotEnrichment(tenantId?: string): Promise<{ scanned: number; updated: number; latencyComputed: number; tenantsTouched: number }>;

  createMcpServer(data: InsertMcpServer): Promise<McpServer>;
  updateMcpServer(id: string, data: Partial<InsertMcpServer>): Promise<McpServer | undefined>;
  getMcpServers(tenantId: string): Promise<McpServer[]>;
  getMcpServer(id: string): Promise<McpServer | undefined>;
  deleteMcpServer(id: string): Promise<void>;
  createMcpToolCall(data: InsertMcpToolCall): Promise<McpToolCall>;
  getMcpToolCalls(serverId: string, options?: { limit?: number; offset?: number; method?: string; status?: string; sessionId?: string }): Promise<{ items: McpToolCall[]; total: number }>;
  getMcpServerStats(tenantId: string): Promise<{ totalServers: number; runningCount: number; totalToolCalls: number; errorRate: number; avgLatency: number; toolBreakdown: Record<string, number> }>;
  getMcpServerHealth(serverId: string): Promise<{ recentCalls: McpToolCall[]; errorRate: number; avgLatency: number; totalCalls: number }>;

  upsertEntraSignIn(data: InsertEntraSignIn): Promise<EntraSignIn>;
  getEntraSignIns(tenantId: string, options?: { limit?: number; offset?: number; userId?: string; appName?: string; status?: string; riskLevel?: string; since?: string }): Promise<{ items: EntraSignIn[]; total: number }>;
  getEntraSignInStats(tenantId: string): Promise<{
    totalSignIns: number; uniqueUsers: number; failureCount: number; mfaRate: number; riskySignIns: number;
    topApps: { app: string; count: number }[];
    topLocations: { location: string; count: number }[];
    trend: { hour: string; success: number; failure: number }[];
  }>;
  getEntraSignInUserBreakdown(tenantId: string): Promise<{
    userId: string; userPrincipalName: string; userDisplayName: string | null;
    loginCount: number; lastLogin: Date | null; failureCount: number; riskEvents: number;
  }[]>;

  upsertSpeContainer(data: InsertSpeContainer): Promise<SpeContainer>;
  getSpeContainers(tenantId: string): Promise<SpeContainer[]>;
  getSpeContainer(containerId: string): Promise<SpeContainer | undefined>;
  createSpeAccessEvent(data: InsertSpeAccessEvent): Promise<SpeAccessEvent>;
  getSpeAccessEvents(tenantId: string, opts?: { containerId?: string; since?: Date; limit?: number; operation?: string }): Promise<SpeAccessEvent[]>;
  createSpeSecurityEvent(data: InsertSpeSecurityEvent): Promise<SpeSecurityEvent>;
  getSpeSecurityEvents(tenantId: string, opts?: { since?: Date; limit?: number; severity?: string; containerId?: string }): Promise<SpeSecurityEvent[]>;
  upsertSpeContentTypeStat(data: InsertSpeContentTypeStat): Promise<SpeContentTypeStat>;
  getSpeContentTypeStats(tenantId: string, containerId?: string): Promise<SpeContentTypeStat[]>;
  getSpeStats(tenantId: string): Promise<{
    totalContainers: number;
    totalStorageBytes: number;
    totalItems: number;
    accessEventsLast24h: number;
    securityEventsLast24h: number;
    topOperations: { operation: string; count: number }[];
    topContainers: { containerId: string; displayName: string; accessCount: number }[];
    securityEventsBySeverity: { severity: string; count: number }[];
  }>;

  createKnownAgent(data: InsertKnownAgent): Promise<KnownAgent>;
  upsertKnownAgentByExternalId(data: InsertKnownAgent): Promise<KnownAgent>;
  updateKnownAgent(id: string, data: Partial<InsertKnownAgent>): Promise<KnownAgent | undefined>;
  getKnownAgents(tenantId: string, opts?: { source?: string; status?: string }): Promise<KnownAgent[]>;
  getKnownAgent(id: string): Promise<KnownAgent | undefined>;
  deleteKnownAgent(id: string): Promise<void>;

  createAgentDiscoverySource(data: InsertAgentDiscoverySource): Promise<AgentDiscoverySource>;
  updateAgentDiscoverySource(id: string, data: Partial<InsertAgentDiscoverySource>): Promise<AgentDiscoverySource | undefined>;
  getAgentDiscoverySources(tenantId: string): Promise<AgentDiscoverySource[]>;
  getAgentDiscoverySource(id: string): Promise<AgentDiscoverySource | undefined>;
  deleteAgentDiscoverySource(id: string): Promise<void>;

  createLlmModel(data: InsertLlmModel): Promise<LlmModel>;
  updateLlmModel(id: string, data: Partial<InsertLlmModel>): Promise<LlmModel | undefined>;
  getLlmModels(tenantId: string): Promise<LlmModel[]>;
  getLlmModel(id: string): Promise<LlmModel | undefined>;
  deleteLlmModel(id: string): Promise<void>;

  createLlmCall(data: InsertLlmCall): Promise<LlmCall>;
  getLlmCalls(tenantId: string, opts?: { modelId?: string; agentId?: string; status?: string; errorClass?: string; limit?: number; offset?: number }): Promise<{ items: LlmCall[]; total: number }>;
  getLlmStats(tenantId: string, opts?: { since?: Date; agentId?: string }): Promise<{
    totalCalls: number;
    successCount: number;
    errorRate: number;
    avgDurationMs: number;
    avgTtftMs: number;
    avgTokensPerSec: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCostCents: number;
    byModel: { modelId: string; modelName: string; provider: string; calls: number; avgDurationMs: number; avgTtftMs: number; totalTokens: number; costCents: number; errorRate: number }[];
    byProvider: { provider: string; calls: number; costCents: number }[];
    byErrorClass: { errorClass: string; count: number }[];
    timeseries: { bucket: string; calls: number; avgDurationMs: number; costCents: number }[];
  }>;
  getLlmModelHealth(modelId: string): Promise<{ recentCalls: LlmCall[]; errorRate: number; avgDurationMs: number; avgTtftMs: number; totalCalls: number; totalCostCents: number }>;

  createSavedView(data: InsertSavedView): Promise<SavedView>;
  updateSavedView(id: string, data: Partial<InsertSavedView>): Promise<SavedView | undefined>;
  deleteSavedView(id: string): Promise<void>;
  getSavedView(id: string): Promise<SavedView | undefined>;
  listSavedViewsForUser(orgId: string, userId: string, pageKey?: string): Promise<SavedView[]>;
}

function sameStringArray(a: string[] | null, b: string[] | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export class DatabaseStorage implements IStorage {
  async getOrganizations(): Promise<Organization[]> {
    return db.select().from(organizations);
  }

  async getOrganization(id: string): Promise<Organization | undefined> {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, id));
    return org;
  }

  async createOrganization(org: InsertOrganization): Promise<Organization> {
    const [created] = await db.insert(organizations).values(org).returning();
    return created;
  }

  async updateOrganization(id: string, data: Partial<InsertOrganization>): Promise<Organization | undefined> {
    const [updated] = await db.update(organizations).set(data).where(eq(organizations.id, id)).returning();
    return updated;
  }

  async getActiveOrganization(): Promise<Organization | undefined> {
    const orgs = await db.select().from(organizations);
    if (orgs.length === 1) return orgs[0];
    return orgs.find(o => o.mode === "standard") || orgs[0];
  }

  async getTenants(): Promise<Tenant[]> {
    return db.select().from(tenants);
  }

  async getTenantsByOrg(orgId: string): Promise<Tenant[]> {
    return db.select().from(tenants).where(eq(tenants.organizationId, orgId));
  }

  async getTenant(id: string): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id));
    return tenant;
  }

  async createTenant(tenant: InsertTenant): Promise<Tenant> {
    const [created] = await db.insert(tenants).values(tenant).returning();
    return created;
  }

  async updateTenant(id: string, data: Partial<InsertTenant>): Promise<Tenant | undefined> {
    const [updated] = await db.update(tenants).set(data).where(eq(tenants.id, id)).returning();
    return updated;
  }

  async deleteTenant(id: string): Promise<void> {
    await db.delete(llmCalls).where(eq(llmCalls.tenantId, id));
    await db.delete(llmModels).where(eq(llmModels.tenantId, id));
    await db.delete(knownAgents).where(eq(knownAgents.tenantId, id));
    await db.delete(agentDiscoverySources).where(eq(agentDiscoverySources.tenantId, id));
    const servers = await db.select({ id: mcpServers.id }).from(mcpServers).where(eq(mcpServers.tenantId, id));
    for (const s of servers) {
      await db.delete(mcpToolCalls).where(eq(mcpToolCalls.serverId, s.id));
    }
    await db.delete(mcpServers).where(eq(mcpServers.tenantId, id));
    await db.delete(mcpToolCalls).where(eq(mcpToolCalls.tenantId, id));
    await db.delete(entraSignIns).where(eq(entraSignIns.tenantId, id));
    await db.delete(copilotInteractions).where(eq(copilotInteractions.tenantId, id));
    const traces = await db.select({ id: agentTraces.id }).from(agentTraces).where(eq(agentTraces.tenantId, id));
    for (const t of traces) {
      await db.delete(agentTraceSpans).where(eq(agentTraceSpans.traceId, t.id));
    }
    await db.delete(agentTraces).where(eq(agentTraces.tenantId, id));
    await db.delete(powerPlatformResources).where(eq(powerPlatformResources.tenantId, id));
    await db.delete(powerPlatformEnvironments).where(eq(powerPlatformEnvironments.tenantId, id));
    await db.delete(adminAuditLog).where(eq(adminAuditLog.tenantId, id));
    await db.delete(auditLogEntries).where(eq(auditLogEntries.tenantId, id));
    await db.delete(usageReports).where(eq(usageReports.tenantId, id));
    await db.delete(serviceHealthIncidents).where(eq(serviceHealthIncidents.tenantId, id));
    await db.delete(alerts).where(eq(alerts.tenantId, id));
    await db.delete(metrics).where(eq(metrics.tenantId, id));
    const tests = await db.select({ id: syntheticTests.id }).from(syntheticTests).where(eq(syntheticTests.tenantId, id));
    for (const t of tests) {
      await db.delete(testRuns).where(eq(testRuns.testId, t.id));
    }
    await db.delete(syntheticTests).where(eq(syntheticTests.tenantId, id));
    await db.delete(alertRules).where(eq(alertRules.tenantId, id));
    await db.delete(monitoredSystems).where(eq(monitoredSystems.tenantId, id));
    await db.delete(scheduledJobRuns).where(eq(scheduledJobRuns.tenantId, id));
    await db.delete(tenants).where(eq(tenants.id, id));
  }

  async getMonitoredSystems(tenantId: string): Promise<MonitoredSystem[]> {
    return db.select().from(monitoredSystems).where(eq(monitoredSystems.tenantId, tenantId));
  }

  async getAllMonitoredSystems(): Promise<MonitoredSystem[]> {
    return db.select().from(monitoredSystems);
  }

  async createMonitoredSystem(system: InsertMonitoredSystem): Promise<MonitoredSystem> {
    const [created] = await db.insert(monitoredSystems).values(system).returning();
    return created;
  }

  async updateMonitoredSystem(id: string, data: Partial<InsertMonitoredSystem>): Promise<MonitoredSystem | undefined> {
    const [updated] = await db.update(monitoredSystems).set(data).where(eq(monitoredSystems.id, id)).returning();
    return updated;
  }

  async deleteMonitoredSystem(id: string): Promise<void> {
    await db.delete(monitoredSystems).where(eq(monitoredSystems.id, id));
  }

  async getSyntheticTests(tenantId: string): Promise<SyntheticTest[]> {
    return db.select().from(syntheticTests).where(eq(syntheticTests.tenantId, tenantId));
  }

  async getSyntheticTest(id: string): Promise<SyntheticTest | undefined> {
    const [test] = await db.select().from(syntheticTests).where(eq(syntheticTests.id, id));
    return test;
  }

  async createSyntheticTest(test: InsertSyntheticTest): Promise<SyntheticTest> {
    const [created] = await db.insert(syntheticTests).values(test).returning();
    return created;
  }

  async updateSyntheticTest(id: string, data: Partial<InsertSyntheticTest>): Promise<SyntheticTest | undefined> {
    const [updated] = await db.update(syntheticTests).set(data).where(eq(syntheticTests.id, id)).returning();
    return updated;
  }

  async deleteSyntheticTest(id: string): Promise<void> {
    await db.delete(syntheticTests).where(eq(syntheticTests.id, id));
  }

  async getAlertRules(tenantId: string): Promise<AlertRule[]> {
    return db.select().from(alertRules).where(eq(alertRules.tenantId, tenantId));
  }

  async createAlertRule(rule: InsertAlertRule): Promise<AlertRule> {
    const [created] = await db.insert(alertRules).values(rule).returning();
    return created;
  }

  async updateAlertRule(id: string, data: Partial<InsertAlertRule>): Promise<AlertRule | undefined> {
    const [updated] = await db.update(alertRules).set(data).where(eq(alertRules.id, id)).returning();
    return updated;
  }

  async deleteAlertRule(id: string): Promise<void> {
    await db.delete(alertRules).where(eq(alertRules.id, id));
  }

  async getMetrics(tenantId: string, since?: Date): Promise<Metric[]> {
    if (since) {
      return db.select().from(metrics)
        .where(and(eq(metrics.tenantId, tenantId), gte(metrics.timestamp, since)))
        .orderBy(desc(metrics.timestamp));
    }
    return db.select().from(metrics)
      .where(eq(metrics.tenantId, tenantId))
      .orderBy(desc(metrics.timestamp))
      .limit(500);
  }

  async getLatestMetrics(tenantId: string, limit = 10): Promise<Metric[]> {
    return db.select().from(metrics)
      .where(eq(metrics.tenantId, tenantId))
      .orderBy(desc(metrics.timestamp))
      .limit(limit);
  }

  async createMetric(metric: InsertMetric): Promise<Metric> {
    const [created] = await db.insert(metrics).values(metric).returning();
    return created;
  }

  async getMetricsSummary(tenantId: string): Promise<{ avgLatency: number; errorCount: number; totalTests: number }> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = await db.select({
      avgLatency: sql<number>`coalesce(avg(${metrics.value}), 0)`,
      errorCount: sql<number>`count(*) filter (where ${metrics.status} = 'Failed')`,
      totalTests: sql<number>`count(*)`,
    }).from(metrics)
      .where(and(eq(metrics.tenantId, tenantId), gte(metrics.timestamp, since)));
    return result[0] || { avgLatency: 0, errorCount: 0, totalTests: 0 };
  }

  async getAlerts(tenantId?: string): Promise<Alert[]> {
    if (tenantId) {
      return db.select().from(alerts).where(eq(alerts.tenantId, tenantId)).orderBy(desc(alerts.timestamp));
    }
    return db.select().from(alerts).orderBy(desc(alerts.timestamp));
  }

  async createAlert(alert: InsertAlert): Promise<Alert> {
    const [created] = await db.insert(alerts).values(alert).returning();
    liveEvents.emit("alert.created", created.tenantId ?? null, created);
    return created;
  }

  async acknowledgeAlert(id: string): Promise<Alert | undefined> {
    const [updated] = await db.update(alerts).set({ acknowledged: true }).where(eq(alerts.id, id)).returning();
    return updated;
  }

  async getGlobalStats(): Promise<{ totalTenants: number; activeIncidents: number; totalTests24h: number }> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [tenantCount] = await db.select({ count: sql<number>`count(*)` }).from(tenants);
    const [incidentCount] = await db.select({ count: sql<number>`count(*)` }).from(alerts).where(eq(alerts.acknowledged, false));
    const [testCount] = await db.select({ count: sql<number>`count(*)` }).from(metrics).where(gte(metrics.timestamp, since));
    return {
      totalTenants: Number(tenantCount?.count || 0),
      activeIncidents: Number(incidentCount?.count || 0),
      totalTests24h: Number(testCount?.count || 0),
    };
  }

  async getTestRuns(testId: string, limit = 20): Promise<TestRun[]> {
    return db.select().from(testRuns)
      .where(eq(testRuns.testId, testId))
      .orderBy(desc(testRuns.startedAt))
      .limit(limit);
  }

  async getTestRunsByTenant(tenantId: string, limit = 50): Promise<TestRun[]> {
    return db.select().from(testRuns)
      .where(eq(testRuns.tenantId, tenantId))
      .orderBy(desc(testRuns.startedAt))
      .limit(limit);
  }

  async createTestRun(run: InsertTestRun): Promise<TestRun> {
    const [created] = await db.insert(testRuns).values(run).returning();
    return created;
  }

  async updateTestRun(id: string, data: Partial<TestRun>): Promise<TestRun | undefined> {
    const [updated] = await db.update(testRuns).set(data).where(eq(testRuns.id, id)).returning();
    return updated;
  }

  async getAllTests(): Promise<SyntheticTest[]> {
    return db.select().from(syntheticTests);
  }

  async createScheduledJobRun(data: InsertScheduledJobRun): Promise<ScheduledJobRun> {
    const [jobRun] = await db.insert(scheduledJobRuns).values(data).returning();
    return jobRun;
  }

  async updateScheduledJobRun(id: string, data: Partial<InsertScheduledJobRun>): Promise<ScheduledJobRun | null> {
    const [jobRun] = await db.update(scheduledJobRuns)
      .set(data)
      .where(eq(scheduledJobRuns.id, id))
      .returning();
    return jobRun || null;
  }

  async getScheduledJobRuns(limit = 100): Promise<ScheduledJobRun[]> {
    return db.select().from(scheduledJobRuns)
      .orderBy(desc(scheduledJobRuns.createdAt))
      .limit(limit);
  }

  async getScheduledJobRunsByTenant(tenantId: string, limit = 50): Promise<ScheduledJobRun[]> {
    return db.select().from(scheduledJobRuns)
      .where(eq(scheduledJobRuns.tenantId, tenantId))
      .orderBy(desc(scheduledJobRuns.createdAt))
      .limit(limit);
  }

  async getScheduledJobRunsByType(jobType: string, limit = 50): Promise<ScheduledJobRun[]> {
    return db.select().from(scheduledJobRuns)
      .where(eq(scheduledJobRuns.jobType, jobType))
      .orderBy(desc(scheduledJobRuns.createdAt))
      .limit(limit);
  }

  async getRunningJobs(): Promise<ScheduledJobRun[]> {
    return db.select().from(scheduledJobRuns)
      .where(eq(scheduledJobRuns.status, "running"))
      .orderBy(desc(scheduledJobRuns.startedAt));
  }

  async getLatestJobRunForTest(testId: string): Promise<ScheduledJobRun | null> {
    const [run] = await db.select().from(scheduledJobRuns)
      .where(and(
        eq(scheduledJobRuns.testId, testId),
        eq(scheduledJobRuns.jobType, "syntheticTest"),
      ))
      .orderBy(desc(scheduledJobRuns.createdAt))
      .limit(1);
    return run || null;
  }

  async createUsageReport(report: InsertUsageReport): Promise<UsageReport> {
    const [created] = await db.insert(usageReports).values(report).returning();
    return created;
  }

  async getUsageReports(tenantId: string, reportType?: string, since?: Date): Promise<UsageReport[]> {
    const conditions = [eq(usageReports.tenantId, tenantId)];
    if (reportType) conditions.push(eq(usageReports.reportType, reportType));
    if (since) conditions.push(gte(usageReports.collectedAt, since));
    return db.select().from(usageReports)
      .where(and(...conditions))
      .orderBy(desc(usageReports.collectedAt))
      .limit(200);
  }

  async getLatestUsageReport(tenantId: string, reportType: string): Promise<UsageReport | null> {
    const [report] = await db.select().from(usageReports)
      .where(and(eq(usageReports.tenantId, tenantId), eq(usageReports.reportType, reportType)))
      .orderBy(desc(usageReports.collectedAt))
      .limit(1);
    return report || null;
  }

  async upsertServiceHealthIncident(data: InsertServiceHealthIncident): Promise<ServiceHealthIncident> {
    const existing = await db.select().from(serviceHealthIncidents)
      .where(eq(serviceHealthIncidents.externalId, data.externalId))
      .limit(1);

    if (existing.length > 0) {
      const prevStatus = existing[0].status;
      const [updated] = await db.update(serviceHealthIncidents)
        .set({
          status: data.status,
          title: data.title,
          endDateTime: data.endDateTime,
          lastUpdatedAt: data.lastUpdatedAt,
          details: data.details,
          collectedAt: new Date(),
        })
        .where(eq(serviceHealthIncidents.externalId, data.externalId))
        .returning();
      if (prevStatus !== updated.status) {
        liveEvents.emit("service_health.changed", updated.tenantId ?? null, updated);
      }
      return updated;
    }

    const [created] = await db.insert(serviceHealthIncidents).values(data).returning();
    liveEvents.emit("service_health.changed", created.tenantId ?? null, created);
    return created;
  }

  async getServiceHealthIncidents(tenantId?: string, status?: string): Promise<ServiceHealthIncident[]> {
    const conditions: any[] = [];
    if (tenantId) conditions.push(eq(serviceHealthIncidents.tenantId, tenantId));
    if (status) conditions.push(eq(serviceHealthIncidents.status, status));
    return db.select().from(serviceHealthIncidents)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(serviceHealthIncidents.collectedAt))
      .limit(100);
  }

  async getActiveServiceHealthIncidents(): Promise<ServiceHealthIncident[]> {
    return db.select().from(serviceHealthIncidents)
      .where(
        and(
          sql`${serviceHealthIncidents.status} NOT IN ('resolved', 'postIncidentReviewPublished')`,
        )
      )
      .orderBy(desc(serviceHealthIncidents.startDateTime));
  }

  async createAuditLogEntry(entry: InsertAuditLogEntry): Promise<AuditLogEntry> {
    const [created] = await db.insert(auditLogEntries).values(entry).returning();
    return created;
  }

  async getAuditLogEntries(tenantId: string, since?: Date, operation?: string, limit = 200, offset = 0): Promise<AuditLogEntry[]> {
    // Audit log can have 100k+ rows per tenant, so COUNT(*) OVER() would force
    // a full index walk and blow past the <200 ms p95 budget. Run a plain
    // top-N index scan; callers needing a total can use the dedicated count
    // helper or `/audit-log/stats`.
    const conditions = [eq(auditLogEntries.tenantId, tenantId)];
    if (since) conditions.push(gte(auditLogEntries.timestamp, since));
    if (operation) conditions.push(eq(auditLogEntries.operation, operation));
    return db.select().from(auditLogEntries)
      .where(and(...conditions))
      .orderBy(desc(auditLogEntries.timestamp))
      .limit(limit)
      .offset(offset);
  }

  async getAuditLogStats(tenantId: string): Promise<{ operation: string; count: number }[]> {
    const result = await db.select({
      operation: auditLogEntries.operation,
      count: sql<number>`count(*)`,
    }).from(auditLogEntries)
      .where(eq(auditLogEntries.tenantId, tenantId))
      .groupBy(auditLogEntries.operation)
      .orderBy(sql`count(*) desc`);
    return result.map(r => ({ operation: r.operation, count: Number(r.count) }));
  }

  async createAdminAuditEntry(entry: InsertAdminAuditLog): Promise<AdminAuditLog> {
    const [created] = await db.insert(adminAuditLog).values(entry).returning();
    return created;
  }

  async getAdminAuditLog(tenantId?: string, since?: Date, limit = 100): Promise<AdminAuditLog[]> {
    const conditions: any[] = [];
    if (tenantId) conditions.push(eq(adminAuditLog.tenantId, tenantId));
    if (since) conditions.push(gte(adminAuditLog.timestamp, since));
    return db.select().from(adminAuditLog)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(adminAuditLog.timestamp))
      .limit(limit);
  }

  async upsertPowerPlatformEnvironment(data: InsertPowerPlatformEnvironment): Promise<PowerPlatformEnvironment> {
    const existing = await db.select().from(powerPlatformEnvironments)
      .where(and(
        eq(powerPlatformEnvironments.tenantId, data.tenantId),
        eq(powerPlatformEnvironments.environmentId, data.environmentId),
      )).limit(1);

    if (existing.length > 0) {
      const [updated] = await db.update(powerPlatformEnvironments)
        .set({ ...data, collectedAt: new Date() })
        .where(eq(powerPlatformEnvironments.id, existing[0].id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(powerPlatformEnvironments).values(data).returning();
    return created;
  }

  async getPowerPlatformEnvironments(tenantId: string): Promise<PowerPlatformEnvironment[]> {
    return db.select().from(powerPlatformEnvironments)
      .where(eq(powerPlatformEnvironments.tenantId, tenantId))
      .orderBy(desc(powerPlatformEnvironments.collectedAt));
  }

  async upsertPowerPlatformResource(data: InsertPowerPlatformResource): Promise<PowerPlatformResource> {
    const existing = await db.select().from(powerPlatformResources)
      .where(and(
        eq(powerPlatformResources.tenantId, data.tenantId),
        eq(powerPlatformResources.resourceId, data.resourceId),
        eq(powerPlatformResources.resourceType, data.resourceType),
      )).limit(1);

    if (existing.length > 0) {
      const [updated] = await db.update(powerPlatformResources)
        .set({ ...data, collectedAt: new Date() })
        .where(eq(powerPlatformResources.id, existing[0].id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(powerPlatformResources).values(data).returning();
    return created;
  }

  async getPowerPlatformResources(tenantId: string, envId?: string, resourceType?: string): Promise<PowerPlatformResource[]> {
    const conditions: any[] = [eq(powerPlatformResources.tenantId, tenantId)];
    if (envId) conditions.push(eq(powerPlatformResources.environmentId, envId));
    if (resourceType) conditions.push(eq(powerPlatformResources.resourceType, resourceType));
    return db.select().from(powerPlatformResources)
      .where(and(...conditions))
      .orderBy(desc(powerPlatformResources.collectedAt))
      .limit(500);
  }

  async getPowerPlatformResourceStats(tenantId: string): Promise<{ resourceType: string; count: number }[]> {
    const result = await db.select({
      resourceType: powerPlatformResources.resourceType,
      count: sql<string>`count(*)`,
    }).from(powerPlatformResources)
      .where(eq(powerPlatformResources.tenantId, tenantId))
      .groupBy(powerPlatformResources.resourceType)
      .orderBy(sql`count(*) desc`);
    return result.map(r => ({ resourceType: r.resourceType, count: Number(r.count) }));
  }

  async createAgentTrace(data: InsertAgentTrace): Promise<AgentTrace> {
    const [created] = await db.insert(agentTraces).values(data).returning();
    liveEvents.emit("agent_trace.created", created.tenantId ?? null, created);
    return created;
  }

  async getAgentTraces(tenantId?: string, platform?: string, status?: string, limit = 50, offset = 0): Promise<{ items: AgentTrace[]; total: number }> {
    const conditions: any[] = [];
    if (tenantId) conditions.push(eq(agentTraces.tenantId, tenantId));
    if (platform) conditions.push(eq(agentTraces.platform, platform));
    if (status) conditions.push(eq(agentTraces.status, status));
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const rows = await db.select({
      row: agentTraces,
      total: sql<number>`count(*) over()`.as("total"),
    }).from(agentTraces)
      .where(whereClause)
      .orderBy(desc(agentTraces.startedAt))
      .limit(limit)
      .offset(offset);
    if (rows.length > 0) {
      return { items: rows.map(r => r.row), total: Number(rows[0].total) };
    }
    if (offset > 0) {
      const [c] = await db.select({ total: sql<number>`count(*)` }).from(agentTraces).where(whereClause);
      return { items: [], total: Number(c?.total ?? 0) };
    }
    return { items: [], total: 0 };
  }

  async getAgentTrace(id: string): Promise<AgentTrace | undefined> {
    const [trace] = await db.select().from(agentTraces).where(eq(agentTraces.id, id));
    return trace;
  }

  async getAgentTraceWithSpans(id: string): Promise<{ trace: AgentTrace; spans: AgentTraceSpan[] } | undefined> {
    const [trace] = await db.select().from(agentTraces).where(eq(agentTraces.id, id));
    if (!trace) return undefined;
    const spans = await db.select().from(agentTraceSpans)
      .where(eq(agentTraceSpans.traceId, id))
      .orderBy(agentTraceSpans.sortOrder);
    return { trace, spans };
  }

  async createAgentTraceSpan(data: InsertAgentTraceSpan): Promise<AgentTraceSpan> {
    const [created] = await db.insert(agentTraceSpans).values(data).returning();
    const [parent] = await db.select().from(agentTraces).where(eq(agentTraces.id, created.traceId)).limit(1);
    if (parent) {
      liveEvents.emit("agent_trace.updated", parent.tenantId ?? null, { trace: parent, span: created });
    }
    return created;
  }

  async getAgentTraceSpans(traceId: string): Promise<AgentTraceSpan[]> {
    return db.select().from(agentTraceSpans)
      .where(eq(agentTraceSpans.traceId, traceId))
      .orderBy(agentTraceSpans.sortOrder);
  }

  async getAgentHealthSummary(tenantId?: string): Promise<{ agentName: string; platform: string; status: string; lastInvocation: Date | null; successRate24h: number; avgLatency: number }[]> {
    const tenantFilter = tenantId ? sql`WHERE tenant_id = ${tenantId}` : sql``;
    const rows = await db.execute(sql`
      WITH latest AS (
        SELECT DISTINCT ON (agent_name, platform)
          agent_name, platform, status AS latest_status, started_at AS latest_started_at
        FROM agent_traces
        ${tenantFilter}
        ORDER BY agent_name, platform, started_at DESC
      ),
      agg AS (
        SELECT
          agent_name,
          platform,
          COUNT(*) FILTER (WHERE started_at >= NOW() - INTERVAL '24 hours')::int AS recent_count,
          COUNT(*) FILTER (WHERE started_at >= NOW() - INTERVAL '24 hours' AND status = 'success')::int AS recent_success,
          COALESCE(
            AVG(total_duration_ms) FILTER (WHERE started_at >= NOW() - INTERVAL '24 hours' AND total_duration_ms IS NOT NULL),
            0
          )::real AS avg_latency
        FROM agent_traces
        ${tenantFilter}
        GROUP BY agent_name, platform
      )
      SELECT
        agg.agent_name,
        agg.platform,
        agg.recent_count,
        agg.recent_success,
        agg.avg_latency,
        latest.latest_status,
        latest.latest_started_at
      FROM agg
      LEFT JOIN latest ON latest.agent_name = agg.agent_name AND latest.platform = agg.platform
    `);

    return (rows.rows as any[]).map(r => {
      const recentCount = Number(r.recent_count) || 0;
      const recentSuccess = Number(r.recent_success) || 0;
      const successRate = recentCount > 0 ? Math.round((recentSuccess / recentCount) * 100) : 0;
      const latestStatus = r.latest_status as string | null;

      let status = "healthy";
      if (latestStatus === "failed") status = "failed";
      else if (latestStatus === "degraded" || latestStatus === "running") status = latestStatus;
      else if (successRate < 80 && recentCount > 0) status = "degraded";

      return {
        agentName: r.agent_name,
        platform: r.platform,
        status,
        lastInvocation: r.latest_started_at ? new Date(r.latest_started_at) : null,
        successRate24h: successRate,
        avgLatency: Math.round(Number(r.avg_latency) || 0),
      };
    });
  }

  async deleteAgentTrace(id: string): Promise<void> {
    await db.delete(agentTraceSpans).where(eq(agentTraceSpans.traceId, id));
    await db.delete(agentTraces).where(eq(agentTraces.id, id));
  }

  async createCopilotInteraction(data: InsertCopilotInteraction): Promise<CopilotInteraction> {
    const [created] = await db.insert(copilotInteractions).values(data).returning();
    return created;
  }

  async getCopilotInteractions(tenantId: string, options?: { userId?: string; appClass?: string; sessionId?: string; modelName?: string; attributedSurface?: string; limit?: number; offset?: number }): Promise<{ items: CopilotInteraction[]; total: number }> {
    const conditions: any[] = [eq(copilotInteractions.tenantId, tenantId)];
    if (options?.userId) conditions.push(eq(copilotInteractions.userId, options.userId));
    if (options?.appClass) conditions.push(eq(copilotInteractions.appClass, options.appClass));
    if (options?.sessionId) conditions.push(eq(copilotInteractions.sessionId, options.sessionId));
    if (options?.modelName) conditions.push(eq(copilotInteractions.modelName, options.modelName));
    if (options?.attributedSurface) conditions.push(eq(copilotInteractions.attributedSurface, options.attributedSurface));
    const offset = options?.offset ?? 0;
    const rows = await db.select({
      row: copilotInteractions,
      total: sql<number>`count(*) over()`.as("total"),
    }).from(copilotInteractions)
      .where(and(...conditions))
      .orderBy(desc(copilotInteractions.createdAt))
      .limit(options?.limit ?? 50)
      .offset(offset);
    if (rows.length > 0) {
      return { items: rows.map(r => r.row), total: Number(rows[0].total) };
    }
    if (offset > 0) {
      const [c] = await db.select({ total: sql<number>`count(*)` }).from(copilotInteractions).where(and(...conditions));
      return { items: [], total: Number(c?.total ?? 0) };
    }
    return { items: [], total: 0 };
  }

  async getCopilotInteractionsByRequestId(tenantId: string, requestId: string): Promise<CopilotInteraction[]> {
    return db.select().from(copilotInteractions)
      .where(and(eq(copilotInteractions.tenantId, tenantId), eq(copilotInteractions.requestId, requestId)))
      .orderBy(copilotInteractions.createdAt);
  }

  async getCopilotSessionInteractions(tenantId: string, sessionId: string): Promise<CopilotInteraction[]> {
    return db.select().from(copilotInteractions)
      .where(and(eq(copilotInteractions.tenantId, tenantId), eq(copilotInteractions.sessionId, sessionId)))
      .orderBy(copilotInteractions.createdAt);
  }

  async getCopilotInteractionStats(tenantId: string): Promise<{ totalInteractions: number; uniqueUsers: number; uniqueSessions: number; appBreakdown: Record<string, number>; successRate: number }> {
    const [counts] = await db.select({
      totalInteractions: sql<number>`count(*)`,
      uniqueUsers: sql<number>`count(distinct ${copilotInteractions.userId})`,
      uniqueSessions: sql<number>`count(distinct ${copilotInteractions.sessionId})`,
    }).from(copilotInteractions)
      .where(eq(copilotInteractions.tenantId, tenantId));

    const appRows = await db.select({
      appClass: copilotInteractions.appClass,
      count: sql<number>`count(*)`,
    }).from(copilotInteractions)
      .where(eq(copilotInteractions.tenantId, tenantId))
      .groupBy(copilotInteractions.appClass);

    const appBreakdown: Record<string, number> = {};
    for (const row of appRows) {
      appBreakdown[row.appClass || "unknown"] = Number(row.count);
    }

    const successResult = await db.execute(sql`
      SELECT
        count(distinct case when ${copilotInteractions.interactionType} = 'userPrompt' then ${copilotInteractions.requestId} end) as "totalRequests",
        count(distinct case when ${copilotInteractions.interactionType} = 'aiResponse' then ${copilotInteractions.requestId} end) as "answeredRequests"
      FROM ${copilotInteractions}
      WHERE ${copilotInteractions.tenantId} = ${tenantId}
    `);
    const totalRequests = Number((successResult.rows[0] as any)?.totalRequests || 0);
    const answeredRequests = Number((successResult.rows[0] as any)?.answeredRequests || 0);
    const successRate = totalRequests > 0 ? Math.round((answeredRequests / totalRequests) * 100) : 100;

    return {
      totalInteractions: Number(counts?.totalInteractions || 0),
      uniqueUsers: Number(counts?.uniqueUsers || 0),
      uniqueSessions: Number(counts?.uniqueSessions || 0),
      appBreakdown,
      successRate,
    };
  }

  async getLatestCopilotInteractionDate(tenantId: string): Promise<Date | null> {
    const [result] = await db.select({
      maxDate: sql<Date | null>`max(${copilotInteractions.createdAt})`,
    }).from(copilotInteractions)
      .where(eq(copilotInteractions.tenantId, tenantId));
    return result?.maxDate || null;
  }

  async getLatestCopilotInteractionDateForUser(tenantId: string, userId: string): Promise<Date | null> {
    const [result] = await db.select({
      maxDate: sql<Date | null>`max(${copilotInteractions.createdAt})`,
    }).from(copilotInteractions)
      .where(and(
        eq(copilotInteractions.tenantId, tenantId),
        eq(copilotInteractions.userId, userId),
      ));
    return result?.maxDate || null;
  }

  async getCopilotSessions(tenantId: string, options?: { appClass?: string; userId?: string; status?: string; dateFrom?: string; dateTo?: string; modelName?: string; attributedSurface?: string; offset?: number; limit?: number; sortBy?: string; sortOrder?: string }): Promise<{ sessions: { sessionId: string; userId: string; userName: string | null; appClass: string | null; turns: number; latestTime: string; firstPrompt: string | null; promptCount: number; responseCount: number; status: string }[]; total: number }> {
    const conditions: any[] = [eq(copilotInteractions.tenantId, tenantId)];
    if (options?.appClass) conditions.push(eq(copilotInteractions.appClass, options.appClass));
    if (options?.userId) conditions.push(sql`(${copilotInteractions.userId} ILIKE ${'%' + options.userId + '%'} OR ${copilotInteractions.userName} ILIKE ${'%' + options.userId + '%'})`);
    if (options?.dateFrom) conditions.push(sql`${copilotInteractions.createdAt} >= ${options.dateFrom}::timestamp`);
    if (options?.dateTo) conditions.push(sql`${copilotInteractions.createdAt} < (${options.dateTo}::date + interval '1 day')`);
    if (options?.modelName) conditions.push(sql`${copilotInteractions.sessionId} IN (SELECT DISTINCT session_id FROM copilot_interactions WHERE tenant_id = ${tenantId} AND model_name = ${options.modelName})`);
    if (options?.attributedSurface) conditions.push(sql`${copilotInteractions.sessionId} IN (SELECT DISTINCT session_id FROM copilot_interactions WHERE tenant_id = ${tenantId} AND attributed_surface = ${options.attributedSurface})`);

    const statusFilter = options?.status;
    const havingClause = statusFilter === "success"
      ? sql`HAVING count(case when ${copilotInteractions.interactionType} = 'userPrompt' then 1 end) <= count(distinct case when ${copilotInteractions.interactionType} = 'aiResponse' then ${copilotInteractions.requestId} end)`
      : statusFilter === "partial"
      ? sql`HAVING count(case when ${copilotInteractions.interactionType} = 'userPrompt' then 1 end) > count(distinct case when ${copilotInteractions.interactionType} = 'aiResponse' then ${copilotInteractions.requestId} end) AND count(distinct case when ${copilotInteractions.interactionType} = 'aiResponse' then ${copilotInteractions.requestId} end) > 0`
      : statusFilter === "failed"
      ? sql`HAVING count(distinct case when ${copilotInteractions.interactionType} = 'aiResponse' then ${copilotInteractions.requestId} end) = 0`
      : sql``;

    const sortOrder = options?.sortOrder === "asc" ? "ASC" : "DESC";
    const orderByExpr = options?.sortBy === "turns"
      ? sql`count(case when ${copilotInteractions.interactionType} = 'userPrompt' then 1 end) ${sql.raw(sortOrder)}`
      : options?.sortBy === "userId"
      ? sql`max(case when ${copilotInteractions.interactionType} = 'userPrompt' then ${copilotInteractions.userId} else null end) ${sql.raw(sortOrder)} NULLS LAST`
      : sql`max(${copilotInteractions.createdAt}) ${sql.raw(sortOrder)}`;

    // Single query: compute total via window function to avoid a separate count round-trip
    const rows = await db.execute(sql`
      SELECT
        ${copilotInteractions.sessionId} as "sessionId",
        max(case when ${copilotInteractions.interactionType} = 'userPrompt' then ${copilotInteractions.userId} else null end) as "userId",
        max(case when ${copilotInteractions.interactionType} = 'userPrompt' then ${copilotInteractions.userName} else null end) as "userName",
        max(${copilotInteractions.appClass}) as "appClass",
        count(case when ${copilotInteractions.interactionType} = 'userPrompt' then 1 end)::int as "turns",
        max(${copilotInteractions.createdAt})::text as "latestTime",
        (array_agg(${copilotInteractions.bodyContent} order by ${copilotInteractions.createdAt}) filter (where ${copilotInteractions.interactionType} = 'userPrompt'))[1] as "firstPrompt",
        count(case when ${copilotInteractions.interactionType} = 'userPrompt' then 1 end)::int as "promptCount",
        count(distinct case when ${copilotInteractions.interactionType} = 'aiResponse' then ${copilotInteractions.requestId} end)::int as "responseCount",
        count(*) OVER() as "totalCount"
      FROM ${copilotInteractions}
      WHERE ${and(...conditions)}
      GROUP BY ${copilotInteractions.sessionId}
      ${havingClause}
      ORDER BY ${orderByExpr}
      LIMIT ${options?.limit ?? 25}
      OFFSET ${options?.offset ?? 0}
    `);

    const total = rows.rows.length > 0 ? Number((rows.rows[0] as any).totalCount || 0) : 0;

    const sessions = (rows.rows as any[]).map(r => {
      const promptCount = Number(r.promptCount) || 0;
      const responseCount = Number(r.responseCount) || 0;
      let status = "success";
      if (promptCount > 0 && responseCount === 0) status = "failed";
      else if (promptCount > responseCount) status = "partial";
      return {
        sessionId: r.sessionId || "",
        userId: r.userId || "Unknown",
        userName: r.userName || null,
        appClass: r.appClass || null,
        turns: Number(r.turns) || 0,
        latestTime: r.latestTime || "",
        firstPrompt: r.firstPrompt || null,
        promptCount,
        responseCount,
        status,
      };
    });

    return { sessions, total };
  }

  async getCopilotModelStats(tenantId: string, since?: Date): Promise<{
    totalInteractions: number;
    totalResponses: number;
    avgLatencyMs: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
    emptyResponseRate: number;
    byModel: { modelLabel: string; modelName: string | null; calls: number; responseCalls: number; avgLatencyMs: number; p50LatencyMs: number; p95LatencyMs: number; p99LatencyMs: number; emptyResponseRate: number; uniqueUsers: number; surfaceBreakdown: Record<string, number>; capabilityBreakdown: Record<string, number> }[];
    bySurface: { surface: string; calls: number; avgLatencyMs: number; emptyResponseRate: number }[];
    byCapability: { capability: string; calls: number }[];
  }> {
    const sinceCondition = since ? sql`AND created_at >= ${since.toISOString()}::timestamp` : sql``;

    const modelLabelExpr = sql`COALESCE(model_name, attributed_surface, 'Unknown')`;

    const overall = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total_interactions,
        COUNT(*) FILTER (WHERE interaction_type = 'aiResponse')::int AS total_responses,
        COALESCE(AVG(response_latency_ms) FILTER (WHERE response_latency_ms IS NOT NULL), 0)::real AS avg_latency,
        COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY response_latency_ms) FILTER (WHERE response_latency_ms IS NOT NULL), 0)::real AS p50,
        COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY response_latency_ms) FILTER (WHERE response_latency_ms IS NOT NULL), 0)::real AS p95,
        COALESCE(percentile_cont(0.99) WITHIN GROUP (ORDER BY response_latency_ms) FILTER (WHERE response_latency_ms IS NOT NULL), 0)::real AS p99,
        CASE
          WHEN COUNT(*) FILTER (WHERE interaction_type = 'aiResponse') = 0 THEN 0
          ELSE COUNT(*) FILTER (WHERE interaction_type = 'aiResponse' AND (body_content IS NULL OR length(trim(body_content)) = 0))::real
            / COUNT(*) FILTER (WHERE interaction_type = 'aiResponse')::real
        END AS empty_rate
      FROM copilot_interactions
      WHERE tenant_id = ${tenantId} ${sinceCondition}
    `);
    const o = (overall.rows as any[])[0] || {};

    const byModelRows = await db.execute(sql`
      SELECT
        ${modelLabelExpr} AS model_label,
        MAX(model_name) AS model_name,
        COUNT(*)::int AS calls,
        COUNT(*) FILTER (WHERE interaction_type = 'aiResponse')::int AS response_calls,
        COALESCE(AVG(response_latency_ms) FILTER (WHERE response_latency_ms IS NOT NULL), 0)::real AS avg_latency,
        COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY response_latency_ms) FILTER (WHERE response_latency_ms IS NOT NULL), 0)::real AS p50,
        COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY response_latency_ms) FILTER (WHERE response_latency_ms IS NOT NULL), 0)::real AS p95,
        COALESCE(percentile_cont(0.99) WITHIN GROUP (ORDER BY response_latency_ms) FILTER (WHERE response_latency_ms IS NOT NULL), 0)::real AS p99,
        CASE
          WHEN COUNT(*) FILTER (WHERE interaction_type = 'aiResponse') = 0 THEN 0
          ELSE COUNT(*) FILTER (WHERE interaction_type = 'aiResponse' AND (body_content IS NULL OR length(trim(body_content)) = 0))::real
            / COUNT(*) FILTER (WHERE interaction_type = 'aiResponse')::real
        END AS empty_rate,
        COUNT(DISTINCT user_id)::int AS unique_users
      FROM copilot_interactions
      WHERE tenant_id = ${tenantId} ${sinceCondition}
      GROUP BY model_label
      ORDER BY calls DESC
    `);

    const surfaceBreakdownRows = await db.execute(sql`
      SELECT
        ${modelLabelExpr} AS model_label,
        COALESCE(attributed_surface, 'Unknown') AS surface,
        COUNT(*)::int AS calls
      FROM copilot_interactions
      WHERE tenant_id = ${tenantId} ${sinceCondition}
      GROUP BY model_label, surface
    `);
    const surfaceBreakdownByModel: Record<string, Record<string, number>> = {};
    for (const r of surfaceBreakdownRows.rows as any[]) {
      const m = r.model_label || "Unknown";
      surfaceBreakdownByModel[m] = surfaceBreakdownByModel[m] || {};
      surfaceBreakdownByModel[m][r.surface] = Number(r.calls) || 0;
    }

    const capRows = await db.execute(sql`
      SELECT
        ${modelLabelExpr} AS model_label,
        cap AS capability,
        COUNT(*)::int AS calls
      FROM copilot_interactions
      LEFT JOIN LATERAL unnest(coalesce(capabilities, ARRAY[]::text[])) AS cap ON true
      WHERE tenant_id = ${tenantId} ${sinceCondition}
        AND cap IS NOT NULL
      GROUP BY model_label, cap
    `);
    const capByModel: Record<string, Record<string, number>> = {};
    for (const r of capRows.rows as any[]) {
      const m = r.model_label || "Unknown";
      capByModel[m] = capByModel[m] || {};
      capByModel[m][r.capability] = Number(r.calls) || 0;
    }

    const byModel = (byModelRows.rows as any[]).map(r => ({
      modelLabel: r.model_label || "Unknown",
      modelName: r.model_name || null,
      calls: Number(r.calls) || 0,
      responseCalls: Number(r.response_calls) || 0,
      avgLatencyMs: Math.round(Number(r.avg_latency) || 0),
      p50LatencyMs: Math.round(Number(r.p50) || 0),
      p95LatencyMs: Math.round(Number(r.p95) || 0),
      p99LatencyMs: Math.round(Number(r.p99) || 0),
      emptyResponseRate: Number(r.empty_rate) || 0,
      uniqueUsers: Number(r.unique_users) || 0,
      surfaceBreakdown: surfaceBreakdownByModel[r.model_label] || {},
      capabilityBreakdown: capByModel[r.model_label] || {},
    }));

    const bySurfaceRows = await db.execute(sql`
      SELECT
        COALESCE(attributed_surface, 'Unknown') AS surface,
        COUNT(*)::int AS calls,
        COALESCE(AVG(response_latency_ms) FILTER (WHERE response_latency_ms IS NOT NULL), 0)::real AS avg_latency,
        CASE
          WHEN COUNT(*) FILTER (WHERE interaction_type = 'aiResponse') = 0 THEN 0
          ELSE COUNT(*) FILTER (WHERE interaction_type = 'aiResponse' AND (body_content IS NULL OR length(trim(body_content)) = 0))::real
            / COUNT(*) FILTER (WHERE interaction_type = 'aiResponse')::real
        END AS empty_rate
      FROM copilot_interactions
      WHERE tenant_id = ${tenantId} ${sinceCondition}
      GROUP BY surface
      ORDER BY calls DESC
    `);
    const bySurface = (bySurfaceRows.rows as any[]).map(r => ({
      surface: r.surface,
      calls: Number(r.calls) || 0,
      avgLatencyMs: Math.round(Number(r.avg_latency) || 0),
      emptyResponseRate: Number(r.empty_rate) || 0,
    }));

    const byCapRows = await db.execute(sql`
      SELECT cap AS capability, COUNT(*)::int AS calls
      FROM copilot_interactions
      LEFT JOIN LATERAL unnest(coalesce(capabilities, ARRAY[]::text[])) AS cap ON true
      WHERE tenant_id = ${tenantId} ${sinceCondition} AND cap IS NOT NULL
      GROUP BY cap
      ORDER BY calls DESC
    `);
    const byCapability = (byCapRows.rows as any[]).map(r => ({
      capability: r.capability,
      calls: Number(r.calls) || 0,
    }));

    return {
      totalInteractions: Number(o.total_interactions) || 0,
      totalResponses: Number(o.total_responses) || 0,
      avgLatencyMs: Math.round(Number(o.avg_latency) || 0),
      p50LatencyMs: Math.round(Number(o.p50) || 0),
      p95LatencyMs: Math.round(Number(o.p95) || 0),
      p99LatencyMs: Math.round(Number(o.p99) || 0),
      emptyResponseRate: Number(o.empty_rate) || 0,
      byModel,
      bySurface,
      byCapability,
    };
  }

  async getCopilotModelLatencyDistribution(tenantId: string, modelLabel: string, since?: Date): Promise<{ bucket: string; count: number }[]> {
    const sinceCondition = since ? sql`AND created_at >= ${since.toISOString()}::timestamp` : sql``;
    const modelLabelExpr = sql`COALESCE(model_name, attributed_surface, 'Unknown')`;
    const rows = await db.execute(sql`
      WITH buckets AS (
        SELECT
          CASE
            WHEN response_latency_ms < 500 THEN '<500ms'
            WHEN response_latency_ms < 1000 THEN '500ms-1s'
            WHEN response_latency_ms < 2000 THEN '1-2s'
            WHEN response_latency_ms < 5000 THEN '2-5s'
            WHEN response_latency_ms < 10000 THEN '5-10s'
            WHEN response_latency_ms < 30000 THEN '10-30s'
            ELSE '30s+'
          END AS bucket,
          CASE
            WHEN response_latency_ms < 500 THEN 1
            WHEN response_latency_ms < 1000 THEN 2
            WHEN response_latency_ms < 2000 THEN 3
            WHEN response_latency_ms < 5000 THEN 4
            WHEN response_latency_ms < 10000 THEN 5
            WHEN response_latency_ms < 30000 THEN 6
            ELSE 7
          END AS sort_order
        FROM copilot_interactions
        WHERE tenant_id = ${tenantId}
          ${sinceCondition}
          AND response_latency_ms IS NOT NULL
          AND ${modelLabelExpr} = ${modelLabel}
      )
      SELECT bucket, COUNT(*)::int AS count, MIN(sort_order) AS sort_order
      FROM buckets
      GROUP BY bucket
      ORDER BY sort_order
    `);
    return (rows.rows as any[]).map(r => ({ bucket: r.bucket, count: Number(r.count) || 0 }));
  }

  async linkCopilotPairLatency(tenantId: string, requestId: string): Promise<number> {
    // Compute response_latency_ms for any aiResponse rows in this requestId
    // pair that don't yet have one. Works regardless of the order in which the
    // prompt and response rows were inserted: if the prompt arrives first, the
    // response insert resolves the latency; if the response arrives first, the
    // subsequent prompt insert resolves the latency.
    const result = await db.execute(sql`
      UPDATE copilot_interactions ci SET response_latency_ms = src.latency_ms
      FROM (
        SELECT r.id,
          (EXTRACT(EPOCH FROM (r.created_at - p.created_at)) * 1000)::int AS latency_ms
        FROM copilot_interactions r
        JOIN copilot_interactions p
          ON p.tenant_id = r.tenant_id
         AND p.request_id = r.request_id
         AND p.interaction_type = 'userPrompt'
        WHERE r.tenant_id = ${tenantId}
          AND r.request_id = ${requestId}
          AND r.interaction_type = 'aiResponse'
          AND r.response_latency_ms IS NULL
          AND EXTRACT(EPOCH FROM (r.created_at - p.created_at)) BETWEEN 0 AND 1800
      ) src
      WHERE ci.id = src.id
    `);
    return (result as any).rowCount || 0;
  }

  async backfillCopilotEnrichment(tenantId?: string): Promise<{ scanned: number; updated: number; latencyComputed: number; tenantsTouched: number }> {
    // Page through rows and re-run the shared extractor so any new
    // MODEL_NAME_PATHS / surface / capability rules are applied uniformly to
    // historical data — instead of re-implementing the parser in SQL.
    const baseCondition = tenantId ? eq(copilotInteractions.tenantId, tenantId) : undefined;

    const scannedRow = await db.select({ n: sql<number>`COUNT(*)::int` })
      .from(copilotInteractions)
      .where(baseCondition);
    const scanned = Number(scannedRow[0]?.n) || 0;

    const PAGE = 500;
    let lastId: string | null = null;
    let updated = 0;
    while (true) {
      const conds: any[] = [];
      if (baseCondition) conds.push(baseCondition);
      if (lastId) conds.push(gt(copilotInteractions.id, lastId));
      const rows = await db.select().from(copilotInteractions)
        .where(conds.length === 1 ? conds[0] : conds.length > 1 ? and(...conds) : undefined)
        .orderBy(asc(copilotInteractions.id))
        .limit(PAGE);
      if (rows.length === 0) break;

      for (const row of rows) {
        const enrichment = extractCopilotEnrichment(row.rawData ?? {});
        const newModel = enrichment.modelName;
        const newSurface = enrichment.attributedSurface;
        const newCaps = enrichment.capabilities;

        const modelChanged = (row.modelName ?? null) !== (newModel ?? null);
        const surfaceChanged = (row.attributedSurface ?? null) !== (newSurface ?? null);
        const capsChanged = !sameStringArray(row.capabilities ?? null, newCaps ?? null);

        if (modelChanged || surfaceChanged || capsChanged) {
          await db.update(copilotInteractions).set({
            modelName: newModel,
            attributedSurface: newSurface,
            capabilities: newCaps,
          }).where(eq(copilotInteractions.id, row.id));
          updated++;
        }
      }

      lastId = rows[rows.length - 1].id;
      if (rows.length < PAGE) break;
    }

    // Latency pass — single SQL JOIN that handles every order: a response is
    // matched to its prompt by (tenant, requestId), and any row missing a
    // latency gets one. This is order-independent because we re-run it after
    // every backfill / collection pass.
    const tenantFilterPlain = tenantId ? sql`tenant_id = ${tenantId}` : sql`TRUE`;
    const latencyTenantClause = tenantId ? sql`AND r.tenant_id = ${tenantId}` : sql``;
    const latencyUpdate = await db.execute(sql`
      UPDATE copilot_interactions ci SET response_latency_ms = src.latency_ms
      FROM (
        SELECT r.id,
          (EXTRACT(EPOCH FROM (r.created_at - p.created_at)) * 1000)::int AS latency_ms
        FROM copilot_interactions r
        JOIN copilot_interactions p
          ON p.tenant_id = r.tenant_id
         AND p.request_id = r.request_id
         AND p.interaction_type = 'userPrompt'
        WHERE r.interaction_type = 'aiResponse'
          AND r.request_id IS NOT NULL
          AND r.response_latency_ms IS NULL
          ${latencyTenantClause}
          AND EXTRACT(EPOCH FROM (r.created_at - p.created_at)) BETWEEN 0 AND 1800
      ) src
      WHERE ci.id = src.id
    `);
    const latencyCount = (latencyUpdate as any).rowCount || 0;

    const tenantsRow = await db.execute(sql`
      SELECT COUNT(DISTINCT tenant_id)::int AS n
      FROM copilot_interactions
      WHERE ${tenantFilterPlain}
        AND (attributed_surface IS NOT NULL OR capabilities IS NOT NULL OR response_latency_ms IS NOT NULL)
    `);
    const tenantsTouched = Number((tenantsRow.rows as any[])[0]?.n) || 0;

    return {
      scanned,
      updated: updated + latencyCount,
      latencyComputed: latencyCount,
      tenantsTouched,
    };
  }

  async createMcpServer(data: InsertMcpServer): Promise<McpServer> {
    const [server] = await db.insert(mcpServers).values(data).returning();
    return server;
  }

  async updateMcpServer(id: string, data: Partial<InsertMcpServer>): Promise<McpServer | undefined> {
    const [updated] = await db.update(mcpServers).set({ ...data, updatedAt: new Date() }).where(eq(mcpServers.id, id)).returning();
    return updated;
  }

  async getMcpServers(tenantId: string): Promise<McpServer[]> {
    return db.select().from(mcpServers).where(eq(mcpServers.tenantId, tenantId)).orderBy(desc(mcpServers.registeredAt));
  }

  async getMcpServer(id: string): Promise<McpServer | undefined> {
    const [server] = await db.select().from(mcpServers).where(eq(mcpServers.id, id));
    return server;
  }

  async deleteMcpServer(id: string): Promise<void> {
    await db.delete(mcpToolCalls).where(eq(mcpToolCalls.serverId, id));
    await db.delete(mcpServers).where(eq(mcpServers.id, id));
  }

  async createMcpToolCall(data: InsertMcpToolCall): Promise<McpToolCall> {
    const [call] = await db.insert(mcpToolCalls).values(data).returning();
    const [server] = await db.select().from(mcpServers).where(eq(mcpServers.id, call.serverId)).limit(1);
    liveEvents.emit("mcp_tool_call.recorded", server?.tenantId ?? null, { call, serverId: call.serverId });
    return call;
  }

  async getMcpToolCalls(serverId: string, options?: { limit?: number; offset?: number; method?: string; status?: string; sessionId?: string }): Promise<{ items: McpToolCall[]; total: number }> {
    const conditions = [eq(mcpToolCalls.serverId, serverId)];
    if (options?.method) conditions.push(eq(mcpToolCalls.method, options.method));
    if (options?.status) conditions.push(eq(mcpToolCalls.status, options.status));
    if (options?.sessionId) conditions.push(eq(mcpToolCalls.sessionId, options.sessionId));
    const offset = options?.offset ?? 0;
    const rows = await db.select({
      row: mcpToolCalls,
      total: sql<number>`count(*) over()`.as("total"),
    }).from(mcpToolCalls)
      .where(and(...conditions))
      .orderBy(desc(mcpToolCalls.calledAt))
      .limit(options?.limit ?? 50)
      .offset(offset);
    if (rows.length > 0) {
      return { items: rows.map(r => r.row), total: Number(rows[0].total) };
    }
    if (offset > 0) {
      const [c] = await db.select({ total: sql<number>`count(*)` }).from(mcpToolCalls).where(and(...conditions));
      return { items: [], total: Number(c?.total ?? 0) };
    }
    return { items: [], total: 0 };
  }

  async getMcpServerStats(tenantId: string): Promise<{ totalServers: number; runningCount: number; totalToolCalls: number; errorRate: number; avgLatency: number; toolBreakdown: Record<string, number> }> {
    const servers = await this.getMcpServers(tenantId);
    const totalServers = servers.length;
    const runningCount = servers.filter(s => s.status === "running").length;

    const serverIds = servers.map(s => s.id);
    if (serverIds.length === 0) {
      return { totalServers: 0, runningCount: 0, totalToolCalls: 0, errorRate: 0, avgLatency: 0, toolBreakdown: {} };
    }

    const statsRows = await db.execute(sql`
      SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE status = 'error')::int as errors,
        COALESCE(AVG(duration_ms), 0)::real as avg_latency
      FROM mcp_tool_calls
      WHERE tenant_id = ${tenantId}
    `);
    const stats = (statsRows.rows as any[])[0] || { total: 0, errors: 0, avg_latency: 0 };

    const toolRows = await db.execute(sql`
      SELECT tool_name, COUNT(*)::int as count
      FROM mcp_tool_calls
      WHERE tenant_id = ${tenantId} AND tool_name IS NOT NULL
      GROUP BY tool_name
      ORDER BY count DESC
    `);
    const toolBreakdown: Record<string, number> = {};
    for (const row of toolRows.rows as any[]) {
      toolBreakdown[row.tool_name] = row.count;
    }

    return {
      totalServers,
      runningCount,
      totalToolCalls: Number(stats.total) || 0,
      errorRate: stats.total > 0 ? (Number(stats.errors) / Number(stats.total)) * 100 : 0,
      avgLatency: Number(stats.avg_latency) || 0,
      toolBreakdown,
    };
  }

  async getMcpServerHealth(serverId: string): Promise<{ recentCalls: McpToolCall[]; errorRate: number; avgLatency: number; totalCalls: number }> {
    const { items: recentCalls } = await this.getMcpToolCalls(serverId, { limit: 20 });

    const statsRows = await db.execute(sql`
      SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE status = 'error')::int as errors,
        COALESCE(AVG(duration_ms), 0)::real as avg_latency
      FROM mcp_tool_calls
      WHERE server_id = ${serverId}
    `);
    const stats = (statsRows.rows as any[])[0] || { total: 0, errors: 0, avg_latency: 0 };

    return {
      recentCalls,
      errorRate: stats.total > 0 ? (Number(stats.errors) / Number(stats.total)) * 100 : 0,
      avgLatency: Number(stats.avg_latency) || 0,
      totalCalls: Number(stats.total) || 0,
    };
  }

  async upsertEntraSignIn(data: InsertEntraSignIn): Promise<EntraSignIn> {
    const [result] = await db.insert(entraSignIns).values(data)
      .onConflictDoUpdate({
        target: [entraSignIns.tenantId, entraSignIns.signInId],
        set: {
          status: data.status,
          errorCode: data.errorCode,
          failureReason: data.failureReason,
          riskLevel: data.riskLevel,
          riskState: data.riskState,
          riskDetail: data.riskDetail,
          conditionalAccessStatus: data.conditionalAccessStatus,
          mfaRequired: data.mfaRequired,
          mfaResult: data.mfaResult,
          collectedAt: new Date(),
        },
      })
      .returning();
    liveEvents.emit("entra_signin.batch", result.tenantId ?? null, { latest: result });
    return result;
  }

  async getEntraSignIns(tenantId: string, options?: { limit?: number; offset?: number; userId?: string; appName?: string; status?: string; riskLevel?: string; since?: string }): Promise<{ items: EntraSignIn[]; total: number }> {
    const conditions = [eq(entraSignIns.tenantId, tenantId)];
    if (options?.userId) conditions.push(eq(entraSignIns.userId, options.userId));
    if (options?.appName) conditions.push(eq(entraSignIns.appDisplayName, options.appName));
    if (options?.status) conditions.push(eq(entraSignIns.status, options.status));
    if (options?.riskLevel) conditions.push(eq(entraSignIns.riskLevel, options.riskLevel));
    if (options?.since) conditions.push(gte(entraSignIns.signInAt, new Date(options.since)));
    const offset = options?.offset ?? 0;
    const rows = await db.select({
      row: entraSignIns,
      total: sql<number>`count(*) over()`.as("total"),
    }).from(entraSignIns)
      .where(and(...conditions))
      .orderBy(desc(entraSignIns.signInAt))
      .limit(options?.limit || 200)
      .offset(offset);
    if (rows.length > 0) {
      return { items: rows.map(r => r.row), total: Number(rows[0].total) };
    }
    if (offset > 0) {
      const [c] = await db.select({ total: sql<number>`count(*)` }).from(entraSignIns).where(and(...conditions));
      return { items: [], total: Number(c?.total ?? 0) };
    }
    return { items: [], total: 0 };
  }

  async getEntraSignInStats(tenantId: string): Promise<{
    totalSignIns: number; uniqueUsers: number; failureCount: number; mfaRate: number; riskySignIns: number;
    topApps: { app: string; count: number }[];
    topLocations: { location: string; count: number }[];
    trend: { hour: string; success: number; failure: number }[];
  }> {
    const summaryRows = await db.execute(sql`
      SELECT
        COUNT(*)::int as total,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(*) FILTER (WHERE status = 'failure')::int as failures,
        COUNT(*) FILTER (WHERE mfa_required = true)::int as mfa_count,
        COUNT(*) FILTER (WHERE risk_level IN ('low','medium','high'))::int as risky
      FROM entra_sign_ins WHERE tenant_id = ${tenantId}
    `);
    const s = (summaryRows.rows as any[])[0] || { total: 0, unique_users: 0, failures: 0, mfa_count: 0, risky: 0 };

    const appRows = await db.execute(sql`
      SELECT app_display_name as app, COUNT(*)::int as count
      FROM entra_sign_ins WHERE tenant_id = ${tenantId} AND app_display_name IS NOT NULL
      GROUP BY app_display_name ORDER BY count DESC LIMIT 10
    `);

    const locRows = await db.execute(sql`
      SELECT COALESCE(city, 'Unknown') || ', ' || COALESCE(country_or_region, 'Unknown') as location, COUNT(*)::int as count
      FROM entra_sign_ins WHERE tenant_id = ${tenantId}
      GROUP BY city, country_or_region ORDER BY count DESC LIMIT 10
    `);

    const trendRows = await db.execute(sql`
      SELECT
        date_trunc('hour', sign_in_at) as hour,
        COUNT(*) FILTER (WHERE status = 'success')::int as success,
        COUNT(*) FILTER (WHERE status = 'failure')::int as failure
      FROM entra_sign_ins
      WHERE tenant_id = ${tenantId} AND sign_in_at >= NOW() - INTERVAL '24 hours'
      GROUP BY hour ORDER BY hour
    `);

    return {
      totalSignIns: Number(s.total) || 0,
      uniqueUsers: Number(s.unique_users) || 0,
      failureCount: Number(s.failures) || 0,
      mfaRate: s.total > 0 ? (Number(s.mfa_count) / Number(s.total)) * 100 : 0,
      riskySignIns: Number(s.risky) || 0,
      topApps: (appRows.rows as any[]).map(r => ({ app: r.app, count: Number(r.count) })),
      topLocations: (locRows.rows as any[]).map(r => ({ location: r.location, count: Number(r.count) })),
      trend: (trendRows.rows as any[]).map(r => ({ hour: r.hour, success: Number(r.success), failure: Number(r.failure) })),
    };
  }

  async getEntraSignInUserBreakdown(tenantId: string): Promise<{
    userId: string; userPrincipalName: string; userDisplayName: string | null;
    loginCount: number; lastLogin: Date | null; failureCount: number; riskEvents: number;
  }[]> {
    const rows = await db.execute(sql`
      SELECT
        user_id,
        MAX(user_principal_name) as user_principal_name,
        MAX(user_display_name) as user_display_name,
        COUNT(*)::int as login_count,
        MAX(sign_in_at) as last_login,
        COUNT(*) FILTER (WHERE status = 'failure')::int as failure_count,
        COUNT(*) FILTER (WHERE risk_level IN ('low','medium','high'))::int as risk_events
      FROM entra_sign_ins
      WHERE tenant_id = ${tenantId} AND user_id IS NOT NULL
      GROUP BY user_id ORDER BY login_count DESC LIMIT 50
    `);
    return (rows.rows as any[]).map(r => ({
      userId: r.user_id,
      userPrincipalName: r.user_principal_name || '',
      userDisplayName: r.user_display_name,
      loginCount: Number(r.login_count),
      lastLogin: r.last_login ? new Date(r.last_login) : null,
      failureCount: Number(r.failure_count),
      riskEvents: Number(r.risk_events),
    }));
  }

  async upsertSpeContainer(data: InsertSpeContainer): Promise<SpeContainer> {
    const [existing] = await db.select().from(speContainers)
      .where(and(eq(speContainers.tenantId, data.tenantId), eq(speContainers.containerId, data.containerId)));
    if (existing) {
      const [updated] = await db.update(speContainers)
        .set({ ...data, collectedAt: new Date() })
        .where(eq(speContainers.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(speContainers).values(data).returning();
    return created;
  }

  async getSpeContainers(tenantId: string): Promise<SpeContainer[]> {
    return db.select().from(speContainers)
      .where(eq(speContainers.tenantId, tenantId))
      .orderBy(desc(speContainers.collectedAt));
  }

  async getSpeContainer(containerId: string): Promise<SpeContainer | undefined> {
    const [row] = await db.select().from(speContainers).where(eq(speContainers.containerId, containerId));
    return row;
  }

  async createSpeAccessEvent(data: InsertSpeAccessEvent): Promise<SpeAccessEvent> {
    const [created] = await db.insert(speAccessEvents).values(data).returning();
    return created;
  }

  async getSpeAccessEvents(
    tenantId: string,
    opts?: { containerId?: string; since?: Date; limit?: number; operation?: string }
  ): Promise<SpeAccessEvent[]> {
    const conditions: any[] = [eq(speAccessEvents.tenantId, tenantId)];
    if (opts?.containerId) conditions.push(eq(speAccessEvents.containerId, opts.containerId));
    if (opts?.since) conditions.push(gte(speAccessEvents.timestamp, opts.since));
    if (opts?.operation) conditions.push(eq(speAccessEvents.operation, opts.operation));
    return db.select().from(speAccessEvents)
      .where(and(...conditions))
      .orderBy(desc(speAccessEvents.timestamp))
      .limit(opts?.limit ?? 500);
  }

  async createSpeSecurityEvent(data: InsertSpeSecurityEvent): Promise<SpeSecurityEvent> {
    const [created] = await db.insert(speSecurityEvents).values(data).returning();
    return created;
  }

  async getSpeSecurityEvents(
    tenantId: string,
    opts?: { since?: Date; limit?: number; severity?: string; containerId?: string }
  ): Promise<SpeSecurityEvent[]> {
    const conditions: any[] = [eq(speSecurityEvents.tenantId, tenantId)];
    if (opts?.since) conditions.push(gte(speSecurityEvents.timestamp, opts.since));
    if (opts?.severity) conditions.push(eq(speSecurityEvents.severity, opts.severity));
    if (opts?.containerId) conditions.push(eq(speSecurityEvents.containerId, opts.containerId));
    return db.select().from(speSecurityEvents)
      .where(and(...conditions))
      .orderBy(desc(speSecurityEvents.timestamp))
      .limit(opts?.limit ?? 200);
  }

  async upsertSpeContentTypeStat(data: InsertSpeContentTypeStat): Promise<SpeContentTypeStat> {
    const [existing] = await db.select().from(speContentTypeStats)
      .where(and(
        eq(speContentTypeStats.tenantId, data.tenantId),
        eq(speContentTypeStats.containerId, data.containerId),
        eq(speContentTypeStats.contentType, data.contentType),
        sql`${speContentTypeStats.reportDate} = ${data.reportDate}`
      ));
    if (existing) {
      const [updated] = await db.update(speContentTypeStats)
        .set({ ...data, collectedAt: new Date() })
        .where(eq(speContentTypeStats.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(speContentTypeStats).values(data).returning();
    return created;
  }

  async getSpeContentTypeStats(tenantId: string, containerId?: string): Promise<SpeContentTypeStat[]> {
    const conditions: any[] = [eq(speContentTypeStats.tenantId, tenantId)];
    if (containerId) conditions.push(eq(speContentTypeStats.containerId, containerId));
    return db.select().from(speContentTypeStats)
      .where(and(...conditions))
      .orderBy(desc(speContentTypeStats.collectedAt));
  }

  async getSpeStats(tenantId: string): Promise<{
    totalContainers: number;
    totalStorageBytes: number;
    totalItems: number;
    accessEventsLast24h: number;
    securityEventsLast24h: number;
    topOperations: { operation: string; count: number }[];
    topContainers: { containerId: string; displayName: string; accessCount: number }[];
    securityEventsBySeverity: { severity: string; count: number }[];
  }> {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const containers = await db.select({
      count: sql<number>`count(*)`,
      totalStorage: sql<number>`coalesce(sum(${speContainers.storageBytes}), 0)`,
      totalItems: sql<number>`coalesce(sum(${speContainers.itemCount}), 0)`,
    }).from(speContainers).where(eq(speContainers.tenantId, tenantId));

    const accessCount24h = await db.select({ count: sql<number>`count(*)` })
      .from(speAccessEvents)
      .where(and(eq(speAccessEvents.tenantId, tenantId), gte(speAccessEvents.timestamp, since24h)));

    const securityCount24h = await db.select({ count: sql<number>`count(*)` })
      .from(speSecurityEvents)
      .where(and(eq(speSecurityEvents.tenantId, tenantId), gte(speSecurityEvents.timestamp, since24h)));

    const topOps = await db.select({
      operation: speAccessEvents.operation,
      count: sql<number>`count(*)`,
    }).from(speAccessEvents)
      .where(and(eq(speAccessEvents.tenantId, tenantId), gte(speAccessEvents.timestamp, since24h)))
      .groupBy(speAccessEvents.operation)
      .orderBy(desc(sql`count(*)`))
      .limit(8);

    const topConts = await db.select({
      containerId: speAccessEvents.containerId,
      displayName: speAccessEvents.containerName,
      accessCount: sql<number>`count(*)`,
    }).from(speAccessEvents)
      .where(and(eq(speAccessEvents.tenantId, tenantId), gte(speAccessEvents.timestamp, since24h)))
      .groupBy(speAccessEvents.containerId, speAccessEvents.containerName)
      .orderBy(desc(sql`count(*)`))
      .limit(5);

    const sevBreakdown = await db.select({
      severity: speSecurityEvents.severity,
      count: sql<number>`count(*)`,
    }).from(speSecurityEvents)
      .where(eq(speSecurityEvents.tenantId, tenantId))
      .groupBy(speSecurityEvents.severity)
      .orderBy(desc(sql`count(*)`));

    return {
      totalContainers: Number(containers[0]?.count || 0),
      totalStorageBytes: Number(containers[0]?.totalStorage || 0),
      totalItems: Number(containers[0]?.totalItems || 0),
      accessEventsLast24h: Number(accessCount24h[0]?.count || 0),
      securityEventsLast24h: Number(securityCount24h[0]?.count || 0),
      topOperations: topOps.map(r => ({ operation: r.operation, count: Number(r.count) })),
      topContainers: topConts.map(r => ({ containerId: r.containerId, displayName: r.displayName || r.containerId, accessCount: Number(r.accessCount) })),
      securityEventsBySeverity: sevBreakdown.map(r => ({ severity: r.severity, count: Number(r.count) })),
    };
  }

  async createKnownAgent(data: InsertKnownAgent): Promise<KnownAgent> {
    const [created] = await db.insert(knownAgents).values(data).returning();
    return created;
  }

  async upsertKnownAgentByExternalId(data: InsertKnownAgent): Promise<KnownAgent> {
    if (!data.externalId) return this.createKnownAgent(data);

    const now = new Date();
    const [upserted] = await db.insert(knownAgents)
      .values({ ...data, lastSeenAt: now })
      .onConflictDoUpdate({
        target: [knownAgents.tenantId, knownAgents.externalId],
        set: { ...data, lastSeenAt: now, updatedAt: now },
      })
      .returning();

    return upserted;
  }

  async updateKnownAgent(id: string, data: Partial<InsertKnownAgent>): Promise<KnownAgent | undefined> {
    const [updated] = await db.update(knownAgents)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(knownAgents.id, id))
      .returning();
    return updated;
  }

  async getKnownAgents(tenantId: string, opts?: { source?: string; status?: string }): Promise<KnownAgent[]> {
    const conditions = [eq(knownAgents.tenantId, tenantId)];
    if (opts?.source) conditions.push(eq(knownAgents.source, opts.source));
    if (opts?.status) conditions.push(eq(knownAgents.status, opts.status));
    return db.select().from(knownAgents).where(and(...conditions)).orderBy(desc(knownAgents.discoveredAt));
  }

  async getKnownAgent(id: string): Promise<KnownAgent | undefined> {
    const [agent] = await db.select().from(knownAgents).where(eq(knownAgents.id, id));
    return agent;
  }

  async deleteKnownAgent(id: string): Promise<void> {
    await db.update(llmCalls).set({ agentId: null }).where(eq(llmCalls.agentId, id));
    await db.delete(knownAgents).where(eq(knownAgents.id, id));
  }

  async createAgentDiscoverySource(data: InsertAgentDiscoverySource): Promise<AgentDiscoverySource> {
    const [created] = await db.insert(agentDiscoverySources).values(data).returning();
    return created;
  }

  async updateAgentDiscoverySource(id: string, data: Partial<InsertAgentDiscoverySource>): Promise<AgentDiscoverySource | undefined> {
    const [updated] = await db.update(agentDiscoverySources).set(data).where(eq(agentDiscoverySources.id, id)).returning();
    return updated;
  }

  async getAgentDiscoverySources(tenantId: string): Promise<AgentDiscoverySource[]> {
    return db.select().from(agentDiscoverySources).where(eq(agentDiscoverySources.tenantId, tenantId)).orderBy(desc(agentDiscoverySources.createdAt));
  }

  async getAgentDiscoverySource(id: string): Promise<AgentDiscoverySource | undefined> {
    const [row] = await db.select().from(agentDiscoverySources).where(eq(agentDiscoverySources.id, id));
    return row;
  }

  async deleteAgentDiscoverySource(id: string): Promise<void> {
    await db.delete(agentDiscoverySources).where(eq(agentDiscoverySources.id, id));
  }

  async createLlmModel(data: InsertLlmModel): Promise<LlmModel> {
    const [created] = await db.insert(llmModels).values(data).returning();
    return created;
  }

  async updateLlmModel(id: string, data: Partial<InsertLlmModel>): Promise<LlmModel | undefined> {
    const [updated] = await db.update(llmModels).set({ ...data, updatedAt: new Date() }).where(eq(llmModels.id, id)).returning();
    return updated;
  }

  async getLlmModels(tenantId: string): Promise<LlmModel[]> {
    return db.select().from(llmModels).where(eq(llmModels.tenantId, tenantId)).orderBy(desc(llmModels.registeredAt));
  }

  async getLlmModel(id: string): Promise<LlmModel | undefined> {
    const [model] = await db.select().from(llmModels).where(eq(llmModels.id, id));
    return model;
  }

  async deleteLlmModel(id: string): Promise<void> {
    await db.delete(llmCalls).where(eq(llmCalls.modelId, id));
    await db.delete(llmModels).where(eq(llmModels.id, id));
  }

  async createLlmCall(data: InsertLlmCall): Promise<LlmCall> {
    const [created] = await db.insert(llmCalls).values(data).returning();
    liveEvents.emit("llm_call.recorded", created.tenantId ?? null, created);
    return created;
  }

  async getLlmCalls(tenantId: string, opts?: { modelId?: string; agentId?: string; status?: string; errorClass?: string; limit?: number; offset?: number }): Promise<{ items: LlmCall[]; total: number }> {
    const conditions = [eq(llmCalls.tenantId, tenantId)];
    if (opts?.modelId) conditions.push(eq(llmCalls.modelId, opts.modelId));
    if (opts?.agentId) conditions.push(eq(llmCalls.agentId, opts.agentId));
    if (opts?.status) conditions.push(eq(llmCalls.status, opts.status));
    if (opts?.errorClass) conditions.push(eq(llmCalls.errorClass, opts.errorClass));
    const offset = opts?.offset ?? 0;
    const rows = await db.select({
      row: llmCalls,
      total: sql<number>`count(*) over()`.as("total"),
    }).from(llmCalls)
      .where(and(...conditions))
      .orderBy(desc(llmCalls.calledAt))
      .limit(opts?.limit ?? 50)
      .offset(offset);
    if (rows.length > 0) {
      return { items: rows.map(r => r.row), total: Number(rows[0].total) };
    }
    if (offset > 0) {
      const [c] = await db.select({ total: sql<number>`count(*)` }).from(llmCalls).where(and(...conditions));
      return { items: [], total: Number(c?.total ?? 0) };
    }
    return { items: [], total: 0 };
  }

  async getLlmStats(tenantId: string, opts?: { since?: Date; agentId?: string }): Promise<{
    totalCalls: number;
    successCount: number;
    errorRate: number;
    avgDurationMs: number;
    avgTtftMs: number;
    avgTokensPerSec: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCostCents: number;
    byModel: { modelId: string; modelName: string; provider: string; calls: number; avgDurationMs: number; avgTtftMs: number; totalTokens: number; costCents: number; errorRate: number }[];
    byProvider: { provider: string; calls: number; costCents: number }[];
    byErrorClass: { errorClass: string; count: number }[];
    timeseries: { bucket: string; calls: number; avgDurationMs: number; costCents: number }[];
  }> {
    const since = opts?.since ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
    const agentFilter = opts?.agentId ? sql`AND agent_id = ${opts.agentId}` : sql``;

    const overallRows = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'success')::int AS successes,
        COALESCE(AVG(duration_ms), 0)::real AS avg_duration,
        COALESCE(AVG(ttft_ms), 0)::real AS avg_ttft,
        COALESCE(AVG(tokens_per_sec), 0)::real AS avg_tps,
        COALESCE(SUM(input_tokens), 0)::int AS input_tokens,
        COALESCE(SUM(output_tokens), 0)::int AS output_tokens,
        COALESCE(SUM(cost_cents), 0)::real AS cost_cents
      FROM llm_calls
      WHERE tenant_id = ${tenantId} AND called_at >= ${since} ${agentFilter}
    `);
    const overall = (overallRows.rows as any[])[0] || {};

    const modelRows = await db.execute(sql`
      SELECT
        lc.model_id,
        lm.model_name,
        lm.provider,
        COUNT(*)::int AS calls,
        COALESCE(AVG(lc.duration_ms), 0)::real AS avg_duration,
        COALESCE(AVG(lc.ttft_ms), 0)::real AS avg_ttft,
        COALESCE(SUM(COALESCE(lc.input_tokens, 0) + COALESCE(lc.output_tokens, 0)), 0)::int AS total_tokens,
        COALESCE(SUM(lc.cost_cents), 0)::real AS cost_cents,
        COUNT(*) FILTER (WHERE lc.status = 'error')::int AS errors
      FROM llm_calls lc
      LEFT JOIN llm_models lm ON lm.id = lc.model_id
      WHERE lc.tenant_id = ${tenantId} AND lc.called_at >= ${since} ${agentFilter}
      GROUP BY lc.model_id, lm.model_name, lm.provider
      ORDER BY calls DESC
    `);

    const providerRows = await db.execute(sql`
      SELECT lm.provider, COUNT(*)::int AS calls, COALESCE(SUM(lc.cost_cents), 0)::real AS cost_cents
      FROM llm_calls lc
      LEFT JOIN llm_models lm ON lm.id = lc.model_id
      WHERE lc.tenant_id = ${tenantId} AND lc.called_at >= ${since} ${agentFilter}
      GROUP BY lm.provider
      ORDER BY calls DESC
    `);

    const errorRows = await db.execute(sql`
      SELECT COALESCE(error_class, 'other') AS error_class, COUNT(*)::int AS count
      FROM llm_calls
      WHERE tenant_id = ${tenantId} AND status = 'error' AND called_at >= ${since} ${agentFilter}
      GROUP BY error_class
      ORDER BY count DESC
    `);

    const timeseriesRows = await db.execute(sql`
      SELECT
        to_char(date_trunc('hour', called_at), 'YYYY-MM-DD"T"HH24:00') AS bucket,
        COUNT(*)::int AS calls,
        COALESCE(AVG(duration_ms), 0)::real AS avg_duration,
        COALESCE(SUM(cost_cents), 0)::real AS cost_cents
      FROM llm_calls
      WHERE tenant_id = ${tenantId} AND called_at >= ${since} ${agentFilter}
      GROUP BY bucket
      ORDER BY bucket ASC
    `);

    const total = Number(overall.total) || 0;
    const successes = Number(overall.successes) || 0;

    return {
      totalCalls: total,
      successCount: successes,
      errorRate: total > 0 ? ((total - successes) / total) * 100 : 0,
      avgDurationMs: Number(overall.avg_duration) || 0,
      avgTtftMs: Number(overall.avg_ttft) || 0,
      avgTokensPerSec: Number(overall.avg_tps) || 0,
      totalInputTokens: Number(overall.input_tokens) || 0,
      totalOutputTokens: Number(overall.output_tokens) || 0,
      totalCostCents: Number(overall.cost_cents) || 0,
      byModel: (modelRows.rows as any[]).map(r => ({
        modelId: r.model_id,
        modelName: r.model_name || "(unknown)",
        provider: r.provider || "unknown",
        calls: Number(r.calls),
        avgDurationMs: Number(r.avg_duration),
        avgTtftMs: Number(r.avg_ttft),
        totalTokens: Number(r.total_tokens),
        costCents: Number(r.cost_cents),
        errorRate: Number(r.calls) > 0 ? (Number(r.errors) / Number(r.calls)) * 100 : 0,
      })),
      byProvider: (providerRows.rows as any[]).map(r => ({
        provider: r.provider || "unknown",
        calls: Number(r.calls),
        costCents: Number(r.cost_cents),
      })),
      byErrorClass: (errorRows.rows as any[]).map(r => ({
        errorClass: r.error_class,
        count: Number(r.count),
      })),
      timeseries: (timeseriesRows.rows as any[]).map(r => ({
        bucket: r.bucket,
        calls: Number(r.calls),
        avgDurationMs: Number(r.avg_duration),
        costCents: Number(r.cost_cents),
      })),
    };
  }

  async getLlmModelHealth(modelId: string): Promise<{ recentCalls: LlmCall[]; errorRate: number; avgDurationMs: number; avgTtftMs: number; totalCalls: number; totalCostCents: number }> {
    const recentCalls = await db.select().from(llmCalls)
      .where(eq(llmCalls.modelId, modelId))
      .orderBy(desc(llmCalls.calledAt))
      .limit(20);
    const statsRows = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'error')::int AS errors,
        COALESCE(AVG(duration_ms), 0)::real AS avg_duration,
        COALESCE(AVG(ttft_ms), 0)::real AS avg_ttft,
        COALESCE(SUM(cost_cents), 0)::real AS cost_cents
      FROM llm_calls
      WHERE model_id = ${modelId}
    `);
    const stats = (statsRows.rows as any[])[0] || {};
    const total = Number(stats.total) || 0;
    return {
      recentCalls,
      errorRate: total > 0 ? (Number(stats.errors) / total) * 100 : 0,
      avgDurationMs: Number(stats.avg_duration) || 0,
      avgTtftMs: Number(stats.avg_ttft) || 0,
      totalCalls: total,
      totalCostCents: Number(stats.cost_cents) || 0,
    };
  }

  async createSavedView(data: InsertSavedView): Promise<SavedView> {
    const [created] = await db.insert(savedViews).values(data).returning();
    return created;
  }

  async updateSavedView(id: string, data: Partial<InsertSavedView>): Promise<SavedView | undefined> {
    const [updated] = await db.update(savedViews).set(data).where(eq(savedViews.id, id)).returning();
    return updated;
  }

  async deleteSavedView(id: string): Promise<void> {
    await db.delete(savedViews).where(eq(savedViews.id, id));
  }

  async getSavedView(id: string): Promise<SavedView | undefined> {
    const [view] = await db.select().from(savedViews).where(eq(savedViews.id, id));
    return view;
  }

  async listSavedViewsForUser(orgId: string, userId: string, pageKey?: string): Promise<SavedView[]> {
    const ownership = or(
      and(eq(savedViews.orgId, orgId), eq(savedViews.userId, userId)),
      and(eq(savedViews.orgId, orgId), eq(savedViews.scope, "org")),
    );
    const where = pageKey
      ? and(ownership, eq(savedViews.pageKey, pageKey))
      : ownership;
    return db.select().from(savedViews).where(where).orderBy(desc(savedViews.isSystem), desc(savedViews.createdAt));
  }
}

export const storage = new DatabaseStorage();
