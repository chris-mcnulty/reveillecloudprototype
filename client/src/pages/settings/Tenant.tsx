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
      { scope: "Sites.Read.All", purpose: "Site structure, lists, libraries, subsites, drives, site analytics", status: "required", api: "Graph" },
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
      { scope: "AuditLog.Read.All", purpose: "Sign-in logs, directory audits, provisioning logs, MFA events, risky sign-ins", status: "required", api: "Graph" },
      { scope: "Directory.Read.All", purpose: "User/group enumeration, license assignments, org settings, conditional access policies", status: "required", api: "Graph" },
      { scope: "User.Read.All", purpose: "User profiles, sign-in activity, account status, last sign-in timestamps", status: "required", api: "Graph" },
      { scope: "Group.Read.All", purpose: "M365 group membership, Teams-connected groups, security groups", status: "required", api: "Graph" },
      { scope: "IdentityRiskyUser.Read.All", purpose: "Users flagged by Entra ID Protection (compromised credentials, impossible travel)", status: "recommended", api: "Graph" },
      { scope: "Policy.Read.All", purpose: "Conditional access policies, authentication methods, MFA registration status", status: "recommended", api: "Graph" },
    ],
  },
  serviceHealth: {
    label: "Service Health & Communications",
    color: "bg-[#D83B01]",
    permissions: [
      { scope: "ServiceHealth.Read.All", purpose: "Service incidents, advisories, planned maintenance for all M365 services", status: "required", api: "Graph" },
      { scope: "ServiceMessage.Read.All", purpose: "Message center posts — upcoming feature changes, retirements, required actions", status: "required", api: "Graph" },
    ],
  },
  auditActivity: {
    label: "Unified Audit Log (Activity Feed)",
    color: "bg-[#107C10]",
    permissions: [
      { scope: "ActivityFeed.Read", purpose: "All audit events: SharePoint file access, sharing, permissions, OneDrive sync, Teams, Exchange, Power Platform", status: "required", api: "Office 365 Management" },
      { scope: "ActivityFeed.ReadDlp", purpose: "DLP policy match events — sensitive content detection across SharePoint, OneDrive, Exchange", status: "recommended", api: "Office 365 Management" },
      { scope: "ServiceHealth.Read", purpose: "Service communications via Management API (alternative to Graph)", status: "optional", api: "Office 365 Management" },
    ],
  },
  teams: {
    label: "Microsoft Teams",
    color: "bg-[#6264A7]",
    permissions: [
      { scope: "Reports.Read.All", purpose: "Teams messages, calls, meetings, device usage per user", status: "recommended", api: "Graph" },
      { scope: "TeamSettings.Read.All", purpose: "Teams configuration, channel settings, app installations", status: "optional", api: "Graph" },
    ],
  },
  exchange: {
    label: "Exchange Online / Outlook",
    color: "bg-[#0078D4]",
    permissions: [
      { scope: "Reports.Read.All", purpose: "Email sends/reads/receives, mailbox usage, app breakdown (Outlook/OWA/Mobile)", status: "recommended", api: "Graph" },
      { scope: "MailboxSettings.Read", purpose: "Mailbox configurations, auto-replies, forwarding rules, regional settings", status: "optional", api: "Graph" },
    ],
  },
  m365Apps: {
    label: "Microsoft 365 Apps (Office)",
    color: "bg-[#D83B01]",
    permissions: [
      { scope: "Reports.Read.All", purpose: "Per-user app usage across Word, Excel, PowerPoint, Outlook, Teams, OneDrive clients", status: "recommended", api: "Graph" },
    ],
  },
  security: {
    label: "Security & Compliance",
    color: "bg-[#E3008C]",
    permissions: [
      { scope: "SecurityEvents.Read.All", purpose: "Security alerts from Microsoft Defender for Office 365, Defender for Endpoint", status: "recommended", api: "Graph" },
      { scope: "SecurityActions.Read.All", purpose: "Security remediation actions, alert investigation status", status: "optional", api: "Graph" },
      { scope: "ThreatAssessment.Read.All", purpose: "Threat assessment requests (URL/file/email threat evaluation)", status: "optional", api: "Graph" },
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
  const [expanded, setExpanded] = useState(true);

  const sections = [
    {
      category: "Critical — Must Have",
      categoryColor: "text-red-600",
      items: [
        {
          title: "1. Enable Unified Audit Logging (UAL)",
          where: "Microsoft Purview portal (purview.microsoft.com) > Audit",
          steps: [
            "Navigate to purview.microsoft.com > Solutions > Audit (or search 'Audit' in the top search bar)",
            "If auditing is not enabled, you'll see a banner prompting you to turn it on — click 'Start recording user and admin activity'",
            "For tenants created after January 2019, UAL is typically enabled by default",
            "Verify via Exchange Online PowerShell: Connect-ExchangeOnline, then:",
            "Get-AdminAuditLogConfig | Format-List UnifiedAuditLogIngestionEnabled (must be True)",
            "If False, enable it: Set-AdminAuditLogConfig -UnifiedAuditLogIngestionEnabled $true",
            "Note: Changes can take up to 60 minutes to take effect across the tenant",
          ],
          impact: "This is the master switch. Without UAL enabled, Microsoft records NO audit events — all audit collectors will return empty results regardless of permissions.",
        },
        {
          title: "2. Register Office 365 Management API Permissions",
          where: "Azure Portal > Entra ID > App registrations > Reveille Cloud > API permissions",
          steps: [
            "Click 'Add a permission'",
            "Select 'APIs my organization uses' tab (NOT Microsoft Graph)",
            "Search for 'Office 365 Management APIs' and select it",
            "Choose Application permissions > ActivityFeed > check ActivityFeed.Read",
            "Also check ActivityFeed.ReadDlp (for DLP/sensitive content events)",
            "Click 'Add permissions', then click 'Grant admin consent for [your directory]'",
          ],
          impact: "This is separate from Microsoft Graph. Without it, Reveille only gets Entra ID directory audits — NOT SharePoint file operations, sharing events, permission changes, or search queries.",
        },
        {
          title: "3. Grant Admin Consent for Microsoft Graph Permissions",
          where: "Azure Portal > Entra ID > App registrations > Reveille Cloud > API permissions",
          steps: [
            "Add all Microsoft Graph Application permissions listed in the 'Permissions by Workload' section above",
            "After adding, click 'Grant admin consent for [your directory]'",
            "Verify all permissions show a green checkmark under 'Status' (Granted for [tenant])",
            "If status shows 'Not granted', a Global Administrator must click 'Grant admin consent' again",
          ],
          impact: "Without admin consent, the app registration has permissions listed but cannot actually use them. Each permission must show 'Granted' status.",
        },
      ],
    },
    {
      category: "Important — Enables Key Data Sources",
      categoryColor: "text-amber-600",
      items: [
        {
          title: "4. Verify Mailbox Auditing is Enabled",
          where: "Exchange Online PowerShell (Connect-ExchangeOnline)",
          steps: [
            "Check org-wide: Get-OrganizationConfig | Format-List AuditDisabled",
            "If AuditDisabled is True, enable it: Set-OrganizationConfig -AuditDisabled $false",
            "Mailbox auditing is on by default for E3/E5 licenses since January 2019",
            "For per-user override: Get-Mailbox -Identity user@domain.com | Format-List AuditEnabled",
            "Enable advanced events (E5): Set-Mailbox -Identity user@domain.com -AuditOwner @{Add='MailItemsAccessed','Send'}",
          ],
          impact: "Enables Exchange audit events in the unified audit log. Without this, email access/send/delete events won't appear in Reveille's audit data.",
        },
        {
          title: "5. Configure SharePoint Audit Settings",
          where: "SharePoint admin center (tenant-admin.sharepoint.com) > Settings",
          steps: [
            "Navigate to your SharePoint admin center: https://[tenant]-admin.sharepoint.com",
            "Tenant-wide auditing is controlled by the Unified Audit Log (step 1) — no separate SharePoint toggle needed in modern tenants",
            "Site-level audit settings (classic): Site Settings > Site Collection Administration > Audit settings",
            "Classic audit settings allow enabling: Opening/downloading, Editing, Checking in/out, Moving/copying, Deleting/restoring",
            "Note: Classic site-level audit settings only apply to classic site collections — modern sites rely entirely on the Unified Audit Log",
            "Retention: Controlled via Microsoft Purview > Audit > Audit retention policies (E5 required for custom retention beyond 180 days)",
          ],
          impact: "For modern SharePoint Online sites, most audit events are captured automatically by the Unified Audit Log. Classic site-level audit settings are only relevant for legacy classic site collections.",
        },
        {
          title: "6. Enable Microsoft Defender for Office 365 Alerts",
          where: "Microsoft Defender portal (security.microsoft.com)",
          steps: [
            "Navigate to security.microsoft.com (now unified as 'Microsoft Defender' — formerly 'Microsoft 365 Defender')",
            "Defender for Office 365 Plan 1 (included in E5, or available as add-on): enables Safe Links, Safe Attachments, anti-phishing policies",
            "Alert policies: In the left sidebar, expand Email & collaboration > Policies & rules > Alert policy",
            "Key built-in alert policies: Suspicious email sending patterns, Malware campaign detected, Phishing delivered due to override, Unusual volume of file deletion",
            "Custom alert policies: Create alert policies for specific activities relevant to SharePoint monitoring",
            "Threat policies: Email & collaboration > Policies & rules > Threat policies (Safe Links, Safe Attachments, Anti-phishing)",
            "Note: Requires at least one Defender for Office 365 license in the tenant for security alerts to be generated",
          ],
          impact: "Feeds security alerts into the SecurityEvents.Read.All Graph API. Without Defender for Office 365 licensed and configured, the security alert collector returns no data.",
        },
        {
          title: "7. Verify Conditional Access Policy Logging",
          where: "Entra admin center (entra.microsoft.com) > Protection > Conditional Access",
          steps: [
            "Ensure 'Report-only' or 'On' mode for conditional access policies you want to monitor",
            "Review: Protection > Conditional Access > Named locations (used in sign-in risk assessment)",
            "Enable: Protection > Authentication methods > Registration campaign (tracks MFA adoption)",
            "Note: Policy.Read.All permission lets Reveille read these policies for correlation with sign-in events",
          ],
          impact: "Sign-in logs include conditional access evaluation results. Without policies configured, this data dimension is empty.",
        },
      ],
    },
    {
      category: "Advanced — Maximum Observability",
      categoryColor: "text-blue-600",
      items: [
        {
          title: "8. Microsoft Purview Audit (Premium) for Advanced Events",
          where: "Microsoft 365 admin center (admin.microsoft.com) > Billing > Licenses",
          steps: [
            "Requires one of: Microsoft 365 E5, Microsoft 365 E5 Compliance, or Microsoft 365 E5 eDiscovery & Audit add-on",
            "Audit (Premium) unlocks these additional event types (not available with E3/standard audit):",
            "MailItemsAccessed — records every time a mail item is accessed (critical for breach investigation)",
            "SearchQueryInitiatedSharePoint — captures the actual search terms users entered in SharePoint",
            "SearchQueryInitiatedExchange — captures mailbox search queries in Outlook/OWA",
            "Send — detailed email send events including recipient and attachment metadata",
            "Audit (Standard) retention: 180 days for most events (E3/E5)",
            "Audit (Premium) retention: default 1 year for E5 users, configurable up to 10 years with Audit retention policies in Purview",
            "Users must be assigned an E5 license (or the appropriate add-on) individually — it is per-user, not tenant-wide",
          ],
          impact: "Without E5 licensing per user, SearchQueryInitiated events and MailItemsAccessed are not recorded at all. Standard audit (E3) retains logs for 180 days with no custom retention options.",
        },
        {
          title: "9. Enable Power Platform Audit Logging",
          where: "Power Platform admin center (admin.powerplatform.microsoft.com)",
          steps: [
            "Navigate to Environments > select environment > Settings > Audit and logs",
            "Enable 'Start Auditing' for each environment you want to monitor",
            "These events appear in the Audit.General content type in the Management Activity API",
            "Key events: FlowCreated, FlowModified, AppPublished, EnvironmentProvisioned",
          ],
          impact: "Power Platform (Power Automate, Power Apps) events are only recorded when environment-level auditing is enabled. Without this, no Power Platform events flow to Reveille.",
        },
        {
          title: "10. Configure Information Protection Labels",
          where: "Microsoft Purview portal (purview.microsoft.com) > Information protection",
          steps: [
            "Create and publish sensitivity labels if not already configured",
            "Enable auto-labeling policies for SharePoint/OneDrive content",
            "ActivityFeed.ReadDlp permission lets Reveille see when labels are applied/changed",
            "This enables correlation: 'how is sensitive content being accessed and shared?'",
          ],
          impact: "DLP and sensitivity label events only exist when Information Protection is configured. These provide critical security context about content classification.",
        },
      ],
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
        <span className="text-sm font-medium flex-1">M365 Tenant Configuration Checklist (10 Steps)</span>
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {expanded && (
        <div className="space-y-4 pt-1">
          <p className="text-xs text-muted-foreground">
            These steps must be completed by a Global Administrator in each monitored tenant. Permissions alone are not enough — Microsoft must also be configured to <span className="font-medium text-foreground">generate</span> the audit data in the first place.
          </p>
          {sections.map((section) => (
            <div key={section.category} className="space-y-2">
              <h4 className={`text-xs font-bold uppercase tracking-wider ${section.categoryColor}`}>{section.category}</h4>
              {section.items.map((item) => (
                <div key={item.title} className="border rounded-lg p-3 space-y-2">
                  <div>
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.where}</p>
                  </div>
                  <ul className="space-y-0.5 ml-4">
                    {item.steps.map((step, sIdx) => (
                      <li key={sIdx} className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <span className="text-primary/50 mt-0.5 shrink-0">-</span>
                        <span className={step.startsWith("Get-") || step.startsWith("Set-") || step.startsWith("Connect-") ? "font-mono" : ""}>{step}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="ml-4 p-2 bg-primary/5 rounded text-xs text-primary/80 font-medium">{item.impact}</div>
                </div>
              ))}
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
