import { ReactNode, useEffect } from "react";
import { useSearch } from "wouter";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useActiveTenant } from "@/lib/tenant-context";

interface ShellProps {
  children: ReactNode;
}

function DeepLinkHandler() {
  const search = useSearch();
  const { orgTenants, activeTenantId, setActiveTenantId } = useActiveTenant();

  useEffect(() => {
    if (!search) return;
    const params = new URLSearchParams(search);
    const t = params.get("tenantId");
    if (!t) return;
    if (t === activeTenantId) return;
    if (orgTenants.some((tenant) => tenant.id === t)) {
      setActiveTenantId(t);
    }
  }, [search, orgTenants, activeTenantId, setActiveTenantId]);

  return null;
}

export function Shell({ children }: ShellProps) {
  return (
    <div className="flex min-h-screen w-full flex-col bg-muted/40">
      <DeepLinkHandler />
      <Sidebar />
      <div className="flex flex-col sm:gap-4 sm:py-4 sm:pl-14">
        <Header />
        <main className="grid flex-1 items-start gap-4 p-4 sm:px-6 sm:py-0 md:gap-8">
          {children}
        </main>
      </div>
    </div>
  );
}
