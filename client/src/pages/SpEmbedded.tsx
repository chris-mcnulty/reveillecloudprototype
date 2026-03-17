import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  HardDrive, Box, Shield, FileText, Activity,
  AlertTriangle, CheckCircle2, XCircle, Database,
} from "lucide-react";
import { useActiveTenant } from "@/lib/tenant-context";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];

function formatBytes(bytes: number | null): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
  return `${val.toFixed(1)} ${units[i]}`;
}

function formatTimeAgo(date: string | Date | null): string {
  if (!date) return "—";
  const d = new Date(date);
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export default function SpEmbedded() {
  const { activeTenantId } = useActiveTenant();
  const [activeTab, setActiveTab] = useState("overview");

  const { data: stats } = useQuery({
    queryKey: ["/api/tenants", activeTenantId, "spe", "stats"],
    queryFn: () => fetch(`/api/tenants/${activeTenantId}/spe/stats`).then(r => r.json()),
    enabled: !!activeTenantId,
    refetchInterval: 60000,
  });

  const { data: containers } = useQuery({
    queryKey: ["/api/tenants", activeTenantId, "spe", "containers"],
    queryFn: () => fetch(`/api/tenants/${activeTenantId}/spe/containers`).then(r => r.json()),
    enabled: !!activeTenantId,
  });

  const { data: accessEvents } = useQuery({
    queryKey: ["/api/tenants", activeTenantId, "spe", "access-events"],
    queryFn: () => fetch(`/api/tenants/${activeTenantId}/spe/access-events?limit=100`).then(r => r.json()),
    enabled: !!activeTenantId && activeTab === "access",
  });

  const { data: securityEvents } = useQuery({
    queryKey: ["/api/tenants", activeTenantId, "spe", "security-events"],
    queryFn: () => fetch(`/api/tenants/${activeTenantId}/spe/security-events?limit=100`).then(r => r.json()),
    enabled: !!activeTenantId && activeTab === "security",
  });

  if (!activeTenantId) {
    return (
      <Shell title="SharePoint Embedded">
        <div className="flex items-center justify-center h-64 text-muted-foreground" data-testid="text-no-tenant">
          Select a tenant to view SharePoint Embedded data
        </div>
      </Shell>
    );
  }

  const hasData = stats && stats.totalContainers > 0;

  return (
    <Shell title="SharePoint Embedded">
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Containers</CardTitle>
              <HardDrive className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-containers">{stats?.totalContainers ?? 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Storage</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-storage">{formatBytes(stats?.totalStorageBytes ?? 0)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Items</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-items">{stats?.totalItems ?? 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Access Events (24h)</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-access-events">{stats?.accessEventsLast24h ?? 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Security Events (24h)</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-security-events">{stats?.securityEventsLast24h ?? 0}</div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="containers" data-testid="tab-containers">Containers</TabsTrigger>
            <TabsTrigger value="access" data-testid="tab-access">Access Events</TabsTrigger>
            <TabsTrigger value="security" data-testid="tab-security">Security Events</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {!hasData ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <HardDrive className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No SharePoint Embedded Data Yet</h3>
                  <p className="text-muted-foreground max-w-md">
                    SPE data will appear here once containers are provisioned and the collector runs.
                    The collector runs every 30 minutes for connected tenants with Azure configured.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {stats?.topOperations?.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Top Operations (24h)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={stats.topOperations}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="operation" tick={{ fontSize: 11 }} />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}
                {stats?.securityEventsBySeverity?.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Security Events by Severity</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                          <Pie
                            data={stats.securityEventsBySeverity}
                            dataKey="count"
                            nameKey="severity"
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            label={({ severity, count }: any) => `${severity}: ${count}`}
                          >
                            {stats.securityEventsBySeverity.map((_: any, i: number) => (
                              <Cell key={i} fill={COLORS[i % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}
                {stats?.topContainers?.length > 0 && (
                  <Card className="lg:col-span-2">
                    <CardHeader>
                      <CardTitle className="text-base">Most Active Containers (24h)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Container</TableHead>
                            <TableHead className="text-right">Access Count</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {stats.topContainers.map((c: any) => (
                            <TableRow key={c.containerId}>
                              <TableCell className="font-medium">{c.displayName}</TableCell>
                              <TableCell className="text-right">{c.accessCount}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="containers">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Container Inventory</CardTitle>
              </CardHeader>
              <CardContent>
                {!containers?.length ? (
                  <p className="text-muted-foreground text-center py-8">No containers found</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Storage</TableHead>
                        <TableHead>Items</TableHead>
                        <TableHead>Owner App</TableHead>
                        <TableHead>Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {containers.map((c: any) => (
                        <TableRow key={c.id} data-testid={`row-container-${c.id}`}>
                          <TableCell className="font-medium">{c.displayName}</TableCell>
                          <TableCell>
                            <Badge variant={c.status === "active" ? "default" : "secondary"}>
                              {c.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatBytes(c.storageBytes)}</TableCell>
                          <TableCell>{c.itemCount ?? "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{c.ownerAppId || "—"}</TableCell>
                          <TableCell>{c.createdAt ? formatTimeAgo(c.createdAt) : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="access">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent Access Events</CardTitle>
              </CardHeader>
              <CardContent>
                {!accessEvents?.length ? (
                  <p className="text-muted-foreground text-center py-8">No access events recorded yet</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Operation</TableHead>
                        <TableHead>Container</TableHead>
                        <TableHead>Resource</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Duration</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {accessEvents.map((e: any) => (
                        <TableRow key={e.id} data-testid={`row-access-${e.id}`}>
                          <TableCell className="text-xs">{formatTimeAgo(e.timestamp)}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{e.operation}</Badge>
                          </TableCell>
                          <TableCell className="text-sm">{e.containerName || e.containerId}</TableCell>
                          <TableCell className="text-sm truncate max-w-[200px]">{e.resourceName || e.resourcePath || "—"}</TableCell>
                          <TableCell className="text-xs">{e.userEmail || e.userId || "—"}</TableCell>
                          <TableCell>
                            {e.success ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-500" />
                            )}
                          </TableCell>
                          <TableCell className="text-xs">{e.durationMs ? `${Math.round(e.durationMs)}ms` : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Security Events</CardTitle>
              </CardHeader>
              <CardContent>
                {!securityEvents?.length ? (
                  <p className="text-muted-foreground text-center py-8">No security events recorded yet</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Severity</TableHead>
                        <TableHead>Container</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Description</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {securityEvents.map((e: any) => (
                        <TableRow key={e.id} data-testid={`row-security-${e.id}`}>
                          <TableCell className="text-xs">{formatTimeAgo(e.timestamp)}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{e.eventType}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={
                              e.severity === "critical" ? "destructive" :
                              e.severity === "high" ? "destructive" :
                              e.severity === "medium" ? "default" : "secondary"
                            }>
                              {e.severity}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{e.containerName || e.containerId || "—"}</TableCell>
                          <TableCell className="text-xs">{e.userEmail || e.userId || "—"}</TableCell>
                          <TableCell className="text-sm truncate max-w-[300px]">{e.description || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Shell>
  );
}
