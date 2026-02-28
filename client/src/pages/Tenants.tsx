import { Shell } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, MoreHorizontal, Loader2 } from "lucide-react";
import { useActiveTenant } from "@/lib/tenant-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTenants } from "@/lib/api";
import { Link, useLocation } from "wouter";
import { useState } from "react";

export default function Tenants() {
  const { data: tenantList, isLoading } = useTenants();
  const [, setLocation] = useLocation();
  const { setActiveTenantId } = useActiveTenant();
  const [searchQuery, setSearchQuery] = useState("");

  if (isLoading) {
    return (
      <Shell>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Shell>
    );
  }

  const tenants = (tenantList || []).filter((t) =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.primaryDomain.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Shell>
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Tenants</h2>
          <p className="text-muted-foreground">
            Manage monitored SharePoint tenants and their configurations.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Link href="/onboarding">
            <Button data-testid="button-add-tenant">
              <Plus className="mr-2 h-4 w-4" /> Add Tenant
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex items-center space-x-2 my-4">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            data-testid="input-search-tenants"
            placeholder="Search tenants..."
            className="pl-8 max-w-sm bg-background"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Domain</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Consent</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.map((tenant) => (
              <TableRow key={tenant.id} data-testid={`row-tenant-${tenant.id}`}>
                <TableCell className="font-medium">{tenant.name}</TableCell>
                <TableCell className="text-muted-foreground">{tenant.primaryDomain}</TableCell>
                <TableCell>
                  <Badge 
                    variant={tenant.status === 'Healthy' ? 'default' : tenant.status === 'Warning' ? 'secondary' : 'destructive'}
                    className={
                      tenant.status === 'Healthy' ? 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20' :
                      tenant.status === 'Warning' ? 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20' : ''
                    }
                  >
                    {tenant.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={tenant.consentStatus === "Connected" ? "default" : "secondary"} className={tenant.consentStatus === "Connected" ? "bg-emerald-500/10 text-emerald-500" : ""}>
                    {tenant.consentStatus}
                  </Badge>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0" data-testid={`button-menu-${tenant.id}`}>
                        <span className="sr-only">Open menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { setActiveTenantId(tenant.id); setLocation("/"); }}>View Dashboard</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setActiveTenantId(tenant.id); setLocation("/settings/tests"); }}>Configure Tests</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setActiveTenantId(tenant.id); setLocation("/settings/tenant"); }}>Manage Access</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Shell>
  );
}
