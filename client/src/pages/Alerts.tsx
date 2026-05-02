import { Shell } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BellRing, CheckCircle2, AlertOctagon, Loader2 } from "lucide-react";
import { useAlerts, useAcknowledgeAlert } from "@/lib/api";
import { useLiveStream, type LiveEvent } from "@/lib/liveStream";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useActiveTenant } from "@/lib/tenant-context";
import { Link } from "wouter";
import type { Alert as AlertType } from "@shared/schema";

export default function Alerts() {
  const { activeTenantId, activeOrgId, organization } = useActiveTenant();
  const orgId = organization?.id ?? activeOrgId;
  const { data: alertList, isLoading } = useAlerts(activeTenantId ?? undefined);
  const ackMutation = useAcknowledgeAlert();
  const queryClient = useQueryClient();

  const handleLive = useCallback((event: LiveEvent) => {
    if (event.type !== "alert.created") return;
    const alert = event.data as AlertType;
    if (!alert?.id) return;
    if (activeTenantId && alert.tenantId !== activeTenantId) return;
    queryClient.setQueriesData<AlertType[] | undefined>({ queryKey: ["/api/alerts", activeTenantId ?? undefined] }, (prev) => {
      if (!prev) return prev;
      if (prev.find((a) => a.id === alert.id)) return prev;
      return [alert, ...prev];
    });
  }, [queryClient, activeTenantId]);
  useLiveStream(orgId, [activeTenantId], ["alert.created"], handleLive);

  if (isLoading) {
    return (
      <Shell>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Shell>
    );
  }

  const alerts = alertList || [];

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
          <Link href="/settings/alerts">
            <Button variant="outline" data-testid="button-configure-rules">Configure Rules</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 mt-4">
        {alerts.map((alert) => {
          const isActive = !alert.acknowledged;
          const severityMap: Record<string, string> = { critical: "High", warning: "Medium", info: "Low" };
          const severity = severityMap[alert.severity] || alert.severity;
          const d = new Date(alert.timestamp!);
          const diff = Date.now() - d.getTime();
          const mins = Math.round(diff / 60000);
          const timeStr = mins < 1 ? "Just now" : mins < 60 ? `${mins} min ago` : `${Math.round(mins / 60)}h ago`;

          return (
            <Card key={alert.id} data-testid={`card-alert-${alert.id}`} className={isActive ? 'border-l-4 border-l-destructive' : 'border-l-4 border-l-emerald-500 opacity-75'}>
              <CardHeader className="pb-2 flex flex-row items-start justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    {isActive ? <AlertOctagon className="h-5 w-5 text-destructive" /> : <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
                    {alert.title}
                  </CardTitle>
                  <CardDescription className="mt-1">{timeStr}</CardDescription>
                </div>
                <div className="flex gap-2">
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
              </CardContent>
            </Card>
          );
        })}
        {alerts.length === 0 && (
          <Card>
            <CardContent className="flex items-center justify-center py-8 text-muted-foreground">
              No alerts recorded.
            </CardContent>
          </Card>
        )}
      </div>
    </Shell>
  );
}
