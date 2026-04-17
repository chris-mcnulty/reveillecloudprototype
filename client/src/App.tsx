import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { TenantProvider } from "@/lib/tenant-context";
import NotFound from "@/pages/not-found";
import Environments from "@/pages/Environments";
import Dashboard from "@/pages/Dashboard";
import Tenants from "@/pages/Tenants";
import Alerts from "@/pages/Alerts";
import Performance from "@/pages/Performance";
import Reports from "@/pages/Reports";
import TestsConfig from "@/pages/settings/Tests";
import AlertsConfig from "@/pages/settings/Alerts";
import TenantConfig from "@/pages/settings/Tenant";
import Onboarding from "@/pages/Onboarding";
import SchedulerConfig from "@/pages/settings/Scheduler";
import ServiceHealth from "@/pages/ServiceHealth";
import UsageReports from "@/pages/UsageReports";
import AuditLog from "@/pages/AuditLog";
import PowerPlatform from "@/pages/PowerPlatform";
import AgentObservability from "@/pages/AgentObservability";
import LlmPerformance from "@/pages/LlmPerformance";
import KnownAgents from "@/pages/KnownAgents";
import EntraSignIns from "@/pages/EntraSignIns";
import SpEmbedded from "@/pages/SpEmbedded";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard}/>
      <Route path="/environments" component={Environments}/>
      <Route path="/tenants" component={Tenants}/>
      <Route path="/alerts" component={Alerts}/>
      <Route path="/performance" component={Performance}/>
      <Route path="/service-health" component={ServiceHealth}/>
      <Route path="/usage-reports" component={UsageReports}/>
      <Route path="/audit-log" component={AuditLog}/>
      <Route path="/power-platform" component={PowerPlatform}/>
      <Route path="/agent-observability" component={AgentObservability}/>
      <Route path="/llm-performance" component={LlmPerformance}/>
      <Route path="/known-agents" component={KnownAgents}/>
      <Route path="/entra-signins" component={EntraSignIns}/>
      <Route path="/spe" component={SpEmbedded}/>
      <Route path="/reports" component={Reports}/>
      <Route path="/onboarding" component={Onboarding}/>
      <Route path="/settings">
        {() => <Redirect to="/settings/tenant" />}
      </Route>
      <Route path="/settings/tests" component={TestsConfig} />
      <Route path="/settings/alerts" component={AlertsConfig} />
      <Route path="/settings/scheduler" component={SchedulerConfig} />
      <Route path="/settings/tenant" component={TenantConfig} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark" attribute="class">
      <QueryClientProvider client={queryClient}>
        <TenantProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </TenantProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
