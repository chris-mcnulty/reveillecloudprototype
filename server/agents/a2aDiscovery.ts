import { storage } from "../storage";
import type { InsertKnownAgent } from "@shared/schema";

export interface A2ADiscoveryResult {
  sourceId: string;
  url: string;
  status: "success" | "error";
  agentsFound: number;
  error?: string;
  agentIds: string[];
}

const WELL_KNOWN_PATH = "/.well-known/agent.json";

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function deriveAgentCardUrl(baseUrl: string): string {
  const base = normalizeBaseUrl(baseUrl);
  if (base.endsWith(".json")) return base;
  return `${base}${WELL_KNOWN_PATH}`;
}

function mapCardToAgent(tenantId: string, baseUrl: string, card: any): InsertKnownAgent {
  const capabilities: Record<string, any> = {
    skills: card?.skills ?? [],
    defaultInputModes: card?.defaultInputModes ?? [],
    defaultOutputModes: card?.defaultOutputModes ?? [],
    streaming: card?.capabilities?.streaming ?? false,
    pushNotifications: card?.capabilities?.pushNotifications ?? false,
    authentication: card?.authentication ?? null,
  };

  return {
    tenantId,
    name: card?.name ?? "Unnamed A2A agent",
    description: card?.description ?? null,
    source: "a2a",
    externalId: card?.id ?? card?.url ?? baseUrl,
    endpoint: card?.url ?? baseUrl,
    platform: inferPlatform(card, baseUrl),
    agentCard: card ?? {},
    capabilities,
    status: "active",
  };
}

function inferPlatform(card: any, url: string): string {
  const blob = JSON.stringify({ card, url }).toLowerCase();
  if (blob.includes("copilot")) return "copilot";
  if (blob.includes("foundry")) return "foundry";
  if (blob.includes("salesforce") || blob.includes("agentforce")) return "agentforce";
  if (blob.includes("openai") || blob.includes("gpt")) return "gpt";
  return "other";
}

export async function discoverA2aAgentAtUrl(
  tenantId: string,
  sourceId: string,
  baseUrl: string,
): Promise<A2ADiscoveryResult> {
  const url = deriveAgentCardUrl(baseUrl);
  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) {
      return { sourceId, url, status: "error", agentsFound: 0, error: `HTTP ${resp.status}`, agentIds: [] };
    }
    const card: any = await resp.json();
    const insert = mapCardToAgent(tenantId, baseUrl, card);
    const agent = await storage.upsertKnownAgentByExternalId(insert);
    return { sourceId, url, status: "success", agentsFound: 1, agentIds: [agent.id] };
  } catch (err: any) {
    return { sourceId, url, status: "error", agentsFound: 0, error: String(err?.message || err), agentIds: [] };
  }
}

export async function runA2aDiscoveryForTenant(tenantId: string, opts?: { sourceId?: string }): Promise<A2ADiscoveryResult[]> {
  const sources = (await storage.getAgentDiscoverySources(tenantId))
    .filter(s => s.kind === "a2a" && s.enabled && (!opts?.sourceId || s.id === opts.sourceId));

  const results: A2ADiscoveryResult[] = [];
  for (const src of sources) {
    if (!src.baseUrl) {
      results.push({ sourceId: src.id, url: "", status: "error", agentsFound: 0, error: "No baseUrl configured", agentIds: [] });
      continue;
    }
    const result = await discoverA2aAgentAtUrl(tenantId, src.id, src.baseUrl);
    await storage.updateAgentDiscoverySource(src.id, {
      lastRunAt: new Date(),
      lastStatus: result.status,
      lastError: result.error ?? null,
      agentsFound: result.agentsFound,
    });
    results.push(result);
  }
  return results;
}
