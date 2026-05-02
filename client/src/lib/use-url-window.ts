import { useMemo } from "react";
import { useSearch } from "wouter";

export type WindowKey = "24h" | "7d" | "28d" | "30d" | "90d" | "mtd";

const DAY = 24 * 60 * 60 * 1000;

export interface UrlWindow {
  windowKey: WindowKey | null;
  windowMs: number | null;
  since: Date | null;
  label: string | null;
}

export function parseWindowKey(raw: string | null): WindowKey | null {
  if (!raw) return null;
  const v = raw.toLowerCase();
  if (v === "24h" || v === "7d" || v === "28d" || v === "30d" || v === "90d" || v === "mtd") {
    return v as WindowKey;
  }
  return null;
}

export function windowKeyToMs(key: WindowKey | null, now: Date = new Date()): number | null {
  if (!key) return null;
  switch (key) {
    case "24h": return DAY;
    case "7d": return 7 * DAY;
    case "28d": return 28 * DAY;
    case "30d": return 30 * DAY;
    case "90d": return 90 * DAY;
    case "mtd": {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      return Math.max(60_000, now.getTime() - start.getTime());
    }
  }
}

export function windowKeyLabel(key: WindowKey | null): string | null {
  if (!key) return null;
  if (key === "mtd") return "Month to date";
  if (key === "24h") return "Last 24 hours";
  return `Last ${key}`;
}

export function useUrlWindow(): UrlWindow {
  const search = useSearch();
  return useMemo(() => {
    const params = new URLSearchParams(search || "");
    const key = parseWindowKey(params.get("window"));
    const ms = windowKeyToMs(key);
    const since = ms ? new Date(Date.now() - ms) : null;
    return { windowKey: key, windowMs: ms, since, label: windowKeyLabel(key) };
  }, [search]);
}
