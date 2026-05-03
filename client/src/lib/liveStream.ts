import { useEffect, useSyncExternalStore } from "react";
import { z } from "zod";

export type LiveEventType =
  | "agent_trace.created"
  | "agent_trace.updated"
  | "alert.created"
  | "entra_signin.batch"
  | "llm_call.recorded"
  | "mcp_tool_call.recorded"
  | "service_health.changed";

const liveEventTypeSchema = z.enum([
  "agent_trace.created",
  "agent_trace.updated",
  "alert.created",
  "entra_signin.batch",
  "llm_call.recorded",
  "mcp_tool_call.recorded",
  "service_health.changed",
]);

const eventMessageSchema = z.object({
  kind: z.literal("event"),
  type: liveEventTypeSchema,
  tenantId: z.string().nullable(),
  data: z.unknown(),
  ts: z.number(),
});

const helloMessageSchema = z.object({
  kind: z.literal("hello"),
  supportedEvents: z.array(liveEventTypeSchema),
});

const subscribedMessageSchema = z.object({
  kind: z.literal("subscribed"),
  tenantIds: z.array(z.string()),
  eventTypes: z.array(liveEventTypeSchema),
  rejectedTenantIds: z.array(z.string()).optional(),
});

const pongMessageSchema = z.object({ kind: z.literal("pong"), ts: z.number() });
const errorMessageSchema = z.object({ kind: z.literal("error"), error: z.string() });

const inboundMessageSchema = z.union([
  eventMessageSchema,
  helloMessageSchema,
  subscribedMessageSchema,
  pongMessageSchema,
  errorMessageSchema,
]);

export interface LiveEvent<T = unknown> {
  type: LiveEventType;
  tenantId: string | null;
  data: T;
  ts: number;
}

export type LiveStatus = "connecting" | "connected" | "reconnecting" | "offline";

export type LiveEventHandler = (event: LiveEvent) => void;

interface Subscription {
  orgId: string;
  tenantIds: Set<string>;
  eventTypes: Set<LiveEventType>;
  handler: LiveEventHandler;
}

export class LiveStreamClient {
  private ws: WebSocket | null = null;
  private url: string;
  private subscriptions = new Set<Subscription>();
  private statusListeners = new Set<(s: LiveStatus) => void>();
  private status: LiveStatus = "connecting";
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private subscribeTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionallyClosed = false;
  private lastSentOrgIds = new Set<string>();

  constructor() {
    const proto = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = typeof window !== "undefined" ? window.location.host : "localhost";
    this.url = `${proto}//${host}/ws/live`;
  }

  ensureConnected() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.connect();
  }

  private setStatus(s: LiveStatus) {
    if (this.status === s) return;
    this.status = s;
    this.statusListeners.forEach((l) => l(s));
  }

  getStatus(): LiveStatus {
    return this.status;
  }

  onStatus(listener: (s: LiveStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => { this.statusListeners.delete(listener); };
  }

  private connect() {
    if (typeof window === "undefined") return;
    this.intentionallyClosed = false;
    this.setStatus(this.reconnectAttempt === 0 ? "connecting" : "reconnecting");
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.addEventListener("open", () => {
      this.reconnectAttempt = 0;
      this.setStatus("connected");
      // After a (re)connect the server has no subscriptions for this socket,
      // so the previously-sent set must be cleared to ensure a fresh subscribe
      // is broadcast (rather than treated as "no change").
      this.lastSentOrgIds = new Set();
      this.sendAggregatedSubscribe();
    });

    ws.addEventListener("message", (ev) => {
      let raw: unknown;
      try { raw = JSON.parse(typeof ev.data === "string" ? ev.data : String(ev.data)); }
      catch { return; }
      const parsed = inboundMessageSchema.safeParse(raw);
      if (!parsed.success) return;
      const msg = parsed.data;
      if (msg.kind !== "event") return;
      const event: LiveEvent = { type: msg.type, tenantId: msg.tenantId, data: msg.data, ts: msg.ts };
      this.subscriptions.forEach((sub) => {
        if (!sub.eventTypes.has(event.type)) return;
        if (event.tenantId !== null) {
          if (sub.tenantIds.size === 0) return;
          if (!sub.tenantIds.has(event.tenantId)) return;
        }
        try { sub.handler(event); } catch (err) { console.error("[liveStream] handler error", err); }
      });
    });

    ws.addEventListener("close", () => {
      this.ws = null;
      if (this.intentionallyClosed) {
        this.setStatus("offline");
        return;
      }
      this.scheduleReconnect();
    });

    ws.addEventListener("error", () => {
      // close handler will run next
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.setStatus("reconnecting");
    this.reconnectAttempt++;
    const delay = Math.min(30000, 500 * Math.pow(2, this.reconnectAttempt));
    const jitter = Math.random() * 250;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay + jitter);
  }

  private sendAggregatedSubscribe() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    // Group subscriptions by orgId — the server validates each tenantId
    // belongs to its declared orgId, so we send one message per org.
    const byOrg = new Map<string, { tenantIds: Set<string>; eventTypes: Set<LiveEventType> }>();
    this.subscriptions.forEach((sub) => {
      let bucket = byOrg.get(sub.orgId);
      if (!bucket) {
        bucket = { tenantIds: new Set(), eventTypes: new Set() };
        byOrg.set(sub.orgId, bucket);
      }
      sub.tenantIds.forEach((t) => bucket!.tenantIds.add(t));
      sub.eventTypes.forEach((e) => bucket!.eventTypes.add(e));
    });
    const currentOrgIds = new Set<string>();
    byOrg.forEach((bucket, orgId) => {
      currentOrgIds.add(orgId);
      const tenantList: string[] = [];
      bucket.tenantIds.forEach((t) => tenantList.push(t));
      const eventList: LiveEventType[] = [];
      bucket.eventTypes.forEach((e) => eventList.push(e));
      try {
        this.ws!.send(JSON.stringify({
          kind: "subscribe",
          orgId,
          tenantIds: tenantList,
          eventTypes: eventList,
        }));
      } catch {
        // ignore
      }
    });
    // For any orgs that were previously subscribed but are no longer present
    // (e.g. last hook unmounted), explicitly clear their server-side state by
    // sending an empty subscribe so the server stops pushing events and the
    // bus subscription can go idle.
    this.lastSentOrgIds.forEach((orgId) => {
      if (currentOrgIds.has(orgId)) return;
      try {
        this.ws!.send(JSON.stringify({
          kind: "subscribe",
          orgId,
          tenantIds: [],
          eventTypes: [],
        }));
      } catch {
        // ignore
      }
    });
    this.lastSentOrgIds = currentOrgIds;
  }

  private debouncedSubscribe() {
    if (this.subscribeTimer) return;
    this.subscribeTimer = setTimeout(() => {
      this.subscribeTimer = null;
      this.sendAggregatedSubscribe();
    }, 50);
  }

  subscribe(orgId: string, tenantIds: string[], eventTypes: LiveEventType[], handler: LiveEventHandler): () => void {
    const filteredTenantIds = tenantIds.filter((t): t is string => typeof t === "string" && t.length > 0);
    // Org-scoped subscriptions require an orgId AND at least one tenantId
    // that belongs to that org. If anything is missing (e.g. context still
    // loading), skip subscribing so we never receive cross-tenant data.
    if (!orgId || filteredTenantIds.length === 0 || eventTypes.length === 0) {
      this.ensureConnected();
      return () => {};
    }
    const sub: Subscription = {
      orgId,
      tenantIds: new Set(filteredTenantIds),
      eventTypes: new Set(eventTypes),
      handler,
    };
    this.subscriptions.add(sub);
    this.ensureConnected();
    this.debouncedSubscribe();
    return () => {
      this.subscriptions.delete(sub);
      this.debouncedSubscribe();
    };
  }
}

let clientSingleton: LiveStreamClient | null = null;

function getClient(): LiveStreamClient {
  if (!clientSingleton) {
    clientSingleton = new LiveStreamClient();
  }
  return clientSingleton;
}

export function useLiveStream(
  orgId: string | null | undefined,
  tenantIds: ReadonlyArray<string | null | undefined>,
  eventTypes: ReadonlyArray<LiveEventType>,
  handler: LiveEventHandler,
) {
  const tenantKey = tenantIds.filter((t): t is string => !!t).join(",");
  const eventKey = [...eventTypes].sort().join(",");
  const orgKey = orgId ?? "";
  useEffect(() => {
    if (!orgKey || !tenantKey || !eventKey) return;
    const client = getClient();
    const ts = tenantKey.split(",");
    const ev = eventKey.split(",") as LiveEventType[];
    return client.subscribe(orgKey, ts, ev, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgKey, tenantKey, eventKey, handler]);
}

export function useLiveStreamStatus(): LiveStatus {
  const client = getClient();
  useEffect(() => {
    client.ensureConnected();
  }, [client]);
  return useSyncExternalStore(
    (cb) => client.onStatus(() => cb()),
    () => client.getStatus(),
    () => "connecting" as LiveStatus,
  );
}

export function ensureLiveStreamConnected() {
  getClient().ensureConnected();
}
