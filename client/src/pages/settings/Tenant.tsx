import { Shell } from "@/components/layout/Shell";
import { SettingsNav } from "@/components/layout/SettingsNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldAlert, Key, CheckCircle2, Copy, Cloud, Loader2, XCircle, ExternalLink, AlertTriangle, Settings2, ChevronDown, ChevronRight, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useActiveTenant } from "@/lib/tenant-context";
import { useConsentTenant, useRevokeConsent, useAzureAppStatus, useConsentUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";

interface WorkloadConfig {
  label: string;
  color: string;
  permissions: { scope: string; purpose: string; status: "required" | "recommended" | "optional"; api: string }[];
}

const WORKLOAD_PERMISSIONS: Record<string, WorkloadConfig> = {
  sharepoint: {
    label: "SharePoint Online",
    color: "bg-[#038387]",
    permissions: [
      { scope: "Sites.Read.All", purpose: "Site structure, lists, libraries, subsites, drives", status: "required", api: "Graph" },
      { scope: "Files.ReadWrite.All", purpose: "Synthetic file upload/download performance tests", status: "required", api: "Graph" },
      { scope: "Reports.Read.All", purpose: "Site usage, storage, file counts, page views, active users", status: "required", api: "Graph" },
    ],
  },
  onedrive: {
    label: "OneDrive for Business",
    color: "bg-[#0078D4]",
    permissions: [
      { scope: "Reports.Read.All", purpose: "Per-user storage, file counts, sync status, activity", status: "required", api: "Graph" },
      { scope: "Files.Read.All", purpose: "OneDrive file structure and quota monitoring", status: "recommended", api: "Graph" },
    ],
  },
  identity: {
    label: "Identity & Access (Entra ID)",
    color: "bg-[#5C2D91]",
    permissions: [
      { scope: "AuditLog.Read.All", purpose: "Sign-in logs, directory audits, MFA events", status: "required", api: "Graph" },
      { scope: "Directory.Read.All", purpose: "User/group enumeration, license assignments", status: "recommended", api: "Graph" },
      { scope: "User.Read.All", purpose: "User profiles, sign-in activity, account status", status: "required", api: "Graph" },
      { scope: "Group.Read.All", purpose: "M365 group membership, Teams-connected groups", status: "required", api: "Graph" },
    ],
  },
  serviceHealth: {
    label: "Service Health & Communications",
    color: "bg-[#D83B01]",
    permissions: [
      { scope: "ServiceHealth.Read.All", purpose: "Service incidents, advisories, planned maintenance", status: "required", api: "Graph" },
      { scope: "ServiceMessage.Read.All", purpose: "Message center posts (feature changes, retirements)", status: "recommended", api: "Graph" },
    ],
  },
  auditActivity: {
    label: "SharePoint Audit (Activity Feed)",
    color: "bg-[#107C10]",
    permissions: [
      { scope: "ActivityFeed.Read", purpose: "Real SharePoint operations: file access, sharing, permissions, search queries", status: "required", api: "Office 365 Management" },
      { scope: "ActivityFeed.ReadDlp", purpose: "DLP policy match events for sensitive content detection", status: "optional", api: "Office 365 Management" },
    ],
  },
  teams: {
    label: "Microsoft Teams",
    color: "bg-[#6264A7]",
    permissions: [
      { scope: "Reports.Read.All", purpose: "Teams messages, calls, meetings per user", status: "recommended", api: "Graph" },
    ],
  },
  exchange: {
    label: "Exchange Online / Outlook",
    color: "bg-[#0078D4]",
    permissions: [
      { scope: "Reports.Read.All", purpose: "Email sends/reads/receives, mailbox usage, app breakdown", status: "recommended", api: "Graph" },
    ],
  },
  m365Apps: {
    label: "Microsoft 365 Apps (Office)",
    color: "bg-[#D83B01]",
    permissions: [
      { scope: "Reports.Read.All", purpose: "Per-user app usage across Word, Excel, PowerPoint, Outlook, Teams", status: "recommended", api: "Graph" },
    ],
  },
  security: {
    label: "Security & Compliance",
    color: "bg-[#E3008C]",
    permissions: [
      { scope: "SecurityEvents.Read.All", purpose: "Security alerts from Microsoft Defender for Office 365", status: "optional", api: "Graph" },
    ],
  },
};

function WorkloadPermissions({ isConnected }: { isConnected: boolean }) {
  const [expandedWorkloads, setExpandedWorkloads] = useState<Record<string, boolean>>({
    sharepoint: true,
    auditActivity: true,
  });

  const toggle = (key: string) =>
    setExpandedWorkloads(prev => ({ ...prev, [key]: !prev[key] }));

  const statusColors = {
    required: "bg-red-500/10 text-red-700 border-red-200",
    recommended: "bg-amber-500/10 text-amber-700 border-amber-200",
    optional: "bg-slate-500/10 text-slate-600 border-slate-200",
  };

  const uniqueScopes = new Set(
    Object.values(WORKLOAD_PERMISSIONS).flatMap(w => w.permissions.map(p => p.scope))
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Permissions by Workload</p>
        <p className="text-xs text-muted-foreground">{uniqueScopes.size} unique scopes across {Object.keys(WORKLOAD_PERMISSIONS).length} workloads</p>
      </div>
      <div className="space-y-1">
        {Object.entries(WORKLOAD_PERMISSIONS).map(([key, workload]) => (
          <div key={key} className="border rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
              onClick={() => toggle(key)}
              data-testid={`button-toggle-workload-${key}`}
            >
              <div className={`h-2 w-2 rounded-full ${workload.color}`} />
              {expandedWorkloads[key] ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <span className="text-sm font-medium flex-1">{workload.label}</span>
              <span className="text-xs text-muted-foreground">{workload.permissions.length} scope{workload.permissions.length !== 1 ? "s" : ""}</span>
            </button>
            {expandedWorkloads[key] && (
              <div className="px-3 pb-2 space-y-1.5 border-t bg-muted/20">
                {workload.permissions.map((perm) => (
                  <div key={`${key}-${perm.scope}`} className="flex items-start gap-2 py-1.5">
                    <div className={`mt-0.5 h-1.5 w-1.5 rounded-full shrink-0 ${isConnected ? "bg-emerald-500" : "bg-muted-foreground"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <code className="text-xs font-mono font-medium">{perm.scope}</code>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusColors[perm.status]}`}>{perm.status}</Badge>
                        {perm.api !== "Graph" && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-violet-500/10 text-violet-700 border-violet-200">{perm.api}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{perm.purpose}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground border-t pt-2">
        All Microsoft Graph permissions are <span className="font-medium">Application</span> type (not Delegated). Office 365 Management API permissions are configured separately under "APIs my organization uses".
      </p>
    </div>
  );
}

function M365AdminChecklist() {
  const [expanded, setExpanded] = useState(false);

  const checklist = [
    {
      title: "Enable Unified Audit Logging",
      where: "Microsoft Purview compliance portal (compliance.microsoft.com)",
      steps: [
        "Go to Audit page",
        "If you see a banner saying 'Start recording user and admin activity', click it",
        "Most tenants have this enabled by default, but older tenants may not",
      ],
      impact: "Without this, no audit events are recorded at all — this is the master switch",
    },
    {
      title: "Register Office 365 Management API permissions",
      where: "Azure Portal > Entra ID > App registrations > Your app > API permissions",
      steps: [
        "Click 'Add a permission' > 'APIs my organization uses'",
        "Search for 'Office 365 Management APIs'",
        "Select Application permissions > ActivityFeed > ActivityFeed.Read",
        "Click 'Grant admin consent' for your directory",
      ],
      impact: "Unlocks real SharePoint operations: FileAccessed, SharingSet, PermissionChanged, SearchQueryPerformed, and 50+ other event types",
    },
    {
      title: "Subscribe to Audit Content Types",
      where: "Automatic — Reveille Cloud auto-starts subscriptions when Management API access is granted",
      steps: [
        "Audit.SharePoint — SharePoint and OneDrive file operations, sharing, permissions",
        "Audit.General — Teams, Power Platform, and cross-workload events (future)",
        "Audit.Exchange — Email access and admin operations (future)",
        "Audit.AzureActiveDirectory — Sign-ins, role changes, app consents",
      ],
      impact: "Each content type is a separate feed of audit events. Reveille auto-subscribes to Audit.SharePoint.",
    },
    {
      title: "Consider E5 / Audit Premium Licensing",
      where: "Microsoft 365 admin center > Billing > Licenses",
      steps: [
        "Microsoft 365 E5 or E5 Compliance add-on unlocks advanced audit events:",
        "MailItemsAccessed — every email open event (critical for breach forensics)",
        "SearchQueryInitiatedSharePoint — actual search queries users ran in SharePoint",
        "SearchQueryInitiatedExchange — mailbox search queries",
        "Extended audit log retention: up to 10 years (vs 90 days standard)",
      ],
      impact: "Required for forensic investigation capabilities and full search query telemetry",
    },
    {
      title: "Enable Mailbox Auditing (Exchange)",
      where: "Exchange admin center or PowerShell",
      steps: [
        "Run: Set-OrganizationConfig -AuditDisabled $false",
        "Mailbox audit is now on by default for E3/E5, but verify with: Get-OrganizationConfig | Select AuditDisabled",
        "Custom audit actions: Set-Mailbox -Identity user@domain.com -AuditOwner MailItemsAccessed,Send",
      ],
      impact: "Captures email access patterns for correlation with SharePoint content workflows",
    },
    {
      title: "Configure SharePoint Site-Level Audit Settings",
      where: "SharePoint admin center > Active sites > (each site) > Policies",
      steps: [
        "Enable 'Editing items', 'Checking in/out', 'Moving/copying items', 'Deleting/restoring items'",
        "Set retention period for audit logs (default is 90 days)",
        "Consider enabling at site collection level for critical sites",
      ],
      impact: "Some granular events only fire when site-level auditing is explicitly enabled",
    },
  ];

  return (
    <div className="space-y-2">
      <button
        className="w-full flex items-center gap-2 text-left"
        onClick={() => setExpanded(!expanded)}
        data-testid="button-toggle-admin-checklist"
      >
        <Info className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium flex-1">M365 Admin Configuration Checklist</span>
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {expanded && (
        <div className="space-y-3 pt-1">
          <p className="text-xs text-muted-foreground">
            These steps must be completed by a Microsoft 365 Global Administrator in the tenant being monitored. They enable the data sources that Reveille Cloud collects from.
          </p>
          {checklist.map((item, idx) => (
            <div key={idx} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-start gap-2">
                <div className="h-5 w-5 rounded-full border-2 border-primary/50 flex items-center justify-center shrink-0 text-[10px] font-bold text-primary/70">{idx + 1}</div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.where}</p>
                </div>
              </div>
              <ul className="space-y-0.5 ml-7">
                {item.steps.map((step, sIdx) => (
                  <li key={sIdx} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <span className="text-primary/50 mt-0.5">-</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs ml-7 text-primary/80 font-medium">{item.impact}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TenantSettings() {
  const { activeTenantId, orgTenants } = useActiveTenant();
  const consentMutation = useConsentTenant();
  const revokeMutation = useRevokeConsent();
  const azureAppStatus = useAzureAppStatus();
  const { toast } = useToast();
  const [location] = useLocation();
  const [manualTenantId, setManualTenantId] = useState("");
  const [manualClientId, setManualClientId] = useState("");

  const tenant = orgTenants.find(t => t.id === activeTenantId);
  const isConnected = tenant?.consentStatus === "Connected";
  const isPending = !isConnected;
  const azureConfigured = azureAppStatus.data?.configured ?? false;

  const consentUrlQuery = useConsentUrl(
    azureConfigured && isPending && tenant ? tenant.id : null
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const consentSuccess = params.get("consent_success");
    const consentError = params.get("consent_error");
    const azureTenant = params.get("azure_tenant");

    if (consentSuccess === "true") {
      toast({
        title: "Consent Granted",
        description: `Successfully connected to Microsoft 365${azureTenant ? ` (Azure tenant: ${azureTenant})` : ""}.`,
      });
      window.history.replaceState({}, "", "/settings/tenant");
    } else if (consentError) {
      toast({
        title: "Consent Failed",
        description: decodeURIComponent(consentError),
        variant: "destructive",
      });
      window.history.replaceState({}, "", "/settings/tenant");
    }
  }, []);

  useEffect(() => {
    if (tenant) {
      setManualTenantId(tenant.azureTenantId || "");
      setManualClientId(tenant.azureClientId || "");
    }
  }, [tenant?.id]);

  const handleGrantConsent = async () => {
    if (!tenant) return;

    if (azureConfigured && consentUrlQuery.data?.consentUrl) {
      window.location.href = consentUrlQuery.data.consentUrl;
      return;
    }

    try {
      await consentMutation.mutateAsync(tenant.id);
      toast({ title: "Consent Granted", description: `Successfully connected ${tenant.name} to Reveille Cloud.` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleRevokeConsent = async () => {
    if (!tenant) return;
    try {
      await revokeMutation.mutateAsync(tenant.id);
      toast({ title: "Consent Revoked", description: `Disconnected ${tenant.name} from Reveille Cloud.` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  if (!tenant) {
    return (
      <Shell>
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          Loading tenant...
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex items-center justify-between space-y-2 mb-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight" data-testid="text-settings-title">Tenant Configuration</h2>
          <p className="text-muted-foreground">
            Manage Azure AD integration for <span className="font-medium text-foreground">{tenant.name}</span>
          </p>
        </div>
      </div>

      <SettingsNav />

      {!azureConfigured && (
        <Card className="mb-6 border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 pt-6">
            <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Azure AD App Not Configured</p>
              <p className="text-sm text-muted-foreground mt-1">
                Set <code className="text-xs bg-muted px-1 py-0.5 rounded">AZURE_CLIENT_ID</code> and <code className="text-xs bg-muted px-1 py-0.5 rounded">AZURE_CLIENT_SECRET</code> environment secrets to enable real Microsoft admin consent flow. Without these, consent is simulated locally.
              </p>
              <div className="mt-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">To register your Azure AD multi-tenant app:</p>
                <ol className="list-decimal list-inside space-y-0.5 ml-1">
                  <li>Go to <span className="font-medium">Azure Portal → Entra ID → App registrations → New registration</span></li>
                  <li>Name: <span className="font-mono">Reveille Cloud</span>, Supported account types: <span className="font-medium">Accounts in any organizational directory (Multi-tenant)</span></li>
                  <li>Redirect URI: <span className="font-mono text-primary">Web → {window.location.origin}/api/auth/callback</span></li>
                  <li>Under <span className="font-medium">API permissions</span>, add <span className="font-medium">Microsoft Graph</span> Application permissions:
                    <span className="font-mono"> Reports.Read.All, ServiceHealth.Read.All, AuditLog.Read.All, Sites.Read.All, Files.ReadWrite.All, User.Read.All, Group.Read.All, Directory.Read.All</span>
                  </li>
                  <li>Also add <span className="font-medium">Office 365 Management APIs</span> (under "APIs my organization uses") Application permission:
                    <span className="font-mono"> ActivityFeed.Read</span> — required for real SharePoint audit events
                  </li>
                  <li>Under <span className="font-medium">Certificates & secrets</span>, create a new client secret</li>
                  <li>Copy the Application (client) ID and secret value into the environment secrets above</li>
                </ol>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {azureConfigured && (
        <Card className="mb-6 border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="flex items-start gap-3 pt-6">
            <Settings2 className="h-5 w-5 text-emerald-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Azure AD App Configured</p>
              <p className="text-sm text-muted-foreground mt-1">
                Client ID: <code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">{azureAppStatus.data?.clientId}</code>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Admin consent will redirect to Microsoft's login page for real OAuth authorization.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card className={isConnected ? "border-emerald-500/20 shadow-sm" : "border-amber-500/20 shadow-sm"}>
          <CardHeader>
            <div className="flex items-center gap-2">
              {isConnected ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              ) : (
                <XCircle className="h-5 w-5 text-amber-500" />
              )}
              <CardTitle>Connection Status</CardTitle>
            </div>
            <CardDescription>Azure AD Multi-Tenant Application Consent</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isConnected ? (
              <>
                <div className="flex items-center justify-between p-3 border rounded-lg bg-emerald-500/5" data-testid="status-consent-connected">
                  <div className="space-y-1">
                    <p className="text-sm font-medium" data-testid="text-tenant-name">{tenant.name}</p>
                    {tenant.azureTenantId && (
                      <p className="text-xs text-muted-foreground font-mono" data-testid="text-azure-tenant-id">{tenant.azureTenantId}</p>
                    )}
                  </div>
                  <Badge className="bg-emerald-500">Connected</Badge>
                </div>
                <div className="space-y-2 text-sm">
                  <p className="text-muted-foreground">
                    Consent granted by <span className="font-medium text-foreground">{tenant.consentedBy}</span>
                    {tenant.consentedAt && ` on ${new Date(tenant.consentedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}.
                  </p>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 border-2 border-dashed rounded-lg bg-background" data-testid="status-consent-pending">
                <Cloud className="h-12 w-12 text-primary mb-4" />
                <h3 className="text-lg font-medium mb-2">Connect to Microsoft 365</h3>
                <p className="text-sm text-muted-foreground text-center max-w-md mb-2">
                  Grant Reveille Cloud access to monitor <span className="font-medium text-foreground">{tenant.name}</span>.
                  {azureConfigured
                    ? " You will be redirected to Microsoft to sign in as a Global Administrator."
                    : " Click below to simulate consent (configure Azure AD app for real OAuth flow)."}
                </p>
                <p className="text-xs text-muted-foreground mb-4">{tenant.primaryDomain}</p>
              </div>
            )}
          </CardContent>
          <CardFooter className="border-t bg-muted/10 p-4">
            {isConnected ? (
              <Button
                variant="outline"
                className="w-full text-destructive hover:bg-destructive/10"
                onClick={handleRevokeConsent}
                disabled={revokeMutation.isPending}
                data-testid="button-revoke-consent"
              >
                {revokeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Revoke Consent
              </Button>
            ) : (
              <Button
                className="w-full bg-[#0078D4] hover:bg-[#0078D4]/90 text-white"
                onClick={handleGrantConsent}
                disabled={consentMutation.isPending || (azureConfigured && consentUrlQuery.isLoading)}
                data-testid="button-grant-consent"
              >
                {(consentMutation.isPending || consentUrlQuery.isLoading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {azureConfigured && <ExternalLink className="mr-2 h-4 w-4" />}
                {azureConfigured ? "Grant Admin Consent via Microsoft" : "Grant Admin Consent (Simulated)"}
              </Button>
            )}
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-primary" />
              <CardTitle>Required Permissions & M365 Configuration</CardTitle>
            </div>
            <CardDescription>Complete checklist for maximum monitoring coverage across Microsoft 365</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <WorkloadPermissions isConnected={isConnected} />
            <M365AdminChecklist />
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Key className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Azure AD Tenant Details</CardTitle>
            </div>
            <CardDescription>
              {azureConfigured
                ? "Azure AD tenant ID is captured automatically during consent. You can also set it manually."
                : "Configure the Azure AD tenant ID for this tenant. Required for client credentials token acquisition."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Directory (tenant) ID</Label>
                <div className="flex gap-2">
                  <Input
                    value={manualTenantId}
                    onChange={(e) => setManualTenantId(e.target.value)}
                    placeholder="e.g. 12345678-1234-1234-1234-123456789abc"
                    className="font-mono text-sm"
                    data-testid="input-azure-tenant-id"
                  />
                  {tenant.azureTenantId && (
                    <Button
                      size="icon"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => {
                        navigator.clipboard.writeText(tenant.azureTenantId!);
                        toast({ title: "Copied", description: "Tenant ID copied to clipboard." });
                      }}
                      data-testid="button-copy-tenant-id"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Application (client) ID</Label>
                <div className="flex gap-2">
                  <Input
                    value={azureConfigured ? (azureAppStatus.data?.clientId || "") : manualClientId}
                    onChange={(e) => setManualClientId(e.target.value)}
                    readOnly={azureConfigured}
                    placeholder="Set via AZURE_CLIENT_ID env secret"
                    className="font-mono text-sm"
                    data-testid="input-azure-client-id"
                  />
                </div>
                {azureConfigured && (
                  <p className="text-xs text-muted-foreground">Managed via environment secret</p>
                )}
              </div>
              {azureConfigured && (
                <div className="space-y-2 md:col-span-2">
                  <Label>Redirect URI</Label>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={`${window.location.origin}/api/auth/callback`}
                      className="font-mono text-sm"
                      data-testid="input-redirect-uri"
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/api/auth/callback`);
                        toast({ title: "Copied", description: "Redirect URI copied to clipboard." });
                      }}
                      data-testid="button-copy-redirect-uri"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Add this URL to your Azure AD app registration's redirect URIs</p>
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter className="border-t p-4 flex justify-end">
            <Button
              data-testid="button-update-credentials"
              onClick={async () => {
                try {
                  const updates: Record<string, any> = {};
                  if (manualTenantId !== (tenant.azureTenantId || "")) {
                    updates.azureTenantId = manualTenantId || null;
                  }
                  if (!azureConfigured && manualClientId !== (tenant.azureClientId || "")) {
                    updates.azureClientId = manualClientId || null;
                  }
                  if (Object.keys(updates).length === 0) {
                    toast({ title: "No Changes", description: "No fields were modified." });
                    return;
                  }
                  const res = await fetch(`/api/tenants/${tenant.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(updates),
                  });
                  if (!res.ok) throw new Error(await res.text());
                  toast({ title: "Updated", description: "Azure AD configuration saved." });
                } catch (e: any) {
                  toast({ title: "Error", description: e.message, variant: "destructive" });
                }
              }}
            >
              Save Configuration
            </Button>
          </CardFooter>
        </Card>
      </div>
    </Shell>
  );
}
