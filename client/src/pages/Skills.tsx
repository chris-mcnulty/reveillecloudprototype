import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BookOpen,
  Search,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ExternalLink,
  Cloud,
  FolderOpen,
  Archive,
  FileWarning,
} from "lucide-react";
import { useActiveTenant } from "@/lib/tenant-context";

interface SkillRow {
  id: string;
  source: string;
  name: string;
  displayName: string | null;
  version: string | null;
  description: string | null;
  parentPath: string | null;
  libraryName: string | null;
  ownerUserPrincipalName: string | null;
  webUrl: string | null;
  status: string;
  parseStatus: string;
  parseError: string | null;
  contentHash: string | null;
  sizeBytes: number | null;
  tags: string[] | null;
  frontmatter: Record<string, any> | null;
  fileLastModifiedAt: string | null;
  fileLastModifiedBy: string | null;
  discoveredAt: string;
  lastSeenAt: string;
  usageCount30d: number;
  lastUsedAt: string | null;
}

interface SkillStats {
  totalSkills: number;
  bySource: Record<string, number>;
  byStatus: Record<string, number>;
  invalidCount: number;
  orphanCount: number;
  driftCount: number;
  topSkills: { skillId: string; name: string; source: string; usageCount: number }[];
}

interface SkillDetail {
  skill: SkillRow;
  recentEvents: SkillUsageEvent[];
  timeline: { bucket: string; count: number }[];
}

interface SkillUsageEvent {
  id: string;
  skillId: string;
  agentId: string | null;
  traceId: string | null;
  event: string;
  source: string;
  actorUserId: string | null;
  latencyMs: number | null;
  errorMessage: string | null;
  occurredAt: string;
}

function SourceBadge({ source }: { source: string }) {
  if (source === "onedrive") {
    return (
      <Badge variant="outline" className="bg-sky-500/10 text-sky-600 border-sky-500/30 text-xs">
        <Cloud className="h-3 w-3 mr-1" />OneDrive
      </Badge>
    );
  }
  if (source === "sharepoint_agent_assets") {
    return (
      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-xs">
        <FolderOpen className="h-3 w-3 mr-1" />SharePoint
      </Badge>
    );
  }
  return <Badge variant="outline" className="text-xs">{source}</Badge>;
}

function StatusIcon({ status, parseStatus }: { status: string; parseStatus: string }) {
  if (status === "missing") return <XCircle className="h-3.5 w-3.5 text-red-500" />;
  if (status === "deprecated") return <Archive className="h-3.5 w-3.5 text-slate-500" />;
  if (parseStatus === "invalid") return <FileWarning className="h-3.5 w-3.5 text-amber-500" />;
  if (parseStatus === "no_frontmatter") return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />;
  return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
}

function StatTile({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div className="rounded-md border p-3" data-testid={`tile-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums mt-1 ${accent ?? ""}`}>{value}</div>
    </div>
  );
}

function SkillDetailDialog({
  tenantId,
  skillId,
  onClose,
}: {
  tenantId: string;
  skillId: string;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery<SkillDetail>({
    queryKey: ["/api/tenants/skills/detail", tenantId, skillId],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/skills/${skillId}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  return (
    <Dialog open={true} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{data?.skill.displayName || data?.skill.name || "Skill detail"}</DialogTitle>
        </DialogHeader>
        {isLoading || !data ? (
          <div className="flex items-center gap-2 py-12 justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading skill detail…</span>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Source</div>
                <div><SourceBadge source={data.skill.source} /></div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Version</div>
                <div className="font-mono text-xs">{data.skill.version || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Path</div>
                <div className="text-xs truncate" title={data.skill.parentPath || ""}>{data.skill.parentPath || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Owner / Library</div>
                <div className="text-xs">{data.skill.ownerUserPrincipalName || data.skill.libraryName || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Last modified</div>
                <div className="text-xs">
                  {data.skill.fileLastModifiedAt ? new Date(data.skill.fileLastModifiedAt).toLocaleString() : "—"}
                  {data.skill.fileLastModifiedBy ? ` · ${data.skill.fileLastModifiedBy}` : ""}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Content hash</div>
                <div className="font-mono text-xs truncate" title={data.skill.contentHash || ""}>
                  {data.skill.contentHash?.slice(0, 16) || "—"}
                </div>
              </div>
            </div>

            {data.skill.description && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Description</div>
                <p className="text-sm">{data.skill.description}</p>
              </div>
            )}

            {data.skill.tags && data.skill.tags.length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Tags</div>
                <div className="flex gap-1 flex-wrap">
                  {data.skill.tags.map(t => (
                    <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                  ))}
                </div>
              </div>
            )}

            {data.skill.parseError && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="text-xs text-amber-600 font-medium mb-1">Parse error</div>
                <pre className="text-xs whitespace-pre-wrap">{data.skill.parseError}</pre>
              </div>
            )}

            {data.skill.frontmatter && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Frontmatter</div>
                <pre className="text-xs bg-muted/50 rounded-md p-3 overflow-x-auto max-h-64">
                  {JSON.stringify(data.skill.frontmatter, null, 2)}
                </pre>
              </div>
            )}

            <div>
              <div className="text-xs text-muted-foreground mb-2">Recent usage events</div>
              {data.recentEvents.length === 0 ? (
                <p className="text-xs text-muted-foreground py-3 text-center border rounded-md">
                  No usage events recorded for this skill yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">When</TableHead>
                      <TableHead className="text-xs">Event</TableHead>
                      <TableHead className="text-xs">Source</TableHead>
                      <TableHead className="text-xs">Actor</TableHead>
                      <TableHead className="text-xs text-right">Latency</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recentEvents.map(e => (
                      <TableRow key={e.id}>
                        <TableCell className="text-xs">{new Date(e.occurredAt).toLocaleString()}</TableCell>
                        <TableCell className="text-xs"><Badge variant="outline" className="text-[10px]">{e.event}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{e.source}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{e.actorUserId || "—"}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{e.latencyMs != null ? `${e.latencyMs}ms` : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            {data.skill.webUrl && (
              <div className="flex justify-end">
                <a href={data.skill.webUrl} target="_blank" rel="noreferrer">
                  <Button variant="outline" size="sm" data-testid="button-open-source">
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    Open in {data.skill.source === "onedrive" ? "OneDrive" : "SharePoint"}
                  </Button>
                </a>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Skills() {
  const queryClient = useQueryClient();
  const { activeTenantId } = useActiveTenant();
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);

  const { data: skills = [], isLoading } = useQuery<SkillRow[]>({
    queryKey: ["/api/tenants/skills", activeTenantId, sourceFilter, statusFilter, search],
    enabled: !!activeTenantId,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (sourceFilter !== "all") params.set("source", sourceFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (search) params.set("search", search);
      params.set("limit", "200");
      const res = await fetch(`/api/tenants/${activeTenantId}/skills?${params}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const { data: stats } = useQuery<SkillStats>({
    queryKey: ["/api/tenants/skills/stats", activeTenantId],
    enabled: !!activeTenantId,
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${activeTenantId}/skills/stats`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const discoverMutation = useMutation({
    mutationFn: async (source?: string) => {
      const res = await fetch(`/api/tenants/${activeTenantId}/skills/discover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(source ? { source } : {}),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants/skills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants/skills/stats"] });
    },
  });

  if (!activeTenantId) {
    return (
      <Shell>
        <div className="p-6"><p className="text-muted-foreground">Select a tenant to view skills.</p></div>
      </Shell>
    );
  }

  const orphanSkills = skills.filter(s => s.status === "active" && s.usageCount30d === 0);
  const invalidSkills = skills.filter(s => s.parseStatus !== "ok");
  const missingSkills = skills.filter(s => s.status === "missing");

  return (
    <Shell>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-6 w-6" />
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Skill.md catalog</h1>
            {stats && (
              <Badge variant="outline" className="text-xs">
                {stats.totalSkills} discovered
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => discoverMutation.mutate("sharepoint_agent_assets")}
              disabled={discoverMutation.isPending}
              data-testid="button-discover-sharepoint"
            >
              {discoverMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <FolderOpen className="h-3.5 w-3.5 mr-1.5" />}
              Discover SharePoint
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => discoverMutation.mutate("onedrive")}
              disabled={discoverMutation.isPending}
              data-testid="button-discover-onedrive"
            >
              {discoverMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Cloud className="h-3.5 w-3.5 mr-1.5" />}
              Discover OneDrive
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => discoverMutation.mutate(undefined)}
              disabled={discoverMutation.isPending}
              data-testid="button-discover-all"
            >
              {discoverMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
              Discover All
            </Button>
          </div>
        </div>

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <StatTile label="Total" value={stats.totalSkills} />
            <StatTile label="OneDrive" value={stats.bySource.onedrive ?? 0} />
            <StatTile label="SharePoint" value={stats.bySource.sharepoint_agent_assets ?? 0} />
            <StatTile label="Invalid" value={stats.invalidCount} accent={stats.invalidCount > 0 ? "text-amber-500" : ""} />
            <StatTile label="Orphan (30d)" value={stats.orphanCount} accent={stats.orphanCount > 0 ? "text-slate-500" : ""} />
            <StatTile label="Drift (7d)" value={stats.driftCount} accent={stats.driftCount > 0 ? "text-sky-500" : ""} />
          </div>
        )}

        <Tabs defaultValue="catalog">
          <TabsList>
            <TabsTrigger value="catalog" data-testid="tab-catalog">Catalog</TabsTrigger>
            <TabsTrigger value="usage" data-testid="tab-usage">Usage</TabsTrigger>
            <TabsTrigger value="health" data-testid="tab-health">Health</TabsTrigger>
          </TabsList>

          <TabsContent value="catalog" className="space-y-4">
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Discovered skills</CardTitle>
                <div className="flex items-center gap-2">
                  <Select value={sourceFilter} onValueChange={setSourceFilter}>
                    <SelectTrigger className="w-44 h-9 text-xs" data-testid="select-source-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All sources</SelectItem>
                      <SelectItem value="onedrive">OneDrive</SelectItem>
                      <SelectItem value="sharepoint_agent_assets">SharePoint</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-36 h-9 text-xs" data-testid="select-status-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="missing">Missing</SelectItem>
                      <SelectItem value="deprecated">Deprecated</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="relative w-64">
                    <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
                    <Input
                      placeholder="Search…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-8 h-9"
                      data-testid="input-search-skills"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center gap-2 py-12 justify-center text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Loading skills…</span>
                  </div>
                ) : skills.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    No skills discovered yet. Click "Discover SharePoint" or "Discover OneDrive" to scan.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8"></TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Owner / Library</TableHead>
                        <TableHead>Version</TableHead>
                        <TableHead className="text-right">Used 30d</TableHead>
                        <TableHead>Last seen</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {skills.map(s => (
                        <TableRow
                          key={s.id}
                          className="cursor-pointer hover:bg-muted/40"
                          onClick={() => setSelectedSkillId(s.id)}
                          data-testid={`row-skill-${s.id}`}
                        >
                          <TableCell><StatusIcon status={s.status} parseStatus={s.parseStatus} /></TableCell>
                          <TableCell>
                            <div className="font-medium">{s.displayName || s.name}</div>
                            {s.description && <div className="text-xs text-muted-foreground line-clamp-1">{s.description}</div>}
                          </TableCell>
                          <TableCell><SourceBadge source={s.source} /></TableCell>
                          <TableCell className="text-xs text-muted-foreground truncate max-w-[220px]">
                            {s.ownerUserPrincipalName || s.libraryName || "—"}
                          </TableCell>
                          <TableCell className="text-xs font-mono">{s.version || "—"}</TableCell>
                          <TableCell className="text-right tabular-nums text-xs">
                            {s.usageCount30d > 0 ? s.usageCount30d : <span className="text-muted-foreground">0</span>}
                          </TableCell>
                          <TableCell className="text-xs">{new Date(s.lastSeenAt).toLocaleDateString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="usage" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top skills by usage (30d)</CardTitle>
              </CardHeader>
              <CardContent>
                {!stats || stats.topSkills.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">
                    No skill usage recorded yet. Usage events arrive via the SDK shim (LLM call `skillRef`) or audit-log correlation.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Skill</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead className="text-right">Invocations</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.topSkills.map(s => (
                        <TableRow
                          key={s.skillId}
                          className="cursor-pointer hover:bg-muted/40"
                          onClick={() => setSelectedSkillId(s.skillId)}
                          data-testid={`row-top-skill-${s.skillId}`}
                        >
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell><SourceBadge source={s.source} /></TableCell>
                          <TableCell className="text-right tabular-nums">{s.usageCount}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="health" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileWarning className="h-4 w-4 text-amber-500" /> Parse failures
                </CardTitle>
              </CardHeader>
              <CardContent>
                {invalidSkills.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">All discovered skills parsed cleanly.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Skill</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invalidSkills.map(s => (
                        <TableRow key={s.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setSelectedSkillId(s.id)}>
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell><SourceBadge source={s.source} /></TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{s.parseStatus}</Badge></TableCell>
                          <TableCell className="text-xs text-muted-foreground truncate max-w-[400px]">
                            {s.parseError || "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-500" /> Missing files
                </CardTitle>
              </CardHeader>
              <CardContent>
                {missingSkills.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">No previously-discovered skills are currently missing.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Skill</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Last seen</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {missingSkills.map(s => (
                        <TableRow key={s.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setSelectedSkillId(s.id)}>
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell><SourceBadge source={s.source} /></TableCell>
                          <TableCell className="text-xs">{new Date(s.lastSeenAt).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Archive className="h-4 w-4 text-slate-500" /> Orphan skills (no usage 30d)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {orphanSkills.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">All discovered skills have recent usage.</p>
                ) : (
                  <p className="text-sm text-muted-foreground">{orphanSkills.length} active skill(s) with no usage in the last 30 days.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {selectedSkillId && activeTenantId && (
          <SkillDetailDialog
            tenantId={activeTenantId}
            skillId={selectedSkillId}
            onClose={() => setSelectedSkillId(null)}
          />
        )}
      </div>
    </Shell>
  );
}
