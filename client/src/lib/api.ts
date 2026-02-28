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
  return useMutation({ mutationFn: ({ id, ...data }: any) => patchJson(`/api/tenants/${id}`, data), onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/tenants"] }) });
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

export function useMetrics(tenantId: string | null) {
  return useQuery<Metric[]>({ queryKey: ["/api/tenants", tenantId, "metrics"], queryFn: () => fetchJson(`/api/tenants/${tenantId}/metrics`), enabled: !!tenantId, refetchInterval: 30000 });
}

export function useLatestMetrics(tenantId: string | null, limit = 10) {
  return useQuery<Metric[]>({ queryKey: ["/api/tenants", tenantId, "metrics", "latest", limit], queryFn: () => fetchJson(`/api/tenants/${tenantId}/metrics/latest?limit=${limit}`), enabled: !!tenantId });
}

export function useMetricsSummary(tenantId: string | null) {
  return useQuery<{ avgLatency: number; errorCount: number; totalTests: number }>({ queryKey: ["/api/tenants", tenantId, "metrics", "summary"], queryFn: () => fetchJson(`/api/tenants/${tenantId}/metrics/summary`), enabled: !!tenantId });
}

export function useAlerts(tenantId?: string) {
  const url = tenantId ? `/api/alerts?tenantId=${tenantId}` : "/api/alerts";
  return useQuery<Alert[]>({ queryKey: ["/api/alerts", tenantId], queryFn: () => fetchJson(url) });
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
