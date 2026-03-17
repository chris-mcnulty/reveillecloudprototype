import { useState } from "react";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  Database, Shield, FileSearch, Activity, ChevronRight,
  AlertTriangle, CheckCircle2, HardDrive, Users, ArrowLeft,
  Layers, Lock,
} from "lucide-react";
import { useSpeContainers, useSpeAccessEvents, useSpeSecurityEvents, useSpeContentTypeStats, useSpeStats } from "@/lib/api";
import { useActiveTenant } from "@/lib/tenant-context";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  high:     "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  medium:   "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  low:      "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
};

const CHART_COLORS = ["#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe", "#7c3aed", "#5b21b6"];

// ---------------------------------------------------------------------------
// Stat cards
// ---------------------------------------------------------------------------

function StatCard({ icon: Icon, label, value, sub, color = "text-primary" }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 pt-6">
        <div className={`rounded-lg p-2.5 bg-muted/50 ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Container detail panel
// ---------------------------------------------------------------------------

function ContainerDetail({
  container,
  tenantId,
  onBack,
}: {
  container: any;
  tenantId: string;
  onBack: () => void;
}) {
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: accessEvents } = useSpeAccessEvents(tenantId, { containerId: container.containerId, since, limit: 200 });
  const { data: secEvents } = useSpeSecurityEvents(tenantId, { limit: 50 });
  const { data: contentStats } = useSpeContentTypeStats(tenantId, container.containerId);

  const containerSecEvents = (secEvents || []).filter(e => e.containerId === container.containerId);

  // Aggregate operations
  const opCounts: Record<string, number> = {};
  for (const e of accessEvents || []) {
    opCounts[e.operation] = (opCounts[e.operation] || 0) + 1;
  }
  const opChartData = Object.entries(opCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([op, count]) => ({ op, count }));

  // Content type pie data
  const ctMap: Record<string, number> = {};
  for (const s of contentStats || []) {
    ctMap[s.contentType] = (ctMap[s.contentType] || 0) + (s.itemCount || 0);
  }
  const ctPieData = Object.entries(ctMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, value]) => ({ name, value }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Containers
        </Button>
        <div>
          <h3 className="text-lg font-semibold">{container.displayName}</h3>
          <p className="text-xs text-muted-foreground font-mono">{container.containerId}</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-4 gap-4">
        <StatCard icon={HardDrive} label="Storage Used" value={formatBytes(container.storageBytes || 0)} />
        <StatCard icon={Database} label="Items" value={(container.itemCount || 0).toLocaleString()} />
        <StatCard icon={Activity} label="Access Events (7d)" value={(accessEvents?.length || 0).toLocaleString()} />
        <StatCard icon={AlertTriangle} label="Security Events" value={containerSecEvents.length} color="text-orange-500" />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {opChartData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Operations (7d)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={opChartData} layout="vertical" margin={{ left: 20, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="op" type="category" tick={{ fontSize: 11 }} width={120} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {ctPieData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Content Types</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={ctPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name.split("/").pop()} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {ctPieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {containerSecEvents.length > 0 && (
        <Card className="border-orange-200 dark:border-orange-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-orange-600 dark:text-orange-400">Security Events</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Event Type</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {containerSecEvents.slice(0, 20).map((e: any) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{timeAgo(e.timestamp)}</TableCell>
                    <TableCell className="font-mono text-xs">{e.eventType}</TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SEVERITY_COLORS[e.severity] || ""}`}>
                        {e.severity}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">{e.userEmail || e.userId || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[300px] truncate">{e.description}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Recent Access Events</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Operation</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>Content Type</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(accessEvents || []).slice(0, 50).map((e: any) => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{timeAgo(e.timestamp)}</TableCell>
                  <TableCell className="font-mono text-xs">{e.operation}</TableCell>
                  <TableCell className="text-xs">{e.userEmail || e.userId || "—"}</TableCell>
                  <TableCell className="text-xs max-w-[180px] truncate">{e.resourceName || e.resourceId || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{e.contentType || "—"}</TableCell>
                  <TableCell>
                    {e.success
                      ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                      : <AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
                  </TableCell>
                </TableRow>
              ))}
              {(accessEvents?.length || 0) === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No access events collected yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function SpEmbedded() {
  const { activeTenantId } = useActiveTenant();
  const [selectedContainer, setSelectedContainer] = useState<any | null>(null);
  const [securitySeverity, setSecuritySeverity] = useState<string>("all");
  const [activeTab, setActiveTab] = useState("overview");

  const since24h = new Date(Date.now() - 86400000).toISOString();
  const since7d = new Date(Date.now() - 7 * 86400000).toISOString();

  const { data: stats, isLoading: statsLoading } = useSpeStats(activeTenantId);
  const { data: containers, isLoading: containersLoading } = useSpeContainers(activeTenantId);
  const { data: accessEvents } = useSpeAccessEvents(activeTenantId, { since: since7d, limit: 500 });
  const { data: securityEvents, isLoading: secLoading } = useSpeSecurityEvents(activeTenantId, {
    since: since7d,
    severity: securitySeverity === "all" ? undefined : securitySeverity,
    limit: 200,
  });
  const { data: contentTypeStats } = useSpeContentTypeStats(activeTenantId);

  // Global content type aggregation across all containers
  const globalCtMap: Record<string, number> = {};
  for (const s of contentTypeStats || []) {
    globalCtMap[s.contentType] = (globalCtMap[s.contentType] || 0) + (s.itemCount || 0);
  }
  const globalCtData = Object.entries(globalCtMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, value]) => ({ name: name.split("/").pop() || name, value }));

  if (selectedContainer && activeTab === "overview") {
    return (
      <Shell>
        <ContainerDetail
          container={selectedContainer}
          tenantId={activeTenantId!}
          onBack={() => setSelectedContainer(null)}
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">SharePoint Embedded</h2>
          <p className="text-muted-foreground">
            Observability, performance, and security monitoring for SPE containers
          </p>
        </div>
      </div>

      {!activeTenantId && (
        <Card>
          <CardContent className="flex items-center gap-3 py-6 text-muted-foreground">
            <Database className="h-5 w-5" />
            <p>Select a tenant to view SharePoint Embedded observability data.</p>
          </CardContent>
        </Card>
      )}

      {activeTenantId && (
        <>
          {/* Summary stats */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <StatCard icon={Layers} label="Containers" value={statsLoading ? "…" : (stats?.totalContainers || 0)} />
            <StatCard icon={HardDrive} label="Total Storage" value={statsLoading ? "…" : formatBytes(stats?.totalStorageBytes || 0)} />
            <StatCard icon={Database} label="Total Items" value={statsLoading ? "…" : (stats?.totalItems || 0).toLocaleString()} />
            <StatCard icon={Activity} label="Access Events (24h)" value={statsLoading ? "…" : (stats?.accessEventsLast24h || 0).toLocaleString()} color="text-blue-500" />
            <StatCard icon={Shield} label="Security Events (24h)" value={statsLoading ? "…" : (stats?.securityEventsLast24h || 0)} color="text-orange-500" />
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="overview">
                <Layers className="h-4 w-4 mr-1.5" /> Containers
              </TabsTrigger>
              <TabsTrigger value="access">
                <Activity className="h-4 w-4 mr-1.5" /> Access Analytics
              </TabsTrigger>
              <TabsTrigger value="security">
                <Shield className="h-4 w-4 mr-1.5" /> Security Events
              </TabsTrigger>
              <TabsTrigger value="content-types">
                <FileSearch className="h-4 w-4 mr-1.5" /> Content Types & Metadata
              </TabsTrigger>
            </TabsList>

            {/* ---- Containers Tab ---- */}
            <TabsContent value="overview" className="space-y-4">
              <div className="grid md:grid-cols-2 gap-6">
                {stats?.topOperations && stats.topOperations.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Top Operations (24h) — Tenant-wide</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={stats.topOperations} layout="vertical" margin={{ left: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 11 }} />
                          <YAxis dataKey="operation" type="category" tick={{ fontSize: 11 }} width={130} />
                          <Tooltip />
                          <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {stats?.securityEventsBySeverity && stats.securityEventsBySeverity.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Security Events by Severity</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={180}>
                        <PieChart>
                          <Pie
                            data={stats.securityEventsBySeverity}
                            dataKey="count"
                            nameKey="severity"
                            cx="50%"
                            cy="50%"
                            outerRadius={70}
                            label={({ severity, count }) => `${severity} (${count})`}
                          >
                            {stats.securityEventsBySeverity.map((_: any, i: number) => (
                              <Cell key={i} fill={["#ef4444", "#f97316", "#eab308", "#3b82f6"][i % 4]} />
                            ))}
                          </Pie>
                          <Legend />
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}
              </div>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div>
                    <CardTitle className="text-sm">Container Inventory</CardTitle>
                    <CardDescription>Click a container to inspect its access and security details</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Container</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Owner</TableHead>
                        <TableHead>Storage</TableHead>
                        <TableHead>Items</TableHead>
                        <TableHead>Sensitivity</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-8"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {containersLoading && (
                        <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Loading containers…</TableCell></TableRow>
                      )}
                      {!containersLoading && (containers || []).length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8">
                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                              <Database className="h-8 w-8" />
                              <p>No containers collected yet.</p>
                              <p className="text-xs">Trigger the SPE collection job from the Scheduler settings page, or wait for the next scheduled run.</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                      {(containers || []).map((c: any) => (
                        <TableRow
                          key={c.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => { setSelectedContainer(c); setActiveTab("overview"); }}
                        >
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">{c.displayName}</p>
                              <p className="font-mono text-xs text-muted-foreground">{c.containerId}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">{c.containerType || "—"}</TableCell>
                          <TableCell className="text-xs">{c.ownerEmail || c.ownerId || "—"}</TableCell>
                          <TableCell className="text-xs">{formatBytes(c.storageBytes || 0)}</TableCell>
                          <TableCell className="text-xs">{(c.itemCount || 0).toLocaleString()}</TableCell>
                          <TableCell>
                            {c.sensitivityLabel
                              ? <Badge variant="outline" className="text-xs"><Lock className="h-2.5 w-2.5 mr-1" />{c.sensitivityLabel}</Badge>
                              : <span className="text-xs text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${c.status === "active" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-muted text-muted-foreground"}`}>
                              {c.status || "active"}
                            </span>
                          </TableCell>
                          <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ---- Access Analytics Tab ---- */}
            <TabsContent value="access" className="space-y-4">
              <div className="grid md:grid-cols-2 gap-6">
                {stats?.topContainers && stats.topContainers.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Most Active Containers (24h)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={stats.topContainers} layout="vertical" margin={{ left: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 11 }} />
                          <YAxis dataKey="displayName" type="category" tick={{ fontSize: 11 }} width={140} />
                          <Tooltip />
                          <Bar dataKey="accessCount" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {stats?.topOperations && stats.topOperations.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Operation Breakdown (24h)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                          <Pie
                            data={stats.topOperations}
                            dataKey="count"
                            nameKey="operation"
                            cx="50%"
                            cy="50%"
                            outerRadius={70}
                            label={({ operation, percent }) => `${operation} ${(percent * 100).toFixed(0)}%`}
                            labelLine={false}
                          >
                            {stats.topOperations.map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Recent Access Events (7d)</CardTitle>
                  <CardDescription>{(accessEvents?.length || 0).toLocaleString()} events</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Container</TableHead>
                        <TableHead>Operation</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Resource</TableHead>
                        <TableHead>Content Type</TableHead>
                        <TableHead>Sensitivity</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(accessEvents || []).slice(0, 100).map((e: any) => (
                        <TableRow key={e.id}>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{timeAgo(e.timestamp)}</TableCell>
                          <TableCell className="text-xs max-w-[120px] truncate">{e.containerName || e.containerId}</TableCell>
                          <TableCell className="font-mono text-xs">{e.operation}</TableCell>
                          <TableCell className="text-xs">{e.userEmail || e.userId || "—"}</TableCell>
                          <TableCell className="text-xs max-w-[150px] truncate">{e.resourceName || "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{e.contentType || "—"}</TableCell>
                          <TableCell>
                            {e.sensitivityLabel
                              ? <Badge variant="outline" className="text-xs"><Lock className="h-2.5 w-2.5 mr-1" />{e.sensitivityLabel}</Badge>
                              : <span className="text-muted-foreground text-xs">—</span>}
                          </TableCell>
                          <TableCell>
                            {e.success
                              ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                              : <AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
                          </TableCell>
                        </TableRow>
                      ))}
                      {(accessEvents?.length || 0) === 0 && (
                        <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No access events collected yet</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ---- Security Events Tab ---- */}
            <TabsContent value="security" className="space-y-4">
              <div className="flex items-center gap-3">
                <Select value={securitySeverity} onValueChange={setSecuritySeverity}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="All severities" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Severities</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground">{(securityEvents?.length || 0)} events</span>
              </div>

              <Card>
                <CardContent className="pt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Event Type</TableHead>
                        <TableHead>Severity</TableHead>
                        <TableHead>Container</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Resource</TableHead>
                        <TableHead>Description</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {secLoading && (
                        <TableRow><TableCell colSpan={7} className="text-center py-8">Loading…</TableCell></TableRow>
                      )}
                      {!secLoading && (securityEvents || []).length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8">
                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                              <Shield className="h-8 w-8 text-green-500" />
                              <p>No security events detected</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                      {(securityEvents || []).map((e: any) => (
                        <TableRow key={e.id}>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{timeAgo(e.timestamp)}</TableCell>
                          <TableCell className="font-mono text-xs">{e.eventType}</TableCell>
                          <TableCell>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SEVERITY_COLORS[e.severity] || ""}`}>
                              {e.severity}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs max-w-[120px] truncate">{e.containerName || e.containerId || "—"}</TableCell>
                          <TableCell className="text-xs">{e.userEmail || e.userId || "—"}</TableCell>
                          <TableCell className="text-xs max-w-[130px] truncate">{e.resourceName || "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[280px] truncate">{e.description}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ---- Content Types & Metadata Tab ---- */}
            <TabsContent value="content-types" className="space-y-4">
              <div className="grid md:grid-cols-2 gap-6">
                {globalCtData.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Content Type Distribution — Tenant</CardTitle>
                      <CardDescription>Item count by MIME type across all containers</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={globalCtData} layout="vertical" margin={{ left: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 11 }} />
                          <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={110} />
                          <Tooltip />
                          <Bar dataKey="value" fill="#a78bfa" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Metadata Coverage by Container</CardTitle>
                    <CardDescription>Items with custom metadata vs. total items</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {(containers || []).slice(0, 6).map((c: any) => {
                        const containerStats = (contentTypeStats || []).filter(s => s.containerId === c.containerId);
                        const totalItems = containerStats.reduce((sum, s) => sum + (s.itemCount || 0), 0);
                        const withMetadata = containerStats.reduce((sum, s) => sum + (s.withMetadataCount || 0), 0);
                        const pct = totalItems > 0 ? Math.round((withMetadata / totalItems) * 100) : 0;
                        return (
                          <div key={c.id} className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="truncate max-w-[200px]">{c.displayName}</span>
                              <span className="text-muted-foreground">{withMetadata}/{totalItems} items ({pct}%)</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                      {(containers || []).length === 0 && (
                        <p className="text-sm text-muted-foreground py-4 text-center">No container data available</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Content Type Detail — All Containers</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Container</TableHead>
                        <TableHead>Content Type</TableHead>
                        <TableHead>Item Count</TableHead>
                        <TableHead>Total Size</TableHead>
                        <TableHead>Avg Size</TableHead>
                        <TableHead>With Sensitivity</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(contentTypeStats || []).length === 0 && (
                        <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No content type stats collected yet</TableCell></TableRow>
                      )}
                      {(contentTypeStats || []).map((s: any) => (
                        <TableRow key={s.id}>
                          <TableCell className="text-xs max-w-[130px] truncate">{s.containerName || s.containerId}</TableCell>
                          <TableCell className="font-mono text-xs">{s.contentType}</TableCell>
                          <TableCell className="text-xs">{(s.itemCount || 0).toLocaleString()}</TableCell>
                          <TableCell className="text-xs">{formatBytes(s.totalSizeBytes || 0)}</TableCell>
                          <TableCell className="text-xs">{s.avgSizeBytes ? formatBytes(s.avgSizeBytes) : "—"}</TableCell>
                          <TableCell className="text-xs">{s.withSensitivityCount || 0}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{s.reportDate || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </Shell>
  );
}
