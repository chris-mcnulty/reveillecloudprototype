import type { Request, Response } from "express";
import { storage } from "../storage";
import { streamExport, type ExportColumn } from "./streaming";
import type {
  AgentTrace,
  EntraSignIn,
  LlmCall,
  Alert,
  UsageReport,
} from "@shared/schema";

const DEFAULT_BATCH_SIZE = 500;
const HARD_MAX_ROWS = 1_000_000;

function parseFormat(req: Request): "csv" | "xlsx" {
  const f = String(req.query.format || "csv").toLowerCase();
  return f === "xlsx" ? "xlsx" : "csv";
}

function parseLimit(req: Request, defaultMax: number = HARD_MAX_ROWS): number {
  const raw = req.query.limit;
  if (raw === undefined || raw === null || raw === "") return defaultMax;
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n <= 0) return defaultMax;
  return Math.min(n, HARD_MAX_ROWS);
}

function toIso(d: Date | null | undefined): string {
  return d ? new Date(d).toISOString() : "";
}

function qStr(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (Array.isArray(v)) return typeof v[0] === "string" ? v[0] : undefined;
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function qBool(v: unknown): boolean | undefined {
  const s = qStr(v);
  if (s === undefined) return undefined;
  if (s === "true" || s === "1") return true;
  if (s === "false" || s === "0") return false;
  return undefined;
}

/**
 * Generic batched async iterator: pulls fixed-size pages from a source until
 * either the source is exhausted or `maxRows` is reached. Caller-supplied
 * `fetchPage(offset, limit)` returns at most `limit` rows.
 */
async function* batchedRows<T>(
  fetchPage: (offset: number, limit: number) => Promise<T[]>,
  maxRows: number,
  batchSize: number = DEFAULT_BATCH_SIZE,
): AsyncGenerator<T> {
  let offset = 0;
  let yielded = 0;
  while (yielded < maxRows) {
    const remaining = maxRows - yielded;
    const limit = Math.min(batchSize, remaining);
    const rows = await fetchPage(offset, limit);
    if (rows.length === 0) break;
    for (const row of rows) {
      yield row;
      yielded++;
      if (yielded >= maxRows) break;
    }
    if (rows.length < limit) break;
    offset += rows.length;
  }
}

export async function exportAgentTraces(req: Request, res: Response): Promise<void> {
  const tenantId = qStr(req.query.tenantId);
  const platform = qStr(req.query.platform);
  const status = qStr(req.query.status);
  const search = qStr(req.query.search);
  const maxRows = parseLimit(req);

  const source = batchedRows<AgentTrace>(async (offset, limit) => {
    return storage.getAgentTracesPaged({ tenantId, platform, status, search, offset, limit });
  }, maxRows);

  const columns: ExportColumn<AgentTrace>[] = [
    { key: "id", header: "Trace ID", accessor: r => r.id, width: 38 },
    { key: "tenantId", header: "Tenant ID", accessor: r => r.tenantId, width: 38 },
    { key: "agentName", header: "Agent", accessor: r => r.agentName, width: 28 },
    { key: "platform", header: "Platform", accessor: r => r.platform, width: 12 },
    { key: "status", header: "Status", accessor: r => r.status, width: 12 },
    { key: "totalDurationMs", header: "Duration (ms)", accessor: r => r.totalDurationMs ?? 0, width: 14 },
    { key: "startedAt", header: "Started", accessor: r => toIso(r.startedAt), width: 22 },
    { key: "completedAt", header: "Completed", accessor: r => toIso(r.completedAt), width: 22 },
    { key: "errorSummary", header: "Error", accessor: r => r.errorSummary || "", width: 40 },
  ];

  await streamExport(res, parseFormat(req), "agent-traces", "Agent Traces", columns, source);
}

export async function exportEntraSignIns(req: Request, res: Response): Promise<void> {
  const tenantId = String(req.params.tenantId);
  const userId = qStr(req.query.userId);
  const appName = qStr(req.query.appName);
  const status = qStr(req.query.status);
  const riskLevel = qStr(req.query.riskLevel);
  const since = qStr(req.query.since);
  const maxRows = parseLimit(req);

  const source = batchedRows<EntraSignIn>(async (offset, limit) => {
    return storage.getEntraSignInsPaged(tenantId, { userId, appName, status, riskLevel, since, offset, limit });
  }, maxRows);

  const columns: ExportColumn<EntraSignIn>[] = [
    { key: "signInAt", header: "Sign-In Time", accessor: r => toIso(r.signInAt), width: 22 },
    { key: "userPrincipalName", header: "User", accessor: r => r.userPrincipalName || "", width: 28 },
    { key: "userDisplayName", header: "Display Name", accessor: r => r.userDisplayName || "", width: 24 },
    { key: "appDisplayName", header: "App", accessor: r => r.appDisplayName || "", width: 24 },
    { key: "clientAppUsed", header: "Client", accessor: r => r.clientAppUsed || "", width: 18 },
    { key: "status", header: "Status", accessor: r => r.status, width: 10 },
    { key: "errorCode", header: "Error Code", accessor: r => r.errorCode ?? "", width: 12 },
    { key: "failureReason", header: "Failure Reason", accessor: r => r.failureReason || "", width: 32 },
    { key: "riskLevel", header: "Risk", accessor: r => r.riskLevel || "none", width: 10 },
    { key: "mfaRequired", header: "MFA Required", accessor: r => r.mfaRequired ? "true" : "false", width: 12 },
    { key: "ipAddress", header: "IP", accessor: r => r.ipAddress || "", width: 18 },
    { key: "city", header: "City", accessor: r => r.city || "", width: 16 },
    { key: "countryOrRegion", header: "Country", accessor: r => r.countryOrRegion || "", width: 14 },
    { key: "deviceOS", header: "Device OS", accessor: r => r.deviceOS || "", width: 16 },
    { key: "deviceBrowser", header: "Browser", accessor: r => r.deviceBrowser || "", width: 16 },
  ];

  await streamExport(res, parseFormat(req), `entra-signins-${tenantId.slice(0, 8)}`, "Sign-Ins", columns, source);
}

type FoundryCostAllocationRow = {
  deploymentId: string;
  deploymentName: string;
  accountName: string;
  modelName: string;
  region: string;
  resolvedInputCostPerMtok: number | null;
  resolvedOutputCostPerMtok: number | null;
  authoritativeInputTokens: number;
  authoritativeOutputTokens: number;
  authoritativeTotalCalls: number;
  authoritativeTotalCostCents: number;
  agentId: string;
  agentName: string;
  platform: string;
  agentInputTokens: number;
  agentOutputTokens: number;
  agentCallCount: number;
  shareOfTokens: number;
  allocatedCostCents: number;
};

export async function exportFoundryCostAllocation(req: Request, res: Response): Promise<void> {
  const tenantId = String(req.params.tenantId);
  const windowHours = Math.max(1, parseInt(String(req.query.windowHours || "24"), 10) || 24);
  const allocation = await storage.getFoundryCostAllocation(tenantId, windowHours);

  function* rows(): Generator<FoundryCostAllocationRow> {
    for (const d of allocation.deployments) {
      const baseRow = {
        deploymentId: d.deploymentId,
        deploymentName: d.deploymentName,
        accountName: d.accountName,
        modelName: d.modelName || "",
        region: d.region || "",
        resolvedInputCostPerMtok: d.resolvedInputCostPerMtok,
        resolvedOutputCostPerMtok: d.resolvedOutputCostPerMtok,
        authoritativeInputTokens: d.authoritativeInputTokens,
        authoritativeOutputTokens: d.authoritativeOutputTokens,
        authoritativeTotalCalls: d.authoritativeTotalCalls,
        authoritativeTotalCostCents: d.authoritativeTotalCostCents,
      };
      if (d.agents.length === 0) {
        yield {
          ...baseRow,
          agentId: "",
          agentName: "(unallocated)",
          platform: "",
          agentInputTokens: 0,
          agentOutputTokens: 0,
          agentCallCount: 0,
          shareOfTokens: 0,
          allocatedCostCents: 0,
        };
        continue;
      }
      for (const a of d.agents) {
        yield {
          ...baseRow,
          agentId: a.agentId || "",
          agentName: a.agentName || "(ad-hoc)",
          platform: a.platform || "",
          agentInputTokens: a.inputTokens,
          agentOutputTokens: a.outputTokens,
          agentCallCount: a.callCount,
          shareOfTokens: a.shareOfTokens,
          allocatedCostCents: a.allocatedCostCents,
        };
      }
      if (d.unallocatedCostCents > 0.0001) {
        yield {
          ...baseRow,
          agentId: "",
          agentName: "(unallocated)",
          platform: "",
          agentInputTokens: 0,
          agentOutputTokens: 0,
          agentCallCount: 0,
          shareOfTokens: 0,
          allocatedCostCents: d.unallocatedCostCents,
        };
      }
    }
  }

  const columns: ExportColumn<FoundryCostAllocationRow>[] = [
    { key: "deploymentName", header: "Deployment", accessor: r => r.deploymentName, width: 30 },
    { key: "accountName", header: "Account", accessor: r => r.accountName, width: 24 },
    { key: "modelName", header: "Model", accessor: r => r.modelName, width: 24 },
    { key: "region", header: "Region", accessor: r => r.region, width: 14 },
    { key: "resolvedInputCostPerMtok", header: "Input $/Mtok", accessor: r => r.resolvedInputCostPerMtok ?? "", width: 14 },
    { key: "resolvedOutputCostPerMtok", header: "Output $/Mtok", accessor: r => r.resolvedOutputCostPerMtok ?? "", width: 14 },
    { key: "authoritativeInputTokens", header: "Auth Input Tokens", accessor: r => r.authoritativeInputTokens, width: 16 },
    { key: "authoritativeOutputTokens", header: "Auth Output Tokens", accessor: r => r.authoritativeOutputTokens, width: 16 },
    { key: "authoritativeTotalCalls", header: "Auth Calls", accessor: r => r.authoritativeTotalCalls, width: 12 },
    { key: "authoritativeTotalCostCents", header: "Deployment Cost (cents)", accessor: r => r.authoritativeTotalCostCents.toFixed(4), width: 18 },
    { key: "agentId", header: "Agent ID", accessor: r => r.agentId, width: 38 },
    { key: "agentName", header: "Agent", accessor: r => r.agentName, width: 28 },
    { key: "platform", header: "Business Unit (platform)", accessor: r => r.platform, width: 18 },
    { key: "agentInputTokens", header: "Agent Input Tokens", accessor: r => r.agentInputTokens, width: 16 },
    { key: "agentOutputTokens", header: "Agent Output Tokens", accessor: r => r.agentOutputTokens, width: 16 },
    { key: "agentCallCount", header: "Agent Calls", accessor: r => r.agentCallCount, width: 12 },
    { key: "shareOfTokens", header: "Share", accessor: r => r.shareOfTokens.toFixed(4), width: 10 },
    { key: "allocatedCostCents", header: "Allocated Cost (cents)", accessor: r => r.allocatedCostCents.toFixed(4), width: 18 },
  ];

  await streamExport(res, parseFormat(req), `foundry-cost-allocation-${tenantId.slice(0, 8)}-${windowHours}h`, "Foundry Cost Allocation", columns, rows());
}

export async function exportLlmCalls(req: Request, res: Response): Promise<void> {
  const tenantId = String(req.params.tenantId);
  const modelId = qStr(req.query.modelId);
  const agentId = qStr(req.query.agentId);
  const status = qStr(req.query.status);
  const errorClass = qStr(req.query.errorClass);
  const since = qStr(req.query.since);
  const maxRows = parseLimit(req);

  const source = batchedRows<LlmCall>(async (offset, limit) => {
    return storage.getLlmCallsPaged(tenantId, { modelId, agentId, status, errorClass, since, offset, limit });
  }, maxRows);

  const columns: ExportColumn<LlmCall>[] = [
    { key: "calledAt", header: "Called At", accessor: r => toIso(r.calledAt), width: 22 },
    { key: "agentName", header: "Agent", accessor: r => r.agentName || "", width: 24 },
    { key: "operation", header: "Operation", accessor: r => r.operation, width: 20 },
    { key: "modelId", header: "Model ID", accessor: r => r.modelId, width: 38 },
    { key: "status", header: "Status", accessor: r => r.status, width: 10 },
    { key: "durationMs", header: "Duration (ms)", accessor: r => r.durationMs ?? 0, width: 14 },
    { key: "ttftMs", header: "TTFT (ms)", accessor: r => r.ttftMs ?? 0, width: 12 },
    { key: "tokensPerSec", header: "Tokens/s", accessor: r => r.tokensPerSec ?? 0, width: 12 },
    { key: "inputTokens", header: "Input Tokens", accessor: r => r.inputTokens ?? 0, width: 14 },
    { key: "outputTokens", header: "Output Tokens", accessor: r => r.outputTokens ?? 0, width: 14 },
    { key: "cachedInputTokens", header: "Cached Input", accessor: r => r.cachedInputTokens ?? 0, width: 14 },
    { key: "costCents", header: "Cost (cents)", accessor: r => r.costCents ?? 0, width: 14 },
    { key: "errorClass", header: "Error Class", accessor: r => r.errorClass || "", width: 20 },
    { key: "errorMessage", header: "Error", accessor: r => r.errorMessage || "", width: 40 },
  ];

  await streamExport(res, parseFormat(req), `llm-calls-${tenantId.slice(0, 8)}`, "LLM Calls", columns, source);
}

export async function exportAlerts(req: Request, res: Response): Promise<void> {
  const tenantId = qStr(req.query.tenantId);
  const severity = qStr(req.query.severity);
  const acknowledged = qBool(req.query.acknowledged);
  const search = qStr(req.query.search);
  const maxRows = parseLimit(req);

  const source = batchedRows<Alert>(async (offset, limit) => {
    return storage.getAlertsPaged({ tenantId, severity, acknowledged, search, offset, limit });
  }, maxRows);

  const columns: ExportColumn<Alert>[] = [
    { key: "timestamp", header: "Timestamp", accessor: r => toIso(r.timestamp), width: 22 },
    { key: "severity", header: "Severity", accessor: r => r.severity, width: 10 },
    { key: "title", header: "Title", accessor: r => r.title, width: 40 },
    { key: "message", header: "Message", accessor: r => r.message || "", width: 60 },
    { key: "acknowledged", header: "Acknowledged", accessor: r => r.acknowledged ? "true" : "false", width: 14 },
    { key: "tenantId", header: "Tenant ID", accessor: r => r.tenantId, width: 38 },
  ];

  await streamExport(res, parseFormat(req), tenantId ? `alerts-${tenantId.slice(0, 8)}` : "alerts", "Alerts", columns, source);
}

export async function exportUsageReports(req: Request, res: Response): Promise<void> {
  const tenantId = String(req.params.tenantId);
  const reportType = qStr(req.query.reportType);
  const sinceStr = qStr(req.query.since);
  const since = sinceStr ? new Date(sinceStr) : undefined;
  const maxRows = parseLimit(req);

  type FlatRow = {
    reportId: string;
    reportType: string;
    reportDate: string;
    collectedAt: Date | null;
    rowJson: string;
  };

  async function* flatten(): AsyncGenerator<FlatRow> {
    let yielded = 0;
    let offset = 0;
    while (yielded < maxRows) {
      const remaining = maxRows - yielded;
      const limit = Math.min(DEFAULT_BATCH_SIZE, remaining);
      const reports: UsageReport[] = await storage.getUsageReportsPaged(tenantId, { reportType, since, offset, limit });
      if (reports.length === 0) break;
      for (const r of reports) {
        const data = r.data as { records?: unknown[] } | null;
        const records = Array.isArray(data?.records) ? data!.records : null;
        if (records && records.length > 0) {
          for (const rec of records) {
            yield {
              reportId: r.id,
              reportType: r.reportType,
              reportDate: r.reportDate || "",
              collectedAt: r.collectedAt,
              rowJson: JSON.stringify(rec),
            };
            yielded++;
            if (yielded >= maxRows) return;
          }
        } else {
          yield {
            reportId: r.id,
            reportType: r.reportType,
            reportDate: r.reportDate || "",
            collectedAt: r.collectedAt,
            rowJson: JSON.stringify(r.data ?? {}),
          };
          yielded++;
          if (yielded >= maxRows) return;
        }
      }
      if (reports.length < limit) break;
      offset += reports.length;
    }
  }

  const columns: ExportColumn<FlatRow>[] = [
    { key: "collectedAt", header: "Collected At", accessor: r => toIso(r.collectedAt), width: 22 },
    { key: "reportType", header: "Report Type", accessor: r => r.reportType, width: 24 },
    { key: "reportDate", header: "Report Date", accessor: r => r.reportDate, width: 18 },
    { key: "reportId", header: "Report ID", accessor: r => r.reportId, width: 38 },
    { key: "rowJson", header: "Row Data (JSON)", accessor: r => r.rowJson, width: 80 },
  ];

  await streamExport(
    res,
    parseFormat(req),
    `usage-reports-${tenantId.slice(0, 8)}${reportType ? "-" + reportType : ""}`,
    "Usage Reports",
    columns,
    flatten(),
  );
}
