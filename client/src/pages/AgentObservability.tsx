import { useState, useMemo, useEffect, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  MessageSquare,
  Users,
  Hash,
  ArrowRight,
  User,
  Plus,
  Pencil,
  Search,
  Link,
  Settings,
} from "lucide-react";
import { useActiveTenant } from "@/lib/tenant-context";
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

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameYear = d.getFullYear() === now.getFullYear();
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      ...(sameYear ? {} : { year: "numeric" }),
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
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

interface CopilotInteraction {
  id: string;
  tenantId: string;
  interactionId: string;
  requestId: string | null;
  sessionId: string | null;
  interactionType: string;
  appClass: string | null;
  userId: string | null;
  userName: string | null;
  bodyContent: string | null;
  bodyContentType: string | null;
  contexts: any[] | null;
  attachments: any[] | null;
  links: any[] | null;
  mentions: any[] | null;
  createdAt: string;
  collectedAt: string;
}

interface CopilotStats {
  totalInteractions: number;
  uniqueUsers: number;
  uniqueSessions: number;
  appBreakdown: Record<string, number>;
  successRate: number;
}

function appClassLabel(appClass: string | null): string {
  if (!appClass) return "Unknown";
  const lower = appClass.toLowerCase();
  if (lower.includes("bizchat")) return "BizChat";
  if (lower.includes("webchat")) return "Web Chat";
  if (lower.includes("teams")) return "Teams";
  if (lower.includes("word")) return "Word";
  if (lower.includes("excel")) return "Excel";
  if (lower.includes("powerpoint")) return "PowerPoint";
  if (lower.includes("outlook")) return "Outlook";
  if (lower.includes("sharepoint")) return "SharePoint";
  if (lower.includes("stream")) return "Stream";
  if (lower.includes("onenote")) return "OneNote";
  if (lower.includes("searchanswer") || lower.includes("officecopi")) return "Search";
  if (lower.includes("bing")) return "Bing Chat";
  if (lower.includes("copilot")) return "Copilot";
  return appClass.replace(/^IPM\.SkypeTeams\.Message\.Copilot\./i, "");
}

function appClassColor(appClass: string | null): string {
  const label = appClassLabel(appClass);
  switch (label) {
    case "Teams": return "bg-purple-600 text-white";
    case "Word": return "bg-blue-700 text-white";
    case "Excel": return "bg-green-700 text-white";
    case "PowerPoint": return "bg-orange-600 text-white";
    case "Outlook": return "bg-sky-600 text-white";
    case "SharePoint": return "bg-teal-600 text-white";
    case "BizChat": return "bg-indigo-600 text-white";
    case "Web Chat": return "bg-violet-600 text-white";
    case "Stream": return "bg-red-600 text-white";
    case "Search": return "bg-amber-600 text-white";
    case "OneNote": return "bg-purple-800 text-white";
    case "Copilot": return "bg-blue-500 text-white";
    default: return "bg-gray-500 text-white";
  }
}

function truncateContent(content: string | null, maxLength = 120): string {
  if (!content) return "—";
  const stripped = content.replace(/<[^>]*>/g, "").trim();
  if (stripped.length <= maxLength) return stripped;
  return stripped.slice(0, maxLength) + "…";
}

function extractResponseContent(interaction: CopilotInteraction): string {
  const atts = interaction.attachments as any[] | null;
  if (atts && atts.length > 0) {
    for (const att of atts) {
      if (att.content) {
        try {
          const card = JSON.parse(att.content);
          if (card.body) {
            return card.body
              .filter((b: any) => b.type === "TextBlock" && b.text)
              .map((b: any) => b.text)
              .join("\n\n");
          }
        } catch {}
      }
    }
  }
  if (interaction.bodyContent) {
    const raw = interaction.bodyContent.trim();
    if (raw.startsWith("[") && raw.endsWith("]")) {
      try {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.every((x: any) => typeof x === "string")) {
          return arr.map((s: string) => `• ${s}`).join("\n");
        }
      } catch {}
    }
    if (raw.startsWith("{") && raw.endsWith("}")) {
      try {
        const obj = JSON.parse(raw);
        if (obj.IsWarmupRequest === "true") return "";
        if (obj.type === "AdaptiveCard" && obj.body) {
          const texts = obj.body
            .filter((b: any) => b.type === "TextBlock" && b.text)
            .map((b: any) => b.text);
          if (texts.length > 0) return texts.join("\n\n");
        }
      } catch {}
    }
    const stripped = raw.replace(/<attachment[^>]*><\/attachment>/g, "").replace(/<[^>]*>/g, "").trim();
    if (stripped) return stripped;
  }
  return "";
}

function extractPromptContent(interaction: CopilotInteraction): string {
  if (!interaction.bodyContent) return "—";
  const raw = interaction.bodyContent.trim();
  if (raw.startsWith("{") && raw.endsWith("}")) {
    try {
      const obj = JSON.parse(raw);
      if (obj.UserInput && typeof obj.UserInput === "string") return obj.UserInput;
      if (obj.Subject && typeof obj.Subject === "string") return `Re: ${obj.Subject}`;
      if (obj.RequestId && !obj.UserInput && !obj.Subject) return "Suggested drafts";
    } catch {}
  }
  if (raw === "Suggested drafts") return "Suggested drafts";
  const stripped = raw.replace(/<attachment[^>]*><\/attachment>/g, "").replace(/<\/?[^>]*>/g, "").replace(/\[AutoGenerated\]undefined/g, "").trim();
  return stripped || "—";
}

function cleanPromptPreview(text: string | null): string | null {
  if (!text) return null;
  const raw = text.trim();
  if (raw.startsWith("{")) {
    try {
      const obj = JSON.parse(raw);
      if (obj.UserInput) return obj.UserInput;
      if (obj.Subject) return `Re: ${obj.Subject}`;
      if (obj.RequestId) return "Suggested drafts";
    } catch {}
  }
  return raw.replace(/<attachment[^>]*><\/attachment>/g, "").replace(/<\/?[^>]*>/g, "").replace(/\[AutoGenerated\]undefined/g, "").trim() || null;
}

function extractLinks(interaction: CopilotInteraction): { url: string; name: string }[] {
  const links = interaction.links as any[] | null;
  if (!links || links.length === 0) return [];
  return links.filter(l => l.linkUrl).map(l => {
    let hostname = l.linkUrl;
    try { hostname = new URL(l.linkUrl).hostname; } catch {}
    return { url: l.linkUrl, name: l.displayName || hostname };
  });
}

interface SessionSummary {
  sessionId: string;
  userId: string;
  userName: string | null;
  appClass: string | null;
  turns: number;
  latestTime: string;
  firstPrompt: string | null;
  promptCount: number;
  responseCount: number;
  status: string;
}

function CopilotInteractionsTab({ tenantId }: { tenantId: string | null }) {
  const [appFilter, setAppFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [userSearch, setUserSearch] = useState("");
  const [debouncedUserSearch, setDebouncedUserSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 25;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedUserSearch(userSearch), 400);
    return () => clearTimeout(timer);
  }, [userSearch]);

  useEffect(() => {
    setPage(0);
  }, [appFilter, statusFilter, debouncedUserSearch, dateFrom, dateTo]);

  const { data: stats } = useQuery<CopilotStats>({
    queryKey: ["/api/copilot-interactions/stats", tenantId],
    queryFn: async () => {
      if (!tenantId) return { totalInteractions: 0, uniqueUsers: 0, uniqueSessions: 0, appBreakdown: {} };
      const res = await fetch(`/api/tenants/${tenantId}/copilot-interactions/stats`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!tenantId,
    refetchInterval: 30000,
  });

  const sessionParams = new URLSearchParams();
  if (appFilter !== "all") sessionParams.set("appClass", appFilter);
  if (statusFilter !== "all") sessionParams.set("status", statusFilter);
  if (debouncedUserSearch) sessionParams.set("userId", debouncedUserSearch);
  if (dateFrom) sessionParams.set("dateFrom", dateFrom);
  if (dateTo) sessionParams.set("dateTo", dateTo);
  sessionParams.set("offset", String(page * pageSize));
  sessionParams.set("limit", String(pageSize));

  const { data: sessionData, isLoading } = useQuery<{ sessions: SessionSummary[]; total: number }>({
    queryKey: ["/api/copilot-interactions/session-list", tenantId, appFilter, statusFilter, debouncedUserSearch, dateFrom, dateTo, page],
    queryFn: async () => {
      if (!tenantId) return { sessions: [], total: 0 };
      const res = await fetch(`/api/tenants/${tenantId}/copilot-interactions/session-list?${sessionParams.toString()}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!tenantId,
    refetchInterval: 30000,
  });

  const sessions = sessionData?.sessions || [];
  const totalSessions = sessionData?.total || 0;
  const totalPages = Math.ceil(totalSessions / pageSize);

  const { data: sessionInteractions = [] } = useQuery<CopilotInteraction[]>({
    queryKey: ["/api/copilot-interactions/session", tenantId, expandedSession],
    queryFn: async () => {
      if (!tenantId || !expandedSession) return [];
      const res = await fetch(`/api/tenants/${tenantId}/copilot-interactions/sessions/${expandedSession}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!tenantId && !!expandedSession,
  });

  const sessionPairs = useMemo(() => {
    const byRequest = new Map<string, { prompt?: CopilotInteraction; thinking?: CopilotInteraction; answer?: CopilotInteraction; responses: CopilotInteraction[] }>();
    for (const i of sessionInteractions) {
      const rid = i.requestId || i.id;
      if (!byRequest.has(rid)) byRequest.set(rid, { responses: [] });
      const group = byRequest.get(rid)!;
      if (i.interactionType === "userPrompt") {
        group.prompt = i;
      } else if (i.interactionType === "aiResponse") {
        group.responses.push(i);
      }
    }
    for (const group of byRequest.values()) {
      if (group.responses.length === 1) {
        group.answer = group.responses[0];
      } else if (group.responses.length > 1) {
        group.answer = group.responses.find(r => r.bodyContentType === "html" || (r.attachments && (r.attachments as any[]).length > 0));
        group.thinking = group.responses.find(r => r !== group.answer && r.bodyContentType === "text");
        if (!group.answer) group.answer = group.responses[group.responses.length - 1];
      }
    }
    return Array.from(byRequest.values())
      .filter(group => {
        const promptText = group.prompt ? extractPromptContent(group.prompt) : "";
        const answerText = group.answer ? extractResponseContent(group.answer) : "";
        if (!promptText && !answerText) return false;
        if (promptText === "—" && !answerText) return false;
        return true;
      })
      .sort((a, b) => {
        const aTime = a.prompt?.createdAt || a.answer?.createdAt || "";
        const bTime = b.prompt?.createdAt || b.answer?.createdAt || "";
        return aTime.localeCompare(bTime);
      });
  }, [sessionInteractions]);

  const topApp = stats?.appBreakdown
    ? Object.entries(stats.appBreakdown).sort((a, b) => b[1] - a[1])[0]?.[0] || "—"
    : "—";

  if (!tenantId) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Tenant Selected</h3>
          <p className="text-sm text-muted-foreground">Select a tenant to view Copilot interaction history.</p>
        </CardContent>
      </Card>
    );
  }

  if (!isLoading && sessions.length === 0 && (!stats || stats.totalInteractions === 0)) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2" data-testid="text-copilot-empty">No Copilot Interactions Yet</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Copilot interaction history will appear after the next scheduled collection.
            The collector runs every hour and retrieves prompt/response pairs from the Microsoft Graph API.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Requires <code className="bg-muted px-1 rounded">AiEnterpriseInteraction.Read.All</code> application permission.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Card data-testid="card-copilot-total">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Interactions</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-copilot-total">{stats?.totalInteractions || 0}</div>
          </CardContent>
        </Card>
        <Card data-testid="card-copilot-users">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unique Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-copilot-users">{stats?.uniqueUsers || 0}</div>
          </CardContent>
        </Card>
        <Card data-testid="card-copilot-sessions">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unique Sessions</CardTitle>
            <Hash className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-copilot-sessions">{stats?.uniqueSessions || 0}</div>
          </CardContent>
        </Card>
        <Card data-testid="card-copilot-success-rate">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-copilot-success-rate">
              <span className={stats?.successRate === 100 ? "text-green-600" : stats?.successRate && stats.successRate >= 80 ? "text-yellow-600" : "text-red-600"}>
                {stats?.successRate ?? 100}%
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Top: {appClassLabel(topApp)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-3 flex-wrap items-end">
        <Select value={appFilter} onValueChange={setAppFilter}>
          <SelectTrigger className="w-40" data-testid="filter-copilot-app">
            <SelectValue placeholder="App" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Apps</SelectItem>
            {stats?.appBreakdown && Object.keys(stats.appBreakdown)
              .sort((a, b) => (stats.appBreakdown[b] || 0) - (stats.appBreakdown[a] || 0))
              .map((rawApp) => (
                <SelectItem key={rawApp} value={rawApp}>
                  {appClassLabel(rawApp)} ({stats.appBreakdown[rawApp]})
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36" data-testid="filter-copilot-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="success">
              <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-600" /> Success</span>
            </SelectItem>
            <SelectItem value="partial">
              <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-amber-600" /> Partial</span>
            </SelectItem>
            <SelectItem value="failed">
              <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-red-600" /> Failed</span>
            </SelectItem>
          </SelectContent>
        </Select>
        <Input
          placeholder="Search by user..."
          value={userSearch}
          onChange={(e) => setUserSearch(e.target.value)}
          className="w-48"
          data-testid="input-copilot-user-search"
        />
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-muted-foreground whitespace-nowrap">From</label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-36"
            data-testid="input-copilot-date-from"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-muted-foreground whitespace-nowrap">To</label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-36"
            data-testid="input-copilot-date-to"
          />
        </div>
        {(appFilter !== "all" || statusFilter !== "all" || userSearch || dateFrom || dateTo) && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => { setAppFilter("all"); setStatusFilter("all"); setUserSearch(""); setDateFrom(""); setDateTo(""); }}
            data-testid="button-copilot-clear-filters"
          >
            Clear filters
          </Button>
        )}
      </div>

      {expandedSession ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExpandedSession(null)}
              data-testid="button-back-sessions"
            >
              <ChevronRight className="h-3.5 w-3.5 mr-1 rotate-180" />
              Back to Sessions
            </Button>
            <span className="text-sm text-muted-foreground">
              Session: <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{expandedSession.slice(0, 12)}…</code>
            </span>
          </div>

          <div className="space-y-4" data-testid="conversation-thread">
            {sessionPairs.map((group, idx) => (
              <div key={idx} className="space-y-2">
                {group.prompt && (
                  <div className="flex gap-3 items-start" data-testid={`pair-prompt-${idx}`}>
                    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0 mt-1">
                      <User className="h-4 w-4 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium">{group.prompt.userName || group.prompt.userId || "User"}</span>
                        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-[10px]">Prompt</Badge>
                        {group.prompt.appClass && (
                          <Badge className={`${appClassColor(group.prompt.appClass)} text-[10px]`}>{appClassLabel(group.prompt.appClass)}</Badge>
                        )}
                        <span className="text-[11px] text-muted-foreground">{formatDateTime(group.prompt.createdAt)}</span>
                      </div>
                      <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
                        <CardContent className="p-3 text-sm whitespace-pre-wrap">
                          {extractPromptContent(group.prompt)}
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                )}
                {group.thinking && (
                  <div className="flex gap-3 items-start" data-testid={`pair-thinking-${idx}`}>
                    <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center shrink-0 mt-1">
                      <Loader2 className="h-4 w-4 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium">Copilot</span>
                        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 text-[10px]">Reasoning</Badge>
                        <span className="text-[11px] text-muted-foreground">{formatDateTime(group.thinking.createdAt)}</span>
                      </div>
                      <Card className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
                        <CardContent className="p-3 text-sm text-muted-foreground italic whitespace-pre-wrap">
                          {extractResponseContent(group.thinking) || group.thinking.bodyContent?.replace(/<[^>]*>/g, "").trim() || "—"}
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                )}
                {group.answer && (() => {
                  const answerContent = extractResponseContent(group.answer!);
                  const answerLinks = extractLinks(group.answer!);
                  return (
                    <div className="flex gap-3 items-start" data-testid={`pair-response-${idx}`}>
                      <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center shrink-0 mt-1">
                        <Sparkles className="h-4 w-4 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium">Copilot</span>
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-[10px]">Response</Badge>
                          <span className="text-[11px] text-muted-foreground">{formatDateTime(group.answer!.createdAt)}</span>
                        </div>
                        <Card className="bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800">
                          <CardContent className="p-3 text-sm whitespace-pre-wrap">
                            {answerContent || "—"}
                          </CardContent>
                        </Card>
                        {answerLinks.length > 0 && (
                          <div className="mt-2">
                            <span className="text-[11px] text-muted-foreground font-medium">Citations:</span>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {answerLinks.map((link, li) => (
                                <a
                                  key={li}
                                  href={link.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border bg-muted/50 hover:bg-muted text-foreground no-underline"
                                  data-testid={`link-citation-${idx}-${li}`}
                                >
                                  <ExternalLink className="h-2.5 w-2.5" />
                                  {link.name.length > 50 ? link.name.slice(0, 50) + "…" : link.name}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                        {group.answer!.contexts && (group.answer!.contexts as any[]).length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {(group.answer!.contexts as any[]).map((ctx: any, ci: number) => (
                              <Badge key={ci} variant="outline" className="text-[10px]">
                                {ctx.displayName || ctx.contextReference || "Source"}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            ))}
            {sessionPairs.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                Loading conversation...
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Loading sessions...</span>
                </div>
              ) : sessions.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No sessions match the current filters.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Session</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>App</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Turns</TableHead>
                      <TableHead>Last Activity</TableHead>
                      <TableHead>Preview</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessions.map((session) => (
                      <TableRow
                        key={session.sessionId}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setExpandedSession(session.sessionId)}
                        data-testid={`row-session-${session.sessionId}`}
                      >
                        <TableCell>
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{session.sessionId.slice(0, 8)}…</code>
                        </TableCell>
                        <TableCell className="text-sm">{session.userName || session.userId}</TableCell>
                        <TableCell>
                          {session.appClass && <Badge className={`${appClassColor(session.appClass)} text-[10px]`}>{appClassLabel(session.appClass)}</Badge>}
                        </TableCell>
                        <TableCell>
                          {session.status === "success" ? (
                            <Badge variant="outline" className="text-green-600 border-green-300 text-[10px] gap-1" data-testid={`status-session-${session.sessionId}`}>
                              <CheckCircle2 className="h-3 w-3" /> {session.responseCount}/{session.promptCount}
                            </Badge>
                          ) : session.status === "partial" ? (
                            <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px] gap-1" data-testid={`status-session-${session.sessionId}`}>
                              <AlertTriangle className="h-3 w-3" /> {session.responseCount}/{session.promptCount}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-red-600 border-red-300 text-[10px] gap-1" data-testid={`status-session-${session.sessionId}`}>
                              <XCircle className="h-3 w-3" /> 0/{session.promptCount}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{session.turns} turn{session.turns !== 1 ? "s" : ""}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDateTime(session.latestTime)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                          {truncateContent(cleanPromptPreview(session.firstPrompt), 80)}
                        </TableCell>
                        <TableCell>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalSessions)} of {totalSessions} sessions
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  data-testid="button-copilot-prev"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  data-testid="button-copilot-next"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface McpServerData {
  id: string;
  name: string;
  description: string | null;
  transportType: string;
  command: string | null;
  args: string[] | null;
  url: string | null;
  status: string;
  lastHeartbeat: string | null;
  uptime: number | null;
  restartCount: number | null;
  version: string | null;
  capabilities: { tools?: string[]; resources?: string[]; prompts?: string[] } | null;
  metadata: Record<string, any> | null;
  registeredAt: string;
}

interface McpToolCallData {
  id: string;
  serverId: string;
  sessionId: string | null;
  method: string;
  toolName: string | null;
  params: Record<string, any> | null;
  result: Record<string, any> | null;
  errorCode: number | null;
  errorMessage: string | null;
  durationMs: number | null;
  status: string;
  calledAt: string;
}

interface McpStats {
  totalServers: number;
  runningCount: number;
  totalToolCalls: number;
  errorRate: number;
  avgLatency: number;
  toolBreakdown: Record<string, number>;
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function McpServersTab({ tenantId }: { tenantId: string | null }) {
  const queryClient = useQueryClient();
  const [expandedServer, setExpandedServer] = useState<string | null>(null);
  const [toolCallFilter, setToolCallFilter] = useState<string>("all");
  const [showRegisterDialog, setShowRegisterDialog] = useState(false);
  const [editingServer, setEditingServer] = useState<McpServerData | null>(null);
  const [probingServerId, setProbingServerId] = useState<string | null>(null);

  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formTransport, setFormTransport] = useState("streamable-http");
  const [formUrl, setFormUrl] = useState("");
  const [formAuthType, setFormAuthType] = useState("none");
  const [formApiKey, setFormApiKey] = useState("");
  const [formCommand, setFormCommand] = useState("");
  const [formArgs, setFormArgs] = useState("");

  const [testResult, setTestResult] = useState<{ success: boolean; tools: any[]; error?: string; latencyMs: number } | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);

  const resetForm = () => {
    setFormName(""); setFormDescription(""); setFormTransport("streamable-http");
    setFormUrl(""); setFormAuthType("none"); setFormApiKey("");
    setFormCommand(""); setFormArgs(""); setTestResult(null);
    setEditingServer(null);
  };

  const openEditDialog = (server: McpServerData) => {
    setEditingServer(server);
    setFormName(server.name);
    setFormDescription(server.description || "");
    setFormTransport(server.transportType);
    setFormUrl(server.url || "");
    setFormAuthType((server as any).authType || "none");
    setFormApiKey("");
    setFormCommand(server.command || "");
    setFormArgs(server.args ? server.args.join(" ") : "");
    setTestResult(null);
    setShowRegisterDialog(true);
  };

  const { data: stats } = useQuery<McpStats>({
    queryKey: ["/api/mcp-servers/stats", tenantId],
    queryFn: async () => {
      if (!tenantId) return { totalServers: 0, runningCount: 0, totalToolCalls: 0, errorRate: 0, avgLatency: 0, toolBreakdown: {} };
      const res = await fetch(`/api/tenants/${tenantId}/mcp-servers/stats`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!tenantId,
    refetchInterval: 30000,
  });

  const { data: servers = [] } = useQuery<McpServerData[]>({
    queryKey: ["/api/mcp-servers", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const res = await fetch(`/api/tenants/${tenantId}/mcp-servers`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!tenantId,
    refetchInterval: 15000,
  });

  const { data: toolCalls = [] } = useQuery<McpToolCallData[]>({
    queryKey: ["/api/mcp-servers/tool-calls", tenantId, expandedServer, toolCallFilter],
    queryFn: async () => {
      if (!tenantId || !expandedServer) return [];
      const params = new URLSearchParams();
      if (toolCallFilter !== "all") params.set("status", toolCallFilter);
      params.set("limit", "30");
      const res = await fetch(`/api/tenants/${tenantId}/mcp-servers/${expandedServer}/tool-calls?${params}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!tenantId && !!expandedServer,
    refetchInterval: 15000,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/mcp-servers"] });
    queryClient.invalidateQueries({ queryKey: ["/api/mcp-servers/stats"] });
    queryClient.invalidateQueries({ queryKey: ["/api/mcp-servers/tool-calls"] });
  };

  const seedMcpMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) return;
      const res = await fetch(`/api/tenants/${tenantId}/mcp-servers/seed-demo`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: invalidateAll,
  });

  const registerMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) return;
      const body: any = {
        name: formName,
        description: formDescription || null,
        transportType: formTransport,
        url: formTransport !== "stdio" ? formUrl : null,
        command: formTransport === "stdio" ? formCommand : null,
        args: formTransport === "stdio" && formArgs ? formArgs.split(/\s+/) : null,
        authType: formAuthType,
        apiKey: formAuthType === "api-key" ? formApiKey : null,
        status: "unknown",
      };
      if (testResult?.success) {
        body.status = "running";
        body.lastHeartbeat = new Date().toISOString();
        body.capabilities = {
          tools: testResult.tools.map((t: any) => t.name),
          resources: [],
          prompts: [],
        };
      }
      const res = await fetch(`/api/tenants/${tenantId}/mcp-servers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      invalidateAll();
      setShowRegisterDialog(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId || !editingServer) return;
      const body: any = {
        name: formName,
        description: formDescription || null,
        transportType: formTransport,
        url: formTransport !== "stdio" ? formUrl : null,
        command: formTransport === "stdio" ? formCommand : null,
        args: formTransport === "stdio" && formArgs ? formArgs.split(/\s+/) : null,
        authType: formAuthType,
      };
      if (formApiKey) body.apiKey = formApiKey;
      if (testResult?.success) {
        body.status = "running";
        body.lastHeartbeat = new Date().toISOString();
        body.capabilities = {
          tools: testResult.tools.map((t: any) => t.name),
          resources: [],
          prompts: [],
        };
      }
      const res = await fetch(`/api/tenants/${tenantId}/mcp-servers/${editingServer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      invalidateAll();
      setShowRegisterDialog(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (serverId: string) => {
      if (!tenantId) return;
      const res = await fetch(`/api/tenants/${tenantId}/mcp-servers/${serverId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => {
      invalidateAll();
      setExpandedServer(null);
    },
  });

  const handleTestConnection = async () => {
    const url = formTransport !== "stdio" ? formUrl : null;
    if (!url) return;
    setTestingConnection(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/mcp-servers/test-connection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, apiKey: formAuthType === "api-key" ? formApiKey : null }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({ success: false, tools: [], error: err.message, latencyMs: 0 });
    }
    setTestingConnection(false);
  };

  const handleProbe = async (serverId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setProbingServerId(serverId);
    try {
      await fetch(`/api/tenants/${tenantId}/mcp-servers/${serverId}/probe`, { method: "POST" });
      invalidateAll();
    } finally {
      setProbingServerId(null);
    }
  };

  const [expandedCallId, setExpandedCallId] = useState<string | null>(null);

  if (!tenantId) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Cpu className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Select a Tenant</h3>
          <p className="text-sm text-muted-foreground">Choose a tenant to view MCP server observability.</p>
        </CardContent>
      </Card>
    );
  }

  const transportBadge = (type: string) => {
    const colors: Record<string, string> = {
      stdio: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      sse: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
      "streamable-http": "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    };
    return <Badge className={`text-xs ${colors[type] || ""}`} data-testid={`badge-transport-${type}`}>{type}</Badge>;
  };

  const statusIndicator = (status: string) => {
    if (status === "running") return <span className="flex h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" data-testid="status-running" />;
    if (status === "error") return <span className="flex h-2.5 w-2.5 rounded-full bg-red-500" data-testid="status-error" />;
    if (status === "stopped") return <span className="flex h-2.5 w-2.5 rounded-full bg-gray-400" data-testid="status-stopped" />;
    return <span className="flex h-2.5 w-2.5 rounded-full bg-yellow-400" data-testid="status-unknown" />;
  };

  const registerDialog = (
    <Dialog open={showRegisterDialog} onOpenChange={(open) => { if (!open) { setShowRegisterDialog(false); resetForm(); } else setShowRegisterDialog(true); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingServer ? "Edit MCP Server" : "Register MCP Server"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="mcp-name">Server Name</Label>
            <Input id="mcp-name" placeholder="e.g. Vega Strategic Planning" value={formName} onChange={e => setFormName(e.target.value)} data-testid="input-mcp-name" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mcp-desc">Description</Label>
            <Textarea id="mcp-desc" placeholder="What does this server do?" value={formDescription} onChange={e => setFormDescription(e.target.value)} rows={2} data-testid="input-mcp-description" />
          </div>

          <div className="space-y-1.5">
            <Label>Transport Type</Label>
            <Select value={formTransport} onValueChange={setFormTransport}>
              <SelectTrigger data-testid="select-mcp-transport">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="streamable-http">Streamable HTTP</SelectItem>
                <SelectItem value="sse">SSE (Server-Sent Events)</SelectItem>
                <SelectItem value="stdio">Standard I/O</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formTransport !== "stdio" ? (
            <div className="space-y-1.5">
              <Label htmlFor="mcp-url">Server URL</Label>
              <Input id="mcp-url" placeholder="https://example.com/mcp" value={formUrl} onChange={e => setFormUrl(e.target.value)} data-testid="input-mcp-url" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="mcp-command">Command</Label>
                <Input id="mcp-command" placeholder="node" value={formCommand} onChange={e => setFormCommand(e.target.value)} data-testid="input-mcp-command" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mcp-args">Arguments</Label>
                <Input id="mcp-args" placeholder="dist/server.js --port 3000" value={formArgs} onChange={e => setFormArgs(e.target.value)} data-testid="input-mcp-args" />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Authentication</Label>
            <Select value={formAuthType} onValueChange={setFormAuthType}>
              <SelectTrigger data-testid="select-mcp-auth">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Authentication</SelectItem>
                <SelectItem value="api-key">API Key (Bearer Token)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formAuthType === "api-key" && (
            <div className="space-y-1.5">
              <Label htmlFor="mcp-apikey">API Key</Label>
              <Input id="mcp-apikey" type="password" placeholder={editingServer ? "Leave empty to keep existing" : "Enter API key"} value={formApiKey} onChange={e => setFormApiKey(e.target.value)} data-testid="input-mcp-apikey" />
            </div>
          )}

          {formTransport !== "stdio" && formUrl && (
            <div className="pt-2 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestConnection}
                disabled={testingConnection}
                data-testid="button-test-connection"
              >
                {testingConnection ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Search className="h-3.5 w-3.5 mr-1.5" />}
                Test Connection & Discover Tools
              </Button>

              {testResult && (
                <div className={`mt-3 rounded-md p-3 text-xs ${testResult.success ? "bg-green-50 dark:bg-green-950 border border-green-200" : "bg-red-50 dark:bg-red-950 border border-red-200"}`}>
                  {testResult.success ? (
                    <>
                      <div className="flex items-center gap-1.5 font-semibold text-green-800 dark:text-green-200 mb-2">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Connection Successful ({testResult.latencyMs}ms)
                      </div>
                      <div className="text-green-700 dark:text-green-300">
                        Discovered {testResult.tools.length} tools:
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {testResult.tools.map((t: any) => (
                          <Badge key={t.name} variant="secondary" className="text-[10px]">
                            <Zap className="h-2.5 w-2.5 mr-0.5" />{t.name}
                          </Badge>
                        ))}
                      </div>
                      {testResult.tools.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {testResult.tools.map((t: any) => (
                            <div key={t.name} className="text-[10px] text-muted-foreground">
                              <span className="font-mono font-medium">{t.name}</span>
                              {t.description && <span> — {t.description}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center gap-1.5 font-semibold text-red-800 dark:text-red-200">
                      <XCircle className="h-3.5 w-3.5" /> Connection Failed: {testResult.error}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => { setShowRegisterDialog(false); resetForm(); }} data-testid="button-cancel-mcp">
            Cancel
          </Button>
          <Button
            onClick={() => editingServer ? updateMutation.mutate() : registerMutation.mutate()}
            disabled={!formName || (formTransport !== "stdio" && !formUrl) || registerMutation.isPending || updateMutation.isPending}
            data-testid="button-save-mcp"
          >
            {(registerMutation.isPending || updateMutation.isPending) && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            {editingServer ? "Save Changes" : "Register Server"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="space-y-6 mt-4">
      {registerDialog}

      <div className="flex items-center justify-between">
        <div />
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => seedMcpMutation.mutate()}
            disabled={seedMcpMutation.isPending}
            data-testid="button-seed-mcp"
          >
            {seedMcpMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Database className="h-3.5 w-3.5 mr-1.5" />}
            Seed Demo
          </Button>
          <Button
            size="sm"
            onClick={() => { resetForm(); setShowRegisterDialog(true); }}
            data-testid="button-register-mcp"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Register Server
          </Button>
        </div>
      </div>

      {servers.length === 0 && !stats?.totalServers ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Cpu className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2" data-testid="text-mcp-empty">No MCP Servers Registered</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md">
              Register an MCP server to start monitoring its tools, health, and performance.
            </p>
            <Button onClick={() => { resetForm(); setShowRegisterDialog(true); }} data-testid="button-register-mcp-empty">
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Register Your First Server
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card data-testid="card-mcp-total-servers">
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Total Servers</div>
                <div className="text-2xl font-bold" data-testid="text-mcp-total-servers">{stats?.totalServers || 0}</div>
              </CardContent>
            </Card>
            <Card data-testid="card-mcp-running">
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Running</div>
                <div className="text-2xl font-bold text-green-600" data-testid="text-mcp-running">{stats?.runningCount || 0}</div>
              </CardContent>
            </Card>
            <Card data-testid="card-mcp-tool-calls">
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Total Tool Calls</div>
                <div className="text-2xl font-bold" data-testid="text-mcp-tool-calls">{stats?.totalToolCalls || 0}</div>
              </CardContent>
            </Card>
            <Card data-testid="card-mcp-error-rate">
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Error Rate</div>
                <div className="text-2xl font-bold" data-testid="text-mcp-error-rate">
                  {stats?.errorRate !== undefined ? `${stats.errorRate.toFixed(1)}%` : "0%"}
                </div>
              </CardContent>
            </Card>
            <Card data-testid="card-mcp-avg-latency">
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Avg Latency</div>
                <div className="text-2xl font-bold" data-testid="text-mcp-avg-latency">
                  {stats?.avgLatency ? `${Math.round(stats.avgLatency)}ms` : "—"}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {servers.map((server) => {
              const isExpanded = expandedServer === server.id;
              const tools = server.capabilities?.tools || [];
              const resources = server.capabilities?.resources || [];
              const prompts = server.capabilities?.prompts || [];

              return (
                <Card
                  key={server.id}
                  className={`cursor-pointer transition-all ${isExpanded ? "ring-2 ring-primary col-span-1 md:col-span-2" : "hover:shadow-md"}`}
                  onClick={() => {
                    setExpandedServer(isExpanded ? null : server.id);
                    setExpandedCallId(null);
                    setToolCallFilter("all");
                  }}
                  data-testid={`card-mcp-server-${server.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {statusIndicator(server.status)}
                        <h4 className="font-semibold text-sm" data-testid={`text-mcp-name-${server.id}`}>{server.name}</h4>
                        {transportBadge(server.transportType)}
                      </div>
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        {server.version && <Badge variant="outline" className="text-xs mr-1">v{server.version}</Badge>}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={(e) => handleProbe(server.id, e)}
                          disabled={probingServerId === server.id}
                          data-testid={`button-probe-${server.id}`}
                          title="Probe server"
                        >
                          {probingServerId === server.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={(e) => { e.stopPropagation(); openEditDialog(server); }}
                          data-testid={`button-edit-${server.id}`}
                          title="Edit server"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${server.name}"?`)) deleteMutation.mutate(server.id); }}
                          data-testid={`button-delete-${server.id}`}
                          title="Delete server"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                        {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground ml-1" /> : <ChevronRight className="h-4 w-4 text-muted-foreground ml-1" />}
                      </div>
                    </div>

                    {server.description && (
                      <p className="text-xs text-muted-foreground mb-3">{server.description}</p>
                    )}

                    {server.url && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3 font-mono">
                        <Link className="h-3 w-3" />{server.url}
                      </div>
                    )}

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div>
                        <span className="text-muted-foreground">Status</span>
                        <div className="font-medium capitalize">{server.status}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Last Heartbeat</span>
                        <div className="font-medium">{formatRelativeTime(server.lastHeartbeat)}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Uptime</span>
                        <div className="font-medium">{server.uptime ? formatUptime(server.uptime) : "—"}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Restarts</span>
                        <div className="font-medium">{server.restartCount || 0}</div>
                      </div>
                    </div>

                    {(tools.length > 0 || resources.length > 0 || prompts.length > 0) && (
                      <div className="mt-3 pt-3 border-t">
                        <div className="text-xs text-muted-foreground mb-1.5">Capabilities ({tools.length} tools)</div>
                        <div className="flex flex-wrap gap-1">
                          {tools.map((t: string) => (
                            <Badge key={t} variant="secondary" className="text-[10px] px-1.5 py-0">
                              <Zap className="h-2.5 w-2.5 mr-0.5" />{t}
                            </Badge>
                          ))}
                          {resources.map((r: string) => (
                            <Badge key={r} variant="outline" className="text-[10px] px-1.5 py-0">
                              <Globe className="h-2.5 w-2.5 mr-0.5" />{r}
                            </Badge>
                          ))}
                          {prompts.map((p: string) => (
                            <Badge key={p} variant="outline" className="text-[10px] px-1.5 py-0 border-amber-300">
                              <MessageSquare className="h-2.5 w-2.5 mr-0.5" />{p}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-3">
                          <h5 className="text-sm font-semibold">Recent Tool Calls</h5>
                          <Select value={toolCallFilter} onValueChange={setToolCallFilter}>
                            <SelectTrigger className="w-28 h-7 text-xs" data-testid="filter-mcp-tool-status">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All</SelectItem>
                              <SelectItem value="success">Success</SelectItem>
                              <SelectItem value="error">Error</SelectItem>
                              <SelectItem value="timeout">Timeout</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {toolCalls.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-4">No tool calls recorded yet.</p>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">Time</TableHead>
                                <TableHead className="text-xs">Method</TableHead>
                                <TableHead className="text-xs">Tool</TableHead>
                                <TableHead className="text-xs">Session</TableHead>
                                <TableHead className="text-xs">Duration</TableHead>
                                <TableHead className="text-xs">Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {toolCalls.map((call) => (
                                <Fragment key={call.id}>
                                  <TableRow
                                    className="cursor-pointer hover:bg-muted/50"
                                    onClick={() => setExpandedCallId(expandedCallId === call.id ? null : call.id)}
                                    data-testid={`row-tool-call-${call.id}`}
                                  >
                                    <TableCell className="text-xs">
                                      {formatDateTime(call.calledAt)}
                                    </TableCell>
                                    <TableCell className="text-xs font-mono">{call.method}</TableCell>
                                    <TableCell className="text-xs font-medium">{call.toolName || "—"}</TableCell>
                                    <TableCell className="text-xs font-mono text-muted-foreground">
                                      {call.sessionId ? call.sessionId.substring(0, 12) : "—"}
                                    </TableCell>
                                    <TableCell className="text-xs">
                                      {call.durationMs ? `${Math.round(call.durationMs)}ms` : "—"}
                                    </TableCell>
                                    <TableCell>
                                      {call.status === "success" ? (
                                        <Badge className="text-[10px] bg-green-100 text-green-800">Success</Badge>
                                      ) : call.status === "error" ? (
                                        <Badge className="text-[10px] bg-red-100 text-red-800">Error</Badge>
                                      ) : (
                                        <Badge className="text-[10px] bg-yellow-100 text-yellow-800">Timeout</Badge>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                  {expandedCallId === call.id && (
                                    <TableRow>
                                      <TableCell colSpan={6} className="bg-muted/20 p-3">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                          <div>
                                            <div className="text-xs font-semibold mb-1">Request Params</div>
                                            <pre className="text-[10px] bg-background rounded p-2 overflow-auto max-h-40 border">
                                              {JSON.stringify(call.params, null, 2) || "null"}
                                            </pre>
                                          </div>
                                          <div>
                                            <div className="text-xs font-semibold mb-1">
                                              {call.status === "error" ? "Error" : "Response"}
                                            </div>
                                            {call.status === "error" ? (
                                              <div className="text-[10px] bg-red-50 dark:bg-red-950 rounded p-2 border border-red-200">
                                                <div className="font-mono">Code: {call.errorCode}</div>
                                                <div>{call.errorMessage}</div>
                                              </div>
                                            ) : (
                                              <pre className="text-[10px] bg-background rounded p-2 overflow-auto max-h-40 border">
                                                {JSON.stringify(call.result, null, 2) || "null"}
                                              </pre>
                                            )}
                                          </div>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  )}
                                </Fragment>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {stats && Object.keys(stats.toolBreakdown).length > 0 && (
            <Card data-testid="card-mcp-tool-breakdown">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Tool Usage Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                  {Object.entries(stats.toolBreakdown)
                    .sort(([, a], [, b]) => b - a)
                    .map(([tool, count]) => (
                      <div key={tool} className="flex items-center justify-between bg-muted/50 rounded px-2.5 py-1.5">
                        <span className="text-xs font-medium truncate">{tool}</span>
                        <Badge variant="secondary" className="text-[10px] ml-1.5">{count}</Badge>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export default function AgentObservability() {
  const queryClient = useQueryClient();
  const { activeTenantId } = useActiveTenant();
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

  const collectCopilotMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/scheduler/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job: "copilotInteractions" }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/copilot-interactions"] });
        queryClient.invalidateQueries({ queryKey: ["/api/copilot-interactions/stats"] });
      }, 3000);
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
              queryClient.invalidateQueries({ queryKey: ["/api/copilot-interactions"] });
              queryClient.invalidateQueries({ queryKey: ["/api/copilot-interactions/stats"] });
            }}
            data-testid="button-refresh"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => collectCopilotMutation.mutate()}
            disabled={collectCopilotMutation.isPending}
            data-testid="button-collect-copilot"
          >
            {collectCopilotMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            )}
            {collectCopilotMutation.isPending ? "Collecting…" : collectCopilotMutation.isSuccess ? "Queued!" : "Collect from Tenant"}
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

      <Tabs defaultValue="traces" className="w-full">
        <TabsList data-testid="tabs-agent-observability">
          <TabsTrigger value="traces" data-testid="tab-agent-traces">
            <Bot className="h-3.5 w-3.5 mr-1.5" />
            Agent Traces
          </TabsTrigger>
          <TabsTrigger value="copilot" data-testid="tab-copilot-interactions">
            <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
            Copilot Interactions
          </TabsTrigger>
          <TabsTrigger value="mcp" data-testid="tab-mcp-servers">
            <Cpu className="h-3.5 w-3.5 mr-1.5" />
            MCP Servers
          </TabsTrigger>
        </TabsList>

        <TabsContent value="copilot">
          <CopilotInteractionsTab tenantId={activeTenantId} />
        </TabsContent>

        <TabsContent value="mcp">
          <McpServersTab tenantId={activeTenantId} />
        </TabsContent>

        <TabsContent value="traces" className="space-y-6">
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
                        <Fragment key={trace.id}>
                          <TableRow
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
                            <TableCell className="text-sm text-muted-foreground">{formatDateTime(trace.startedAt)}</TableCell>
                            <TableCell className="text-xs text-red-400 max-w-[200px] truncate">{trace.errorSummary || ""}</TableCell>
                          </TableRow>
                          {expandedTraceId === trace.id && (
                            <TableRow key={`${trace.id}-detail`}>
                              <TableCell colSpan={7} className="bg-muted/20 p-4">
                                <TraceDetailRow traceId={trace.id} />
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
        </TabsContent>
      </Tabs>
    </div>
    </Shell>
  );
}
