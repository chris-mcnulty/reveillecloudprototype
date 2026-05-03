import type { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { z } from "zod";
import { liveEvents, type LiveEvent, type LiveEventType } from "./events";
import { storage } from "./storage";

interface ConnectionState {
  ws: WebSocket;
  tenantIds: Set<string>;
  eventTypes: Set<LiveEventType>;
  alive: boolean;
}

const ALL_EVENT_TYPES: readonly LiveEventType[] = [
  "agent_trace.created",
  "agent_trace.updated",
  "alert.created",
  "entra_signin.batch",
  "llm_call.recorded",
  "mcp_tool_call.recorded",
  "service_health.changed",
] as const;

const eventTypeSchema = z.enum([
  "agent_trace.created",
  "agent_trace.updated",
  "alert.created",
  "entra_signin.batch",
  "llm_call.recorded",
  "mcp_tool_call.recorded",
  "service_health.changed",
]);

const subscribeSchema = z.object({
  kind: z.literal("subscribe"),
  orgId: z.string().min(1).max(128),
  tenantIds: z.array(z.string().min(1).max(128)).max(64).default([]),
  eventTypes: z.array(eventTypeSchema).max(16).default([]),
});

const pingSchema = z.object({ kind: z.literal("ping") });

const inboundSchema = z.union([subscribeSchema, pingSchema]);

const MAX_FRAME_BYTES = 8 * 1024;

export interface AttachLiveWebSocketOptions {
  heartbeatIntervalMs?: number;
}

export function attachLiveWebSocket(
  httpServer: HttpServer,
  options: AttachLiveWebSocketOptions = {},
): WebSocketServer {
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 30000;
  const wss = new WebSocketServer({ server: httpServer, path: "/ws/live" });
  const connections = new Set<ConnectionState>();
  let busUnsubscribe: (() => void) | null = null;
  let activeSubscriberCount = 0;

  const busHandler = (event: LiveEvent) => {
    const payload = JSON.stringify({ kind: "event", ...event });
    connections.forEach((conn) => {
      if (conn.ws.readyState !== WebSocket.OPEN) return;
      if (conn.eventTypes.size === 0) return;
      if (!conn.eventTypes.has(event.type)) return;
      // Tenant-scoped events MUST match an explicitly subscribed tenant.
      // Empty tenantIds is NOT a wildcard — it means no tenant-scoped events.
      if (event.tenantId !== null) {
        if (conn.tenantIds.size === 0) return;
        if (!conn.tenantIds.has(event.tenantId)) return;
      }
      try {
        conn.ws.send(payload);
      } catch {
        // socket may be closing; ignore
      }
    });
  };

  function bumpActive(delta: number) {
    const was = activeSubscriberCount;
    activeSubscriberCount = Math.max(0, activeSubscriberCount + delta);
    if (was === 0 && activeSubscriberCount > 0 && !busUnsubscribe) {
      busUnsubscribe = liveEvents.on(busHandler);
    } else if (was > 0 && activeSubscriberCount === 0 && busUnsubscribe) {
      busUnsubscribe();
      busUnsubscribe = null;
    }
  }

  wss.on("connection", (ws: WebSocket) => {
    const state: ConnectionState = {
      ws,
      tenantIds: new Set(),
      eventTypes: new Set(),
      alive: true,
    };
    connections.add(state);

    try {
      ws.send(JSON.stringify({ kind: "hello", supportedEvents: ALL_EVENT_TYPES }));
    } catch {
      // ignore
    }

    ws.on("message", async (raw) => {
      const buf = raw.toString();
      if (buf.length > MAX_FRAME_BYTES) {
        try { ws.send(JSON.stringify({ kind: "error", error: "frame_too_large" })); } catch {}
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(buf);
      } catch {
        return;
      }
      const result = inboundSchema.safeParse(parsed);
      if (!result.success) {
        try { ws.send(JSON.stringify({ kind: "error", error: "invalid_message" })); } catch {}
        return;
      }
      const msg = result.data;
      if (msg.kind === "ping") {
        try { ws.send(JSON.stringify({ kind: "pong", ts: Date.now() })); } catch {}
        return;
      }
      // subscribe: enforce org-scoped authorization. Each requested tenantId
      // must exist AND belong to the org the client claims as active. This
      // mirrors the app's "tenants the active organization owns" model and
      // prevents subscribing to tenants outside the active org.
      let orgExists = false;
      try {
        const org = await storage.getOrganization(msg.orgId);
        orgExists = !!org;
      } catch {
        orgExists = false;
      }
      const requested = Array.from(new Set(msg.tenantIds.filter(Boolean)));
      const validated = new Set<string>();
      if (orgExists) {
        const lookups = await Promise.all(
          requested.map(async (id) => {
            try {
              const tenant = await storage.getTenant(id);
              if (!tenant) return null;
              if (tenant.organizationId !== msg.orgId) return null;
              return id;
            } catch {
              return null;
            }
          }),
        );
        lookups.forEach((id) => { if (id) validated.add(id); });
      }

      const previouslyActive = state.eventTypes.size > 0;
      state.tenantIds = validated;
      state.eventTypes = new Set(msg.eventTypes);
      const nowActive = state.eventTypes.size > 0;
      if (!previouslyActive && nowActive) bumpActive(1);
      else if (previouslyActive && !nowActive) bumpActive(-1);

      const tenantList: string[] = [];
      state.tenantIds.forEach((t) => tenantList.push(t));
      const eventList: LiveEventType[] = [];
      state.eventTypes.forEach((t) => eventList.push(t));
      const rejected = requested.filter((id) => !validated.has(id));
      try {
        ws.send(JSON.stringify({
          kind: "subscribed",
          tenantIds: tenantList,
          eventTypes: eventList,
          rejectedTenantIds: rejected,
        }));
      } catch {
        // ignore
      }
    });

    ws.on("pong", () => { state.alive = true; });

    const cleanup = () => {
      if (!connections.has(state)) return;
      connections.delete(state);
      if (state.eventTypes.size > 0) bumpActive(-1);
    };
    ws.on("close", cleanup);
    ws.on("error", cleanup);
  });

  const heartbeat = setInterval(() => {
    const dead: ConnectionState[] = [];
    connections.forEach((conn) => {
      if (!conn.alive) {
        dead.push(conn);
        return;
      }
      conn.alive = false;
      try { conn.ws.ping(); } catch { /* noop */ }
    });
    dead.forEach((conn) => {
      try { conn.ws.terminate(); } catch { /* noop */ }
      if (connections.has(conn)) {
        connections.delete(conn);
        if (conn.eventTypes.size > 0) bumpActive(-1);
      }
    });
  }, heartbeatIntervalMs);

  wss.on("close", () => {
    clearInterval(heartbeat);
    if (busUnsubscribe) {
      busUnsubscribe();
      busUnsubscribe = null;
    }
  });

  console.log(`[ws] /ws/live mounted (${ALL_EVENT_TYPES.length} event types)`);
  return wss;
}
