import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useUsageReports, useLatestUsageReport } from "@/lib/api";
import { useActiveTenant } from "@/lib/tenant-context";
import { Loader2, HardDrive, Users, FileText, BarChart3, TrendingUp, Database } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useState } from "react";

const reportTypes = [
  { key: "siteUsageDetail", label: "Site Usage", icon: BarChart3 },
  { key: "siteUsageCounts", label: "Site Counts", icon: TrendingUp },
  { key: "storageUsage", label: "Storage", icon: HardDrive },
  { key: "fileActivity", label: "File Activity", icon: FileText },
  { key: "activeUsers", label: "Active Users", icon: Users },
];

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function ReportDataTable({ data }: { data: any }) {
  if (!data || !data.data) return <p className="text-sm text-muted-foreground text-center py-8">No data collected yet.</p>;
  const reportData = data.data;

  if (Array.isArray(reportData) && reportData.length > 0) {
    const cols = Object.keys(reportData[0]).slice(0, 8);
    return (
      <div className="overflow-auto max-h-[400px]">
        <Table>
          <TableHeader>
            <TableRow>
              {cols.map(col => (
                <TableHead key={col} className="text-xs whitespace-nowrap">{col.replace(/([A-Z])/g, ' $1').trim()}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {reportData.slice(0, 50).map((row: any, i: number) => (
              <TableRow key={i} data-testid={`row-report-${i}`}>
                {cols.map(col => (
                  <TableCell key={col} className="text-xs">
                    {typeof row[col] === "number" ? row[col].toLocaleString() : String(row[col] ?? "—")}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {reportData.length > 50 && (
          <p className="text-xs text-muted-foreground text-center py-2">Showing 50 of {reportData.length} rows</p>
        )}
      </div>
    );
  }

  if (typeof reportData === "object") {
    const entries = Object.entries(reportData);
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map(([key, value]: [string, any]) => (
          <div key={key} className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
            <span className="text-sm text-muted-foreground">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
            <span className="text-sm font-medium">{typeof value === "number" ? value.toLocaleString() : String(value)}</span>
          </div>
        ))}
      </div>
    );
  }

  return <p className="text-sm text-muted-foreground text-center py-8">Report data format not recognized.</p>;
}

function StorageChart({ data }: { data: any }) {
  if (!data?.data || !Array.isArray(data.data)) return null;
  const chartData = data.data
    .filter((r: any) => r.storageUsedInBytes || r.storageAllocatedInBytes)
    .slice(0, 10)
    .map((r: any) => ({
      site: (r.siteUrl || r.siteName || "Unknown").replace(/https?:\/\/[^/]+/, '').slice(0, 30),
      used: Math.round((r.storageUsedInBytes || 0) / (1024 * 1024)),
      allocated: Math.round((r.storageAllocatedInBytes || 0) / (1024 * 1024)),
    }));

  if (chartData.length === 0) return null;
  return (
    <div className="h-[250px] w-full mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="site" stroke="#888888" fontSize={10} tickLine={false} angle={-20} textAnchor="end" />
          <YAxis stroke="#888888" fontSize={12} tickLine={false} tickFormatter={(v) => `${v}MB`} />
          <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
          <Bar dataKey="used" name="Used (MB)" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          <Bar dataKey="allocated" name="Allocated (MB)" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} opacity={0.4} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function UsageReports() {
  const { activeTenantId, orgTenants } = useActiveTenant();
  const tenant = orgTenants?.find(t => t.id === activeTenantId);
  const [activeTab, setActiveTab] = useState("siteUsageDetail");

  const { data: reports, isLoading, isError, error } = useUsageReports(activeTenantId, activeTab);
  const { data: latestReport } = useLatestUsageReport(activeTenantId, activeTab);

  const allReports = reports || [];
  const currentType = reportTypes.find(r => r.key === activeTab);

  return (
    <Shell>
      <div className="mb-6">
        <h2 data-testid="text-page-title" className="text-2xl font-bold tracking-tight">Usage Reports</h2>
        <p className="text-muted-foreground">
          SharePoint usage data collected from Microsoft Graph for {tenant?.name || "this tenant"}.
          Reports are collected every 6 hours.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-5 mb-6">
        {reportTypes.map(rt => {
          const Icon = rt.icon;
          const isActive = activeTab === rt.key;
          return (
            <Card
              key={rt.key}
              className={`cursor-pointer transition-all hover:border-primary/50 ${isActive ? "border-primary bg-primary/5" : ""}`}
              onClick={() => setActiveTab(rt.key)}
              data-testid={`card-report-type-${rt.key}`}
            >
              <CardContent className="flex items-center gap-3 p-4">
                <Icon className={`h-5 w-5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                <span className={`text-sm font-medium ${isActive ? "text-primary" : ""}`}>{rt.label}</span>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                {currentType && <currentType.icon className="h-5 w-5" />}
                {currentType?.label || "Report"} Data
              </CardTitle>
              <CardDescription>
                {latestReport ? `Last collected: ${formatDate(latestReport.collectedAt)}` : "No data collected yet — the collector runs every 6 hours"}
              </CardDescription>
            </div>
            {allReports.length > 0 && (
              <Badge variant="secondary" data-testid="badge-report-count">{allReports.length} snapshots</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isError ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <Database className="h-12 w-12 text-destructive mb-4" />
              <h3 className="text-lg font-semibold">Failed to Load Reports</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                {(error as Error)?.message || "Check that Reports.Read.All permission is granted."}
              </p>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !latestReport ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <Database className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">No Usage Data Yet</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                Usage reports are collected from Microsoft Graph API every 6 hours.
                Ensure the tenant has consented and <code>Reports.Read.All</code> permission is granted.
              </p>
            </div>
          ) : (
            <>
              {activeTab === "storageUsage" && <StorageChart data={latestReport} />}
              <ReportDataTable data={latestReport} />
            </>
          )}
        </CardContent>
      </Card>

      {allReports.length > 1 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Collection History</CardTitle>
            <CardDescription>Previous report snapshots for {currentType?.label}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Report Date</TableHead>
                  <TableHead>Collected At</TableHead>
                  <TableHead>Records</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allReports.slice(0, 20).map((r: any) => (
                  <TableRow key={r.id} data-testid={`row-history-${r.id}`}>
                    <TableCell>{r.reportDate || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(r.collectedAt)}</TableCell>
                    <TableCell>
                      {Array.isArray(r.data) ? r.data.length : typeof r.data === "object" ? Object.keys(r.data).length : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </Shell>
  );
}
