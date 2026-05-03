import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { DollarSign, TrendingUp } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useLlmSpendMtd } from "@/lib/api";

function fmtUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function LlmSpendWidget({ tenantId }: { tenantId: string }) {
  const { data, isLoading } = useLlmSpendMtd(tenantId);
  if (isLoading || !data) return null;
  if (data.totalCents === 0 && data.daily.length === 0) return null;

  const chartData = (data.daily || []).map((d) => ({
    date: d.date.slice(5),
    usd: d.costCents / 100,
  }));

  return (
    <Card data-testid="card-llm-spend-widget">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-emerald-500" />
            LLM Spend (MTD)
          </CardTitle>
          <CardDescription>Month-to-date AI usage cost & projection.</CardDescription>
        </div>
        <Link href="/llm">
          <Button variant="outline" size="sm" data-testid="button-view-llm-spend">View</Button>
        </Link>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Spend so far</p>
            <p data-testid="text-llm-mtd-spend" className="text-2xl font-bold">{fmtUsd(data.totalCents)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Day {data.daysElapsed} of {data.daysInMonth}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> Projected month total
            </p>
            <p data-testid="text-llm-projected" className="text-2xl font-bold">{fmtUsd(data.projectedMonthCents)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Linear extrapolation</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Top models</p>
            {data.topModels.length === 0 ? (
              <p className="text-xs text-muted-foreground">No spend recorded</p>
            ) : (
              <ul className="space-y-1">
                {data.topModels.slice(0, 3).map((m) => (
                  <li key={m.modelId} className="flex items-center justify-between text-xs" data-testid={`text-top-model-${m.modelId}`}>
                    <span className="truncate mr-2">{m.modelName}</span>
                    <span className="font-mono tabular-nums">{fmtUsd(m.costCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {chartData.length > 1 && (
          <div className="h-24 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="llmSpendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" hide />
                <YAxis hide />
                <Tooltip formatter={(v: any) => [`$${Number(v).toFixed(2)}`, "Spend"]} contentStyle={{ backgroundColor: "hsl(var(--background))", borderColor: "hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="usd" stroke="#10b981" strokeWidth={2} fill="url(#llmSpendGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
