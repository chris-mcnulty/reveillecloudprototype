import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend
} from "recharts";

const syntheticTestData = [
  { time: "10:00", "Page Load": 450, "File Upload": 1200, "Search": 800 },
  { time: "10:15", "Page Load": 420, "File Upload": 1150, "Search": 750 },
  { time: "10:30", "Page Load": 600, "File Upload": 1800, "Search": 1200 },
  { time: "10:45", "Page Load": 550, "File Upload": 1600, "Search": 950 },
  { time: "11:00", "Page Load": 480, "File Upload": 1250, "Search": 820 },
  { time: "11:15", "Page Load": 460, "File Upload": 1220, "Search": 790 },
];

export default function Performance() {
  return (
    <Shell>
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Performance Explorer</h2>
          <p className="text-muted-foreground">
            Deep dive into synthetic transaction metrics for this tenant.
          </p>
        </div>
      </div>

      <Tabs defaultValue="synthetic" className="space-y-4 mt-4">
        <TabsList>
          <TabsTrigger value="synthetic">Synthetic Tests</TabsTrigger>
          <TabsTrigger value="graph">Graph API Latency</TabsTrigger>
          <TabsTrigger value="network">Network Phases</TabsTrigger>
        </TabsList>
        <TabsContent value="synthetic" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Synthetic Transaction Latency</CardTitle>
              <CardDescription>
                Compare different test types (Page Load vs File Transfer vs Search)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={syntheticTestData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="time" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}ms`} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="Page Load" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="File Upload" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="Search" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="graph">
           <Card>
            <CardHeader>
              <CardTitle>Graph API Telemetry</CardTitle>
              <CardDescription>
                Passive telemetry tracking Microsoft Graph API endpoint response times
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                Select specific endpoints to view telemetry data.
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </Shell>
  );
}