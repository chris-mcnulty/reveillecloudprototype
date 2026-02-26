import { Link, useLocation } from "wouter";
import { Search, Bell, Building2, Menu, Home, Activity, AlertCircle, BarChart3, Settings, Cloud, LayoutGrid } from "lucide-react";
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
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme-toggle";
import logoUrl from "@assets/Reveille_Logo_PNG_1772142435910.png";

export function Header() {
  const [location] = useLocation();

  const navItems = [
    { href: "/", icon: LayoutGrid, label: "Overview" },
    { href: "/dashboard", icon: Home, label: "Dashboard" },
    { href: "/tenants", icon: Building2, label: "Tenants" },
    { href: "/performance", icon: Activity, label: "Performance" },
    { href: "/alerts", icon: AlertCircle, label: "Alerts" },
    { href: "/reports", icon: BarChart3, label: "Reports" },
    { href: "/settings/tenant", icon: Settings, label: "Settings" },
  ];

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6">
      <Sheet>
        <SheetTrigger asChild>
          <Button size="icon" variant="outline" className="sm:hidden">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle Menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="sm:max-w-xs">
          <nav className="grid gap-6 text-lg font-medium mt-6">
            <Link href="/" className="group flex h-10 shrink-0 items-center gap-2">
              <img src={logoUrl} alt="Reveille Cloud" className="h-8 w-auto object-contain transition-all group-hover:scale-105" />
              <span className="sr-only">Reveille Cloud</span>
            </Link>
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-4 px-2.5 ${
                  location === item.href
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            ))}
          </nav>
        </SheetContent>
      </Sheet>

      <div className="flex-1 flex items-center gap-2 sm:gap-4 overflow-x-auto pb-1 sm:pb-0 hide-scrollbar">
        <h1 className="text-xl font-semibold tracking-tight hidden sm:block whitespace-nowrap shrink-0">Reveille Cloud</h1>
        
        <div className="h-6 w-px bg-border hidden sm:block shrink-0" />
        
        <Select defaultValue="t-001">
          <SelectTrigger className="w-[140px] sm:w-[200px] h-9 bg-background border-dashed shrink-0">
            <div className="flex items-center gap-2 text-sm truncate">
              <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="truncate"><SelectValue placeholder="Select tenant" /></span>
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="font-medium text-primary">All Tenants (MSP)</SelectItem>
            <DropdownMenuSeparator />
            <SelectItem value="t-001">Acme Corp</SelectItem>
            <SelectItem value="t-002">Globex</SelectItem>
            <SelectItem value="t-003">Initech</SelectItem>
            <SelectItem value="t-004">Soylent</SelectItem>
          </SelectContent>
        </Select>

        <Select defaultValue="m365">
          <SelectTrigger className="w-[140px] sm:w-[180px] h-9 bg-background border-dashed shrink-0">
            <div className="flex items-center gap-2 text-sm truncate">
              <Cloud className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="truncate"><SelectValue placeholder="Select system" /></span>
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="m365">Microsoft 365</SelectItem>
            <SelectItem value="gws">Google Workspace</SelectItem>
            <SelectItem value="opentext">OpenText</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-4 md:ml-auto md:gap-2 lg:gap-4 shrink-0">
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