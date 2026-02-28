import { Shell } from "@/components/layout/Shell";
import { SettingsNav } from "@/components/layout/SettingsNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Globe, Search, ShieldCheck, FileUp, Plus, Play, Loader2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { useTenants, useAllTests, useRunTest, useTestRuns, useSharePointStatus, useCreateTest, useUpdateTest, useDeleteTest } from "@/lib/api";
import type { SyntheticTest } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

const typeIcons: Record<string, any> = {
  "Page Load": Globe,
  "File Transfer": FileUp,
  "Search": Search,
  "Authentication": ShieldCheck,
};

export default function TestsConfig() {
  const { data: tenants } = useTenants();
  const { data: allTests } = useAllTests();
  const { data: spStatus } = useSharePointStatus();
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null);
  const runTest = useRunTest();
  const updateTest = useUpdateTest();
  const deleteTest = useDeleteTest();
  const createTest = useCreateTest();
  const { data: testRuns } = useTestRuns(selectedTestId);
  const { toast } = useToast();

  const activeTenantId = selectedTenantId || tenants?.[0]?.id || null;
  const tests = allTests?.filter(t => t.tenantId === activeTenantId) || [];
  const selectedTest = tests.find(t => t.id === selectedTestId) || tests[0] || null;
  const activeTestId = selectedTest?.id || null;

  const handleRunTest = () => {
    if (!activeTestId) return;
    runTest.mutate(activeTestId, {
      onSuccess: (data: any) => {
        toast({
          title: data.status === "success" ? "Test Passed" : data.status === "error" ? "Test Error" : "Test Failed",
          description: data.error || `Completed in ${data.durationMs}ms`,
          variant: data.status === "success" ? "default" : "destructive",
        });
      },
      onError: (err: any) => {
        toast({ title: "Run Failed", description: err.message, variant: "destructive" });
      },
    });
  };

  const handleDeleteTest = () => {
    if (!activeTestId) return;
    if (!confirm("Delete this test permanently?")) return;
    deleteTest.mutate(activeTestId, {
      onSuccess: () => {
        setSelectedTestId(null);
        toast({ title: "Test Deleted" });
      },
    });
  };

  const Icon = selectedTest ? (typeIcons[selectedTest.type] || Globe) : Globe;

  return (
    <Shell>
      <div className="flex items-center justify-between space-y-2 mb-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">Tenant Configuration</h2>
          <p className="text-muted-foreground">
            Manage Azure AD integration, synthetic tests, and alert rules.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {spStatus && (
            <Badge variant={spStatus.connected ? "default" : "secondary"} className="gap-1" data-testid="badge-sp-status">
              {spStatus.connected ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
              {spStatus.connected ? "Graph Connected" : "Graph Disconnected"}
            </Badge>
          )}
          <Select value={activeTenantId || ""} onValueChange={v => { setSelectedTenantId(v); setSelectedTestId(null); }}>
            <SelectTrigger className="w-[200px]" data-testid="select-tenant">
              <SelectValue placeholder="Select tenant" />
            </SelectTrigger>
            <SelectContent>
              {tenants?.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <SettingsNav />

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-1 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Test Profiles</CardTitle>
              <CardDescription>
                {tests.length} synthetic transaction{tests.length !== 1 ? "s" : ""} configured
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="flex flex-col divide-y">
                {tests.length === 0 && (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    No tests configured for this tenant.
                  </div>
                )}
                {tests.map((test) => {
                  const TIcon = typeIcons[test.type] || Globe;
                  return (
                    <button
                      key={test.id}
                      data-testid={`button-test-${test.id}`}
                      onClick={() => setSelectedTestId(test.id)}
                      className={`flex items-start text-left gap-4 p-4 hover:bg-muted/50 transition-colors w-full ${test.id === activeTestId ? "bg-muted/60" : ""}`}
                    >
                      <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                        <TIcon className="h-4 w-4" />
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
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-2 space-y-6">
          {selectedTest ? (
            <>
              <Card>
                <CardHeader className="flex flex-row items-start justify-between bg-muted/20 border-b">
                  <div>
                    <div className="flex items-center gap-2">
                      <Icon className="h-5 w-5 text-primary" />
                      <CardTitle>{selectedTest.name}</CardTitle>
                      <Badge variant="outline" className={`ml-2 ${selectedTest.status === "Active" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-muted text-muted-foreground"}`}>
                        {selectedTest.status}
                      </Badge>
                    </div>
                    <CardDescription className="mt-1.5">{selectedTest.type} Test via Microsoft Graph</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRunTest}
                      disabled={runTest.isPending}
                      data-testid="button-run-now"
                    >
                      {runTest.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                      Run Now
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-6 space-y-8">
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-medium mb-4">Target Configuration</h3>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="url">Target URL (Site or Page)</Label>
                          <Input id="url" defaultValue={selectedTest.target} data-testid="input-target-url" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="auth">Authentication Context</Label>
                          <Select defaultValue={selectedTest.authContext || "delegated"}>
                            <SelectTrigger id="auth" data-testid="select-auth-context">
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
                          <Select defaultValue={selectedTest.interval?.replace(/ min/, "") || "5"}>
                            <SelectTrigger id="interval" data-testid="select-interval">
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
                          <Select defaultValue={String(selectedTest.timeout || 30)}>
                            <SelectTrigger id="timeout" data-testid="select-timeout">
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
                          <Switch defaultChecked={selectedTest.collectNetworkPhases ?? true} data-testid="switch-network-phases" />
                        </div>
                        <div className="flex items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <Label className="text-base">DOM Interaction Time</Label>
                            <p className="text-sm text-muted-foreground">
                              Measure time to DOM interactive and completely loaded states.
                            </p>
                          </div>
                          <Switch defaultChecked={selectedTest.collectDomTiming ?? true} data-testid="switch-dom-timing" />
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="bg-muted/10 border-t p-6 flex justify-between">
                  <Button variant="destructive" size="sm" onClick={handleDeleteTest} data-testid="button-delete-test">Delete Test</Button>
                  <Button data-testid="button-save-config">Save Configuration</Button>
                </CardFooter>
              </Card>

              {testRuns && testRuns.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Recent Runs</CardTitle>
                    <CardDescription>Last {testRuns.length} execution{testRuns.length !== 1 ? "s" : ""}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {testRuns.map((run) => (
                        <div key={run.id} className="flex items-center justify-between p-3 rounded-lg border" data-testid={`row-test-run-${run.id}`}>
                          <div className="flex items-center gap-3">
                            {run.status === "success" && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                            {run.status === "failed" && <XCircle className="h-4 w-4 text-red-500" />}
                            {run.status === "error" && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                            {run.status === "running" && <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />}
                            <div>
                              <p className="text-sm font-medium capitalize">{run.status}</p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(run.startedAt).toLocaleString()}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            {run.durationMs != null && (
                              <p className="text-sm font-mono">{Math.round(run.durationMs)}ms</p>
                            )}
                            {run.error && (
                              <p className="text-xs text-red-500 max-w-[300px] truncate">{run.error}</p>
                            )}
                            {run.results && !run.error && (
                              <p className="text-xs text-muted-foreground">
                                {Object.entries(run.results as Record<string, any>)
                                  .filter(([k, v]) => k.endsWith("Ms") && typeof v === "number")
                                  .map(([k, v]) => `${k.replace("Ms", "")}: ${Math.round(v as number)}ms`)
                                  .join(" | ")}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Clock className="h-12 w-12 text-muted-foreground/40 mb-4" />
                <h3 className="text-lg font-medium mb-2">No Test Selected</h3>
                <p className="text-sm text-muted-foreground mb-4">Select a test from the sidebar or create a new one.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </Shell>
  );
}
