import { useState } from "react";
import { Shell } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BellRing, CheckCircle2, AlertOctagon, Loader2, Activity, Filter, Sparkles, Cpu } from "lucide-react";
import { useAlerts, useAcknowledgeAlert, useMetricBaselineHistory, useAlertContext, type AnomalyContextItem } from "@/lib/api";
import { useLiveStream, type LiveEvent } from "@/lib/liveStream";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useActiveTenant } from "@/lib/tenant-context";
import { Link } from "wouter";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from "recharts";
import { isAnomalyAlertPayload, isCopilotSurfaceAlertPayload, type Alert, type Alert as AlertType, type AnomalyAlertPayload } from "@shared/schema";
import { ExportMenu } from "@/components/ExportMenu";

type AlertFilter = "all" | "anomaly" | "threshold" | "copilot_surface" | "llm_performance";

function formatStreamValue(v: number, unit: string): string {
  if (unit === "%") return `${v.toFixed(1)}%`;
  if (unit === "ms") return `${Math.round(v)}ms`;
  return v.toFixed(2);
}

export default function Alerts() {
  const { activeTenantId, activeOrgId, organization } = useActiveTenant();
  const orgId = organization?.id ?? activeOrgId;
  const [filter, setFilter] = useState<AlertFilter>("all");
  // Always fetch the full set of alerts and filter client-side so badge
  // counts stay accurate regardless of the active filter, and so the
  // "Threshold" view captures every non-anomaly alert type
  // (threshold, llm_budget, foundry_throttle, ...).
  const { data: alertList, isLoading } = useAlerts(activeTenantId ?? undefined);
  const ackMutation = useAcknowledgeAlert();
  const queryClient = useQueryClient();

  const handleLive = useCallback((event: LiveEvent) => {
    if (event.type !== "alert.created") return;
    const alert = event.data as AlertType;
    if (!alert?.id) return;
    if (activeTenantId && alert.tenantId !== activeTenantId) return;
    queryClient.setQueriesData<AlertType[] | undefined>(
      { queryKey: ["/api/alerts", activeTenantId ?? undefined, undefined, undefined] },
      (prev) => {
        if (!prev) return prev;
        if (prev.find((a) => a.id === alert.id)) return prev;
        return [alert, ...prev];
      },
    );
  }, [queryClient, activeTenantId]);
  useLiveStream(orgId, [activeTenantId], ["alert.created"], handleLive);

  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const severityParam = params.get("severity") || undefined;
  const ackParam = params.get("acknowledged") || undefined;
  const searchParam = params.get("search") || undefined;

  if (isLoading) {
    return (
      <Shell>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Shell>
    );
  }

  const allAlerts: Alert[] = alertList || [];
  const anomalyCount = allAlerts.filter((a) => a.alertType === "anomaly").length;
  const copilotSurfaceCount = allAlerts.filter((a) => a.alertType === "copilot_surface").length;
  const llmPerfCount = allAlerts.filter((a) => a.alertType === "llm_performance").length;
  const thresholdCount = allAlerts.filter((a) => a.alertType !== "anomaly" && a.alertType !== "copilot_surface" && a.alertType !== "llm_performance").length;
  const alerts: Alert[] = filter === "anomaly"
    ? allAlerts.filter((a) => a.alertType === "anomaly")
    : filter === "copilot_surface"
      ? allAlerts.filter((a) => a.alertType === "copilot_surface")
      : filter === "llm_performance"
        ? allAlerts.filter((a) => a.alertType === "llm_performance")
        : filter === "threshold"
          ? allAlerts.filter((a) => a.alertType !== "anomaly" && a.alertType !== "copilot_surface" && a.alertType !== "llm_performance")
          : allAlerts;

  return (
    <Shell>
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Alerts & Incidents</h2>
          <p className="text-muted-foreground">
            Manage active alerts and configure notification rules.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <ExportMenu
            testIdPrefix="export-alerts"
            baseUrl="/api/exports/alerts"
            query={{ tenantId: activeTenantId || undefined, severity: severityParam, acknowledged: ackParam, search: searchParam }}
            size="default"
          />
          <Link href="/settings/alerts">
            <Button variant="outline" data-testid="button-configure-rules">Configure Rules</Button>
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-4" data-testid="filter-alert-type">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground mr-2">Filter:</span>
        <Button
          size="sm"
          variant={filter === "all" ? "default" : "outline"}
          onClick={() => setFilter("all")}
          data-testid="button-filter-all"
        >
          <BellRing className="h-3 w-3 mr-1" /> All
        </Button>
        <Button
          size="sm"
          variant={filter === "anomaly" ? "default" : "outline"}
          onClick={() => setFilter("anomaly")}
          data-testid="button-filter-anomaly"
        >
          <Activity className="h-3 w-3 mr-1" /> Anomaly
          {filter !== "anomaly" && anomalyCount > 0 && (
            <Badge variant="secondary" className="ml-2">{anomalyCount}</Badge>
          )}
        </Button>
        <Button
          size="sm"
          variant={filter === "threshold" ? "default" : "outline"}
          onClick={() => setFilter("threshold")}
          data-testid="button-filter-threshold"
        >
          <AlertOctagon className="h-3 w-3 mr-1" /> Threshold
          {filter !== "threshold" && thresholdCount > 0 && (
            <Badge variant="secondary" className="ml-2">{thresholdCount}</Badge>
          )}
        </Button>
        <Button
          size="sm"
          variant={filter === "copilot_surface" ? "default" : "outline"}
          onClick={() => setFilter("copilot_surface")}
          data-testid="button-filter-copilot-surface"
        >
          <Sparkles className="h-3 w-3 mr-1" /> Copilot Surface
          {filter !== "copilot_surface" && copilotSurfaceCount > 0 && (
            <Badge variant="secondary" className="ml-2">{copilotSurfaceCount}</Badge>
          )}
        </Button>
        <Button
          size="sm"
          variant={filter === "llm_performance" ? "default" : "outline"}
          onClick={() => setFilter("llm_performance")}
          data-testid="button-filter-llm-perf"
        >
          <Cpu className="h-3 w-3 mr-1" /> LLM Performance
          {filter !== "llm_performance" && llmPerfCount > 0 && (
            <Badge variant="secondary" className="ml-2">{llmPerfCount}</Badge>
          )}
        </Button>
      </div>

      <div className="grid gap-4 mt-4">
        {alerts.map((alert) => {
          const copilotPayload = isCopilotSurfaceAlertPayload(alert.payload) ? alert.payload : null;
          const isAutoResolved = copilotPayload?.state === "resolved";
          const isActive = !alert.acknowledged && !isAutoResolved;
          const severityMap: Record<string, string> = { critical: "High", warning: "Medium", info: "Low" };
          const severity = severityMap[alert.severity] || alert.severity;
          const d = new Date(alert.timestamp!);
          const diff = Date.now() - d.getTime();
          const mins = Math.round(diff / 60000);
          const timeStr = mins < 1 ? "Just now" : mins < 60 ? `${mins} min ago` : `${Math.round(mins / 60)}h ago`;
          const isAnomaly = alert.alertType === "anomaly";
          const isCopilotSurface = alert.alertType === "copilot_surface";
          const isLlmPerf = alert.alertType === "llm_performance";
          const llmPerfPayload = isLlmPerf && alert.payload ? (alert.payload as Record<string, any>) : null;
          const isLlmPerfResolved = llmPerfPayload?.state === "resolved";
          const anomalyPayload: AnomalyAlertPayload | null = isAnomalyAlertPayload(alert.payload) ? alert.payload : null;
          const isFollowup = anomalyPayload?.isFollowup === true;
          const isRecovered = anomalyPayload?.state === "recovered";

          return (
            <Card key={alert.id} data-testid={`card-alert-${alert.id}`} className={isActive ? 'border-l-4 border-l-destructive' : 'border-l-4 border-l-emerald-500 opacity-75'}>
              <CardHeader className="pb-2 flex flex-row items-start justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    {isAnomaly ? <Activity className="h-5 w-5 text-amber-500" /> : isCopilotSurface ? <Sparkles className="h-5 w-5 text-blue-500" /> : isLlmPerf ? <Cpu className="h-5 w-5 text-violet-500" /> : isActive ? <AlertOctagon className="h-5 w-5 text-destructive" /> : <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
                    {alert.title}
                  </CardTitle>
                  <CardDescription className="mt-1">{timeStr}</CardDescription>
                </div>
                <div className="flex gap-2">
                  {isAnomaly && (
                    <Badge variant="outline" className="border-amber-500 text-amber-600" data-testid={`badge-anomaly-${alert.id}`}>
                      Anomaly
                    </Badge>
                  )}
                  {isFollowup && (
                    <Badge variant="outline" className="border-amber-700 text-amber-700" data-testid={`badge-followup-${alert.id}`}>
                      4h follow-up
                    </Badge>
                  )}
                  {isRecovered && (
                    <Badge variant="outline" className="border-emerald-500 text-emerald-600" data-testid={`badge-recovered-${alert.id}`}>
                      Recovered
                    </Badge>
                  )}
                  {isCopilotSurface && (
                    <Badge variant="outline" className="border-blue-500 text-blue-600" data-testid={`badge-copilot-surface-${alert.id}`}>
                      Copilot Surface
                    </Badge>
                  )}
                  {isAutoResolved && (
                    <Badge variant="outline" className="border-emerald-500 text-emerald-600" data-testid={`badge-auto-resolved-${alert.id}`}>
                      Auto-resolved
                    </Badge>
                  )}
                  {isLlmPerf && (
                    <Badge variant="outline" className="border-violet-500 text-violet-600" data-testid={`badge-llm-perf-${alert.id}`}>
                      LLM Performance
                    </Badge>
                  )}
                  {isLlmPerfResolved && (
                    <Badge variant="outline" className="border-emerald-500 text-emerald-600" data-testid={`badge-llm-perf-resolved-${alert.id}`}>
                      Auto-resolved
                    </Badge>
                  )}
                  <Badge variant={severity === 'High' ? 'destructive' : 'secondary'}>
                    {severity} Severity
                  </Badge>
                  {isActive && (
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid={`button-ack-${alert.id}`}
                      onClick={() => ackMutation.mutate(alert.id)}
                      disabled={ackMutation.isPending}
                    >
                      Acknowledge
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{alert.message}</p>
                {isAnomaly && alert.tenantId && alert.streamKey && anomalyPayload && (
                  <AnomalyMiniChart tenantId={alert.tenantId} streamKey={alert.streamKey} payload={anomalyPayload} />
                )}
                {isAnomaly && anomalyPayload && (
                  <PossibleCausesPanel alertId={alert.id} />
                )}
              </CardContent>
            </Card>
          );
        })}
        {alerts.length === 0 && (
          <Card>
            <CardContent className="flex items-center justify-center py-8 text-muted-foreground">
              {filter === "anomaly" ? "No anomalies detected." : filter === "copilot_surface" ? "No Copilot surface alerts." : filter === "llm_performance" ? "No LLM performance alerts." : filter === "threshold" ? "No threshold alerts." : "No alerts recorded."}
            </CardContent>
          </Card>
        )}
      </div>
    </Shell>
  );
}

function PossibleCausesPanel({ alertId }: { alertId: string }) {
  const { data, isLoading } = useAlertContext(alertId);

  if (isLoading) {
    return (
      <div className="mt-3 text-xs text-muted-foreground" data-testid={`causes-loading-${alertId}`}>
        Looking for related changes...
      </div>
    );
  }
  if (!data) return null;

  const kindLabel: Record<AnomalyContextItem["kind"], string> = {
    admin_audit: "Admin",
    service_health: "M365 Health",
    tenant_audit: "Tenant Config",
  };
  const kindClass: Record<AnomalyContextItem["kind"], string> = {
    admin_audit: "border-blue-500 text-blue-600",
    service_health: "border-rose-500 text-rose-600",
    tenant_audit: "border-violet-500 text-violet-600",
  };

  const fmtDelta = (m: number) => {
    const abs = Math.abs(m);
    const sign = m === 0 ? "" : m > 0 ? "+" : "−";
    if (abs < 60) return `${sign}${abs}m`;
    return `${sign}${(abs / 60).toFixed(1)}h`;
  };

  return (
    <div className="mt-4 border rounded-md p-3" data-testid={`causes-panel-${alertId}`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium">Possible causes</p>
        <p className="text-xs text-muted-foreground" data-testid={`causes-count-${alertId}`}>
          {data.counts.total === 0
            ? "No related changes in ±2h"
            : `${data.counts.total} change${data.counts.total === 1 ? "" : "s"} near this anomaly`}
        </p>
      </div>
      {data.counts.total === 0 ? (
        <p className="text-xs text-muted-foreground">
          No admin actions, M365 health incidents, or tenant config changes were recorded within ±2h of this window.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {data.items.slice(0, 8).map((item) => (
            <li
              key={`${item.kind}-${item.id}`}
              className="flex items-start justify-between gap-2 text-xs"
              data-testid={`cause-item-${item.kind}-${item.id}`}
            >
              <div className="flex items-start gap-2 min-w-0">
                <Badge variant="outline" className={`shrink-0 ${kindClass[item.kind]}`}>
                  {kindLabel[item.kind]}
                </Badge>
                <div className="min-w-0">
                  <div className="font-medium truncate">{item.title}</div>
                  {item.detail && <div className="text-muted-foreground truncate">{item.detail}</div>}
                </div>
              </div>
              <span className="font-mono text-muted-foreground whitespace-nowrap">{fmtDelta(item.deltaMinutes)}</span>
            </li>
          ))}
          {data.items.length > 8 && (
            <li className="text-xs text-muted-foreground">+{data.items.length - 8} more</li>
          )}
        </ul>
      )}
    </div>
  );
}

function AnomalyMiniChart({ tenantId, streamKey, payload }: { tenantId: string; streamKey: string; payload: AnomalyAlertPayload }) {
  const { data: history, isLoading } = useMetricBaselineHistory(tenantId, streamKey, 168);
  const fmt = (v: number) => formatStreamValue(v, payload.unit);

  if (isLoading) {
    return <div className="mt-3 h-[120px] flex items-center justify-center text-xs text-muted-foreground">Loading baseline...</div>;
  }
  if (!history || history.length === 0) {
    return null;
  }

  const sorted = [...history].sort((a, b) => new Date(a.windowStart).getTime() - new Date(b.windowStart).getTime());
  const sensitivity = payload.sensitivity;
  const data = sorted.map(h => {
    const d = new Date(h.windowStart);
    const mean = Number(h.mean);
    const stddev = Number(h.stddev);
    return {
      t: `${String(d.getMonth() + 1)}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}h`,
      current: Number(h.current),
      mean,
      upper: mean + sensitivity * stddev,
      lower: mean - sensitivity * stddev,
    };
  });

  return (
    <div className="mt-4 border rounded-md bg-muted/20 p-3" data-testid={`chart-anomaly-${streamKey}`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-muted-foreground">Baseline vs current ({sorted.length} hourly samples)</p>
        <p className="text-xs font-mono" data-testid={`text-zscore-${streamKey}`}>
          z = {payload.zScore.toFixed(2)} · current {fmt(payload.current)} · baseline μ {fmt(payload.mean)}
        </p>
      </div>
      <div className="h-[140px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <XAxis dataKey="t" stroke="#888888" fontSize={10} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis stroke="#888888" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => fmt(Number(v))} width={50} />
            <Tooltip
              contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '8px', fontSize: 12 }}
              formatter={(value, name) => [fmt(Number(value)), String(name)]}
            />
            <Line type="monotone" dataKey="mean" stroke="#94a3b8" strokeDasharray="4 4" dot={false} name="Baseline mean" />
            <Line type="monotone" dataKey="upper" stroke="#fbbf24" strokeDasharray="2 4" dot={false} name="Upper threshold" strokeWidth={1} />
            <Line type="monotone" dataKey="current" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Current value" />
            <ReferenceLine y={payload.current} stroke="#ef4444" strokeDasharray="3 3" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
