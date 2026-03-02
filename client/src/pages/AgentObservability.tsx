import { useState, useMemo } from "react";
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

type AgentPlatform = "copilot" | "openai" | "agentforce";
type TraceStatus = "success" | "failed" | "partial" | "running";
type SpanStatus = "success" | "failed" | "skipped" | "running";
type SpanType = "auth" | "content" | "mcp" | "license" | "api" | "inference";

interface AgentCard {
  id: string;
  name: string;
  platform: AgentPlatform;
  status: "healthy" | "degraded" | "failed";
  lastInvocation: string;
  successRate24h: number;
  avgLatencyMs: number;
  invocations24h: number;
  issue?: string;
}

interface Span {
  id: string;
  name: string;
  type: SpanType;
  endpoint: string;
  method: string;
  startMs: number;
  durationMs: number;
  status: SpanStatus;
  statusCode?: number;
  errorMessage?: string;
}

interface Trace {
  id: string;
  agentName: string;
  platform: AgentPlatform;
  status: TraceStatus;
  durationMs: number;
  timestamp: string;
  userId?: string;
  errorSummary?: string;
  spans: Span[];
  diagnosis?: {
    rootCause: string;
    impact: string;
    pattern: string;
  };
  actions?: ActionItem[];
}

interface ActionItem {
  label: string;
  icon: "retry" | "escalate" | "disable" | "logs" | "capacity" | "vendor";
  variant: "default" | "destructive" | "outline";
  description?: string;
}

interface ActionHistoryEntry {
  action: string;
  user: string;
  time: string;
  result: "success" | "failed";
}

const AGENTS: AgentCard[] = [
  {
    id: "a1",
    name: "SharePoint Content Copilot",
    platform: "copilot",
    status: "healthy",
    lastInvocation: "2 min ago",
    successRate24h: 94.2,
    avgLatencyMs: 3480,
    invocations24h: 142,
  },
  {
    id: "a2",
    name: "HR Policy Assistant",
    platform: "copilot",
    status: "degraded",
    lastInvocation: "45 sec ago",
    successRate24h: 68.5,
    avgLatencyMs: 8920,
    invocations24h: 87,
    issue: "MCP tool latency high (avg 6.2s)",
  },
  {
    id: "a3",
    name: "Customer Research GPT",
    platform: "openai",
    status: "healthy",
    lastInvocation: "5 min ago",
    successRate24h: 91.0,
    avgLatencyMs: 5210,
    invocations24h: 63,
  },
  {
    id: "a4",
    name: "Case Routing Agent",
    platform: "agentforce",
    status: "failed",
    lastInvocation: "12 min ago",
    successRate24h: 0,
    avgLatencyMs: 0,
    invocations24h: 28,
    issue: "Salesforce OAuth token refresh failed",
  },
];

const CHART_DATA = [
  { day: "Feb 24", success: 32, failed: 4, partial: 2 },
  { day: "Feb 25", success: 41, failed: 6, partial: 1 },
  { day: "Feb 26", success: 38, failed: 3, partial: 3 },
  { day: "Feb 27", success: 45, failed: 8, partial: 2 },
  { day: "Feb 28", success: 36, failed: 5, partial: 4 },
  { day: "Mar 1", success: 43, failed: 9, partial: 1 },
  { day: "Mar 2", success: 28, failed: 7, partial: 3 },
];

const TRACES: Trace[] = [
  {
    id: "t1",
    agentName: "SharePoint Content Copilot",
    platform: "copilot",
    status: "success",
    durationMs: 3480,
    timestamp: "2026-03-02T16:48:00Z",
    userId: "sarah.chen@contoso.com",
    spans: [
      { id: "s1", name: "Entra ID Authentication", type: "auth", endpoint: "login.microsoftonline.com/oauth2/v2.0/token", method: "POST", startMs: 0, durationMs: 340, status: "success", statusCode: 200 },
      { id: "s2", name: "M365 Content Retrieval", type: "content", endpoint: "graph.microsoft.com/v1.0/sites/contoso.sharepoint.com/drives", method: "GET", startMs: 340, durationMs: 1820, status: "success", statusCode: 200 },
      { id: "s3", name: "MCP Tool: document-search", type: "mcp", endpoint: "mcp.contoso.com/tools/document-search", method: "POST", startMs: 2160, durationMs: 980, status: "success", statusCode: 200 },
      { id: "s4", name: "License & Capacity Check", type: "license", endpoint: "admin.microsoft.com/api/capacity", method: "GET", startMs: 3140, durationMs: 340, status: "success", statusCode: 200 },
    ],
  },
  {
    id: "t2",
    agentName: "SharePoint Content Copilot",
    platform: "copilot",
    status: "failed",
    durationMs: 620,
    timestamp: "2026-03-02T16:32:00Z",
    userId: "james.park@contoso.com",
    errorSummary: "Entra ID: MFA claim expired",
    spans: [
      { id: "s5", name: "Entra ID Authentication", type: "auth", endpoint: "login.microsoftonline.com/oauth2/v2.0/token", method: "POST", startMs: 0, durationMs: 620, status: "failed", statusCode: 401, errorMessage: "AADSTS50076: Due to a configuration change by your administrator, you must use multi-factor authentication to access this resource." },
      { id: "s6", name: "M365 Content Retrieval", type: "content", endpoint: "graph.microsoft.com/v1.0/sites", method: "GET", startMs: 620, durationMs: 0, status: "skipped" },
      { id: "s7", name: "MCP Tool: document-search", type: "mcp", endpoint: "mcp.contoso.com/tools/document-search", method: "POST", startMs: 620, durationMs: 0, status: "skipped" },
      { id: "s8", name: "License & Capacity Check", type: "license", endpoint: "admin.microsoft.com/api/capacity", method: "GET", startMs: 620, durationMs: 0, status: "skipped" },
    ],
    diagnosis: {
      rootCause: "Entra ID returned AADSTS50076 indicating the user's MFA claim has expired. The user james.park@contoso.com needs to re-authenticate with multi-factor verification. This is a Conditional Access policy enforcement — not a system error.",
      impact: "1 user affected. Agent invocations for this user will continue to fail until MFA is completed.",
      pattern: "This is an isolated incident for this user. No broader authentication issues detected across the tenant.",
    },
    actions: [
      { label: "View Entra Sign-in Logs", icon: "logs", variant: "outline" },
      { label: "Notify User", icon: "escalate", variant: "default" },
    ],
  },
  {
    id: "t3",
    agentName: "HR Policy Assistant",
    platform: "copilot",
    status: "failed",
    durationMs: 32400,
    timestamp: "2026-03-02T16:25:00Z",
    userId: "maria.gonzalez@contoso.com",
    errorSummary: "MCP tool timed out after 30s",
    spans: [
      { id: "s9", name: "Entra ID Authentication", type: "auth", endpoint: "login.microsoftonline.com/oauth2/v2.0/token", method: "POST", startMs: 0, durationMs: 280, status: "success", statusCode: 200 },
      { id: "s10", name: "M365 Content Retrieval", type: "content", endpoint: "graph.microsoft.com/v1.0/sites/contoso.sharepoint.com/lists/HR-Policies", method: "GET", startMs: 280, durationMs: 2120, status: "success", statusCode: 200 },
      { id: "s11", name: "MCP Tool: policy-analyzer", type: "mcp", endpoint: "mcp.contoso.com/tools/policy-analyzer", method: "POST", startMs: 2400, durationMs: 30000, status: "failed", statusCode: 504, errorMessage: "Connection timed out after 30000ms. The MCP server did not respond within the configured timeout." },
      { id: "s12", name: "License & Capacity Check", type: "license", endpoint: "admin.microsoft.com/api/capacity", method: "GET", startMs: 32400, durationMs: 0, status: "skipped" },
    ],
    diagnosis: {
      rootCause: "The MCP tool 'policy-analyzer' at mcp.contoso.com failed to respond within 30 seconds. This is the 3rd timeout in the last hour. The MCP server may be under heavy load or experiencing connectivity issues. The policy-analyzer tool processes large document sets which can exceed the timeout threshold.",
      impact: "4 users affected in the last hour. All HR Policy Assistant invocations involving document analysis are failing.",
      pattern: "This failure has occurred 12 times in the last 24 hours, trending upward. First observed at 8:15 AM today. Correlates with a 3x increase in HR document uploads yesterday.",
    },
    actions: [
      { label: "Retry Trace", icon: "retry", variant: "default" },
      { label: "View MCP Server Logs", icon: "logs", variant: "outline" },
      { label: "Escalate to Admin", icon: "escalate", variant: "default" },
      { label: "Disable Agent", icon: "disable", variant: "destructive" },
    ],
  },
  {
    id: "t4",
    agentName: "SharePoint Content Copilot",
    platform: "copilot",
    status: "failed",
    durationMs: 4820,
    timestamp: "2026-03-02T15:58:00Z",
    userId: "alex.kumar@contoso.com",
    errorSummary: "License capacity exhausted",
    spans: [
      { id: "s13", name: "Entra ID Authentication", type: "auth", endpoint: "login.microsoftonline.com/oauth2/v2.0/token", method: "POST", startMs: 0, durationMs: 310, status: "success", statusCode: 200 },
      { id: "s14", name: "M365 Content Retrieval", type: "content", endpoint: "graph.microsoft.com/v1.0/sites/contoso.sharepoint.com/drives", method: "GET", startMs: 310, durationMs: 2240, status: "success", statusCode: 200 },
      { id: "s15", name: "MCP Tool: document-search", type: "mcp", endpoint: "mcp.contoso.com/tools/document-search", method: "POST", startMs: 2550, durationMs: 1890, status: "success", statusCode: 200 },
      { id: "s16", name: "License & Capacity Check", type: "license", endpoint: "admin.microsoft.com/api/capacity", method: "GET", startMs: 4440, durationMs: 380, status: "failed", statusCode: 403, errorMessage: "Capacity limit reached: 0 AI Builder credits remaining out of 500 allocated. Billing cycle resets March 15, 2026." },
    ],
    diagnosis: {
      rootCause: "The tenant has consumed all 500 allocated AI Builder credits for this billing cycle. Credits reset on March 15, 2026. Current usage: 500/500 credits. The agent completed all processing steps successfully but was blocked at the final capacity gate.",
      impact: "All AI Builder-dependent agents are affected. 23 users have been impacted since credits were exhausted at 2:40 PM today.",
      pattern: "Credit consumption has increased 40% month-over-month. At current run rate, credits will be exhausted by day 18 of each 30-day cycle.",
    },
    actions: [
      { label: "Increase Capacity", icon: "capacity", variant: "default" },
      { label: "Escalate to Admin", icon: "escalate", variant: "default" },
      { label: "View Usage Report", icon: "logs", variant: "outline" },
    ],
  },
  {
    id: "t5",
    agentName: "HR Policy Assistant",
    platform: "copilot",
    status: "partial",
    durationMs: 6750,
    timestamp: "2026-03-02T15:42:00Z",
    userId: "li.wei@contoso.com",
    errorSummary: "MCP returned incomplete results",
    spans: [
      { id: "s17", name: "Entra ID Authentication", type: "auth", endpoint: "login.microsoftonline.com/oauth2/v2.0/token", method: "POST", startMs: 0, durationMs: 290, status: "success", statusCode: 200 },
      { id: "s18", name: "M365 Content Retrieval", type: "content", endpoint: "graph.microsoft.com/v1.0/sites/contoso.sharepoint.com/lists/HR-Policies", method: "GET", startMs: 290, durationMs: 1980, status: "success", statusCode: 200 },
      { id: "s19", name: "MCP Tool: policy-analyzer", type: "mcp", endpoint: "mcp.contoso.com/tools/policy-analyzer", method: "POST", startMs: 2270, durationMs: 4100, status: "failed", statusCode: 206, errorMessage: "Partial content: Tool returned 3 of 8 requested policy sections. Context window limit reached (28,000/32,000 tokens used)." },
      { id: "s20", name: "License & Capacity Check", type: "license", endpoint: "admin.microsoft.com/api/capacity", method: "GET", startMs: 6370, durationMs: 380, status: "success", statusCode: 200 },
    ],
    diagnosis: {
      rootCause: "The MCP policy-analyzer tool hit its context window limit (32k tokens) while processing 8 HR policy documents. It returned results for 3 of 8 sections. The agent delivered a partial response to the user. Consider chunking large document sets or upgrading to a model with a larger context window.",
      impact: "User received incomplete policy guidance. The missing sections covered Benefits and Compensation policies.",
      pattern: "Partial results occur on ~15% of HR Policy Assistant invocations, primarily when users query across multiple policy categories simultaneously.",
    },
    actions: [
      { label: "Retry with Chunking", icon: "retry", variant: "default" },
      { label: "View MCP Server Logs", icon: "logs", variant: "outline" },
    ],
  },
  {
    id: "t6",
    agentName: "SharePoint Content Copilot",
    platform: "copilot",
    status: "success",
    durationMs: 12340,
    timestamp: "2026-03-02T15:20:00Z",
    userId: "omar.hassan@contoso.com",
    spans: [
      { id: "s21", name: "Entra ID Authentication", type: "auth", endpoint: "login.microsoftonline.com/oauth2/v2.0/token", method: "POST", startMs: 0, durationMs: 350, status: "success", statusCode: 200 },
      { id: "s22", name: "M365 Content Retrieval", type: "content", endpoint: "graph.microsoft.com/v1.0/sites/contoso.sharepoint.com/drives", method: "GET", startMs: 350, durationMs: 9800, status: "success", statusCode: 200 },
      { id: "s23", name: "MCP Tool: document-search", type: "mcp", endpoint: "mcp.contoso.com/tools/document-search", method: "POST", startMs: 10150, durationMs: 1850, status: "success", statusCode: 200 },
      { id: "s24", name: "License & Capacity Check", type: "license", endpoint: "admin.microsoft.com/api/capacity", method: "GET", startMs: 12000, durationMs: 340, status: "success", statusCode: 200 },
    ],
  },
  {
    id: "t7",
    agentName: "SharePoint Content Copilot",
    platform: "copilot",
    status: "running",
    durationMs: 2600,
    timestamp: "2026-03-02T16:50:00Z",
    userId: "nina.patel@contoso.com",
    spans: [
      { id: "s25", name: "Entra ID Authentication", type: "auth", endpoint: "login.microsoftonline.com/oauth2/v2.0/token", method: "POST", startMs: 0, durationMs: 310, status: "success", statusCode: 200 },
      { id: "s26", name: "M365 Content Retrieval", type: "content", endpoint: "graph.microsoft.com/v1.0/sites/contoso.sharepoint.com/drives", method: "GET", startMs: 310, durationMs: 2290, status: "running" },
      { id: "s27", name: "MCP Tool: document-search", type: "mcp", endpoint: "mcp.contoso.com/tools/document-search", method: "POST", startMs: 2600, durationMs: 0, status: "skipped" },
      { id: "s28", name: "License & Capacity Check", type: "license", endpoint: "admin.microsoft.com/api/capacity", method: "GET", startMs: 2600, durationMs: 0, status: "skipped" },
    ],
  },
  {
    id: "t8",
    agentName: "Customer Research GPT",
    platform: "openai",
    status: "success",
    durationMs: 5210,
    timestamp: "2026-03-02T16:45:00Z",
    userId: "david.liu@contoso.com",
    spans: [
      { id: "s29", name: "API Key Authentication", type: "auth", endpoint: "api.openai.com/v1/models", method: "GET", startMs: 0, durationMs: 180, status: "success", statusCode: 200 },
      { id: "s30", name: "RAG: Vector Retrieval", type: "content", endpoint: "pinecone.io/query", method: "POST", startMs: 180, durationMs: 890, status: "success", statusCode: 200 },
      { id: "s31", name: "GPT-4o Inference", type: "inference", endpoint: "api.openai.com/v1/chat/completions", method: "POST", startMs: 1070, durationMs: 3940, status: "success", statusCode: 200 },
      { id: "s32", name: "Response Formatting", type: "api", endpoint: "internal/format-response", method: "POST", startMs: 5010, durationMs: 200, status: "success", statusCode: 200 },
    ],
  },
  {
    id: "t9",
    agentName: "Customer Research GPT",
    platform: "openai",
    status: "failed",
    durationMs: 1240,
    timestamp: "2026-03-02T16:15:00Z",
    userId: "rachel.kim@contoso.com",
    errorSummary: "OpenAI rate limit exceeded (429)",
    spans: [
      { id: "s33", name: "API Key Authentication", type: "auth", endpoint: "api.openai.com/v1/models", method: "GET", startMs: 0, durationMs: 190, status: "success", statusCode: 200 },
      { id: "s34", name: "RAG: Vector Retrieval", type: "content", endpoint: "pinecone.io/query", method: "POST", startMs: 190, durationMs: 810, status: "success", statusCode: 200 },
      { id: "s35", name: "GPT-4o Inference", type: "inference", endpoint: "api.openai.com/v1/chat/completions", method: "POST", startMs: 1000, durationMs: 240, status: "failed", statusCode: 429, errorMessage: "Rate limit exceeded: You have exceeded your tokens per minute (TPM) rate limit of 90,000. Current usage: 89,200 TPM. Please retry after 42 seconds." },
      { id: "s36", name: "Response Formatting", type: "api", endpoint: "internal/format-response", method: "POST", startMs: 1240, durationMs: 0, status: "skipped" },
    ],
    diagnosis: {
      rootCause: "OpenAI API returned HTTP 429. The organization is hitting the TPM (tokens per minute) rate limit on GPT-4o. Current usage: 89,200/90,000 TPM. The rate limit window resets in 42 seconds. This is a transient issue caused by burst traffic — 8 concurrent users submitted queries within a 15-second window.",
      impact: "3 users received rate limit errors in the last 10 minutes. Requests will auto-recover after the rate limit window resets.",
      pattern: "Rate limiting occurs 2-3 times daily during peak hours (10-11 AM, 2-3 PM). Consider implementing request queuing or upgrading the OpenAI tier.",
    },
    actions: [
      { label: "Retry Trace", icon: "retry", variant: "default" },
      { label: "Contact Vendor", icon: "vendor", variant: "outline", description: "OpenAI Status: status.openai.com" },
      { label: "Increase Capacity", icon: "capacity", variant: "default", description: "Upgrade OpenAI API tier" },
    ],
  },
  {
    id: "t10",
    agentName: "Customer Research GPT",
    platform: "openai",
    status: "failed",
    durationMs: 2890,
    timestamp: "2026-03-02T14:55:00Z",
    userId: "tom.wright@contoso.com",
    errorSummary: "Context window exceeded (128k limit)",
    spans: [
      { id: "s37", name: "API Key Authentication", type: "auth", endpoint: "api.openai.com/v1/models", method: "GET", startMs: 0, durationMs: 175, status: "success", statusCode: 200 },
      { id: "s38", name: "RAG: Vector Retrieval", type: "content", endpoint: "pinecone.io/query", method: "POST", startMs: 175, durationMs: 920, status: "success", statusCode: 200 },
      { id: "s39", name: "GPT-4o Inference", type: "inference", endpoint: "api.openai.com/v1/chat/completions", method: "POST", startMs: 1095, durationMs: 1795, status: "failed", statusCode: 400, errorMessage: "This model's maximum context length is 128,000 tokens. However, your messages resulted in 142,380 tokens. Please reduce the length of the messages." },
      { id: "s40", name: "Response Formatting", type: "api", endpoint: "internal/format-response", method: "POST", startMs: 2890, durationMs: 0, status: "skipped" },
    ],
    diagnosis: {
      rootCause: "The RAG retrieval step returned too many document chunks (142,380 tokens) exceeding GPT-4o's 128k context window. The vector search returned 48 document chunks when the typical safe limit is 35. This was caused by a broad query ('all customer research for Q1') that matched an unusually large number of documents.",
      impact: "1 user affected. The query was unusually broad — typical queries stay well within token limits.",
      pattern: "Context window errors are rare (< 2% of invocations). They correlate with queries containing broad temporal ranges like 'all', 'everything', or 'entire year'.",
    },
    actions: [
      { label: "Retry with Reduced Context", icon: "retry", variant: "default" },
      { label: "View RAG Configuration", icon: "logs", variant: "outline" },
    ],
  },
  {
    id: "t11",
    agentName: "Case Routing Agent",
    platform: "agentforce",
    status: "success",
    durationMs: 4120,
    timestamp: "2026-03-02T15:30:00Z",
    userId: "system@contoso.salesforce.com",
    spans: [
      { id: "s41", name: "Salesforce OAuth", type: "auth", endpoint: "login.salesforce.com/services/oauth2/token", method: "POST", startMs: 0, durationMs: 420, status: "success", statusCode: 200 },
      { id: "s42", name: "SOQL: Case Query", type: "content", endpoint: "contoso.my.salesforce.com/services/data/v59.0/query", method: "GET", startMs: 420, durationMs: 1340, status: "success", statusCode: 200 },
      { id: "s43", name: "Einstein AI: Classification", type: "inference", endpoint: "contoso.my.salesforce.com/services/data/v59.0/einstein/prediction", method: "POST", startMs: 1760, durationMs: 1980, status: "success", statusCode: 200 },
      { id: "s44", name: "Case Update: Route to Queue", type: "api", endpoint: "contoso.my.salesforce.com/services/data/v59.0/sobjects/Case", method: "PATCH", startMs: 3740, durationMs: 380, status: "success", statusCode: 200 },
    ],
  },
  {
    id: "t12",
    agentName: "Case Routing Agent",
    platform: "agentforce",
    status: "failed",
    durationMs: 890,
    timestamp: "2026-03-02T16:38:00Z",
    userId: "system@contoso.salesforce.com",
    errorSummary: "Salesforce OAuth token refresh failed",
    spans: [
      { id: "s45", name: "Salesforce OAuth", type: "auth", endpoint: "login.salesforce.com/services/oauth2/token", method: "POST", startMs: 0, durationMs: 890, status: "failed", statusCode: 401, errorMessage: "invalid_grant: expired access/refresh token. The Connected App authorization has been revoked by the Salesforce administrator." },
      { id: "s46", name: "SOQL: Case Query", type: "content", endpoint: "contoso.my.salesforce.com/services/data/v59.0/query", method: "GET", startMs: 890, durationMs: 0, status: "skipped" },
      { id: "s47", name: "Einstein AI: Classification", type: "inference", endpoint: "contoso.my.salesforce.com/services/data/v59.0/einstein/prediction", method: "POST", startMs: 890, durationMs: 0, status: "skipped" },
      { id: "s48", name: "Case Update: Route to Queue", type: "api", endpoint: "contoso.my.salesforce.com/services/data/v59.0/sobjects/Case", method: "PATCH", startMs: 890, durationMs: 0, status: "skipped" },
    ],
    diagnosis: {
      rootCause: "The Salesforce Connected App authorization was revoked by an administrator. The OAuth refresh token is no longer valid, and all API calls will fail until the Connected App is re-authorized. This typically happens after a security review or when Connected App policies are updated.",
      impact: "All Case Routing Agent invocations are blocked. 28 cases have not been routed since the authorization was revoked 12 minutes ago.",
      pattern: "This is the first occurrence. The Connected App was previously stable for 45 days since its last authorization.",
    },
    actions: [
      { label: "View Salesforce Setup", icon: "logs", variant: "outline", description: "Setup > Connected Apps" },
      { label: "Escalate to Admin", icon: "escalate", variant: "default" },
      { label: "Contact Vendor", icon: "vendor", variant: "outline", description: "Salesforce Trust: trust.salesforce.com" },
      { label: "Disable Agent", icon: "disable", variant: "destructive" },
    ],
  },
];

const ACTION_HISTORY: ActionHistoryEntry[] = [
  { action: "Retry attempted on HR Policy Assistant", user: "admin@contoso.com", time: "2:15 PM", result: "failed" },
  { action: "Escalated MCP timeout to Infra team", user: "admin@contoso.com", time: "1:45 PM", result: "success" },
  { action: "Disabled Case Routing Agent temporarily", user: "ops@contoso.com", time: "12:30 PM", result: "success" },
];

function platformBadge(platform: AgentPlatform) {
  switch (platform) {
    case "copilot":
      return <Badge data-testid={`badge-platform-${platform}`} className="bg-blue-600 text-white text-[10px] px-1.5">Copilot</Badge>;
    case "openai":
      return <Badge data-testid={`badge-platform-${platform}`} className="bg-emerald-700 text-white text-[10px] px-1.5">OpenAI GPT</Badge>;
    case "agentforce":
      return <Badge data-testid={`badge-platform-${platform}`} className="bg-indigo-600 text-white text-[10px] px-1.5">Agentforce</Badge>;
  }
}

function statusBadge(status: TraceStatus) {
  switch (status) {
    case "success":
      return <Badge data-testid="badge-status-success" className="bg-green-600 text-white"><CheckCircle2 className="h-3 w-3 mr-1" />Success</Badge>;
    case "failed":
      return <Badge data-testid="badge-status-failed" variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
    case "partial":
      return <Badge data-testid="badge-status-partial" className="bg-amber-500 text-white"><AlertTriangle className="h-3 w-3 mr-1" />Partial</Badge>;
    case "running":
      return <Badge data-testid="badge-status-running" className="bg-blue-500 text-white"><Clock className="h-3 w-3 mr-1" />Running</Badge>;
  }
}

function agentStatusIndicator(status: "healthy" | "degraded" | "failed") {
  switch (status) {
    case "healthy":
      return <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" /><span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" /></span>;
    case "degraded":
      return <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" /><span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" /></span>;
    case "failed":
      return <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" /><span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" /></span>;
  }
}

function spanTypeIcon(type: SpanType) {
  switch (type) {
    case "auth": return <Shield className="h-4 w-4 text-amber-500" />;
    case "content": return <FileText className="h-4 w-4 text-blue-500" />;
    case "mcp": return <Cpu className="h-4 w-4 text-purple-500" />;
    case "license": return <Key className="h-4 w-4 text-orange-500" />;
    case "api": return <Globe className="h-4 w-4 text-cyan-500" />;
    case "inference": return <Bot className="h-4 w-4 text-green-500" />;
  }
}

function spanStatusColor(status: SpanStatus): string {
  switch (status) {
    case "success": return "bg-green-500";
    case "failed": return "bg-red-500";
    case "skipped": return "bg-gray-400";
    case "running": return "bg-blue-500";
  }
}

function formatDuration(ms: number): string {
  if (ms === 0) return "—";
  if (ms < 1000) return `${ms}ms`;
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

function WaterfallView({ trace }: { trace: Trace }) {
  const maxDuration = Math.max(trace.durationMs, 1);

  return (
    <div className="space-y-1.5 py-2" data-testid={`waterfall-${trace.id}`}>
      {trace.spans.map((span) => {
        const leftPct = (span.startMs / maxDuration) * 100;
        const widthPct = Math.max((span.durationMs / maxDuration) * 100, span.status === "skipped" ? 0 : 1.5);

        return (
          <div key={span.id} className="flex items-center gap-3 group" data-testid={`span-${span.id}`}>
            <div className="flex items-center gap-2 w-52 shrink-0">
              {spanTypeIcon(span.type)}
              <span className="text-xs font-medium truncate">{span.name}</span>
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
      {trace.spans.filter(s => s.errorMessage).map((span) => (
        <div key={`err-${span.id}`} className="ml-[220px] mt-1 p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400">
          <span className="font-semibold">{span.name}:</span> {span.errorMessage}
        </div>
      ))}
    </div>
  );
}

function DiagnosisPanel({ trace }: { trace: Trace }) {
  if (!trace.diagnosis) return null;

  return (
    <Card className="border-purple-500/30 bg-purple-500/5" data-testid={`diagnosis-${trace.id}`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-400" />
          AI Diagnosis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <span className="font-semibold text-foreground">Root Cause:</span>
          <p className="text-muted-foreground mt-0.5 leading-relaxed">{trace.diagnosis.rootCause}</p>
        </div>
        <div className="flex gap-6">
          <div>
            <span className="font-semibold text-foreground">Impact:</span>
            <p className="text-muted-foreground mt-0.5">{trace.diagnosis.impact}</p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          {trace.diagnosis.pattern.includes("trending upward") || trace.diagnosis.pattern.includes("increased") ? (
            <TrendingUp className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
          ) : trace.diagnosis.pattern.includes("rare") || trace.diagnosis.pattern.includes("isolated") || trace.diagnosis.pattern.includes("first") ? (
            <Minus className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          ) : (
            <TrendingDown className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
          )}
          <div>
            <span className="font-semibold text-foreground">Pattern:</span>
            <p className="text-muted-foreground mt-0.5">{trace.diagnosis.pattern}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ActionsPanel({ trace }: { trace: Trace }) {
  if (!trace.actions || trace.actions.length === 0) return null;

  return (
    <Card data-testid={`actions-${trace.id}`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-400" />
          Actions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {trace.actions.map((action, i) => (
            <Button
              key={i}
              variant={action.variant as any}
              size="sm"
              className="text-xs gap-1.5"
              data-testid={`action-${action.icon}-${trace.id}`}
            >
              {actionIcon(action.icon)}
              {action.label}
            </Button>
          ))}
        </div>
        {trace.actions.some(a => a.description) && (
          <div className="text-[11px] text-muted-foreground space-y-0.5">
            {trace.actions.filter(a => a.description).map((a, i) => (
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

export default function AgentObservability() {
  const [expandedTraceId, setExpandedTraceId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [agentSearch, setAgentSearch] = useState("");

  const filteredTraces = useMemo(() => {
    return TRACES.filter(t => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (platformFilter !== "all" && t.platform !== platformFilter) return false;
      if (agentSearch && !t.agentName.toLowerCase().includes(agentSearch.toLowerCase())) return false;
      return true;
    });
  }, [statusFilter, platformFilter, agentSearch]);

  const healthyCount = AGENTS.filter(a => a.status === "healthy").length;
  const degradedCount = AGENTS.filter(a => a.status === "degraded").length;
  const failedAgentCount = AGENTS.filter(a => a.status === "failed").length;
  const avgSuccessRate = Math.round(AGENTS.reduce((s, a) => s + a.successRate24h, 0) / AGENTS.length * 10) / 10;

  return (
    <Shell>
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <ScanSearch className="h-6 w-6" />
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Agent Observability</h1>
        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-xs font-medium" data-testid="badge-demo-data">Demo Data</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Card data-testid="card-total-agents">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Agents</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-agents">{AGENTS.length}</div>
            <p className="text-xs text-muted-foreground">Across 3 platforms</p>
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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {AGENTS.map((agent) => (
            <Card
              key={agent.id}
              className={`cursor-pointer transition-all hover:shadow-md ${
                agent.status === "failed" ? "border-red-500/40" :
                agent.status === "degraded" ? "border-amber-500/40" : ""
              }`}
              data-testid={`card-agent-${agent.id}`}
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {agentStatusIndicator(agent.status)}
                      <span className="text-sm font-semibold">{agent.name}</span>
                    </div>
                    {platformBadge(agent.platform)}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-xs text-muted-foreground">Success</div>
                    <div className={`text-sm font-bold ${agent.successRate24h >= 90 ? "text-green-500" : agent.successRate24h >= 70 ? "text-amber-500" : "text-red-500"}`}>
                      {agent.successRate24h}%
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Latency</div>
                    <div className="text-sm font-bold">{formatDuration(agent.avgLatencyMs)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">24h</div>
                    <div className="text-sm font-bold">{agent.invocations24h}</div>
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Last invocation: {agent.lastInvocation}
                </div>
                {agent.issue && (
                  <div className="text-[11px] p-1.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                    {agent.issue}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3" data-testid="text-section-history">Trace History</h2>
        <Card className="mb-4">
          <CardContent className="pt-4">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={CHART_DATA}>
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
                <Bar dataKey="partial" stackId="a" fill="#f59e0b" name="Partial" />
                <Bar dataKey="failed" stackId="a" fill="#ef4444" name="Failed" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <div className="flex gap-3 mb-4 flex-wrap">
          <Select value={platformFilter} onValueChange={setPlatformFilter}>
            <SelectTrigger className="w-40" data-testid="filter-platform">
              <SelectValue placeholder="Platform" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Platforms</SelectItem>
              <SelectItem value="copilot">Copilot</SelectItem>
              <SelectItem value="openai">OpenAI GPT</SelectItem>
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
              <SelectItem value="partial">Partial</SelectItem>
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>User</TableHead>
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
                      <TableCell className="text-sm">{formatDuration(trace.durationMs)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">{trace.userId || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatTime(trace.timestamp)}</TableCell>
                      <TableCell className="text-xs text-red-400 max-w-[200px] truncate">{trace.errorSummary || ""}</TableCell>
                    </TableRow>
                    {expandedTraceId === trace.id && (
                      <TableRow key={`${trace.id}-detail`}>
                        <TableCell colSpan={8} className="bg-muted/20 p-4">
                          <div className="space-y-4">
                            <div>
                              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                                <Activity className="h-4 w-4" />
                                Execution Waterfall
                                <span className="text-xs font-normal text-muted-foreground">
                                  Total: {formatDuration(trace.durationMs)}
                                </span>
                              </h4>
                              <WaterfallView trace={trace} />
                            </div>
                            {(trace.diagnosis || trace.actions) && (
                              <div className="grid gap-4 md:grid-cols-2">
                                <DiagnosisPanel trace={trace} />
                                <ActionsPanel trace={trace} />
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3" data-testid="text-section-action-history">Recent Actions</h2>
        <Card>
          <CardContent className="p-4">
            <div className="space-y-2">
              {ACTION_HISTORY.map((entry, i) => (
                <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0" data-testid={`action-history-${i}`}>
                  <div className="flex items-center gap-2">
                    {entry.result === "success" ?
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> :
                      <XCircle className="h-3.5 w-3.5 text-red-500" />
                    }
                    <span>{entry.action}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{entry.user}</span>
                    <span>{entry.time}</span>
                    <Badge variant={entry.result === "success" ? "outline" : "destructive"} className="text-[10px]">
                      {entry.result}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
    </Shell>
  );
}
