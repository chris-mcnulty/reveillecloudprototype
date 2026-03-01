import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Activity, Gauge, Clock, AlertCircle, CheckCircle2, TrendingUp, TrendingDown } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
} from "recharts";
import { useMetrics, useTenantTestRuns, useLatestUsageReport, useServiceHealth } from "@/lib/api";
import { useActiveTenant } from "@/lib/tenant-context";

const CHART_COLORS = {
  primary: "hsl(var(--primary))",
  purple: "#8b5cf6",
  green: "#10b981",
  amber: "#f59e0b",
  cyan: "#06b6d4",
  rose: "#f43f5e",
};

const tooltipStyle = {
  backgroundColor: 'hsl(var(--background))',
  borderColor: 'hsl(var(--border))',
  borderRadius: '8px',
};

export default function Performance() {
  const { activeTenantId } = useActiveTenant();
  const tenantId = activeTenantId;

  const { data: allMetrics, isLoading: loadingMetrics } = useMetrics(tenantId);
  const { data: testRuns, isLoading: loadingRuns } = useTenantTestRuns(tenantId);
  const { data: siteUsageReport } = useLatestUsageReport(tenantId, "siteUsageDetail");
  const { data: activeUsersReport } = useLatestUsageReport(tenantId, "activeUsers");
  const { data: serviceHealth } = useServiceHealth();

  if (loadingMetrics || loadingRuns) {
    return (
      <Shell>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Shell>
    );
  }

  const metrics = allMetrics || [];
  const runs = testRuns || [];
  const syntheticData = buildSyntheticTimeSeries(metrics);
  const phaseData = buildPhaseBreakdowns(runs);
  const successRate = computeSuccessRate(runs);
  const latencyTrend = computeLatencyTrend(metrics);

  const activeIncidents = (serviceHealth || []).filter((i: any) =>
    i.status !== "serviceRestored" && i.status !== "resolved" && i.status !== "postIncidentReviewPublished"
  );

  return (
    <Shell>
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 data-testid="text-page-title" className="text-2xl font-bold tracking-tight">Performance Explorer</h2>
          <p className="text-muted-foreground">
            Synthetic test performance, real API phase timings, and Graph usage insights.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4 mt-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            {successRate >= 90 ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <AlertCircle className="h-4 w-4 text-destructive" />}
          </CardHeader>
          <CardContent>
            <div data-testid="text-success-rate" className="text-2xl font-bold">{successRate}%</div>
            <p className="text-xs text-muted-foreground mt-1">Last 24h synthetic tests</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg Latency</CardTitle>
            <Gauge className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div data-testid="text-avg-latency" className="text-2xl font-bold">{latencyTrend.current}ms</div>
            <p className="text-xs text-muted-foreground flex items-center mt-1">
              {latencyTrend.direction === "down" ? (
                <><TrendingDown className="h-3 w-3 mr-1 text-emerald-500" />{latencyTrend.change}ms faster</>
              ) : latencyTrend.direction === "up" ? (
                <><TrendingUp className="h-3 w-3 mr-1 text-destructive" />{latencyTrend.change}ms slower</>
              ) : <>Stable</>}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Tests</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div data-testid="text-total-runs" className="text-2xl font-bold">{runs.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Test runs recorded</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Service Health</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div data-testid="text-incidents" className={`text-2xl font-bold ${activeIncidents.length > 0 ? "text-amber-500" : "text-emerald-500"}`}>
              {activeIncidents.length > 0 ? `${activeIncidents.length} Active` : "Healthy"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">M365 SharePoint incidents</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="synthetic" className="space-y-4 mt-4">
        <TabsList>
          <TabsTrigger value="synthetic" data-testid="tab-synthetic">Synthetic Latency</TabsTrigger>
          <TabsTrigger value="phases" data-testid="tab-phases">API Phase Breakdown</TabsTrigger>
          <TabsTrigger value="distribution" data-testid="tab-distribution">By Site</TabsTrigger>
          <TabsTrigger value="insights" data-testid="tab-insights">Usage Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="synthetic" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Synthetic Transaction Latency</CardTitle>
              <CardDescription>
                Compare different test types (Page Load vs File Transfer vs Search)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={syntheticData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="time" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}ms`} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend />
                    <Line type="monotone" dataKey="Page Load" stroke={CHART_COLORS.primary} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="File Transfer" stroke={CHART_COLORS.purple} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="Search" stroke={CHART_COLORS.green} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="Authentication" stroke={CHART_COLORS.amber} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="phases" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Page Load Phases</CardTitle>
                <CardDescription>Real Graph API timings: site resolution vs list enumeration</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={phaseData.pageLoad} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="time" stroke="#888888" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="#888888" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}ms`} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend />
                      <Bar dataKey="siteResolution" name="Site Resolution" stackId="a" fill={CHART_COLORS.cyan} />
                      <Bar dataKey="listEnum" name="List Enumeration" stackId="a" fill={CHART_COLORS.primary} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>File Transfer Phases</CardTitle>
                <CardDescription>Real timings: drive resolve, upload, download, cleanup</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={phaseData.fileTransfer} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="time" stroke="#888888" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="#888888" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}ms`} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend />
                      <Bar dataKey="driveResolve" name="Drive Resolve" stackId="a" fill={CHART_COLORS.cyan} />
                      <Bar dataKey="upload" name="Upload" stackId="a" fill={CHART_COLORS.purple} />
                      <Bar dataKey="download" name="Download" stackId="a" fill={CHART_COLORS.green} />
                      <Bar dataKey="cleanup" name="Cleanup" stackId="a" fill={CHART_COLORS.amber} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Search Performance</CardTitle>
                <CardDescription>Search API latency and result counts</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={phaseData.search} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="time" stroke="#888888" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="#888888" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}ms`} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend />
                      <Bar dataKey="searchLatency" name="Search API" fill={CHART_COLORS.green} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Authentication Performance</CardTitle>
                <CardDescription>Token acquisition vs profile fetch timings</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={phaseData.auth} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="time" stroke="#888888" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="#888888" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}ms`} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend />
                      <Bar dataKey="tokenAcquisition" name="Token Acquisition" stackId="a" fill={CHART_COLORS.amber} />
                      <Bar dataKey="profileFetch" name="Profile Fetch" stackId="a" fill={CHART_COLORS.primary} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="distribution">
          <Card>
            <CardHeader>
              <CardTitle>Latency Distribution by Site</CardTitle>
              <CardDescription>Average latency per monitored site</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={buildSiteLatency(metrics)} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="site" stroke="#888888" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}ms`} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="avgLatency" name="Avg Latency" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="insights" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Site Usage (Graph Reports)</CardTitle>
                <CardDescription>
                  {siteUsageReport
                    ? `${siteUsageReport.data?.totalSites || 0} sites from ${siteUsageReport.reportDate}`
                    : "No usage data collected yet. Requires Reports.Read.All permission."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {siteUsageReport?.data?.sites?.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Site</TableHead>
                        <TableHead>Page Views</TableHead>
                        <TableHead>Files</TableHead>
                        <TableHead>Storage</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {siteUsageReport.data.sites.slice(0, 10).map((s: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs max-w-[200px] truncate">{s.siteUrl || "N/A"}</TableCell>
                          <TableCell>{s.pageViewCount || 0}</TableCell>
                          <TableCell>{s.fileCount || 0}</TableCell>
                          <TableCell>{formatBytes(s.storageUsedBytes || 0)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No site usage data available.</p>
                    <p className="text-xs mt-1">Grant <Badge variant="outline">Reports.Read.All</Badge> permission in Azure AD.</p>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Active Users (Graph Reports)</CardTitle>
                <CardDescription>
                  {activeUsersReport
                    ? `${activeUsersReport.data?.totalActiveUsers || 0} active users`
                    : "No user activity data collected yet."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {activeUsersReport?.data?.users?.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Viewed/Edited</TableHead>
                        <TableHead>Synced</TableHead>
                        <TableHead>Shared</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeUsersReport.data.users.slice(0, 10).map((u: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs max-w-[180px] truncate">{u.userPrincipal || "N/A"}</TableCell>
                          <TableCell>{u.viewedOrEdited || 0}</TableCell>
                          <TableCell>{u.syncedFileCount || 0}</TableCell>
                          <TableCell>{(u.sharedInternallyCount || 0) + (u.sharedExternallyCount || 0)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No user activity data available.</p>
                    <p className="text-xs mt-1">Grant <Badge variant="outline">Reports.Read.All</Badge> permission in Azure AD.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          {activeIncidents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-amber-500">Active M365 Incidents</CardTitle>
                <CardDescription>These incidents may be impacting performance measurements</CardDescription>
              </CardHeader>
              <CardContent>
                {activeIncidents.slice(0, 5).map((inc: any) => (
                  <div key={inc.id} className="flex items-start gap-2 py-2 border-b last:border-0">
                    <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{inc.title}</p>
                      <p className="text-xs text-muted-foreground">{inc.service} - {inc.status}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </Shell>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

function buildSyntheticTimeSeries(metrics: any[]) {
  const buckets: Record<string, Record<string, number[]>> = {};
  metrics.forEach((m) => {
    const d = new Date(m.timestamp);
    const key = `${String(d.getHours()).padStart(2, '0')}:${String(Math.floor(d.getMinutes() / 15) * 15).padStart(2, '0')}`;
    if (!buckets[key]) buckets[key] = { "Page Load": [], "File Transfer": [], "Search": [], "Authentication": [] };
    if (m.metricName === "page_load") buckets[key]["Page Load"].push(m.value);
    else if (m.metricName === "file_transfer") buckets[key]["File Transfer"].push(m.value);
    else if (m.metricName === "search") buckets[key]["Search"].push(m.value);
    else if (m.metricName === "authentication") buckets[key]["Authentication"].push(m.value);
  });
  const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, v]) => ({
      time,
      "Page Load": avg(v["Page Load"]),
      "File Transfer": avg(v["File Transfer"]),
      "Search": avg(v["Search"]),
      "Authentication": avg(v["Authentication"]),
    }));
}

function buildPhaseBreakdowns(runs: any[]) {
  const fmt = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  const successRuns = runs.filter(r => r.status === "success" && r.results);

  const pageLoadRuns = successRuns
    .filter(r => r.results?.siteResolutionMs !== undefined)
    .slice(-12)
    .map(r => ({
      time: fmt(new Date(r.startedAt)),
      siteResolution: r.results.siteResolutionMs || 0,
      listEnum: r.results.listsEnumerationMs || 0,
    }));

  const fileTransferRuns = successRuns
    .filter(r => r.results?.driveResolveMs !== undefined)
    .slice(-12)
    .map(r => ({
      time: fmt(new Date(r.startedAt)),
      driveResolve: r.results.driveResolveMs || 0,
      upload: r.results.uploadMs || 0,
      download: r.results.downloadMs || 0,
      cleanup: r.results.cleanupMs || 0,
    }));

  const searchRuns = successRuns
    .filter(r => r.results?.searchLatencyMs !== undefined)
    .slice(-12)
    .map(r => ({
      time: fmt(new Date(r.startedAt)),
      searchLatency: r.results.searchLatencyMs || 0,
      results: r.results.totalResults || 0,
    }));

  const authRuns = successRuns
    .filter(r => r.results?.tokenAcquisitionMs !== undefined)
    .slice(-12)
    .map(r => ({
      time: fmt(new Date(r.startedAt)),
      tokenAcquisition: r.results.tokenAcquisitionMs || 0,
      profileFetch: r.results.profileFetchMs || 0,
    }));

  return { pageLoad: pageLoadRuns, fileTransfer: fileTransferRuns, search: searchRuns, auth: authRuns };
}

function buildSiteLatency(metrics: any[]) {
  const sites: Record<string, number[]> = {};
  metrics.forEach((m) => {
    let site = m.site || "Unknown";
    try { site = new URL(site).hostname; } catch {}
    if (!sites[site]) sites[site] = [];
    sites[site].push(m.value);
  });
  return Object.entries(sites).map(([site, vals]) => ({
    site: site.length > 30 ? site.substring(0, 27) + "..." : site,
    avgLatency: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
  })).sort((a, b) => b.avgLatency - a.avgLatency);
}

function computeSuccessRate(runs: any[]): number {
  if (runs.length === 0) return 100;
  const successful = runs.filter(r => r.status === "success").length;
  return Math.round((successful / runs.length) * 100);
}

function computeLatencyTrend(metrics: any[]): { current: number; change: number; direction: "up" | "down" | "stable" } {
  if (metrics.length === 0) return { current: 0, change: 0, direction: "stable" };
  const sorted = [...metrics].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const recent = sorted.slice(0, Math.ceil(sorted.length / 2));
  const older = sorted.slice(Math.ceil(sorted.length / 2));
  const avgRecent = recent.length > 0 ? Math.round(recent.reduce((s, m) => s + m.value, 0) / recent.length) : 0;
  const avgOlder = older.length > 0 ? Math.round(older.reduce((s, m) => s + m.value, 0) / older.length) : avgRecent;
  const change = Math.abs(avgRecent - avgOlder);
  const direction = change < 20 ? "stable" : avgRecent < avgOlder ? "down" : "up";
  return { current: avgRecent, change, direction };
}
