import { EventEmitter } from "events";

export type LiveEventType =
  | "agent_trace.created"
  | "agent_trace.updated"
  | "alert.created"
  | "entra_signin.batch"
  | "llm_call.recorded"
  | "mcp_tool_call.recorded"
  | "service_health.changed";

export interface LiveEvent<T = any> {
  type: LiveEventType;
  tenantId: string | null;
  data: T;
  ts: number;
}

class LiveEventBus {
  private emitter = new EventEmitter();
  private subscriberCount = 0;

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  emit(type: LiveEventType, tenantId: string | null, data: any): void {
    if (this.subscriberCount === 0) return;
    const event: LiveEvent = { type, tenantId, data, ts: Date.now() };
    this.emitter.emit("event", event);
  }

  on(handler: (e: LiveEvent) => void): () => void {
    this.subscriberCount++;
    this.emitter.on("event", handler);
    return () => {
      this.subscriberCount = Math.max(0, this.subscriberCount - 1);
      this.emitter.off("event", handler);
    };
  }

  hasSubscribers(): boolean {
    return this.subscriberCount > 0;
  }
}

export const liveEvents = new LiveEventBus();
