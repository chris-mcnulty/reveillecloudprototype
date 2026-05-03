// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { LiveStreamClient } from "../liveStream";

type Listener = (ev: any) => void;

class MockWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  url: string;
  readyState: number = MockWebSocket.CONNECTING;
  sent: string[] = [];
  private listeners = new Map<string, Set<Listener>>();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: string, cb: Listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(cb);
  }
  removeEventListener(type: string, cb: Listener) {
    this.listeners.get(type)?.delete(cb);
  }
  dispatch(type: string, ev: any = {}) {
    this.listeners.get(type)?.forEach((cb) => cb(ev));
  }

  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.dispatch("close", {});
  }

  // test helpers
  open() {
    this.readyState = MockWebSocket.OPEN;
    this.dispatch("open", {});
  }
  message(data: any) {
    this.dispatch("message", { data: typeof data === "string" ? data : JSON.stringify(data) });
  }
  error() {
    this.dispatch("error", {});
  }
}

beforeEach(() => {
  MockWebSocket.instances = [];
  (globalThis as any).WebSocket = MockWebSocket;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function lastInstance(): MockWebSocket {
  return MockWebSocket.instances[MockWebSocket.instances.length - 1];
}

function lastSubscribePayloads(ws: MockWebSocket): any[] {
  return ws.sent.map((s) => JSON.parse(s)).filter((m) => m.kind === "subscribe");
}

describe("LiveStreamClient - subscribe & aggregation", () => {
  it("aggregates tenantIds and eventTypes across multiple subscriptions for the same org", async () => {
    const client = new LiveStreamClient();
    const handlerA = vi.fn();
    const handlerB = vi.fn();

    client.subscribe("org-1", ["t1"], ["alert.created"], handlerA);
    client.subscribe("org-1", ["t2"], ["agent_trace.created"], handlerB);

    const ws = lastInstance();
    expect(ws).toBeDefined();
    ws.open();

    // debounced subscribe (50ms)
    vi.advanceTimersByTime(60);

    const subs = lastSubscribePayloads(ws);
    expect(subs.length).toBeGreaterThanOrEqual(1);
    const last = subs[subs.length - 1];
    expect(last.orgId).toBe("org-1");
    expect(new Set(last.tenantIds)).toEqual(new Set(["t1", "t2"]));
    expect(new Set(last.eventTypes)).toEqual(
      new Set(["alert.created", "agent_trace.created"]),
    );
  });

  it("sends one subscribe per orgId when subscriptions span multiple orgs", () => {
    const client = new LiveStreamClient();
    client.subscribe("org-1", ["t1"], ["alert.created"], () => {});
    client.subscribe("org-2", ["tx"], ["llm_call.recorded"], () => {});
    const ws = lastInstance();
    ws.open();
    vi.advanceTimersByTime(60);

    const subs = lastSubscribePayloads(ws);
    const byOrg = new Map(subs.map((s) => [s.orgId, s]));
    expect(byOrg.size).toBe(2);
    expect(byOrg.get("org-1").tenantIds).toEqual(["t1"]);
    expect(byOrg.get("org-2").tenantIds).toEqual(["tx"]);
  });

  it("emits an empty subscribe when the last subscription for an org goes away", () => {
    const client = new LiveStreamClient();
    const offA = client.subscribe("org-1", ["t1"], ["alert.created"], () => {});
    const ws = lastInstance();
    ws.open();
    vi.advanceTimersByTime(60);
    const beforeUnsub = lastSubscribePayloads(ws).length;
    expect(beforeUnsub).toBeGreaterThanOrEqual(1);

    offA();
    vi.advanceTimersByTime(60);

    const subs = lastSubscribePayloads(ws);
    expect(subs.length).toBeGreaterThan(beforeUnsub);
    const last = subs[subs.length - 1];
    expect(last.orgId).toBe("org-1");
    expect(last.tenantIds).toEqual([]);
    expect(last.eventTypes).toEqual([]);
  });

  it("dispatches inbound events only to handlers matching event type and tenant", () => {
    const client = new LiveStreamClient();
    const alertHandler = vi.fn();
    const traceHandler = vi.fn();
    client.subscribe("org-1", ["t1"], ["alert.created"], alertHandler);
    client.subscribe("org-1", ["t2"], ["agent_trace.created"], traceHandler);

    const ws = lastInstance();
    ws.open();
    vi.advanceTimersByTime(60);

    ws.message({ kind: "event", type: "alert.created", tenantId: "t1", data: { id: 1 }, ts: 1 });
    ws.message({ kind: "event", type: "alert.created", tenantId: "t2", data: { id: 2 }, ts: 2 });
    ws.message({ kind: "event", type: "agent_trace.created", tenantId: "t2", data: { id: 3 }, ts: 3 });
    ws.message({ kind: "event", type: "agent_trace.created", tenantId: "t1", data: { id: 4 }, ts: 4 });
    // global event (tenantId=null) should reach matching event-type handlers
    ws.message({ kind: "event", type: "alert.created", tenantId: null, data: { id: 5 }, ts: 5 });

    expect(alertHandler).toHaveBeenCalledTimes(2);
    expect(alertHandler.mock.calls[0][0]).toMatchObject({ tenantId: "t1", data: { id: 1 } });
    expect(alertHandler.mock.calls[1][0]).toMatchObject({ tenantId: null, data: { id: 5 } });

    expect(traceHandler).toHaveBeenCalledTimes(1);
    expect(traceHandler.mock.calls[0][0]).toMatchObject({ tenantId: "t2", data: { id: 3 } });
  });

  it("ignores invalid / malformed inbound payloads", () => {
    const client = new LiveStreamClient();
    const handler = vi.fn();
    client.subscribe("org-1", ["t1"], ["alert.created"], handler);
    const ws = lastInstance();
    ws.open();
    vi.advanceTimersByTime(60);

    ws.message("not-json");
    ws.message({ kind: "bogus" });
    ws.message({ kind: "event", type: "not-an-event", tenantId: "t1", data: {}, ts: 1 });

    expect(handler).not.toHaveBeenCalled();
  });
});

describe("LiveStreamClient - reconnect / backoff", () => {
  it("schedules reconnect with exponential backoff + jitter on close", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const client = new LiveStreamClient();
      client.subscribe("org-1", ["t1"], ["alert.created"], () => {});

      const ws1 = lastInstance();
      ws1.open();

      // Status should be "connected" right after open
      expect(client.getStatus()).toBe("connected");

      // First disconnect — backoff = 500 * 2^1 = 1000ms (+ 0 jitter)
      ws1.close();
      expect(client.getStatus()).toBe("reconnecting");
      // Just before delay -> still no new socket
      vi.advanceTimersByTime(999);
      expect(MockWebSocket.instances).toHaveLength(1);
      vi.advanceTimersByTime(1);
      expect(MockWebSocket.instances).toHaveLength(2);

      const ws2 = lastInstance();
      ws2.open();
      // Second disconnect — backoff = 500 * 2^1 again because attempt resets on open
      ws2.close();
      vi.advanceTimersByTime(1000);
      expect(MockWebSocket.instances).toHaveLength(3);

      // Without resetting attempts (no successful open), backoff grows.
      const ws3 = lastInstance();
      ws3.close(); // attempt becomes 2 -> 500 * 4 = 2000ms
      vi.advanceTimersByTime(1999);
      expect(MockWebSocket.instances).toHaveLength(3);
      vi.advanceTimersByTime(1);
      expect(MockWebSocket.instances).toHaveLength(4);

      const ws4 = lastInstance();
      ws4.close(); // attempt 3 -> 500 * 8 = 4000ms
      vi.advanceTimersByTime(3999);
      expect(MockWebSocket.instances).toHaveLength(4);
      vi.advanceTimersByTime(1);
      expect(MockWebSocket.instances).toHaveLength(5);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("caps backoff at 30s and adds jitter up to 250ms", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5); // jitter = 125ms
    try {
      const client = new LiveStreamClient();
      client.subscribe("org-1", ["t1"], ["alert.created"], () => {});
      // Simulate many failed connects (no opens between)
      for (let i = 0; i < 10; i++) {
        const ws = lastInstance();
        ws.close();
        vi.advanceTimersByTime(35000);
      }
      // After capping, delay = 30000 + 125 jitter
      const before = MockWebSocket.instances.length;
      const ws = lastInstance();
      ws.close();
      vi.advanceTimersByTime(30124);
      expect(MockWebSocket.instances.length).toBe(before);
      vi.advanceTimersByTime(1);
      expect(MockWebSocket.instances.length).toBe(before + 1);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("re-sends aggregated subscribe after reconnect", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const client = new LiveStreamClient();
    client.subscribe("org-1", ["t1", "t2"], ["alert.created"], () => {});

    const ws1 = lastInstance();
    ws1.open();
    vi.advanceTimersByTime(60);
    expect(lastSubscribePayloads(ws1).length).toBeGreaterThanOrEqual(1);

    ws1.close();
    vi.advanceTimersByTime(1000);
    const ws2 = lastInstance();
    expect(ws2).not.toBe(ws1);
    ws2.open();
    vi.advanceTimersByTime(60);

    const subsAfter = lastSubscribePayloads(ws2);
    expect(subsAfter.length).toBeGreaterThanOrEqual(1);
    const last = subsAfter[subsAfter.length - 1];
    expect(new Set(last.tenantIds)).toEqual(new Set(["t1", "t2"]));
    expect(last.eventTypes).toEqual(["alert.created"]);
  });

  it("notifies status listeners through the connect → reconnect → connected lifecycle", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const client = new LiveStreamClient();
    const seen: string[] = [];
    client.onStatus((s) => seen.push(s));

    client.ensureConnected();
    const ws1 = lastInstance();
    ws1.open();
    ws1.close();
    vi.advanceTimersByTime(1000);
    const ws2 = lastInstance();
    ws2.open();

    expect(seen).toContain("connected");
    expect(seen).toContain("reconnecting");
    // Last observed status is connected
    expect(client.getStatus()).toBe("connected");
  });
});
