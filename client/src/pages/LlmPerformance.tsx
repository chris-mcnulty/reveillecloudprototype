import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
} from "lucide-react";
import { useActiveTenant } from "@/lib/tenant-context";
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
  const { activeTenantId } = useActiveTenant();
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);

  const { data: models = [] } = useQuery<LlmModel[]>({
    queryKey: ["/api/llm-models", activeTenantId],
    enabled: !!activeTenantId,
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${activeTenantId}/llm-models`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    refetchInterval: 30000,
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
    refetchInterval: 30000,
  });

  const { data: recentCalls = [] } = useQuery<LlmCall[]>({
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
    refetchInterval: 15000,
  });

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
            {hasData && (
              <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30 text-xs font-medium">
                <Activity className="h-3 w-3 mr-1" />Live
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
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
            <Button variant="outline" size="sm" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending} data-testid="button-seed-demo">
              {seedMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Database className="h-3.5 w-3.5 mr-1.5" />}
              Seed Demo Data
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
                  <LineChart data={stats?.timeseries ?? []}>
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
                            <div className="py-2">
                              <div className="text-xs font-semibold mb-2 uppercase tracking-wide text-muted-foreground">Recent calls</div>
                              {recentCalls.length === 0 ? (
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
                                    {recentCalls.map(c => (
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
    </Shell>
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
