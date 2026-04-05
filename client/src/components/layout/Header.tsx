import { Link, useLocation } from "wouter";
import { Search, Bell, Building2, Menu, Home, Activity, AlertCircle, BarChart3, Settings, LayoutGrid, Lock, ShieldCheck, FileBarChart, ScrollText, Layers, ScanSearch, Fingerprint, HardDrive } from "lucide-react";
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
import logoUrl from "@assets/Reveille_Icon_V1_PNG_1772142507568.png";
import logoUrlDark from "@assets/Reveille_Icon_V1_White_1772142521711.png";
import logoFullUrl from "@assets/Reveille_Logo_PNG_1772142435910.png";
import { useActiveTenant } from "@/lib/tenant-context";

export function Header() {
  const [location] = useLocation();
  const { activeTenantId, setActiveTenantId, organization, allOrganizations, orgTenants, isMsp, activeOrgId, setActiveOrgId } = useActiveTenant();

  const mspOnlyItems = isMsp ? [
    { href: "/environments", icon: LayoutGrid, label: "Environments" },
    { href: "/tenants", icon: Building2, label: "Tenants" },
  ] : [];

  const navItems = [
    { href: "/", icon: Home, label: "Dashboard" },
    { href: "/performance", icon: Activity, label: "Performance" },
    { href: "/service-health", icon: ShieldCheck, label: "Service Health" },
    { href: "/alerts", icon: AlertCircle, label: "Alerts" },
    { href: "/usage-reports", icon: FileBarChart, label: "Usage Reports" },
    { href: "/audit-log", icon: ScrollText, label: "Audit & Compliance" },
    { href: "/power-platform", icon: Layers, label: "Power Platform" },
    { href: "/agent-observability", icon: ScanSearch, label: "Agent Observability" },
    { href: "/entra-signins", icon: Fingerprint, label: "Entra Sign-Ins" },
    { href: "/spe", icon: HardDrive, label: "SharePoint Embedded" },
    { href: "/reports", icon: BarChart3, label: "Reports" },
    ...mspOnlyItems,
    { href: "/settings/tenant", icon: Settings, label: "Settings" },
  ];

  const isLocked = !isMsp && orgTenants.length <= 1;

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6">
      <Sheet>
        <SheetTrigger asChild>
          <Button size="icon" variant="outline" className="sm:hidden">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle Menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="sm:max-w-xs flex flex-col">
          <nav className="grid gap-6 text-lg font-medium mt-6 overflow-y-auto flex-1 pb-6">
            <Link href="/" className="group flex h-10 shrink-0 items-center gap-2">
              <img src={logoUrl} alt="Reveille Cloud" className="h-8 w-auto object-contain transition-all group-hover:scale-105 dark:hidden" />
              <img src={logoUrlDark} alt="Reveille Cloud" className="h-8 w-auto object-contain transition-all group-hover:scale-105 hidden dark:block" />
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

      <Link href="/" className="flex sm:hidden items-center gap-1.5 shrink-0">
        <img src={logoUrl} alt="Reveille Cloud" className="h-6 w-auto object-contain dark:hidden" />
        <img src={logoUrlDark} alt="Reveille Cloud" className="h-6 w-auto object-contain hidden dark:block" />
        <span className="text-sm font-semibold tracking-tight">Reveille</span>
      </Link>

      <div className="flex-1 flex items-center gap-2 sm:gap-4 overflow-x-auto pb-1 sm:pb-0 hide-scrollbar">
        <Link href="/" className="hidden sm:flex items-center gap-2 shrink-0">
          <img src={logoFullUrl} alt="Reveille Cloud" className="h-7 w-auto object-contain dark:hidden" />
          <img src={logoUrlDark} alt="Reveille Cloud" className="h-7 w-auto object-contain hidden dark:block" />
          <span className="text-lg font-semibold tracking-tight hidden dark:inline">Reveille Cloud</span>
        </Link>
        
        <div className="h-6 w-px bg-border hidden sm:block shrink-0" />

        {allOrganizations.length > 1 && (
          <Select value={activeOrgId || organization?.id || ""} onValueChange={(v) => setActiveOrgId(v)}>
            <SelectTrigger className="w-[130px] sm:w-[160px] h-9 bg-background border-dashed shrink-0 text-xs" data-testid="select-header-org">
              <div className="flex items-center gap-2 truncate">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="truncate"><SelectValue placeholder="Org" /></span>
              </div>
            </SelectTrigger>
            <SelectContent>
              {allOrganizations.map(o => (
                <SelectItem key={o.id} value={o.id}>
                  <span>{o.name}</span>
                  <span className="ml-1.5 text-xs text-muted-foreground">({o.mode})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {isMsp || orgTenants.length > 1 ? (
          <Select value={activeTenantId || ""} onValueChange={(v) => setActiveTenantId(v)}>
            <SelectTrigger className="w-[140px] sm:w-[200px] h-9 bg-background border-dashed shrink-0" data-testid="select-header-tenant">
              <div className="flex items-center gap-2 text-sm truncate">
                <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="truncate"><SelectValue placeholder="Select tenant" /></span>
              </div>
            </SelectTrigger>
            <SelectContent>
              {orgTenants?.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="flex items-center gap-2 px-3 h-9 rounded-md border border-dashed bg-background text-sm text-muted-foreground shrink-0" data-testid="select-header-tenant-locked">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{organization?.name || "Loading..."}</span>
          </div>
        )}
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
                {organization?.adminEmail?.charAt(0).toUpperCase() || "A"}
              </div>
              <span className="sr-only">Toggle user menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{organization?.adminEmail || "Admin"}</DropdownMenuLabel>
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
