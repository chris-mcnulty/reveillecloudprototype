import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, FileUp, Globe, TrendingDown, TrendingUp, AlertTriangle, Loader2, HardDrive, Users, Activity, ShieldAlert } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, PieChart, Pie, Cell,
} from "recharts";
import { useMetrics, useMetricsSummary, useLatestMetrics, useLatestUsageReport, useServiceHealth } from "@/lib/api";
import { useActiveTenant } from "@/lib/tenant-context";

const CHART_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#14b8a6"];

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

export default function Dashboard() {
  const { activeTenantId, orgTenants } = useActiveTenant();
  const tenantId = activeTenantId;
  const tenant = orgTenants?.find(t => t.id === tenantId);

  const { data: allMetrics, isLoading: loadingMetrics } = useMetrics(tenantId);
  const { data: summary, isLoading: loadingSummary } = useMetricsSummary(tenantId);
  const { data: latestMetrics } = useLatestMetrics(tenantId, 20);
  const { data: siteUsage } = useLatestUsageReport(tenantId, "siteUsageDetail");
  const { data: storageUsage } = useLatestUsageReport(tenantId, "storageUsage");
  const { data: activeUsers } = useLatestUsageReport(tenantId, "activeUsers");
  const { data: fileActivity } = useLatestUsageReport(tenantId, "fileActivity");
  const { data: teamsActivity } = useLatestUsageReport(tenantId, "teamsActivity");
  const { data: serviceHealthData } = useServiceHealth();

  if (!tenantId || loadingMetrics || loadingSummary) {
    return (
      <Shell>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Shell>
    );
  }

  const performanceData = buildTimeSeriesData(allMetrics || []);
  const errorData = buildErrorData(allMetrics || []);
  const recentLogs = buildRecentLogs(latestMetrics || []);

  const avgLatency = Math.round(summary?.avgLatency || 0);
  const totalTests = summary?.totalTests || 0;
  const errorCount = summary?.errorCount || 0;

  return (
    <Shell>
      <div className="mb-6">
        <h2 data-testid="text-page-title" className="text-3xl font-bold tracking-tight">{tenant?.name || "Dashboard"}</h2>
        <p className="text-muted-foreground mt-1">
          Performance monitoring and synthetic test results for this tenant.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 md:gap-8 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Average Load Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div data-testid="text-avg-latency" className="text-2xl font-bold">{avgLatency}ms</div>
            <p className="text-xs text-muted-foreground flex items-center mt-1">
              <TrendingDown className="h-3 w-3 mr-1 text-emerald-500" />
              24h average across all tests
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Tests (24h)</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div data-testid="text-total-tests" className="text-2xl font-bold">{totalTests}</div>
            <p className="text-xs text-muted-foreground flex items-center mt-1">
              <TrendingUp className="h-3 w-3 mr-1 text-emerald-500" />
              Synthetic transactions recorded
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Failed Tests</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div data-testid="text-error-count" className="text-2xl font-bold text-destructive">{errorCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              In the last 24 hours
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <FileUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTests > 0 ? ((1 - errorCount / totalTests) * 100).toFixed(1) : 100}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              Across all test types
            </p>
          </CardContent>
        </Card>
      </div>

      <M365InsightsSection
        siteUsage={siteUsage}
        storageUsage={storageUsage}
        activeUsers={activeUsers}
        fileActivity={fileActivity}
        teamsActivity={teamsActivity}
        serviceHealth={serviceHealthData || []}
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Latency Trend</CardTitle>
            <CardDescription>Average response time across synthetic transactions (24h)</CardDescription>
          </CardHeader>
          <CardContent className="pl-0">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={performanceData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorMs" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} interval={2} />
                  <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}ms`} />
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} itemStyle={{ color: 'hsl(var(--foreground))' }} formatter={(value: any, name: string) => value != null ? [`${value}ms`, name] : []} />
                  <Legend />
                  <Area type="monotone" name="Page Load" dataKey="pageLoad" stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={0.6} fill="url(#colorMs)" connectNulls />
                  <Area type="monotone" name="Search" dataKey="search" stroke="#10b981" strokeWidth={2} fillOpacity={0.3} fill="#10b981" connectNulls />
                  <Area type="monotone" name="File Transfer" dataKey="fileTransfer" stroke="#8b5cf6" strokeWidth={2} fillOpacity={0.3} fill="#8b5cf6" connectNulls />
                  <Area type="monotone" name="Authentication" dataKey="authentication" stroke="#f59e0b" strokeWidth={2} fillOpacity={0.2} fill="#f59e0b" connectNulls />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Errors by Site</CardTitle>
            <CardDescription>Sites with errors in the last 24 hours</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={errorData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="hsl(var(--border))" />
                  <XAxis type="number" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis dataKey="site" type="category" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
                  <Bar dataKey="errors" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} barSize={30} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Synthetic Transaction Logs</CardTitle>
          <CardDescription>Live feed of synthetic tests executed</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentLogs.map((log, i) => (
              <div key={i} className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0">
                <div className="flex items-center gap-4">
                  <div className={`w-2 h-2 rounded-full ${log.status === 'Success' ? 'bg-emerald-500' : 'bg-destructive'}`} />
                  <div>
                    <p className="text-sm font-medium">{log.site} - {log.type}</p>
                    <p className="text-xs text-muted-foreground">ID: {log.id.slice(0, 8)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-medium ${log.status === 'Failed' ? 'text-destructive' : ''}`}>{log.latency}</p>
                  <p className="text-xs text-muted-foreground">{log.time}</p>
                </div>
              </div>
            ))}
            {recentLogs.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No recent metrics recorded.</p>}
          </div>
        </CardContent>
      </Card>
    </Shell>
  );
}

function M365InsightsSection({ siteUsage, storageUsage, activeUsers, fileActivity, teamsActivity, serviceHealth }: {
  siteUsage: any; storageUsage: any; activeUsers: any; fileActivity: any; teamsActivity: any; serviceHealth: any[];
}) {
  const sites = siteUsage?.data?.sites || [];
  const users = activeUsers?.data?.users || [];
  const teamsUsers = teamsActivity?.data?.users || [];
  const storageDays = storageUsage?.data?.daily || [];
  const activeIncidents = (serviceHealth || []).filter((i: any) => i.status !== "resolved" && i.status !== "postIncidentReviewPublished");

  const totalSites = sites.length;
  const activeSites = sites.filter((s: any) => (s.pageViewCount || 0) > 0 || (s.activeFileCount || 0) > 0).length;
  const totalStorage = sites.reduce((sum: number, s: any) => sum + (s.storageUsedBytes || 0), 0);
  const totalFiles = sites.reduce((sum: number, s: any) => sum + (s.fileCount || 0), 0);
  const activeUserCount = users.length;
  const totalPageViews = sites.reduce((sum: number, s: any) => sum + (s.pageViewCount || 0), 0);

  const hasData = totalSites > 0 || activeUserCount > 0 || activeIncidents.length > 0;
  if (!hasData) return null;

  const storageChartData = storageDays.length > 0
    ? storageDays.map((d: any) => ({
        date: d.reportDate?.slice(5) || "",
        storageGB: Math.round((d.storageUsedBytes || 0) / (1024 * 1024 * 1024) * 100) / 100,
      }))
    : sites.filter((s: any) => s.storageUsedBytes > 0)
        .sort((a: any, b: any) => (b.storageUsedBytes || 0) - (a.storageUsedBytes || 0))
        .slice(0, 6)
        .map((s: any) => ({
          date: (s.siteUrl || "").replace(/https?:\/\/[^/]+/, '').slice(0, 15) || "/",
          storageGB: Math.round((s.storageUsedBytes || 0) / (1024 * 1024 * 1024) * 100) / 100,
        }));

  const activityPieData = [
    { name: "Page Views", value: totalPageViews },
    { name: "Active Files", value: sites.reduce((sum: number, s: any) => sum + (s.activeFileCount || 0), 0) },
    ...(teamsUsers.length > 0 ? [
      { name: "Teams Messages", value: teamsUsers.reduce((sum: number, u: any) => sum + (u.teamChatMessageCount || 0) + (u.privateChatMessageCount || 0), 0) },
      { name: "Teams Meetings", value: teamsUsers.reduce((sum: number, u: any) => sum + (u.meetingCount || 0), 0) },
    ] : []),
  ].filter(d => d.value > 0);

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">SharePoint Sites</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div data-testid="text-active-sites" className="text-2xl font-bold">{activeSites}<span className="text-sm font-normal text-muted-foreground">/{totalSites}</span></div>
            <p className="text-xs text-muted-foreground mt-1">Active sites (7-day window)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Storage Used</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div data-testid="text-total-storage" className="text-2xl font-bold">{formatBytes(totalStorage)}</div>
            <p className="text-xs text-muted-foreground mt-1">{totalFiles.toLocaleString()} files across all sites</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div data-testid="text-active-users" className="text-2xl font-bold">{activeUserCount}</div>
            <p className="text-xs text-muted-foreground mt-1">{totalPageViews.toLocaleString()} page views (7d)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Service Health</CardTitle>
            <ShieldAlert className={`h-4 w-4 ${activeIncidents.length > 0 ? "text-destructive" : "text-emerald-500"}`} />
          </CardHeader>
          <CardContent>
            <div data-testid="text-service-health" className="text-2xl font-bold">
              {activeIncidents.length > 0
                ? <span className="text-destructive">{activeIncidents.length} issue{activeIncidents.length > 1 ? "s" : ""}</span>
                : <span className="text-emerald-500">Healthy</span>}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {activeIncidents.length > 0
                ? activeIncidents.map((i: any) => i.service).filter((v: string, idx: number, arr: string[]) => arr.indexOf(v) === idx).join(", ")
                : "All M365 services operational"}
            </p>
          </CardContent>
        </Card>
      </div>

      {(storageChartData.length > 0 || activityPieData.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {storageChartData.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Storage {storageDays.length > 0 ? "Trend" : "by Site"}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[200px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={storageChartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" stroke="#888888" fontSize={10} tickLine={false} />
                      <YAxis stroke="#888888" fontSize={10} tickLine={false} tickFormatter={(v) => `${v}GB`} />
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
                      <Area type="monotone" dataKey="storageGB" name="Storage (GB)" stroke="#6366f1" fill="#6366f1" fillOpacity={0.2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
          {activityPieData.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">M365 Activity Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[200px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={activityPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value" label={({ name, value }) => `${name}: ${value.toLocaleString()}`}>
                        {activityPieData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </>
  );
}

function buildTimeSeriesData(metrics: any[]) {
  const buckets: Record<string, { pageLoad: number[]; search: number[]; fileTransfer: number[]; authentication: number[] }> = {};

  const now = new Date();
  for (let h = 0; h < 24; h++) {
    const key = `${String(h).padStart(2, '0')}:00`;
    buckets[key] = { pageLoad: [], search: [], fileTransfer: [], authentication: [] };
  }

  metrics.forEach((m) => {
    const d = new Date(m.timestamp);
    const key = `${String(d.getHours()).padStart(2, '0')}:00`;
    if (!buckets[key]) buckets[key] = { pageLoad: [], search: [], fileTransfer: [], authentication: [] };
    if (m.metricName === "page_load") buckets[key].pageLoad.push(m.value);
    else if (m.metricName === "search") buckets[key].search.push(m.value);
    else if (m.metricName === "file_transfer") buckets[key].fileTransfer.push(m.value);
    else if (m.metricName === "authentication") buckets[key].authentication.push(m.value);
  });
  const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, v]) => ({
      time,
      pageLoad: avg(v.pageLoad),
      search: avg(v.search),
      fileTransfer: avg(v.fileTransfer),
      authentication: avg(v.authentication),
    }));
}

function buildErrorData(metrics: any[]) {
  const siteErrors: Record<string, number> = {};
  metrics.filter((m) => m.status === "Failed").forEach((m) => {
    const site = m.site || "Unknown";
    siteErrors[site] = (siteErrors[site] || 0) + 1;
  });
  return Object.entries(siteErrors)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([site, errors]) => ({ site, errors }));
}

function buildRecentLogs(metrics: any[]) {
  return metrics.slice(0, 8).map((m) => {
    const d = new Date(m.timestamp);
    const diff = Date.now() - d.getTime();
    const mins = Math.round(diff / 60000);
    return {
      id: m.id,
      site: m.site || "Unknown",
      type: m.metricName === "page_load" ? "Page Load" : m.metricName === "file_transfer" ? "File Transfer" : m.metricName === "search" ? "Search" : m.metricName === "authentication" ? "Auth" : m.metricName,
      status: m.status || "Success",
      latency: m.status === "Failed" ? "Timeout" : `${Math.round(m.value)}ms`,
      time: mins < 1 ? "Just now" : mins < 60 ? `${mins} min ago` : `${Math.round(mins / 60)}h ago`,
    };
  });
}
