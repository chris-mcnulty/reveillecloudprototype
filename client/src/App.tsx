import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import Tenants from "@/pages/Tenants";
import Alerts from "@/pages/Alerts";
import Performance from "@/pages/Performance";
import TestsConfig from "@/pages/settings/Tests";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard}/>
      <Route path="/tenants" component={Tenants}/>
      <Route path="/alerts" component={Alerts}/>
      <Route path="/performance" component={Performance}/>
      <Route path="/settings">
        {() => <Redirect to="/settings/tests" />}
      </Route>
      <Route path="/settings/tests" component={TestsConfig} />
      {/* Fallback to 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark" attribute="class">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;