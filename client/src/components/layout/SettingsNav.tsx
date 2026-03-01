import { Link, useLocation } from "wouter";

export function SettingsNav() {
  const [location] = useLocation();

  const links = [
    { href: "/settings/tenant", label: "Integration & Consent" },
    { href: "/settings/tests", label: "Synthetic Tests" },
    { href: "/settings/alerts", label: "Alert Rules" },
    { href: "/settings/scheduler", label: "Scheduler" },
  ];

  return (
    <nav className="flex items-center space-x-6 border-b mb-6 overflow-x-auto hide-scrollbar">
      {links.map((link) => (
        <Link 
          key={link.href} 
          href={link.href}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            location === link.href 
              ? "border-primary text-primary" 
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
