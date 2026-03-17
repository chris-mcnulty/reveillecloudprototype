import { Shell } from "@/components/layout/Shell";
import { SettingsNav } from "@/components/layout/SettingsNav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Play,
  Square,
  RotateCcw,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Timer,
  Activity,
  Shield,
  FileText,
  BarChart3,
  RefreshCw,
  Globe,
  Layers,
  MessageSquare,
  Fingerprint,
  HardDrive,
} from "lucide-react";
import { useState } from "react";
import {
  useSchedulerStatus,
  useSchedulerJobRuns,
  useTriggerJob,
  useCancelJob,
  useResetJob,
  useAdminAuditLog,
} from "@/lib/api";
import { useActiveTenant } from "@/lib/tenant-context";
import { useToast } from "@/hooks/use-toast";

const JOB_META: Record<string, { label: string; icon: any; interval: string; description: string }> = {
  syntheticTests: {
    label: "Synthetic Tests",
    icon: Activity,
    interval: "Every 60s",
    description: "Executes configured synthetic transaction tests against SharePoint endpoints",
  },
  serviceHealth: {
    label: "Service Health",
    icon: Shield,
    interval: "Every 5 min",
    description: "Monitors M365 Service Health for SharePoint/OneDrive incidents and advisories",
  },
  auditLogs: {
    label: "Audit Logs",
    icon: FileText,
    interval: "Every 15 min",
    description: "Collects SharePoint audit log entries and activity data per tenant",
  },
  graphReports: {
    label: "Graph Reports",
    icon: BarChart3,
    interval: "Every 6 hrs",
    description: "Pulls SharePoint usage reports (site usage, storage, file activity, active users)",
  },
  siteStructure: {
    label: "Site Structure",
    icon: Globe,
    interval: "Every 1 hr",
    description: "Discovers and catalogs SharePoint sites, lists, libraries, and content types per tenant",
  },
  powerPlatform: {
    label: "Power Platform",
    icon: Layers,
    interval: "Every 30 min",
    description: "Collects Power Platform environments, apps, flows, bots, and M365 agents via Graph beta",
  },
  copilotInteractions: {
    label: "Copilot Interactions",
    icon: MessageSquare,
    interval: "Every 1 hr",
    description: "Collects Microsoft 365 Copilot prompt/response interaction history per user via Graph beta",
  },
  entraSignIns: {
    label: "Entra Sign-Ins",
    icon: Fingerprint,
    interval: "Every 30 min",
    description: "Collects Entra ID sign-in logs including risk events, MFA status, and conditional access results",
  },
  speData: {
    label: "SharePoint Embedded",
    icon: HardDrive,
    interval: "Every 30 min",
    description: "Discovers SPE containers and collects access events, security events, and content type statistics",
  },
};

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt) return "—";
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const ms = end - start;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return <Badge data-testid={`badge-status-${status}`} className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20"><CheckCircle2 className="h-3 w-3 mr-1" />Completed</Badge>;
    case "running":
      return <Badge data-testid={`badge-status-${status}`} className="bg-blue-500/10 text-blue-500 border-blue-500/20"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Running</Badge>;
    case "failed":
      return <Badge data-testid={`badge-status-${status}`} variant="destructive" className="bg-destructive/10"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
    case "cancelled":
      return <Badge data-testid={`badge-status-${status}`} className="bg-amber-500/10 text-amber-500 border-amber-500/20"><AlertTriangle className="h-3 w-3 mr-1" />Cancelled</Badge>;
    default:
      return <Badge data-testid={`badge-status-${status}`} variant="secondary">{status}</Badge>;
  }
}

export default function SchedulerPage() {
  const { activeTenantId, isMsp } = useActiveTenant();
  const { data: schedulerStatus } = useSchedulerStatus();
  const [jobTypeFilter, setJobTypeFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<string>("all");
  const { data: jobRuns } = useSchedulerJobRuns({
    jobType: jobTypeFilter !== "all" ? jobTypeFilter : undefined,
    tenantId: viewMode === "tenant" ? (activeTenantId || undefined) : undefined,
    limit: 100,
  });
  const { data: auditLog } = useAdminAuditLog(undefined, 50);
  const triggerJob = useTriggerJob();
  const cancelJob = useCancelJob();
  const resetJob = useResetJob();
  const { toast } = useToast();

  const handleTrigger = (jobType: string) => {
    triggerJob.mutate(jobType, {
      onSuccess: () => toast({ title: "Job triggered", description: `${JOB_META[jobType]?.label || jobType} has been triggered` }),
      onError: (err: any) => toast({ title: "Trigger failed", description: err.message, variant: "destructive" }),
    });
  };

  const handleCancel = (jobType: string) => {
    cancelJob.mutate(jobType, {
      onSuccess: () => toast({ title: "Job cancelled", description: `${JOB_META[jobType]?.label || jobType} cancellation requested` }),
    });
  };

  const handleReset = (jobType: string) => {
    resetJob.mutate(jobType, {
      onSuccess: () => toast({ title: "Job reset", description: `${JOB_META[jobType]?.label || jobType} has been reset` }),
    });
  };

  const jobTypes = Object.keys(JOB_META);

  return (
    <Shell>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Scheduler</h1>
          <p className="text-muted-foreground" data-testid="text-page-description">Monitor and control all scheduled collection jobs</p>
        </div>

        <SettingsNav />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {jobTypes.map((jobType) => {
            const meta = JOB_META[jobType];
            const status = schedulerStatus?.[jobType];
            const Icon = meta.icon;
            const isRunning = status?.isRunning || false;

            return (
              <Card key={jobType} data-testid={`card-job-${jobType}`} className={isRunning ? "border-blue-500/50" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <CardTitle className="text-sm font-medium">{meta.label}</CardTitle>
                    </div>
                    {isRunning ? (
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full h-2.5 w-2.5 bg-muted-foreground/30"></span>
                    )}
                  </div>
                  <CardDescription className="text-xs">{meta.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Schedule</span>
                      <p className="font-medium" data-testid={`text-interval-${jobType}`}>{meta.interval}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Last Run</span>
                      <p className="font-medium" data-testid={`text-lastrun-${jobType}`}>{formatTimeAgo(status?.lastRun || null)}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {isRunning ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-7 text-xs"
                        onClick={() => handleCancel(jobType)}
                        data-testid={`button-cancel-${jobType}`}
                      >
                        <Square className="h-3 w-3 mr-1" />
                        Stop
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-7 text-xs"
                        onClick={() => handleTrigger(jobType)}
                        data-testid={`button-trigger-${jobType}`}
                      >
                        <Play className="h-3 w-3 mr-1" />
                        Run Now
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => handleReset(jobType)}
                      data-testid={`button-reset-${jobType}`}
                    >
                      <RotateCcw className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Tabs defaultValue="job-runs" className="space-y-4">
          <TabsList>
            <TabsTrigger value="job-runs" data-testid="tab-job-runs">
              <Timer className="h-4 w-4 mr-2" />
              Job History
            </TabsTrigger>
            <TabsTrigger value="admin-audit" data-testid="tab-admin-audit">
              <FileText className="h-4 w-4 mr-2" />
              Admin Audit Log
            </TabsTrigger>
          </TabsList>

          <TabsContent value="job-runs" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <CardTitle className="text-lg">Job Run History</CardTitle>
                    <CardDescription>Past, present, and scheduled job executions</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={viewMode} onValueChange={setViewMode}>
                      <SelectTrigger className="w-[140px] h-8 text-xs" data-testid="select-view-mode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Tenants</SelectItem>
                        <SelectItem value="tenant">Current Tenant</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={jobTypeFilter} onValueChange={setJobTypeFilter}>
                      <SelectTrigger className="w-[160px] h-8 text-xs" data-testid="select-job-type-filter">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Job Types</SelectItem>
                        {jobTypes.map((jt) => (
                          <SelectItem key={jt} value={jt}>{JOB_META[jt].label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[140px]">Job Type</TableHead>
                        <TableHead>Name / Test</TableHead>
                        <TableHead className="w-[100px]">Status</TableHead>
                        <TableHead className="w-[90px]">Duration</TableHead>
                        <TableHead className="w-[110px]">Started</TableHead>
                        <TableHead>Result</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(!jobRuns || jobRuns.length === 0) ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                            No job runs found
                          </TableCell>
                        </TableRow>
                      ) : (
                        jobRuns.map((run: any) => {
                          const meta = JOB_META[run.jobType];
                          const Icon = meta?.icon || Clock;
                          const resultSummary = run.errorMessage
                            ? run.errorMessage.substring(0, 80)
                            : run.result
                              ? summarizeResult(run.jobType, run.result)
                              : "—";
                          return (
                            <TableRow key={run.id} data-testid={`row-jobrun-${run.id}`}>
                              <TableCell>
                                <div className="flex items-center gap-1.5">
                                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="text-xs font-medium">{meta?.label || run.jobType}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <span className="text-xs" data-testid={`text-jobrun-name-${run.id}`}>
                                  {run.testName || run.tenantId?.substring(0, 8) || "—"}
                                </span>
                              </TableCell>
                              <TableCell>
                                <StatusBadge status={run.status} />
                              </TableCell>
                              <TableCell>
                                <span className="text-xs text-muted-foreground" data-testid={`text-jobrun-duration-${run.id}`}>
                                  {formatDuration(run.startedAt, run.completedAt)}
                                </span>
                              </TableCell>
                              <TableCell>
                                <span className="text-xs text-muted-foreground" data-testid={`text-jobrun-started-${run.id}`}>
                                  {formatTimeAgo(run.startedAt)}
                                </span>
                              </TableCell>
                              <TableCell>
                                <span className="text-xs text-muted-foreground truncate max-w-[200px] block" data-testid={`text-jobrun-result-${run.id}`}>
                                  {resultSummary}
                                </span>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="admin-audit" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Admin Audit Trail</CardTitle>
                <CardDescription>Internal log of all administrative actions taken in Reveille Cloud</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[110px]">When</TableHead>
                        <TableHead className="w-[180px]">Action</TableHead>
                        <TableHead className="w-[120px]">Target Type</TableHead>
                        <TableHead>Target ID</TableHead>
                        <TableHead>Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(!auditLog || auditLog.length === 0) ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            No admin actions recorded yet
                          </TableCell>
                        </TableRow>
                      ) : (
                        auditLog.map((entry: any) => (
                          <TableRow key={entry.id} data-testid={`row-audit-${entry.id}`}>
                            <TableCell>
                              <span className="text-xs text-muted-foreground" data-testid={`text-audit-time-${entry.id}`}>
                                {formatTimeAgo(entry.timestamp)}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs font-mono" data-testid={`badge-audit-action-${entry.id}`}>
                                {entry.action}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <span className="text-xs" data-testid={`text-audit-target-${entry.id}`}>{entry.targetType}</span>
                            </TableCell>
                            <TableCell>
                              <span className="text-xs text-muted-foreground font-mono truncate max-w-[120px] block">
                                {entry.targetId ? entry.targetId.substring(0, 12) + "..." : "—"}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className="text-xs text-muted-foreground truncate max-w-[200px] block">
                                {entry.details ? summarizeAuditDetails(entry.details) : "—"}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Shell>
  );
}

function summarizeResult(jobType: string, result: any): string {
  if (!result || typeof result !== "object") return "—";
  if (result.error) return result.error;

  switch (jobType) {
    case "syntheticTest":
      return `${result.status || ""}${result.durationMs ? ` · ${result.durationMs}ms` : ""}`;
    case "graphReports":
      return `${result.totalCollected || 0} records collected`;
    case "serviceHealth": {
      const parts: string[] = [];
      if (result.incidentsProcessed) parts.push(`${result.incidentsProcessed} processed`);
      if (result.newIncidents) parts.push(`${result.newIncidents} new`);
      if (result.alertsCreated) parts.push(`${result.alertsCreated} alerts`);
      return parts.length > 0 ? parts.join(", ") : "No incidents";
    }
    case "auditLogs":
      return `${result.entriesCollected || 0} entries collected`;
    case "siteStructure":
      return `${result.totalCollected || 0} records collected`;
    case "powerPlatform": {
      const pp: string[] = [];
      if (result.environments) pp.push(`${result.environments} envs`);
      if (result.apps) pp.push(`${result.apps} apps`);
      if (result.flows) pp.push(`${result.flows} flows`);
      if (result.bots) pp.push(`${result.bots} bots`);
      return pp.length > 0 ? pp.join(", ") : "No resources found";
    }
    case "copilotInteractions": {
      const ci: string[] = [];
      if (result.usersProcessed) ci.push(`${result.usersProcessed} users`);
      if (result.interactionsCollected) ci.push(`${result.interactionsCollected} interactions`);
      if (result.errors?.length) ci.push(`${result.errors.length} errors`);
      return ci.length > 0 ? ci.join(", ") : "No interactions found";
    }
    default:
      return JSON.stringify(result).substring(0, 60);
  }
}

function summarizeAuditDetails(details: any): string {
  if (!details || typeof details !== "object") return "—";
  if (details.name) return details.name;
  if (details.jobType) return details.jobType;
  if (details.changes) {
    const keys = Object.keys(details.changes);
    return `Changed: ${keys.join(", ")}`;
  }
  return JSON.stringify(details).substring(0, 60);
}
