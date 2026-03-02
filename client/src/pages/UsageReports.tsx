import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useUsageReports, useLatestUsageReport } from "@/lib/api";
import { useActiveTenant } from "@/lib/tenant-context";
import { Loader2, HardDrive, Users, FileText, BarChart3, TrendingUp, Database, FolderTree, List, Network, UserCheck, CloudCog, MessageSquare, Mail, AppWindow, Sparkles, Bot, BrainCircuit } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend, AreaChart, Area } from "recharts";
import { useState } from "react";

const reportTypes = [
  { key: "siteUsageDetail", label: "Site Usage", icon: BarChart3, group: "sharepoint" },
  { key: "siteUsageCounts", label: "Site Counts", icon: TrendingUp, group: "sharepoint" },
  { key: "storageUsage", label: "Storage", icon: HardDrive, group: "sharepoint" },
  { key: "fileActivity", label: "File Activity", icon: FileText, group: "sharepoint" },
  { key: "activeUsers", label: "Active Users", icon: Users, group: "sharepoint" },
  { key: "onedriveUsageDetail", label: "OneDrive Usage", icon: CloudCog, group: "onedrive" },
  { key: "onedriveActivityDetail", label: "OneDrive Activity", icon: FileText, group: "onedrive" },
  { key: "onedriveStorageUsage", label: "OneDrive Storage", icon: HardDrive, group: "onedrive" },
  { key: "copilotUsageDetail", label: "Copilot Users", icon: Sparkles, group: "copilot" },
  { key: "copilotUserCounts", label: "Copilot Summary", icon: Bot, group: "copilot" },
  { key: "copilotUserCountTrend", label: "Copilot Trend", icon: BrainCircuit, group: "copilot" },
  { key: "teamsActivity", label: "Teams Activity", icon: MessageSquare, group: "m365" },
  { key: "emailActivity", label: "Email Activity", icon: Mail, group: "m365" },
  { key: "m365AppUsage", label: "M365 App Usage", icon: AppWindow, group: "m365" },
  { key: "subsites", label: "Subsites", icon: Network, group: "structure" },
  { key: "siteLists", label: "Lists & Libraries", icon: List, group: "structure" },
  { key: "driveStructure", label: "Drives & Files", icon: FolderTree, group: "structure" },
  { key: "siteGroups", label: "Groups", icon: Users, group: "structure" },
  { key: "siteUsers", label: "Users", icon: UserCheck, group: "structure" },
];

const CHART_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#14b8a6"];

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

  const arrayData = Array.isArray(reportData)
    ? reportData
    : reportData.users || reportData.sites || reportData.accounts || reportData.daily || reportData.summary || null;

  if (arrayData && arrayData.length > 0) {
    const cols = Object.keys(arrayData[0]).slice(0, 8);
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
            {arrayData.slice(0, 50).map((row: any, i: number) => (
              <TableRow key={i} data-testid={`row-report-${i}`}>
                {cols.map(col => (
                  <TableCell key={col} className="text-xs">
                    {typeof row[col] === "number"
                      ? (col.toLowerCase().includes("bytes") ? formatBytes(row[col]) : row[col].toLocaleString())
                      : String(row[col] ?? "—")}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {arrayData.length > 50 && (
          <p className="text-xs text-muted-foreground text-center py-2">Showing 50 of {arrayData.length} rows</p>
        )}
      </div>
    );
  }

  if (typeof reportData === "object" && !Array.isArray(reportData)) {
    const entries = Object.entries(reportData).filter(([k]) => !Array.isArray(reportData[k]) && typeof reportData[k] !== 'object');
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

function SiteUsageChart({ data }: { data: any }) {
  const sites = data?.data?.sites;
  if (!sites || !Array.isArray(sites) || sites.length === 0) return null;

  const chartData = sites
    .filter((s: any) => s.pageViewCount > 0 || s.fileCount > 0)
    .sort((a: any, b: any) => (b.pageViewCount || 0) - (a.pageViewCount || 0))
    .slice(0, 10)
    .map((s: any) => ({
      site: (s.siteUrl || "Unknown").replace(/https?:\/\/[^/]+/, '').slice(0, 25) || "/root",
      pageViews: s.pageViewCount || 0,
      files: s.activeFileCount || 0,
    }));

  if (chartData.length === 0) return null;

  return (
    <div className="h-[280px] w-full mb-6">
      <h4 className="text-sm font-medium mb-2">Top Sites by Page Views</h4>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="site" stroke="#888888" fontSize={10} tickLine={false} angle={-25} textAnchor="end" />
          <YAxis stroke="#888888" fontSize={12} tickLine={false} />
          <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
          <Legend />
          <Bar dataKey="pageViews" name="Page Views" fill="#6366f1" radius={[4, 4, 0, 0]} />
          <Bar dataKey="files" name="Active Files" fill="#22c55e" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function StorageChart({ data }: { data: any }) {
  const sites = data?.data?.sites;
  if (!sites || !Array.isArray(sites)) return null;

  const chartData = sites
    .filter((s: any) => s.storageUsedBytes > 0)
    .sort((a: any, b: any) => (b.storageUsedBytes || 0) - (a.storageUsedBytes || 0))
    .slice(0, 10)
    .map((s: any) => ({
      site: (s.siteUrl || "Unknown").replace(/https?:\/\/[^/]+/, '').slice(0, 25) || "/root",
      used: Math.round((s.storageUsedBytes || 0) / (1024 * 1024)),
      allocated: Math.round((s.storageAllocatedBytes || 0) / (1024 * 1024)),
    }));

  if (chartData.length === 0) return null;

  return (
    <div className="h-[280px] w-full mb-6">
      <h4 className="text-sm font-medium mb-2">Storage by Site (MB)</h4>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="site" stroke="#888888" fontSize={10} tickLine={false} angle={-25} textAnchor="end" />
          <YAxis stroke="#888888" fontSize={12} tickLine={false} tickFormatter={(v) => `${v}MB`} />
          <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
          <Legend />
          <Bar dataKey="used" name="Used (MB)" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          <Bar dataKey="allocated" name="Allocated (MB)" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} opacity={0.4} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function StorageTrendChart({ data }: { data: any }) {
  const daily = data?.data?.daily;
  if (!daily || !Array.isArray(daily) || daily.length === 0) return null;

  const chartData = daily.map((d: any) => ({
    date: d.reportDate?.slice(5) || "",
    storageGB: Math.round((d.storageUsedBytes || 0) / (1024 * 1024 * 1024) * 100) / 100,
  }));

  return (
    <div className="h-[250px] w-full mb-6">
      <h4 className="text-sm font-medium mb-2">Storage Trend</h4>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="date" stroke="#888888" fontSize={11} />
          <YAxis stroke="#888888" fontSize={12} tickFormatter={(v) => `${v}GB`} />
          <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
          <Area type="monotone" dataKey="storageGB" name="Storage (GB)" stroke="#6366f1" fill="#6366f1" fillOpacity={0.2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function FileActivityChart({ data }: { data: any }) {
  const daily = data?.data?.daily;
  if (!daily || !Array.isArray(daily) || daily.length === 0) return null;

  const chartData = daily.map((d: any) => ({
    date: d.reportDate?.slice(5) || "",
    total: d.total || 0,
    active: d.active || 0,
  }));

  return (
    <div className="h-[250px] w-full mb-6">
      <h4 className="text-sm font-medium mb-2">File Counts Over Time</h4>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="date" stroke="#888888" fontSize={11} />
          <YAxis stroke="#888888" fontSize={12} />
          <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
          <Legend />
          <Line type="monotone" dataKey="total" name="Total Files" stroke="#6366f1" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="active" name="Active Files" stroke="#22c55e" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function SiteCountsChart({ data }: { data: any }) {
  const daily = data?.data?.daily;
  if (!daily || !Array.isArray(daily) || daily.length === 0) return null;

  const chartData = daily.map((d: any) => ({
    date: d.reportDate?.slice(5) || "",
    total: d.total || 0,
    active: d.active || 0,
  }));

  return (
    <div className="h-[250px] w-full mb-6">
      <h4 className="text-sm font-medium mb-2">Site Counts Trend</h4>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="date" stroke="#888888" fontSize={11} />
          <YAxis stroke="#888888" fontSize={12} />
          <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
          <Legend />
          <Line type="monotone" dataKey="total" name="Total Sites" stroke="#6366f1" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="active" name="Active Sites" stroke="#22c55e" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ActiveUsersChart({ data }: { data: any }) {
  const users = data?.data?.users;
  if (!users || !Array.isArray(users) || users.length === 0) return null;

  const activityBuckets = [
    { name: "View/Edit", value: users.filter((u: any) => (u.viewedOrEdited || 0) > 0).length },
    { name: "Synced", value: users.filter((u: any) => (u.syncedFileCount || 0) > 0).length },
    { name: "Shared Int.", value: users.filter((u: any) => (u.sharedInternallyCount || 0) > 0).length },
    { name: "Shared Ext.", value: users.filter((u: any) => (u.sharedExternallyCount || 0) > 0).length },
    { name: "Page Views", value: users.filter((u: any) => (u.visitedPageCount || 0) > 0).length },
  ].filter(b => b.value > 0);

  if (activityBuckets.length === 0) return null;

  return (
    <div className="h-[280px] w-full mb-6">
      <h4 className="text-sm font-medium mb-2">User Activity Breakdown ({users.length} users)</h4>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={activityBuckets} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="name" stroke="#888888" fontSize={11} />
          <YAxis stroke="#888888" fontSize={12} />
          <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
          <Bar dataKey="value" name="Users" fill="#6366f1" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function CopilotUsageChart({ data }: { data: any }) {
  const reportData = data?.data;
  if (!reportData) return null;

  const appsUsed = reportData.appsUsed;
  if (appsUsed && typeof appsUsed === 'object' && Object.keys(appsUsed).length > 0) {
    const pieData = Object.entries(appsUsed).map(([name, value]) => ({
      name,
      value: value as number,
    })).sort((a, b) => b.value - a.value);

    const totalUsers = reportData.totalUsers || 0;
    const activeUsers = reportData.activeUsers || 0;
    const adoptionRate = totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0;

    return (
      <div className="space-y-6 mb-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-primary" data-testid="text-copilot-total">{totalUsers}</p>
              <p className="text-sm text-muted-foreground">Licensed Users</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-green-500" data-testid="text-copilot-active">{activeUsers}</p>
              <p className="text-sm text-muted-foreground">Active Users</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold" data-testid="text-copilot-adoption">{adoptionRate}%</p>
              <p className="text-sm text-muted-foreground">Adoption Rate</p>
            </CardContent>
          </Card>
        </div>

        <div className="h-[280px] w-full">
          <h4 className="text-sm font-medium mb-2">Copilot Usage by App</h4>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={pieData} layout="vertical" margin={{ top: 5, right: 30, left: 80, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
              <XAxis type="number" stroke="#888888" fontSize={12} />
              <YAxis type="category" dataKey="name" stroke="#888888" fontSize={12} width={70} />
              <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
              <Bar dataKey="value" name="Active Users" radius={[0, 4, 4, 0]}>
                {pieData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  return null;
}

function CopilotTrendChart({ data }: { data: any }) {
  const daily = data?.data?.daily;
  if (!daily || !Array.isArray(daily) || daily.length === 0) return null;

  const chartData = daily.map((d: any) => ({
    date: d.reportDate?.slice(5) || "",
    enabled: d.enabledUsers || 0,
    active: d.activeUsers || 0,
  })).sort((a: any, b: any) => a.date.localeCompare(b.date));

  return (
    <div className="h-[280px] w-full mb-6">
      <h4 className="text-sm font-medium mb-2">Copilot Adoption Trend</h4>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="date" stroke="#888888" fontSize={11} />
          <YAxis stroke="#888888" fontSize={12} />
          <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
          <Legend />
          <Area type="monotone" dataKey="enabled" name="Enabled Users" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.15} strokeWidth={2} />
          <Area type="monotone" dataKey="active" name="Active Users" stroke="#22c55e" fill="#22c55e" fillOpacity={0.2} strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function CopilotSummaryChart({ data }: { data: any }) {
  const summary = data?.data?.summary;
  if (!summary || !Array.isArray(summary) || summary.length === 0) return null;

  const chartData = summary.map((s: any) => ({
    app: s.app || "All",
    enabled: s.enabledUsers || 0,
    active: s.activeUsers || 0,
  }));

  return (
    <div className="h-[280px] w-full mb-6">
      <h4 className="text-sm font-medium mb-2">Copilot Users by Product</h4>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="app" stroke="#888888" fontSize={11} />
          <YAxis stroke="#888888" fontSize={12} />
          <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
          <Legend />
          <Bar dataKey="enabled" name="Enabled" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
          <Bar dataKey="active" name="Active" fill="#22c55e" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function OneDriveUsageChart({ data }: { data: any }) {
  const accounts = data?.data?.accounts;
  if (!accounts || !Array.isArray(accounts) || accounts.length === 0) return null;

  const chartData = accounts
    .filter((a: any) => (a.storageUsedBytes || 0) > 0)
    .sort((a: any, b: any) => (b.storageUsedBytes || 0) - (a.storageUsedBytes || 0))
    .slice(0, 10)
    .map((a: any) => ({
      owner: (a.ownerDisplayName || a.ownerPrincipal || "Unknown").slice(0, 20),
      usedMB: Math.round((a.storageUsedBytes || 0) / (1024 * 1024)),
      files: a.fileCount || 0,
      activeFiles: a.activeFileCount || 0,
    }));

  if (chartData.length === 0) return null;

  return (
    <div className="h-[280px] w-full mb-6">
      <h4 className="text-sm font-medium mb-2">Top OneDrive Accounts by Storage (MB)</h4>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="owner" stroke="#888888" fontSize={10} tickLine={false} angle={-25} textAnchor="end" />
          <YAxis stroke="#888888" fontSize={12} tickLine={false} tickFormatter={(v) => `${v}MB`} />
          <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
          <Legend />
          <Bar dataKey="usedMB" name="Storage (MB)" fill="#06b6d4" radius={[4, 4, 0, 0]} />
          <Bar dataKey="files" name="Total Files" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function OneDriveActivityChart({ data }: { data: any }) {
  const users = data?.data?.users;
  if (!users || !Array.isArray(users) || users.length === 0) return null;

  const totals = users.reduce((acc: any, u: any) => ({
    viewedOrEdited: acc.viewedOrEdited + (u.viewedOrEdited || 0),
    synced: acc.synced + (u.syncedFileCount || 0),
    sharedInt: acc.sharedInt + (u.sharedInternallyCount || 0),
    sharedExt: acc.sharedExt + (u.sharedExternallyCount || 0),
  }), { viewedOrEdited: 0, synced: 0, sharedInt: 0, sharedExt: 0 });

  const pieData = [
    { name: "Viewed/Edited", value: totals.viewedOrEdited },
    { name: "Synced", value: totals.synced },
    { name: "Shared Internal", value: totals.sharedInt },
    { name: "Shared External", value: totals.sharedExt },
  ].filter(d => d.value > 0);

  if (pieData.length === 0) return null;

  return (
    <div className="h-[280px] w-full mb-6">
      <h4 className="text-sm font-medium mb-2">OneDrive Activity Summary ({users.length} users)</h4>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
            {pieData.map((_, index) => (
              <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function EmailActivityChart({ data }: { data: any }) {
  const users = data?.data?.users;
  if (!users || !Array.isArray(users) || users.length === 0) return null;

  const totals = users.reduce((acc: any, u: any) => ({
    sent: acc.sent + (u.sendCount || 0),
    received: acc.received + (u.receiveCount || 0),
    read: acc.read + (u.readCount || 0),
  }), { sent: 0, received: 0, read: 0 });

  const chartData = [
    { name: "Sent", value: totals.sent },
    { name: "Received", value: totals.received },
    { name: "Read", value: totals.read },
  ].filter(d => d.value > 0);

  if (chartData.length === 0) return null;

  return (
    <div className="h-[280px] w-full mb-6">
      <h4 className="text-sm font-medium mb-2">Email Activity Summary ({users.length} users)</h4>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="name" stroke="#888888" fontSize={12} />
          <YAxis stroke="#888888" fontSize={12} />
          <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
          <Bar dataKey="value" name="Emails" radius={[4, 4, 0, 0]}>
            {chartData.map((_, index) => (
              <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function M365AppUsageChart({ data }: { data: any }) {
  const users = data?.data?.users;
  if (!users || !Array.isArray(users) || users.length === 0) return null;

  const platforms = [
    { name: "Windows", value: users.filter((u: any) => u.windows).length },
    { name: "Mac", value: users.filter((u: any) => u.mac).length },
    { name: "Mobile", value: users.filter((u: any) => u.mobile).length },
    { name: "Web", value: users.filter((u: any) => u.web).length },
  ].filter(d => d.value > 0);

  const apps = [
    { name: "Outlook", value: users.filter((u: any) => u.outlook).length },
    { name: "Word", value: users.filter((u: any) => u.word).length },
    { name: "Excel", value: users.filter((u: any) => u.excel).length },
    { name: "PowerPoint", value: users.filter((u: any) => u.powerPoint).length },
    { name: "OneNote", value: users.filter((u: any) => u.oneNote).length },
    { name: "Teams", value: users.filter((u: any) => u.teams).length },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6 mb-6">
      {platforms.length > 0 && (
        <div className="h-[250px] w-full">
          <h4 className="text-sm font-medium mb-2">Platform Usage ({users.length} users)</h4>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={platforms} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="name" stroke="#888888" fontSize={12} />
              <YAxis stroke="#888888" fontSize={12} />
              <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
              <Bar dataKey="value" name="Users" radius={[4, 4, 0, 0]}>
                {platforms.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {apps.length > 0 && (
        <div className="h-[250px] w-full">
          <h4 className="text-sm font-medium mb-2">App Usage ({users.length} users)</h4>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={apps} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="name" stroke="#888888" fontSize={12} />
              <YAxis stroke="#888888" fontSize={12} />
              <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
              <Bar dataKey="value" name="Users" radius={[4, 4, 0, 0]}>
                {apps.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function TeamsActivityChart({ data }: { data: any }) {
  const users = data?.data?.users;
  if (!users || !Array.isArray(users) || users.length === 0) return null;

  const totals = users.reduce((acc: any, u: any) => ({
    chats: acc.chats + (u.teamChatMessageCount || 0),
    privateChats: acc.privateChats + (u.privateChatMessageCount || 0),
    calls: acc.calls + (u.callCount || 0),
    meetings: acc.meetings + (u.meetingCount || 0),
  }), { chats: 0, privateChats: 0, calls: 0, meetings: 0 });

  const pieData = [
    { name: "Team Chats", value: totals.chats },
    { name: "Private Chats", value: totals.privateChats },
    { name: "Calls", value: totals.calls },
    { name: "Meetings", value: totals.meetings },
  ].filter(d => d.value > 0);

  if (pieData.length === 0) return null;

  return (
    <div className="h-[280px] w-full mb-6">
      <h4 className="text-sm font-medium mb-2">Teams Activity Summary ({users.length} users)</h4>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
            {pieData.map((_, index) => (
              <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function getChartForReport(reportType: string, data: any) {
  switch (reportType) {
    case "siteUsageDetail":
      return (
        <>
          <SiteUsageChart data={data} />
          <StorageChart data={data} />
        </>
      );
    case "siteUsageCounts":
      return <SiteCountsChart data={data} />;
    case "storageUsage":
      return <StorageTrendChart data={data} />;
    case "fileActivity":
      return <FileActivityChart data={data} />;
    case "activeUsers":
      return <ActiveUsersChart data={data} />;
    case "copilotUsageDetail":
      return <CopilotUsageChart data={data} />;
    case "copilotUserCounts":
      return <CopilotSummaryChart data={data} />;
    case "copilotUserCountTrend":
      return <CopilotTrendChart data={data} />;
    case "teamsActivity":
      return <TeamsActivityChart data={data} />;
    case "onedriveUsageDetail":
      return <OneDriveUsageChart data={data} />;
    case "onedriveActivityDetail":
      return <OneDriveActivityChart data={data} />;
    case "onedriveStorageUsage":
      return <StorageTrendChart data={data} />;
    case "emailActivity":
      return <EmailActivityChart data={data} />;
    case "m365AppUsage":
      return <M365AppUsageChart data={data} />;
    default:
      return null;
  }
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
          M365 usage data across SharePoint, OneDrive, Copilot, Teams, Exchange, and site structure for {tenant?.name || "this tenant"}.
        </p>
      </div>

      <div className="space-y-3 mb-6">
        {[
          { group: "sharepoint", label: "SharePoint Usage" },
          { group: "onedrive", label: "OneDrive for Business" },
          { group: "copilot", label: "Microsoft 365 Copilot" },
          { group: "m365", label: "Cross-M365 Workloads" },
          { group: "structure", label: "Site Structure" },
        ].map(({ group, label }) => {
          const groupTypes = reportTypes.filter(rt => rt.group === group);
          if (groupTypes.length === 0) return null;
          return (
            <div key={group}>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{label}</h3>
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(groupTypes.length, 5)}, minmax(0, 1fr))` }}>
                {groupTypes.map(rt => {
                  const Icon = rt.icon;
                  const isActive = activeTab === rt.key;
                  return (
                    <Card
                      key={rt.key}
                      className={`cursor-pointer transition-all hover:border-primary/50 ${isActive ? "border-primary bg-primary/5" : ""}`}
                      onClick={() => setActiveTab(rt.key)}
                      data-testid={`card-report-type-${rt.key}`}
                    >
                      <CardContent className="flex items-center gap-3 p-3">
                        <Icon className={`h-4 w-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                        <span className={`text-xs font-medium ${isActive ? "text-primary" : ""}`}>{rt.label}</span>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
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
                {currentType?.group === "copilot"
                  ? "Copilot usage reports require Microsoft 365 Copilot licenses and Reports.Read.All permission."
                  : "Usage reports are collected from Microsoft Graph API every 6 hours. Ensure the tenant has consented and Reports.Read.All permission is granted."}
              </p>
            </div>
          ) : (
            <>
              {getChartForReport(activeTab, latestReport)}
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
                      {Array.isArray(r.data) ? r.data.length
                        : typeof r.data === "object"
                          ? (r.data.users?.length || r.data.sites?.length || r.data.accounts?.length || r.data.daily?.length || r.data.summary?.length || Object.keys(r.data).length)
                          : "—"}
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
