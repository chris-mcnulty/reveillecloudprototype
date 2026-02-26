import { Search, Bell, Building2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ThemeToggle } from "@/components/theme-toggle";

export function Header() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6">
      <div className="flex-1 flex items-center gap-4">
        <h1 className="text-xl font-semibold tracking-tight hidden sm:block">SharePoint Monitor</h1>
        
        <div className="h-6 w-px bg-border hidden sm:block" />
        
        <Select defaultValue="t-001">
          <SelectTrigger className="w-[200px] h-9 bg-background border-dashed">
            <div className="flex items-center gap-2 text-sm">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder="Select tenant" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="font-medium text-primary">All Tenants (MSP View)</SelectItem>
            <DropdownMenuSeparator />
            <SelectItem value="t-001">Acme Corp</SelectItem>
            <SelectItem value="t-002">Globex</SelectItem>
            <SelectItem value="t-003">Initech</SelectItem>
            <SelectItem value="t-004">Soylent</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-4 md:ml-auto md:gap-2 lg:gap-4">
        <form className="ml-auto flex-1 sm:flex-initial hidden md:block">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search..."
              className="pl-8 sm:w-[200px] lg:w-[250px] bg-background h-9"
            />
          </div>
        </form>
        <ThemeToggle />
        <Button variant="outline" size="icon" className="relative h-8 w-8 rounded-full">
          <Bell className="h-4 w-4" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive"></span>
          <span className="sr-only">Toggle notifications</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="icon" className="rounded-full">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
                AD
              </div>
              <span className="sr-only">Toggle user menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Admin Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Profile</DropdownMenuItem>
            <DropdownMenuItem>Billing</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Logout</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}