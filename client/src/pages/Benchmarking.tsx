import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Redirect, useLocation } from "wouter";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useActiveTenant } from "@/lib/tenant-context";
import { ArrowDown, ArrowUp, Columns3, Copy, FileDown, Loader2, Minus } from "lucide-react";

interface MetricCell {
  value: number;
  prev: number | null;
  delta: number | null;
  sparkline: number[];
}
interface TenantRow {
  tenantId: string;
  tenantName: string;
  metrics: Record<string, MetricCell>;
}
interface BenchmarkData {
  orgId: string;
  orgName: string;
  windowLabel: string;
  metricWindows: Record<string, { ms: number; label: string }>;
  generatedAt: string;
  tenants: TenantRow[];
}

interface MetricConfig {
  key: string;
  label: string;
  helpText: string;
  lowerIsBetter: boolean;
  format: (v: number) => string;
  route: string;
  windowSource: "selector" | "fixed";
  fixedWindowKey?: string;
}

const METRIC_CONFIG: MetricConfig[] = [
  {
    key: "latencyP95",
    label: "Synthetic latency p95",
    helpText: "Lower is better",
    lowerIsBetter: true,
    format: (v) => (v > 0 ? `${Math.round(v)}ms` : "—"),
    route: "/performance",
    windowSource: "selector",
  },
  {
    key: "alertCount",
    label: "Alerts",
    helpText: "Lower is better",
    lowerIsBetter: true,
    format: (v) => `${Math.round(v)}`,
    route: "/alerts",
    windowSource: "selector",
  },
  {
    key: "agentErrorRate",
    label: "Agent error rate",
    helpText: "Lower is better",
    lowerIsBetter: true,
    format: (v) => `${v.toFixed(1)}%`,
    route: "/agent-observability",
    windowSource: "selector",
  },
  {
    key: "copilotUsers",
    label: "Copilot active users",
    helpText: "Higher is better",
    lowerIsBetter: false,
    format: (v) => `${Math.round(v)}`,
    route: "/llm-performance",
    windowSource: "fixed",
    fixedWindowKey: "28d",
  },
  {
    key: "llmSpend",
    label: "LLM spend",
    helpText: "Lower is better",
    lowerIsBetter: true,
    format: (v) => `$${(v / 100).toFixed(2)}`,
    route: "/llm-performance",
    windowSource: "fixed",
    fixedWindowKey: "mtd",
  },
  {
    key: "riskySignIns",
    label: "High-risk sign-ins",
    helpText: "Lower is better",
    lowerIsBetter: true,
    format: (v) => `${Math.round(v)}`,
    route: "/entra-signins",
    windowSource: "fixed",
    fixedWindowKey: "7d",
  },
];

const WINDOW_OPTIONS = [
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];

const COLS_STORAGE_KEY = "benchmarking.visibleCols.v1";

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length === 0) return <div className="h-6" />;
  const max = Math.max(...data, 0.001);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 84;
  const h = 22;
  const stepX = data.length > 1 ? w / (data.length - 1) : w;
  const points = data
    .map((v, i) => `${i * stepX},${h - ((v - min) / range) * h}`)
    .join(" ");
  return (
    <svg width={w} height={h} className="opacity-80" aria-hidden>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function quartileFn(values: number[], lowerIsBetter: boolean): (i: number) => "best" | "worst" | "neutral" {
  const validVals = values.filter((v) => Number.isFinite(v));
  if (validVals.length < 3) return () => "neutral";
  const sorted = [...validVals].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  return (i: number) => {
    const v = values[i];
    if (!Number.isFinite(v)) return "neutral";
    if (q1 === q3) return "neutral";
    if (lowerIsBetter) {
      if (v <= q1) return "best";
      if (v >= q3) return "worst";
    } else {
      if (v >= q3) return "best";
      if (v <= q1) return "worst";
    }
    return "neutral";
  };
}

export default function Benchmarking() {
  const { isMsp, organization, activeOrgId, setActiveTenantId, isLoading: orgLoading } = useActiveTenant();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [windowSel, setWindowSel] = useState<string>("7d");
  const [visibleCols, setVisibleCols] = useState<Set<string>>(() => {
    const saved = localStorage.getItem(COLS_STORAGE_KEY);
    if (saved) {
      try {
        const arr = JSON.parse(saved) as unknown;
        if (Array.isArray(arr)) return new Set(arr.filter((x): x is string => typeof x === "string"));
      } catch (err) {
        console.warn("benchmarking: could not parse saved columns", err);
      }
    }
    return new Set(METRIC_CONFIG.map((m) => m.key));
  });

  useEffect(() => {
    localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify(Array.from(visibleCols)));
  }, [visibleCols]);

  const orgIdToUse = activeOrgId || organization?.id || null;

  const { data, isLoading, isError, error } = useQuery<BenchmarkData>({
    queryKey: ["/api/benchmarking", orgIdToUse, windowSel],
    queryFn: async () => {
      const res = await fetch(`/api/benchmarking?orgId=${orgIdToUse}&window=${windowSel}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: isMsp && !orgLoading && !!orgIdToUse,
  });

  const tenants = useMemo(() => data?.tenants ?? [], [data]);
  const metricWindows = data?.metricWindows ?? {};

  const visibleMetrics = useMemo(
    () => METRIC_CONFIG.filter((m) => visibleCols.has(m.key)),
    [visibleCols]
  );

  const quartileLookup = useMemo(() => {
    const map: Record<string, (i: number) => "best" | "worst" | "neutral"> = {};
    for (const m of METRIC_CONFIG) {
      const values = tenants.map((t) => t.metrics[m.key]?.value ?? NaN);
      map[m.key] = quartileFn(values, m.lowerIsBetter);
    }
    return map;
  }, [tenants]);

  if (!orgLoading && !isMsp) {
    return <Redirect to="/" />;
  }

  const effectiveWindowKey = (m: MetricConfig): string => {
    if (m.windowSource === "fixed") return m.fixedWindowKey || windowSel;
    return windowSel;
  };

  const headerWindowLabel = (m: MetricConfig): string => {
    const fromServer = metricWindows[m.key]?.label;
    if (fromServer) return fromServer;
    if (m.windowSource === "fixed") {
      const k = m.fixedWindowKey;
      return k === "mtd" ? "MTD" : (k || "").toUpperCase();
    }
    return windowSel.toUpperCase();
  };

  const handleCellClick = (tenantId: string, metricKey: string) => {
    const m = METRIC_CONFIG.find((x) => x.key === metricKey);
    if (!m) return;
    setActiveTenantId(tenantId);
    const params = new URLSearchParams();
    params.set("tenantId", tenantId);
    params.set("window", effectiveWindowKey(m));
    setLocation(`${m.route}?${params.toString()}`);
  };

  const copyAsTable = () => {
    if (!data) return;
    const headers = [
      "Tenant",
      ...visibleMetrics.map((m) => `${m.label} (${headerWindowLabel(m)})`),
      ...visibleMetrics.map((m) => `${m.label} Δ%`),
    ].join("\t");
    const rows = tenants.map((t) => {
      const vals = visibleMetrics.map((m) => m.format(t.metrics[m.key]?.value ?? 0));
      const deltas = visibleMetrics.map((m) => {
        const d = t.metrics[m.key]?.delta;
        return d == null ? "—" : `${d.toFixed(1)}%`;
      });
      return [t.tenantName, ...vals, ...deltas].join("\t");
    });
    const text = [headers, ...rows].join("\n");
    navigator.clipboard.writeText(text).then(
      () => toast({ title: "Copied", description: `${rows.length} tenant rows copied as TSV` }),
      () => toast({ title: "Copy failed", description: "Clipboard access denied", variant: "destructive" })
    );
  };

  const exportPdf = () => {
    window.print();
  };

  const toggleCol = (key: string) => {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      if (next.size === 0) next.add(key);
      return next;
    });
  };

  return (
    <Shell>
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap print:hidden">
        <div>
          <h2 data-testid="text-page-title" className="text-3xl font-bold tracking-tight">
            Cross-Tenant Benchmarking
          </h2>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Compare key reliability and adoption metrics across {data?.orgName || organization?.name || "your"} client
            tenants. Each metric uses its standard reporting window — the selector below controls latency, alerts and
            agent error rate; Copilot users (28d), LLM spend (MTD) and high-risk sign-ins (7d) are fixed. Click any
            cell to drill into the tenant's detail page with the same window pre-applied.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={windowSel} onValueChange={setWindowSel}>
            <SelectTrigger className="w-[170px]" data-testid="select-window">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WINDOW_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} data-testid={`window-${o.value}`}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" data-testid="button-columns">
                <Columns3 className="h-4 w-4 mr-1.5" /> Columns ({visibleCols.size}/{METRIC_CONFIG.length})
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Visible metrics</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {METRIC_CONFIG.map((m) => (
                <DropdownMenuCheckboxItem
                  key={m.key}
                  checked={visibleCols.has(m.key)}
                  onCheckedChange={() => toggleCol(m.key)}
                  data-testid={`toggle-col-${m.key}`}
                  onSelect={(e) => e.preventDefault()}
                >
                  {m.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" onClick={copyAsTable} data-testid="button-copy" disabled={!data || tenants.length === 0}>
            <Copy className="h-4 w-4 mr-1.5" /> Copy as table
          </Button>
          <Button variant="outline" size="sm" onClick={exportPdf} data-testid="button-export-pdf" disabled={!data || tenants.length === 0}>
            <FileDown className="h-4 w-4 mr-1.5" /> Export PDF
          </Button>
        </div>
      </div>

      <div className="hidden print:block mb-4">
        <h2 className="text-2xl font-bold">{data?.orgName} — Cross-Tenant Benchmark</h2>
        <p className="text-sm text-muted-foreground">
          Selector window: {WINDOW_OPTIONS.find((w) => w.value === windowSel)?.label} · Generated{" "}
          {data?.generatedAt ? new Date(data.generatedAt).toLocaleString() : ""}
        </p>
      </div>

      {(isLoading || orgLoading) && (
        <div className="flex items-center justify-center h-64" data-testid="loading-state">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && isError && (
        <Card>
          <CardContent className="p-8 text-center text-destructive" data-testid="error-state">
            Failed to load benchmarking data{error instanceof Error ? `: ${error.message}` : ""}.
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && tenants.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground" data-testid="empty-state">
            No client tenants found for this MSP organization. Onboard a tenant to begin benchmarking.
          </CardContent>
        </Card>
      )}

      {!isLoading && tenants.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" data-testid="table-benchmarking">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide sticky left-0 bg-muted/40 z-10 min-w-[180px]">
                    Tenant
                  </th>
                  {visibleMetrics.map((m) => (
                    <th
                      key={m.key}
                      className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap min-w-[150px]"
                      data-testid={`header-${m.key}`}
                    >
                      <div>{m.label} <span className="text-muted-foreground font-normal">({headerWindowLabel(m)})</span></div>
                      <div className="text-[10px] font-normal text-muted-foreground normal-case tracking-normal mt-0.5">
                        {m.helpText}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tenants.map((t, rowIdx) => (
                  <tr
                    key={t.tenantId}
                    className="border-b last:border-b-0 hover:bg-muted/20 transition-colors"
                    data-testid={`row-tenant-${t.tenantId}`}
                  >
                    <td className="px-4 py-3 font-medium sticky left-0 bg-background z-10 align-middle">
                      <div className="text-sm" data-testid={`text-tenant-name-${t.tenantId}`}>{t.tenantName}</div>
                      <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                        {t.tenantId.slice(0, 8)}…
                      </div>
                    </td>
                    {visibleMetrics.map((m) => {
                      const cell = t.metrics[m.key];
                      if (!cell) {
                        return (
                          <td key={m.key} className="px-4 py-3 text-right text-muted-foreground">
                            —
                          </td>
                        );
                      }
                      const quart = quartileLookup[m.key]?.(rowIdx) ?? "neutral";
                      const tint =
                        quart === "best"
                          ? "bg-emerald-500/10 hover:bg-emerald-500/20 border-l-2 border-l-emerald-500/60"
                          : quart === "worst"
                          ? "bg-red-500/10 hover:bg-red-500/20 border-l-2 border-l-red-500/60"
                          : "border-l-2 border-l-transparent hover:bg-accent/40";
                      const sparkColor = quart === "best" ? "#10b981" : quart === "worst" ? "#ef4444" : "#94a3b8";
                      const delta = cell.delta;
                      const significantDelta = delta != null && Math.abs(delta) >= 1;
                      const deltaPositive =
                        delta != null && (m.lowerIsBetter ? delta < 0 : delta > 0);
                      const deltaColor = !significantDelta
                        ? "text-muted-foreground"
                        : deltaPositive
                        ? "text-emerald-500"
                        : "text-red-500";
                      const DeltaIcon =
                        !significantDelta ? Minus : (delta as number) > 0 ? ArrowUp : ArrowDown;

                      return (
                        <td
                          key={m.key}
                          className={`px-3 py-3 cursor-pointer transition-colors ${tint}`}
                          onClick={() => handleCellClick(t.tenantId, m.key)}
                          data-testid={`cell-${t.tenantId}-${m.key}`}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              handleCellClick(t.tenantId, m.key);
                            }
                          }}
                        >
                          <div className="flex flex-col items-end gap-1 min-w-[120px]">
                            <div className="flex items-center justify-end gap-3 w-full">
                              <span
                                className={`text-[11px] flex items-center gap-0.5 ${deltaColor} tabular-nums`}
                                data-testid={`delta-${t.tenantId}-${m.key}`}
                              >
                                <DeltaIcon className="h-3 w-3" />
                                {delta == null ? "—" : `${Math.abs(delta).toFixed(0)}%`}
                              </span>
                              <span
                                className="text-base font-semibold tabular-nums"
                                data-testid={`value-${t.tenantId}-${m.key}`}
                              >
                                {m.format(cell.value)}
                              </span>
                            </div>
                            <Sparkline data={cell.sparkline} color={sparkColor} />
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!isLoading && tenants.length > 0 && (
        <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground print:hidden flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded bg-emerald-500/60" /> Top quartile
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded bg-red-500/60" /> Bottom quartile
          </div>
          <Badge variant="outline" className="text-[10px] font-normal" data-testid="badge-period">
            Δ vs prior period (per metric window)
          </Badge>
          <span>Click any cell to open the detail page for that tenant.</span>
        </div>
      )}
    </Shell>
  );
}
