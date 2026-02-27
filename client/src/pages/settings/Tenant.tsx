import { Shell } from "@/components/layout/Shell";
import { SettingsNav } from "@/components/layout/SettingsNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldAlert, Key, CheckCircle2, Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function TenantOnboarding() {
  return (
    <Shell>
      <div className="flex items-center justify-between space-y-2 mb-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Tenant Configuration</h2>
          <p className="text-muted-foreground">
            Manage Azure AD integration, synthetic tests, and alert rules.
          </p>
        </div>
      </div>
      
      <SettingsNav />

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-emerald-500/20 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <CardTitle>Connection Status</CardTitle>
            </div>
            <CardDescription>Azure AD Multi-Tenant Application Consent</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 border rounded-lg bg-emerald-500/5">
              <div className="space-y-1">
                <p className="text-sm font-medium">Acme Corp (t-001)</p>
                <p className="text-xs text-muted-foreground font-mono">123e4567-e89b-12d3-a456-426614174000</p>
              </div>
              <Badge className="bg-emerald-500">Connected</Badge>
            </div>
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">Consent granted by <span className="font-medium text-foreground">admin@acmecorp.com</span> on Oct 24, 2023.</p>
            </div>
          </CardContent>
          <CardFooter className="border-t bg-muted/10 p-4">
            <Button variant="outline" className="w-full text-destructive hover:bg-destructive/10">Revoke Consent</Button>
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
                  <div className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                  <div>
                    <p className="text-sm font-mono font-medium">{s.scope}</p>
                    <p className="text-xs text-muted-foreground">{s.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter className="border-t bg-muted/10 p-4">
            <Button variant="secondary" className="w-full">Request Additional Scopes</Button>
          </CardFooter>
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
                  <Input readOnly value="123e4567-e89b-12d3-a456-426614174000" className="font-mono text-sm" />
                  <Button size="icon" variant="outline" className="shrink-0"><Copy className="h-4 w-4" /></Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Application (client) ID</Label>
                <div className="flex gap-2">
                  <Input placeholder="Enter your App ID" className="font-mono text-sm" />
                </div>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Client Secret</Label>
                <Input type="password" placeholder="••••••••••••••••••••••••" />
                <p className="text-xs text-muted-foreground mt-1">Stored securely in Azure Key Vault. Never displayed again.</p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="border-t p-4 flex justify-end">
            <Button>Update Credentials</Button>
          </CardFooter>
        </Card>
      </div>
    </Shell>
  );
}