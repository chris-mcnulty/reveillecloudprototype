import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Fingerprint, ShieldCheck, ShieldAlert, ShieldX, Users, TrendingUp,
  AlertTriangle, CheckCircle2, XCircle, Globe, Monitor, Smartphone,
  RefreshCw, Database, Clock, MapPin, Search, Activity, Lock,
} from "lucide-react";
import { useActiveTenant } from "@/lib/tenant-context";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from "recharts";

function formatTimeAgo(date: string | Date | null): string {
  if (!date) return "—";
  const d = new Date(date);
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function formatTime(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const STATUS_COLORS: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  failure: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  interrupted: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};

const RISK_COLORS: Record<string, string> = {
  none: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  low: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  medium: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  high: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  hidden: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
};

const PIE_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

export default function EntraSignIns() {
  const { activeTenantId } = useActiveTenant();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [appFilter, setAppFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<string | null>(null);

  const { data: stats } = useQuery({
    queryKey: ["/api/tenants", activeTenantId, "entra-signins", "stats"],
    queryFn: () => fetch(`/api/tenants/${activeTenantId}/entra-signins/stats`).then(r => r.json()),
    enabled: !!activeTenantId,
    refetchInterval: 60000,
  });

  const { data: signIns = [], isLoading } = useQuery({
    queryKey: ["/api/tenants", activeTenantId, "entra-signins", statusFilter, riskFilter, appFilter, selectedUser],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "200" });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (riskFilter !== "all") params.set("riskLevel", riskFilter);
      if (appFilter !== "all") params.set("appName", appFilter);
      if (selectedUser) params.set("userId", selectedUser);
      return fetch(`/api/tenants/${activeTenantId}/entra-signins?${params}`).then(r => r.json());
    },
    enabled: !!activeTenantId,
    refetchInterval: 60000,
  });

  const { data: userBreakdown = [] } = useQuery({
    queryKey: ["/api/tenants", activeTenantId, "entra-signins", "users"],
    queryFn: () => fetch(`/api/tenants/${activeTenantId}/entra-signins/users`).then(r => r.json()),
    enabled: !!activeTenantId,
  });

  const seedMutation = useMutation({
    mutationFn: () => fetch(`/api/tenants/${activeTenantId}/entra-signins/seed-demo`, { method: "POST" }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", activeTenantId, "entra-signins"] });
    },
  });

  const collectMutation = useMutation({
    mutationFn: () => fetch(`/api/tenants/${activeTenantId}/entra-signins/collect`, { method: "POST" }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", activeTenantId, "entra-signins"] });
    },
  });

  const filteredSignIns = useMemo(() => {
    if (!searchQuery) return signIns;
    const q = searchQuery.toLowerCase();
    return signIns.filter((s: any) =>
      (s.userPrincipalName || "").toLowerCase().includes(q) ||
      (s.userDisplayName || "").toLowerCase().includes(q) ||
      (s.ipAddress || "").includes(q) ||
      (s.appDisplayName || "").toLowerCase().includes(q)
    );
  }, [signIns, searchQuery]);

  const trendData = useMemo(() => {
    if (!stats?.trend) return [];
    return stats.trend.map((t: any) => ({
      hour: new Date(t.hour).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
      Success: t.success,
      Failed: t.failure,
    }));
  }, [stats?.trend]);

  const appPieData = useMemo(() => {
    if (!stats?.topApps) return [];
    return stats.topApps.map((a: any) => ({ name: a.app, value: a.count }));
  }, [stats?.topApps]);

  const uniqueApps = useMemo(() => {
    const apps = new Set<string>();
    signIns.forEach((s: any) => { if (s.appDisplayName) apps.add(s.appDisplayName); });
    return Array.from(apps).sort();
  }, [signIns]);

  const isEmpty = !isLoading && signIns.length === 0 && !stats?.totalSignIns;

  return (
    <Shell>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Fingerprint className="h-7 w-7 text-blue-500" />
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Entra ID Sign-Ins</h1>
            <p className="text-sm text-muted-foreground">Microsoft Entra identity and access monitoring</p>
          </div>
          {stats?.totalSignIns > 0 && (
            <Badge variant="outline" className="ml-2 gap-1 text-emerald-600 border-emerald-300">
              <Activity className="h-3 w-3" /> Live
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => collectMutation.mutate()}
            disabled={collectMutation.isPending}
            data-testid="button-collect"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${collectMutation.isPending ? "animate-spin" : ""}`} />
            Collect Now
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
            data-testid="button-seed-demo"
          >
            <Database className="h-4 w-4 mr-1" />
            Seed Demo
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/tenants", activeTenantId, "entra-signins"] })}
            data-testid="button-refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isEmpty ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Fingerprint className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h2 className="text-xl font-semibold mb-2">No Entra Sign-In Data</h2>
            <p className="text-muted-foreground max-w-md mb-6">
              Collect sign-in data from Microsoft Entra ID via the Graph API, or seed demo data to explore the dashboard.
            </p>
            <div className="flex gap-3">
              <Button onClick={() => collectMutation.mutate()} disabled={collectMutation.isPending} data-testid="button-collect-empty">
                <RefreshCw className="h-4 w-4 mr-2" /> Collect from Graph API
              </Button>
              <Button variant="outline" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending} data-testid="button-seed-empty">
                <Database className="h-4 w-4 mr-2" /> Seed Demo Data
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Users className="h-4 w-4" /> Total Sign-Ins
                </div>
                <div className="text-2xl font-bold" data-testid="text-total-signins">{stats?.totalSignIns?.toLocaleString() || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Fingerprint className="h-4 w-4" /> Unique Users
                </div>
                <div className="text-2xl font-bold" data-testid="text-unique-users">{stats?.uniqueUsers || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <XCircle className="h-4 w-4 text-red-500" /> Failed
                </div>
                <div className="text-2xl font-bold text-red-600" data-testid="text-failures">{stats?.failureCount || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Lock className="h-4 w-4 text-blue-500" /> MFA Rate
                </div>
                <div className="text-2xl font-bold" data-testid="text-mfa-rate">{(stats?.mfaRate || 0).toFixed(1)}%</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <ShieldAlert className="h-4 w-4 text-orange-500" /> Risky
                </div>
                <div className="text-2xl font-bold text-orange-600" data-testid="text-risky">{stats?.riskySignIns || 0}</div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList>
              <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
              <TabsTrigger value="signins" data-testid="tab-signins">Sign-In Log</TabsTrigger>
              <TabsTrigger value="users" data-testid="tab-users">Users</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" /> Sign-In Trend (24h)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {trendData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={trendData}>
                          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                          <XAxis dataKey="hour" fontSize={11} />
                          <YAxis fontSize={11} />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="Success" stackId="a" fill="#10b981" radius={[2, 2, 0, 0]} />
                          <Bar dataKey="Failed" stackId="a" fill="#ef4444" radius={[2, 2, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                        No trend data available
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Monitor className="h-4 w-4" /> Top Applications
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {appPieData.length > 0 ? (
                      <div className="flex items-center gap-4">
                        <ResponsiveContainer width="50%" height={250}>
                          <PieChart>
                            <Pie data={appPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50}>
                              {appPieData.map((_: any, i: number) => (
                                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="flex-1 space-y-2">
                          {appPieData.slice(0, 6).map((app: any, i: number) => (
                            <div key={app.name} className="flex items-center gap-2 text-sm">
                              <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                              <span className="truncate flex-1">{app.name}</span>
                              <span className="font-mono text-muted-foreground">{app.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                        No app data available
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <MapPin className="h-4 w-4" /> Top Locations
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {(stats?.topLocations || []).slice(0, 8).map((loc: any, i: number) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{loc.location}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-500 rounded-full"
                                style={{ width: `${stats?.topLocations?.[0]?.count ? (loc.count / stats.topLocations[0].count) * 100 : 0}%` }}
                              />
                            </div>
                            <span className="font-mono text-muted-foreground w-8 text-right">{loc.count}</span>
                          </div>
                        </div>
                      ))}
                      {(!stats?.topLocations || stats.topLocations.length === 0) && (
                        <p className="text-sm text-muted-foreground text-center py-4">No location data</p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4" /> Recent Failures
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {signIns
                        .filter((s: any) => s.status === "failure")
                        .slice(0, 6)
                        .map((s: any, i: number) => (
                          <div key={i} className="flex items-center justify-between text-sm border-b border-border/50 pb-2">
                            <div>
                              <div className="font-medium">{s.userDisplayName || s.userPrincipalName}</div>
                              <div className="text-xs text-muted-foreground">{s.appDisplayName} • {s.failureReason || `Error ${s.errorCode}`}</div>
                            </div>
                            <span className="text-xs text-muted-foreground">{formatTimeAgo(s.signInAt)}</span>
                          </div>
                        ))}
                      {signIns.filter((s: any) => s.status === "failure").length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">No recent failures</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="signins" className="space-y-4">
              <div className="flex flex-wrap gap-3 items-center">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search users, apps, IPs..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                    data-testid="input-search"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px]" data-testid="select-status">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="success">Success</SelectItem>
                    <SelectItem value="failure">Failed</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={riskFilter} onValueChange={setRiskFilter}>
                  <SelectTrigger className="w-[140px]" data-testid="select-risk">
                    <SelectValue placeholder="Risk" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Risk</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={appFilter} onValueChange={setAppFilter}>
                  <SelectTrigger className="w-[180px]" data-testid="select-app">
                    <SelectValue placeholder="Application" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Apps</SelectItem>
                    {uniqueApps.map(app => (
                      <SelectItem key={app} value={app}>{app}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedUser && (
                  <Button variant="ghost" size="sm" onClick={() => setSelectedUser(null)} data-testid="button-clear-user">
                    Clear user filter
                  </Button>
                )}
              </div>

              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Application</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Risk</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>IP Address</TableHead>
                        <TableHead>MFA</TableHead>
                        <TableHead>Device</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSignIns.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                            No sign-in records match your filters
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredSignIns.map((s: any, idx: number) => (
                          <TableRow key={s.id || idx} data-testid={`row-signin-${idx}`}>
                            <TableCell className="text-xs whitespace-nowrap">
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3 text-muted-foreground" />
                                {formatTime(s.signInAt)}
                              </div>
                              {!s.isInteractive && (
                                <Badge variant="outline" className="text-[10px] mt-0.5">Non-interactive</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <button
                                className="text-left hover:underline"
                                onClick={() => setSelectedUser(s.userId)}
                                data-testid={`button-user-${idx}`}
                              >
                                <div className="font-medium text-sm">{s.userDisplayName || "—"}</div>
                                <div className="text-xs text-muted-foreground">{s.userPrincipalName}</div>
                              </button>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">{s.appDisplayName || "—"}</div>
                              <div className="text-xs text-muted-foreground">{s.clientAppUsed}</div>
                            </TableCell>
                            <TableCell>
                              <Badge className={`${STATUS_COLORS[s.status] || STATUS_COLORS.success} text-xs`}>
                                {s.status === "success" ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                                {s.status}
                              </Badge>
                              {s.failureReason && (
                                <div className="text-[10px] text-red-500 mt-0.5 max-w-[150px] truncate" title={s.failureReason}>
                                  {s.failureReason}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge className={`${RISK_COLORS[s.riskLevel] || RISK_COLORS.none} text-xs`}>
                                {s.riskLevel === "none" ? (
                                  <ShieldCheck className="h-3 w-3 mr-1" />
                                ) : s.riskLevel === "high" ? (
                                  <ShieldX className="h-3 w-3 mr-1" />
                                ) : (
                                  <ShieldAlert className="h-3 w-3 mr-1" />
                                )}
                                {s.riskLevel}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs">
                              {s.city ? (
                                <div className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3 text-muted-foreground" />
                                  {s.city}{s.countryOrRegion ? `, ${s.countryOrRegion}` : ""}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs font-mono">{s.ipAddress || "—"}</TableCell>
                            <TableCell>
                              {s.mfaRequired ? (
                                <Badge variant="outline" className="text-xs gap-1">
                                  <Lock className="h-3 w-3" />
                                  {s.mfaResult === "succeeded" ? "✓" : s.mfaResult === "denied" ? "✗" : s.mfaResult || "req"}
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs">
                              {s.deviceOS && (
                                <div className="flex items-center gap-1">
                                  {s.deviceOS?.includes("iOS") || s.deviceOS?.includes("Android") ? (
                                    <Smartphone className="h-3 w-3 text-muted-foreground" />
                                  ) : (
                                    <Monitor className="h-3 w-3 text-muted-foreground" />
                                  )}
                                  {s.deviceOS}
                                </div>
                              )}
                              {s.deviceBrowser && (
                                <div className="text-[10px] text-muted-foreground">{s.deviceBrowser}</div>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              <div className="text-xs text-muted-foreground text-right">
                Showing {filteredSignIns.length} of {signIns.length} sign-in records
              </div>
            </TabsContent>

            <TabsContent value="users" className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">User Sign-In Activity</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead className="text-right">Total Logins</TableHead>
                        <TableHead className="text-right">Failures</TableHead>
                        <TableHead className="text-right">Failure Rate</TableHead>
                        <TableHead className="text-right">Risk Events</TableHead>
                        <TableHead>Last Login</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {userBreakdown.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                            No user data available
                          </TableCell>
                        </TableRow>
                      ) : (
                        userBreakdown.map((u: any, idx: number) => {
                          const failRate = u.loginCount > 0 ? ((u.failureCount / u.loginCount) * 100) : 0;
                          return (
                            <TableRow key={u.userId} data-testid={`row-user-${idx}`}>
                              <TableCell>
                                <div className="font-medium text-sm">{u.userDisplayName || "—"}</div>
                                <div className="text-xs text-muted-foreground">{u.userPrincipalName}</div>
                              </TableCell>
                              <TableCell className="text-right font-mono">{u.loginCount}</TableCell>
                              <TableCell className="text-right font-mono">
                                <span className={u.failureCount > 0 ? "text-red-600" : ""}>{u.failureCount}</span>
                              </TableCell>
                              <TableCell className="text-right">
                                <Badge className={failRate > 20 ? "bg-red-100 text-red-700" : failRate > 5 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}>
                                  {failRate.toFixed(1)}%
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                {u.riskEvents > 0 ? (
                                  <Badge className="bg-orange-100 text-orange-700 gap-1">
                                    <AlertTriangle className="h-3 w-3" /> {u.riskEvents}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground">0</span>
                                )}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {u.lastLogin ? formatTimeAgo(u.lastLogin) : "—"}
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => { setSelectedUser(u.userId); }}
                                  data-testid={`button-view-user-${idx}`}
                                >
                                  View
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
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
