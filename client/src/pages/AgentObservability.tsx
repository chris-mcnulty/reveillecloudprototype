import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ScanSearch,
  Shield,
  FileText,
  Cpu,
  Key,
  Globe,
  Bot,
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Sparkles,
  RotateCcw,
  Bell,
  Power,
  ExternalLink,
  CreditCard,
  Phone,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Minus,
  CircleDot,
  Zap,
  Database,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

type AgentPlatform = "copilot" | "gpt" | "openai" | "agentforce";
type TraceStatus = "success" | "failed" | "degraded" | "running";
type SpanStatus = "success" | "failed" | "skipped" | "running" | "degraded";
type SpanType = "auth" | "content" | "mcp" | "license" | "api" | "inference";

interface AgentHealthItem {
  agentName: string;
  platform: string;
  status: string;
  lastInvocation: string | null;
  successRate24h: number;
  avgLatency: number;
}

interface ApiTrace {
  id: string;
  tenantId: string;
  agentName: string;
  platform: string;
  status: string;
  totalDurationMs: number | null;
  errorSummary: string | null;
  startedAt: string;
  completedAt: string | null;
  metadata: Record<string, any> | null;
}

interface ApiSpan {
  id: string;
  traceId: string;
  spanName: string;
  spanType: string;
  serviceName: string;
  endpoint: string | null;
  durationMs: number | null;
  statusCode: number | null;
  status: string;
  errorMessage: string | null;
  startOffset: number;
  sortOrder: number;
  metadata: Record<string, any> | null;
}

interface ActionItem {
  label: string;
  icon: "retry" | "escalate" | "disable" | "logs" | "capacity" | "vendor";
  variant: "default" | "destructive" | "outline";
  description?: string;
}

interface Diagnosis {
  rootCause: string;
  impact: string;
  pattern: string;
}

function normalizePlatform(p: string): AgentPlatform {
  if (p === "openai") return "gpt";
  return p as AgentPlatform;
}

function platformLabel(platform: string): string {
  switch (platform) {
    case "copilot": return "Copilot";
    case "gpt": case "openai": return "OpenAI GPT";
    case "agentforce": return "Agentforce";
    default: return platform;
  }
}

function platformBadge(platform: string) {
  const p = normalizePlatform(platform);
  switch (p) {
    case "copilot":
      return <Badge data-testid={`badge-platform-${p}`} className="bg-blue-600 text-white text-[10px] px-1.5">Copilot</Badge>;
    case "gpt":
      return <Badge data-testid={`badge-platform-${p}`} className="bg-emerald-700 text-white text-[10px] px-1.5">OpenAI GPT</Badge>;
    case "agentforce":
      return <Badge data-testid={`badge-platform-${p}`} className="bg-indigo-600 text-white text-[10px] px-1.5">Agentforce</Badge>;
    default:
      return <Badge className="text-[10px] px-1.5">{platform}</Badge>;
  }
}

function statusBadge(status: string) {
  switch (status) {
    case "success":
      return <Badge data-testid="badge-status-success" className="bg-green-600 text-white"><CheckCircle2 className="h-3 w-3 mr-1" />Success</Badge>;
    case "failed":
      return <Badge data-testid="badge-status-failed" variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
    case "degraded":
      return <Badge data-testid="badge-status-degraded" className="bg-amber-500 text-white"><AlertTriangle className="h-3 w-3 mr-1" />Degraded</Badge>;
    case "running":
      return <Badge data-testid="badge-status-running" className="bg-blue-500 text-white"><Clock className="h-3 w-3 mr-1" />Running</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

function agentStatusIndicator(status: string) {
  switch (status) {
    case "healthy":
      return <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" /><span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" /></span>;
    case "degraded":
      return <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" /><span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" /></span>;
    case "failed":
      return <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" /><span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" /></span>;
    default:
      return <span className="relative flex h-3 w-3"><span className="relative inline-flex rounded-full h-3 w-3 bg-gray-400" /></span>;
  }
}

function spanTypeIcon(type: string) {
  switch (type) {
    case "auth": return <Shield className="h-4 w-4 text-amber-500" />;
    case "content": return <FileText className="h-4 w-4 text-blue-500" />;
    case "mcp": return <Cpu className="h-4 w-4 text-purple-500" />;
    case "license": return <Key className="h-4 w-4 text-orange-500" />;
    case "api": return <Globe className="h-4 w-4 text-cyan-500" />;
    case "inference": return <Bot className="h-4 w-4 text-green-500" />;
    default: return <Activity className="h-4 w-4 text-gray-400" />;
  }
}

function spanStatusColor(status: string): string {
  switch (status) {
    case "success": return "bg-green-500";
    case "failed": return "bg-red-500";
    case "skipped": return "bg-gray-400";
    case "running": return "bg-blue-500";
    case "degraded": return "bg-amber-500";
    default: return "bg-gray-400";
  }
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null || ms === 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  } catch {
    return iso;
  }
}

function formatTimeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
  return `${Math.round(diff / 86400000)}d ago`;
}

function actionIcon(type: ActionItem["icon"]) {
  switch (type) {
    case "retry": return <RotateCcw className="h-3.5 w-3.5" />;
    case "escalate": return <Bell className="h-3.5 w-3.5" />;
    case "disable": return <Power className="h-3.5 w-3.5" />;
    case "logs": return <ExternalLink className="h-3.5 w-3.5" />;
    case "capacity": return <CreditCard className="h-3.5 w-3.5" />;
    case "vendor": return <Phone className="h-3.5 w-3.5" />;
  }
}

function inferDiagnosis(trace: ApiTrace, spans: ApiSpan[]): Diagnosis | null {
  const failedSpan = spans.find(s => s.status === "failed");
  if (!failedSpan) return null;

  const errorMsg = failedSpan.errorMessage || trace.errorSummary || "";

  if (errorMsg.includes("AADSTS50076") || errorMsg.includes("MFA")) {
    return {
      rootCause: `Entra ID returned an MFA challenge. The user needs to re-authenticate with multi-factor verification. This is Conditional Access policy enforcement.`,
      impact: "1 user affected. Agent invocations for this user will fail until MFA is completed.",
      pattern: "This is typically an isolated user-level incident, not a systemic issue.",
    };
  }
  if (errorMsg.includes("timeout") || errorMsg.includes("timed out") || (failedSpan.statusCode === 504)) {
    return {
      rootCause: `${failedSpan.spanName} did not respond within the configured timeout. The service may be under heavy load or experiencing connectivity issues.`,
      impact: "Users requesting this agent capability will experience failures until the upstream service recovers.",
      pattern: "Check if this is a recurring pattern — frequent timeouts suggest capacity or reliability issues with the upstream service.",
    };
  }
  if (errorMsg.includes("rate limit") || errorMsg.includes("Rate limit") || failedSpan.statusCode === 429) {
    return {
      rootCause: `${failedSpan.serviceName} returned HTTP 429 (Rate Limit Exceeded). The API usage has hit the configured TPM/RPM limits.`,
      impact: "Concurrent users may receive rate limit errors. Requests will auto-recover after the rate limit window resets.",
      pattern: "Rate limiting typically occurs during peak usage hours. Consider implementing request queuing or upgrading the API tier.",
    };
  }
  if (errorMsg.includes("context") || errorMsg.includes("Context length") || errorMsg.includes("token")) {
    return {
      rootCause: `The input exceeded the model's maximum context window. Too many documents were retrieved in the RAG step, producing more tokens than the model can handle.`,
      impact: "1 user affected. The query was unusually broad.",
      pattern: "Context window errors are rare and correlate with queries containing broad temporal ranges.",
    };
  }
  if (errorMsg.includes("License") || errorMsg.includes("license") || errorMsg.includes("capacity") || errorMsg.includes("credits")) {
    return {
      rootCause: `License or capacity limit reached. ${errorMsg}`,
      impact: "All agents depending on this license/capacity will be blocked until limits reset or are increased.",
      pattern: "Monitor license consumption trends to avoid future exhaustion.",
    };
  }
  if (errorMsg.includes("invalid_grant") || errorMsg.includes("token refresh") || errorMsg.includes("OAuth")) {
    return {
      rootCause: `OAuth authorization has been revoked or the refresh token has expired. Re-authentication is required.`,
      impact: "All agent invocations using this OAuth connection will fail until re-authorized.",
      pattern: "This is the first occurrence if the Connected App was previously stable.",
    };
  }

  return {
    rootCause: errorMsg || "Unknown error occurred.",
    impact: "Impact assessment requires further investigation.",
    pattern: "Check recent trace history for similar failures.",
  };
}

function inferActions(trace: ApiTrace, spans: ApiSpan[]): ActionItem[] {
  const failedSpan = spans.find(s => s.status === "failed");
  if (!failedSpan) return [];

  const actions: ActionItem[] = [];
  const errorMsg = failedSpan.errorMessage || "";

  if (failedSpan.statusCode === 429 || errorMsg.includes("timeout") || failedSpan.statusCode === 504) {
    actions.push({ label: "Retry Trace", icon: "retry", variant: "default" });
  }
  if (errorMsg.includes("MFA") || errorMsg.includes("AADSTS")) {
    actions.push({ label: "View Entra Sign-in Logs", icon: "logs", variant: "outline" });
    actions.push({ label: "Notify User", icon: "escalate", variant: "default" });
  }
  if (errorMsg.includes("invalid_grant") || errorMsg.includes("OAuth")) {
    actions.push({ label: "Escalate to Admin", icon: "escalate", variant: "default" });
    actions.push({ label: "Disable Agent", icon: "disable", variant: "destructive" });
  }
  if (errorMsg.includes("License") || errorMsg.includes("credits") || errorMsg.includes("capacity")) {
    actions.push({ label: "Increase Capacity", icon: "capacity", variant: "default" });
    actions.push({ label: "Escalate to Admin", icon: "escalate", variant: "default" });
  }
  if (failedSpan.spanType === "mcp") {
    actions.push({ label: "View MCP Server Logs", icon: "logs", variant: "outline" });
  }
  if (failedSpan.spanType === "inference" && failedSpan.serviceName?.includes("OpenAI")) {
    actions.push({ label: "Contact Vendor", icon: "vendor", variant: "outline", description: "OpenAI Status: status.openai.com" });
  }
  if (failedSpan.spanType === "auth" && failedSpan.serviceName?.includes("Salesforce")) {
    actions.push({ label: "View Salesforce Setup", icon: "logs", variant: "outline", description: "Setup > Connected Apps" });
    actions.push({ label: "Contact Vendor", icon: "vendor", variant: "outline", description: "Salesforce Trust: trust.salesforce.com" });
  }

  if (actions.length === 0) {
    actions.push({ label: "View Logs", icon: "logs", variant: "outline" });
    actions.push({ label: "Escalate to Admin", icon: "escalate", variant: "default" });
  }

  return actions;
}

function WaterfallView({ spans, totalDurationMs }: { spans: ApiSpan[]; totalDurationMs: number }) {
  const maxDuration = Math.max(totalDurationMs, 1);

  return (
    <div className="space-y-1.5 py-2" data-testid="waterfall-view">
      {spans.map((span) => {
        const leftPct = (span.startOffset / maxDuration) * 100;
        const widthPct = Math.max(((span.durationMs || 0) / maxDuration) * 100, span.status === "skipped" ? 0 : 1.5);

        return (
          <div key={span.id} className="flex items-center gap-3 group" data-testid={`span-${span.id}`}>
            <div className="flex items-center gap-2 w-52 shrink-0">
              {spanTypeIcon(span.spanType)}
              <span className="text-xs font-medium truncate">{span.spanName}</span>
            </div>
            <div className="flex-1 relative h-7 bg-muted/40 rounded overflow-hidden">
              {span.status !== "skipped" ? (
                <div
                  className={`absolute top-1 bottom-1 rounded ${spanStatusColor(span.status)} ${span.status === "running" ? "animate-pulse" : ""}`}
                  style={{ left: `${leftPct}%`, width: `${widthPct}%`, minWidth: "6px" }}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[10px] text-muted-foreground italic">skipped</span>
                </div>
              )}
            </div>
            <div className="w-16 text-right text-xs text-muted-foreground shrink-0">
              {formatDuration(span.durationMs)}
            </div>
            <div className="w-12 text-right shrink-0">
              {span.statusCode ? (
                <Badge variant="outline" className={`text-[10px] px-1 ${span.statusCode >= 400 ? "border-red-500 text-red-500" : "border-green-500 text-green-500"}`}>
                  {span.statusCode}
                </Badge>
              ) : null}
            </div>
          </div>
        );
      })}
      {spans.filter(s => s.errorMessage).map((span) => (
        <div key={`err-${span.id}`} className="ml-[220px] mt-1 p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400">
          <span className="font-semibold">{span.spanName}:</span> {span.errorMessage}
        </div>
      ))}
    </div>
  );
}

function DiagnosisPanel({ diagnosis }: { diagnosis: Diagnosis }) {
  return (
    <Card className="border-purple-500/30 bg-purple-500/5" data-testid="diagnosis-panel">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-400" />
          AI Diagnosis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <span className="font-semibold text-foreground">Root Cause:</span>
          <p className="text-muted-foreground mt-0.5 leading-relaxed">{diagnosis.rootCause}</p>
        </div>
        <div className="flex gap-6">
          <div>
            <span className="font-semibold text-foreground">Impact:</span>
            <p className="text-muted-foreground mt-0.5">{diagnosis.impact}</p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          {diagnosis.pattern.includes("trending upward") || diagnosis.pattern.includes("increased") ? (
            <TrendingUp className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
          ) : diagnosis.pattern.includes("rare") || diagnosis.pattern.includes("isolated") || diagnosis.pattern.includes("first") ? (
            <Minus className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          ) : (
            <TrendingDown className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
          )}
          <div>
            <span className="font-semibold text-foreground">Pattern:</span>
            <p className="text-muted-foreground mt-0.5">{diagnosis.pattern}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ActionsPanel({ actions }: { actions: ActionItem[] }) {
  if (actions.length === 0) return null;

  return (
    <Card data-testid="actions-panel">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-400" />
          Actions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {actions.map((action, i) => (
            <Button
              key={i}
              variant={action.variant as any}
              size="sm"
              className="text-xs gap-1.5"
              data-testid={`action-${action.icon}-${i}`}
            >
              {actionIcon(action.icon)}
              {action.label}
            </Button>
          ))}
        </div>
        {actions.some(a => a.description) && (
          <div className="text-[11px] text-muted-foreground space-y-0.5">
            {actions.filter(a => a.description).map((a, i) => (
              <div key={i} className="flex items-center gap-1">
                <CircleDot className="h-2.5 w-2.5" /> {a.label}: {a.description}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TraceDetailRow({ traceId }: { traceId: string }) {
  const { data, isLoading } = useQuery<{ trace: ApiTrace; spans: ApiSpan[] }>({
    queryKey: ["/api/agent-traces", traceId],
    queryFn: async () => {
      const res = await fetch(`/api/agent-traces/${traceId}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm text-muted-foreground">Loading trace details...</span>
      </div>
    );
  }

  if (!data) return null;

  const { trace, spans } = data;
  const diagnosis = inferDiagnosis(trace, spans);
  const actions = inferActions(trace, spans);

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Execution Waterfall
          <span className="text-xs font-normal text-muted-foreground">
            Total: {formatDuration(trace.totalDurationMs)}
          </span>
        </h4>
        <WaterfallView spans={spans} totalDurationMs={trace.totalDurationMs || 0} />
      </div>
      {(diagnosis || actions.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {diagnosis && <DiagnosisPanel diagnosis={diagnosis} />}
          {actions.length > 0 && <ActionsPanel actions={actions} />}
        </div>
      )}
    </div>
  );
}

export default function AgentObservability() {
  const queryClient = useQueryClient();
  const [expandedTraceId, setExpandedTraceId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [agentSearch, setAgentSearch] = useState("");

  const { data: healthData = [], isLoading: healthLoading } = useQuery<AgentHealthItem[]>({
    queryKey: ["/api/agent-health"],
    queryFn: async () => {
      const res = await fetch("/api/agent-health");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    refetchInterval: 30000,
  });

  const traceParams = new URLSearchParams();
  if (platformFilter !== "all") traceParams.set("platform", platformFilter);
  if (statusFilter !== "all") traceParams.set("status", statusFilter);
  traceParams.set("limit", "50");
  const traceUrl = `/api/agent-traces?${traceParams.toString()}`;

  const { data: traces = [], isLoading: tracesLoading } = useQuery<ApiTrace[]>({
    queryKey: ["/api/agent-traces", platformFilter, statusFilter],
    queryFn: async () => {
      const res = await fetch(traceUrl);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    refetchInterval: 15000,
  });

  const seedMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/agent-traces/seed-demo", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent-traces"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agent-health"] });
    },
  });

  const filteredTraces = useMemo(() => {
    if (!agentSearch) return traces;
    return traces.filter(t =>
      t.agentName.toLowerCase().includes(agentSearch.toLowerCase())
    );
  }, [traces, agentSearch]);

  const healthyCount = healthData.filter(a => a.status === "healthy").length;
  const degradedCount = healthData.filter(a => a.status === "degraded").length;
  const failedAgentCount = healthData.filter(a => a.status === "failed").length;
  const avgSuccessRate = healthData.length > 0
    ? Math.round(healthData.reduce((s, a) => s + a.successRate24h, 0) / healthData.length * 10) / 10
    : 0;

  const chartData = useMemo(() => {
    const days = new Map<string, { success: number; failed: number; degraded: number }>();
    for (const trace of traces) {
      const d = new Date(trace.startedAt);
      const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      if (!days.has(label)) days.set(label, { success: 0, failed: 0, degraded: 0 });
      const bucket = days.get(label)!;
      if (trace.status === "success") bucket.success++;
      else if (trace.status === "failed") bucket.failed++;
      else if (trace.status === "degraded") bucket.degraded++;
    }
    return Array.from(days.entries()).map(([day, counts]) => ({ day, ...counts }));
  }, [traces]);

  const hasData = traces.length > 0 || healthData.length > 0;

  return (
    <Shell>
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ScanSearch className="h-6 w-6" />
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Agent Observability</h1>
          {hasData && (
            <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30 text-xs font-medium" data-testid="badge-live-data">
              <Activity className="h-3 w-3 mr-1" />Live
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/agent-traces"] });
              queryClient.invalidateQueries({ queryKey: ["/api/agent-health"] });
            }}
            data-testid="button-refresh"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
            data-testid="button-seed-demo"
          >
            {seedMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Database className="h-3.5 w-3.5 mr-1.5" />
            )}
            Seed Demo Data
          </Button>
        </div>
      </div>

      {!hasData && !healthLoading && !tracesLoading && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Database className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Agent Traces Yet</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md">
              Seed demo data to see how Agent Observability works with Copilot, OpenAI GPT, and Agentforce agent traces.
            </p>
            <Button
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              data-testid="button-seed-demo-empty"
            >
              {seedMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Database className="h-4 w-4 mr-2" />
              )}
              Seed Demo Data
            </Button>
          </CardContent>
        </Card>
      )}

      {(hasData || healthLoading || tracesLoading) && (
        <>
          <div className="grid gap-4 md:grid-cols-5">
            <Card data-testid="card-total-agents">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Agents</CardTitle>
                <Bot className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-agents">{healthData.length}</div>
                <p className="text-xs text-muted-foreground">
                  {new Set(healthData.map(a => a.platform)).size} platform{new Set(healthData.map(a => a.platform)).size !== 1 ? "s" : ""}
                </p>
              </CardContent>
            </Card>
            <Card data-testid="card-healthy">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Healthy</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-500" data-testid="text-healthy-count">{healthyCount}</div>
              </CardContent>
            </Card>
            <Card data-testid="card-degraded">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Degraded</CardTitle>
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-500" data-testid="text-degraded-count">{degradedCount}</div>
              </CardContent>
            </Card>
            <Card data-testid="card-failed-agents">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Failed</CardTitle>
                <XCircle className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-500" data-testid="text-failed-agent-count">{failedAgentCount}</div>
              </CardContent>
            </Card>
            <Card data-testid="card-success-rate">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Success Rate</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-avg-success-rate">{avgSuccessRate}%</div>
                <p className="text-xs text-muted-foreground">Last 24 hours</p>
              </CardContent>
            </Card>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-3" data-testid="text-section-current-state">Current State</h2>
            {healthLoading ? (
              <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Loading agent health...</span>
              </div>
            ) : healthData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No agent health data available.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {healthData.map((agent, i) => (
                  <Card
                    key={`${agent.agentName}-${agent.platform}`}
                    className={`transition-all ${
                      agent.status === "failed" ? "border-red-500/40" :
                      agent.status === "degraded" ? "border-amber-500/40" : ""
                    }`}
                    data-testid={`card-agent-${i}`}
                  >
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            {agentStatusIndicator(agent.status)}
                            <span className="text-sm font-semibold">{agent.agentName}</span>
                          </div>
                          {platformBadge(agent.platform)}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-center">
                        <div>
                          <div className="text-xs text-muted-foreground">Success</div>
                          <div className={`text-sm font-bold ${agent.successRate24h >= 90 ? "text-green-500" : agent.successRate24h >= 70 ? "text-amber-500" : "text-red-500"}`}>
                            {agent.successRate24h}%
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Latency</div>
                          <div className="text-sm font-bold">{formatDuration(agent.avgLatency)}</div>
                        </div>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Last: {formatTimeAgo(agent.lastInvocation)}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-3" data-testid="text-section-history">Trace History</h2>
            {chartData.length > 0 && (
              <Card className="mb-4">
                <CardContent className="pt-4">
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                      />
                      <Legend iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
                      <Bar dataKey="success" stackId="a" fill="#22c55e" name="Success" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="degraded" stackId="a" fill="#f59e0b" name="Degraded" />
                      <Bar dataKey="failed" stackId="a" fill="#ef4444" name="Failed" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            <div className="flex gap-3 mb-4 flex-wrap">
              <Select value={platformFilter} onValueChange={setPlatformFilter}>
                <SelectTrigger className="w-40" data-testid="filter-platform">
                  <SelectValue placeholder="Platform" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Platforms</SelectItem>
                  <SelectItem value="copilot">Copilot</SelectItem>
                  <SelectItem value="gpt">OpenAI GPT</SelectItem>
                  <SelectItem value="agentforce">Agentforce</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36" data-testid="filter-status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="degraded">Degraded</SelectItem>
                  <SelectItem value="running">Running</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="Search agent name..."
                value={agentSearch}
                onChange={(e) => setAgentSearch(e.target.value)}
                className="w-56"
                data-testid="input-agent-search"
              />
            </div>

            <Card>
              <CardContent className="p-0">
                {tracesLoading ? (
                  <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Loading traces...</span>
                  </div>
                ) : filteredTraces.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    No traces match the current filters.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8"></TableHead>
                        <TableHead>Platform</TableHead>
                        <TableHead>Agent</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead>Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTraces.map((trace) => (
                        <>
                          <TableRow
                            key={trace.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => setExpandedTraceId(expandedTraceId === trace.id ? null : trace.id)}
                            data-testid={`row-trace-${trace.id}`}
                          >
                            <TableCell className="px-3">
                              {expandedTraceId === trace.id ?
                                <ChevronDown className="h-4 w-4 text-muted-foreground" /> :
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              }
                            </TableCell>
                            <TableCell>{platformBadge(trace.platform)}</TableCell>
                            <TableCell className="font-medium text-sm">{trace.agentName}</TableCell>
                            <TableCell>{statusBadge(trace.status)}</TableCell>
                            <TableCell className="text-sm">{formatDuration(trace.totalDurationMs)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{formatTime(trace.startedAt)}</TableCell>
                            <TableCell className="text-xs text-red-400 max-w-[200px] truncate">{trace.errorSummary || ""}</TableCell>
                          </TableRow>
                          {expandedTraceId === trace.id && (
                            <TableRow key={`${trace.id}-detail`}>
                              <TableCell colSpan={7} className="bg-muted/20 p-4">
                                <TraceDetailRow traceId={trace.id} />
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
    </Shell>
  );
}
