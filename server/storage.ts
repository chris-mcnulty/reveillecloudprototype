import { db } from "./db";
import { eq, desc, and, gte, gt, lte, asc, sql, ilike, or, type SQL } from "drizzle-orm";
import { liveEvents } from "./events";
import { extractCopilotEnrichment } from "./collectors/copilotEnrichment";
import { sendBudgetAlertNotifications } from "./notifications/budgetAlerts";
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
  llmSpendDaily, type LlmSpendDaily, type InsertLlmSpendDaily,
  savedViews, type SavedView, type InsertSavedView,
  metricBaselines, type MetricBaseline, type InsertMetricBaseline,
  anomalyStreamConfigs, type AnomalyStreamConfig, type InsertAnomalyStreamConfig,
  anomalyNotificationSettings, type AnomalyNotificationSettings, type InsertAnomalyNotificationSettings,
  scheduledDigests, type ScheduledDigest, type InsertScheduledDigest,
  scheduledDigestRuns, type ScheduledDigestRun, type InsertScheduledDigestRun,
  foundryDeployments, type FoundryDeployment, type InsertFoundryDeployment,
  foundryUsageSnapshots, type FoundryUsageSnapshot, type InsertFoundryUsageSnapshot,
  foundryPricingOverrides, type FoundryPricingOverride, type InsertFoundryPricingOverride,
  type CopilotSurfaceAlertPayload,
} from "@shared/schema";

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

  getAlerts(tenantId?: string, opts?: { alertType?: string; streamKey?: string; since?: Date }): Promise<Alert[]>;
  createAlert(alert: InsertAlert): Promise<Alert>;
  acknowledgeAlert(id: string): Promise<Alert | undefined>;
  updateAlertPayload(id: string, payload: Record<string, any>): Promise<Alert | undefined>;
  getLatestAnomalyAlertForStream(tenantId: string, streamKey: string): Promise<Alert | undefined>;
  getAlertById(id: string): Promise<Alert | undefined>;
  getAnomalyAlertCount(tenantId: string, since: Date): Promise<number>;

  upsertMetricBaseline(data: InsertMetricBaseline): Promise<MetricBaseline>;
  getLatestMetricBaseline(tenantId: string, streamKey: string): Promise<MetricBaseline | undefined>;
  getLatestMetricBaselinesByTenant(tenantId: string): Promise<MetricBaseline[]>;
  getMetricBaselineHistory(tenantId: string, streamKey: string, since?: Date, limit?: number): Promise<MetricBaseline[]>;

  getAnomalyStreamConfigs(tenantId: string): Promise<AnomalyStreamConfig[]>;
  getAnomalyStreamConfig(tenantId: string, streamKey: string): Promise<AnomalyStreamConfig | undefined>;
  upsertAnomalyStreamConfig(data: InsertAnomalyStreamConfig): Promise<AnomalyStreamConfig>;

  getAnomalyNotificationSettings(tenantId: string): Promise<AnomalyNotificationSettings | undefined>;
  upsertAnomalyNotificationSettings(data: InsertAnomalyNotificationSettings): Promise<AnomalyNotificationSettings>;

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
  getAdminAuditLogInRange(tenantId: string, from: Date, to: Date): Promise<AdminAuditLog[]>;
  getAuditLogEntriesInRange(tenantId: string, from: Date, to: Date): Promise<AuditLogEntry[]>;
  getServiceHealthIncidentsInRange(tenantId: string | undefined, from: Date, to: Date): Promise<ServiceHealthIncident[]>;

  upsertPowerPlatformEnvironment(data: InsertPowerPlatformEnvironment): Promise<PowerPlatformEnvironment>;
  getPowerPlatformEnvironments(tenantId: string): Promise<PowerPlatformEnvironment[]>;
  upsertPowerPlatformResource(data: InsertPowerPlatformResource): Promise<PowerPlatformResource>;
  getPowerPlatformResources(tenantId: string, envId?: string, resourceType?: string): Promise<PowerPlatformResource[]>;
  getPowerPlatformResourceStats(tenantId: string): Promise<{ resourceType: string; count: number }[]>;

  createAgentTrace(data: InsertAgentTrace): Promise<AgentTrace>;
  getAgentTraces(tenantId?: string, platform?: string, status?: string, limit?: number, offset?: number): Promise<{ items: AgentTrace[]; total: number }>;
  getAgentTrace(id: string): Promise<AgentTrace | undefined>;
  getAgentTraceWithSpans(id: string): Promise<{ trace: AgentTrace; spans: AgentTraceSpan[] } | undefined>;
  getTraceWithLlmCalls(id: string): Promise<{ trace: AgentTrace; spans: AgentTraceSpan[]; llmCalls: LlmCallWithModel[] } | undefined>;
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
    bySurface: { surface: string; calls: number; responseCalls: number; avgLatencyMs: number; p95LatencyMs: number; emptyResponseRate: number }[];
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
  getLlmCallById(callId: string): Promise<LlmCallWithModel | undefined>;
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

  rollupLlmSpendDaily(opts?: { tenantId?: string; sinceDays?: number }): Promise<{ rolledUp: number; tenants: number }>;
  getLlmSpendMtd(tenantId: string): Promise<{
    totalCents: number;
    projectedMonthCents: number;
    daysElapsed: number;
    daysInMonth: number;
    topModels: { modelId: string; modelName: string; provider: string; costCents: number }[];
    daily: { date: string; costCents: number }[];
  }>;
  getLlmSpendByTenantMtd(orgId: string): Promise<{ tenantId: string; tenantName: string; totalCents: number; byModel: { modelName: string; costCents: number }[] }[]>;
  getLlmSpendBreakdown(tenantId: string, opts: { since?: Date; until?: Date; sliceBy: "model" | "agent" | "time" | "surface" }): Promise<{ key: string; label: string; costCents: number; calls: number; inputTokens: number; outputTokens: number }[]>;
  getActiveLlmBudgetRules(): Promise<AlertRule[]>;
  evaluateLlmBudgets(): Promise<{ rulesEvaluated: number; alertsCreated: number }>;
  getActiveFoundryThrottleRules(tenantId?: string): Promise<AlertRule[]>;
  evaluateFoundryThrottleRules(tenantId?: string): Promise<{ rulesEvaluated: number; alertsCreated: number }>;
  getActiveCopilotSurfaceRules(): Promise<AlertRule[]>;
  evaluateCopilotSurfaceAlerts(): Promise<{ rulesEvaluated: number; alertsCreated: number; alertsResolved: number }>;

  createSavedView(data: InsertSavedView): Promise<SavedView>;
  updateSavedView(id: string, data: Partial<InsertSavedView>): Promise<SavedView | undefined>;
  deleteSavedView(id: string): Promise<void>;
  getSavedView(id: string): Promise<SavedView | undefined>;
  listSavedViewsForUser(orgId: string, userId: string, pageKey?: string): Promise<SavedView[]>;

  getBenchmarkingMatrix(orgId: string, selectedWindowMs: number): Promise<{
    metricWindows: Record<string, { ms: number; label: string }>;
    tenants: Array<{
      tenantId: string;
      tenantName: string;
      metrics: Record<string, { value: number; prev: number | null; delta: number | null; sparkline: number[] }>;
    }>;
  }>;

  getSlowestLlmHops(tenantId: string, opts?: { since?: Date; limit?: number; agentId?: string }): Promise<SlowestLlmHop[]>;
  getAgentLlmSummary(tenantId: string, agentId: string, opts?: { hopsLimit?: number }): Promise<AgentLlmSummary>;
  backfillLlmCallTraceLinks(opts?: { tenantId?: string; toleranceMs?: number; dryRun?: boolean }): Promise<{ scanned: number; matched: number; updated: number; ambiguous: number }>;

  createScheduledDigest(data: InsertScheduledDigest): Promise<ScheduledDigest>;
  updateScheduledDigest(id: string, data: Partial<ScheduledDigest>): Promise<ScheduledDigest | undefined>;
  deleteScheduledDigest(id: string): Promise<void>;
  getScheduledDigests(orgId?: string): Promise<ScheduledDigest[]>;
  getScheduledDigest(id: string): Promise<ScheduledDigest | undefined>;
  getScheduledDigestsDue(now: Date): Promise<ScheduledDigest[]>;
  createScheduledDigestRun(data: InsertScheduledDigestRun): Promise<ScheduledDigestRun>;
  updateScheduledDigestRun(id: string, data: Partial<ScheduledDigestRun>): Promise<ScheduledDigestRun | undefined>;
  getScheduledDigestRuns(digestId: string, limit?: number): Promise<ScheduledDigestRun[]>;

  upsertFoundryDeployment(data: InsertFoundryDeployment): Promise<FoundryDeployment>;
  getFoundryDeployments(tenantId: string): Promise<FoundryDeployment[]>;
  getFoundryDeployment(id: string): Promise<FoundryDeployment | undefined>;
  getFoundryDeploymentByLlmModelId(llmModelId: string): Promise<FoundryDeployment | undefined>;
  setFoundryDeploymentLlmModel(id: string, llmModelId: string | null): Promise<FoundryDeployment | undefined>;
  upsertFoundryUsageSnapshot(data: InsertFoundryUsageSnapshot): Promise<FoundryUsageSnapshot>;
  getFoundryUsageSnapshots(tenantId: string, opts?: { deploymentId?: string; since?: Date; limit?: number; windowHours?: number }): Promise<FoundryUsageSnapshot[]>;
  getLatestFoundryUsageByDeployment(tenantId: string, windowHours?: number): Promise<Record<string, FoundryUsageSnapshot>>;
  getLatestFoundryUsageByWindow(deploymentId: string): Promise<Record<number, FoundryUsageSnapshot>>;

  countSavedViewMatches(pageKey: string, tenantId: string, filtersJson: Record<string, any>): Promise<number>;

  getFoundryPricingOverrides(tenantId: string): Promise<FoundryPricingOverride[]>;
  upsertFoundryPricingOverride(data: InsertFoundryPricingOverride): Promise<FoundryPricingOverride>;
  deleteFoundryPricingOverride(deploymentId: string): Promise<void>;
  getFoundryCostAllocation(tenantId: string, windowHours: number): Promise<FoundryCostAllocation>;
}

export interface FoundryAgentAllocation {
  agentId: string | null;
  agentName: string | null;
  platform: string | null;
  inputTokens: number;
  outputTokens: number;
  callCount: number;
  shareOfTokens: number;
  allocatedCostCents: number;
}

export interface FoundryDeploymentAllocation {
  deploymentId: string;
  deploymentName: string;
  accountName: string;
  modelName: string | null;
  modelVersion: string | null;
  region: string | null;
  llmModelId: string | null;
  resolvedInputCostPerMtok: number | null;
  resolvedOutputCostPerMtok: number | null;
  overrideInputCostPerMtok: number | null;
  overrideOutputCostPerMtok: number | null;
  modelInputCostPerMtok: number | null;
  modelOutputCostPerMtok: number | null;
  authoritativeInputTokens: number;
  authoritativeOutputTokens: number;
  authoritativeTotalCalls: number;
  authoritativeTotalCostCents: number;
  instrumentedInputTokens: number;
  instrumentedOutputTokens: number;
  instrumentedCallCount: number;
  unallocatedCostCents: number;
  windowEnd: Date | null;
  agents: FoundryAgentAllocation[];
}

export interface FoundryCostAllocation {
  windowHours: number;
  windowStart: Date;
  windowEnd: Date;
  deployments: FoundryDeploymentAllocation[];
  totals: {
    authoritativeTotalCostCents: number;
    allocatedCostCents: number;
    unallocatedCostCents: number;
    authoritativeInputTokens: number;
    authoritativeOutputTokens: number;
  };
}

export type LlmCallWithModel = LlmCall & {
  modelName: string | null;
  modelDisplayName: string | null;
  provider: string | null;
  deploymentName: string | null;
  endpoint: string | null;
};

export interface AgentLlmRollup {
  windowHours: number;
  totalCalls: number;
  successCount: number;
  errorCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostCents: number;
  avgDurationMs: number;
  avgTtftMs: number;
}

export interface AgentLlmSummary {
  agentId: string;
  window24h: AgentLlmRollup;
  window7d: AgentLlmRollup;
  slowestHops24h: SlowestLlmHop[];
  topModels7d: { modelId: string; modelName: string | null; provider: string | null; calls: number; totalTokens: number; costCents: number; avgDurationMs: number }[];
}

export interface SlowestLlmHop {
  callId: string;
  tenantId: string;
  traceId: string | null;
  spanId: string | null;
  agentId: string | null;
  agentName: string | null;
  modelId: string;
  modelName: string | null;
  modelDisplayName: string | null;
  provider: string | null;
  deploymentName: string | null;
  endpoint: string | null;
  durationMs: number | null;
  ttftMs: number | null;
  tokensPerSec: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costCents: number | null;
  status: string;
  errorClass: string | null;
  calledAt: Date;
  traceAgentName: string | null;
  tracePlatform: string | null;
}

interface FoundrySnapshotRow {
  id: string;
  tenant_id: string;
  deployment_id: string;
  window_hours: number | string;
  window_start: string | Date;
  window_end: string | Date;
  processed_prompt_tokens: number | string | null;
  generated_tokens: number | string | null;
  total_calls: number | string | null;
  throttled_calls: number | string | null;
  inferred_cost_cents: number | string | null;
  raw_metrics: Record<string, unknown> | null;
  collected_at: string | Date;
}

function mapFoundrySnapshotRow(r: FoundrySnapshotRow): FoundryUsageSnapshot {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    deploymentId: r.deployment_id,
    windowHours: Number(r.window_hours),
    windowStart: r.window_start instanceof Date ? r.window_start : new Date(r.window_start),
    windowEnd: r.window_end instanceof Date ? r.window_end : new Date(r.window_end),
    processedPromptTokens: r.processed_prompt_tokens != null ? Number(r.processed_prompt_tokens) : 0,
    generatedTokens: r.generated_tokens != null ? Number(r.generated_tokens) : 0,
    totalCalls: r.total_calls != null ? Number(r.total_calls) : 0,
    throttledCalls: r.throttled_calls != null ? Number(r.throttled_calls) : 0,
    inferredCostCents: r.inferred_cost_cents != null ? Number(r.inferred_cost_cents) : null,
    rawMetrics: r.raw_metrics ?? null,
    collectedAt: r.collected_at instanceof Date ? r.collected_at : new Date(r.collected_at),
  };
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
    await db.delete(foundryPricingOverrides).where(eq(foundryPricingOverrides.tenantId, id));
    await db.delete(foundryUsageSnapshots).where(eq(foundryUsageSnapshots.tenantId, id));
    await db.delete(foundryDeployments).where(eq(foundryDeployments.tenantId, id));
    await db.delete(llmSpendDaily).where(eq(llmSpendDaily.tenantId, id));
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
    await db.delete(metricBaselines).where(eq(metricBaselines.tenantId, id));
    await db.delete(anomalyStreamConfigs).where(eq(anomalyStreamConfigs.tenantId, id));
    await db.delete(anomalyNotificationSettings).where(eq(anomalyNotificationSettings.tenantId, id));
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

  async getAlerts(tenantId?: string, opts?: { alertType?: string; streamKey?: string; since?: Date }): Promise<Alert[]> {
    const conditions: SQL[] = [];
    if (tenantId) conditions.push(eq(alerts.tenantId, tenantId));
    if (opts?.alertType) conditions.push(eq(alerts.alertType, opts.alertType));
    if (opts?.streamKey) conditions.push(eq(alerts.streamKey, opts.streamKey));
    if (opts?.since) conditions.push(gte(alerts.timestamp, opts.since));
    const query = db.select().from(alerts);
    if (conditions.length > 0) {
      return query.where(and(...conditions)).orderBy(desc(alerts.timestamp));
    }
    return query.orderBy(desc(alerts.timestamp));
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

  async updateAlertPayload(id: string, payload: Record<string, any>): Promise<Alert | undefined> {
    const [updated] = await db.update(alerts).set({ payload }).where(eq(alerts.id, id)).returning();
    return updated;
  }

  async getLatestAnomalyAlertForStream(tenantId: string, streamKey: string): Promise<Alert | undefined> {
    const [row] = await db.select().from(alerts)
      .where(and(eq(alerts.tenantId, tenantId), eq(alerts.alertType, "anomaly"), eq(alerts.streamKey, streamKey)))
      .orderBy(desc(alerts.timestamp))
      .limit(1);
    return row;
  }

  async getAlertById(id: string): Promise<Alert | undefined> {
    const [row] = await db.select().from(alerts).where(eq(alerts.id, id)).limit(1);
    return row;
  }

  async getAnomalyAlertCount(tenantId: string, since: Date): Promise<number> {
    const [row] = await db.select({ count: sql<number>`count(*)` }).from(alerts)
      .where(and(eq(alerts.tenantId, tenantId), eq(alerts.alertType, "anomaly"), gte(alerts.timestamp, since)));
    return Number(row?.count || 0);
  }

  async upsertMetricBaseline(data: InsertMetricBaseline): Promise<MetricBaseline> {
    const [upserted] = await db.insert(metricBaselines)
      .values({ ...data, computedAt: new Date() })
      .onConflictDoUpdate({
        target: [metricBaselines.tenantId, metricBaselines.streamKey, metricBaselines.windowStart],
        set: {
          mean: data.mean,
          stddev: data.stddev,
          p50: data.p50,
          p95: data.p95,
          sampleCount: data.sampleCount,
          current: data.current,
          zScore: data.zScore,
          computedAt: new Date(),
        },
      })
      .returning();
    return upserted;
  }

  async getLatestMetricBaseline(tenantId: string, streamKey: string): Promise<MetricBaseline | undefined> {
    const [row] = await db.select().from(metricBaselines)
      .where(and(eq(metricBaselines.tenantId, tenantId), eq(metricBaselines.streamKey, streamKey)))
      .orderBy(desc(metricBaselines.windowStart))
      .limit(1);
    return row;
  }

  async getLatestMetricBaselinesByTenant(tenantId: string): Promise<MetricBaseline[]> {
    const result = await db.execute(sql`
      SELECT DISTINCT ON (stream_key)
        id, tenant_id, stream_key, window_start, mean, stddev, p50, p95,
        sample_count, current, z_score, computed_at
      FROM metric_baselines
      WHERE tenant_id = ${tenantId}
      ORDER BY stream_key, window_start DESC
    `);
    type RawRow = {
      id: string; tenant_id: string; stream_key: string; window_start: string | Date;
      mean: number; stddev: number; p50: number; p95: number; sample_count: number;
      current: number | null; z_score: number | null; computed_at: string | Date;
    };
    return (result.rows as unknown as RawRow[]).map(r => ({
      id: r.id,
      tenantId: r.tenant_id,
      streamKey: r.stream_key,
      windowStart: r.window_start instanceof Date ? r.window_start : new Date(r.window_start),
      mean: Number(r.mean),
      stddev: Number(r.stddev),
      p50: Number(r.p50),
      p95: Number(r.p95),
      sampleCount: Number(r.sample_count),
      current: r.current == null ? null : Number(r.current),
      zScore: r.z_score == null ? null : Number(r.z_score),
      computedAt: r.computed_at instanceof Date ? r.computed_at : new Date(r.computed_at),
    }));
  }

  async getMetricBaselineHistory(tenantId: string, streamKey: string, since?: Date, limit = 168): Promise<MetricBaseline[]> {
    const conditions: SQL[] = [eq(metricBaselines.tenantId, tenantId), eq(metricBaselines.streamKey, streamKey)];
    if (since) conditions.push(gte(metricBaselines.windowStart, since));
    return db.select().from(metricBaselines)
      .where(and(...conditions))
      .orderBy(desc(metricBaselines.windowStart))
      .limit(limit);
  }

  async getAnomalyStreamConfigs(tenantId: string): Promise<AnomalyStreamConfig[]> {
    return db.select().from(anomalyStreamConfigs).where(eq(anomalyStreamConfigs.tenantId, tenantId));
  }

  async getAnomalyStreamConfig(tenantId: string, streamKey: string): Promise<AnomalyStreamConfig | undefined> {
    const [row] = await db.select().from(anomalyStreamConfigs)
      .where(and(eq(anomalyStreamConfigs.tenantId, tenantId), eq(anomalyStreamConfigs.streamKey, streamKey)));
    return row;
  }

  async upsertAnomalyStreamConfig(data: InsertAnomalyStreamConfig): Promise<AnomalyStreamConfig> {
    const [upserted] = await db.insert(anomalyStreamConfigs)
      .values({ ...data, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [anomalyStreamConfigs.tenantId, anomalyStreamConfigs.streamKey],
        set: { enabled: data.enabled, sensitivity: data.sensitivity, updatedAt: new Date() },
      })
      .returning();
    return upserted;
  }

  async getAnomalyNotificationSettings(tenantId: string): Promise<AnomalyNotificationSettings | undefined> {
    const [row] = await db.select().from(anomalyNotificationSettings)
      .where(eq(anomalyNotificationSettings.tenantId, tenantId));
    return row;
  }

  async upsertAnomalyNotificationSettings(data: InsertAnomalyNotificationSettings): Promise<AnomalyNotificationSettings> {
    const [upserted] = await db.insert(anomalyNotificationSettings)
      .values({ ...data, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: anomalyNotificationSettings.tenantId,
        set: {
          emailEnabled: data.emailEnabled ?? false,
          emailRecipients: data.emailRecipients ?? [],
          emailSeverities: data.emailSeverities ?? ["critical"],
          teamsEnabled: data.teamsEnabled ?? false,
          teamsWebhookUrl: data.teamsWebhookUrl ?? null,
          teamsSeverities: data.teamsSeverities ?? ["warning", "critical"],
          updatedAt: new Date(),
        },
      })
      .returning();
    return upserted;
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

  async getAdminAuditLogInRange(tenantId: string, from: Date, to: Date): Promise<AdminAuditLog[]> {
    return db.select().from(adminAuditLog)
      .where(and(
        eq(adminAuditLog.tenantId, tenantId),
        gte(adminAuditLog.timestamp, from),
        lte(adminAuditLog.timestamp, to),
      ))
      .orderBy(desc(adminAuditLog.timestamp));
  }

  async getAuditLogEntriesInRange(tenantId: string, from: Date, to: Date): Promise<AuditLogEntry[]> {
    return db.select().from(auditLogEntries)
      .where(and(
        eq(auditLogEntries.tenantId, tenantId),
        gte(auditLogEntries.timestamp, from),
        lte(auditLogEntries.timestamp, to),
      ))
      .orderBy(desc(auditLogEntries.timestamp));
  }

  async getServiceHealthIncidentsInRange(tenantId: string | undefined, from: Date, to: Date): Promise<ServiceHealthIncident[]> {
    const tenantClause = tenantId
      ? or(eq(serviceHealthIncidents.tenantId, tenantId), sql`${serviceHealthIncidents.tenantId} IS NULL`)
      : undefined;
    const inWindow = sql`(
      (${serviceHealthIncidents.startDateTime} BETWEEN ${from} AND ${to})
      OR (${serviceHealthIncidents.lastUpdatedAt} BETWEEN ${from} AND ${to})
      OR (${serviceHealthIncidents.collectedAt} BETWEEN ${from} AND ${to})
    )`;
    const where = tenantClause ? and(tenantClause, inWindow) : inWindow;
    return db.select().from(serviceHealthIncidents)
      .where(where)
      .orderBy(desc(serviceHealthIncidents.startDateTime));
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

  async getTraceWithLlmCalls(id: string): Promise<{ trace: AgentTrace; spans: AgentTraceSpan[]; llmCalls: LlmCallWithModel[] } | undefined> {
    const base = await this.getAgentTraceWithSpans(id);
    if (!base) return undefined;
    const rows = await db.execute(sql`
      SELECT lc.*, lm.model_name AS lm_model_name, lm.display_name AS lm_display_name,
             lm.provider AS lm_provider, lm.deployment_name AS lm_deployment_name, lm.endpoint AS lm_endpoint
      FROM llm_calls lc
      LEFT JOIN llm_models lm ON lm.id = lc.model_id
      WHERE lc.trace_id = ${id}
      ORDER BY lc.called_at ASC
    `);
    const llmCalls: LlmCallWithModel[] = (rows.rows as any[]).map(r => ({
      id: r.id,
      tenantId: r.tenant_id,
      modelId: r.model_id,
      agentId: r.agent_id,
      traceId: r.trace_id,
      spanId: r.span_id,
      agentName: r.agent_name,
      operation: r.operation,
      durationMs: r.duration_ms == null ? null : Number(r.duration_ms),
      ttftMs: r.ttft_ms == null ? null : Number(r.ttft_ms),
      tokensPerSec: r.tokens_per_sec == null ? null : Number(r.tokens_per_sec),
      inputTokens: r.input_tokens == null ? null : Number(r.input_tokens),
      outputTokens: r.output_tokens == null ? null : Number(r.output_tokens),
      cachedInputTokens: r.cached_input_tokens == null ? null : Number(r.cached_input_tokens),
      costCents: r.cost_cents == null ? null : Number(r.cost_cents),
      temperature: r.temperature == null ? null : Number(r.temperature),
      maxTokensRequested: r.max_tokens_requested == null ? null : Number(r.max_tokens_requested),
      stream: r.stream,
      status: r.status,
      errorClass: r.error_class,
      errorCode: r.error_code,
      errorMessage: r.error_message,
      requestId: r.request_id,
      metadata: r.metadata,
      calledAt: r.called_at instanceof Date ? r.called_at : new Date(r.called_at),
      modelName: r.lm_model_name ?? null,
      modelDisplayName: r.lm_display_name ?? null,
      provider: r.lm_provider ?? null,
      deploymentName: r.lm_deployment_name ?? null,
      endpoint: r.lm_endpoint ?? null,
    }));
    return { ...base, llmCalls };
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
    bySurface: { surface: string; calls: number; responseCalls: number; avgLatencyMs: number; p95LatencyMs: number; emptyResponseRate: number }[];
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
        COUNT(*) FILTER (WHERE interaction_type = 'aiResponse')::int AS response_calls,
        COALESCE(AVG(response_latency_ms) FILTER (WHERE response_latency_ms IS NOT NULL), 0)::real AS avg_latency,
        COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY response_latency_ms) FILTER (WHERE response_latency_ms IS NOT NULL), 0)::real AS p95,
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
      responseCalls: Number(r.response_calls) || 0,
      avgLatencyMs: Math.round(Number(r.avg_latency) || 0),
      p95LatencyMs: Math.round(Number(r.p95) || 0),
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
    await db.update(foundryDeployments)
      .set({ llmModelId: null, updatedAt: new Date() })
      .where(eq(foundryDeployments.llmModelId, id));
    await db.delete(llmCalls).where(eq(llmCalls.modelId, id));
    await db.delete(llmModels).where(eq(llmModels.id, id));
  }

  async createLlmCall(data: InsertLlmCall): Promise<LlmCall> {
    await this.assertTraceSpanConsistency(data.traceId ?? null, data.spanId ?? null);
    const [created] = await db.insert(llmCalls).values(data).returning();
    liveEvents.emit("llm_call.recorded", created.tenantId ?? null, created);
    return created;
  }

  private async assertTraceSpanConsistency(traceId: string | null, spanId: string | null): Promise<void> {
    if (!spanId) return;
    if (!traceId) {
      throw new Error("LLM call validation: spanId provided without traceId; both must be set together.");
    }
    const [span] = await db.select({ id: agentTraceSpans.id, traceId: agentTraceSpans.traceId })
      .from(agentTraceSpans)
      .where(eq(agentTraceSpans.id, spanId));
    if (!span) {
      throw new Error(`LLM call validation: spanId ${spanId} does not exist.`);
    }
    if (span.traceId !== traceId) {
      throw new Error(
        `LLM call validation: span ${spanId} belongs to trace ${span.traceId}, not ${traceId}.`,
      );
    }
  }

  async getLlmCallById(callId: string): Promise<LlmCallWithModel | undefined> {
    const rows = await db.execute(sql`
      SELECT lc.*, lm.model_name, lm.display_name AS model_display_name, lm.provider,
             lm.deployment_name, lm.endpoint
      FROM llm_calls lc
      LEFT JOIN llm_models lm ON lm.id = lc.model_id
      WHERE lc.id = ${callId}
      LIMIT 1
    `);
    const r = (rows.rows as any[])[0];
    if (!r) return undefined;
    return {
      id: r.id,
      tenantId: r.tenant_id,
      modelId: r.model_id,
      agentId: r.agent_id ?? null,
      traceId: r.trace_id ?? null,
      spanId: r.span_id ?? null,
      agentName: r.agent_name ?? null,
      operation: r.operation,
      durationMs: r.duration_ms == null ? null : Number(r.duration_ms),
      ttftMs: r.ttft_ms == null ? null : Number(r.ttft_ms),
      tokensPerSec: r.tokens_per_sec == null ? null : Number(r.tokens_per_sec),
      inputTokens: r.input_tokens == null ? null : Number(r.input_tokens),
      outputTokens: r.output_tokens == null ? null : Number(r.output_tokens),
      cachedInputTokens: r.cached_input_tokens == null ? null : Number(r.cached_input_tokens),
      costCents: r.cost_cents == null ? null : Number(r.cost_cents),
      temperature: r.temperature == null ? null : Number(r.temperature),
      maxTokensRequested: r.max_tokens_requested == null ? null : Number(r.max_tokens_requested),
      stream: r.stream ?? null,
      status: r.status,
      errorClass: r.error_class ?? null,
      errorCode: r.error_code ?? null,
      errorMessage: r.error_message ?? null,
      requestId: r.request_id ?? null,
      metadata: r.metadata ?? null,
      calledAt: r.called_at instanceof Date ? r.called_at : new Date(r.called_at),
      modelName: r.model_name ?? null,
      modelDisplayName: r.model_display_name ?? null,
      provider: r.provider ?? null,
      deploymentName: r.deployment_name ?? null,
      endpoint: r.endpoint ?? null,
    };
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

  async getSlowestLlmHops(tenantId: string, opts?: { since?: Date; limit?: number; agentId?: string }): Promise<SlowestLlmHop[]> {
    const since = opts?.since ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
    const limit = opts?.limit ?? 10;
    const agentFilter = opts?.agentId ? sql`AND lc.agent_id = ${opts.agentId}` : sql``;
    const rows = await db.execute(sql`
      SELECT lc.id AS call_id, lc.tenant_id, lc.trace_id, lc.span_id, lc.agent_id, lc.agent_name,
             lc.model_id, lc.duration_ms, lc.ttft_ms, lc.tokens_per_sec,
             lc.input_tokens, lc.output_tokens, lc.cost_cents,
             lc.status, lc.error_class, lc.called_at,
             lm.model_name, lm.display_name AS model_display_name, lm.provider,
             lm.deployment_name, lm.endpoint,
             at.agent_name AS trace_agent_name, at.platform AS trace_platform
      FROM llm_calls lc
      LEFT JOIN llm_models lm ON lm.id = lc.model_id
      LEFT JOIN agent_traces at ON at.id = lc.trace_id
      WHERE lc.tenant_id = ${tenantId}
        AND lc.called_at >= ${since}
        AND lc.duration_ms IS NOT NULL
        ${agentFilter}
      ORDER BY lc.duration_ms DESC NULLS LAST
      LIMIT ${limit}
    `);
    return (rows.rows as any[]).map(r => ({
      callId: r.call_id,
      tenantId: r.tenant_id,
      traceId: r.trace_id ?? null,
      spanId: r.span_id ?? null,
      agentId: r.agent_id ?? null,
      agentName: r.agent_name ?? r.trace_agent_name ?? null,
      modelId: r.model_id,
      modelName: r.model_name ?? null,
      modelDisplayName: r.model_display_name ?? null,
      provider: r.provider ?? null,
      deploymentName: r.deployment_name ?? null,
      endpoint: r.endpoint ?? null,
      durationMs: r.duration_ms == null ? null : Number(r.duration_ms),
      ttftMs: r.ttft_ms == null ? null : Number(r.ttft_ms),
      tokensPerSec: r.tokens_per_sec == null ? null : Number(r.tokens_per_sec),
      inputTokens: r.input_tokens == null ? null : Number(r.input_tokens),
      outputTokens: r.output_tokens == null ? null : Number(r.output_tokens),
      costCents: r.cost_cents == null ? null : Number(r.cost_cents),
      status: r.status,
      errorClass: r.error_class ?? null,
      calledAt: r.called_at instanceof Date ? r.called_at : new Date(r.called_at),
      traceAgentName: r.trace_agent_name ?? null,
      tracePlatform: r.trace_platform ?? null,
    }));
  }

  async getAgentLlmSummary(tenantId: string, agentId: string, opts?: { hopsLimit?: number }): Promise<AgentLlmSummary> {
    const hopsLimit = opts?.hopsLimit ?? 5;
    const now = Date.now();
    const since24h = new Date(now - 24 * 60 * 60 * 1000);
    const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const computeRollup = async (since: Date, windowHours: number): Promise<AgentLlmRollup> => {
      const rows = await db.execute(sql`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'success')::int AS successes,
          COUNT(*) FILTER (WHERE status = 'error')::int AS errors,
          COALESCE(SUM(input_tokens), 0)::int AS input_tokens,
          COALESCE(SUM(output_tokens), 0)::int AS output_tokens,
          COALESCE(SUM(cost_cents), 0)::real AS cost_cents,
          COALESCE(AVG(duration_ms), 0)::real AS avg_duration,
          COALESCE(AVG(ttft_ms), 0)::real AS avg_ttft
        FROM llm_calls
        WHERE tenant_id = ${tenantId} AND agent_id = ${agentId} AND called_at >= ${since}
      `);
      const r = (rows.rows as any[])[0] || {};
      return {
        windowHours,
        totalCalls: Number(r.total) || 0,
        successCount: Number(r.successes) || 0,
        errorCount: Number(r.errors) || 0,
        totalInputTokens: Number(r.input_tokens) || 0,
        totalOutputTokens: Number(r.output_tokens) || 0,
        totalCostCents: Number(r.cost_cents) || 0,
        avgDurationMs: Number(r.avg_duration) || 0,
        avgTtftMs: Number(r.avg_ttft) || 0,
      };
    };

    const [window24h, window7d, slowestHops24h, modelRows] = await Promise.all([
      computeRollup(since24h, 24),
      computeRollup(since7d, 24 * 7),
      this.getSlowestLlmHops(tenantId, { since: since24h, limit: hopsLimit, agentId }),
      db.execute(sql`
        SELECT
          lc.model_id,
          lm.model_name,
          lm.provider,
          COUNT(*)::int AS calls,
          COALESCE(SUM(COALESCE(lc.input_tokens, 0) + COALESCE(lc.output_tokens, 0)), 0)::int AS total_tokens,
          COALESCE(SUM(lc.cost_cents), 0)::real AS cost_cents,
          COALESCE(AVG(lc.duration_ms), 0)::real AS avg_duration
        FROM llm_calls lc
        LEFT JOIN llm_models lm ON lm.id = lc.model_id
        WHERE lc.tenant_id = ${tenantId} AND lc.agent_id = ${agentId} AND lc.called_at >= ${since7d}
        GROUP BY lc.model_id, lm.model_name, lm.provider
        ORDER BY cost_cents DESC, calls DESC
        LIMIT 5
      `),
    ]);

    return {
      agentId,
      window24h,
      window7d,
      slowestHops24h,
      topModels7d: (modelRows.rows as any[]).map(r => ({
        modelId: String(r.model_id),
        modelName: r.model_name ?? null,
        provider: r.provider ?? null,
        calls: Number(r.calls) || 0,
        totalTokens: Number(r.total_tokens) || 0,
        costCents: Number(r.cost_cents) || 0,
        avgDurationMs: Number(r.avg_duration) || 0,
      })),
    };
  }

  async backfillLlmCallTraceLinks(opts?: { tenantId?: string; toleranceMs?: number; dryRun?: boolean }): Promise<{ scanned: number; matched: number; updated: number; ambiguous: number }> {
    const toleranceMs = opts?.toleranceMs ?? 5000;
    const dryRun = !!opts?.dryRun;
    const tenantFilter = opts?.tenantId ? sql`AND lc.tenant_id = ${opts.tenantId}` : sql``;

    const candidates = await db.execute(sql`
      SELECT lc.id AS call_id, lc.tenant_id, lc.agent_id, lc.called_at
      FROM llm_calls lc
      WHERE lc.trace_id IS NULL
        AND lc.agent_id IS NOT NULL
        ${tenantFilter}
    `);

    let matched = 0;
    let updated = 0;
    let ambiguous = 0;
    const tolSeconds = Math.max(1, Math.ceil(toleranceMs / 1000));

    for (const row of candidates.rows as any[]) {
      const callId = row.call_id as string;
      const tenantId = row.tenant_id as string;
      const agentId = row.agent_id as string;
      const calledAt = row.called_at instanceof Date ? row.called_at : new Date(row.called_at);

      const matches = await db.execute(sql`
        SELECT s.id AS span_id, s.trace_id
        FROM agent_trace_spans s
        JOIN agent_traces t ON t.id = s.trace_id
        JOIN known_agents ka ON ka.tenant_id = t.tenant_id
        WHERE ka.id = ${agentId}
          AND t.tenant_id = ${tenantId}
          AND t.agent_name = ka.name
          AND s.span_type IN ('inference', 'llm')
          AND ABS(EXTRACT(EPOCH FROM (t.started_at + (s.start_offset || ' milliseconds')::interval - ${calledAt}::timestamp))) <= ${tolSeconds}
        LIMIT 2
      `);
      const matchRows = matches.rows as any[];
      if (matchRows.length === 1) {
        matched++;
        if (!dryRun) {
          await db.update(llmCalls)
            .set({ traceId: matchRows[0].trace_id, spanId: matchRows[0].span_id })
            .where(eq(llmCalls.id, callId));
          updated++;
        }
      } else if (matchRows.length > 1) {
        ambiguous++;
      }
    }

    return { scanned: (candidates.rows as any[]).length, matched, updated, ambiguous };
  }

  async upsertFoundryDeployment(data: InsertFoundryDeployment): Promise<FoundryDeployment> {
    const now = new Date();
    const [upserted] = await db.insert(foundryDeployments)
      .values({ ...data, lastSeenAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: [foundryDeployments.tenantId, foundryDeployments.subscriptionId, foundryDeployments.accountName, foundryDeployments.deploymentName],
        set: {
          subscriptionName: data.subscriptionName ?? null,
          resourceGroup: data.resourceGroup,
          accountKind: data.accountKind ?? null,
          accountResourceId: data.accountResourceId,
          endpoint: data.endpoint ?? null,
          region: data.region ?? null,
          modelName: data.modelName ?? null,
          modelVersion: data.modelVersion ?? null,
          modelFormat: data.modelFormat ?? null,
          skuName: data.skuName ?? null,
          skuCapacity: data.skuCapacity ?? null,
          provisioningState: data.provisioningState ?? null,
          raiPolicyName: data.raiPolicyName ?? null,
          rawProperties: data.rawProperties ?? null,
          lastSeenAt: now,
          updatedAt: now,
        },
      })
      .returning();
    return upserted;
  }

  async getFoundryDeployments(tenantId: string): Promise<FoundryDeployment[]> {
    return db.select().from(foundryDeployments)
      .where(eq(foundryDeployments.tenantId, tenantId))
      .orderBy(desc(foundryDeployments.lastSeenAt));
  }

  async getFoundryDeployment(id: string): Promise<FoundryDeployment | undefined> {
    const [row] = await db.select().from(foundryDeployments).where(eq(foundryDeployments.id, id));
    return row;
  }

  async getFoundryDeploymentByLlmModelId(llmModelId: string): Promise<FoundryDeployment | undefined> {
    const [row] = await db.select().from(foundryDeployments).where(eq(foundryDeployments.llmModelId, llmModelId));
    return row;
  }

  async setFoundryDeploymentLlmModel(id: string, llmModelId: string | null): Promise<FoundryDeployment | undefined> {
    const [updated] = await db.update(foundryDeployments)
      .set({ llmModelId, updatedAt: new Date() })
      .where(eq(foundryDeployments.id, id))
      .returning();
    return updated;
  }

  async upsertFoundryUsageSnapshot(data: InsertFoundryUsageSnapshot): Promise<FoundryUsageSnapshot> {
    const [upserted] = await db.insert(foundryUsageSnapshots)
      .values(data)
      .onConflictDoUpdate({
        target: [foundryUsageSnapshots.deploymentId, foundryUsageSnapshots.windowHours, foundryUsageSnapshots.windowEnd],
        set: {
          windowStart: data.windowStart,
          processedPromptTokens: data.processedPromptTokens ?? 0,
          generatedTokens: data.generatedTokens ?? 0,
          totalCalls: data.totalCalls ?? 0,
          throttledCalls: data.throttledCalls ?? 0,
          inferredCostCents: data.inferredCostCents ?? null,
          rawMetrics: data.rawMetrics ?? null,
          collectedAt: new Date(),
        },
      })
      .returning();
    return upserted;
  }

  async getFoundryUsageSnapshots(tenantId: string, opts?: { deploymentId?: string; since?: Date; limit?: number; windowHours?: number }): Promise<FoundryUsageSnapshot[]> {
    const conditions: SQL<unknown>[] = [eq(foundryUsageSnapshots.tenantId, tenantId)];
    if (opts?.deploymentId) conditions.push(eq(foundryUsageSnapshots.deploymentId, opts.deploymentId));
    if (opts?.since) conditions.push(gte(foundryUsageSnapshots.windowEnd, opts.since));
    if (opts?.windowHours != null) conditions.push(eq(foundryUsageSnapshots.windowHours, opts.windowHours));
    return db.select().from(foundryUsageSnapshots)
      .where(and(...conditions))
      .orderBy(desc(foundryUsageSnapshots.windowEnd))
      .limit(opts?.limit ?? 200);
  }

  async getLatestFoundryUsageByDeployment(tenantId: string, windowHours?: number): Promise<Record<string, FoundryUsageSnapshot>> {
    const rows = windowHours != null
      ? await db.execute(sql`
          SELECT DISTINCT ON (deployment_id) *
          FROM foundry_usage_snapshots
          WHERE tenant_id = ${tenantId} AND window_hours = ${windowHours}
          ORDER BY deployment_id, window_end DESC
        `)
      : await db.execute(sql`
          SELECT DISTINCT ON (deployment_id) *
          FROM foundry_usage_snapshots
          WHERE tenant_id = ${tenantId}
          ORDER BY deployment_id, window_end DESC
        `);
    const result: Record<string, FoundryUsageSnapshot> = {};
    for (const r of rows.rows as unknown as FoundrySnapshotRow[]) {
      result[r.deployment_id] = mapFoundrySnapshotRow(r);
    }
    return result;
  }

  async getLatestFoundryUsageByWindow(deploymentId: string): Promise<Record<number, FoundryUsageSnapshot>> {
    const rows = await db.execute(sql`
      SELECT DISTINCT ON (window_hours) *
      FROM foundry_usage_snapshots
      WHERE deployment_id = ${deploymentId}
      ORDER BY window_hours, window_end DESC
    `);
    const result: Record<number, FoundryUsageSnapshot> = {};
    for (const r of rows.rows as unknown as FoundrySnapshotRow[]) {
      result[Number(r.window_hours)] = mapFoundrySnapshotRow(r);
    }
    return result;
  }

  async getFoundryPricingOverrides(tenantId: string): Promise<FoundryPricingOverride[]> {
    return db.select().from(foundryPricingOverrides).where(eq(foundryPricingOverrides.tenantId, tenantId));
  }

  async upsertFoundryPricingOverride(data: InsertFoundryPricingOverride): Promise<FoundryPricingOverride> {
    const now = new Date();
    const [upserted] = await db.insert(foundryPricingOverrides)
      .values({ ...data, updatedAt: now })
      .onConflictDoUpdate({
        target: [foundryPricingOverrides.deploymentId],
        set: {
          inputCostPerMtok: data.inputCostPerMtok ?? null,
          outputCostPerMtok: data.outputCostPerMtok ?? null,
          notes: data.notes ?? null,
          updatedAt: now,
        },
      })
      .returning();
    return upserted;
  }

  async deleteFoundryPricingOverride(deploymentId: string): Promise<void> {
    await db.delete(foundryPricingOverrides).where(eq(foundryPricingOverrides.deploymentId, deploymentId));
  }

  async getFoundryCostAllocation(tenantId: string, windowHours: number): Promise<FoundryCostAllocation> {
    const deployments = await db.select().from(foundryDeployments)
      .where(eq(foundryDeployments.tenantId, tenantId))
      .orderBy(desc(foundryDeployments.lastSeenAt));
    const overrides = await db.select().from(foundryPricingOverrides)
      .where(eq(foundryPricingOverrides.tenantId, tenantId));
    const overrideByDeployment = new Map(overrides.map(o => [o.deploymentId, o]));

    const latestUsage = await this.getLatestFoundryUsageByDeployment(tenantId, windowHours);

    const linkedModelIds = deployments.map(d => d.llmModelId).filter((x): x is string => !!x);
    const modelById = new Map<string, LlmModel>();
    if (linkedModelIds.length > 0) {
      const models = await db.select().from(llmModels)
        .where(and(eq(llmModels.tenantId, tenantId), sql`${llmModels.id} = ANY(${linkedModelIds})`));
      for (const m of models) modelById.set(m.id, m);
    }

    const now = new Date();
    const windowStart = new Date(now.getTime() - windowHours * 60 * 60 * 1000);

    let agentRows: Array<{
      modelId: string;
      agentId: string | null;
      agentName: string | null;
      platform: string | null;
      inputTokens: number;
      outputTokens: number;
      callCount: number;
    }> = [];
    if (linkedModelIds.length > 0) {
      const result = await db.execute(sql`
        SELECT
          lc.model_id AS "modelId",
          lc.agent_id AS "agentId",
          COALESCE(ka.name, MAX(lc.agent_name)) AS "agentName",
          ka.platform AS "platform",
          COALESCE(SUM(lc.input_tokens), 0)::float AS "inputTokens",
          COALESCE(SUM(lc.output_tokens), 0)::float AS "outputTokens",
          COUNT(*)::int AS "callCount"
        FROM llm_calls lc
        LEFT JOIN known_agents ka ON ka.id = lc.agent_id
        WHERE lc.tenant_id = ${tenantId}
          AND lc.called_at >= ${windowStart}
          AND lc.called_at <= ${now}
          AND lc.model_id = ANY(${linkedModelIds})
        GROUP BY lc.model_id, lc.agent_id, ka.platform, ka.name
      `);
      agentRows = (result.rows as any[]).map(r => ({
        modelId: String(r.modelId),
        agentId: r.agentId ? String(r.agentId) : null,
        agentName: r.agentName ? String(r.agentName) : null,
        platform: r.platform ? String(r.platform) : null,
        inputTokens: Number(r.inputTokens) || 0,
        outputTokens: Number(r.outputTokens) || 0,
        callCount: Number(r.callCount) || 0,
      }));
    }
    const agentByModel = new Map<string, typeof agentRows>();
    for (const row of agentRows) {
      const list = agentByModel.get(row.modelId) ?? [];
      list.push(row);
      agentByModel.set(row.modelId, list);
    }

    const deploymentAllocations: FoundryDeploymentAllocation[] = deployments.map(d => {
      const usage = latestUsage[d.id] ?? null;
      const override = overrideByDeployment.get(d.id) ?? null;
      const model = d.llmModelId ? modelById.get(d.llmModelId) ?? null : null;

      const modelInputCost = model?.inputCostPerMtok ?? null;
      const modelOutputCost = model?.outputCostPerMtok ?? null;
      const overrideInputCost = override?.inputCostPerMtok ?? null;
      const overrideOutputCost = override?.outputCostPerMtok ?? null;
      const resolvedInputCost = overrideInputCost ?? modelInputCost;
      const resolvedOutputCost = overrideOutputCost ?? modelOutputCost;

      const authInput = usage ? Number(usage.processedPromptTokens) || 0 : 0;
      const authOutput = usage ? Number(usage.generatedTokens) || 0 : 0;
      const authCalls = usage ? Number(usage.totalCalls) || 0 : 0;

      let authoritativeTotalCostCents = 0;
      if (resolvedInputCost != null) {
        authoritativeTotalCostCents += (authInput / 1_000_000) * resolvedInputCost * 100;
      }
      if (resolvedOutputCost != null) {
        authoritativeTotalCostCents += (authOutput / 1_000_000) * resolvedOutputCost * 100;
      }

      const modelAgents = (d.llmModelId ? agentByModel.get(d.llmModelId) : undefined) ?? [];
      const totalInstrumentedTokens = modelAgents.reduce((s, a) => s + a.inputTokens + a.outputTokens, 0);
      const totalInstrumentedInput = modelAgents.reduce((s, a) => s + a.inputTokens, 0);
      const totalInstrumentedOutput = modelAgents.reduce((s, a) => s + a.outputTokens, 0);
      const totalInstrumentedCalls = modelAgents.reduce((s, a) => s + a.callCount, 0);

      const agents: FoundryAgentAllocation[] = modelAgents.map(a => {
        const tokens = a.inputTokens + a.outputTokens;
        const share = totalInstrumentedTokens > 0 ? tokens / totalInstrumentedTokens : 0;
        return {
          agentId: a.agentId,
          agentName: a.agentName,
          platform: a.platform,
          inputTokens: a.inputTokens,
          outputTokens: a.outputTokens,
          callCount: a.callCount,
          shareOfTokens: share,
          allocatedCostCents: authoritativeTotalCostCents * share,
        };
      }).sort((x, y) => y.allocatedCostCents - x.allocatedCostCents);

      const allocatedCostCents = agents.reduce((s, a) => s + a.allocatedCostCents, 0);
      const unallocated = Math.max(0, authoritativeTotalCostCents - allocatedCostCents);

      return {
        deploymentId: d.id,
        deploymentName: d.deploymentName,
        accountName: d.accountName,
        modelName: d.modelName,
        modelVersion: d.modelVersion,
        region: d.region,
        llmModelId: d.llmModelId,
        resolvedInputCostPerMtok: resolvedInputCost,
        resolvedOutputCostPerMtok: resolvedOutputCost,
        overrideInputCostPerMtok: overrideInputCost,
        overrideOutputCostPerMtok: overrideOutputCost,
        modelInputCostPerMtok: modelInputCost,
        modelOutputCostPerMtok: modelOutputCost,
        authoritativeInputTokens: authInput,
        authoritativeOutputTokens: authOutput,
        authoritativeTotalCalls: authCalls,
        authoritativeTotalCostCents,
        instrumentedInputTokens: totalInstrumentedInput,
        instrumentedOutputTokens: totalInstrumentedOutput,
        instrumentedCallCount: totalInstrumentedCalls,
        unallocatedCostCents: unallocated,
        windowEnd: usage ? (usage.windowEnd instanceof Date ? usage.windowEnd : new Date(usage.windowEnd)) : null,
        agents,
      };
    });

    deploymentAllocations.sort((a, b) => b.authoritativeTotalCostCents - a.authoritativeTotalCostCents);

    const totals = deploymentAllocations.reduce((acc, d) => ({
      authoritativeTotalCostCents: acc.authoritativeTotalCostCents + d.authoritativeTotalCostCents,
      allocatedCostCents: acc.allocatedCostCents + (d.authoritativeTotalCostCents - d.unallocatedCostCents),
      unallocatedCostCents: acc.unallocatedCostCents + d.unallocatedCostCents,
      authoritativeInputTokens: acc.authoritativeInputTokens + d.authoritativeInputTokens,
      authoritativeOutputTokens: acc.authoritativeOutputTokens + d.authoritativeOutputTokens,
    }), {
      authoritativeTotalCostCents: 0,
      allocatedCostCents: 0,
      unallocatedCostCents: 0,
      authoritativeInputTokens: 0,
      authoritativeOutputTokens: 0,
    });

    return {
      windowHours,
      windowStart,
      windowEnd: now,
      deployments: deploymentAllocations,
      totals,
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

  async getBenchmarkingMatrix(orgId: string, selectedWindowMs: number): Promise<{
    metricWindows: Record<string, { ms: number; label: string }>;
    tenants: Array<{
      tenantId: string;
      tenantName: string;
      metrics: Record<string, { value: number; prev: number | null; delta: number | null; sparkline: number[] }>;
    }>;
  }> {
    const tenantList = await db.select().from(tenants).where(eq(tenants.organizationId, orgId));
    const bucketCount = 8;

    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const mtdMs = Math.max(60_000, now.getTime() - startOfMonth.getTime());

    const labelForMs = (ms: number): string => {
      const d = ms / 86400000;
      if (Math.abs(d - 1) < 0.05) return "24h";
      if (Math.abs(d - 7) < 0.5) return "7d";
      if (Math.abs(d - 28) < 0.5) return "28d";
      if (Math.abs(d - 30) < 0.5) return "30d";
      if (Math.abs(d - 90) < 0.5) return "90d";
      return `${Math.round(d)}d`;
    };

    const metricWindows: Record<string, { ms: number; label: string }> = {
      latencyP95: { ms: selectedWindowMs, label: labelForMs(selectedWindowMs) },
      alertCount: { ms: selectedWindowMs, label: labelForMs(selectedWindowMs) },
      agentErrorRate: { ms: selectedWindowMs, label: labelForMs(selectedWindowMs) },
      copilotUsers: { ms: 28 * 86400000, label: "28d" },
      llmSpend: { ms: mtdMs, label: "MTD" },
      riskySignIns: { ms: 7 * 86400000, label: "7d" },
    };

    if (tenantList.length === 0) {
      return { metricWindows, tenants: [] };
    }

    const metricKeys = Object.keys(metricWindows);
    const emptyMetric = () => ({ value: 0, prev: null as number | null, delta: null as number | null, sparkline: new Array(bucketCount).fill(0) });
    const computeDelta = (curr: number, prev: number | null): number | null => {
      if (prev == null) return null;
      if (prev === 0) return curr > 0 ? 100 : 0;
      return ((curr - prev) / prev) * 100;
    };

    const result = new Map<string, { tenantId: string; tenantName: string; metrics: Record<string, ReturnType<typeof emptyMetric>> }>();
    for (const t of tenantList) {
      result.set(t.id, {
        tenantId: t.id,
        tenantName: t.name,
        metrics: Object.fromEntries(metricKeys.map(k => [k, emptyMetric()])),
      });
    }

    const tenantIds = tenantList.map(t => t.id);
    const idIn = sql.join(tenantIds.map(id => sql`${id}`), sql`, `);

    const bucketSecFor = (ms: number) => Math.max(60, Math.floor(ms / 1000 / bucketCount));
    const winFor = (key: string) => {
      const ms = metricWindows[key].ms;
      return {
        winStart: new Date(now.getTime() - ms),
        prevStart: new Date(now.getTime() - 2 * ms),
        bucketSec: bucketSecFor(ms),
      };
    };

    // 1. Synthetic latency p95 - filtered to page_load metric (canonical synthetic-test latency in ms)
    {
      const { winStart, prevStart, bucketSec } = winFor("latencyP95");
      const cur = await db.execute(sql`
        SELECT tenant_id,
          percentile_cont(0.95) WITHIN GROUP (ORDER BY value) FILTER (WHERE timestamp >= ${winStart}) AS cur,
          percentile_cont(0.95) WITHIN GROUP (ORDER BY value) FILTER (WHERE timestamp >= ${prevStart} AND timestamp < ${winStart}) AS prev
        FROM metrics
        WHERE tenant_id IN (${idIn}) AND timestamp >= ${prevStart} AND metric_name = 'page_load' AND unit = 'ms'
        GROUP BY tenant_id
      `);
      for (const r of cur.rows as any[]) {
        const m = result.get(r.tenant_id)?.metrics.latencyP95;
        if (!m) continue;
        m.value = Number(r.cur) || 0;
        m.prev = r.prev != null ? Number(r.prev) : null;
        m.delta = computeDelta(m.value, m.prev);
      }
      const spk = await db.execute(sql`
        SELECT tenant_id,
          floor(EXTRACT(EPOCH FROM (timestamp - ${winStart}::timestamp)) / ${bucketSec})::int AS idx,
          percentile_cont(0.95) WITHIN GROUP (ORDER BY value) AS v
        FROM metrics
        WHERE tenant_id IN (${idIn}) AND timestamp >= ${winStart} AND metric_name = 'page_load' AND unit = 'ms'
        GROUP BY tenant_id, idx
      `);
      for (const r of spk.rows as any[]) {
        const idx = Math.min(bucketCount - 1, Math.max(0, Number(r.idx)));
        const m = result.get(r.tenant_id)?.metrics.latencyP95;
        if (m) m.sparkline[idx] = Number(r.v) || 0;
      }
    }

    // 2. Alert count (selectable window)
    {
      const { winStart, prevStart, bucketSec } = winFor("alertCount");
      const cur = await db.execute(sql`
        SELECT tenant_id,
          COUNT(*) FILTER (WHERE timestamp >= ${winStart})::int AS cur,
          COUNT(*) FILTER (WHERE timestamp >= ${prevStart} AND timestamp < ${winStart})::int AS prev
        FROM alerts
        WHERE tenant_id IN (${idIn}) AND timestamp >= ${prevStart}
        GROUP BY tenant_id
      `);
      for (const r of cur.rows as any[]) {
        const m = result.get(r.tenant_id)?.metrics.alertCount;
        if (!m) continue;
        m.value = Number(r.cur) || 0;
        m.prev = Number(r.prev) || 0;
        m.delta = computeDelta(m.value, m.prev);
      }
      const spk = await db.execute(sql`
        SELECT tenant_id,
          floor(EXTRACT(EPOCH FROM (timestamp - ${winStart}::timestamp)) / ${bucketSec})::int AS idx,
          COUNT(*)::int AS c
        FROM alerts
        WHERE tenant_id IN (${idIn}) AND timestamp >= ${winStart}
        GROUP BY tenant_id, idx
      `);
      for (const r of spk.rows as any[]) {
        const idx = Math.min(bucketCount - 1, Math.max(0, Number(r.idx)));
        const m = result.get(r.tenant_id)?.metrics.alertCount;
        if (m) m.sparkline[idx] = Number(r.c) || 0;
      }
    }

    // 3. Agent error rate %, selectable window
    {
      const { winStart, prevStart, bucketSec } = winFor("agentErrorRate");
      const cur = await db.execute(sql`
        SELECT tenant_id,
          COUNT(*) FILTER (WHERE started_at >= ${winStart})::int AS cur_total,
          COUNT(*) FILTER (WHERE started_at >= ${winStart} AND status = 'failed')::int AS cur_failed,
          COUNT(*) FILTER (WHERE started_at >= ${prevStart} AND started_at < ${winStart})::int AS prev_total,
          COUNT(*) FILTER (WHERE started_at >= ${prevStart} AND started_at < ${winStart} AND status = 'failed')::int AS prev_failed
        FROM agent_traces
        WHERE tenant_id IN (${idIn}) AND started_at >= ${prevStart}
        GROUP BY tenant_id
      `);
      for (const r of cur.rows as any[]) {
        const m = result.get(r.tenant_id)?.metrics.agentErrorRate;
        if (!m) continue;
        const ct = Number(r.cur_total) || 0;
        const cf = Number(r.cur_failed) || 0;
        const pt = Number(r.prev_total) || 0;
        const pf = Number(r.prev_failed) || 0;
        m.value = ct > 0 ? (cf / ct) * 100 : 0;
        m.prev = pt > 0 ? (pf / pt) * 100 : null;
        m.delta = computeDelta(m.value, m.prev);
      }
      const spk = await db.execute(sql`
        SELECT tenant_id,
          floor(EXTRACT(EPOCH FROM (started_at - ${winStart}::timestamp)) / ${bucketSec})::int AS idx,
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
        FROM agent_traces
        WHERE tenant_id IN (${idIn}) AND started_at >= ${winStart}
        GROUP BY tenant_id, idx
      `);
      for (const r of spk.rows as any[]) {
        const idx = Math.min(bucketCount - 1, Math.max(0, Number(r.idx)));
        const m = result.get(r.tenant_id)?.metrics.agentErrorRate;
        const total = Number(r.total) || 0;
        const failed = Number(r.failed) || 0;
        if (m && total > 0) m.sparkline[idx] = (failed / total) * 100;
      }
    }

    // 4. Copilot users (distinct user_id) - fixed 28d
    {
      const { winStart, prevStart, bucketSec } = winFor("copilotUsers");
      const cur = await db.execute(sql`
        SELECT tenant_id,
          COUNT(DISTINCT user_id) FILTER (WHERE created_at >= ${winStart})::int AS cur,
          COUNT(DISTINCT user_id) FILTER (WHERE created_at >= ${prevStart} AND created_at < ${winStart})::int AS prev
        FROM copilot_interactions
        WHERE tenant_id IN (${idIn}) AND created_at >= ${prevStart} AND user_id IS NOT NULL
        GROUP BY tenant_id
      `);
      for (const r of cur.rows as any[]) {
        const m = result.get(r.tenant_id)?.metrics.copilotUsers;
        if (!m) continue;
        m.value = Number(r.cur) || 0;
        m.prev = Number(r.prev) || 0;
        m.delta = computeDelta(m.value, m.prev);
      }
      const spk = await db.execute(sql`
        SELECT tenant_id,
          floor(EXTRACT(EPOCH FROM (created_at - ${winStart}::timestamp)) / ${bucketSec})::int AS idx,
          COUNT(DISTINCT user_id)::int AS u
        FROM copilot_interactions
        WHERE tenant_id IN (${idIn}) AND created_at >= ${winStart} AND user_id IS NOT NULL
        GROUP BY tenant_id, idx
      `);
      for (const r of spk.rows as any[]) {
        const idx = Math.min(bucketCount - 1, Math.max(0, Number(r.idx)));
        const m = result.get(r.tenant_id)?.metrics.copilotUsers;
        if (m) m.sparkline[idx] = Number(r.u) || 0;
      }
    }

    // 5. LLM spend (cost_cents) - fixed MTD
    {
      const { winStart, prevStart, bucketSec } = winFor("llmSpend");
      const cur = await db.execute(sql`
        SELECT tenant_id,
          COALESCE(SUM(cost_cents) FILTER (WHERE called_at >= ${winStart}), 0)::real AS cur,
          COALESCE(SUM(cost_cents) FILTER (WHERE called_at >= ${prevStart} AND called_at < ${winStart}), 0)::real AS prev
        FROM llm_calls
        WHERE tenant_id IN (${idIn}) AND called_at >= ${prevStart}
        GROUP BY tenant_id
      `);
      for (const r of cur.rows as any[]) {
        const m = result.get(r.tenant_id)?.metrics.llmSpend;
        if (!m) continue;
        m.value = Number(r.cur) || 0;
        m.prev = Number(r.prev) || 0;
        m.delta = computeDelta(m.value, m.prev);
      }
      const spk = await db.execute(sql`
        SELECT tenant_id,
          floor(EXTRACT(EPOCH FROM (called_at - ${winStart}::timestamp)) / ${bucketSec})::int AS idx,
          COALESCE(SUM(cost_cents), 0)::real AS s
        FROM llm_calls
        WHERE tenant_id IN (${idIn}) AND called_at >= ${winStart}
        GROUP BY tenant_id, idx
      `);
      for (const r of spk.rows as any[]) {
        const idx = Math.min(bucketCount - 1, Math.max(0, Number(r.idx)));
        const m = result.get(r.tenant_id)?.metrics.llmSpend;
        if (m) m.sparkline[idx] = Number(r.s) || 0;
      }
    }

    // 6. High-risk sign-ins (risk_level = 'high') - fixed 7d
    {
      const { winStart, prevStart, bucketSec } = winFor("riskySignIns");
      const cur = await db.execute(sql`
        SELECT tenant_id,
          COUNT(*) FILTER (WHERE sign_in_at >= ${winStart} AND risk_level = 'high')::int AS cur,
          COUNT(*) FILTER (WHERE sign_in_at >= ${prevStart} AND sign_in_at < ${winStart} AND risk_level = 'high')::int AS prev
        FROM entra_sign_ins
        WHERE tenant_id IN (${idIn}) AND sign_in_at >= ${prevStart}
        GROUP BY tenant_id
      `);
      for (const r of cur.rows as any[]) {
        const m = result.get(r.tenant_id)?.metrics.riskySignIns;
        if (!m) continue;
        m.value = Number(r.cur) || 0;
        m.prev = Number(r.prev) || 0;
        m.delta = computeDelta(m.value, m.prev);
      }
      const spk = await db.execute(sql`
        SELECT tenant_id,
          floor(EXTRACT(EPOCH FROM (sign_in_at - ${winStart}::timestamp)) / ${bucketSec})::int AS idx,
          COUNT(*)::int AS c
        FROM entra_sign_ins
        WHERE tenant_id IN (${idIn}) AND sign_in_at >= ${winStart} AND risk_level = 'high'
        GROUP BY tenant_id, idx
      `);
      for (const r of spk.rows as any[]) {
        const idx = Math.min(bucketCount - 1, Math.max(0, Number(r.idx)));
        const m = result.get(r.tenant_id)?.metrics.riskySignIns;
        if (m) m.sparkline[idx] = Number(r.c) || 0;
      }
    }

    return {
      metricWindows,
      tenants: Array.from(result.values()),
    };
  }

  async createScheduledDigest(data: InsertScheduledDigest): Promise<ScheduledDigest> {
    const [created] = await db.insert(scheduledDigests).values(data).returning();
    return created;
  }

  async updateScheduledDigest(id: string, data: Partial<ScheduledDigest>): Promise<ScheduledDigest | undefined> {
    const { id: _ignore, createdAt: _c, ...patch } = data;
    const [updated] = await db.update(scheduledDigests)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(scheduledDigests.id, id))
      .returning();
    return updated;
  }

  async deleteScheduledDigest(id: string): Promise<void> {
    await db.delete(scheduledDigestRuns).where(eq(scheduledDigestRuns.digestId, id));
    await db.delete(scheduledDigests).where(eq(scheduledDigests.id, id));
  }

  async getScheduledDigests(orgId?: string): Promise<ScheduledDigest[]> {
    if (orgId) {
      return db.select().from(scheduledDigests).where(eq(scheduledDigests.organizationId, orgId)).orderBy(desc(scheduledDigests.createdAt));
    }
    return db.select().from(scheduledDigests).orderBy(desc(scheduledDigests.createdAt));
  }

  async getScheduledDigest(id: string): Promise<ScheduledDigest | undefined> {
    const [d] = await db.select().from(scheduledDigests).where(eq(scheduledDigests.id, id));
    return d;
  }

  async getScheduledDigestsDue(now: Date): Promise<ScheduledDigest[]> {
    return db.select().from(scheduledDigests)
      .where(and(eq(scheduledDigests.enabled, true), sql`${scheduledDigests.nextRunAt} IS NOT NULL AND ${scheduledDigests.nextRunAt} <= ${now}`));
  }

  async createScheduledDigestRun(data: InsertScheduledDigestRun): Promise<ScheduledDigestRun> {
    const [created] = await db.insert(scheduledDigestRuns).values(data).returning();
    return created;
  }

  async updateScheduledDigestRun(id: string, data: Partial<ScheduledDigestRun>): Promise<ScheduledDigestRun | undefined> {
    const { id: _ignore, ...patch } = data;
    const [updated] = await db.update(scheduledDigestRuns)
      .set(patch)
      .where(eq(scheduledDigestRuns.id, id))
      .returning();
    return updated;
  }

  async getScheduledDigestRuns(digestId: string, limit = 25): Promise<ScheduledDigestRun[]> {
    return db.select().from(scheduledDigestRuns)
      .where(eq(scheduledDigestRuns.digestId, digestId))
      .orderBy(desc(scheduledDigestRuns.startedAt))
      .limit(limit);
  }

  async getAgentTracesPaged(opts: {
    tenantId?: string;
    platform?: string;
    status?: string;
    search?: string;
    offset: number;
    limit: number;
  }): Promise<AgentTrace[]> {
    const conditions: SQL[] = [];
    if (opts.tenantId) conditions.push(eq(agentTraces.tenantId, opts.tenantId));
    if (opts.platform) conditions.push(eq(agentTraces.platform, opts.platform));
    if (opts.status) conditions.push(eq(agentTraces.status, opts.status));
    if (opts.search) conditions.push(ilike(agentTraces.agentName, `%${opts.search}%`));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    return db.select().from(agentTraces)
      .where(where)
      .orderBy(desc(agentTraces.startedAt))
      .limit(opts.limit)
      .offset(opts.offset);
  }

  async getEntraSignInsPaged(tenantId: string, opts: {
    userId?: string;
    appName?: string;
    status?: string;
    riskLevel?: string;
    since?: string;
    offset: number;
    limit: number;
  }): Promise<EntraSignIn[]> {
    const conditions: SQL[] = [eq(entraSignIns.tenantId, tenantId)];
    if (opts.userId) conditions.push(eq(entraSignIns.userId, opts.userId));
    if (opts.appName) conditions.push(eq(entraSignIns.appDisplayName, opts.appName));
    if (opts.status) conditions.push(eq(entraSignIns.status, opts.status));
    if (opts.riskLevel) conditions.push(eq(entraSignIns.riskLevel, opts.riskLevel));
    if (opts.since) conditions.push(gte(entraSignIns.signInAt, new Date(opts.since)));
    return db.select().from(entraSignIns)
      .where(and(...conditions))
      .orderBy(desc(entraSignIns.signInAt))
      .limit(opts.limit)
      .offset(opts.offset);
  }

  async getLlmCallsPaged(tenantId: string, opts: {
    modelId?: string;
    agentId?: string;
    status?: string;
    errorClass?: string;
    since?: string;
    offset: number;
    limit: number;
  }): Promise<LlmCall[]> {
    const conditions: SQL[] = [eq(llmCalls.tenantId, tenantId)];
    if (opts.modelId) conditions.push(eq(llmCalls.modelId, opts.modelId));
    if (opts.agentId) conditions.push(eq(llmCalls.agentId, opts.agentId));
    if (opts.status) conditions.push(eq(llmCalls.status, opts.status));
    if (opts.errorClass) conditions.push(eq(llmCalls.errorClass, opts.errorClass));
    if (opts.since) conditions.push(gte(llmCalls.calledAt, new Date(opts.since)));
    return db.select().from(llmCalls)
      .where(and(...conditions))
      .orderBy(desc(llmCalls.calledAt))
      .limit(opts.limit)
      .offset(opts.offset);
  }

  async getAlertsPaged(opts: {
    tenantId?: string;
    severity?: string;
    acknowledged?: boolean;
    search?: string;
    offset: number;
    limit: number;
  }): Promise<Alert[]> {
    const conditions: SQL[] = [];
    if (opts.tenantId) conditions.push(eq(alerts.tenantId, opts.tenantId));
    if (opts.severity) conditions.push(eq(alerts.severity, opts.severity));
    if (opts.acknowledged !== undefined) conditions.push(eq(alerts.acknowledged, opts.acknowledged));
    if (opts.search) {
      const titleMatch = ilike(alerts.title, `%${opts.search}%`);
      const messageMatch = ilike(alerts.message, `%${opts.search}%`);
      const orExpr = or(titleMatch, messageMatch);
      if (orExpr) conditions.push(orExpr);
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    return db.select().from(alerts)
      .where(where)
      .orderBy(desc(alerts.timestamp))
      .limit(opts.limit)
      .offset(opts.offset);
  }

  async getUsageReportsPaged(tenantId: string, opts: {
    reportType?: string;
    since?: Date;
    offset: number;
    limit: number;
  }): Promise<UsageReport[]> {
    const conditions: SQL[] = [eq(usageReports.tenantId, tenantId)];
    if (opts.reportType) conditions.push(eq(usageReports.reportType, opts.reportType));
    if (opts.since) conditions.push(gte(usageReports.collectedAt, opts.since));
    return db.select().from(usageReports)
      .where(and(...conditions))
      .orderBy(desc(usageReports.collectedAt))
      .limit(opts.limit)
      .offset(opts.offset);
  }

  async rollupLlmSpendDaily(opts?: { tenantId?: string; sinceDays?: number }): Promise<{ rolledUp: number; tenants: number }> {
    const sinceDays = opts?.sinceDays ?? 35;
    const sinceDate = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
    const conditions: SQL[] = [gte(llmCalls.calledAt, sinceDate)];
    if (opts?.tenantId) conditions.push(eq(llmCalls.tenantId, opts.tenantId));
    const rows = await db.execute(sql`
      SELECT
        tenant_id AS "tenantId",
        model_id AS "modelId",
        to_char(date_trunc('day', called_at), 'YYYY-MM-DD') AS "date",
        COUNT(*)::int AS "callCount",
        COALESCE(SUM(input_tokens), 0)::int AS "inputTokens",
        COALESCE(SUM(output_tokens), 0)::int AS "outputTokens",
        COALESCE(SUM(cost_cents), 0)::real AS "costCents"
      FROM llm_calls
      WHERE called_at >= ${sinceDate}
        ${opts?.tenantId ? sql`AND tenant_id = ${opts.tenantId}` : sql``}
      GROUP BY tenant_id, model_id, date_trunc('day', called_at)
    `);
    const tenantSet = new Set<string>();
    let rolledUp = 0;
    for (const r of rows.rows as any[]) {
      await db.insert(llmSpendDaily).values({
        tenantId: r.tenantId,
        modelId: r.modelId,
        date: r.date,
        callCount: r.callCount,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        costCents: r.costCents,
      } as InsertLlmSpendDaily).onConflictDoUpdate({
        target: [llmSpendDaily.tenantId, llmSpendDaily.modelId, llmSpendDaily.date],
        set: {
          callCount: r.callCount,
          inputTokens: r.inputTokens,
          outputTokens: r.outputTokens,
          costCents: r.costCents,
          computedAt: new Date(),
        },
      });
      tenantSet.add(r.tenantId);
      rolledUp++;
    }

    // Merge in authoritative Azure AI Foundry usage snapshots so that LLM cost
    // does not under-report when Foundry deployments are not fully covered by
    // the per-call llm_calls stream.
    //
    // Foundry usage_snapshots are *rolling* 24h windows collected hourly, so
    // many rows exist per (deployment, day) with overlapping ranges. To avoid
    // multi-counting we pick exactly ONE snapshot per (deployment, UTC day):
    // the latest snapshot whose window_end falls inside that UTC day. That
    // snapshot represents the authoritative 24h usage ending in the day.
    // Multiple deployments mapping to the same llm_model_id are then summed
    // across deployments (legitimate) and the result is merged into
    // llm_spend_daily via GREATEST(...) so we never double-count against
    // llm_calls.
    const foundryRows = await db.execute(sql`
      WITH ranked AS (
        SELECT
          d.tenant_id AS tenant_id,
          d.llm_model_id AS llm_model_id,
          s.deployment_id AS deployment_id,
          s.window_end AS window_end,
          s.total_calls AS total_calls,
          s.processed_prompt_tokens AS processed_prompt_tokens,
          s.generated_tokens AS generated_tokens,
          s.inferred_cost_cents AS inferred_cost_cents,
          to_char(date_trunc('day', s.window_end), 'YYYY-MM-DD') AS day_str,
          ROW_NUMBER() OVER (
            PARTITION BY s.deployment_id, date_trunc('day', s.window_end)
            ORDER BY s.window_end DESC
          ) AS rn
        FROM foundry_usage_snapshots s
        JOIN foundry_deployments d ON d.id = s.deployment_id
        WHERE s.window_hours = 24
          AND s.window_end >= ${sinceDate}
          AND d.llm_model_id IS NOT NULL
          AND s.inferred_cost_cents IS NOT NULL
          ${opts?.tenantId ? sql`AND d.tenant_id = ${opts.tenantId}` : sql``}
      )
      SELECT
        tenant_id AS "tenantId",
        llm_model_id AS "modelId",
        day_str AS "date",
        COALESCE(SUM(total_calls), 0)::int AS "callCount",
        COALESCE(SUM(processed_prompt_tokens), 0)::int AS "inputTokens",
        COALESCE(SUM(generated_tokens), 0)::int AS "outputTokens",
        COALESCE(SUM(inferred_cost_cents), 0)::real AS "costCents"
      FROM ranked
      WHERE rn = 1
      GROUP BY tenant_id, llm_model_id, day_str
    `);
    for (const r of foundryRows.rows as any[]) {
      await db.execute(sql`
        INSERT INTO llm_spend_daily (tenant_id, model_id, date, call_count, input_tokens, output_tokens, cost_cents, computed_at)
        VALUES (${r.tenantId}, ${r.modelId}, ${r.date}, ${r.callCount}, ${r.inputTokens}, ${r.outputTokens}, ${r.costCents}, NOW())
        ON CONFLICT (tenant_id, model_id, date) DO UPDATE SET
          call_count = GREATEST(llm_spend_daily.call_count, EXCLUDED.call_count),
          input_tokens = GREATEST(llm_spend_daily.input_tokens, EXCLUDED.input_tokens),
          output_tokens = GREATEST(llm_spend_daily.output_tokens, EXCLUDED.output_tokens),
          cost_cents = GREATEST(llm_spend_daily.cost_cents, EXCLUDED.cost_cents),
          computed_at = NOW()
      `);
      tenantSet.add(r.tenantId);
      rolledUp++;
    }
    return { rolledUp, tenants: tenantSet.size };
  }

  async getLlmSpendMtd(tenantId: string): Promise<{
    totalCents: number;
    projectedMonthCents: number;
    daysElapsed: number;
    daysInMonth: number;
    topModels: { modelId: string; modelName: string; provider: string; costCents: number }[];
    daily: { date: string; costCents: number }[];
  }> {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthStartStr = monthStart.toISOString().slice(0, 10);
    const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
    const daysElapsed = Math.max(1, now.getUTCDate());

    const rows = await db.execute(sql`
      SELECT
        s.model_id AS "modelId",
        m.model_name AS "modelName",
        m.provider AS "provider",
        s.date AS "date",
        s.cost_cents AS "costCents"
      FROM llm_spend_daily s
      LEFT JOIN llm_models m ON m.id = s.model_id
      WHERE s.tenant_id = ${tenantId} AND s.date >= ${monthStartStr}
    `);
    let totalCents = 0;
    const byModel = new Map<string, { modelId: string; modelName: string; provider: string; costCents: number }>();
    const byDay = new Map<string, number>();
    for (const r of rows.rows as any[]) {
      const c = Number(r.costCents) || 0;
      totalCents += c;
      const cur = byModel.get(r.modelId);
      if (cur) cur.costCents += c;
      else byModel.set(r.modelId, { modelId: r.modelId, modelName: r.modelName ?? "unknown", provider: r.provider ?? "unknown", costCents: c });
      byDay.set(r.date, (byDay.get(r.date) ?? 0) + c);
    }
    const topModels = Array.from(byModel.values()).sort((a, b) => b.costCents - a.costCents).slice(0, 3);
    const daily = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, costCents]) => ({ date, costCents }));
    const projectedMonthCents = (totalCents / daysElapsed) * daysInMonth;
    return { totalCents, projectedMonthCents, daysElapsed, daysInMonth, topModels, daily };
  }

  async getLlmSpendByTenantMtd(orgId: string): Promise<{ tenantId: string; tenantName: string; totalCents: number; byModel: { modelName: string; costCents: number }[] }[]> {
    const now = new Date();
    const monthStartStr = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
    const rows = await db.execute(sql`
      SELECT
        t.id AS "tenantId",
        t.name AS "tenantName",
        m.model_name AS "modelName",
        COALESCE(SUM(s.cost_cents), 0)::real AS "costCents"
      FROM tenants t
      LEFT JOIN llm_spend_daily s ON s.tenant_id = t.id AND s.date >= ${monthStartStr}
      LEFT JOIN llm_models m ON m.id = s.model_id
      WHERE t.organization_id = ${orgId}
      GROUP BY t.id, t.name, m.model_name
      ORDER BY t.name
    `);
    const byTenant = new Map<string, { tenantId: string; tenantName: string; totalCents: number; byModel: { modelName: string; costCents: number }[] }>();
    for (const r of rows.rows as any[]) {
      const cur = byTenant.get(r.tenantId) ?? { tenantId: r.tenantId, tenantName: r.tenantName, totalCents: 0, byModel: [] as { modelName: string; costCents: number }[] };
      const c = Number(r.costCents) || 0;
      if (r.modelName) {
        cur.byModel.push({ modelName: r.modelName, costCents: c });
        cur.totalCents += c;
      }
      byTenant.set(r.tenantId, cur);
    }
    return Array.from(byTenant.values());
  }

  async getLlmSpendBreakdown(tenantId: string, opts: { since?: Date; until?: Date; sliceBy: "model" | "agent" | "time" | "surface" }): Promise<{ key: string; label: string; costCents: number; calls: number; inputTokens: number; outputTokens: number }[]> {
    const since = opts.since ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const until = opts.until ?? new Date();
    const conditions: SQL[] = [
      eq(llmCalls.tenantId, tenantId),
      gte(llmCalls.calledAt, since),
      sql`${llmCalls.calledAt} <= ${until}`,
    ];
    let groupExpr: SQL;
    let labelExpr: SQL;
    if (opts.sliceBy === "model") {
      groupExpr = sql`c.model_id`;
      labelExpr = sql`COALESCE(m.model_name, 'unknown')`;
    } else if (opts.sliceBy === "agent") {
      groupExpr = sql`COALESCE(c.agent_id::text, 'none')`;
      labelExpr = sql`COALESCE(c.agent_name, 'unattributed')`;
    } else if (opts.sliceBy === "surface") {
      groupExpr = sql`COALESCE(c.metadata->>'surface', 'unknown')`;
      labelExpr = sql`COALESCE(c.metadata->>'surface', 'unknown')`;
    } else {
      groupExpr = sql`to_char(date_trunc('day', c.called_at), 'YYYY-MM-DD')`;
      labelExpr = sql`to_char(date_trunc('day', c.called_at), 'YYYY-MM-DD')`;
    }
    const rows = await db.execute(sql`
      SELECT
        ${groupExpr} AS "key",
        ${labelExpr} AS "label",
        COALESCE(SUM(c.cost_cents), 0)::real AS "costCents",
        COUNT(*)::int AS "calls",
        COALESCE(SUM(c.input_tokens), 0)::int AS "inputTokens",
        COALESCE(SUM(c.output_tokens), 0)::int AS "outputTokens"
      FROM llm_calls c
      LEFT JOIN llm_models m ON m.id = c.model_id
      WHERE c.tenant_id = ${tenantId} AND c.called_at >= ${since} AND c.called_at <= ${until}
      GROUP BY ${groupExpr}, ${labelExpr}
      ORDER BY ${opts.sliceBy === "time" ? sql`"key" ASC` : sql`"costCents" DESC`}
      LIMIT 200
    `);
    return (rows.rows as any[]).map(r => ({
      key: String(r.key ?? ""),
      label: String(r.label ?? ""),
      costCents: Number(r.costCents) || 0,
      calls: Number(r.calls) || 0,
      inputTokens: Number(r.inputTokens) || 0,
      outputTokens: Number(r.outputTokens) || 0,
    }));
  }

  async getActiveLlmBudgetRules(): Promise<AlertRule[]> {
    return db.select().from(alertRules)
      .where(and(eq(alertRules.alertType, "llm_budget"), eq(alertRules.enabled, true)));
  }

  async evaluateLlmBudgets(): Promise<{ rulesEvaluated: number; alertsCreated: number }> {
    // Ensure spend rollup is fresh before evaluating thresholds; otherwise a
    // manual trigger could fire on stale data.
    await this.rollupLlmSpendDaily({ sinceDays: 2 });
    const rules = await this.getActiveLlmBudgetRules();
    let alertsCreated = 0;
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthStartStr = monthStart.toISOString().slice(0, 10);
    const periodKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    for (const rule of rules) {
      const budget = rule.budgetCents ?? 0;
      if (budget <= 0) continue;
      const thresholds = (rule.thresholdPercents && rule.thresholdPercents.length > 0)
        ? rule.thresholdPercents
        : [50, 80, 100];

      const conds: SQL[] = [
        eq(llmSpendDaily.tenantId, rule.tenantId),
        gte(llmSpendDaily.date, monthStartStr),
      ];
      if (rule.modelId) conds.push(eq(llmSpendDaily.modelId, rule.modelId));
      const [agg] = await db.select({ total: sql<number>`COALESCE(SUM(${llmSpendDaily.costCents}), 0)::real` })
        .from(llmSpendDaily)
        .where(and(...conds));
      const spent = Number(agg?.total ?? 0);
      const pct = (spent / budget) * 100;

      const last = (rule.lastTriggeredThresholds ?? {}) as Record<string, number[]>;
      const fired = new Set(last[periodKey] ?? []);

      const sortedThresholds = [...thresholds].sort((a, b) => a - b);
      const overBudget = pct >= 100;
      const newlyFired: number[] = [];

      for (const t of sortedThresholds) {
        if (pct >= t && !fired.has(t)) {
          newlyFired.push(t);
          fired.add(t);
        }
      }
      if (overBudget && pct > 100 && !fired.has(101)) {
        const lastOverage = Math.floor(pct / 10) * 10;
        if (lastOverage >= 110 && !fired.has(lastOverage)) {
          newlyFired.push(lastOverage);
          fired.add(lastOverage);
        }
      }

      for (const t of newlyFired) {
        const severity = t >= 100 ? "critical" : t >= 80 ? "high" : "medium";
        const tenant = await this.getTenant(rule.tenantId);
        const dollarsSpent = (spent / 100).toFixed(2);
        const dollarsBudget = (budget / 100).toFixed(2);
        const scopeLabel = rule.modelId ? ` (model scope)` : "";
        const title = t >= 100
          ? `LLM budget exceeded${scopeLabel}: ${pct.toFixed(0)}% of $${dollarsBudget}`
          : `LLM budget at ${t}%${scopeLabel}: $${dollarsSpent} of $${dollarsBudget}`;
        let modelLabel: string | null = null;
        if (rule.modelId) {
          const [m] = await db.select().from(llmModels).where(eq(llmModels.id, rule.modelId));
          modelLabel = m ? (m.displayName || m.modelName) : null;
        }
        const createdAlert = await this.createAlert({
          tenantId: rule.tenantId,
          ruleId: rule.id,
          alertType: "llm_budget",
          severity,
          title,
          message: `${tenant?.name ?? "Tenant"} has spent $${dollarsSpent} of the $${dollarsBudget} monthly LLM budget (${pct.toFixed(1)}%).`,
          streamKey: `llm_budget:${rule.id}`,
          payload: {
            ruleId: rule.id,
            ruleName: rule.name,
            thresholdPercent: t,
            spentCents: spent,
            budgetCents: budget,
            percent: pct,
            periodKey,
            modelId: rule.modelId ?? null,
            channels: rule.channels ?? [],
          },
        });
        alertsCreated++;

        const channels = (rule.channels ?? []) as { type: string; target: string }[];
        if (channels.length > 0) {
          try {
            const results = await sendBudgetAlertNotifications({
              alert: createdAlert,
              rule,
              tenant,
              thresholdPercent: t,
              spentCents: spent,
              budgetCents: budget,
              percent: pct,
              modelLabel,
            });
            const failures = results.filter(r => !r.delivered);
            if (failures.length > 0) {
              console.warn(
                `[LlmBudget] Notification delivery issues for rule ${rule.id} threshold ${t}%:`,
                failures.map(f => `${f.channel}:${f.target} (${f.message})`).join("; "),
              );
            }
            const enriched = {
              ...((createdAlert.payload as Record<string, unknown>) ?? {}),
              notifications: results.map(r => ({
                channel: r.channel,
                target: r.target,
                delivered: r.delivered,
                message: r.message,
              })),
            };
            await this.updateAlertPayload(createdAlert.id, enriched);
          } catch (err) {
            console.error(`[LlmBudget] Failed to dispatch notifications for rule ${rule.id}:`, err);
          }
        }
      }

      if (newlyFired.length > 0) {
        const updated: Record<string, number[]> = { ...last, [periodKey]: Array.from(fired).sort((a, b) => a - b) };
        await db.update(alertRules).set({ lastTriggeredThresholds: updated }).where(eq(alertRules.id, rule.id));
      }
    }
    return { rulesEvaluated: rules.length, alertsCreated };
  }

  async getActiveFoundryThrottleRules(tenantId?: string): Promise<AlertRule[]> {
    const conds: SQL[] = [
      eq(alertRules.alertType, "foundry_throttle"),
      eq(alertRules.enabled, true),
    ];
    if (tenantId) conds.push(eq(alertRules.tenantId, tenantId));
    return db.select().from(alertRules).where(and(...conds));
  }

  async evaluateFoundryThrottleRules(tenantId?: string): Promise<{ rulesEvaluated: number; alertsCreated: number }> {
    const rules = await this.getActiveFoundryThrottleRules(tenantId);
    let alertsCreated = 0;
    const dedupSince = new Date(Date.now() - 60 * 60 * 1000);

    for (const rule of rules) {
      const threshold = rule.threshold ?? 0;
      if (threshold <= 0) continue;

      const latest = await this.getLatestFoundryUsageByDeployment(rule.tenantId, 24);
      const deploymentIds = Object.keys(latest);
      if (deploymentIds.length === 0) continue;

      for (const deploymentId of deploymentIds) {
        const snap = latest[deploymentId];
        if (!snap || !snap.windowHours) continue;
        const throttled = Number(snap.throttledCalls ?? 0);
        if (!Number.isFinite(throttled) || throttled <= 0) continue;
        const perHour = throttled / snap.windowHours;
        if (perHour < threshold) continue;

        const streamKey = `foundry_throttle:${rule.id}:${deploymentId}`;
        const recent = await db.select().from(alerts)
          .where(and(
            eq(alerts.tenantId, rule.tenantId),
            eq(alerts.alertType, "foundry_throttle"),
            eq(alerts.ruleId, rule.id),
            eq(alerts.streamKey, streamKey),
            gte(alerts.timestamp, dedupSince),
          ))
          .limit(1);
        if (recent.length > 0) continue;

        const deployment = await this.getFoundryDeployment(deploymentId);
        const depLabel = deployment
          ? `${deployment.deploymentName} (${deployment.accountName})`
          : deploymentId;
        const totalCalls = Number(snap.totalCalls ?? 0);
        const throttlePct = totalCalls > 0 ? (throttled / totalCalls) * 100 : 0;
        const severity = perHour >= threshold * 4 ? "critical" : perHour >= threshold * 2 ? "high" : "warning";

        await this.createAlert({
          tenantId: rule.tenantId,
          ruleId: rule.id,
          alertType: "foundry_throttle",
          severity,
          title: `Foundry deployment throttling: ${depLabel}`,
          message: `${depLabel} is throttling at ~${perHour.toFixed(1)} HTTP 429 calls/hour over the last 24h (${throttled.toFixed(0)} total, ${throttlePct.toFixed(1)}% of ${totalCalls.toFixed(0)} calls). Threshold: ${threshold}/hour.`,
          streamKey,
          payload: {
            ruleId: rule.id,
            ruleName: rule.name,
            deploymentId,
            deploymentName: deployment?.deploymentName ?? null,
            accountName: deployment?.accountName ?? null,
            modelName: deployment?.modelName ?? null,
            throttledCalls: throttled,
            totalCalls,
            throttledPerHour: perHour,
            throttledPercent: throttlePct,
            windowHours: snap.windowHours,
            windowEnd: snap.windowEnd,
            threshold,
            channels: rule.channels ?? [],
          },
        });
        alertsCreated++;
      }
    }
    return { rulesEvaluated: rules.length, alertsCreated };
  }

  async getActiveCopilotSurfaceRules(): Promise<AlertRule[]> {
    return db.select().from(alertRules)
      .where(and(eq(alertRules.alertType, "copilot_surface"), eq(alertRules.enabled, true)));
  }

  async evaluateCopilotSurfaceAlerts(): Promise<{ rulesEvaluated: number; alertsCreated: number; alertsResolved: number }> {
    const rules = await this.getActiveCopilotSurfaceRules();
    let alertsCreated = 0;
    let alertsResolved = 0;
    const windowMinutes = 60;
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);

    const statsCache = new Map<string, Awaited<ReturnType<typeof this.getCopilotModelStats>>>();
    const getStats = async (tenantId: string) => {
      let s = statsCache.get(tenantId);
      if (!s) {
        s = await this.getCopilotModelStats(tenantId, since);
        statsCache.set(tenantId, s);
      }
      return s;
    };

    for (const rule of rules) {
      const metric = rule.metric as "copilot_p95_latency_ms" | "copilot_empty_response_rate";
      if (metric !== "copilot_p95_latency_ms" && metric !== "copilot_empty_response_rate") continue;

      const stats = await getStats(rule.tenantId);
      const surfaceFilter = rule.streamKey && rule.streamKey !== "__all__" ? rule.streamKey : null;

      let observed = 0;
      let sampleCount = 0;
      if (surfaceFilter) {
        const row = stats.bySurface.find(s => s.surface === surfaceFilter);
        if (row) {
          sampleCount = row.responseCalls;
          observed = metric === "copilot_p95_latency_ms" ? row.p95LatencyMs : row.emptyResponseRate * 100;
        }
      } else {
        sampleCount = stats.totalResponses;
        observed = metric === "copilot_p95_latency_ms" ? stats.p95LatencyMs : stats.emptyResponseRate * 100;
      }

      const minSamples = metric === "copilot_p95_latency_ms" ? 5 : 10;
      const streamKey = `copilot_surface:${rule.id}`;
      const [latest] = await db.select().from(alerts)
        .where(and(
          eq(alerts.tenantId, rule.tenantId),
          eq(alerts.alertType, "copilot_surface"),
          eq(alerts.streamKey, streamKey),
        ))
        .orderBy(desc(alerts.timestamp))
        .limit(1);
      const latestPayload = (latest?.payload ?? null) as CopilotSurfaceAlertPayload | null;
      const isOpen = latestPayload?.state === "open";

      if (sampleCount < minSamples) {
        if (isOpen && latest) {
          const resolved: CopilotSurfaceAlertPayload = {
            ...latestPayload!,
            state: "resolved",
            observed,
            sampleCount,
            resolvedAt: new Date().toISOString(),
          };
          await this.updateAlertPayload(latest.id, resolved);
          alertsResolved++;
        }
        continue;
      }

      const breached = observed > rule.threshold;
      const tenant = await this.getTenant(rule.tenantId);
      const surfaceLabel = surfaceFilter ?? "all surfaces";
      const formatObserved = metric === "copilot_p95_latency_ms"
        ? `${Math.round(observed)}ms`
        : `${observed.toFixed(1)}%`;
      const formatThreshold = metric === "copilot_p95_latency_ms"
        ? `${rule.threshold}ms`
        : `${rule.threshold}%`;
      const metricLabel = metric === "copilot_p95_latency_ms" ? "P95 latency" : "Empty response rate";

      if (breached && !isOpen) {
        const severity = metric === "copilot_p95_latency_ms"
          ? (observed > rule.threshold * 3 ? "critical" : observed > rule.threshold * 1.5 ? "high" : "warning")
          : (observed > rule.threshold * 2 ? "critical" : observed > rule.threshold * 1.25 ? "high" : "warning");
        const payload: CopilotSurfaceAlertPayload = {
          ruleId: rule.id,
          ruleName: rule.name,
          metric,
          surface: surfaceFilter,
          threshold: rule.threshold,
          observed,
          windowMinutes,
          sampleCount,
          state: "open",
          channels: rule.channels ?? [],
          firstSeenAt: new Date().toISOString(),
        };
        await this.createAlert({
          tenantId: rule.tenantId,
          ruleId: rule.id,
          alertType: "copilot_surface",
          severity,
          title: `Copilot ${metricLabel} elevated on ${surfaceLabel}`,
          message: `${tenant?.name ?? "Tenant"}: ${metricLabel} on ${surfaceLabel} is ${formatObserved} (threshold ${formatThreshold}) over the last ${windowMinutes}m across ${sampleCount} samples.`,
          streamKey,
          payload: payload as unknown as Record<string, unknown>,
        });
        alertsCreated++;
      } else if (!breached && isOpen && latest) {
        const resolved: CopilotSurfaceAlertPayload = {
          ...latestPayload!,
          state: "resolved",
          observed,
          sampleCount,
          resolvedAt: new Date().toISOString(),
        };
        await this.updateAlertPayload(latest.id, resolved);
        alertsResolved++;
      }
    }

    return { rulesEvaluated: rules.length, alertsCreated, alertsResolved };
  }

  async countSavedViewMatches(pageKey: string, tenantId: string, filtersJson: Record<string, any>): Promise<number> {
    const f = filtersJson || {};
    const datePresetCutoff = (preset: string | undefined): Date | null => {
      if (preset === "today") return new Date(Date.now() - 24 * 60 * 60 * 1000);
      if (preset === "this_week") return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      return null;
    };
    const runCount = async (table: any, conditions: any[]): Promise<number> => {
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const [row] = await db.select({ total: sql<number>`count(*)` }).from(table).where(where);
      return Number(row?.total ?? 0);
    };

    switch (pageKey) {
      case "agent-traces": {
        const conds: any[] = [eq(agentTraces.tenantId, tenantId)];
        if (f.platformFilter && f.platformFilter !== "all") conds.push(eq(agentTraces.platform, f.platformFilter));
        if (f.statusFilter && f.statusFilter !== "all") conds.push(eq(agentTraces.status, f.statusFilter));
        if (f.agentSearch) conds.push(ilike(agentTraces.agentName, `%${f.agentSearch}%`));
        const cutoff = datePresetCutoff(f.datePreset);
        if (cutoff) conds.push(gte(agentTraces.startedAt, cutoff));
        return runCount(agentTraces, conds);
      }
      case "entra-signins": {
        const conds: any[] = [eq(entraSignIns.tenantId, tenantId)];
        if (f.statusFilter && f.statusFilter !== "all") conds.push(eq(entraSignIns.status, f.statusFilter));
        if (f.riskFilter && f.riskFilter !== "all") conds.push(eq(entraSignIns.riskLevel, f.riskFilter));
        if (f.appFilter && f.appFilter !== "all") conds.push(eq(entraSignIns.appDisplayName, f.appFilter));
        if (f.searchQuery) {
          const q = `%${f.searchQuery}%`;
          conds.push(or(
            ilike(entraSignIns.userPrincipalName, q),
            ilike(entraSignIns.userDisplayName, q),
            ilike(entraSignIns.ipAddress, q),
            ilike(entraSignIns.appDisplayName, q),
          ));
        }
        const cutoff = datePresetCutoff(f.datePreset);
        if (cutoff) conds.push(gte(entraSignIns.signInAt, cutoff));
        return runCount(entraSignIns, conds);
      }
      case "llm-calls": {
        const conds: any[] = [eq(llmCalls.tenantId, tenantId)];
        if (f.agentFilter && f.agentFilter !== "all") conds.push(eq(llmCalls.agentId, f.agentFilter));
        if (f.errorClass && f.errorClass !== "all") conds.push(eq(llmCalls.errorClass, f.errorClass));
        const cutoff = datePresetCutoff(f.datePreset);
        if (cutoff) conds.push(gte(llmCalls.calledAt, cutoff));
        return runCount(llmCalls, conds);
      }
      case "mcp-tool-calls": {
        const conds: any[] = [eq(mcpToolCalls.tenantId, tenantId)];
        if (f.toolCallFilter && f.toolCallFilter !== "all") conds.push(eq(mcpToolCalls.status, f.toolCallFilter));
        return runCount(mcpToolCalls, conds);
      }
      case "copilot-sessions": {
        const conds: any[] = [eq(copilotInteractions.tenantId, tenantId)];
        if (f.appFilter && f.appFilter !== "all") conds.push(eq(copilotInteractions.appClass, f.appFilter));
        if (f.userSearch) {
          const q = `%${f.userSearch}%`;
          conds.push(or(
            ilike(copilotInteractions.userName, q),
            ilike(copilotInteractions.userId, q),
          ));
        }
        if (f.dateFrom) conds.push(gte(copilotInteractions.createdAt, new Date(f.dateFrom)));
        if (f.dateTo) conds.push(sql`${copilotInteractions.createdAt} <= ${new Date(f.dateTo)}`);
        const where = and(...conds);
        const [row] = await db
          .select({ total: sql<number>`count(distinct ${copilotInteractions.sessionId})` })
          .from(copilotInteractions)
          .where(where);
        return Number(row?.total ?? 0);
      }
      default:
        return 0;
    }
  }
}

export const storage = new DatabaseStorage();
