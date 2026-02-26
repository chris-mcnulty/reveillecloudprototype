import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Clock, FileUp, Globe, TrendingDown, TrendingUp, AlertTriangle } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

const performanceData = [
  { time: "00:00", ms: 450 },
  { time: "04:00", ms: 420 },
  { time: "08:00", ms: 600 },
  { time: "12:00", ms: 850 },
  { time: "16:00", ms: 750 },
  { time: "20:00", ms: 500 },
  { time: "24:00", ms: 430 },
];

const errorData = [
  { tenant: "Acme Corp", errors: 12 },
  { tenant: "Globex", errors: 8 },
  { tenant: "Initech", errors: 45 },
  { tenant: "Soylent", errors: 3 },
  { tenant: "Umbrella", errors: 1 },
];

export default function Dashboard() {
  return (
    <Shell>
      <div className="grid gap-4 md:grid-cols-2 md:gap-8 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Global Avg Load Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">580ms</div>
            <p className="text-xs text-muted-foreground flex items-center mt-1">
              <TrendingDown className="h-3 w-3 mr-1 text-emerald-500" />
              <span className="text-emerald-500 font-medium">-40ms</span> from last hour
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Monitored Tenants</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">1,248</div>
            <p className="text-xs text-muted-foreground flex items-center mt-1">
              <TrendingUp className="h-3 w-3 mr-1 text-emerald-500" />
              <span className="text-emerald-500 font-medium">+12</span> this week
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Incidents</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">3</div>
            <p className="text-xs text-muted-foreground mt-1">
              Across 2 distinct tenants
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg File Transfer</CardTitle>
            <FileUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">1.2s</div>
            <p className="text-xs text-muted-foreground mt-1">
              400KB synthetic payload
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Global Latency Trend</CardTitle>
            <CardDescription>
              Average response time across all synthetic transactions (24h)
            </CardDescription>
          </CardHeader>
          <CardContent className="pl-0">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={performanceData}
                  margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorMs" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}ms`} />
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="ms"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorMs)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Error Spikes by Tenant</CardTitle>
            <CardDescription>
              Top 5 tenants with highest error rates in the last hour
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={errorData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="hsl(var(--border))" />
                  <XAxis type="number" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis dataKey="tenant" type="category" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip 
                    cursor={{fill: 'hsl(var(--muted))'}}
                    contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                  />
                  <Bar dataKey="errors" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} barSize={30} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Recent Synthetic Transaction Logs</CardTitle>
          <CardDescription>
            Live feed of synthetic tests executed across active tenants
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              { id: "tx-1092", tenant: "Acme Corp", type: "Page Load", status: "Success", latency: "420ms", time: "Just now" },
              { id: "tx-1091", tenant: "Initech", type: "File Upload", status: "Failed", latency: "Timeout", time: "2 min ago" },
              { id: "tx-1090", tenant: "Globex", type: "Search Query", status: "Success", latency: "1.2s", time: "5 min ago" },
              { id: "tx-1089", tenant: "Soylent", type: "Authentication", status: "Success", latency: "380ms", time: "6 min ago" },
            ].map((log) => (
              <div key={log.id} className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0">
                <div className="flex items-center gap-4">
                  <div className={`w-2 h-2 rounded-full ${log.status === 'Success' ? 'bg-emerald-500' : 'bg-destructive'}`} />
                  <div>
                    <p className="text-sm font-medium">{log.tenant} - {log.type}</p>
                    <p className="text-xs text-muted-foreground">ID: {log.id}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-medium ${log.status === 'Failed' ? 'text-destructive' : ''}`}>{log.latency}</p>
                  <p className="text-xs text-muted-foreground">{log.time}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </Shell>
  );
}