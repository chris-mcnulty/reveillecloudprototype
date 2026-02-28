import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar,
} from "recharts";
import { useMetrics, useTenants } from "@/lib/api";
import { useSearch } from "wouter";

export default function Performance() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const tenantIdParam = params.get("tenant");

  const { data: tenantList } = useTenants();
  const tenantId = tenantIdParam || tenantList?.[0]?.id || null;

  const { data: allMetrics, isLoading } = useMetrics(tenantId);

  if (isLoading) {
    return (
      <Shell>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Shell>
    );
  }

  const metrics = allMetrics || [];
  const syntheticData = buildSyntheticTimeSeries(metrics);
  const networkPhases = buildNetworkPhases(metrics);

  return (
    <Shell>
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Performance Explorer</h2>
          <p className="text-muted-foreground">
            Deep dive into synthetic transaction metrics for this tenant.
          </p>
        </div>
      </div>

      <Tabs defaultValue="synthetic" className="space-y-4 mt-4">
        <TabsList>
          <TabsTrigger value="synthetic" data-testid="tab-synthetic">Synthetic Tests</TabsTrigger>
          <TabsTrigger value="distribution" data-testid="tab-distribution">Latency Distribution</TabsTrigger>
          <TabsTrigger value="network" data-testid="tab-network">Network Phases</TabsTrigger>
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
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
                    <Legend />
                    <Line type="monotone" dataKey="Page Load" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="File Upload" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="Search" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
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
                    <XAxis dataKey="site" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}ms`} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
                    <Bar dataKey="avgLatency" name="Avg Latency" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="network">
          <Card>
            <CardHeader>
              <CardTitle>Network Phase Breakdown</CardTitle>
              <CardDescription>Simulated network timing phases (DNS, TCP, TLS, TTFB)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={networkPhases} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="time" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}ms`} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
                    <Legend />
                    <Bar dataKey="DNS" stackId="a" fill="#06b6d4" />
                    <Bar dataKey="TCP" stackId="a" fill="#8b5cf6" />
                    <Bar dataKey="TLS" stackId="a" fill="#f59e0b" />
                    <Bar dataKey="TTFB" stackId="a" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </Shell>
  );
}

function buildSyntheticTimeSeries(metrics: any[]) {
  const buckets: Record<string, { "Page Load": number[]; "File Upload": number[]; "Search": number[] }> = {};
  metrics.forEach((m) => {
    const d = new Date(m.timestamp);
    const key = `${String(d.getHours()).padStart(2, '0')}:${String(Math.floor(d.getMinutes() / 15) * 15).padStart(2, '0')}`;
    if (!buckets[key]) buckets[key] = { "Page Load": [], "File Upload": [], "Search": [] };
    if (m.metricName === "page_load") buckets[key]["Page Load"].push(m.value);
    else if (m.metricName === "file_upload") buckets[key]["File Upload"].push(m.value);
    else if (m.metricName === "search") buckets[key]["Search"].push(m.value);
  });
  const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, v]) => ({ time, "Page Load": avg(v["Page Load"]), "File Upload": avg(v["File Upload"]), "Search": avg(v["Search"]) }));
}

function buildSiteLatency(metrics: any[]) {
  const sites: Record<string, number[]> = {};
  metrics.forEach((m) => {
    const site = m.site || "Unknown";
    if (!sites[site]) sites[site] = [];
    sites[site].push(m.value);
  });
  return Object.entries(sites).map(([site, vals]) => ({
    site,
    avgLatency: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
  })).sort((a, b) => b.avgLatency - a.avgLatency);
}

function buildNetworkPhases(metrics: any[]) {
  const pageLoads = metrics.filter((m) => m.metricName === "page_load").slice(0, 12);
  return pageLoads.map((m) => {
    const total = m.value;
    const d = new Date(m.timestamp);
    return {
      time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
      DNS: Math.round(total * 0.05),
      TCP: Math.round(total * 0.1),
      TLS: Math.round(total * 0.15),
      TTFB: Math.round(total * 0.7),
    };
  }).reverse();
}
