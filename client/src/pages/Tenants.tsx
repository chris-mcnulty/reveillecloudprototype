import { Shell } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const tenants = [
  { id: "t-001", name: "Acme Corp", domain: "acmecorp.sharepoint.com", status: "Healthy", tests: 4, lastActive: "2 mins ago" },
  { id: "t-002", name: "Globex", domain: "globex.sharepoint.com", status: "Warning", tests: 6, lastActive: "5 mins ago" },
  { id: "t-003", name: "Initech", domain: "initech-dev.sharepoint.com", status: "Critical", tests: 4, lastActive: "1 min ago" },
  { id: "t-004", name: "Soylent", domain: "soylent.sharepoint.com", status: "Healthy", tests: 2, lastActive: "15 mins ago" },
  { id: "t-005", name: "Umbrella", domain: "umbrella-corp.sharepoint.com", status: "Healthy", tests: 8, lastActive: "Just now" },
];

export default function Tenants() {
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
          <Button>
            <Plus className="mr-2 h-4 w-4" /> Add Tenant
          </Button>
        </div>
      </div>

      <div className="flex items-center space-x-2 my-4">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tenants..."
            className="pl-8 max-w-sm bg-background"
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
              <TableHead>Active Tests</TableHead>
              <TableHead>Last Sync</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.map((tenant) => (
              <TableRow key={tenant.id}>
                <TableCell className="font-medium">{tenant.name}</TableCell>
                <TableCell className="text-muted-foreground">{tenant.domain}</TableCell>
                <TableCell>
                  <Badge 
                    variant={tenant.status === 'Healthy' ? 'default' : tenant.status === 'Warning' ? 'secondary' : 'destructive'}
                    className={
                      tenant.status === 'Healthy' ? 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20' :
                      tenant.status === 'Warning' ? 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20' :
                      ''
                    }
                  >
                    {tenant.status}
                  </Badge>
                </TableCell>
                <TableCell>{tenant.tests} configured</TableCell>
                <TableCell>{tenant.lastActive}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <span className="sr-only">Open menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>View Dashboard</DropdownMenuItem>
                      <DropdownMenuItem>Configure Tests</DropdownMenuItem>
                      <DropdownMenuItem>Manage Access</DropdownMenuItem>
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