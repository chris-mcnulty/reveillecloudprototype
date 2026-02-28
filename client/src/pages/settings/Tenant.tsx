import { Shell } from "@/components/layout/Shell";
import { SettingsNav } from "@/components/layout/SettingsNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldAlert, Key, CheckCircle2, Copy, Cloud, Loader2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useActiveTenant } from "@/lib/tenant-context";
import { useConsentTenant, useRevokeConsent } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export default function TenantSettings() {
  const { activeTenantId, orgTenants } = useActiveTenant();
  const consentMutation = useConsentTenant();
  const revokeMutation = useRevokeConsent();
  const { toast } = useToast();

  const tenant = orgTenants.find(t => t.id === activeTenantId);

  const isConnected = tenant?.consentStatus === "Connected";
  const isPending = !isConnected;

  const handleGrantConsent = async () => {
    if (!tenant) return;
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
                  You will be redirected to sign in as a Global Administrator.
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
                disabled={consentMutation.isPending}
                data-testid="button-grant-consent"
              >
                {consentMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Grant Admin Consent
              </Button>
            )}
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-primary" />
              <CardTitle>Granted Scopes</CardTitle>
            </div>
            <CardDescription>The permissions currently authorized for the collector</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {[
                { scope: "Sites.Read.All", desc: "Read items in all site collections" },
                { scope: "Reports.Read.All", desc: "Read usage reports for SharePoint" },
                { scope: "AuditLog.Read.All", desc: "Read all audit log data" },
                { scope: "Files.ReadWrite.All", desc: "Required for synthetic file uploads" },
              ].map((s) => (
                <li key={s.scope} className="flex items-start gap-2">
                  <div className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${isConnected ? "bg-primary" : "bg-muted-foreground"}`} />
                  <div>
                    <p className="text-sm font-mono font-medium">{s.scope}</p>
                    <p className="text-xs text-muted-foreground">{s.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
          {isConnected && (
            <CardFooter className="border-t bg-muted/10 p-4">
              <Button variant="secondary" className="w-full" data-testid="button-request-scopes">Request Additional Scopes</Button>
            </CardFooter>
          )}
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Key className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Manual Configuration (Fallback)</CardTitle>
            </div>
            <CardDescription>If automated Azure AD consent is restricted, configure an App Registration manually.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Directory (tenant) ID</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={tenant.azureTenantId || "Not yet configured"}
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
                    placeholder="Enter your App ID"
                    className="font-mono text-sm"
                    defaultValue={tenant.azureClientId || ""}
                    data-testid="input-azure-client-id"
                  />
                </div>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Client Secret</Label>
                <Input type="password" placeholder="••••••••••••••••••••••••" data-testid="input-client-secret" />
                <p className="text-xs text-muted-foreground mt-1">Stored securely in Azure Key Vault. Never displayed again.</p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="border-t p-4 flex justify-end">
            <Button data-testid="button-update-credentials">Update Credentials</Button>
          </CardFooter>
        </Card>
      </div>
    </Shell>
  );
}
