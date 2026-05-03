import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useLocation } from "wouter";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useActiveTenant } from "@/lib/tenant-context";
import { ArrowDown, ArrowUp, Bookmark, Columns3, Copy, FileDown, Link2, Loader2, Minus, Save, Trash2 } from "lucide-react";

interface BenchmarkingView {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  windowKey: string;
  visibleColumns: string[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

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

function getViewSlugFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("view");
}

export default function Benchmarking() {
  const { isMsp, organization, activeOrgId, setActiveTenantId, isLoading: orgLoading } = useActiveTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [windowSel, setWindowSel] = useState<string>("7d");
  const [isExporting, setIsExporting] = useState(false);
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

  const [activeViewSlug, setActiveViewSlug] = useState<string | null>(() => getViewSlugFromUrl());
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [savingView, setSavingView] = useState(false);

  useEffect(() => {
    localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify(Array.from(visibleCols)));
  }, [visibleCols]);

  const orgIdToUse = activeOrgId || organization?.id || null;

  const viewsQuery = useQuery<BenchmarkingView[]>({
    queryKey: ["/api/benchmarking/views", orgIdToUse],
    queryFn: async () => {
      const res = await fetch(`/api/benchmarking/views?orgId=${orgIdToUse}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: isMsp && !orgLoading && !!orgIdToUse,
  });

  const views = viewsQuery.data ?? [];
  const activeView = useMemo(
    () => (activeViewSlug ? views.find((v) => v.slug === activeViewSlug) ?? null : null),
    [views, activeViewSlug],
  );

  useEffect(() => {
    if (activeView) {
      setWindowSel(activeView.windowKey);
      setVisibleCols(new Set(activeView.visibleColumns));
    }
  }, [activeView]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const current = params.get("view");
    if (activeViewSlug) {
      if (current !== activeViewSlug) {
        params.set("view", activeViewSlug);
        window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
      }
    } else if (current) {
      params.delete("view");
      const qs = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    }
  }, [activeViewSlug]);

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

  const exportPdf = async () => {
    if (!orgIdToUse || !data) return;
    setIsExporting(true);
    try {
      const cols = visibleMetrics.map(m => m.key).join(",");
      const url = `/api/benchmarking/export.pdf?orgId=${encodeURIComponent(orgIdToUse)}&window=${encodeURIComponent(windowSel)}&cols=${encodeURIComponent(cols)}`;
      const res = await fetch(url);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      const orgSlug = (data.orgName || "benchmark").replace(/[^a-z0-9]+/gi, "_");
      a.download = `benchmarking_${orgSlug}_${windowSel}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
      toast({ title: "PDF exported", description: `Branded benchmark PDF downloaded for ${data.orgName}.` });
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Could not generate PDF",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const toggleCol = (key: string) => {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      if (next.size === 0) next.add(key);
      return next;
    });
    setActiveViewSlug(null);
  };

  const handleWindowChange = (value: string) => {
    setWindowSel(value);
    setActiveViewSlug(null);
  };

  const handleSelectView = (slug: string) => {
    setActiveViewSlug(slug);
  };

  const handleClearView = () => {
    setActiveViewSlug(null);
  };

  const handleSaveView = async () => {
    const name = newViewName.trim();
    if (!name || !orgIdToUse) return;
    setSavingView(true);
    try {
      const res = await fetch("/api/benchmarking/views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId: orgIdToUse,
          name,
          windowKey: windowSel,
          visibleColumns: Array.from(visibleCols),
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `HTTP ${res.status}`);
      }
      const created = (await res.json()) as BenchmarkingView;
      await queryClient.invalidateQueries({ queryKey: ["/api/benchmarking/views", orgIdToUse] });
      setActiveViewSlug(created.slug);
      setSaveDialogOpen(false);
      setNewViewName("");
      toast({ title: "View saved", description: `"${created.name}" is now available to your team.` });
    } catch (err: any) {
      toast({ title: "Could not save view", description: err.message, variant: "destructive" });
    } finally {
      setSavingView(false);
    }
  };

  const handleDeleteView = async (view: BenchmarkingView) => {
    if (!confirm(`Delete view "${view.name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/benchmarking/views/${view.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(await res.text());
      if (activeViewSlug === view.slug) setActiveViewSlug(null);
      await queryClient.invalidateQueries({ queryKey: ["/api/benchmarking/views", orgIdToUse] });
      toast({ title: "View deleted", description: `"${view.name}" was removed.` });
    } catch (err: any) {
      toast({ title: "Could not delete view", description: err.message, variant: "destructive" });
    }
  };

  const handleCopyShareLink = () => {
    if (!activeViewSlug || typeof window === "undefined") return;
    const url = `${window.location.origin}${window.location.pathname}?view=${encodeURIComponent(activeViewSlug)}`;
    navigator.clipboard.writeText(url).then(
      () => toast({ title: "Link copied", description: url }),
      () => toast({ title: "Copy failed", description: "Clipboard access denied", variant: "destructive" }),
    );
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" data-testid="button-views">
                <Bookmark className="h-4 w-4 mr-1.5" />
                {activeView ? activeView.name : "Views"}
                {views.length > 0 && !activeView && <span className="ml-1 text-muted-foreground">({views.length})</span>}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Saved views</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {views.length === 0 && (
                <div className="px-2 py-1.5 text-xs text-muted-foreground" data-testid="text-no-views">
                  No saved views yet. Adjust the window/columns and click Save view.
                </div>
              )}
              {views.map((v) => (
                <DropdownMenuItem
                  key={v.id}
                  onSelect={(e) => {
                    e.preventDefault();
                    handleSelectView(v.slug);
                  }}
                  className="flex items-center justify-between gap-2"
                  data-testid={`view-${v.slug}`}
                >
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="text-sm truncate">{v.name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {v.windowKey.toUpperCase()} · {v.visibleColumns.length} cols
                    </span>
                  </div>
                  <button
                    type="button"
                    className="opacity-60 hover:opacity-100 hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteView(v);
                    }}
                    data-testid={`delete-view-${v.slug}`}
                    aria-label={`Delete ${v.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuItem>
              ))}
              {activeView && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => handleClearView()} data-testid="clear-view">
                    Clear active view
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSaveDialogOpen(true)}
            data-testid="button-save-view"
            disabled={!orgIdToUse}
          >
            <Save className="h-4 w-4 mr-1.5" /> Save view
          </Button>
          {activeView && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyShareLink}
              data-testid="button-share-view"
            >
              <Link2 className="h-4 w-4 mr-1.5" /> Share link
            </Button>
          )}
          <Select value={windowSel} onValueChange={handleWindowChange}>
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
          <Button variant="outline" size="sm" onClick={exportPdf} data-testid="button-export-pdf" disabled={!data || tenants.length === 0 || isExporting}>
            {isExporting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileDown className="h-4 w-4 mr-1.5" />}
            {isExporting ? "Exporting…" : "Export PDF"}
          </Button>
        </div>
      </div>

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent data-testid="dialog-save-view">
          <DialogHeader>
            <DialogTitle>Save benchmarking view</DialogTitle>
            <DialogDescription>
              Capture the current window and visible columns as a named view your whole team can open by URL.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="view-name">Name</Label>
            <Input
              id="view-name"
              data-testid="input-view-name"
              placeholder="e.g. Security review"
              value={newViewName}
              onChange={(e) => setNewViewName(e.target.value)}
              maxLength={80}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newViewName.trim() && !savingView) {
                  e.preventDefault();
                  handleSaveView();
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              Window: <span className="font-medium">{windowSel.toUpperCase()}</span> · Columns:{" "}
              <span className="font-medium">{visibleCols.size}/{METRIC_CONFIG.length}</span>
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)} disabled={savingView}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveView}
              disabled={!newViewName.trim() || savingView}
              data-testid="button-confirm-save-view"
            >
              {savingView ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              Save view
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
