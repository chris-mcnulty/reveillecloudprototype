import { storage } from "../storage";
import type { InsertKnownAgent } from "@shared/schema";

export interface Agent365DiscoveryResult {
  sourceId: string;
  status: "success" | "error" | "not_configured";
  agentsFound: number;
  error?: string;
  agentIds: string[];
}

function readEnv(name: string | null | undefined): string | null {
  if (!name) return null;
  return process.env[name] ?? null;
}

async function acquireGraphToken(tenantId: string, clientId: string, clientSecret: string): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
  });
  const resp = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Graph token request failed: ${resp.status} ${text.slice(0, 200)}`);
  }
  const data: any = await resp.json();
  return data.access_token;
}

async function listAgent365Agents(accessToken: string): Promise<any[]> {
  const { Client } = await import("@microsoft/microsoft-graph-client");
  const client = Client.init({
    authProvider: (done) => done(null, accessToken),
  });
  const agents: any[] = [];
  try {
    const resp = await client.api("/copilot/agents").get();
    if (Array.isArray(resp?.value)) agents.push(...resp.value);
  } catch (err: any) {
    throw new Error(`Agent 365 listing failed: ${err?.message || err}`);
  }
  return agents;
}

function mapAgent365Record(tenantId: string, rec: any): InsertKnownAgent {
  return {
    tenantId,
    name: rec?.displayName ?? rec?.name ?? "Microsoft Agent",
    description: rec?.description ?? null,
    source: "agent365",
    externalId: rec?.id ?? rec?.appId ?? null,
    endpoint: rec?.manifestUrl ?? rec?.endpoint ?? null,
    platform: "copilot",
    agentCard: rec ?? {},
    capabilities: {
      skills: rec?.capabilities ?? rec?.skills ?? [],
      publisher: rec?.publisher ?? null,
      version: rec?.version ?? null,
    },
    status: rec?.state === "disabled" ? "stale" : "active",
  };
}

export async function runAgent365DiscoveryForTenant(
  tenantId: string,
  opts?: { sourceId?: string },
): Promise<Agent365DiscoveryResult[]> {
  const sources = (await storage.getAgentDiscoverySources(tenantId))
    .filter(s => s.kind === "agent365" && s.enabled && (!opts?.sourceId || s.id === opts.sourceId));

  const results: Agent365DiscoveryResult[] = [];
  for (const src of sources) {
    const cfg = src.config ?? {};
    const entraTenantId = readEnv(cfg.tenantIdEnvVar) ?? cfg.tenantId ?? null;
    const clientId = readEnv(cfg.clientIdEnvVar) ?? cfg.clientId ?? null;
    const clientSecret = readEnv(cfg.clientSecretEnvVar) ?? null;

    if (!entraTenantId || !clientId || !clientSecret) {
      const result: Agent365DiscoveryResult = {
        sourceId: src.id,
        status: "not_configured",
        agentsFound: 0,
        error: "Missing Graph credentials (tenantIdEnvVar / clientIdEnvVar / clientSecretEnvVar)",
        agentIds: [],
      };
      await storage.updateAgentDiscoverySource(src.id, {
        lastRunAt: new Date(),
        lastStatus: "not_configured",
        lastError: result.error ?? null,
        agentsFound: 0,
      });
      results.push(result);
      continue;
    }

    try {
      const token = await acquireGraphToken(entraTenantId, clientId, clientSecret);
      const records = await listAgent365Agents(token);
      const agentIds: string[] = [];
      for (const rec of records) {
        const agent = await storage.upsertKnownAgentByExternalId(mapAgent365Record(tenantId, rec));
        agentIds.push(agent.id);
      }
      await storage.updateAgentDiscoverySource(src.id, {
        lastRunAt: new Date(),
        lastStatus: "success",
        lastError: null,
        agentsFound: agentIds.length,
      });
      results.push({ sourceId: src.id, status: "success", agentsFound: agentIds.length, agentIds });
    } catch (err: any) {
      const msg = String(err?.message || err);
      await storage.updateAgentDiscoverySource(src.id, {
        lastRunAt: new Date(),
        lastStatus: "error",
        lastError: msg,
        agentsFound: 0,
      });
      results.push({ sourceId: src.id, status: "error", agentsFound: 0, error: msg, agentIds: [] });
    }
  }
  return results;
}
