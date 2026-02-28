import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useTenants } from "./api";

interface TenantContextValue {
  activeTenantId: string | null;
  setActiveTenantId: (id: string | null) => void;
}

const TenantContext = createContext<TenantContextValue>({
  activeTenantId: null,
  setActiveTenantId: () => {},
});

export function TenantProvider({ children }: { children: ReactNode }) {
  const { data: tenants } = useTenants();
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);

  useEffect(() => {
    if (!activeTenantId && tenants && tenants.length > 0) {
      setActiveTenantId(tenants[0].id);
    }
  }, [tenants, activeTenantId]);

  return (
    <TenantContext.Provider value={{ activeTenantId, setActiveTenantId }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useActiveTenant() {
  return useContext(TenantContext);
}
