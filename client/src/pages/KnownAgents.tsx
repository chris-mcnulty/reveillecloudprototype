import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Bot,
  Activity,
  Plus,
  Search,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Trash2,
  ExternalLink,
  Radar,
  Brain,
  DollarSign,
  Clock,
  Zap,
} from "lucide-react";
import { useActiveTenant } from "@/lib/tenant-context";

interface KnownAgent {
  id: string;
  name: string;
  description: string | null;
  source: string;
  externalId: string | null;
  endpoint: string | null;
  platform: string;
  status: string;
  discoveredAt: string;
  lastSeenAt: string | null;
}

interface DiscoverySource {
  id: string;
  kind: string;
  label: string;
  baseUrl: string | null;
  enabled: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  agentsFound: number | null;
}

function SourceBadge({ source }: { source: string }) {
  const palette: Record<string, string> = {
    a2a: "bg-blue-500/10 text-blue-600 border-blue-500/30",
    agent365: "bg-purple-500/10 text-purple-600 border-purple-500/30",
    manual: "bg-slate-500/10 text-slate-600 border-slate-500/30",
  };
  const labels: Record<string, string> = {
    a2a: "A2A",
    agent365: "Agent 365",
    manual: "Manual",
  };
  return <Badge variant="outline" className={palette[source] ?? palette.manual}>{labels[source] ?? source}</Badge>;
}

function StatusIcon({ status }: { status: string }) {
  if (status === "active") return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
  if (status === "stale") return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />;
  if (status === "unreachable") return <XCircle className="h-3.5 w-3.5 text-red-500" />;
  return <Activity className="h-3.5 w-3.5 text-slate-500" />;
}

interface SlowestHop {
  callId: string;
  traceId: string | null;
  modelId: string;
  modelName: string | null;
  modelDisplayName: string | null;
  provider: string | null;
  durationMs: number | null;
  ttftMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costCents: number | null;
  status: string;
  errorClass: string | null;
  calledAt: string;
}

interface AgentLlmRollup {
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

interface AgentLlmSummary {
  agentId: string;
  window24h: AgentLlmRollup;
  window7d: AgentLlmRollup;
  slowestHops24h: SlowestHop[];
  topModels7d: { modelId: string; modelName: string | null; provider: string | null; calls: number; totalTokens: number; costCents: number; avgDurationMs: number }[];
}

function formatCost(cents: number | null | undefined): string {
  if (cents == null) return "—";
  if (cents === 0) return "$0.00";
  if (cents < 0.01) return "<$0.0001";
  if (cents < 100) return `$${(cents / 100).toFixed(4)}`;
  return `$${(cents / 100).toFixed(2)}`;
}

function formatTokens(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function RollupTile({ label, rollup }: { label: string; rollup: AgentLlmRollup }) {
  return (
    <div className="rounded-md border p-3 space-y-2" data-testid={`tile-rollup-${rollup.windowHours}h`}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium">{label}</div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="flex items-center gap-1.5">
          <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-semibold tabular-nums" data-testid={`text-cost-${rollup.windowHours}h`}>{formatCost(rollup.totalCostCents)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="tabular-nums" data-testid={`text-calls-${rollup.windowHours}h`}>{rollup.totalCalls.toLocaleString()} calls</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="tabular-nums text-xs" data-testid={`text-tokens-${rollup.windowHours}h`}>
            {formatTokens(rollup.totalInputTokens + rollup.totalOutputTokens)} tokens
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="tabular-nums text-xs">avg {formatDurationMs(rollup.avgDurationMs)}</span>
        </div>
      </div>
      {rollup.errorCount > 0 && (
        <div className="text-xs text-red-500">
          {rollup.errorCount} error{rollup.errorCount === 1 ? "" : "s"} · {((rollup.errorCount / Math.max(1, rollup.totalCalls)) * 100).toFixed(1)}%
        </div>
      )}
    </div>
  );
}

function AgentLlmCard({ agent, tenantId, onClose }: { agent: KnownAgent; tenantId: string; onClose: () => void }) {
  const [, navigate] = useLocation();
  const { data, isLoading, isError, error, refetch } = useQuery<AgentLlmSummary>({
    queryKey: ["/api/known-agents/llm-summary", tenantId, agent.id],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/known-agents/${agent.id}/llm-summary?hopsLimit=5`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    refetchInterval: 60000,
    retry: 1,
  });

  return (
    <Card data-testid="card-agent-llm-summary">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Brain className="h-4 w-4 text-purple-500" />
          LLM costs &amp; bottlenecks · {agent.name}
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => navigate(`/llm-performance?agent=${agent.id}`)}
            data-testid="button-open-llm-performance"
          >
            <Brain className="h-3.5 w-3.5 mr-1.5" />
            Open in LLM performance
          </Button>
          <Button variant="ghost" size="sm" className="h-7" onClick={onClose} data-testid="button-close-agent-llm-card">
            <XCircle className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isError ? (
          <div className="flex flex-col items-center gap-2 py-8 text-sm" data-testid="state-llm-summary-error">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <span className="text-muted-foreground">Couldn't load LLM activity for this agent.</span>
            <span className="text-xs text-red-500">{(error as Error)?.message || "Unknown error"}</span>
            <Button variant="outline" size="sm" className="h-7 text-xs mt-1" onClick={() => refetch()} data-testid="button-retry-llm-summary">
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Retry
            </Button>
          </div>
        ) : isLoading || !data ? (
          <div className="flex items-center gap-2 py-12 justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading agent LLM activity…</span>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <RollupTile label="Last 24 hours" rollup={data.window24h} />
              <RollupTile label="Last 7 days" rollup={data.window7d} />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">Top 5 slowest LLM hops · 24h</h3>
                <Badge variant="outline" className="text-xs">drill into trace</Badge>
              </div>
              {data.slowestHops24h.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center border rounded-md">
                  No LLM calls recorded for this agent in the last 24 hours.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Model</TableHead>
                      <TableHead className="text-right">Duration</TableHead>
                      <TableHead className="text-right">TTFT</TableHead>
                      <TableHead className="text-right">Tokens</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.slowestHops24h.map((h, i) => (
                      <TableRow key={h.callId} data-testid={`row-slow-hop-${i}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px]">{h.provider ?? "—"}</Badge>
                            <span className="text-sm font-medium">{h.modelDisplayName || h.modelName || "—"}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{formatDurationMs(h.durationMs)}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                          {h.ttftMs != null ? `${Math.round(h.ttftMs)}ms` : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                          {formatTokens((h.inputTokens ?? 0) + (h.outputTokens ?? 0))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs text-muted-foreground" data-testid={`text-hop-cost-${i}`}>{formatCost(h.costCents)}</TableCell>
                        <TableCell className="text-right">
                          {h.traceId ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => navigate(`/agent-observability?trace=${h.traceId}`)}
                              data-testid={`button-open-trace-${i}`}
                            >
                              <ExternalLink className="h-3 w-3 mr-1" />
                              Open trace
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">no trace</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            {data.topModels7d.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Top models by spend · 7d</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Model</TableHead>
                      <TableHead className="text-right">Calls</TableHead>
                      <TableHead className="text-right">Tokens</TableHead>
                      <TableHead className="text-right">Avg duration</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.topModels7d.map((m, i) => (
                      <TableRow key={m.modelId} data-testid={`row-top-model-${i}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px]">{m.provider ?? "—"}</Badge>
                            <span className="text-sm">{m.modelName || "(unknown)"}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs">{m.calls.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs">{formatTokens(m.totalTokens)}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs">{formatDurationMs(m.avgDurationMs)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium" data-testid={`text-model-cost-${i}`}>{formatCost(m.costCents)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function KnownAgents() {
  const queryClient = useQueryClient();
  const { activeTenantId } = useActiveTenant();
  const [search, setSearch] = useState("");
  const [showAddSource, setShowAddSource] = useState(false);
  const [newSource, setNewSource] = useState({ kind: "a2a", label: "", baseUrl: "" });
  const [llmAgent, setLlmAgent] = useState<KnownAgent | null>(null);

  const { data: agents = [] } = useQuery<KnownAgent[]>({
    queryKey: ["/api/known-agents", activeTenantId],
    enabled: !!activeTenantId,
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${activeTenantId}/known-agents`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: sources = [] } = useQuery<DiscoverySource[]>({
    queryKey: ["/api/agent-discovery-sources", activeTenantId],
    enabled: !!activeTenantId,
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${activeTenantId}/agent-discovery-sources`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const discoverMutation = useMutation({
    mutationFn: async (sourceId?: string) => {
      const res = await fetch(`/api/tenants/${activeTenantId}/known-agents/discover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sourceId ? { sourceId } : {}),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/known-agents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agent-discovery-sources"] });
    },
  });

  const addSourceMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/tenants/${activeTenantId}/agent-discovery-sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSource),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      setShowAddSource(false);
      setNewSource({ kind: "a2a", label: "", baseUrl: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/agent-discovery-sources"] });
    },
  });

  const deleteAgentMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/tenants/${activeTenantId}/known-agents/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/known-agents"] }),
  });

  const deleteSourceMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/tenants/${activeTenantId}/agent-discovery-sources/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/agent-discovery-sources"] }),
  });

  const filtered = agents.filter(a =>
    !search || a.name.toLowerCase().includes(search.toLowerCase()) || (a.description ?? "").toLowerCase().includes(search.toLowerCase())
  );

  if (!activeTenantId) {
    return <Shell><div className="p-6"><p className="text-muted-foreground">Select a tenant to view known agents.</p></div></Shell>;
  }

  return (
    <Shell>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-6 w-6" />
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Known Agents</h1>
            {agents.length > 0 && (
              <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30 text-xs">
                <Activity className="h-3 w-3 mr-1" />{agents.length} registered
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => discoverMutation.mutate(undefined)} disabled={discoverMutation.isPending} data-testid="button-discover-all">
              {discoverMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Radar className="h-3.5 w-3.5 mr-1.5" />}
              Discover All
            </Button>
            <Button variant="default" size="sm" onClick={() => setShowAddSource(true)} data-testid="button-add-source">
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add Discovery Source
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Radar className="h-4 w-4" /> Discovery sources</CardTitle>
          </CardHeader>
          <CardContent>
            {sources.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No discovery sources configured yet. Add one to start finding agents automatically.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kind</TableHead>
                    <TableHead>Label</TableHead>
                    <TableHead>Base URL</TableHead>
                    <TableHead>Last run</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Found</TableHead>
                    <TableHead className="w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sources.map(s => (
                    <TableRow key={s.id}>
                      <TableCell><SourceBadge source={s.kind} /></TableCell>
                      <TableCell className="font-medium">{s.label}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{s.baseUrl || "—"}</TableCell>
                      <TableCell className="text-xs">{s.lastRunAt ? new Date(s.lastRunAt).toLocaleString() : "Never"}</TableCell>
                      <TableCell className="text-xs">
                        {s.lastStatus === "success" && <span className="text-green-500">success</span>}
                        {s.lastStatus === "error" && <span className="text-red-500" title={s.lastError ?? undefined}>error</span>}
                        {s.lastStatus === "not_configured" && <span className="text-amber-500">not configured</span>}
                        {!s.lastStatus && <span className="text-muted-foreground">pending</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{s.agentsFound ?? 0}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => discoverMutation.mutate(s.id)} disabled={discoverMutation.isPending}>
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => deleteSourceMutation.mutate(s.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {llmAgent && activeTenantId && (
          <AgentLlmCard
            agent={llmAgent}
            tenantId={activeTenantId}
            onClose={() => setLlmAgent(null)}
          />
        )}

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Registered agents</CardTitle>
            <div className="relative w-72">
              <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
              <Input placeholder="Search agents…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8" data-testid="input-search-agents" />
            </div>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No agents match.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>Endpoint</TableHead>
                    <TableHead>Discovered</TableHead>
                    <TableHead className="w-32 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(a => (
                    <TableRow key={a.id} data-testid={`row-agent-${a.id}`}>
                      <TableCell><StatusIcon status={a.status} /></TableCell>
                      <TableCell>
                        <div className="font-medium">{a.name}</div>
                        {a.description && <div className="text-xs text-muted-foreground line-clamp-1">{a.description}</div>}
                      </TableCell>
                      <TableCell><SourceBadge source={a.source} /></TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{a.platform}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground truncate max-w-[220px]">{a.endpoint || "—"}</TableCell>
                      <TableCell className="text-xs">{new Date(a.discoveredAt).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          title="LLM costs & bottlenecks"
                          onClick={() => setLlmAgent(a)}
                          data-testid={`button-llm-summary-${a.id}`}
                        >
                          <Brain className="h-3.5 w-3.5" />
                        </Button>
                        {a.endpoint && (
                          <a href={a.endpoint} target="_blank" rel="noreferrer">
                            <Button variant="ghost" size="sm" title="Open endpoint">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          </a>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => deleteAgentMutation.mutate(a.id)} title="Remove">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={showAddSource} onOpenChange={setShowAddSource}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add discovery source</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Kind</Label>
                <Select value={newSource.kind} onValueChange={v => setNewSource({ ...newSource, kind: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="a2a">A2A (Agent-to-Agent /.well-known)</SelectItem>
                    <SelectItem value="agent365">Agent 365 (Microsoft Graph)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Label</Label>
                <Input value={newSource.label} onChange={e => setNewSource({ ...newSource, label: e.target.value })} placeholder="e.g. Contoso research cluster" />
              </div>
              {newSource.kind === "a2a" && (
                <div>
                  <Label>Base URL</Label>
                  <Input value={newSource.baseUrl} onChange={e => setNewSource({ ...newSource, baseUrl: e.target.value })} placeholder="https://agent.example.com" />
                  <p className="text-xs text-muted-foreground mt-1">We'll fetch {newSource.baseUrl || "<base>"}/.well-known/agent.json</p>
                </div>
              )}
              {newSource.kind === "agent365" && (
                <div className="text-xs text-muted-foreground rounded-md border p-3 space-y-1">
                  <p>Agent 365 uses Microsoft Graph credentials from env vars:</p>
                  <code className="block">AGENT365_TENANT_ID</code>
                  <code className="block">AGENT365_CLIENT_ID</code>
                  <code className="block">AGENT365_CLIENT_SECRET</code>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddSource(false)}>Cancel</Button>
              <Button onClick={() => addSourceMutation.mutate()} disabled={addSourceMutation.isPending || !newSource.label}>
                {addSourceMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
                Add source
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </Shell>
  );
}
