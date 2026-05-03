import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, ArrowLeft, Loader2, Sliders, TrendingUp } from "lucide-react";
import { Link, useSearch } from "wouter";
import { useActiveTenant } from "@/lib/tenant-context";
import {
  useBaselineStreams,
  useMetricBaselineHistory,
  useAlerts,
  type BaselineStreamSummary,
  type MetricBaselinePoint,
} from "@/lib/api";
import {
  Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
  ReferenceDot, CartesianGrid,
} from "recharts";
import { isAnomalyAlertPayload, type Alert } from "@shared/schema";

function formatStreamValue(v: number | null | undefined, unit: string): string {
  if (v == null || Number.isNaN(v)) return "—";
  if (unit === "%") return `${v.toFixed(1)}%`;
  if (unit === "ms") return `${Math.round(v)}ms`;
  return v.toFixed(2);
}

function useStreamParam(): string | null {
  const search = useSearch();
  return new URLSearchParams(search).get("stream");
}

export default function Baselines() {
  const { activeTenantId } = useActiveTenant();
  const selectedStream = useStreamParam();
  const { data: streams, isLoading } = useBaselineStreams(activeTenantId);

  if (!activeTenantId) {
    return (
      <Shell>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground" data-testid="empty-no-tenant">
            Select a tenant to view baseline streams.
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (isLoading) {
    return (
      <Shell>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Shell>
    );
  }

  const list = streams ?? [];
  const detail = selectedStream ? list.find(s => s.streamKey === selectedStream) : null;

  if (detail) {
    return <BaselineDetail tenantId={activeTenantId} stream={detail} />;
  }

  return (
    <Shell>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight" data-testid="heading-baselines">Baseline Streams</h2>
          <p className="text-muted-foreground">
            Live z-scores and 7-day rolling baselines for every monitored stream.
          </p>
        </div>
        <Link href="/settings/alerts">
          <Button variant="outline" data-testid="link-adjust-sensitivity">
            <Sliders className="mr-2 h-4 w-4" /> Adjust sensitivity
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" data-testid="grid-baseline-streams">
        {list.map(s => (
          <BaselineCard key={s.streamKey} tenantId={activeTenantId} stream={s} />
        ))}
      </div>
    </Shell>
  );
}

function BaselineCard({ tenantId, stream }: { tenantId: string; stream: BaselineStreamSummary }) {
  const { data: history } = useMetricBaselineHistory(
    tenantId,
    stream.baseline ? stream.streamKey : null,
    168,
  );

  const baseline = stream.baseline;
  const enoughData = !!baseline;
  const z = baseline?.zScore ?? null;
  const exceeds = z != null && Math.abs(z) >= stream.sensitivity;

  const sparkData = (history ?? [])
    .slice()
    .sort((a, b) => new Date(a.windowStart).getTime() - new Date(b.windowStart).getTime())
    .map(h => ({ t: new Date(h.windowStart).getTime(), v: Number(h.current) }));

  return (
    <Link href={`/baselines?stream=${encodeURIComponent(stream.streamKey)}`}>
      <Card
        className="cursor-pointer hover-elevate transition-colors"
        data-testid={`card-stream-${stream.streamKey}`}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className={`h-4 w-4 ${exceeds ? "text-amber-500" : "text-muted-foreground"}`} />
              {stream.label}
            </CardTitle>
            {!stream.enabled && (
              <Badge variant="secondary" data-testid={`badge-disabled-${stream.streamKey}`}>Disabled</Badge>
            )}
          </div>
          <CardDescription className="text-xs">
            {stream.category} · sensitivity {stream.sensitivity}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!enoughData ? (
            <div
              className="h-[80px] flex items-center justify-center text-xs text-muted-foreground text-center px-2"
              data-testid={`empty-stream-${stream.streamKey}`}
            >
              Need at least 10 hourly samples
              {baseline ? ` (have ${baseline.sampleCount})` : ""}.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                <div>
                  <div className="text-muted-foreground">Current</div>
                  <div className="font-mono font-medium" data-testid={`text-current-${stream.streamKey}`}>
                    {formatStreamValue(baseline.current, stream.unit)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Mean μ</div>
                  <div className="font-mono" data-testid={`text-mean-${stream.streamKey}`}>
                    {formatStreamValue(baseline.mean, stream.unit)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">z-score</div>
                  <div
                    className={`font-mono font-medium ${exceeds ? "text-amber-500" : ""}`}
                    data-testid={`text-zscore-${stream.streamKey}`}
                  >
                    {z != null ? z.toFixed(2) : "—"}
                  </div>
                </div>
              </div>
              <div className="h-[60px]" data-testid={`sparkline-${stream.streamKey}`}>
                {sparkData.length > 1 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={sparkData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <Line
                        type="monotone"
                        dataKey="v"
                        stroke="hsl(var(--primary))"
                        strokeWidth={1.5}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-xs text-muted-foreground flex items-center justify-center h-full">
                    Loading…
                  </div>
                )}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">
                {baseline.sampleCount} samples
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

function BaselineDetail({ tenantId, stream }: { tenantId: string; stream: BaselineStreamSummary }) {
  const { data: history, isLoading } = useMetricBaselineHistory(tenantId, stream.streamKey, 168);
  const { data: alertList } = useAlerts(tenantId, { streamKey: stream.streamKey });

  const baseline = stream.baseline;
  const sensitivity = stream.sensitivity;
  const sorted = (history ?? [])
    .slice()
    .sort((a, b) => new Date(a.windowStart).getTime() - new Date(b.windowStart).getTime());

  const data = sorted.map((h: MetricBaselinePoint) => {
    const ts = new Date(h.windowStart).getTime();
    const mean = Number(h.mean);
    const stddev = Number(h.stddev);
    return {
      ts,
      label: `${new Date(ts).getMonth() + 1}/${String(new Date(ts).getDate()).padStart(2, "0")} ${String(new Date(ts).getHours()).padStart(2, "0")}h`,
      current: h.current == null ? null : Number(h.current),
      mean,
      upper: mean + sensitivity * stddev,
      lower: mean - sensitivity * stddev,
    };
  });

  const enoughData = !!baseline && data.length > 0;

  const alerts: Alert[] = alertList ?? [];
  const HOUR_MS = 60 * 60 * 1000;
  const hourBucket = (ms: number) => Math.floor(ms / HOUR_MS) * HOUR_MS;

  type Marker = { ts: number; kind: "fired" | "suppressed"; current: number | null; key: string };
  const firedHours = new Set<number>();
  const markers: Marker[] = [];

  for (const a of alerts) {
    if (a.alertType !== "anomaly" || a.streamKey !== stream.streamKey || !a.timestamp) continue;
    const payload = isAnomalyAlertPayload(a.payload) ? a.payload : null;
    const ts = new Date(a.timestamp).getTime();
    firedHours.add(hourBucket(ts));
    markers.push({
      ts,
      kind: "fired",
      current: payload?.current ?? null,
      key: `alert-${a.id}`,
    });
  }

  for (const h of sorted) {
    const z = h.zScore == null ? null : Number(h.zScore);
    if (z == null) continue;
    const exceeds = stream.higherIsWorse ? z >= sensitivity : Math.abs(z) >= sensitivity;
    if (!exceeds) continue;
    const ts = new Date(h.windowStart).getTime();
    if (firedHours.has(hourBucket(ts))) continue;
    markers.push({
      ts,
      kind: "suppressed",
      current: h.current == null ? null : Number(h.current),
      key: `sup-${h.id}`,
    });
  }

  const firedCount = markers.filter(m => m.kind === "fired").length;
  const suppressedCount = markers.filter(m => m.kind === "suppressed").length;

  const fmt = (v: number | null | undefined) => formatStreamValue(v, stream.unit);

  return (
    <Shell>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Link href="/baselines">
            <Button variant="ghost" size="sm" data-testid="button-back-baselines">
              <ArrowLeft className="h-4 w-4 mr-1" /> All streams
            </Button>
          </Link>
          <div>
            <h2 className="text-2xl font-bold tracking-tight" data-testid="heading-baseline-detail">{stream.label}</h2>
            <p className="text-muted-foreground text-sm">
              {stream.category} · sensitivity {sensitivity} · unit {stream.unit}
            </p>
          </div>
        </div>
        <Link href="/settings/alerts">
          <Button variant="outline" data-testid="link-adjust-sensitivity-detail">
            <Sliders className="mr-2 h-4 w-4" /> Adjust sensitivity
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-4 mb-4">
        <SummaryStat
          label="Current"
          value={fmt(baseline?.current)}
          testId={`detail-current-${stream.streamKey}`}
        />
        <SummaryStat
          label="Baseline μ"
          value={fmt(baseline?.mean)}
          testId={`detail-mean-${stream.streamKey}`}
        />
        <SummaryStat
          label="z-score"
          value={baseline?.zScore != null ? Number(baseline.zScore).toFixed(2) : "—"}
          testId={`detail-zscore-${stream.streamKey}`}
        />
        <SummaryStat
          label="Samples"
          value={baseline ? String(baseline.sampleCount) : "—"}
          testId={`detail-samples-${stream.streamKey}`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> 7-day baseline vs current
          </CardTitle>
          <CardDescription>
            Dashed band shows ±{sensitivity}σ threshold.
            {" "}
            <span className="inline-flex items-center gap-1 mr-2"><span className="h-2 w-2 rounded-full bg-[#ef4444] inline-block" /> fired ({firedCount})</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#f59e0b] inline-block" /> suppressed ({suppressedCount})</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-[360px] flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : !enoughData ? (
            <div
              className="h-[360px] flex items-center justify-center text-sm text-muted-foreground text-center px-4"
              data-testid="empty-stream-detail"
            >
              Need at least 10 hourly samples
              {baseline ? ` (have ${baseline.sampleCount})` : ""} before a baseline can be computed.
            </div>
          ) : (
            <div className="h-[360px]" data-testid={`chart-baseline-${stream.streamKey}`}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis
                    dataKey="label"
                    stroke="#888888"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    stroke="#888888"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => fmt(Number(v))}
                    width={60}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--background))",
                      borderColor: "hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: 12,
                    }}
                    formatter={(value, name) => [fmt(Number(value)), String(name)]}
                  />
                  <Line type="monotone" dataKey="mean" stroke="#94a3b8" strokeDasharray="4 4" dot={false} name="Baseline mean" />
                  <Line type="monotone" dataKey="upper" stroke="#fbbf24" strokeDasharray="2 4" dot={false} name="Upper threshold" strokeWidth={1} />
                  <Line type="monotone" dataKey="lower" stroke="#fbbf24" strokeDasharray="2 4" dot={false} name="Lower threshold" strokeWidth={1} />
                  <Line type="monotone" dataKey="current" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Current value" />
                  {markers.map((m) => {
                    const point = data.find(d => Math.abs(d.ts - m.ts) < 60 * 60 * 1000);
                    if (!point) return null;
                    const y = m.current ?? point.current ?? point.mean;
                    const fill = m.kind === "fired" ? "#ef4444" : "#f59e0b";
                    const stroke = m.kind === "fired" ? "#b91c1c" : "#b45309";
                    return (
                      <ReferenceDot
                        key={m.key}
                        x={point.label}
                        y={y as number}
                        r={m.kind === "suppressed" ? 4 : 5}
                        fill={fill}
                        stroke={stroke}
                        ifOverflow="extendDomain"
                        data-testid={`marker-${m.kind}-${m.key}`}
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Recent anomaly alerts ({alerts.length})</CardTitle>
          <CardDescription>Anomalies fired against this stream in the current window.</CardDescription>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <div className="text-sm text-muted-foreground" data-testid="empty-alerts-detail">
              No anomalies recorded for this stream.
            </div>
          ) : (
            <div className="space-y-2">
              {alerts.slice(0, 10).map(a => {
                const payload = isAnomalyAlertPayload(a.payload) ? a.payload : null;
                const recovered = payload?.state === "recovered";
                return (
                  <div
                    key={a.id}
                    className="flex items-center justify-between border rounded-md px-3 py-2 text-sm"
                    data-testid={`row-alert-${a.id}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${recovered ? "bg-emerald-500" : "bg-destructive"}`} />
                      <span className="font-medium">{a.title}</span>
                      <span className="text-muted-foreground text-xs">
                        {a.timestamp ? new Date(a.timestamp).toLocaleString() : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {payload && (
                        <span className="font-mono text-xs text-muted-foreground">
                          z={payload.zScore.toFixed(2)} · {fmt(payload.current)}
                        </span>
                      )}
                      <Link href="/alerts">
                        <Button variant="ghost" size="sm" data-testid={`button-view-alert-${a.id}`}>View</Button>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </Shell>
  );
}

function SummaryStat({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-mono font-medium" data-testid={testId}>{value}</div>
      </CardContent>
    </Card>
  );
}
