import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Line, LineChart } from "recharts";
import { Download, DollarSign } from "lucide-react";
import { useLlmSpendExplorer } from "@/lib/api";

type SliceBy = "model" | "agent" | "time" | "surface";

function fmtUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function LlmCostExplorer({ tenantId }: { tenantId: string }) {
  const [sliceBy, setSliceBy] = useState<SliceBy>("model");
  const [windowDays, setWindowDays] = useState<number>(30);
  const { data, isLoading } = useLlmSpendExplorer(tenantId, sliceBy, windowDays * 24);

  const breakdown = data?.breakdown || [];
  const total = breakdown.reduce((s, r) => s + r.costCents, 0);
  const totalCalls = breakdown.reduce((s, r) => s + r.calls, 0);

  function exportCsv() {
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
    const url = `/api/tenants/${tenantId}/llm-spend/explorer?sliceBy=${sliceBy}&since=${encodeURIComponent(since)}&format=csv`;
    window.open(url, "_blank");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Slice by</label>
            <Select value={sliceBy} onValueChange={(v) => setSliceBy(v as SliceBy)}>
              <SelectTrigger className="w-[180px]" data-testid="select-slice-by">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="model">Model</SelectItem>
                <SelectItem value="agent">Agent</SelectItem>
                <SelectItem value="time">Time (daily)</SelectItem>
                <SelectItem value="surface">Surface (Copilot/A2A/Foundry)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Window</label>
            <Select value={String(windowDays)} onValueChange={(v) => setWindowDays(Number(v))}>
              <SelectTrigger className="w-[140px]" data-testid="select-window-days">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} data-testid="button-export-cost-csv">
          <Download className="h-4 w-4 mr-1.5" />
          Export CSV
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card data-testid="card-cost-total">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <DollarSign className="h-4 w-4" /> Total spend
            </div>
            <div className="text-2xl font-bold mt-1">{fmtUsd(total)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-muted-foreground text-xs">Total calls</div>
            <div className="text-2xl font-bold mt-1">{totalCalls.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-muted-foreground text-xs">Avg cost / call</div>
            <div className="text-2xl font-bold mt-1">
              {totalCalls > 0 ? fmtUsd(total / totalCalls) : "—"}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Spend by {sliceBy}</CardTitle>
          <CardDescription>USD cost over the selected window.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-10 text-center">Loading…</p>
          ) : breakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">No spend recorded in this window.</p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                {sliceBy === "time" ? (
                  <LineChart data={breakdown.map((r) => ({ label: r.label, usd: r.costCents / 100 }))}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="label" className="text-xs" />
                    <YAxis className="text-xs" tickFormatter={(v) => `$${v}`} />
                    <Tooltip formatter={(v: any) => [`$${Number(v).toFixed(2)}`, "Spend"]} />
                    <Line type="monotone" dataKey="usd" stroke="#10b981" strokeWidth={2} dot={false} />
                  </LineChart>
                ) : (
                  <BarChart data={breakdown.map((r) => ({ label: r.label, usd: r.costCents / 100 }))} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis type="number" className="text-xs" tickFormatter={(v) => `$${v}`} />
                    <YAxis type="category" dataKey="label" width={140} className="text-xs" />
                    <Tooltip formatter={(v: any) => [`$${Number(v).toFixed(2)}`, "Spend"]} />
                    <Bar dataKey="usd" fill="#6366f1" />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{sliceBy === "time" ? "Date" : sliceBy.charAt(0).toUpperCase() + sliceBy.slice(1)}</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Input tokens</TableHead>
                <TableHead className="text-right">Output tokens</TableHead>
                <TableHead className="text-right">Cost / call</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {breakdown.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No data.</TableCell></TableRow>
              )}
              {breakdown.map((r) => (
                <TableRow key={r.key} data-testid={`row-cost-${r.key}`}>
                  <TableCell className="font-medium">{r.label}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtUsd(r.costCents)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.calls.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.inputTokens.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.outputTokens.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.calls > 0 ? fmtUsd(r.costCents / r.calls) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
