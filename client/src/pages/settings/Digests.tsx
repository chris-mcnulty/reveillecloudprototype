import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shell } from "@/components/layout/Shell";
import { SettingsNav } from "@/components/layout/SettingsNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CalendarClock, Mail, Trash2, Pencil, Play, FileText, Plus, Loader2, ExternalLink } from "lucide-react";
import { useActiveTenant } from "@/lib/tenant-context";
import { useToast } from "@/hooks/use-toast";

const SECTIONS: { value: string; label: string }[] = [
  { value: "performance", label: "Performance" },
  { value: "alerts", label: "Alerts" },
  { value: "llm", label: "LLM Spend" },
  { value: "copilot", label: "Copilot" },
  { value: "signins", label: "Sign-Ins" },
];

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface Digest {
  id: string;
  organizationId: string;
  tenantId: string | null;
  name: string;
  description: string | null;
  cadence: string;
  hourOfDay: number;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  timezone: string;
  sections: string[];
  deliveryEmails: string[];
  teamsWebhookUrl: string | null;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

interface DigestRun {
  id: string;
  digestId: string;
  status: string;
  emailRecipientCount: number | null;
  teamsDelivered: boolean | null;
  durationMs: number | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

interface FormState {
  name: string;
  description: string;
  cadence: string;
  hourOfDay: number;
  dayOfWeek: number;
  dayOfMonth: number;
  timezone: string;
  sections: string[];
  deliveryEmailsText: string;
  teamsWebhookUrl: string;
  enabled: boolean;
  tenantId: string | null;
}

const emptyForm: FormState = {
  name: "",
  description: "",
  cadence: "weekly",
  hourOfDay: 8,
  dayOfWeek: 1,
  dayOfMonth: 1,
  timezone: "America/Los_Angeles",
  sections: ["performance", "alerts", "llm", "copilot", "signins"],
  deliveryEmailsText: "",
  teamsWebhookUrl: "",
  enabled: true,
  tenantId: null,
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

export default function DigestsConfig() {
  const queryClient = useQueryClient();
  const { activeOrgId, orgTenants } = useActiveTenant();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Digest | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [runsDigestId, setRunsDigestId] = useState<string | null>(null);

  const { data: digests = [], isLoading } = useQuery<Digest[]>({
    queryKey: ["/api/scheduled-digests", activeOrgId],
    queryFn: async () => {
      const url = activeOrgId ? `/api/scheduled-digests?orgId=${activeOrgId}` : "/api/scheduled-digests";
      const r = await fetch(url);
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const { data: runs = [] } = useQuery<DigestRun[]>({
    queryKey: ["/api/scheduled-digests", runsDigestId, "runs"],
    enabled: !!runsDigestId,
    queryFn: async () => {
      const r = await fetch(`/api/scheduled-digests/${runsDigestId}/runs?limit=10`);
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  type DigestPayload = {
    id?: string;
    organizationId: string;
    tenantId: string | null;
    name: string;
    description: string | null;
    cadence: string;
    hourOfDay: number;
    dayOfWeek: number | null;
    dayOfMonth: number | null;
    timezone: string;
    sections: string[];
    deliveryEmails: string[];
    teamsWebhookUrl: string | null;
    enabled: boolean;
  };

  type RunNowResponse = {
    status: "completed" | "failed";
    emailRecipientCount: number;
    teamsDelivered: boolean;
    error?: string;
  };

  const errorText = (err: unknown) =>
    err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";

  const saveMutation = useMutation({
    mutationFn: async (payload: DigestPayload) => {
      const url = payload.id ? `/api/scheduled-digests/${payload.id}` : "/api/scheduled-digests";
      const method = payload.id ? "PATCH" : "POST";
      const { id: _ignored, ...body } = payload;
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduled-digests"] });
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyForm);
      toast({ title: "Saved", description: "Scheduled report saved." });
    },
    onError: (err: unknown) => {
      toast({ title: "Save failed", description: errorText(err), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/scheduled-digests/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduled-digests"] });
      toast({ title: "Deleted", description: "Scheduled report removed." });
    },
  });

  const runNowMutation = useMutation({
    mutationFn: async (id: string): Promise<RunNowResponse> => {
      const r = await fetch(`/api/scheduled-digests/${id}/run-now`, { method: "POST" });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: (data: RunNowResponse) => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduled-digests"] });
      toast({
        title: data.status === "completed" ? "Digest sent" : "Digest failed",
        description: data.status === "completed"
          ? `Email recipients: ${data.emailRecipientCount}, Teams: ${data.teamsDelivered ? "yes" : "no"}`
          : data.error || "Run failed",
        variant: data.status === "completed" ? "default" : "destructive",
      });
    },
    onError: (err: unknown) => {
      toast({ title: "Run failed", description: errorText(err), variant: "destructive" });
    },
  });

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(d: Digest) {
    setEditing(d);
    setForm({
      name: d.name,
      description: d.description || "",
      cadence: d.cadence,
      hourOfDay: d.hourOfDay,
      dayOfWeek: d.dayOfWeek ?? 1,
      dayOfMonth: d.dayOfMonth ?? 1,
      timezone: d.timezone,
      sections: d.sections || [],
      deliveryEmailsText: (d.deliveryEmails || []).join(", "),
      teamsWebhookUrl: d.teamsWebhookUrl || "",
      enabled: d.enabled,
      tenantId: d.tenantId,
    });
    setDialogOpen(true);
  }

  function toggleSection(value: string) {
    setForm(prev => ({
      ...prev,
      sections: prev.sections.includes(value)
        ? prev.sections.filter(s => s !== value)
        : [...prev.sections, value],
    }));
  }

  function submitForm() {
    if (!activeOrgId) {
      toast({ title: "No organization", description: "Select an organization first.", variant: "destructive" });
      return;
    }
    if (!form.name.trim()) {
      toast({ title: "Validation", description: "Name is required.", variant: "destructive" });
      return;
    }
    if (form.sections.length === 0) {
      toast({ title: "Validation", description: "Select at least one section.", variant: "destructive" });
      return;
    }
    const emails = form.deliveryEmailsText
      .split(/[,;\s]+/)
      .map(s => s.trim())
      .filter(Boolean);

    const payload: DigestPayload = {
      organizationId: activeOrgId,
      tenantId: form.tenantId,
      name: form.name.trim(),
      description: form.description.trim() || null,
      cadence: form.cadence,
      hourOfDay: form.hourOfDay,
      dayOfWeek: form.cadence === "weekly" ? form.dayOfWeek : null,
      dayOfMonth: form.cadence === "monthly" ? form.dayOfMonth : null,
      timezone: form.timezone,
      sections: form.sections,
      deliveryEmails: emails,
      teamsWebhookUrl: form.teamsWebhookUrl.trim() || null,
      enabled: form.enabled,
      ...(editing ? { id: editing.id } : {}),
    };
    saveMutation.mutate(payload);
  }

  return (
    <Shell>
      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Settings</h2>
        <p className="text-muted-foreground">Configure scheduled reports and digests.</p>
      </div>
      <SettingsNav />

      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold">Scheduled Reports</h3>
          <p className="text-sm text-muted-foreground">Email and Teams digests sent on a schedule.</p>
        </div>
        <Button onClick={openCreate} data-testid="button-new-digest">
          <Plus className="h-4 w-4 mr-1.5" /> New Scheduled Report
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>
      ) : digests.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground" data-testid="text-no-digests">
            <CalendarClock className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p>No scheduled reports yet. Create one to deliver weekly snapshots to your team.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {digests.map(d => (
            <Card key={d.id} data-testid={`card-digest-${d.id}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <CalendarClock className="h-4 w-4 text-blue-500" />
                      {d.name}
                      {!d.enabled && <Badge variant="secondary" className="text-[10px]">Disabled</Badge>}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {d.description || `${d.cadence} digest`}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => runNowMutation.mutate(d.id)}
                      disabled={runNowMutation.isPending}
                      data-testid={`button-run-now-${d.id}`}
                    >
                      <Play className="h-3.5 w-3.5 mr-1" />
                      Run Now
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(`/api/scheduled-digests/${d.id}/preview`, "_blank")}
                      data-testid={`button-preview-${d.id}`}
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-1" />
                      Preview
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(d)} data-testid={`button-edit-${d.id}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm(`Delete "${d.name}"?`)) deleteMutation.mutate(d.id);
                      }}
                      data-testid={`button-delete-${d.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <div className="text-muted-foreground">Cadence</div>
                    <div className="font-medium capitalize">{d.cadence}{d.cadence === "weekly" && d.dayOfWeek != null ? ` · ${DAYS_OF_WEEK[d.dayOfWeek]}` : ""}{d.cadence === "monthly" ? ` · day ${d.dayOfMonth}` : ""} @ {d.hourOfDay}:00 <span className="normal-case text-muted-foreground">({d.timezone})</span></div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Tenant scope</div>
                    <div className="font-medium">{d.tenantId ? (orgTenants?.find(t => t.id === d.tenantId)?.name || d.tenantId.slice(0, 8)) : "All tenants"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Last run</div>
                    <div className="font-medium" data-testid={`text-last-run-${d.id}`}>{formatDateTime(d.lastRunAt)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Next run</div>
                    <div className="font-medium" data-testid={`text-next-run-${d.id}`}>{formatDateTime(d.nextRunAt)}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {(d.sections || []).map(s => (
                    <Badge key={s} variant="outline" className="text-[10px]">{SECTIONS.find(x => x.value === s)?.label || s}</Badge>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" />
                  <span>{(d.deliveryEmails || []).length} recipient{(d.deliveryEmails || []).length === 1 ? "" : "s"}</span>
                  {d.teamsWebhookUrl && <Badge variant="outline" className="text-[10px]">Teams webhook</Badge>}
                </div>
                <div className="pt-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setRunsDigestId(runsDigestId === d.id ? null : d.id)}
                    data-testid={`button-toggle-runs-${d.id}`}
                  >
                    <FileText className="h-3.5 w-3.5 mr-1" />
                    {runsDigestId === d.id ? "Hide run history" : "Show run history"}
                  </Button>
                  {runsDigestId === d.id && (
                    <div className="mt-2 border rounded p-3 space-y-1.5 text-xs" data-testid={`runs-list-${d.id}`}>
                      {runs.length === 0 ? (
                        <div className="text-muted-foreground">No runs yet.</div>
                      ) : runs.map(r => (
                        <div key={r.id} className="flex items-center justify-between gap-2 border-b last:border-0 pb-1.5 last:pb-0">
                          <div className="flex items-center gap-2">
                            <Badge variant={r.status === "completed" ? "secondary" : r.status === "failed" ? "destructive" : "outline"} className="text-[10px]">
                              {r.status}
                            </Badge>
                            <span>{formatDateTime(r.startedAt)}</span>
                          </div>
                          <div className="text-muted-foreground">
                            {r.emailRecipientCount ?? 0} email · Teams {r.teamsDelivered ? "✓" : "✗"} · {r.durationMs ?? 0}ms
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); setEditing(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-digest-form">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Scheduled Report" : "New Scheduled Report"}</DialogTitle>
            <DialogDescription>Configure when and where this digest is sent.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="form-name">Name</Label>
              <Input id="form-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} data-testid="input-name" />
            </div>
            <div>
              <Label htmlFor="form-description">Description</Label>
              <Textarea id="form-description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} data-testid="input-description" rows={2} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tenant scope</Label>
                <Select value={form.tenantId || "_all"} onValueChange={v => setForm({ ...form, tenantId: v === "_all" ? null : v })}>
                  <SelectTrigger data-testid="select-tenant"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">All tenants</SelectItem>
                    {(orgTenants || []).map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Cadence</Label>
                <Select value={form.cadence} onValueChange={v => setForm({ ...form, cadence: v })}>
                  <SelectTrigger data-testid="select-cadence"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {form.cadence === "weekly" && (
                <div>
                  <Label>Day of week</Label>
                  <Select value={String(form.dayOfWeek)} onValueChange={v => setForm({ ...form, dayOfWeek: parseInt(v, 10) })}>
                    <SelectTrigger data-testid="select-day-of-week"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DAYS_OF_WEEK.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {form.cadence === "monthly" && (
                <div>
                  <Label>Day of month</Label>
                  <Input type="number" min={1} max={28} value={form.dayOfMonth} onChange={e => setForm({ ...form, dayOfMonth: parseInt(e.target.value, 10) || 1 })} data-testid="input-day-of-month" />
                </div>
              )}
              <div>
                <Label>Hour of day (0-23, local)</Label>
                <Input type="number" min={0} max={23} value={form.hourOfDay} onChange={e => setForm({ ...form, hourOfDay: parseInt(e.target.value, 10) || 0 })} data-testid="input-hour-of-day" />
                <p className="text-[11px] text-muted-foreground mt-1">Interpreted in the timezone below.</p>
              </div>
              <div>
                <Label>Timezone (IANA)</Label>
                <Input value={form.timezone} onChange={e => setForm({ ...form, timezone: e.target.value })} placeholder="America/Los_Angeles" data-testid="input-timezone" />
              </div>
            </div>

            <div>
              <Label>Sections</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-1.5">
                {SECTIONS.map(s => (
                  <label key={s.value} className="flex items-center gap-2 text-sm" data-testid={`checkbox-section-${s.value}`}>
                    <Checkbox checked={form.sections.includes(s.value)} onCheckedChange={() => toggleSection(s.value)} />
                    {s.label}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="form-emails">Email recipients (comma-separated)</Label>
              <Textarea id="form-emails" value={form.deliveryEmailsText} onChange={e => setForm({ ...form, deliveryEmailsText: e.target.value })} placeholder="alice@example.com, bob@example.com" data-testid="input-emails" rows={2} />
            </div>

            <div>
              <Label htmlFor="form-teams">Teams Incoming Webhook URL (optional)</Label>
              <Input id="form-teams" value={form.teamsWebhookUrl} onChange={e => setForm({ ...form, teamsWebhookUrl: e.target.value })} placeholder="https://outlook.office.com/webhook/..." data-testid="input-teams-webhook" />
            </div>

            <div className="flex items-center justify-between border-t pt-3">
              <div>
                <Label htmlFor="form-enabled">Enabled</Label>
                <p className="text-xs text-muted-foreground">Disabled digests are skipped by the scheduler.</p>
              </div>
              <Switch id="form-enabled" checked={form.enabled} onCheckedChange={v => setForm({ ...form, enabled: v })} data-testid="switch-enabled" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); setEditing(null); }} data-testid="button-cancel">Cancel</Button>
            <Button onClick={submitForm} disabled={saveMutation.isPending} data-testid="button-save">
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}
