import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, ShieldCheck, Activity, CheckCircle2, ArrowRight, ArrowLeft, Cloud, Loader2 } from "lucide-react";
import { useCreateTenant, useCreateSystem, useCreateTest } from "@/lib/api";
import { useActiveTenant } from "@/lib/tenant-context";
import logoUrl from "@assets/Reveille_Icon_V1_PNG_1772142507568.png";
import logoUrlDark from "@assets/Reveille_Icon_V1_White_1772142521711.png";

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const [, setLocation] = useLocation();
  const [orgName, setOrgName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [primaryDomain, setPrimaryDomain] = useState("");
  const [azureTenantId, setAzureTenantId] = useState("");
  const [createdTenantId, setCreatedTenantId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { organization } = useActiveTenant();
  const createTenant = useCreateTenant();
  const createSystem = useCreateSystem();
  const createTest = useCreateTest();

  const handleNext = async () => {
    if (step === 1) {
      if (!orgName || !adminEmail || !primaryDomain) return;
      if (!organization?.id) {
        setError("No active organization found. Please select an organization first.");
        return;
      }
      setIsSubmitting(true);
      setError(null);
      try {
        const tenant = await createTenant.mutateAsync({
          organizationId: organization.id,
          name: orgName,
          adminEmail,
          primaryDomain,
          status: "Healthy",
          consentStatus: "Pending",
          azureTenantId: azureTenantId.trim() || null,
        });
        setCreatedTenantId(tenant.id);
        setStep(2);
      } catch (e: any) {
        setError(e?.message || "Failed to create tenant");
        console.error(e);
      } finally {
        setIsSubmitting(false);
      }
    } else if (step === 2) {
      if (createdTenantId) {
        setIsSubmitting(true);
        try {
          await createSystem.mutateAsync({
            tenantId: createdTenantId,
            name: "Microsoft 365",
            type: "m365",
            status: "Healthy",
            latency: "—",
          });
          await createTenant.mutateAsync;
        } catch (e) { /* ignore */ }
        setIsSubmitting(false);
      }
      setStep(3);
    } else if (step === 3) {
      if (createdTenantId) {
        setIsSubmitting(true);
        try {
          const domain = primaryDomain.replace(".onmicrosoft.com", "");
          await createTest.mutateAsync({
            tenantId: createdTenantId,
            name: `${orgName} Hub Load`,
            type: "Page Load",
            target: `https://${domain}.sharepoint.com`,
            interval: "5 min",
            status: "Active",
          });
          await createTest.mutateAsync({
            tenantId: createdTenantId,
            name: `${orgName} File Upload`,
            type: "File Transfer",
            target: `/sites/docs/Shared Documents`,
            interval: "15 min",
            status: "Active",
          });
        } catch (e) {
          console.error(e);
        } finally {
          setIsSubmitting(false);
        }
      }
      setStep(4);
    } else {
      setLocation("/");
    }
  };

  const handleBack = () => {
    if (step > 1 && step < 4) setStep(step - 1);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-3xl mb-8 flex justify-center">
        <img src={logoUrl} alt="Reveille Cloud" className="h-12 w-auto object-contain dark:hidden" />
        <img src={logoUrlDark} alt="Reveille Cloud" className="h-12 w-auto object-contain hidden dark:block" />
      </div>

      <div className="w-full max-w-3xl mb-8">
        <div className="flex items-center justify-between relative">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-muted -z-10 rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-500 ease-in-out"
              style={{ width: `${((step - 1) / 3) * 100}%` }}
            />
          </div>
          {[
            { num: 1, label: "Organization", icon: Building2 },
            { num: 2, label: "Azure AD", icon: ShieldCheck },
            { num: 3, label: "Initial Tests", icon: Activity },
            { num: 4, label: "Complete", icon: CheckCircle2 }
          ].map((s) => (
            <div key={s.num} className="flex flex-col items-center gap-2 bg-background px-2">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                step >= s.num ? "border-primary bg-primary text-primary-foreground" : "border-muted bg-background text-muted-foreground"
              }`}>
                <s.icon className="w-5 h-5" />
              </div>
              <span className={`text-xs font-medium ${step >= s.num ? "text-foreground" : "text-muted-foreground"}`}>
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <Card className="w-full max-w-3xl border-border shadow-lg">
        {step === 1 && (
          <>
            <CardHeader>
              <CardTitle className="text-2xl">Register Organization</CardTitle>
              <CardDescription>Let's start by creating a workspace for your tenant.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="org-name">Organization Name</Label>
                <Input data-testid="input-org-name" id="org-name" placeholder="e.g. Acme Corporation" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-email">Admin Email</Label>
                <Input data-testid="input-admin-email" id="admin-email" type="email" placeholder="admin@acmecorp.com" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="primary-domain">Primary Domain</Label>
                <Input data-testid="input-primary-domain" id="primary-domain" placeholder="acmecorp.onmicrosoft.com" value={primaryDomain} onChange={(e) => setPrimaryDomain(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="azure-tenant-id">Azure Tenant ID <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input data-testid="input-azure-tenant-id" id="azure-tenant-id" placeholder="e.g. 12345678-abcd-1234-abcd-1234567890ab" value={azureTenantId} onChange={(e) => setAzureTenantId(e.target.value)} />
                <p className="text-xs text-muted-foreground">Found in Azure Portal &gt; Entra ID &gt; Overview. Required for app-only authentication.</p>
              </div>
              {error && (
                <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-md">{error}</div>
              )}
            </CardContent>
          </>
        )}

        {step === 2 && (
          <>
            <CardHeader>
              <CardTitle className="text-2xl">Azure AD Consent</CardTitle>
              <CardDescription>Grant Reveille Cloud access to monitor your Microsoft 365 environment.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 bg-muted/30 rounded-lg border text-sm text-muted-foreground">
                <p className="mb-2">Reveille requires a multi-tenant app registration to access metrics. We request the following minimal scopes:</p>
                <ul className="list-disc list-inside ml-4 space-y-1 font-mono text-xs">
                  <li>Sites.Read.All</li>
                  <li>Reports.Read.All</li>
                  <li>AuditLog.Read.All</li>
                </ul>
              </div>
              <div className="flex flex-col items-center justify-center py-6 border-2 border-dashed rounded-lg bg-background">
                <Cloud className="h-12 w-12 text-primary mb-4" />
                <h3 className="text-lg font-medium mb-2">Connect to Microsoft 365</h3>
                <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
                  You will be redirected to the Microsoft login portal to sign in as a Global Administrator and grant consent.
                </p>
                <Button size="lg" className="w-full sm:w-auto bg-[#0078D4] hover:bg-[#0078D4]/90 text-white" data-testid="button-grant-consent">
                  Grant Admin Consent
                </Button>
              </div>
            </CardContent>
          </>
        )}

        {step === 3 && (
          <>
            <CardHeader>
              <CardTitle className="text-2xl">Configure Initial Tests</CardTitle>
              <CardDescription>Set up your first synthetic transactions to begin gathering performance baseline data.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-start space-x-3 p-4 border rounded-lg hover:border-primary/50 transition-colors">
                  <div className="mt-1">
                    <Input type="checkbox" id="test-1" className="h-4 w-4" defaultChecked />
                  </div>
                  <div className="grid gap-1.5 flex-1">
                    <Label htmlFor="test-1" className="text-base font-medium">Main SharePoint Hub Load</Label>
                    <p className="text-sm text-muted-foreground">Measures page load time for your root site collection every 5 minutes.</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3 p-4 border rounded-lg hover:border-primary/50 transition-colors">
                  <div className="mt-1">
                    <Input type="checkbox" id="test-2" className="h-4 w-4" defaultChecked />
                  </div>
                  <div className="grid gap-1.5 flex-1">
                    <Label htmlFor="test-2" className="text-base font-medium">OneDrive File Upload Baseline</Label>
                    <p className="text-sm text-muted-foreground">Uploads and deletes a 400KB file to measure data transfer latencies.</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3 p-4 border rounded-lg hover:border-primary/50 transition-colors">
                  <div className="mt-1">
                    <Input type="checkbox" id="test-3" className="h-4 w-4" />
                  </div>
                  <div className="grid gap-1.5 flex-1">
                    <Label htmlFor="test-3" className="text-base font-medium">Search Query Latency</Label>
                    <p className="text-sm text-muted-foreground">Executes a generic people search to track indexing and query performance.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </>
        )}

        {step === 4 && (
          <>
            <CardHeader className="text-center pb-2">
              <div className="mx-auto w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mb-4">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <CardTitle className="text-2xl">Onboarding Complete!</CardTitle>
              <CardDescription>Your tenant is fully configured and data collection has begun.</CardDescription>
            </CardHeader>
            <CardContent className="text-center pt-6">
              <p className="text-muted-foreground mb-6">
                It may take up to 15 minutes for the first synthetic metrics to appear on your dashboard.
              </p>
              {createdTenantId && (
                <div className="p-4 bg-muted/30 rounded-lg inline-block text-left mb-4">
                  <p className="text-sm font-medium mb-1">Tenant ID:</p>
                  <p data-testid="text-new-tenant-id" className="text-sm font-mono text-muted-foreground">{createdTenantId}</p>
                </div>
              )}
            </CardContent>
          </>
        )}

        <CardFooter className="flex justify-between border-t bg-muted/10 p-6">
          <Button 
            variant="outline" 
            onClick={handleBack}
            disabled={step === 1 || step === 4}
            className={step === 1 || step === 4 ? "invisible" : ""}
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Button onClick={handleNext} className="ml-auto" disabled={isSubmitting} data-testid="button-continue">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {step === 4 ? "Go to Dashboard" : "Continue"} <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
