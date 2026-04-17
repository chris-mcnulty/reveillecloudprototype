import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
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

export default function KnownAgents() {
  const queryClient = useQueryClient();
  const { activeTenantId } = useActiveTenant();
  const [search, setSearch] = useState("");
  const [showAddSource, setShowAddSource] = useState(false);
  const [newSource, setNewSource] = useState({ kind: "a2a", label: "", baseUrl: "" });

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
                        <Link href={`/llm-performance?agent=${a.id}`}>
                          <Button variant="ghost" size="sm" title="View LLM performance">
                            <Brain className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
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
