import { Shell } from "@/components/layout/Shell";
import { SettingsNav } from "@/components/layout/SettingsNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, Mail, MessageSquare, Plus, Webhook } from "lucide-react";

export default function AlertRulesConfig() {
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