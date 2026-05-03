import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useLlmSpendByTenant } from "@/lib/api";

const PALETTE = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#14b8a6"];

export function MspLlmSpendTile({ orgId }: { orgId: string }) {
  const { data, isLoading } = useLlmSpendByTenant(orgId);
  if (isLoading || !data || data.length === 0) return null;

  const modelNames = Array.from(new Set(data.flatMap((t) => t.byModel.map((m) => m.modelName)))).slice(0, 8);
  const chartData = data.map((t) => {
    const row: Record<string, any> = { tenant: t.tenantName, _total: t.totalCents / 100 };
    for (const m of modelNames) {
      const found = t.byModel.find((x) => x.modelName === m);
      row[m] = found ? found.costCents / 100 : 0;
    }
    return row;
  });

  const totalCents = data.reduce((s, t) => s + t.totalCents, 0);

  return (
    <Card className="mb-6" data-testid="card-msp-llm-spend">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-emerald-500" />
            LLM Spend by Tenant (MTD)
          </CardTitle>
          <CardDescription>Month-to-date AI usage cost across customer environments.</CardDescription>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Total MTD</p>
          <p data-testid="text-msp-llm-total" className="text-2xl font-bold">${(totalCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="tenant" stroke="#888" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
              <Tooltip formatter={(v: any, name: string) => [`$${Number(v).toFixed(2)}`, name]} contentStyle={{ backgroundColor: "hsl(var(--background))", borderColor: "hsl(var(--border))", borderRadius: 8 }} />
              {modelNames.map((m, i) => (
                <Bar key={m} dataKey={m} stackId="spend" fill={PALETTE[i % PALETTE.length]}>
                  {chartData.map((_, j) => <Cell key={j} />)}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
