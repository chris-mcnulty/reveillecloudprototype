import { useEffect, useState } from "react";
import { Shell } from "@/components/layout/Shell";
import { SettingsNav } from "@/components/layout/SettingsNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, Mail, MessageSquare, Plus, Webhook, Activity, Loader2, RefreshCw } from "lucide-react";
import { useActiveTenant } from "@/lib/tenant-context";
import { useAnomalyStreamConfigs, useUpdateAnomalyStreamConfig, useTriggerJob, type AnomalyStreamConfigUI } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export default function AlertRulesConfig() {
  const { activeTenantId } = useActiveTenant();
  const { data: configs, isLoading } = useAnomalyStreamConfigs(activeTenantId);
  const updateMutation = useUpdateAnomalyStreamConfig();
  const triggerMutation = useTriggerJob();
  const { toast } = useToast();

  const handleTriggerNow = () => {
    triggerMutation.mutate("anomalyDetection", {
      onSuccess: () => toast({ title: "Anomaly detection triggered", description: "Sweep started in the background." }),
      onError: (e: any) => toast({ title: "Failed to trigger", description: e?.message || "Unknown error", variant: "destructive" }),
    });
  };

  return (
    <Shell>
      <div className="flex items-center justify-between space-y-2 mb-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Tenant Configuration</h2>
          <p className="text-muted-foreground">
            Manage Azure AD integration, synthetic tests, and alert rules.
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> Create Rule
        </Button>
      </div>

      <SettingsNav />

      <Card className="mb-6" data-testid="card-anomaly-settings">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-amber-500" />
              Anomaly Detection Sensitivity
            </CardTitle>
            <CardDescription>
              Per-stream z-score thresholds vs the 7-day rolling baseline. Lower = more sensitive (more alerts), higher = less sensitive.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleTriggerNow}
            disabled={triggerMutation.isPending || !activeTenantId}
            data-testid="button-trigger-anomaly"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${triggerMutation.isPending ? "animate-spin" : ""}`} />
            Run sweep now
          </Button>
        </CardHeader>
        <CardContent>
          {!activeTenantId ? (
            <p className="text-sm text-muted-foreground">Select a tenant to configure anomaly detection.</p>
          ) : isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading streams…
            </div>
          ) : (
            <div className="space-y-1">
              {(configs || []).map((cfg) => (
                <StreamConfigRow
                  key={cfg.key}
                  tenantId={activeTenantId}
                  config={cfg}
                  isPending={updateMutation.isPending}
                  onSave={(sensitivity, enabled) =>
                    updateMutation.mutate({ tenantId: activeTenantId, streamKey: cfg.key, sensitivity, enabled }, {
                      onSuccess: () => toast({ title: `${cfg.label} updated`, description: `Sensitivity z=${sensitivity}, ${enabled ? "enabled" : "disabled"}` }),
                      onError: (e: any) => toast({ title: "Save failed", description: e?.message || "Unknown error", variant: "destructive" }),
                    })
                  }
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Page Load SLA Breach</CardTitle>
              <CardDescription>Triggers when average page load time exceeds 3000ms</CardDescription>
            </div>
            <Switch defaultChecked />
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3 bg-muted/30 p-4 rounded-lg border">
              <div className="space-y-2">
                <Label>Metric</Label>
                <Select defaultValue="page_load">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="page_load">Page Load Time (ms)</SelectItem>
                    <SelectItem value="file_upload">File Upload Time (ms)</SelectItem>
                    <SelectItem value="error_rate">Error Rate (%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Condition</Label>
                <Select defaultValue="gt">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gt">Greater Than (&gt;)</SelectItem>
                    <SelectItem value="lt">Less Than (&lt;)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Threshold Value</Label>
                <Input type="number" defaultValue="3000" />
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium mb-3">Notification Channels</h4>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="flex items-start space-x-3 border p-3 rounded-lg">
                  <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Email</Label>
                    <p className="text-xs text-muted-foreground">admin@acmecorp.com</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3 border border-primary/50 bg-primary/5 p-3 rounded-lg">
                  <MessageSquare className="h-5 w-5 text-primary mt-0.5" />
                  <div className="space-y-1">
                    <Label className="text-sm font-medium text-primary">MS Teams</Label>
                    <p className="text-xs text-muted-foreground">#it-ops-alerts</p>
                  </div>
                </div>
                <div className="flex items-center justify-center border border-dashed p-3 rounded-lg text-muted-foreground hover:bg-muted/50 cursor-pointer transition-colors">
                  <Plus className="h-4 w-4 mr-2" /> Add Channel
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="bg-muted/10 border-t p-4 flex justify-end">
            <Button variant="outline" className="mr-2">Edit</Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between opacity-75">
            <div>
              <CardTitle>Authentication Failure Spike</CardTitle>
              <CardDescription>Triggers when auth failure rate exceeds 5% in 15 mins</CardDescription>
            </div>
            <Switch />
          </CardHeader>
          <CardContent className="opacity-75">
            <div className="text-sm text-muted-foreground">
              Rule is currently disabled. Notifications are paused.
            </div>
          </CardContent>
        </Card>
      </div>
    </Shell>
  );
}

function StreamConfigRow({ tenantId, config, isPending, onSave }: {
  tenantId: string;
  config: AnomalyStreamConfigUI;
  isPending: boolean;
  onSave: (sensitivity: number, enabled: boolean) => void;
}) {
  const [sensitivity, setSensitivity] = useState<number>(config.sensitivity);
  const [enabled, setEnabled] = useState<boolean>(config.enabled);

  useEffect(() => {
    setSensitivity(config.sensitivity);
    setEnabled(config.enabled);
  }, [config.sensitivity, config.enabled]);

  const dirty = sensitivity !== config.sensitivity || enabled !== config.enabled;
  const sensitivityLabel = sensitivity <= 2 ? "Very sensitive" : sensitivity <= 3 ? "Balanced" : sensitivity <= 4 ? "Conservative" : "Very conservative";

  return (
    <div className="flex flex-col gap-2 py-3 border-b last:border-0" data-testid={`row-stream-${config.key}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            data-testid={`switch-stream-${config.key}`}
          />
          <div>
            <p className="font-medium text-sm" data-testid={`text-stream-label-${config.key}`}>{config.label}</p>
            <p className="text-xs text-muted-foreground">{config.key} · unit: {config.unit || "n/a"}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" data-testid={`badge-sensitivity-${config.key}`}>z ≥ {sensitivity}</Badge>
          <span className="text-xs text-muted-foreground w-32 text-right">{sensitivityLabel}</span>
          <Button
            size="sm"
            variant={dirty ? "default" : "outline"}
            disabled={!dirty || isPending}
            onClick={() => onSave(sensitivity, enabled)}
            data-testid={`button-save-${config.key}`}
          >
            Save
          </Button>
        </div>
      </div>
      <div className="px-12 pr-32">
        <Slider
          value={[sensitivity]}
          min={1}
          max={6}
          step={0.5}
          onValueChange={(v) => setSensitivity(v[0])}
          disabled={!enabled}
          data-testid={`slider-sensitivity-${config.key}`}
        />
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>1 (more alerts)</span>
          <span>3 (default)</span>
          <span>6 (fewer alerts)</span>
        </div>
      </div>
    </div>
  );
}
