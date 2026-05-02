import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLiveStream, type LiveEvent } from "@/lib/liveStream";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Brain,
  Activity,
  Zap,
  AlertTriangle,
  DollarSign,
  Gauge,
  Loader2,
  Database,
  RefreshCw,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Key,
  KeyRound,
  Cloud,
  ShieldAlert,
  Download,
  Search,
  X,
} from "lucide-react";
import { useActiveTenant } from "@/lib/tenant-context";
import { SavedViews } from "@/components/SavedViews";
import { useUrlWindow } from "@/lib/use-url-window";
import { WindowFilterBadge } from "@/components/WindowFilterBadge";
import { ExportMenu } from "@/components/ExportMenu";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface LlmModel {
  id: string;
  provider: string;
  modelName: string;
  displayName: string | null;
  deploymentName: string | null;
  endpoint: string | null;
  apiKeyEnvVar: string | null;
  inputCostPerMtok: number | null;
  outputCostPerMtok: number | null;
  maxContextTokens: number | null;
  status: string;
  lastHealthCheck: string | null;
}

interface LlmCall {
  id: string;
  modelId: string;
  agentId: string | null;
  agentName: string | null;
  durationMs: number | null;
  ttftMs: number | null;
  tokensPerSec: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costCents: number | null;
  status: string;
  errorClass: string | null;
  errorMessage: string | null;
  calledAt: string;
}

interface LlmStats {
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
}

interface KnownAgent { id: string; name: string; source: string; platform: string }

interface FoundryDeploymentUsage {
  windowHours: number;
  windowEnd: string;
  processedPromptTokens: number;
  generatedTokens: number;
  totalCalls: number;
  throttledCalls: number;
  inferredCostCents: number | null;
}

interface FoundryDeployment {
  id: string;
  subscriptionId: string;
  subscriptionName: string | null;
  resourceGroup: string;
  accountName: string;
  accountKind: string | null;
  endpoint: string | null;
  region: string | null;
  deploymentName: string;
  modelName: string | null;
  modelVersion: string | null;
  skuName: string | null;
  skuCapacity: number | null;
  provisioningState: string | null;
  llmModelId: string | null;
  lastSeenAt: string;
  usage24h: FoundryDeploymentUsage | null;
  usage7d: FoundryDeploymentUsage | null;
  usage30d: FoundryDeploymentUsage | null;
}

interface FoundryWindowedUsage {
  deploymentId: string;
  window24h: FoundryDeploymentUsage | null;
  window7d: FoundryDeploymentUsage | null;
  window30d: FoundryDeploymentUsage | null;
}

interface ModelDetail extends LlmModel {
  apiKeyConfigured?: boolean;
  foundryUsage?: FoundryWindowedUsage | null;
}

interface FoundryDiscoveryResponse {
  deploymentsDiscovered: number;
  accountsScanned: number;
  subscriptionsScanned: number;
  metricsCollected: number;
  needsConsent: boolean;
  consentReason: string | null;
  errors: string[];
}

function formatCost(cents: number): string {
  if (cents === 0) return "$0.00";
  if (cents < 0.01) return "<$0.0001";
  if (cents < 100) return `$${(cents / 100).toFixed(4)}`;
  return `$${(cents / 100).toFixed(2)}`;
}

function formatMs(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-green-500",
    success: "bg-green-500",
    degraded: "bg-amber-500",
    error: "bg-red-500",
    unknown: "bg-slate-400",
  };
  return <span className={`inline-block h-2 w-2 rounded-full ${colors[status] ?? "bg-slate-400"}`} />;
}

export default function LlmPerformance() {
  const queryClient = useQueryClient();
  const { activeTenantId, activeOrgId, organization } = useActiveTenant();
  const orgId = organization?.id ?? activeOrgId;
  const { since: windowSince } = useUrlWindow();
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [errorClassFilter, setErrorClassFilter] = useState<string>("all");
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);
  const [highlightCallId, setHighlightCallId] = useState<string | null>(null);
  const callRowRefs = useRef<Map<string, HTMLTableRowElement | null>>(new Map());
  const [foundryPanelOpen, setFoundryPanelOpen] = useState(false);
  const [discoveryResult, setDiscoveryResult] = useState<FoundryDiscoveryResponse | null>(null);

  useEffect(() => {
    const search = typeof window !== "undefined" ? window.location.search : "";
    const params = new URLSearchParams(search);
    const m = params.get("modelId");
    const c = params.get("callId");
    if (m) setExpandedModelId(m);
    if (c) setHighlightCallId(c);
  }, []);

  const { data: pinnedCall } = useQuery<LlmCall>({
    queryKey: ["/api/llm-calls/by-id", activeTenantId, highlightCallId],
    enabled: !!activeTenantId && !!highlightCallId,
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${activeTenantId}/llm-calls/${highlightCallId}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    staleTime: 60000,
  });

  useEffect(() => {
    if (pinnedCall?.modelId && !expandedModelId) {
      setExpandedModelId(pinnedCall.modelId);
    }
  }, [pinnedCall?.modelId, expandedModelId]);

  const { data: models = [] } = useQuery<LlmModel[]>({
    queryKey: ["/api/llm-models", activeTenantId],
    enabled: !!activeTenantId,
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${activeTenantId}/llm-models`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    refetchInterval: 90000,
  });

  const { data: agents = [] } = useQuery<KnownAgent[]>({
    queryKey: ["/api/known-agents", activeTenantId],
    enabled: !!activeTenantId,
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${activeTenantId}/known-agents`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const statsUrl = useMemo(() => {
    const qs = new URLSearchParams();
    if (agentFilter !== "all") qs.set("agentId", agentFilter);
    return `/api/tenants/${activeTenantId}/llm-models/stats?${qs.toString()}`;
  }, [activeTenantId, agentFilter]);

  const { data: stats } = useQuery<LlmStats>({
    queryKey: ["/api/llm-models/stats", activeTenantId, agentFilter],
    enabled: !!activeTenantId,
    queryFn: async () => {
      const res = await fetch(statsUrl);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    refetchInterval: 90000,
  });

  const { data: recentCallsRaw = [] } = useQuery<LlmCall[]>({
    queryKey: ["/api/llm-calls", activeTenantId, expandedModelId, agentFilter],
    enabled: !!activeTenantId && !!expandedModelId,
    queryFn: async () => {
      const qs = new URLSearchParams();
      qs.set("limit", "30");
      if (agentFilter !== "all") qs.set("agentId", agentFilter);
      const res = await fetch(`/api/tenants/${activeTenantId}/llm-models/${expandedModelId}/calls?${qs.toString()}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    refetchInterval: 90000,
  });

  const filteredRecentCalls = useMemo(() => {
    if (errorClassFilter === "all") return recentCallsRaw;
    return recentCallsRaw.filter(c => c.errorClass === errorClassFilter);
  }, [recentCallsRaw, errorClassFilter]);

  const handleLlmLive = useCallback((event: LiveEvent) => {
    if (event.type !== "llm_call.recorded") return;
    const call = event.data as LlmCall;
    if (!call?.id || !call?.modelId) return;
    if (activeTenantId && call.tenantId !== activeTenantId) return;
    if (agentFilter !== "all" && call.agentId !== agentFilter) {
      queryClient.invalidateQueries({ queryKey: ["/api/llm-models/stats", activeTenantId] });
      return;
    }
    if (expandedModelId && call.modelId === expandedModelId) {
      queryClient.setQueryData<LlmCall[] | undefined>(
        ["/api/llm-calls", activeTenantId, expandedModelId, agentFilter],
        (prev) => {
          if (!prev) return prev;
          if (prev.find((c) => c.id === call.id)) return prev;
          return [call, ...prev].slice(0, 30);
        },
      );
    }
    // Refresh any other recent-calls views and stats so live data shows
    // immediately on every llm-calls list, not only the expanded model.
    queryClient.invalidateQueries({ queryKey: ["/api/llm-calls"] });
    queryClient.invalidateQueries({ queryKey: ["/api/llm-models/stats", activeTenantId] });
    queryClient.invalidateQueries({ queryKey: ["/api/llm-models", activeTenantId] });
  }, [queryClient, activeTenantId, expandedModelId, agentFilter]);
  useLiveStream(orgId, [activeTenantId], ["llm_call.recorded"], handleLlmLive);

  const recentCalls = useMemo(() => {
    if (
      pinnedCall &&
      expandedModelId &&
      pinnedCall.modelId === expandedModelId &&
      (errorClassFilter === "all" || pinnedCall.errorClass === errorClassFilter) &&
      !filteredRecentCalls.some(c => c.id === pinnedCall.id)
    ) {
      return [pinnedCall, ...filteredRecentCalls];
    }
    return filteredRecentCalls;
  }, [filteredRecentCalls, pinnedCall, expandedModelId, errorClassFilter]);

  useEffect(() => {
    if (!highlightCallId) return;
    if (!recentCalls.some(c => c.id === highlightCallId)) return;
    const row = callRowRefs.current.get(highlightCallId);
    if (row) {
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      const t = setTimeout(() => setHighlightCallId(null), 4000);
      return () => clearTimeout(t);
    }
  }, [highlightCallId, recentCalls]);

  const seedMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/tenants/${activeTenantId}/llm-models/seed-demo`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/llm-models"] });
      queryClient.invalidateQueries({ queryKey: ["/api/llm-models/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/known-agents"] });
    },
  });

  const { data: foundryData, refetch: refetchFoundry } = useQuery<{ deployments: FoundryDeployment[] }>({
    queryKey: ["/api/foundry/deployments", activeTenantId],
    enabled: !!activeTenantId && foundryPanelOpen,
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${activeTenantId}/foundry/deployments`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    refetchInterval: foundryPanelOpen ? 30000 : false,
  });

  const discoverMutation = useMutation({
    mutationFn: async (): Promise<FoundryDiscoveryResponse> => {
      const res = await fetch(`/api/tenants/${activeTenantId}/foundry/discover`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data) => {
      setDiscoveryResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/foundry/deployments"] });
    },
    onError: (err: any) => {
      setDiscoveryResult({
        deploymentsDiscovered: 0,
        accountsScanned: 0,
        subscriptionsScanned: 0,
        metricsCollected: 0,
        needsConsent: false,
        consentReason: null,
        errors: [err?.message || String(err)],
      });
    },
  });

  const importBulkMutation = useMutation({
    mutationFn: async (deploymentIds: string[]) => {
      const res = await fetch(`/api/tenants/${activeTenantId}/foundry/deployments/import-bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deploymentIds }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/foundry/deployments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/llm-models"] });
      queryClient.invalidateQueries({ queryKey: ["/api/llm-models/stats"] });
      refetchFoundry();
    },
  });

  const { data: expandedModelDetail } = useQuery<ModelDetail>({
    queryKey: ["/api/llm-models/detail", activeTenantId, expandedModelId],
    enabled: !!activeTenantId && !!expandedModelId,
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${activeTenantId}/llm-models/${expandedModelId}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    refetchInterval: 30000,
  });

  const hasData = (models?.length ?? 0) > 0 || (stats?.totalCalls ?? 0) > 0;

  if (!activeTenantId) {
    return (
      <Shell>
        <div className="p-6"><p className="text-muted-foreground">Select a tenant to view LLM performance.</p></div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-6 w-6" />
            <h1 className="text-2xl font-bold" data-testid="text-page-title">LLM Performance</h1>
            <WindowFilterBadge />
            {hasData && (
              <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30 text-xs font-medium">
                <Activity className="h-3 w-3 mr-1" />Live
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <SavedViews
              pageKey="llm-calls"
              currentFilters={{ agentFilter, errorClass: errorClassFilter }}
              defaultFilters={{ agentFilter: "all", errorClass: "all" }}
              onApply={(f) => {
                setAgentFilter(f.agentFilter);
                setErrorClassFilter(f.errorClass || "all");
              }}
            />
            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger className="w-[220px]" data-testid="select-agent-filter">
                <SelectValue placeholder="All agents" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All agents (and ad-hoc)</SelectItem>
                {agents.map(a => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/llm-models"] });
              queryClient.invalidateQueries({ queryKey: ["/api/llm-models/stats"] });
              queryClient.invalidateQueries({ queryKey: ["/api/llm-calls"] });
            }} data-testid="button-refresh">
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Refresh
            </Button>
            {activeTenantId && (
              <ExportMenu
                testIdPrefix="export-llm-calls"
                baseUrl={`/api/tenants/${activeTenantId}/exports/llm-calls`}
                query={{
                  agentId: agentFilter !== "all" ? agentFilter : undefined,
                  since: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
                }}
              />
            )}
            <Button variant="outline" size="sm" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending} data-testid="button-seed-demo">
              {seedMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Database className="h-3.5 w-3.5 mr-1.5" />}
              Seed Demo Data
            </Button>
            <Button variant="default" size="sm" onClick={() => setFoundryPanelOpen(true)} data-testid="button-discover-foundry">
              <Cloud className="h-3.5 w-3.5 mr-1.5" />
              Discover Foundry models
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          <MetricCard icon={<Activity className="h-4 w-4" />} label="Total Calls (24h)" value={stats ? stats.totalCalls.toLocaleString() : "—"} testId="metric-total-calls" />
          <MetricCard icon={<XCircle className="h-4 w-4 text-red-500" />} label="Error Rate" value={stats ? `${stats.errorRate.toFixed(1)}%` : "—"} tone={stats && stats.errorRate > 5 ? "bad" : "ok"} testId="metric-error-rate" />
          <MetricCard icon={<Gauge className="h-4 w-4" />} label="Avg Duration" value={stats ? formatMs(stats.avgDurationMs) : "—"} testId="metric-avg-duration" />
          <MetricCard icon={<Zap className="h-4 w-4 text-amber-500" />} label="Avg TTFT" value={stats ? formatMs(stats.avgTtftMs) : "—"} testId="metric-avg-ttft" />
          <MetricCard icon={<Zap className="h-4 w-4" />} label="Avg tok/s" value={stats ? stats.avgTokensPerSec.toFixed(1) : "—"} testId="metric-tokens-per-sec" />
          <MetricCard icon={<DollarSign className="h-4 w-4 text-emerald-500" />} label="Total Cost (24h)" value={stats ? formatCost(stats.totalCostCents) : "—"} testId="metric-total-cost" />
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Calls &amp; latency over time</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={(stats?.timeseries ?? []).filter((p) => !windowSince || (p.bucket != null && new Date(p.bucket) >= windowSince))}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="bucket" tickFormatter={v => v?.slice(11, 16) ?? ""} className="text-xs" />
                    <YAxis yAxisId="left" className="text-xs" />
                    <YAxis yAxisId="right" orientation="right" className="text-xs" />
                    <Tooltip />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="calls" stroke="#3b82f6" name="Calls" dot={false} />
                    <Line yAxisId="right" type="monotone" dataKey="avgDurationMs" stroke="#f59e0b" name="Avg duration (ms)" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Errors by class (24h)</CardTitle>
            </CardHeader>
            <CardContent>
              {stats?.byErrorClass?.length ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.byErrorClass} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis type="number" className="text-xs" />
                      <YAxis type="category" dataKey="errorClass" width={120} className="text-xs" />
                      <Tooltip />
                      <Bar dataKey="count" fill="#ef4444" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-10 text-center">No errors in this window.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Models</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>API key</TableHead>
                  <TableHead className="text-right">Calls (24h)</TableHead>
                  <TableHead className="text-right">Avg dur</TableHead>
                  <TableHead className="text-right">Avg TTFT</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Err %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {models.length === 0 && (
                  <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-10">No models registered. Use "Seed Demo Data" to populate examples.</TableCell></TableRow>
                )}
                {models.map(model => {
                  const modelStats = stats?.byModel.find(m => m.modelId === model.id);
                  const isExpanded = expandedModelId === model.id;
                  return (
                    <>
                      <TableRow key={model.id} data-testid={`row-model-${model.id}`}>
                        <TableCell>
                          <button onClick={() => setExpandedModelId(isExpanded ? null : model.id)} className="hover:text-primary">
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        </TableCell>
                        <TableCell className="font-medium">{model.displayName || model.modelName}<div className="text-xs text-muted-foreground">{model.deploymentName || model.modelName}</div></TableCell>
                        <TableCell><Badge variant="outline">{model.provider}</Badge></TableCell>
                        <TableCell><div className="flex items-center gap-2"><StatusDot status={model.status} /><span className="text-xs">{model.status}</span></div></TableCell>
                        <TableCell>
                          {model.apiKeyEnvVar ? (
                            <div className="flex items-center gap-1 text-xs font-mono">
                              <KeyRound className="h-3 w-3" />{model.apiKeyEnvVar}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{modelStats?.calls ?? 0}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMs(modelStats?.avgDurationMs)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMs(modelStats?.avgTtftMs)}</TableCell>
                        <TableCell className="text-right tabular-nums">{(modelStats?.totalTokens ?? 0).toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCost(modelStats?.costCents ?? 0)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          <span className={(modelStats?.errorRate ?? 0) > 5 ? "text-red-500" : ""}>{(modelStats?.errorRate ?? 0).toFixed(1)}%</span>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow>
                          <TableCell colSpan={11} className="bg-muted/30">
                            <div className="py-2 space-y-3">
                              {model.provider === "foundry" && expandedModelDetail?.foundryUsage && (
                                <div data-testid={`section-foundry-usage-${model.id}`}>
                                  <div className="text-xs font-semibold mb-2 uppercase tracking-wide text-muted-foreground">
                                    Authoritative usage (Azure Monitor)
                                  </div>
                                  <div className="grid grid-cols-3 gap-2 max-w-xl">
                                    <FoundryUsageCell usage={expandedModelDetail.foundryUsage.window24h} label="24h" />
                                    <FoundryUsageCell usage={expandedModelDetail.foundryUsage.window7d} label="7d" />
                                    <FoundryUsageCell usage={expandedModelDetail.foundryUsage.window30d} label="30d" />
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    From Azure Monitor for the linked Foundry deployment — independent of llm_calls instrumentation below.
                                  </p>
                                </div>
                              )}
                              <div className="text-xs font-semibold mb-2 uppercase tracking-wide text-muted-foreground">Recent calls</div>
                              {(windowSince ? recentCalls.filter(c => c.calledAt && new Date(c.calledAt) >= windowSince) : recentCalls).length === 0 ? (
                                <p className="text-sm text-muted-foreground">No recent calls for this model.</p>
                              ) : (
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>When</TableHead>
                                      <TableHead>Agent</TableHead>
                                      <TableHead>Status</TableHead>
                                      <TableHead className="text-right">Duration</TableHead>
                                      <TableHead className="text-right">TTFT</TableHead>
                                      <TableHead className="text-right">Tokens in/out</TableHead>
                                      <TableHead className="text-right">Cost</TableHead>
                                      <TableHead>Error</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {(windowSince ? recentCalls.filter(c => c.calledAt && new Date(c.calledAt) >= windowSince) : recentCalls).map(c => (
                                      <TableRow key={c.id}>
                                        <TableCell className="text-xs">{new Date(c.calledAt).toLocaleTimeString()}</TableCell>
                                        <TableCell className="text-xs">{c.agentName || <span className="text-muted-foreground">ad-hoc</span>}</TableCell>
                                        <TableCell>
                                          {c.status === "success" ? (
                                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                                          ) : (
                                            <XCircle className="h-3.5 w-3.5 text-red-500" />
                                          )}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums text-xs">{formatMs(c.durationMs)}</TableCell>
                                        <TableCell className="text-right tabular-nums text-xs">{formatMs(c.ttftMs)}</TableCell>
                                        <TableCell className="text-right tabular-nums text-xs">{c.inputTokens ?? 0} / {c.outputTokens ?? 0}</TableCell>
                                        <TableCell className="text-right tabular-nums text-xs">{formatCost(c.costCents ?? 0)}</TableCell>
                                        <TableCell className="text-xs">
                                          {c.errorClass ? (
                                            <Badge variant="destructive" className="text-xs">{c.errorClass}</Badge>
                                          ) : null}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {foundryPanelOpen && (
        <FoundryDiscoveryPanel
          deployments={foundryData?.deployments ?? []}
          discovering={discoverMutation.isPending}
          onDiscover={() => discoverMutation.mutate()}
          discoveryResult={discoveryResult}
          onClose={() => { setFoundryPanelOpen(false); setDiscoveryResult(null); }}
          onBulkImport={(ids) => importBulkMutation.mutate(ids)}
          bulkImporting={importBulkMutation.isPending}
        />
      )}
    </Shell>
  );
}

function formatTokens(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return Math.round(n).toLocaleString();
}

function FoundryUsageCell({ usage, label }: { usage: FoundryDeploymentUsage | null; label: string }) {
  if (!usage) {
    return (
      <div className="rounded border bg-muted/30 p-2 text-xs">
        <div className="font-medium text-muted-foreground">{label}</div>
        <div className="text-muted-foreground">no data</div>
      </div>
    );
  }
  return (
    <div className="rounded border bg-muted/30 p-2 text-xs space-y-0.5">
      <div className="font-medium">{label}</div>
      <div>prompt: <span className="font-mono">{formatTokens(usage.processedPromptTokens)}</span></div>
      <div>gen: <span className="font-mono">{formatTokens(usage.generatedTokens)}</span></div>
      <div>calls: <span className="font-mono">{formatTokens(usage.totalCalls)}</span></div>
      {usage.throttledCalls > 0 && (
        <div className="text-amber-600">throttled: <span className="font-mono">{formatTokens(usage.throttledCalls)}</span></div>
      )}
      {usage.inferredCostCents != null && (
        <div className="text-muted-foreground">cost: {formatCost(usage.inferredCostCents)}</div>
      )}
    </div>
  );
}

function FoundryDiscoveryPanel({
  deployments,
  discovering,
  onDiscover,
  discoveryResult,
  onClose,
  onBulkImport,
  bulkImporting,
}: {
  deployments: FoundryDeployment[];
  discovering: boolean;
  onDiscover: () => void;
  discoveryResult: FoundryDiscoveryResponse | null;
  onClose: () => void;
  onBulkImport: (deploymentIds: string[]) => void;
  bulkImporting: boolean;
}) {
  const importedCount = deployments.filter(d => d.llmModelId).length;
  const importable = deployments.filter(d => !d.llmModelId);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (selected.size === importable.length && importable.length > 0) setSelected(new Set());
    else setSelected(new Set(importable.map(d => d.id)));
  }

  return (
    <div className="fixed inset-0 z-50 flex" data-testid="panel-foundry-discovery">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-[640px] max-w-full bg-background border-l overflow-y-auto">
        <div className="sticky top-0 bg-background border-b p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            <h2 className="text-lg font-semibold" data-testid="text-foundry-panel-title">Azure AI Foundry deployments</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-close-foundry-panel">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Enumerate Azure OpenAI / AI Foundry deployments via Azure Resource Manager and Azure Monitor.
            </p>
            <Button onClick={onDiscover} disabled={discovering} data-testid="button-run-discovery">
              {discovering ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Search className="h-4 w-4 mr-1.5" />}
              {discovering ? "Discovering..." : "Discover now"}
            </Button>
          </div>

          {discoveryResult?.needsConsent && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex gap-2" data-testid="alert-needs-consent">
              <ShieldAlert className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <div className="font-semibold text-amber-700">Admin consent required</div>
                <div className="text-amber-700/90 mt-1">{discoveryResult.consentReason}</div>
              </div>
            </div>
          )}

          {discoveryResult && !discoveryResult.needsConsent && (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm" data-testid="text-discovery-summary">
              <div className="font-medium">Discovery complete</div>
              <div className="text-xs text-muted-foreground mt-1">
                Scanned {discoveryResult.subscriptionsScanned} subscription(s), {discoveryResult.accountsScanned} account(s).
                Found {discoveryResult.deploymentsDiscovered} deployment(s). Collected {discoveryResult.metricsCollected} metric snapshot(s).
              </div>
              {discoveryResult.errors.length > 0 && (
                <details className="mt-2">
                  <summary className="text-xs text-amber-600 cursor-pointer">{discoveryResult.errors.length} warning(s)</summary>
                  <ul className="text-xs text-muted-foreground mt-1 space-y-0.5 list-disc pl-4">
                    {discoveryResult.errors.slice(0, 6).map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </details>
              )}
            </div>
          )}

          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{deployments.length} known · {importedCount} imported · {importable.length} importable</span>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={importable.length > 0 && selected.size === importable.length}
                  onChange={toggleAll}
                  disabled={importable.length === 0}
                  data-testid="checkbox-select-all"
                />
                <span>Select all</span>
              </label>
              <Button
                size="sm"
                disabled={selected.size === 0 || bulkImporting}
                onClick={() => { onBulkImport(Array.from(selected)); setSelected(new Set()); }}
                data-testid="button-import-selected"
              >
                {bulkImporting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1.5" />}
                Import selected ({selected.size})
              </Button>
            </div>
          </div>

          {deployments.length === 0 ? (
            <div className="border-2 border-dashed rounded-lg p-8 text-center text-sm text-muted-foreground">
              No deployments discovered yet. Click "Discover now" to enumerate Azure OpenAI / AI Foundry resources.
            </div>
          ) : (
            <div className="space-y-2">
              {deployments.map(d => {
                const isImported = !!d.llmModelId;
                const isSelected = selected.has(d.id);
                return (
                  <div key={d.id} className="border rounded-lg p-3" data-testid={`row-deployment-${d.id}`}>
                    <div className="flex items-start gap-3">
                      <div className="pt-0.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOne(d.id)}
                          disabled={isImported}
                          data-testid={`checkbox-deployment-${d.id}`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium" data-testid={`text-deployment-name-${d.id}`}>{d.deploymentName}</span>
                          {d.modelName && <Badge variant="outline" className="text-xs">{d.modelName}{d.modelVersion ? ` · ${d.modelVersion}` : ""}</Badge>}
                          {d.skuName && <Badge variant="secondary" className="text-xs">{d.skuName}{d.skuCapacity ? ` · ${d.skuCapacity}` : ""}</Badge>}
                          {isImported && <Badge className="text-xs bg-green-500/15 text-green-700 border-green-500/30 border">Imported</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 truncate">
                          {d.accountName} · {d.region || "?"} · rg: {d.resourceGroup}
                        </div>
                        {d.endpoint && <div className="text-xs text-muted-foreground font-mono truncate">{d.endpoint}</div>}
                        <div className="grid grid-cols-3 gap-2 mt-2" data-testid={`grid-usage-${d.id}`}>
                          <FoundryUsageCell usage={d.usage24h} label="24h" />
                          <FoundryUsageCell usage={d.usage7d} label="7d" />
                          <FoundryUsageCell usage={d.usage30d} label="30d" />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, tone, testId }: { icon: React.ReactNode; label: string; value: string; tone?: "ok" | "bad"; testId?: string }) {
  return (
    <Card data-testid={testId}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          {icon}
          {label}
        </div>
        <div className={`text-2xl font-bold mt-1 ${tone === "bad" ? "text-red-500" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
