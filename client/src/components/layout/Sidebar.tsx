import { Link, useLocation } from "wouter";
import {
  Activity,
  AlertCircle,
  Building2,
  Home,
  Settings,
  Database,
  BarChart3,
  LayoutGrid,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function Sidebar() {
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
    <aside className="fixed inset-y-0 left-0 z-10 hidden w-14 flex-col border-r bg-background sm:flex">
      <nav className="flex flex-col items-center gap-4 px-2 py-4">
        <Link href="/" className="group flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-full bg-primary text-lg font-semibold text-primary-foreground md:h-8 md:w-8 md:text-base">
          <Database className="h-4 w-4 transition-all group-hover:scale-110" />
          <span className="sr-only">Reveille Cloud</span>
        </Link>
        {navItems.map((item) => (
          <Tooltip key={item.href}>
            <TooltipTrigger asChild>
              <Link
                href={item.href}
                className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors md:h-8 md:w-8 ${
                  location === item.href
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <item.icon className="h-5 w-5" />
                <span className="sr-only">{item.label}</span>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">{item.label}</TooltipContent>
          </Tooltip>
        ))}
      </nav>
    </aside>
  );
}