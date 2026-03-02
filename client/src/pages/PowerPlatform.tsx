import { useQuery } from "@tanstack/react-query";
import { useActiveTenant } from "@/lib/tenant-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Layers, Zap, Bot, AppWindow, AlertCircle, Globe2, Server } from "lucide-react";

interface PPEnvironment {
  id: string;
  tenantId: string;
  environmentId: string;
  displayName: string;
  environmentType: string | null;
  region: string | null;
  state: string | null;
  properties: Record<string, any> | null;
  collectedAt: string;
}

interface PPResource {
  id: string;
  tenantId: string;
  environmentId: string;
  resourceType: string;
  resourceId: string;
  displayName: string;
  owner: string | null;
  status: string | null;
  lastModifiedDate: string | null;
  lastRunDate: string | null;
  details: Record<string, any> | null;
  collectedAt: string;
}

interface PPStats {
  environments: number;
  environmentsByType: Record<string, number>;
  resourcesByType: Record<string, number>;
  totalResources: number;
}

function envTypeBadge(type: string | null) {
  const t = (type || "Unknown").toLowerCase();
  if (t.includes("default") || t.includes("production")) return <Badge data-testid="badge-env-production" className="bg-blue-600">{type}</Badge>;
  if (t.includes("sandbox")) return <Badge data-testid="badge-env-sandbox" variant="secondary">{type}</Badge>;
  if (t.includes("developer") || t.includes("dev")) return <Badge data-testid="badge-env-developer" variant="outline">{type}</Badge>;
  if (t.includes("trial")) return <Badge data-testid="badge-env-trial" className="bg-orange-500">{type}</Badge>;
  return <Badge data-testid="badge-env-unknown" variant="outline">{type || "Unknown"}</Badge>;
}

function statusBadge(status: string | null) {
  const s = (status || "").toLowerCase();
  if (s === "started" || s === "ready" || s === "running") return <Badge data-testid="badge-status-active" className="bg-green-600">Active</Badge>;
  if (s === "suspended" || s === "stopped") return <Badge data-testid="badge-status-suspended" variant="destructive">Suspended</Badge>;
  if (s === "disabled") return <Badge data-testid="badge-status-disabled" variant="secondary">Disabled</Badge>;
  return <Badge data-testid="badge-status-other" variant="outline">{status || "Unknown"}</Badge>;
}

function ResourceIcon({ type }: { type: string }) {
  switch (type) {
    case "app": return <AppWindow className="h-4 w-4 text-purple-500" />;
    case "flow": return <Zap className="h-4 w-4 text-blue-500" />;
    case "bot": return <Bot className="h-4 w-4 text-green-500" />;
    default: return <Layers className="h-4 w-4 text-gray-500" />;
  }
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export default function PowerPlatform() {
  const { activeTenantId } = useActiveTenant();

  const { data: stats } = useQuery<PPStats>({
    queryKey: ["/api/tenants", activeTenantId, "power-platform", "stats"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${activeTenantId}/power-platform/stats`);
      return res.json();
    },
    enabled: !!activeTenantId,
    refetchInterval: 60000,
  });

  const { data: environments = [] } = useQuery<PPEnvironment[]>({
    queryKey: ["/api/tenants", activeTenantId, "power-platform", "environments"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${activeTenantId}/power-platform/environments`);
      return res.json();
    },
    enabled: !!activeTenantId,
    refetchInterval: 60000,
  });

  const { data: resources = [] } = useQuery<PPResource[]>({
    queryKey: ["/api/tenants", activeTenantId, "power-platform", "resources"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${activeTenantId}/power-platform/resources`);
      return res.json();
    },
    enabled: !!activeTenantId,
    refetchInterval: 60000,
  });

  const apps = resources.filter(r => r.resourceType === "app");
  const flows = resources.filter(r => r.resourceType === "flow");
  const bots = resources.filter(r => r.resourceType === "bot");

  if (!activeTenantId) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 mb-6">
          <Layers className="h-6 w-6" />
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Power Platform</h1>
        </div>
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            <AlertCircle className="h-8 w-8 mx-auto mb-2" />
            <p data-testid="text-no-tenant">Select a tenant to view Power Platform data</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Layers className="h-6 w-6" />
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Power Platform</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card data-testid="card-environments">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Environments</CardTitle>
            <Globe2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-env-count">{stats?.environments || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.environmentsByType ? Object.entries(stats.environmentsByType).map(([t, c]) => `${c} ${t}`).join(", ") : "No data yet"}
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-apps">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Power Apps</CardTitle>
            <AppWindow className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-app-count">{stats?.resourcesByType?.app || 0}</div>
            <p className="text-xs text-muted-foreground">Canvas & model-driven apps</p>
          </CardContent>
        </Card>

        <Card data-testid="card-flows">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Power Automate</CardTitle>
            <Zap className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-flow-count">{stats?.resourcesByType?.flow || 0}</div>
            <p className="text-xs text-muted-foreground">Automated flows</p>
          </CardContent>
        </Card>

        <Card data-testid="card-bots">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Copilot Studio</CardTitle>
            <Bot className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-bot-count">{stats?.resourcesByType?.bot || 0}</div>
            <p className="text-xs text-muted-foreground">Bots & agents</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="environments" className="space-y-4">
        <TabsList data-testid="tabs-pp">
          <TabsTrigger value="environments" data-testid="tab-environments">Environments</TabsTrigger>
          <TabsTrigger value="apps" data-testid="tab-apps">Power Apps ({apps.length})</TabsTrigger>
          <TabsTrigger value="flows" data-testid="tab-flows">Flows ({flows.length})</TabsTrigger>
          <TabsTrigger value="bots" data-testid="tab-bots">Bots ({bots.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="environments">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                Environments
              </CardTitle>
            </CardHeader>
            <CardContent>
              {environments.length === 0 ? (
                <p className="text-muted-foreground text-center py-8" data-testid="text-no-environments">
                  No Power Platform environments discovered yet. Data will appear after the next collection cycle.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Region</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Created By</TableHead>
                      <TableHead>Last Collected</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {environments.map((env) => (
                      <TableRow key={env.id} data-testid={`row-env-${env.environmentId}`}>
                        <TableCell className="font-medium">{env.displayName}</TableCell>
                        <TableCell>{envTypeBadge(env.environmentType)}</TableCell>
                        <TableCell>{env.region || "—"}</TableCell>
                        <TableCell>{statusBadge(env.state)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{env.properties?.createdBy || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDate(env.collectedAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="apps">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AppWindow className="h-5 w-5 text-purple-500" />
                Power Apps
              </CardTitle>
            </CardHeader>
            <CardContent>
              {apps.length === 0 ? (
                <p className="text-muted-foreground text-center py-8" data-testid="text-no-apps">
                  No Power Apps discovered yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>App Name</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Modified</TableHead>
                      <TableHead>Shared Users</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {apps.map((app) => (
                      <TableRow key={app.id} data-testid={`row-app-${app.resourceId}`}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <ResourceIcon type="app" />
                            {app.displayName}
                          </div>
                        </TableCell>
                        <TableCell>{app.owner || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{app.details?.appType || "Canvas"}</Badge>
                        </TableCell>
                        <TableCell>{statusBadge(app.status)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDate(app.lastModifiedDate)}</TableCell>
                        <TableCell>{app.details?.sharedUsersCount || 0}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="flows">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-blue-500" />
                Power Automate Flows
              </CardTitle>
            </CardHeader>
            <CardContent>
              {flows.length === 0 ? (
                <p className="text-muted-foreground text-center py-8" data-testid="text-no-flows">
                  No Power Automate flows discovered yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Flow Name</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Trigger</TableHead>
                      <TableHead>Actions</TableHead>
                      <TableHead>Last Modified</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {flows.map((flow) => (
                      <TableRow key={flow.id} data-testid={`row-flow-${flow.resourceId}`}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <ResourceIcon type="flow" />
                            {flow.displayName}
                          </div>
                        </TableCell>
                        <TableCell>{flow.owner || "—"}</TableCell>
                        <TableCell>{statusBadge(flow.status)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{flow.details?.triggerType || "Manual"}</Badge>
                        </TableCell>
                        <TableCell>{flow.details?.actionCount || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDate(flow.lastModifiedDate)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bots">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-green-500" />
                Copilot Studio Bots
              </CardTitle>
            </CardHeader>
            <CardContent>
              {bots.length === 0 ? (
                <p className="text-muted-foreground text-center py-8" data-testid="text-no-bots">
                  No Copilot Studio bots discovered yet. Bots will appear if the tenant has Copilot Studio licenses.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bot Name</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Last Modified</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bots.map((bot) => (
                      <TableRow key={bot.id} data-testid={`row-bot-${bot.resourceId}`}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <ResourceIcon type="bot" />
                            {bot.displayName}
                          </div>
                        </TableCell>
                        <TableCell>{bot.owner || "—"}</TableCell>
                        <TableCell>{statusBadge(bot.status)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{bot.details?.botType || "Copilot"}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDate(bot.lastModifiedDate)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
