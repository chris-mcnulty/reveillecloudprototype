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
import { AlertCircle, Mail, MessageSquare, Plus, Webhook, Activity, Loader2, RefreshCw, DollarSign, Trash2, Pencil, Gauge } from "lucide-react";
import { useActiveTenant } from "@/lib/tenant-context";
import { useAnomalyStreamConfigs, useUpdateAnomalyStreamConfig, useTriggerJob, useAlertRules, useCreateAlertRule, useUpdateAlertRule, useDeleteAlertRule, useLlmModels, useAnomalyNotificationSettings, useUpdateAnomalyNotificationSettings, type AnomalyStreamConfigUI } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import type { AlertRule } from "@shared/schema";

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

      {activeTenantId && <AnomalyNotificationsSection key={activeTenantId} tenantId={activeTenantId} />}

      {activeTenantId && <LlmBudgetRulesSection tenantId={activeTenantId} />}

      {activeTenantId && <FoundryThrottleRulesSection tenantId={activeTenantId} />}

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

const SEVERITY_OPTIONS: Array<{ value: "info" | "warning" | "critical"; label: string }> = [
  { value: "info", label: "Info" },
  { value: "warning", label: "Warning" },
  { value: "critical", label: "Critical" },
];

function AnomalyNotificationsSection({ tenantId }: { tenantId: string }) {
  const { data: settings, isLoading } = useAnomalyNotificationSettings(tenantId);
  const saveMut = useUpdateAnomalyNotificationSettings();
  const { toast } = useToast();

  const [emailEnabled, setEmailEnabled] = useState(false);
  const [emailRecipients, setEmailRecipients] = useState<string>("");
  const [emailSeverities, setEmailSeverities] = useState<string[]>(["critical"]);
  const [teamsEnabled, setTeamsEnabled] = useState(false);
  const [teamsWebhookUrl, setTeamsWebhookUrl] = useState<string>("");
  const [teamsSeverities, setTeamsSeverities] = useState<string[]>(["warning", "critical"]);
  useEffect(() => {
    if (!settings) return;
    setEmailEnabled(settings.emailEnabled);
    setEmailRecipients((settings.emailRecipients || []).join(", "));
    setEmailSeverities(settings.emailSeverities || ["critical"]);
    setTeamsEnabled(settings.teamsEnabled);
    setTeamsWebhookUrl(settings.teamsWebhookUrl || "");
    setTeamsSeverities(settings.teamsSeverities || ["warning", "critical"]);
  }, [settings, tenantId]);

  function toggleSev(list: string[], setList: (v: string[]) => void, sev: string) {
    setList(list.includes(sev) ? list.filter(s => s !== sev) : [...list, sev]);
  }

  function handleSave() {
    const recipients = emailRecipients.split(",").map(s => s.trim()).filter(Boolean);
    const invalid = recipients.filter(r => !r.includes("@"));
    if (emailEnabled && recipients.length === 0) {
      toast({ title: "At least one email recipient required", variant: "destructive" });
      return;
    }
    if (invalid.length > 0) {
      toast({ title: "Invalid email", description: invalid.join(", "), variant: "destructive" });
      return;
    }
    if (teamsEnabled && !teamsWebhookUrl.trim()) {
      toast({ title: "Teams webhook URL required", variant: "destructive" });
      return;
    }
    saveMut.mutate(
      {
        tenantId,
        emailEnabled,
        emailRecipients: recipients,
        emailSeverities,
        teamsEnabled,
        teamsWebhookUrl: teamsWebhookUrl.trim() || null,
        teamsSeverities,
      },
      {
        onSuccess: () => toast({ title: "Notification settings saved" }),
        onError: (e: any) => toast({ title: "Save failed", description: e?.message || "Unknown error", variant: "destructive" }),
      },
    );
  }

  return (
    <Card className="mb-6" data-testid="card-anomaly-notifications">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-blue-500" />
          Anomaly Alert Notifications
        </CardTitle>
        <CardDescription>
          Choose which severities deliver to email and Microsoft Teams when an anomaly fires. Re-fires (after 4h) are clearly labeled as &ldquo;Anomaly still active&rdquo;.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">Email</Label>
                </div>
                <Switch checked={emailEnabled} onCheckedChange={setEmailEnabled} data-testid="switch-anomaly-email" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="anomaly-email-recipients" className="text-xs">Recipients (comma-separated)</Label>
                <Input
                  id="anomaly-email-recipients"
                  placeholder="ops@acme.com, oncall@acme.com"
                  value={emailRecipients}
                  onChange={(e) => setEmailRecipients(e.target.value)}
                  disabled={!emailEnabled}
                  data-testid="input-anomaly-email-recipients"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Deliver these severities</Label>
                <div className="flex gap-2">
                  {SEVERITY_OPTIONS.map(opt => (
                    <Button
                      key={opt.value}
                      type="button"
                      size="sm"
                      variant={emailSeverities.includes(opt.value) ? "default" : "outline"}
                      onClick={() => toggleSev(emailSeverities, setEmailSeverities, opt.value)}
                      disabled={!emailEnabled}
                      data-testid={`button-anomaly-email-sev-${opt.value}`}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">Microsoft Teams</Label>
                </div>
                <Switch checked={teamsEnabled} onCheckedChange={setTeamsEnabled} data-testid="switch-anomaly-teams" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="anomaly-teams-webhook" className="text-xs">Incoming webhook URL</Label>
                <Input
                  id="anomaly-teams-webhook"
                  placeholder="https://<tenant>.webhook.office.com/..."
                  value={teamsWebhookUrl}
                  onChange={(e) => setTeamsWebhookUrl(e.target.value)}
                  disabled={!teamsEnabled}
                  data-testid="input-anomaly-teams-webhook"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Deliver these severities</Label>
                <div className="flex gap-2">
                  {SEVERITY_OPTIONS.map(opt => (
                    <Button
                      key={opt.value}
                      type="button"
                      size="sm"
                      variant={teamsSeverities.includes(opt.value) ? "default" : "outline"}
                      onClick={() => toggleSev(teamsSeverities, setTeamsSeverities, opt.value)}
                      disabled={!teamsEnabled}
                      data-testid={`button-anomaly-teams-sev-${opt.value}`}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saveMut.isPending} data-testid="button-save-anomaly-notifications">
                {saveMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Save notification settings
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function LlmBudgetRulesSection({ tenantId }: { tenantId: string }) {
  const { data: rules } = useAlertRules(tenantId);
  const { data: models } = useLlmModels(tenantId);
  const createMut = useCreateAlertRule();
  const updateMut = useUpdateAlertRule();
  const deleteMut = useDeleteAlertRule();
  const triggerMut = useTriggerJob();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [budget, setBudget] = useState<string>("500");
  const [thresholds, setThresholds] = useState<string>("50,80,100");
  const [modelId, setModelId] = useState<string>("__all__");
  const [channels, setChannels] = useState<string>("");

  const budgetRules = (rules || []).filter((r) => r.alertType === "llm_budget");

  function parseChannels(input: string): { type: string; target: string }[] {
    return input
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((entry) => {
        const idx = entry.indexOf(":");
        if (idx <= 0) return { type: "email", target: entry };
        return { type: entry.slice(0, idx).trim(), target: entry.slice(idx + 1).trim() };
      })
      .filter((c) => c.target.length > 0);
  }

  function submit() {
    const trimmed = name.trim();
    const budgetUsd = parseFloat(budget);
    if (!trimmed) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) {
      toast({ title: "Budget must be > 0", variant: "destructive" });
      return;
    }
    const parsedThresholds = thresholds
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0 && n <= 200);
    if (parsedThresholds.length === 0) {
      toast({ title: "At least one threshold percent required", variant: "destructive" });
      return;
    }
    const now = new Date();
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    createMut.mutate(
      {
        tenantId,
        name: trimmed,
        metric: "llm_budget_spend",
        condition: "gt",
        threshold: 0,
        enabled: true,
        alertType: "llm_budget",
        budgetCents: Math.round(budgetUsd * 100),
        thresholdPercents: parsedThresholds,
        modelId: modelId === "__all__" ? null : modelId,
        periodStart,
        lastTriggeredThresholds: {},
        channels: parseChannels(channels),
      },
      {
        onSuccess: () => {
          toast({ title: "Budget rule created", description: `${trimmed} · $${budgetUsd}/mo` });
          setName("");
          setBudget("500");
          setThresholds("50,80,100");
          setModelId("__all__");
          setChannels("");
        },
        onError: (e: any) => toast({ title: "Create failed", description: e?.message, variant: "destructive" }),
      },
    );
  }

  return (
    <Card className="mb-6" data-testid="card-llm-budget-rules">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-500" />
            LLM Budget Rules
          </CardTitle>
          <CardDescription>
            Monthly USD spend caps with threshold alerts (e.g. 50%, 80%, 100%, overage). Evaluated hourly.
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            triggerMut.mutate("llmBudgetEval", {
              onSuccess: () => toast({ title: "Budget evaluation triggered" }),
              onError: (e: any) => toast({ title: "Trigger failed", description: e?.message, variant: "destructive" }),
            })
          }
          disabled={triggerMut.isPending}
          data-testid="button-trigger-llm-budget"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${triggerMut.isPending ? "animate-spin" : ""}`} />
          Evaluate now
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4 bg-muted/30 p-4 rounded-lg border">
          <div className="space-y-2">
            <Label htmlFor="budget-name">Rule name</Label>
            <Input
              id="budget-name"
              placeholder="Monthly LLM cap"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="input-budget-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="budget-amount">Budget (USD/mo)</Label>
            <Input
              id="budget-amount"
              type="number"
              min="1"
              step="1"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              data-testid="input-budget-amount"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="budget-thresholds">Thresholds (% of budget)</Label>
            <Input
              id="budget-thresholds"
              placeholder="50, 80, 100"
              value={thresholds}
              onChange={(e) => setThresholds(e.target.value)}
              data-testid="input-budget-thresholds"
            />
            <p className="text-xs text-muted-foreground">Use values &gt; 100 for overage alerts (e.g. 120).</p>
          </div>
          <div className="space-y-2">
            <Label>Scope</Label>
            <Select value={modelId} onValueChange={setModelId}>
              <SelectTrigger data-testid="select-budget-model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All models</SelectItem>
                {(models || []).map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.displayName || m.modelName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-4">
            <Label htmlFor="budget-channels">Notify channels</Label>
            <Input
              id="budget-channels"
              placeholder="email:ops@acme.com, teams:https://acme.webhook.office.com/..., webhook:https://..."
              value={channels}
              onChange={(e) => setChannels(e.target.value)}
              data-testid="input-budget-channels"
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated <code>type:target</code> pairs. <code>email</code> = address;{" "}
              <code>teams</code> = incoming webhook URL (https://*.webhook.office.com/...);{" "}
              <code>webhook</code> = HTTPS URL. Empty = in-app only.
            </p>
          </div>
          <div className="md:col-span-4 flex justify-end">
            <Button onClick={submit} disabled={createMut.isPending} data-testid="button-create-budget-rule">
              {createMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Add budget rule
            </Button>
          </div>
        </div>

        {budgetRules.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center" data-testid="text-no-budget-rules">
            No budget rules yet. Create one above to receive spend alerts.
          </p>
        ) : (
          <div className="space-y-2">
            {budgetRules.map((rule) => (
              <BudgetRuleRow
                key={rule.id}
                rule={rule}
                models={models || []}
                onToggle={(enabled) =>
                  updateMut.mutate(
                    { id: rule.id, enabled },
                    {
                      onSuccess: () => toast({ title: enabled ? "Rule enabled" : "Rule disabled" }),
                      onError: (e: any) => toast({ title: "Update failed", description: e?.message, variant: "destructive" }),
                    },
                  )
                }
                onSave={(patch) =>
                  updateMut.mutate(
                    { id: rule.id, ...patch },
                    {
                      onSuccess: () => toast({ title: "Rule updated" }),
                      onError: (e: any) => toast({ title: "Update failed", description: e?.message, variant: "destructive" }),
                    },
                  )
                }
                onDelete={() =>
                  deleteMut.mutate(rule.id, {
                    onSuccess: () => toast({ title: "Rule deleted" }),
                    onError: (e: any) => toast({ title: "Delete failed", description: e?.message, variant: "destructive" }),
                  })
                }
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BudgetRuleRow({
  rule,
  models,
  onToggle,
  onSave,
  onDelete,
}: {
  rule: AlertRule;
  models: { id: string; modelName: string; displayName: string | null }[];
  onToggle: (enabled: boolean) => void;
  onSave: (patch: { name?: string; budgetCents?: number; thresholdPercents?: number[]; modelId?: string | null; channels?: { type: string; target: string }[] }) => void;
  onDelete: () => void;
}) {
  const model = rule.modelId ? models.find((m) => m.id === rule.modelId) : null;
  const budgetUsd = ((rule.budgetCents ?? 0) / 100).toFixed(2);
  const thresholds = (rule.thresholdPercents ?? []).join(", ") || "—";
  const channelSummary = (rule.channels ?? []).map((c) => `${c.type}:${c.target}`).join(", ");

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(rule.name);
  const [editBudget, setEditBudget] = useState<string>(budgetUsd);
  const [editThresholds, setEditThresholds] = useState<string>((rule.thresholdPercents ?? []).join(","));
  const [editModelId, setEditModelId] = useState<string>(rule.modelId ?? "__all__");
  const [editChannels, setEditChannels] = useState<string>(channelSummary);

  function saveEdits() {
    const budgetUsdNum = parseFloat(editBudget);
    if (!editName.trim() || !Number.isFinite(budgetUsdNum) || budgetUsdNum <= 0) return;
    const parsedThresholds = editThresholds
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0 && n <= 200);
    if (parsedThresholds.length === 0) return;
    const parsedChannels = editChannels
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((entry) => {
        const idx = entry.indexOf(":");
        if (idx <= 0) return { type: "email", target: entry };
        return { type: entry.slice(0, idx).trim(), target: entry.slice(idx + 1).trim() };
      })
      .filter((c) => c.target.length > 0);
    onSave({
      name: editName.trim(),
      budgetCents: Math.round(budgetUsdNum * 100),
      thresholdPercents: parsedThresholds,
      modelId: editModelId === "__all__" ? null : editModelId,
      channels: parsedChannels,
    });
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="grid gap-3 md:grid-cols-5 py-3 border-b last:border-0 bg-muted/20 px-3 rounded" data-testid={`row-budget-rule-edit-${rule.id}`}>
        <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Name" data-testid={`input-edit-budget-name-${rule.id}`} />
        <Input type="number" min="1" step="1" value={editBudget} onChange={(e) => setEditBudget(e.target.value)} placeholder="USD/mo" data-testid={`input-edit-budget-amount-${rule.id}`} />
        <Input value={editThresholds} onChange={(e) => setEditThresholds(e.target.value)} placeholder="50,80,100" data-testid={`input-edit-budget-thresholds-${rule.id}`} />
        <Select value={editModelId} onValueChange={setEditModelId}>
          <SelectTrigger data-testid={`select-edit-budget-model-${rule.id}`}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All models</SelectItem>
            {models.map((m) => (
              <SelectItem key={m.id} value={m.id}>{m.displayName || m.modelName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input value={editChannels} onChange={(e) => setEditChannels(e.target.value)} placeholder="email:..., teams:..." data-testid={`input-edit-budget-channels-${rule.id}`} />
        <div className="md:col-span-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)} data-testid={`button-cancel-edit-budget-${rule.id}`}>Cancel</Button>
          <Button size="sm" onClick={saveEdits} data-testid={`button-save-edit-budget-${rule.id}`}>Save</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between py-3 border-b last:border-0" data-testid={`row-budget-rule-${rule.id}`}>
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Switch checked={rule.enabled} onCheckedChange={onToggle} data-testid={`switch-budget-${rule.id}`} />
        <div className="min-w-0">
          <p className="font-medium text-sm" data-testid={`text-budget-name-${rule.id}`}>{rule.name}</p>
          <p className="text-xs text-muted-foreground">
            ${budgetUsd}/mo · thresholds {thresholds}% · {model ? model.displayName || model.modelName : "All models"}
            {channelSummary ? ` · → ${channelSummary}` : " · in-app only"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="outline">{rule.enabled ? "Active" : "Paused"}</Badge>
        <Button variant="ghost" size="icon" onClick={() => setEditing(true)} data-testid={`button-edit-budget-${rule.id}`}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onDelete} data-testid={`button-delete-budget-${rule.id}`}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function FoundryThrottleRulesSection({ tenantId }: { tenantId: string }) {
  const { data: rules } = useAlertRules(tenantId);
  const createMut = useCreateAlertRule();
  const updateMut = useUpdateAlertRule();
  const deleteMut = useDeleteAlertRule();
  const triggerMut = useTriggerJob();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [threshold, setThreshold] = useState<string>("10");
  const [channels, setChannels] = useState<string>("");

  const throttleRules = (rules || []).filter((r) => r.alertType === "foundry_throttle");

  function parseChannels(input: string): { type: string; target: string }[] {
    return input
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((entry) => {
        const idx = entry.indexOf(":");
        if (idx <= 0) return { type: "email", target: entry };
        return { type: entry.slice(0, idx).trim(), target: entry.slice(idx + 1).trim() };
      })
      .filter((c) => c.target.length > 0);
  }

  function submit() {
    const trimmed = name.trim();
    const thresholdNum = parseInt(threshold, 10);
    if (!trimmed) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(thresholdNum) || thresholdNum <= 0) {
      toast({ title: "Threshold must be > 0", variant: "destructive" });
      return;
    }
    createMut.mutate(
      {
        tenantId,
        name: trimmed,
        metric: "foundry_throttled_calls_per_hour",
        condition: "gt",
        threshold: thresholdNum,
        enabled: true,
        alertType: "foundry_throttle",
        channels: parseChannels(channels),
      },
      {
        onSuccess: () => {
          toast({ title: "Throttle rule created", description: `${trimmed} · ${thresholdNum} calls/hour` });
          setName("");
          setThreshold("10");
          setChannels("");
        },
        onError: (e: any) => toast({ title: "Create failed", description: e?.message, variant: "destructive" }),
      },
    );
  }

  return (
    <Card className="mb-6" data-testid="card-foundry-throttle-rules">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="h-5 w-5 text-rose-500" />
            Foundry Deployment Throttling
          </CardTitle>
          <CardDescription>
            Alerts when an Azure AI Foundry deployment exceeds a threshold of HTTP 429 (rate-limited) calls per hour. Evaluated after each Foundry discovery sweep.
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            triggerMut.mutate("foundryDiscovery", {
              onSuccess: () => toast({ title: "Foundry discovery triggered", description: "Throttle rules will evaluate after metrics are persisted." }),
              onError: (e: any) => toast({ title: "Trigger failed", description: e?.message, variant: "destructive" }),
            })
          }
          disabled={triggerMut.isPending}
          data-testid="button-trigger-foundry-discovery"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${triggerMut.isPending ? "animate-spin" : ""}`} />
          Run discovery now
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3 bg-muted/30 p-4 rounded-lg border">
          <div className="space-y-2">
            <Label htmlFor="throttle-name">Rule name</Label>
            <Input
              id="throttle-name"
              placeholder="Foundry throttling alert"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="input-throttle-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="throttle-amount">Throttled calls / hour</Label>
            <Input
              id="throttle-amount"
              type="number"
              min="1"
              step="1"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              data-testid="input-throttle-threshold"
            />
            <p className="text-xs text-muted-foreground">Avg HTTP 429 rate over the last 24h, expressed per hour.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="throttle-channels">Notify channels</Label>
            <Input
              id="throttle-channels"
              placeholder="email:ops@acme.com, teams:#it-ops"
              value={channels}
              onChange={(e) => setChannels(e.target.value)}
              data-testid="input-throttle-channels"
            />
          </div>
          <div className="md:col-span-3 flex justify-end">
            <Button onClick={submit} disabled={createMut.isPending} data-testid="button-create-throttle-rule">
              {createMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Add throttling rule
            </Button>
          </div>
        </div>

        {throttleRules.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center" data-testid="text-no-throttle-rules">
            No throttling rules yet. Create one above to be alerted when a Foundry deployment starts hitting its rate limit.
          </p>
        ) : (
          <div className="space-y-2">
            {throttleRules.map((rule) => (
              <ThrottleRuleRow
                key={rule.id}
                rule={rule}
                onToggle={(enabled) =>
                  updateMut.mutate(
                    { id: rule.id, enabled },
                    {
                      onSuccess: () => toast({ title: enabled ? "Rule enabled" : "Rule disabled" }),
                      onError: (e: any) => toast({ title: "Update failed", description: e?.message, variant: "destructive" }),
                    },
                  )
                }
                onSave={(patch) =>
                  updateMut.mutate(
                    { id: rule.id, ...patch },
                    {
                      onSuccess: () => toast({ title: "Rule updated" }),
                      onError: (e: any) => toast({ title: "Update failed", description: e?.message, variant: "destructive" }),
                    },
                  )
                }
                onDelete={() =>
                  deleteMut.mutate(rule.id, {
                    onSuccess: () => toast({ title: "Rule deleted" }),
                    onError: (e: any) => toast({ title: "Delete failed", description: e?.message, variant: "destructive" }),
                  })
                }
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ThrottleRuleRow({
  rule,
  onToggle,
  onSave,
  onDelete,
}: {
  rule: AlertRule;
  onToggle: (enabled: boolean) => void;
  onSave: (patch: { name?: string; threshold?: number; channels?: { type: string; target: string }[] }) => void;
  onDelete: () => void;
}) {
  const channelSummary = (rule.channels ?? []).map((c) => `${c.type}:${c.target}`).join(", ");

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(rule.name);
  const [editThreshold, setEditThreshold] = useState<string>(String(rule.threshold ?? 10));
  const [editChannels, setEditChannels] = useState<string>(channelSummary);

  function saveEdits() {
    const t = parseInt(editThreshold, 10);
    if (!editName.trim() || !Number.isFinite(t) || t <= 0) return;
    const parsedChannels = editChannels
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((entry) => {
        const idx = entry.indexOf(":");
        if (idx <= 0) return { type: "email", target: entry };
        return { type: entry.slice(0, idx).trim(), target: entry.slice(idx + 1).trim() };
      })
      .filter((c) => c.target.length > 0);
    onSave({ name: editName.trim(), threshold: t, channels: parsedChannels });
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="grid gap-3 md:grid-cols-3 py-3 border-b last:border-0 bg-muted/20 px-3 rounded" data-testid={`row-throttle-rule-edit-${rule.id}`}>
        <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Name" data-testid={`input-edit-throttle-name-${rule.id}`} />
        <Input type="number" min="1" step="1" value={editThreshold} onChange={(e) => setEditThreshold(e.target.value)} placeholder="Calls/hour" data-testid={`input-edit-throttle-threshold-${rule.id}`} />
        <Input value={editChannels} onChange={(e) => setEditChannels(e.target.value)} placeholder="email:..., teams:..." data-testid={`input-edit-throttle-channels-${rule.id}`} />
        <div className="md:col-span-3 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)} data-testid={`button-cancel-edit-throttle-${rule.id}`}>Cancel</Button>
          <Button size="sm" onClick={saveEdits} data-testid={`button-save-edit-throttle-${rule.id}`}>Save</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between py-3 border-b last:border-0" data-testid={`row-throttle-rule-${rule.id}`}>
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Switch checked={rule.enabled} onCheckedChange={onToggle} data-testid={`switch-throttle-${rule.id}`} />
        <div className="min-w-0">
          <p className="font-medium text-sm" data-testid={`text-throttle-name-${rule.id}`}>{rule.name}</p>
          <p className="text-xs text-muted-foreground">
            {rule.threshold} HTTP 429 calls/hour
            {channelSummary ? ` · → ${channelSummary}` : " · in-app only"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="outline">{rule.enabled ? "Active" : "Paused"}</Badge>
        <Button variant="ghost" size="icon" onClick={() => setEditing(true)} data-testid={`button-edit-throttle-${rule.id}`}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onDelete} data-testid={`button-delete-throttle-${rule.id}`}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
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
