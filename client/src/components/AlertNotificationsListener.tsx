import { useCallback, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useActiveTenant } from "@/lib/tenant-context";
import { useLiveStream, type LiveEvent } from "@/lib/liveStream";
import { incrementUnread, clearUnread } from "@/lib/alertNotifications";
import { toast } from "@/hooks/use-toast";
import type { Alert } from "@shared/schema";

const TOAST_THROTTLE_MS = 5000;
const TOAST_DEDUPE_WINDOW_MS = 30_000;

export function AlertNotificationsListener() {
  const [location] = useLocation();
  const { organization, activeOrgId, orgTenants } = useActiveTenant();
  const orgId = organization?.id ?? activeOrgId ?? null;

  const tenantIds = orgTenants.map((t) => t.id);
  const tenantKey = tenantIds.join(",");

  const lastToastAtRef = useRef<number>(0);
  const suppressedSinceLastToastRef = useRef<number>(0);
  const recentIdsRef = useRef<Map<string, number>>(new Map());
  const onAlertsPageRef = useRef<boolean>(false);

  useEffect(() => {
    onAlertsPageRef.current = location === "/alerts";
    if (location === "/alerts") {
      clearUnread();
    }
  }, [location]);

  const handleEvent = useCallback((event: LiveEvent) => {
    if (event.type !== "alert.created") return;
    const alert = event.data as Alert | undefined;
    if (!alert?.id) return;

    const now = Date.now();
    const recent = recentIdsRef.current;
    const lastSeen = recent.get(alert.id);
    if (lastSeen && now - lastSeen < TOAST_DEDUPE_WINDOW_MS) return;
    recent.set(alert.id, now);
    if (recent.size > 200) {
      recent.forEach((ts, id) => {
        if (now - ts > TOAST_DEDUPE_WINDOW_MS) recent.delete(id);
      });
    }

    if (!onAlertsPageRef.current) {
      incrementUnread(1);
    }

    const isCritical = alert.severity === "critical";
    if (!isCritical) return;

    const elapsed = now - lastToastAtRef.current;
    if (elapsed < TOAST_THROTTLE_MS) {
      suppressedSinceLastToastRef.current += 1;
      return;
    }

    const suppressed = suppressedSinceLastToastRef.current;
    suppressedSinceLastToastRef.current = 0;
    lastToastAtRef.current = now;

    const description = suppressed > 0
      ? `${alert.message ?? alert.title}\n+${suppressed} more critical alert${suppressed === 1 ? "" : "s"} in the last few seconds`
      : (alert.message ?? alert.title);

    toast({
      title: `New critical alert: ${alert.title}`,
      description,
      variant: "destructive",
    });
  }, []);

  useLiveStream(orgId, tenantKey ? tenantKey.split(",") : [], ["alert.created"], handleEvent);

  return null;
}
