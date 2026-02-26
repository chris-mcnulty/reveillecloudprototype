import { Shell } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BellRing, CheckCircle2, AlertOctagon } from "lucide-react";

const alerts = [
  { id: 1, title: "High Page Load Latency", description: "Average page load time exceeded 3s for Hub.", site: "Hub", severity: "High", time: "10 mins ago", status: "Active" },
  { id: 2, title: "Authentication Failures", description: "Multiple synthetic auth tests failed.", site: "HR Portal", severity: "Medium", time: "1 hour ago", status: "Active" },
  { id: 3, title: "Search API Throttling", description: "SharePoint search API returned 429 Too Many Requests.", site: "IT Support", severity: "Low", time: "3 hours ago", status: "Resolved" },
];

export default function Alerts() {
  return (
    <Shell>
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Alerts & Incidents</h2>
          <p className="text-muted-foreground">
            Manage active alerts and configure notification rules for this tenant.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline">
            Configure Rules
          </Button>
        </div>
      </div>

      <div className="grid gap-4 mt-4">
        {alerts.map((alert) => (
          <Card key={alert.id} className={alert.status === 'Active' ? 'border-l-4 border-l-destructive' : 'border-l-4 border-l-emerald-500 opacity-75'}>
            <CardHeader className="pb-2 flex flex-row items-start justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  {alert.status === 'Active' ? <AlertOctagon className="h-5 w-5 text-destructive" /> : <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
                  {alert.title}
                </CardTitle>
                <CardDescription className="mt-1">{alert.site} • {alert.time}</CardDescription>
              </div>
              <div className="flex gap-2">
                <Badge variant={alert.severity === 'High' ? 'destructive' : 'secondary'}>
                  {alert.severity} Severity
                </Badge>
                {alert.status === 'Active' && (
                  <Button size="sm" variant="outline">Acknowledge</Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{alert.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </Shell>
  );
}