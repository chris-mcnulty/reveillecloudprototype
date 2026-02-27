import { Shell } from "@/components/layout/Shell";
import { SettingsNav } from "@/components/layout/SettingsNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Globe, Search, ShieldCheck, FileUp, Plus, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const configuredTests = [
  { id: "tx-pl-1", name: "Main Hub Load", type: "Page Load", target: "https://hub.sharepoint.com", interval: "5 min", status: "Active", icon: Globe },
  { id: "tx-fu-1", name: "Documents Library Upload", type: "File Transfer", target: "/sites/docs/Shared Documents", interval: "15 min", status: "Active", icon: FileUp },
  { id: "tx-sq-1", name: "People Search", type: "Search", target: "query='marketing'", interval: "10 min", status: "Paused", icon: Search },
  { id: "tx-au-1", name: "Token Acquisition", type: "Authentication", target: "login.microsoftonline.com", interval: "5 min", status: "Active", icon: ShieldCheck },
];

export default function TestsConfig() {
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
          <Plus className="mr-2 h-4 w-4" /> Create Test
        </Button>
      </div>

      <SettingsNav />

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-1 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Test Profiles</CardTitle>
              <CardDescription>Active synthetic transactions</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="flex flex-col divide-y">
                {configuredTests.map((test) => (
                  <button key={test.id} className="flex items-start text-left gap-4 p-4 hover:bg-muted/50 transition-colors w-full">
                    <div className={`p-2 rounded-lg bg-primary/10 text-primary shrink-0`}>
                      <test.icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 space-y-1 overflow-hidden">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium leading-none">{test.name}</p>
                        <Badge variant={test.status === "Active" ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                          {test.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{test.type} • Every {test.interval}</p>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between bg-muted/20 border-b">
              <div>
                <div className="flex items-center gap-2">
                  <Globe className="h-5 w-5 text-primary" />
                  <CardTitle>Main Hub Load</CardTitle>
                  <Badge variant="outline" className="ml-2 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Active</Badge>
                </div>
                <CardDescription className="mt-1.5">Page Load Test via Headless Browser</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm">Run Now</Button>
                <Button variant="secondary" size="sm"><Settings2 className="h-4 w-4 mr-2" /> Settings</Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-8">
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium mb-4">Target Configuration</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="url">Target URL (Site or Page)</Label>
                      <Input id="url" defaultValue="https://hub.sharepoint.com" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="auth">Authentication Context</Label>
                      <Select defaultValue="delegated">
                        <SelectTrigger id="auth">
                          <SelectValue placeholder="Select auth" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="delegated">Delegated (Test User)</SelectItem>
                          <SelectItem value="app">App-Only Token</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                
                <div className="border-t pt-4">
                  <h3 className="text-sm font-medium mb-4">Execution Schedule</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="interval">Test Interval</Label>
                      <Select defaultValue="5">
                        <SelectTrigger id="interval">
                          <SelectValue placeholder="Select interval" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Every 1 minute</SelectItem>
                          <SelectItem value="5">Every 5 minutes</SelectItem>
                          <SelectItem value="15">Every 15 minutes</SelectItem>
                          <SelectItem value="60">Every hour</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="timeout">Timeout Threshold</Label>
                      <Select defaultValue="30">
                        <SelectTrigger id="timeout">
                          <SelectValue placeholder="Select timeout" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10">10 seconds</SelectItem>
                          <SelectItem value="30">30 seconds</SelectItem>
                          <SelectItem value="60">60 seconds</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h3 className="text-sm font-medium mb-4">Metrics Collection</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <Label className="text-base">Network Phases</Label>
                        <p className="text-sm text-muted-foreground">
                          Record DNS, TCP, TLS, and TTFB latency breakdowns.
                        </p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <Label className="text-base">DOM Interaction Time</Label>
                        <p className="text-sm text-muted-foreground">
                          Measure time to DOM interactive and completely loaded states.
                        </p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="bg-muted/10 border-t p-6 flex justify-between">
              <Button variant="destructive" size="sm">Delete Test</Button>
              <Button>Save Configuration</Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </Shell>
  );
}