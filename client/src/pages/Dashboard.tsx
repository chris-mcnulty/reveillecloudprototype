import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, FileUp, Globe, TrendingDown, TrendingUp, AlertTriangle, Loader2 } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar,
} from "recharts";
import { useMetrics, useMetricsSummary, useLatestMetrics, useTenants } from "@/lib/api";
import { useSearch } from "wouter";

export default function Dashboard() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const tenantIdParam = params.get("tenant");
  
  const { data: tenantList } = useTenants();
  const tenantId = tenantIdParam || tenantList?.[0]?.id || null;

  const { data: allMetrics, isLoading: loadingMetrics } = useMetrics(tenantId);
  const { data: summary, isLoading: loadingSummary } = useMetricsSummary(tenantId);
  const { data: latestMetrics } = useLatestMetrics(tenantId, 20);

  if (loadingMetrics || loadingSummary) {
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
                  <XAxis dataKey="time" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}ms`} />
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} itemStyle={{ color: 'hsl(var(--foreground))' }} />
                  <Area type="monotone" name="Page Load" dataKey="pageLoad" stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={0.6} fill="url(#colorMs)" />
                  <Area type="monotone" name="Search" dataKey="search" stroke="#10b981" strokeWidth={2} fillOpacity={0.3} fill="#10b981" />
                  <Area type="monotone" name="File Upload" dataKey="fileUpload" stroke="#8b5cf6" strokeWidth={2} fillOpacity={0.3} fill="#8b5cf6" />
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

function buildTimeSeriesData(metrics: any[]) {
  const buckets: Record<string, { pageLoad: number[]; search: number[]; fileUpload: number[] }> = {};
  metrics.forEach((m) => {
    const d = new Date(m.timestamp);
    const key = `${String(d.getHours()).padStart(2, '0')}:00`;
    if (!buckets[key]) buckets[key] = { pageLoad: [], search: [], fileUpload: [] };
    if (m.metricName === "page_load") buckets[key].pageLoad.push(m.value);
    else if (m.metricName === "search") buckets[key].search.push(m.value);
    else if (m.metricName === "file_upload") buckets[key].fileUpload.push(m.value);
  });
  const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, v]) => ({ time, pageLoad: avg(v.pageLoad), search: avg(v.search), fileUpload: avg(v.fileUpload) }));
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
      type: m.metricName === "page_load" ? "Page Load" : m.metricName === "file_upload" ? "File Upload" : m.metricName === "search" ? "Search Query" : m.metricName,
      status: m.status || "Success",
      latency: m.status === "Failed" ? "Timeout" : `${Math.round(m.value)}ms`,
      time: mins < 1 ? "Just now" : mins < 60 ? `${mins} min ago` : `${Math.round(mins / 60)}h ago`,
    };
  });
}
