import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useOrgContext } from "./api";
import type { Organization, Tenant } from "@shared/schema";

interface TenantContextValue {
  activeTenantId: string | null;
  setActiveTenantId: (id: string | null) => void;
  organization: Organization | null;
  orgTenants: Tenant[];
  isMsp: boolean;
  isLoading: boolean;
}

const TenantContext = createContext<TenantContextValue>({
  activeTenantId: null,
  setActiveTenantId: () => {},
  organization: null,
  orgTenants: [],
  isMsp: false,
  isLoading: true,
});

export function TenantProvider({ children }: { children: ReactNode }) {
  const { data: orgCtx, isLoading } = useOrgContext();
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);

  const isMsp = orgCtx?.isMsp ?? false;
  const orgTenants = orgCtx?.tenants ?? [];
  const organization = orgCtx?.organization ?? null;

  useEffect(() => {
    if (orgTenants.length > 0) {
      const currentValid = orgTenants.find(t => t.id === activeTenantId);
      if (!currentValid) {
        setActiveTenantId(orgTenants[0].id);
      }
    }
  }, [orgTenants, activeTenantId]);

  const handleSetTenant = (id: string | null) => {
    if (!isMsp && orgTenants.length <= 1) return;
    setActiveTenantId(id);
  };

  return (
    <TenantContext.Provider value={{
      activeTenantId,
      setActiveTenantId: isMsp ? setActiveTenantId : handleSetTenant,
      organization,
      orgTenants,
      isMsp,
      isLoading,
    }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useActiveTenant() {
  return useContext(TenantContext);
}
