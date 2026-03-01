import { Shell } from "@/components/layout/Shell";
import { SettingsNav } from "@/components/layout/SettingsNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldAlert, Key, CheckCircle2, Copy, Cloud, Loader2, XCircle, ExternalLink, AlertTriangle, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useActiveTenant } from "@/lib/tenant-context";
import { useConsentTenant, useRevokeConsent, useAzureAppStatus, useConsentUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";

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
                  <li>Under <span className="font-medium">API permissions</span>, add Microsoft Graph Application permissions:
                    <span className="font-mono"> Reports.Read.All, ServiceHealth.Read.All, AuditLog.Read.All, Sites.Read.All</span>
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
              <CardTitle>Required Permissions</CardTitle>
            </div>
            <CardDescription>Microsoft Graph API permissions needed for monitoring</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {(azureAppStatus.data?.requiredPermissions || [
                "Reports.Read.All",
                "ServiceHealth.Read.All",
                "AuditLog.Read.All",
                "Sites.Read.All",
                "Files.ReadWrite.All",
              ]).map((scope) => {
                const descriptions: Record<string, string> = {
                  "Reports.Read.All": "SharePoint usage reports and analytics",
                  "ServiceHealth.Read.All": "M365 service health incidents and advisories",
                  "AuditLog.Read.All": "SharePoint audit log events",
                  "Sites.Read.All": "Read items in all site collections",
                  "Files.ReadWrite.All": "Required for synthetic file upload tests",
                };
                return (
                  <li key={scope} className="flex items-start gap-2">
                    <div className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${isConnected ? "bg-emerald-500" : "bg-muted-foreground"}`} />
                    <div>
                      <p className="text-sm font-mono font-medium">{scope}</p>
                      <p className="text-xs text-muted-foreground">{descriptions[scope] || scope}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            {!azureConfigured && (
              <p className="text-xs text-muted-foreground mt-4 border-t pt-3">
                These are <span className="font-medium">Application</span> permissions (not Delegated). They require admin consent and allow the app to access data without a signed-in user.
              </p>
            )}
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
