import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryClient } from "./queryClient";
import type { Organization, Tenant, MonitoredSystem, SyntheticTest, AlertRule, Metric, Alert, TestRun } from "@shared/schema";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function deleteJson(url: string): Promise<void> {
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

async function patchJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function deleteReq(url: string): Promise<void> {
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

export interface OrgContext {
  organization: Organization;
  tenants: Tenant[];
  isMsp: boolean;
  allOrganizations: Organization[];
}

export function useOrgContext(orgId?: string | null) {
  const url = orgId ? `/api/organizations/active?orgId=${orgId}` : "/api/organizations/active";
  return useQuery<OrgContext>({ queryKey: ["/api/organizations/active", orgId || null], queryFn: () => fetchJson(url) });
}

export function useTenants() {
  return useQuery<Tenant[]>({ queryKey: ["/api/tenants"], queryFn: () => fetchJson("/api/tenants") });
}

export function useTenant(id: string | null) {
  return useQuery<Tenant>({ queryKey: ["/api/tenants", id], queryFn: () => fetchJson(`/api/tenants/${id}`), enabled: !!id });
}

export function useCreateTenant() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (data: any) => postJson("/api/tenants", data), onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/tenants"] }) });
}

export function useUpdateTenant() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, ...data }: any) => patchJson(`/api/tenants/${id}`, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/tenants"] }); qc.invalidateQueries({ queryKey: ["/api/organizations/active"] }); } });
}

export function useDeleteTenant() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => deleteJson(`/api/tenants/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/tenants"] }); qc.invalidateQueries({ queryKey: ["/api/organizations/active"] }); } });
}

export function useConsentTenant() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => postJson(`/api/tenants/${id}/consent`, {}), onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/tenants"] }); qc.invalidateQueries({ queryKey: ["/api/organizations/active"] }); } });
}

export function useRevokeConsent() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => postJson(`/api/tenants/${id}/revoke-consent`, {}), onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/tenants"] }); qc.invalidateQueries({ queryKey: ["/api/organizations/active"] }); } });
}

export function useAllSystems() {
  return useQuery<MonitoredSystem[]>({ queryKey: ["/api/systems"], queryFn: () => fetchJson("/api/systems") });
}

export function useTenantSystems(tenantId: string | null) {
  return useQuery<MonitoredSystem[]>({ queryKey: ["/api/tenants", tenantId, "systems"], queryFn: () => fetchJson(`/api/tenants/${tenantId}/systems`), enabled: !!tenantId });
}

export function useCreateSystem() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (data: any) => postJson("/api/systems", data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/systems"] }); qc.invalidateQueries({ queryKey: ["/api/tenants"] }); } });
}

export function useSyntheticTests(tenantId: string | null) {
  return useQuery<SyntheticTest[]>({ queryKey: ["/api/tenants", tenantId, "tests"], queryFn: () => fetchJson(`/api/tenants/${tenantId}/tests`), enabled: !!tenantId });
}

export function useCreateTest() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (data: any) => postJson("/api/tests", data), onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/tenants"] }) });
}

export function useUpdateTest() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, ...data }: any) => patchJson(`/api/tests/${id}`, data), onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/tenants"] }) });
}

export function useDeleteTest() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => deleteReq(`/api/tests/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/tenants"] }) });
}

export function useAlertRules(tenantId: string | null) {
  return useQuery<AlertRule[]>({ queryKey: ["/api/tenants", tenantId, "alert-rules"], queryFn: () => fetchJson(`/api/tenants/${tenantId}/alert-rules`), enabled: !!tenantId });
}

export function useCreateAlertRule() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (data: any) => postJson("/api/alert-rules", data), onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/tenants"] }) });
}

export function useUpdateAlertRule() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, ...data }: any) => patchJson(`/api/alert-rules/${id}`, data), onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/tenants"] }) });
}

export function useDeleteAlertRule() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => deleteReq(`/api/alert-rules/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/tenants"] }) });
}

export function useLlmModels(tenantId: string | null) {
  return useQuery<{ id: string; modelName: string; displayName: string | null; provider: string }[]>({
    queryKey: ["/api/tenants", tenantId, "llm-models"],
    queryFn: () => fetchJson(`/api/tenants/${tenantId}/llm-models`),
    enabled: !!tenantId,
  });
}

export function useMetrics(tenantId: string | null) {
  return useQuery<Metric[]>({ queryKey: ["/api/tenants", tenantId, "metrics"], queryFn: () => fetchJson(`/api/tenants/${tenantId}/metrics`), enabled: !!tenantId, refetchInterval: 30000 });
}

export function useLatestMetrics(tenantId: string | null, limit = 10) {
  return useQuery<Metric[]>({ queryKey: ["/api/tenants", tenantId, "metrics", "latest", limit], queryFn: () => fetchJson(`/api/tenants/${tenantId}/metrics/latest?limit=${limit}`), enabled: !!tenantId });
}

export function useMetricsSummary(tenantId: string | null) {
  return useQuery<{ avgLatency: number; errorCount: number; totalTests: number }>({ queryKey: ["/api/tenants", tenantId, "metrics", "summary"], queryFn: () => fetchJson(`/api/tenants/${tenantId}/metrics/summary`), enabled: !!tenantId });
}

export function useAlerts(tenantId?: string, filters?: { alertType?: string; streamKey?: string }) {
  const params = new URLSearchParams();
  if (tenantId) params.set("tenantId", tenantId);
  if (filters?.alertType) params.set("alertType", filters.alertType);
  if (filters?.streamKey) params.set("streamKey", filters.streamKey);
  const qs = params.toString();
  const url = `/api/alerts${qs ? `?${qs}` : ""}`;
  return useQuery<Alert[]>({ queryKey: ["/api/alerts", tenantId, filters?.alertType, filters?.streamKey], queryFn: () => fetchJson(url), refetchInterval: 90000 });
}

export interface AnomalyStreamConfigUI {
  key: string;
  label: string;
  unit: string;
  category: string;
  higherIsWorse: boolean;
  enabled: boolean;
  sensitivity: number;
  configId: string | null;
}

export function useAnomalyStreamConfigs(tenantId: string | null) {
  return useQuery<AnomalyStreamConfigUI[]>({
    queryKey: ["/api/tenants", tenantId, "anomaly", "configs"],
    queryFn: () => fetchJson(`/api/tenants/${tenantId}/anomaly/configs`),
    enabled: !!tenantId,
  });
}

export function useUpdateAnomalyStreamConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tenantId, streamKey, sensitivity, enabled }: { tenantId: string; streamKey: string; sensitivity: number; enabled: boolean }) => {
      return fetch(`/api/tenants/${tenantId}/anomaly/configs/${streamKey}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sensitivity, enabled }),
      }).then(r => { if (!r.ok) throw new Error("Failed"); return r.json(); });
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/tenants", vars.tenantId, "anomaly", "configs"] });
    },
  });
}

export interface MetricBaselinePoint {
  id: string;
  tenantId: string;
  streamKey: string;
  windowStart: string;
  mean: number;
  stddev: number;
  p50: number;
  p95: number;
  sampleCount: number;
  current: number;
  zScore: number;
}

export function useMetricBaselineHistory(tenantId: string | null, streamKey: string | null, sinceHours = 168) {
  return useQuery<MetricBaselinePoint[]>({
    queryKey: ["/api/tenants", tenantId, "anomaly", "baselines", streamKey, sinceHours],
    queryFn: () => fetchJson(`/api/tenants/${tenantId}/anomaly/baselines/${streamKey}?sinceHours=${sinceHours}`),
    enabled: !!tenantId && !!streamKey,
  });
}

export interface AnomalyContextItem {
  kind: "admin_audit" | "service_health" | "tenant_audit";
  id: string;
  timestamp: string;
  title: string;
  detail?: string;
  deltaMinutes: number;
}

export interface AnomalyContextResponse {
  alertId: string;
  windowStart: string;
  windowEnd: string;
  items: AnomalyContextItem[];
  counts: { adminAudit: number; serviceHealth: number; tenantAudit: number; total: number };
}

export function useAlertContext(alertId: string | null, enabled = true) {
  return useQuery<AnomalyContextResponse>({
    queryKey: ["/api/alerts", alertId, "context"],
    queryFn: () => fetchJson(`/api/alerts/${alertId}/context`),
    enabled: !!alertId && enabled,
    staleTime: 60000,
  });
}

export interface AnomalyNotificationSettingsUI {
  tenantId: string;
  emailEnabled: boolean;
  emailRecipients: string[];
  emailSeverities: string[];
  teamsEnabled: boolean;
  teamsWebhookUrl: string | null;
  teamsSeverities: string[];
}

export function useAnomalyNotificationSettings(tenantId: string | null) {
  return useQuery<AnomalyNotificationSettingsUI>({
    queryKey: ["/api/tenants", tenantId, "anomaly", "notifications"],
    queryFn: () => fetchJson(`/api/tenants/${tenantId}/anomaly/notifications`),
    enabled: !!tenantId,
  });
}

export function useUpdateAnomalyNotificationSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tenantId, ...patch }: { tenantId: string } & Partial<AnomalyNotificationSettingsUI>) => {
      return fetch(`/api/tenants/${tenantId}/anomaly/notifications`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }).then(async r => {
        if (!r.ok) throw new Error(await r.text());
        return r.json();
      });
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/tenants", vars.tenantId, "anomaly", "notifications"] });
    },
  });
}

export function useAnomalyCount(tenantId: string | null, hours = 24) {
  return useQuery<{ count: number; sinceHours: number }>({
    queryKey: ["/api/tenants", tenantId, "anomaly", "count", hours],
    queryFn: () => fetchJson(`/api/tenants/${tenantId}/anomaly/count?hours=${hours}`),
    enabled: !!tenantId,
    refetchInterval: 60000,
  });
}

export interface LlmSpendMtd {
  totalCents: number;
  projectedMonthCents: number;
  daysElapsed: number;
  daysInMonth: number;
  topModels: { modelId: string; modelName: string; provider: string; costCents: number }[];
  daily: { date: string; costCents: number }[];
}

export function useLlmSpendMtd(tenantId: string | null) {
  return useQuery<LlmSpendMtd>({
    queryKey: ["/api/tenants", tenantId, "llm-spend", "mtd"],
    queryFn: () => fetchJson(`/api/tenants/${tenantId}/llm-spend/mtd`),
    enabled: !!tenantId,
    refetchInterval: 5 * 60 * 1000,
  });
}

export interface LlmSpendByTenant {
  tenantId: string;
  tenantName: string;
  totalCents: number;
  byModel: { modelName: string; costCents: number }[];
}

export function useLlmSpendByTenant(orgId: string | null) {
  return useQuery<LlmSpendByTenant[]>({
    queryKey: ["/api/orgs", orgId, "llm-spend", "by-tenant"],
    queryFn: () => fetchJson(`/api/orgs/${orgId}/llm-spend/by-tenant`),
    enabled: !!orgId,
    refetchInterval: 5 * 60 * 1000,
  });
}

export interface LlmSpendBreakdownRow {
  key: string;
  label: string;
  costCents: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

export function useLlmSpendExplorer(tenantId: string | null, sliceBy: "model" | "agent" | "time" | "surface", sinceHours = 30 * 24) {
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000).toISOString();
  return useQuery<{ sliceBy: string; breakdown: LlmSpendBreakdownRow[] }>({
    queryKey: ["/api/tenants", tenantId, "llm-spend", "explorer", sliceBy, sinceHours],
    queryFn: () => fetchJson(`/api/tenants/${tenantId}/llm-spend/explorer?sliceBy=${sliceBy}&since=${encodeURIComponent(since)}`),
    enabled: !!tenantId,
  });
}

export function useAcknowledgeAlert() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => patchJson(`/api/alerts/${id}/acknowledge`, {}), onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/alerts"] }) });
}

export function useGlobalStats() {
  return useQuery<{ totalTenants: number; activeIncidents: number; totalTests24h: number }>({ queryKey: ["/api/stats"], queryFn: () => fetchJson("/api/stats") });
}

export function useSharePointStatus() {
  return useQuery<{ connected: boolean }>({ queryKey: ["/api/sharepoint/status"], queryFn: () => fetchJson("/api/sharepoint/status"), refetchInterval: 60000 });
}

export function useRunTest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (testId: string) => postJson(`/api/tests/${testId}/run`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/tests"] });
      qc.invalidateQueries({ queryKey: ["/api/tenants"] });
    },
  });
}

export function useTestRuns(testId: string | null) {
  return useQuery<TestRun[]>({ queryKey: ["/api/tests", testId, "runs"], queryFn: () => fetchJson(`/api/tests/${testId}/runs`), enabled: !!testId, refetchInterval: 5000 });
}

export function useTenantTestRuns(tenantId: string | null) {
  return useQuery<TestRun[]>({ queryKey: ["/api/tenants", tenantId, "test-runs"], queryFn: () => fetchJson(`/api/tenants/${tenantId}/test-runs`), enabled: !!tenantId });
}

export function useAllTests() {
  return useQuery<SyntheticTest[]>({ queryKey: ["/api/all-tests"], queryFn: () => fetchJson("/api/all-tests") });
}

export function useSchedulerStatus() {
  return useQuery<Record<string, { lastRun: string | null; isRunning: boolean; nextRun: string | null; activeJobRunId: string | null }>>({
    queryKey: ["/api/scheduler/status"],
    queryFn: () => fetchJson("/api/scheduler/status"),
    refetchInterval: 5000,
  });
}

export function useSchedulerJobRuns(filters?: { jobType?: string; tenantId?: string; limit?: number }) {
  const params = new URLSearchParams();
  if (filters?.jobType) params.set("jobType", filters.jobType);
  if (filters?.tenantId) params.set("tenantId", filters.tenantId);
  if (filters?.limit) params.set("limit", String(filters.limit));
  const url = `/api/scheduler/job-runs?${params.toString()}`;
  return useQuery<any[]>({
    queryKey: ["/api/scheduler/job-runs", filters?.jobType, filters?.tenantId, filters?.limit],
    queryFn: () => fetchJson(url),
    refetchInterval: 10000,
  });
}

export function useTriggerJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobType: string) => postJson(`/api/scheduler/trigger?jobType=${jobType}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/scheduler/status"] });
      qc.invalidateQueries({ queryKey: ["/api/scheduler/job-runs"] });
    },
  });
}

export function useCancelJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobType: string) => postJson(`/api/scheduler/cancel/${jobType}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/scheduler/status"] });
      qc.invalidateQueries({ queryKey: ["/api/scheduler/job-runs"] });
    },
  });
}

export function useResetJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobType: string) => postJson(`/api/scheduler/reset/${jobType}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/scheduler/status"] });
      qc.invalidateQueries({ queryKey: ["/api/scheduler/job-runs"] });
    },
  });
}

export function useAzureAppStatus() {
  return useQuery<{ configured: boolean; clientId: string | null; requiredPermissions: string[] }>({
    queryKey: ["/api/auth/azure-app-status"],
    queryFn: () => fetchJson("/api/auth/azure-app-status"),
  });
}

export function useConsentUrl(tenantId: string | null) {
  return useQuery<{ consentUrl: string; redirectUri: string }>({
    queryKey: ["/api/auth/consent-url", tenantId],
    queryFn: () => fetchJson(`/api/auth/consent-url?tenantId=${tenantId}`),
    enabled: !!tenantId,
  });
}

export function useAdminAuditLog(tenantId?: string, limit?: number) {
  const params = new URLSearchParams();
  if (tenantId) params.set("tenantId", tenantId);
  if (limit) params.set("limit", String(limit));
  return useQuery<any[]>({
    queryKey: ["/api/admin-audit", tenantId, limit],
    queryFn: () => fetchJson(`/api/admin-audit?${params.toString()}`),
  });
}

export function useUsageReports(tenantId: string | null, reportType?: string) {
  const params = new URLSearchParams();
  if (reportType) params.set("reportType", reportType);
  return useQuery<any[]>({
    queryKey: ["/api/tenants", tenantId, "usage-reports", reportType],
    queryFn: () => fetchJson(`/api/tenants/${tenantId}/usage-reports?${params.toString()}`),
    enabled: !!tenantId,
  });
}

export function useLatestUsageReport(tenantId: string | null, reportType: string) {
  return useQuery<any>({
    queryKey: ["/api/tenants", tenantId, "usage-reports", "latest", reportType],
    queryFn: () => fetchJson(`/api/tenants/${tenantId}/usage-reports/latest?reportType=${reportType}`),
    enabled: !!tenantId && !!reportType,
  });
}

export function useServiceHealth() {
  return useQuery<any[]>({
    queryKey: ["/api/service-health"],
    queryFn: () => fetchJson("/api/service-health"),
    refetchInterval: 60000,
  });
}

export function useServiceHealthIncidents(tenantId?: string, status?: string) {
  const params = new URLSearchParams();
  if (tenantId) params.set("tenantId", tenantId);
  if (status) params.set("status", status);
  return useQuery<any[]>({
    queryKey: ["/api/service-health/incidents", tenantId, status],
    queryFn: () => fetchJson(`/api/service-health/incidents?${params.toString()}`),
  });
}

export function useAuditLogEntries(tenantId: string | null, operation?: string, limit?: number) {
  const params = new URLSearchParams();
  if (operation) params.set("operation", operation);
  if (limit) params.set("limit", String(limit));
  return useQuery<any[]>({
    queryKey: ["/api/tenants", tenantId, "audit-log", operation, limit],
    queryFn: () => fetchJson(`/api/tenants/${tenantId}/audit-log?${params.toString()}`),
    enabled: !!tenantId,
  });
}

export function useAuditLogStats(tenantId: string | null) {
  return useQuery<any>({
    queryKey: ["/api/tenants", tenantId, "audit-log", "stats"],
    queryFn: () => fetchJson(`/api/tenants/${tenantId}/audit-log/stats`),
    enabled: !!tenantId,
  });
}
