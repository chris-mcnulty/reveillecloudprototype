import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuditLogEntries, useAuditLogStats, useAdminAuditLog } from "@/lib/api";
import { useActiveTenant } from "@/lib/tenant-context";
import { Loader2, Shield, FileText, User, Globe, Clock, Activity, ScrollText } from "lucide-react";
import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

function formatTimestamp(ts: string | null) {
  if (!ts) return "N/A";
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function timeAgo(ts: string | null) {
  if (!ts) return "";
  const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

function operationBadge(op: string) {
  const lower = op.toLowerCase();
  if (lower.includes("delete") || lower.includes("remove"))
    return <Badge variant="destructive" className="text-xs" data-testid={`badge-op-${op}`}>{op}</Badge>;
  if (lower.includes("share") || lower.includes("permission") || lower.includes("invite"))
    return <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30 text-xs" data-testid={`badge-op-${op}`}>{op}</Badge>;
  if (lower.includes("create") || lower.includes("add"))
    return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-xs" data-testid={`badge-op-${op}`}>{op}</Badge>;
  return <Badge variant="secondary" className="text-xs" data-testid={`badge-op-${op}`}>{op}</Badge>;
}

function actionBadge(action: string) {
  if (action.includes("delete") || action.includes("revoke"))
    return <Badge variant="destructive" className="text-xs">{action}</Badge>;
  if (action.includes("create") || action.includes("consent"))
    return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-xs">{action}</Badge>;
  if (action.includes("trigger") || action.includes("reset") || action.includes("cancel"))
    return <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/30 text-xs">{action}</Badge>;
  return <Badge variant="secondary" className="text-xs">{action}</Badge>;
}

function SharePointAuditTab() {
  const { activeTenantId, orgTenants } = useActiveTenant();
  const tenant = orgTenants?.find(t => t.id === activeTenantId);
  const [operationFilter, setOperationFilter] = useState<string>("all");

  const { data: entries, isLoading, isError, error } = useAuditLogEntries(
    activeTenantId,
    operationFilter !== "all" ? operationFilter : undefined,
    200
  );
  const { data: stats } = useAuditLogStats(activeTenantId);

  const auditEntries = entries || [];
  const statData = Array.isArray(stats) ? stats.map((s: any) => ({
    operation: String(s.operation || "").length > 20 ? String(s.operation).slice(0, 20) + "..." : String(s.operation || ""),
    count: Number(s.count) || 0,
  })).sort((a, b) => b.count - a.count).slice(0, 10) : [];

  return (
    <div className="space-y-4">
      {statData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Operations Breakdown</CardTitle>
            <CardDescription>Top operations by frequency for {tenant?.name}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statData} margin={{ top: 5, right: 20, left: 0, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="operation" stroke="#888888" fontSize={10} tickLine={false} angle={-25} textAnchor="end" />
                  <YAxis stroke="#888888" fontSize={12} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Audit Log Entries</CardTitle>
            <CardDescription>SharePoint activity collected from Microsoft Graph ({auditEntries.length} entries)</CardDescription>
          </div>
          <Select value={operationFilter} onValueChange={setOperationFilter}>
            <SelectTrigger className="w-[200px]" data-testid="select-operation-filter">
              <SelectValue placeholder="Filter by operation" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Operations</SelectItem>
              <SelectItem value="FileAccessed">File Accessed</SelectItem>
              <SelectItem value="FileModified">File Modified</SelectItem>
              <SelectItem value="FileDeleted">File Deleted</SelectItem>
              <SelectItem value="SharingSet">Sharing Set</SelectItem>
              <SelectItem value="PermissionChanged">Permission Changed</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {isError ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <Shield className="h-12 w-12 text-destructive mb-4" />
              <h3 className="text-lg font-semibold">Failed to Load Audit Log</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                {(error as Error)?.message || "Check that AuditLog.Read.All permission is granted."}
              </p>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : auditEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <Shield className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">No Audit Entries</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                Audit logs are collected every 15 minutes. Ensure the tenant has consented and
                <code className="mx-1">AuditLog.Read.All</code> permission is granted.
              </p>
            </div>
          ) : (
            <div className="overflow-auto max-h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Operation</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Object</TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead>IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditEntries.map((entry: any) => (
                    <TableRow key={entry.id} data-testid={`row-audit-${entry.id}`}>
                      <TableCell className="text-xs whitespace-nowrap">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          {formatTimestamp(entry.timestamp)}
                        </span>
                      </TableCell>
                      <TableCell>{operationBadge(entry.operation)}</TableCell>
                      <TableCell className="text-xs">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3 text-muted-foreground" />
                          {entry.userEmail || entry.userId || "System"}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate" title={entry.objectId}>
                        {entry.objectId || "—"}
                      </TableCell>
                      <TableCell className="text-xs max-w-[150px] truncate" title={entry.siteUrl}>
                        {entry.siteUrl ? (() => { try { return new URL(entry.siteUrl).pathname; } catch { return entry.siteUrl; } })() : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">{entry.clientIp || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AdminAuditTab() {
  const { activeTenantId } = useActiveTenant();
  const { data: entries, isLoading } = useAdminAuditLog(undefined, 100);

  const auditEntries = entries || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ScrollText className="h-5 w-5" />
          Admin Activity Log
        </CardTitle>
        <CardDescription>Internal actions taken within Reveille Cloud (all tenants)</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : auditEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <Activity className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">No Admin Activity</h3>
            <p className="text-sm text-muted-foreground mt-1">Admin actions will appear here as you manage tenants, tests, and alerts.</p>
          </div>
        ) : (
          <div className="overflow-auto max-h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditEntries.map((entry: any) => (
                  <TableRow key={entry.id} data-testid={`row-admin-audit-${entry.id}`}>
                    <TableCell className="text-xs whitespace-nowrap">
                      <div>{formatTimestamp(entry.timestamp)}</div>
                      <div className="text-muted-foreground">{timeAgo(entry.timestamp)}</div>
                    </TableCell>
                    <TableCell>{actionBadge(entry.action)}</TableCell>
                    <TableCell className="text-xs">
                      {entry.targetType && (
                        <span className="text-muted-foreground">{entry.targetType}: </span>
                      )}
                      <span className="font-mono">{entry.targetId?.slice(0, 8) || "—"}</span>
                    </TableCell>
                    <TableCell className="text-xs">{entry.userId || "system"}</TableCell>
                    <TableCell className="text-xs max-w-[250px]">
                      {entry.details ? (
                        <span className="text-muted-foreground" title={JSON.stringify(entry.details, null, 2)}>
                          {Object.entries(entry.details).slice(0, 2).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join(", ")}
                        </span>
                      ) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AuditLog() {
  return (
    <Shell>
      <div className="mb-6">
        <h2 data-testid="text-page-title" className="text-2xl font-bold tracking-tight">Audit & Compliance</h2>
        <p className="text-muted-foreground">
          SharePoint audit trail and internal admin activity log.
        </p>
      </div>

      <Tabs defaultValue="sharepoint">
        <TabsList data-testid="tabs-audit-type">
          <TabsTrigger value="sharepoint" data-testid="tab-sharepoint">
            <Shield className="h-4 w-4 mr-2" /> SharePoint Audit
          </TabsTrigger>
          <TabsTrigger value="admin" data-testid="tab-admin">
            <ScrollText className="h-4 w-4 mr-2" /> Admin Activity
          </TabsTrigger>
        </TabsList>
        <TabsContent value="sharepoint" className="mt-4">
          <SharePointAuditTab />
        </TabsContent>
        <TabsContent value="admin" className="mt-4">
          <AdminAuditTab />
        </TabsContent>
      </Tabs>
    </Shell>
  );
}
