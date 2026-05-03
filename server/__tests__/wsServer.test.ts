import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createServer, type Server as HttpServer } from "http";
import { AddressInfo } from "net";
import { WebSocket, type WebSocketServer } from "ws";

const { orgs, tenants } = vi.hoisted(() => ({
  orgs: new Map<string, any>(),
  tenants: new Map<string, any>(),
}));

vi.mock("../storage", () => ({
  storage: {
    getOrganization: async (id: string) => orgs.get(id) ?? null,
    getTenant: async (id: string) => tenants.get(id) ?? null,
  },
}));

import { attachLiveWebSocket } from "../wsServer";
import { liveEvents } from "../events";

interface Harness {
  http: HttpServer;
  wss: WebSocketServer;
  port: number;
}

async function startHarness(opts?: { heartbeatIntervalMs?: number }): Promise<Harness> {
  const http = createServer();
  const wss = attachLiveWebSocket(http, opts);
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", () => resolve()));
  const port = (http.address() as AddressInfo).port;
  return { http, wss, port };
}

async function stopHarness(h: Harness): Promise<void> {
  await new Promise<void>((resolve) => h.wss.close(() => resolve()));
  await new Promise<void>((resolve) => h.http.close(() => resolve()));
}

interface BufferedWs {
  ws: WebSocket;
  buffer: any[];
  waitFor(predicate: (m: any) => boolean, timeoutMs?: number): Promise<any>;
  expectNone(predicate: (m: any) => boolean, windowMs: number): Promise<void>;
  send(data: any): void;
  close(): void;
}

function connect(port: number, options: any = {}): Promise<BufferedWs> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/live`, options);
    const buffer: any[] = [];
    let waiter: { predicate: (m: any) => boolean; resolve: (m: any) => void } | null = null;
    ws.on("message", (raw: Buffer) => {
      let parsed: any;
      try { parsed = JSON.parse(raw.toString()); } catch { return; }
      if (waiter && waiter.predicate(parsed)) {
        const w = waiter;
        waiter = null;
        w.resolve(parsed);
        return;
      }
      buffer.push(parsed);
    });
    ws.once("error", reject);
    ws.once("open", () => resolve({
      ws,
      buffer,
      waitFor(predicate, timeoutMs = 1000) {
        const idx = buffer.findIndex(predicate);
        if (idx !== -1) { return Promise.resolve(buffer.splice(idx, 1)[0]); }
        return new Promise((res, rej) => {
          waiter = { predicate, resolve: res };
          setTimeout(() => {
            if (waiter && waiter.predicate === predicate) {
              waiter = null;
              rej(new Error("timeout waiting for message"));
            }
          }, timeoutMs);
        });
      },
      expectNone(predicate, windowMs) {
        return new Promise((res, rej) => {
          const t = setInterval(() => {
            const idx = buffer.findIndex(predicate);
            if (idx !== -1) {
              clearInterval(t);
              rej(new Error(`unexpected message: ${JSON.stringify(buffer[idx])}`));
            }
          }, 10);
          setTimeout(() => { clearInterval(t); res(); }, windowMs);
        });
      },
      send(data) { ws.send(typeof data === "string" ? data : JSON.stringify(data)); },
      close() { ws.close(); },
    }));
  });
}

beforeEach(() => {
  orgs.clear();
  tenants.clear();
  orgs.set("org-1", { id: "org-1", name: "Org 1" });
  orgs.set("org-2", { id: "org-2", name: "Org 2" });
  tenants.set("t1", { id: "t1", organizationId: "org-1" });
  tenants.set("t2", { id: "t2", organizationId: "org-1" });
  tenants.set("t-other", { id: "t-other", organizationId: "org-2" });
});

describe("attachLiveWebSocket - subscribe filtering", () => {
  let h: Harness;
  beforeEach(async () => { h = await startHarness(); });
  afterEach(async () => { await stopHarness(h); });

  it("delivers tenant-scoped events only to clients subscribed to that tenant + event type", async () => {
    const ws = await connect(h.port);
    await ws.waitFor((m) => m.kind === "hello");

    ws.send(JSON.stringify({
      kind: "subscribe",
      orgId: "org-1",
      tenantIds: ["t1"],
      eventTypes: ["alert.created"],
    }));
    const sub = await ws.waitFor((m) => m.kind === "subscribed");
    expect(sub.tenantIds).toEqual(["t1"]);
    expect(sub.eventTypes).toEqual(["alert.created"]);
    expect(sub.rejectedTenantIds).toEqual([]);

    // matching event reaches the client
    const got = ws.waitFor((m) => m.kind === "event");
    liveEvents.emit("alert.created", "t1", { id: "a1" });
    const evt = await got;
    expect(evt).toMatchObject({ kind: "event", type: "alert.created", tenantId: "t1" });
    expect(evt.data).toEqual({ id: "a1" });

    // non-subscribed event type does NOT reach the client
    const noEventTypeMatch = ws.expectNone((m) => m.kind === "event", 80);
    liveEvents.emit("agent_trace.created", "t1", { id: "trace-1" });
    await noEventTypeMatch;

    // non-subscribed tenant does NOT reach the client
    const noTenantMatch = ws.expectNone((m) => m.kind === "event", 80);
    liveEvents.emit("alert.created", "t2", { id: "a2" });
    await noTenantMatch;

    ws.close();
  });

  it("rejects tenants that don't belong to the claimed org", async () => {
    const ws = await connect(h.port);
    await ws.waitFor((m) => m.kind === "hello");

    ws.send(JSON.stringify({
      kind: "subscribe",
      orgId: "org-1",
      tenantIds: ["t1", "t-other", "missing"],
      eventTypes: ["alert.created"],
    }));
    const sub = await ws.waitFor((m) => m.kind === "subscribed");
    expect(sub.tenantIds).toEqual(["t1"]);
    expect(new Set(sub.rejectedTenantIds)).toEqual(new Set(["t-other", "missing"]));

    // Event for cross-org tenant must NOT be delivered
    const noCross = ws.expectNone((m) => m.kind === "event", 80);
    liveEvents.emit("alert.created", "t-other", { id: "x" });
    await noCross;

    ws.close();
  });

  it("delivers global (tenantId=null) events to any client subscribed to the event type", async () => {
    const ws = await connect(h.port);
    await ws.waitFor((m) => m.kind === "hello");

    ws.send(JSON.stringify({
      kind: "subscribe",
      orgId: "org-1",
      tenantIds: ["t1"],
      eventTypes: ["service_health.changed"],
    }));
    await ws.waitFor((m) => m.kind === "subscribed");

    const got = ws.waitFor((m) => m.kind === "event");
    liveEvents.emit("service_health.changed", null, { incidentId: "i1" });
    const evt = await got;
    expect(evt.tenantId).toBeNull();
    expect(evt.type).toBe("service_health.changed");

    ws.close();
  });

  it("does not deliver events to a client with no subscribed event types", async () => {
    const ws = await connect(h.port);
    await ws.waitFor((m) => m.kind === "hello");

    // No subscribe sent yet; emit should not reach the client.
    const noBeforeSub = ws.expectNone((m) => m.kind === "event", 60);
    liveEvents.emit("alert.created", "t1", { id: "x" });
    await noBeforeSub;

    ws.close();
  });

  it("isolates broadcasts between two clients with different filters", async () => {
    const a = await connect(h.port);
    const b = await connect(h.port);
    await a.waitFor((m) => m.kind === "hello");
    await b.waitFor((m) => m.kind === "hello");

    a.send(JSON.stringify({
      kind: "subscribe", orgId: "org-1",
      tenantIds: ["t1"], eventTypes: ["alert.created"],
    }));
    b.send(JSON.stringify({
      kind: "subscribe", orgId: "org-1",
      tenantIds: ["t2"], eventTypes: ["alert.created"],
    }));
    await a.waitFor((m) => m.kind === "subscribed");
    await b.waitFor((m) => m.kind === "subscribed");

    const aGot = a.waitFor((m) => m.kind === "event");
    const bShouldNotGet = b.expectNone((m) => m.kind === "event", 80);
    liveEvents.emit("alert.created", "t1", { id: "for-a" });
    const evt = await aGot;
    expect(evt.tenantId).toBe("t1");
    await bShouldNotGet;

    a.close();
    b.close();
  });

  it("responds to ping with pong", async () => {
    const ws = await connect(h.port);
    await ws.waitFor((m) => m.kind === "hello");
    ws.send(JSON.stringify({ kind: "ping" }));
    const pong = await ws.waitFor((m) => m.kind === "pong");
    expect(pong.ts).toBeTypeOf("number");
    ws.close();
  });
});

describe("attachLiveWebSocket - heartbeat & cleanup", () => {
  it("terminates dead sockets that fail to respond to pings", async () => {
    const h = await startHarness({ heartbeatIntervalMs: 60 });
    try {
      const ws = await connect(h.port, { autoPong: false });
      await ws.waitFor((m) => m.kind === "hello");

      const closed = new Promise<number>((resolve) => {
        ws.ws.once("close", (code) => resolve(code));
      });
      // Two heartbeats: 1st marks alive=false + sends ping (no pong because autoPong:false),
      // 2nd sees alive still false and terminates the socket.
      const code = await Promise.race([
        closed,
        new Promise<number>((_, reject) =>
          setTimeout(() => reject(new Error("socket not terminated")), 1000),
        ),
      ]);
      expect(typeof code).toBe("number");
    } finally {
      await stopHarness(h);
    }
  });

  it("wss.close() stops the heartbeat and unsubscribes from the bus", async () => {
    const h = await startHarness({ heartbeatIntervalMs: 30 });
    // Connect and subscribe so the server attaches a bus listener.
    const ws = await connect(h.port);
    await ws.waitFor((m) => m.kind === "hello");
    ws.send(JSON.stringify({
      kind: "subscribe", orgId: "org-1",
      tenantIds: ["t1"], eventTypes: ["alert.created"],
    }));
    await ws.waitFor((m) => m.kind === "subscribed");
    expect(liveEvents.hasSubscribers()).toBe(true);

    ws.close();
    await new Promise((r) => setTimeout(r, 30));

    await stopHarness(h);

    // After wss.close(), the bus should no longer have the wsServer listener
    // (the only subscriber the server added via subscribe()).
    expect(liveEvents.hasSubscribers()).toBe(false);

    // And no errors / hangs should occur when emitting after close.
    expect(() => liveEvents.emit("alert.created", "t1", { id: "post-close" })).not.toThrow();
  });
});
