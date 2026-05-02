import { storage } from "./storage";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { isAnomalyAlertPayload, type Alert, type AnomalyAlertPayload } from "@shared/schema";

export type StreamKey =
  | "synthetic.latency"
  | "agent.error_rate"
  | "llm.ttft"
  | "llm.error_rate"
  | "entra.failure_rate"
  | "mcp.failure_rate";

export interface StreamDefinition {
  key: StreamKey;
  label: string;
  unit: string;
  category: "synthetic" | "agent" | "llm" | "entra" | "mcp";
  higherIsWorse: boolean;
}

export const STREAM_DEFINITIONS: StreamDefinition[] = [
  { key: "synthetic.latency",     label: "Synthetic Test Latency",      unit: "ms", category: "synthetic", higherIsWorse: true },
  { key: "agent.error_rate",      label: "Agent Trace Error Rate",      unit: "%",  category: "agent",     higherIsWorse: true },
  { key: "llm.ttft",              label: "LLM Time to First Token",     unit: "ms", category: "llm",       higherIsWorse: true },
  { key: "llm.error_rate",        label: "LLM Error Rate",              unit: "%",  category: "llm",       higherIsWorse: true },
  { key: "entra.failure_rate",    label: "Entra Sign-in Failure Rate",  unit: "%",  category: "entra",     higherIsWorse: true },
  { key: "mcp.failure_rate",      label: "MCP Tool Call Failure Rate",  unit: "%",  category: "mcp",       higherIsWorse: true },
];

export const DEFAULT_SENSITIVITY = 3;
const BASELINE_WINDOW_DAYS = 7;
const MIN_SAMPLES_FOR_BASELINE = 10;
const FOLLOWUP_AFTER_MS = 4 * 60 * 60 * 1000;

interface HourlyValue {
  bucket: Date;
  value: number;
  sampleCount: number;
}

interface HourlyRow {
  bucket: string | Date;
  value: string | number | null;
  sample_count: string | number | null;
}

function rowsToSeries(rows: HourlyRow[]): HourlyValue[] {
  return rows.map(r => ({
    bucket: r.bucket instanceof Date ? r.bucket : new Date(r.bucket),
    value: Number(r.value ?? 0) || 0,
    sampleCount: Number(r.sample_count ?? 0) || 0,
  }));
}

async function fetchHourlySeries(tenantId: string, streamKey: StreamKey, sinceMs: number): Promise<HourlyValue[]> {
  const since = new Date(Date.now() - sinceMs);
  const sinceIso = since.toISOString();

  switch (streamKey) {
    case "synthetic.latency": {
      const rows = await db.execute(sql`
        SELECT date_trunc('hour', timestamp) AS bucket,
               AVG(value)::real AS value,
               COUNT(*)::int AS sample_count
        FROM metrics
        WHERE tenant_id = ${tenantId}
          AND metric_name IN ('page_load','search','file_transfer','authentication','file_upload')
          AND status <> 'Failed'
          AND timestamp >= ${sinceIso}
        GROUP BY bucket ORDER BY bucket ASC
      `);
      return rowsToSeries(rows.rows as unknown as HourlyRow[]);
    }
    case "agent.error_rate": {
      const rows = await db.execute(sql`
        SELECT date_trunc('hour', started_at) AS bucket,
               (COUNT(*) FILTER (WHERE status IN ('failed','error')) * 100.0 / NULLIF(COUNT(*), 0))::real AS value,
               COUNT(*)::int AS sample_count
        FROM agent_traces
        WHERE tenant_id = ${tenantId} AND started_at >= ${sinceIso}
        GROUP BY bucket ORDER BY bucket ASC
      `);
      return rowsToSeries(rows.rows as unknown as HourlyRow[]);
    }
    case "llm.ttft": {
      const rows = await db.execute(sql`
        SELECT date_trunc('hour', called_at) AS bucket,
               AVG(ttft_ms)::real AS value,
               COUNT(*)::int AS sample_count
        FROM llm_calls
        WHERE tenant_id = ${tenantId} AND called_at >= ${sinceIso} AND ttft_ms IS NOT NULL
        GROUP BY bucket ORDER BY bucket ASC
      `);
      return rowsToSeries(rows.rows as unknown as HourlyRow[]);
    }
    case "llm.error_rate": {
      const rows = await db.execute(sql`
        SELECT date_trunc('hour', called_at) AS bucket,
               (COUNT(*) FILTER (WHERE status = 'error') * 100.0 / NULLIF(COUNT(*), 0))::real AS value,
               COUNT(*)::int AS sample_count
        FROM llm_calls
        WHERE tenant_id = ${tenantId} AND called_at >= ${sinceIso}
        GROUP BY bucket ORDER BY bucket ASC
      `);
      return rowsToSeries(rows.rows as unknown as HourlyRow[]);
    }
    case "entra.failure_rate": {
      const rows = await db.execute(sql`
        SELECT date_trunc('hour', sign_in_at) AS bucket,
               (COUNT(*) FILTER (WHERE status = 'failure') * 100.0 / NULLIF(COUNT(*), 0))::real AS value,
               COUNT(*)::int AS sample_count
        FROM entra_sign_ins
        WHERE tenant_id = ${tenantId} AND sign_in_at >= ${sinceIso}
        GROUP BY bucket ORDER BY bucket ASC
      `);
      return rowsToSeries(rows.rows as unknown as HourlyRow[]);
    }
    case "mcp.failure_rate": {
      const rows = await db.execute(sql`
        SELECT date_trunc('hour', called_at) AS bucket,
               (COUNT(*) FILTER (WHERE status = 'error') * 100.0 / NULLIF(COUNT(*), 0))::real AS value,
               COUNT(*)::int AS sample_count
        FROM mcp_tool_calls
        WHERE tenant_id = ${tenantId} AND called_at >= ${sinceIso}
        GROUP BY bucket ORDER BY bucket ASC
      `);
      return rowsToSeries(rows.rows as unknown as HourlyRow[]);
    }
  }
}

interface BaselineStats {
  mean: number;
  stddev: number;
  p50: number;
  p95: number;
}

function computeStats(values: number[]): BaselineStats {
  if (values.length === 0) return { mean: 0, stddev: 0, p50: 0, p95: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / Math.max(1, values.length - 1);
  const stddev = Math.sqrt(variance);
  const sorted = [...values].sort((a, b) => a - b);
  const pick = (p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))];
  return { mean, stddev, p50: pick(0.5), p95: pick(0.95) };
}

function streamMeta(key: StreamKey): StreamDefinition {
  const def = STREAM_DEFINITIONS.find(s => s.key === key);
  if (!def) throw new Error(`Unknown stream key: ${key}`);
  return def;
}

function severityForZScore(z: number): "info" | "warning" | "critical" {
  const a = Math.abs(z);
  if (a >= 5) return "critical";
  if (a >= 4) return "warning";
  return "info";
}

type DetectionAction =
  | { kind: "skipped"; reason: string }
  | { kind: "no_change"; reason: string }
  | { kind: "fired"; isFollowup: boolean; zScore: number }
  | { kind: "recovered"; previousAlertId: string };

export interface DetectionResult {
  streamKey: StreamKey;
  computed: boolean;
  action: DetectionAction;
}

async function getOrCreateStreamConfig(tenantId: string, streamKey: StreamKey) {
  let cfg = await storage.getAnomalyStreamConfig(tenantId, streamKey);
  if (!cfg) {
    cfg = await storage.upsertAnomalyStreamConfig({
      tenantId,
      streamKey,
      enabled: true,
      sensitivity: DEFAULT_SENSITIVITY,
    });
  }
  return cfg;
}

function readAnomalyState(latest: Alert | undefined): { state: "open" | "recovered"; followupCount: 0 | 1; firstSeenAtMs: number | null } {
  if (!latest) return { state: "recovered", followupCount: 0, firstSeenAtMs: null };
  if (!isAnomalyAlertPayload(latest.payload)) return { state: "recovered", followupCount: 0, firstSeenAtMs: null };
  return {
    state: latest.payload.state,
    followupCount: latest.payload.followupCount,
    firstSeenAtMs: latest.timestamp ? new Date(latest.timestamp).getTime() : null,
  };
}

function formatValue(v: number, unit: string): string {
  if (unit === "%") return `${v.toFixed(1)}%`;
  if (unit === "ms") return `${Math.round(v)}ms`;
  return v.toFixed(2);
}

export async function detectForStream(tenantId: string, streamKey: StreamKey): Promise<DetectionResult> {
  const cfg = await getOrCreateStreamConfig(tenantId, streamKey);
  if (!cfg.enabled) {
    return { streamKey, computed: false, action: { kind: "skipped", reason: "stream disabled" } };
  }

  const series = await fetchHourlySeries(tenantId, streamKey, BASELINE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  if (series.length < MIN_SAMPLES_FOR_BASELINE) {
    return { streamKey, computed: false, action: { kind: "skipped", reason: `insufficient data (${series.length} hourly samples)` } };
  }

  const sortedAsc = [...series].sort((a, b) => a.bucket.getTime() - b.bucket.getTime());
  const latestSample = sortedAsc[sortedAsc.length - 1];
  const baselineSamples = sortedAsc.slice(0, -1);
  const baselineValues = baselineSamples.map(s => s.value);
  const stats = computeStats(baselineValues);

  const safeStddev = stats.stddev > 0.0001 ? stats.stddev : Math.max(Math.abs(stats.mean) * 0.1, 0.5);
  const zScore = (latestSample.value - stats.mean) / safeStddev;

  await storage.upsertMetricBaseline({
    tenantId,
    streamKey,
    windowStart: latestSample.bucket,
    mean: stats.mean,
    stddev: stats.stddev,
    p50: stats.p50,
    p95: stats.p95,
    sampleCount: baselineSamples.length,
    current: latestSample.value,
    zScore,
  });

  const def = streamMeta(streamKey);
  const isAnomalousDirection = def.higherIsWorse ? zScore > 0 : zScore < 0;
  const passesThreshold = Math.abs(zScore) >= cfg.sensitivity;
  const isAnomalous = isAnomalousDirection && passesThreshold;

  const latestAnomalyAlert = await storage.getLatestAnomalyAlertForStream(tenantId, streamKey);
  const prior = readAnomalyState(latestAnomalyAlert);

  // Recovery: previously open episode but stream is now back to normal.
  if (!isAnomalous && prior.state === "open" && latestAnomalyAlert) {
    const recoveredPayload: AnomalyAlertPayload = {
      ...(isAnomalyAlertPayload(latestAnomalyAlert.payload) ? latestAnomalyAlert.payload : {
        streamKey,
        label: def.label,
        unit: def.unit,
        current: latestSample.value,
        mean: stats.mean,
        stddev: stats.stddev,
        p50: stats.p50,
        p95: stats.p95,
        zScore,
        sensitivity: cfg.sensitivity,
        sampleCount: baselineSamples.length,
        windowStart: latestSample.bucket.toISOString(),
        followupCount: 0,
        isFollowup: false,
        state: "open",
      }),
      state: "recovered",
    };
    await storage.updateAlertPayload(latestAnomalyAlert.id, recoveredPayload as unknown as Record<string, unknown>);
    return { streamKey, computed: true, action: { kind: "recovered", previousAlertId: latestAnomalyAlert.id } };
  }

  if (!isAnomalous) {
    return { streamKey, computed: true, action: { kind: "no_change", reason: passesThreshold ? "wrong direction" : `|z|=${zScore.toFixed(2)} < ${cfg.sensitivity}` } };
  }

  // From here on: metric IS anomalous.
  // Suppression rules:
  //   * If we are currently in an open episode AND have already emitted the follow-up: suppress.
  //   * If we are currently in an open episode AND followup not yet emitted AND it's been >= 4h since first alert: emit follow-up.
  //   * If we are currently in an open episode AND followup not yet emitted AND < 4h since first alert: suppress.
  //   * Otherwise (state was "recovered" or no prior alert): fire fresh alert.
  let isFollowup = false;
  if (prior.state === "open") {
    if (prior.followupCount === 1) {
      return { streamKey, computed: true, action: { kind: "no_change", reason: "suppressed (open episode, follow-up already sent)" } };
    }
    // followupCount === 0
    const elapsed = prior.firstSeenAtMs ? Date.now() - prior.firstSeenAtMs : 0;
    if (elapsed < FOLLOWUP_AFTER_MS) {
      return { streamKey, computed: true, action: { kind: "no_change", reason: `suppressed (open episode, ${Math.round(elapsed / 60000)}m since first alert)` } };
    }
    isFollowup = true;
  }

  const tenant = await storage.getTenant(tenantId);
  const severity = severityForZScore(zScore);
  const direction = zScore > 0 ? "above" : "below";
  const valueStr = formatValue(latestSample.value, def.unit);
  const meanStr = formatValue(stats.mean, def.unit);

  const title = isFollowup
    ? `Anomaly still active: ${def.label}${tenant ? ` (${tenant.name})` : ""}`
    : `Anomaly detected: ${def.label}${tenant ? ` (${tenant.name})` : ""}`;

  const message = `${def.label} is ${valueStr} (${direction} baseline mean ${meanStr}, z=${zScore.toFixed(2)}, threshold ±${cfg.sensitivity}). Baseline computed from ${baselineSamples.length} hourly samples over the past ${BASELINE_WINDOW_DAYS} days.`;

  const payload: AnomalyAlertPayload = {
    streamKey,
    label: def.label,
    unit: def.unit,
    current: latestSample.value,
    mean: stats.mean,
    stddev: stats.stddev,
    p50: stats.p50,
    p95: stats.p95,
    zScore,
    sensitivity: cfg.sensitivity,
    sampleCount: baselineSamples.length,
    windowStart: latestSample.bucket.toISOString(),
    state: "open",
    followupCount: isFollowup ? 1 : 0,
    isFollowup,
  };

  await storage.createAlert({
    tenantId,
    title,
    severity,
    message,
    alertType: "anomaly",
    streamKey,
    payload: payload as unknown as Record<string, unknown>,
  });

  return { streamKey, computed: true, action: { kind: "fired", isFollowup, zScore } };
}

export interface AnomalyRunResult {
  tenants: number;
  streamsEvaluated: number;
  baselinesUpdated: number;
  alertsCreated: number;
  recoveriesMarked: number;
  errors: string[];
}

export async function runAnomalyDetection(): Promise<AnomalyRunResult> {
  const result: AnomalyRunResult = {
    tenants: 0,
    streamsEvaluated: 0,
    baselinesUpdated: 0,
    alertsCreated: 0,
    recoveriesMarked: 0,
    errors: [],
  };

  const tenants = await storage.getTenants();
  for (const tenant of tenants) {
    result.tenants++;
    for (const def of STREAM_DEFINITIONS) {
      result.streamsEvaluated++;
      try {
        const r = await detectForStream(tenant.id, def.key);
        if (r.computed) result.baselinesUpdated++;
        if (r.action.kind === "fired") result.alertsCreated++;
        if (r.action.kind === "recovered") result.recoveriesMarked++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`${tenant.name}/${def.key}: ${msg}`);
        console.error(`[Anomaly] Failed for ${tenant.name}/${def.key}:`, err);
      }
    }
  }

  return result;
}
