import { useState } from "react";
import { Shell } from "@/components/layout/Shell";
import { SettingsNav } from "@/components/layout/SettingsNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Mail, MessageSquare, Plus, Trash2, Webhook, Pencil, Loader2 } from "lucide-react";
import { useAlertRules, useCreateAlertRule, useUpdateAlertRule, useDeleteAlertRule } from "@/lib/api";
import { useActiveTenant } from "@/lib/tenant-context";
import { useToast } from "@/hooks/use-toast";
import type { AlertRule } from "@shared/schema";

type Channel = { type: string; target: string };

const CHANNEL_ICONS: Record<string, React.ElementType> = {
  email: Mail,
  teams: MessageSquare,
  webhook: Webhook,
};

const METRICS = [
  { value: "page_load", label: "Page Load Time (ms)" },
  { value: "file_upload", label: "File Upload Time (ms)" },
  { value: "file_download", label: "File Download Time (ms)" },
  { value: "search_latency", label: "Search Latency (ms)" },
  { value: "auth_latency", label: "Auth Latency (ms)" },
  { value: "error_rate", label: "Error Rate (%)" },
  { value: "availability", label: "Availability (%)" },
  { value: "spe_access_latency", label: "SPE Access Latency (ms)" },
  { value: "spe_error_rate", label: "SPE Error Rate (%)" },
];

interface RuleFormState {
  name: string;
  description: string;
  metric: string;
  condition: string;
  threshold: string;
  enabled: boolean;
  channels: Channel[];
}

const defaultForm: RuleFormState = {
  name: "",
  description: "",
  metric: "page_load",
  condition: "gt",
  threshold: "3000",
  enabled: true,
  channels: [],
};

function ChannelBadge({ channel, onRemove }: { channel: Channel; onRemove?: () => void }) {
  const Icon = CHANNEL_ICONS[channel.type] || Webhook;
  return (
    <div className="flex items-center gap-1.5 border rounded-md px-2 py-1 text-xs bg-muted/30">
      <Icon className="h-3 w-3 text-muted-foreground" />
      <span className="font-medium capitalize">{channel.type}</span>
      <span className="text-muted-foreground truncate max-w-[120px]">{channel.target}</span>
      {onRemove && (
        <button onClick={onRemove} className="ml-1 text-muted-foreground hover:text-destructive">
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function AddChannelDialog({ onAdd, onClose }: { onAdd: (ch: Channel) => void; onClose: () => void }) {
  const [type, setType] = useState("teams");
  const [target, setTarget] = useState("");
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Add Notification Channel</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Channel Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="teams">Microsoft Teams Webhook</SelectItem>
                <SelectItem value="email">Email Address</SelectItem>
                <SelectItem value="webhook">Generic Webhook URL</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{type === "email" ? "Email Address" : "Webhook URL"}</Label>
            <Input
              placeholder={type === "email" ? "ops@example.com" : "https://..."}
              value={target}
              onChange={e => setTarget(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { if (target.trim()) { onAdd({ type, target: target.trim() }); onClose(); } }}>Add Channel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RuleDialog({
  rule,
  tenantId,
  onClose,
}: {
  rule?: AlertRule;
  tenantId: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const createRule = useCreateAlertRule();
  const updateRule = useUpdateAlertRule();
  const [showAddChannel, setShowAddChannel] = useState(false);
  const [form, setForm] = useState<RuleFormState>(
    rule
      ? {
          name: rule.name,
          description: rule.description || "",
          metric: rule.metric,
          condition: rule.condition,
          threshold: String(rule.threshold),
          enabled: rule.enabled,
          channels: (rule.channels as Channel[]) || [],
        }
      : defaultForm
  );

  const saving = createRule.isPending || updateRule.isPending;

  async function handleSave() {
    const payload = {
      tenantId,
      name: form.name,
      description: form.description || null,
      metric: form.metric,
      condition: form.condition,
      threshold: parseInt(form.threshold) || 0,
      enabled: form.enabled,
      channels: form.channels,
    };
    try {
      if (rule) {
        await updateRule.mutateAsync({ id: rule.id, ...payload });
        toast({ title: "Alert rule updated" });
      } else {
        await createRule.mutateAsync(payload);
        toast({ title: "Alert rule created" });
      }
      onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  return (
    <>
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{rule ? "Edit Alert Rule" : "Create Alert Rule"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Rule Name</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Page Load SLA Breach" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Metric</Label>
                <Select value={form.metric} onValueChange={v => setForm(f => ({ ...f, metric: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {METRICS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Condition</Label>
                <Select value={form.condition} onValueChange={v => setForm(f => ({ ...f, condition: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gt">Greater Than (&gt;)</SelectItem>
                    <SelectItem value="lt">Less Than (&lt;)</SelectItem>
                    <SelectItem value="eq">Equals (=)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Threshold</Label>
                <Input type="number" value={form.threshold} onChange={e => setForm(f => ({ ...f, threshold: e.target.value }))} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.enabled} onCheckedChange={v => setForm(f => ({ ...f, enabled: v }))} />
              <Label>Rule enabled</Label>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Notification Channels</Label>
                <Button size="sm" variant="outline" onClick={() => setShowAddChannel(true)}>
                  <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
              </div>
              {form.channels.length === 0 ? (
                <p className="text-xs text-muted-foreground">No channels configured — alerts will only appear in the UI.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {form.channels.map((ch, i) => (
                    <ChannelBadge
                      key={i}
                      channel={ch}
                      onRemove={() => setForm(f => ({ ...f, channels: f.channels.filter((_, j) => j !== i) }))}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {rule ? "Save Changes" : "Create Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {showAddChannel && (
        <AddChannelDialog
          onAdd={ch => setForm(f => ({ ...f, channels: [...f.channels, ch] }))}
          onClose={() => setShowAddChannel(false)}
        />
      )}
    </>
  );
}

function RuleCard({ rule, tenantId }: { rule: AlertRule; tenantId: string }) {
  const { toast } = useToast();
  const updateRule = useUpdateAlertRule();
  const deleteRule = useDeleteAlertRule();
  const [editing, setEditing] = useState(false);
  const channels = (rule.channels as Channel[]) || [];
  const metricLabel = METRICS.find(m => m.value === rule.metric)?.label || rule.metric;

  async function handleToggle(enabled: boolean) {
    try {
      await updateRule.mutateAsync({ id: rule.id, tenantId, enabled });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete rule "${rule.name}"?`)) return;
    try {
      await deleteRule.mutateAsync(rule.id);
      toast({ title: "Rule deleted" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  return (
    <>
      <Card className={rule.enabled ? "" : "opacity-60"}>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base">{rule.name}</CardTitle>
            {rule.description && <CardDescription className="mt-0.5">{rule.description}</CardDescription>}
          </div>
          <Switch checked={rule.enabled} onCheckedChange={handleToggle} />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="secondary">{metricLabel}</Badge>
            <Badge variant="outline">
              {rule.condition === "gt" ? ">" : rule.condition === "lt" ? "<" : "="} {rule.threshold}
            </Badge>
          </div>
          {channels.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {channels.map((ch, i) => <ChannelBadge key={i} channel={ch} />)}
            </div>
          )}
          {channels.length === 0 && (
            <p className="text-xs text-muted-foreground">No notification channels — UI only</p>
          )}
        </CardContent>
        <CardFooter className="border-t pt-3 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={handleDelete} className="text-muted-foreground hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
          </Button>
        </CardFooter>
      </Card>
      {editing && <RuleDialog rule={rule} tenantId={tenantId} onClose={() => setEditing(false)} />}
    </>
  );
}

export default function AlertRulesConfig() {
  const { activeTenantId } = useActiveTenant();
  const { data: rules, isLoading } = useAlertRules(activeTenantId);
  const [creating, setCreating] = useState(false);

  return (
    <Shell>
      <div className="flex items-center justify-between space-y-2 mb-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Tenant Configuration</h2>
          <p className="text-muted-foreground">
            Manage Azure AD integration, synthetic tests, and alert rules.
          </p>
        </div>
        <Button onClick={() => setCreating(true)} disabled={!activeTenantId}>
          <Plus className="mr-2 h-4 w-4" /> Create Rule
        </Button>
      </div>

      <SettingsNav />

      {!activeTenantId && (
        <Card>
          <CardContent className="flex items-center gap-3 py-6 text-muted-foreground">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <p>Select a tenant to manage its alert rules.</p>
          </CardContent>
        </Card>
      )}

      {activeTenantId && isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground py-8">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading rules...
        </div>
      )}

      {activeTenantId && !isLoading && rules?.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
            <AlertCircle className="h-8 w-8" />
            <p className="font-medium">No alert rules configured</p>
            <p className="text-sm">Create your first rule to start receiving threshold-based notifications.</p>
            <Button className="mt-2" onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" /> Create Rule
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {rules?.map(rule => (
          <RuleCard key={rule.id} rule={rule} tenantId={activeTenantId!} />
        ))}
      </div>

      {creating && activeTenantId && (
        <RuleDialog tenantId={activeTenantId} onClose={() => setCreating(false)} />
      )}
    </Shell>
  );
}
