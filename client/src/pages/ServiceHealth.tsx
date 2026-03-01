import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useServiceHealth, useServiceHealthIncidents } from "@/lib/api";
import { useActiveTenant } from "@/lib/tenant-context";
import { Loader2, ShieldCheck, AlertTriangle, AlertCircle, Clock, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { useState } from "react";

function statusBadge(status: string) {
  const s = status?.toLowerCase() || "";
  if (s.includes("resolved") || s.includes("restored"))
    return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30" data-testid={`badge-status-${status}`}><CheckCircle2 className="h-3 w-3 mr-1" />{status}</Badge>;
  if (s.includes("investigating") || s.includes("monitoring"))
    return <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30" data-testid={`badge-status-${status}`}><AlertTriangle className="h-3 w-3 mr-1" />{status}</Badge>;
  return <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/30" data-testid={`badge-status-${status}`}><AlertCircle className="h-3 w-3 mr-1" />{status}</Badge>;
}

function classificationBadge(classification: string) {
  if (classification === "incident")
    return <Badge variant="destructive" data-testid="badge-incident">Incident</Badge>;
  return <Badge variant="secondary" data-testid="badge-advisory">Advisory</Badge>;
}

function timeAgo(dateStr: string | null) {
  if (!dateStr) return "Unknown";
  const d = new Date(dateStr);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

export default function ServiceHealth() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { orgTenants } = useActiveTenant();

  const { data: activeIncidents, isLoading: loadingActive, isError: errorActive, error: activeError } = useServiceHealth();
  const { data: allIncidents, isLoading: loadingAll, isError: errorAll, error: allError } = useServiceHealthIncidents(
    undefined,
    statusFilter !== "all" ? statusFilter : undefined
  );

  const incidents = allIncidents || [];
  const active = activeIncidents || [];

  const activeCount = active.length;
  const resolvedCount = incidents.filter(i => i.status?.toLowerCase().includes("resolved")).length;
  const incidentCount = incidents.filter(i => i.classification === "incident").length;
  const advisoryCount = incidents.filter(i => i.classification === "advisory").length;

  const isLoading = loadingActive || loadingAll;

  return (
    <Shell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 data-testid="text-page-title" className="text-2xl font-bold tracking-tight">M365 Service Health</h2>
          <p className="text-muted-foreground">
            Microsoft 365 service health incidents and advisories affecting your tenants.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.location.reload()} data-testid="button-refresh">
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Incidents</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div data-testid="text-active-count" className="text-2xl font-bold">{activeCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Resolved</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div data-testid="text-resolved-count" className="text-2xl font-bold">{resolvedCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Incidents</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div data-testid="text-incident-count" className="text-2xl font-bold text-destructive">{incidentCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Advisories</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div data-testid="text-advisory-count" className="text-2xl font-bold">{advisoryCount}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Service Health Timeline</CardTitle>
            <CardDescription>All tracked incidents and advisories from Microsoft 365</CardDescription>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="investigating">Investigating</SelectItem>
              <SelectItem value="serviceRestored">Service Restored</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {(errorActive || errorAll) ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <AlertCircle className="h-12 w-12 text-destructive mb-4" />
              <h3 className="text-lg font-semibold">Failed to Load Service Health</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                {(activeError as Error)?.message || (allError as Error)?.message || "Check that ServiceHealth.Read.All permission is granted."}
              </p>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : incidents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <ShieldCheck className="h-12 w-12 text-emerald-500 mb-4" />
              <h3 className="text-lg font-semibold">All Services Healthy</h3>
              <p className="text-sm text-muted-foreground mt-1">
                No incidents or advisories have been recorded. The collector runs every 5 minutes.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead className="max-w-[400px]">Title</TableHead>
                  <TableHead>External ID</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Last Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {incidents.map((incident: any) => (
                  <TableRow key={incident.id} data-testid={`row-incident-${incident.id}`}>
                    <TableCell>{statusBadge(incident.status)}</TableCell>
                    <TableCell>{classificationBadge(incident.classification)}</TableCell>
                    <TableCell className="font-medium">{incident.service}</TableCell>
                    <TableCell className="max-w-[400px] truncate">{incident.title}</TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">{incident.externalId}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{timeAgo(incident.startDateTime)}</span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{timeAgo(incident.lastUpdatedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </Shell>
  );
}
