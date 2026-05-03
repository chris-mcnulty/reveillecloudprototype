import { describe, it, expect } from "vitest";
import { liveEvents } from "../events";

describe("LiveEventBus", () => {
  it("does not emit when there are no subscribers", () => {
    let called = false;
    liveEvents.emit("alert.created", "tenant-a", { id: 1 });
    expect(called).toBe(false);
    expect(liveEvents.hasSubscribers()).toBe(false);
  });

  it("delivers events to subscribers and tracks subscriber count", () => {
    const received: any[] = [];
    const off = liveEvents.on((e) => received.push(e));
    expect(liveEvents.hasSubscribers()).toBe(true);

    liveEvents.emit("alert.created", "tenant-a", { id: 1 });
    liveEvents.emit("agent_trace.created", null, { id: 2 });

    expect(received).toHaveLength(2);
    expect(received[0]).toMatchObject({
      type: "alert.created",
      tenantId: "tenant-a",
      data: { id: 1 },
    });
    expect(received[0].ts).toBeTypeOf("number");
    expect(received[1]).toMatchObject({
      type: "agent_trace.created",
      tenantId: null,
      data: { id: 2 },
    });

    off();
    expect(liveEvents.hasSubscribers()).toBe(false);

    // After unsubscribe further emits should be no-ops
    liveEvents.emit("alert.created", "tenant-a", { id: 3 });
    expect(received).toHaveLength(2);
  });

  it("supports multiple concurrent subscribers", () => {
    const a: any[] = [];
    const b: any[] = [];
    const offA = liveEvents.on((e) => a.push(e));
    const offB = liveEvents.on((e) => b.push(e));

    liveEvents.emit("llm_call.recorded", "t1", {});
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);

    offA();
    liveEvents.emit("llm_call.recorded", "t1", {});
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(2);

    offB();
    expect(liveEvents.hasSubscribers()).toBe(false);
  });
});
