import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, Cloud, Server, Database, ArrowRight, Activity, AlertTriangle, Globe, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { useTenants, useAllSystems, useGlobalStats } from "@/lib/api";

const systemIcons: Record<string, any> = { m365: Cloud, gws: Database, opentext: Server };

export default function Environments() {
  const { data: tenantList, isLoading: loadingTenants } = useTenants();
  const { data: systems, isLoading: loadingSystems } = useAllSystems();
  const { data: stats, isLoading: loadingStats } = useGlobalStats();

  if (loadingTenants || loadingSystems || loadingStats) {
    return (
      <Shell>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Shell>
    );
  }

  const tenants = tenantList || [];
  const allSystems = systems || [];

  const tenantsWithSystems = tenants.map((t) => ({
    ...t,
    systems: allSystems.filter((s) => s.tenantId === t.id),
  }));

  return (
    <Shell>
      <div className="flex items-center justify-between space-y-2 mb-6">
        <div>
          <h2 data-testid="text-page-title" className="text-3xl font-bold tracking-tight">MSP Global Dashboard</h2>
          <p className="text-muted-foreground mt-1">
            Top-level overview of all monitored customer tenants and active services.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Link href="/onboarding">
            <Button data-testid="button-onboard-tenant">Onboard New Tenant</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Monitored Tenants</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div data-testid="text-total-tenants" className="text-2xl font-bold">{stats?.totalTenants ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Active subscriptions across MSP</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Global Active Incidents</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div data-testid="text-active-incidents" className="text-2xl font-bold text-destructive">{stats?.activeIncidents ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Unacknowledged alerts</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Synthetic Tests (24h)</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div data-testid="text-total-tests" className="text-2xl font-bold">{stats?.totalTests24h?.toLocaleString() ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Test transactions in the last 24h</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">M365 Global Status</CardTitle>
            <Globe className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">Healthy</div>
            <p className="text-xs text-muted-foreground mt-1">No reported regional outages</p>
          </CardContent>
        </Card>
      </div>

      <h3 className="text-xl font-semibold mb-4">Customer Environments</h3>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {tenantsWithSystems.map((env) => (
          <Card key={env.id} data-testid={`card-tenant-${env.id}`} className="flex flex-col hover:border-primary/50 transition-all shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-primary/10 rounded-lg">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">{env.name}</CardTitle>
                    <CardDescription className="mt-1">Tenant ID: {env.id.slice(0, 8)}...</CardDescription>
                  </div>
                </div>
                <Badge 
                  variant={env.status === 'Healthy' ? 'default' : env.status === 'Warning' ? 'secondary' : 'destructive'}
                  className={
                    env.status === 'Healthy' ? 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20' :
                    env.status === 'Warning' ? 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20' : ''
                  }
                >
                  {env.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="space-y-3 mt-2">
                <p className="text-sm font-medium text-muted-foreground mb-3">Monitored Systems</p>
                {env.systems.map((sys) => {
                  const Icon = systemIcons[sys.type] || Cloud;
                  return (
                    <Link key={sys.id} href={`/dashboard?tenant=${env.id}`}>
                      <div className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 hover:border-accent-foreground/20 transition-all group cursor-pointer mb-2">
                        <div className="flex items-center gap-3">
                          <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                          <span className="font-medium text-sm">{sys.name}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground font-mono">{sys.latency}</span>
                          <div className={`h-2.5 w-2.5 rounded-full ${
                            sys.status === 'Healthy' ? 'bg-emerald-500' :
                            sys.status === 'Warning' ? 'bg-amber-500' : 'bg-destructive'
                          }`} />
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </CardContent>
            <CardFooter className="pt-4 border-t bg-muted/5">
              <Link href={`/dashboard?tenant=${env.id}`} className="w-full">
                <Button variant="ghost" className="w-full justify-between text-muted-foreground hover:text-foreground">
                  View Environment Details <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </CardFooter>
          </Card>
        ))}
      </div>
    </Shell>
  );
}
