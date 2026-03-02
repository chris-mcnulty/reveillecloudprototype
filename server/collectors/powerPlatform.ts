import { isAzureAppConfigured } from "../azureAuth";
import { storage } from "../storage";

interface PPCollectionResult {
  environments: number;
  apps: number;
  flows: number;
  bots: number;
  errors: string[];
}

async function graphBetaFetch(token: string, path: string, extraHeaders?: Record<string, string>): Promise<any> {
  const url = `https://graph.microsoft.com/beta${path}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Accept": "application/json",
      ...extraHeaders,
    },
  });

  if (resp.status === 401 || resp.status === 403) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Permission denied (${resp.status}) for ${path}: ${body.slice(0, 300)}`);
  }

  if (resp.status === 404) {
    return { value: [] };
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Graph beta ${resp.status}: ${text.slice(0, 300)}`);
  }

  return resp.json();
}

async function graphBetaFetchAll(token: string, path: string, extraHeaders?: Record<string, string>): Promise<any[]> {
  let all: any[] = [];
  let url: string | null = path;

  while (url) {
    const data = url.startsWith("https://")
      ? await (async () => {
          const resp = await fetch(url!, {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...extraHeaders },
          });
          if (!resp.ok) return { value: [] };
          return resp.json();
        })()
      : await graphBetaFetch(token, url, extraHeaders);

    all = all.concat(data.value || []);
    url = data["@odata.nextLink"] || null;

    if (all.length > 500) break;
  }

  return all;
}

async function getGraphToken(azureTenantId: string): Promise<string> {
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Azure credentials not configured");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const resp = await fetch(
    `https://login.microsoftonline.com/${azureTenantId}/oauth2/v2.0/token`,
    { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" } },
  );

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Graph token failed (${resp.status}): ${errText.slice(0, 200)}`);
  }

  const data = await resp.json();
  return data.access_token;
}

async function collectEnvironments(
  tenantId: string,
  token: string,
  azureTenantId: string,
): Promise<{ count: number; envIds: string[] }> {
  try {
    const data = await graphBetaFetch(token, "/admin/powerPlatform/environments");
    const envs = data.value || [];

    if (envs.length === 0) {
      return await collectEnvironmentsFallback(tenantId, token, azureTenantId);
    }

    const envIds: string[] = [];
    for (const env of envs) {
      const envId = env.name || env.id;
      envIds.push(envId);
      await storage.upsertPowerPlatformEnvironment({
        tenantId,
        environmentId: envId,
        displayName: env.displayName || envId,
        environmentType: env.environmentType || env.type || "Unknown",
        region: env.location || env.azureRegion || null,
        state: "Ready",
        properties: {
          createdTime: env.createdDateTime,
          createdBy: env.createdBy?.displayName || env.createdBy?.userPrincipalName,
          isDefault: env.isDefault,
          description: env.description,
        },
      });
    }

    console.log(`[PowerPlatform] Found ${envs.length} environments via Graph beta`);
    return { count: envs.length, envIds };
  } catch (err: any) {
    console.warn(`[PowerPlatform] Graph beta environments endpoint unavailable, using fallback`);
    return await collectEnvironmentsFallback(tenantId, token, azureTenantId);
  }
}

async function collectEnvironmentsFallback(
  tenantId: string,
  token: string,
  azureTenantId: string,
): Promise<{ count: number; envIds: string[] }> {
  try {
    const data = await graphBetaFetch(token, "/organization");
    const org = (data.value || [])[0];
    if (!org) return { count: 0, envIds: [] };

    const defaultEnvId = `default-${azureTenantId}`;
    await storage.upsertPowerPlatformEnvironment({
      tenantId,
      environmentId: defaultEnvId,
      displayName: `${org.displayName} (Default)`,
      environmentType: "Default",
      region: org.preferredDataLocation || null,
      state: "Ready",
      properties: {
        tenantDisplayName: org.displayName,
        verifiedDomains: org.verifiedDomains?.map((d: any) => d.name),
        tenantType: org.tenantType,
      },
    });

    console.log(`[PowerPlatform] Created default environment from org: ${org.displayName}`);
    return { count: 1, envIds: [defaultEnvId] };
  } catch (err: any) {
    console.warn(`[PowerPlatform] Fallback environment creation failed: ${err.message}`);
    return { count: 0, envIds: [] };
  }
}

async function collectAppRegistrations(
  tenantId: string,
  token: string,
  envId: string,
): Promise<{ apps: number; bots: number; flows: number }> {
  let apps = 0;
  let bots = 0;
  let flows = 0;

  try {
    const allApps = await graphBetaFetchAll(
      token,
      `/applications?$select=id,displayName,appId,createdDateTime,tags,web,requiredResourceAccess,signInAudience`,
    );

    console.log(`[PowerPlatform] Found ${allApps.length} total app registrations`);

    for (const app of allApps) {
      const tags: string[] = app.tags || [];
      const name: string = app.displayName || "";
      const tagStr = tags.join(" ").toLowerCase();

      const isCopilotStudio = tags.some((t: string) =>
        t === "AIAgentBuilder" || t === "AgenticApp" || t.startsWith("AgentCreatedBy:") || t.startsWith("power-virtual-agents-")
      );

      const isPowerAutomate = tags.some((t: string) =>
        t.toLowerCase().includes("powerautomate") || t.toLowerCase().includes("logicapp") || t.toLowerCase() === "flow"
      );

      const isPowerApp = tags.some((t: string) =>
        t.toLowerCase().includes("powerapp") || t.toLowerCase().includes("canvasapp") || t.toLowerCase().includes("modeldrivenapp")
      );

      const hasBotFramework = app.requiredResourceAccess?.some((r: any) =>
        r.resourceAppId === "4345a7b9-9a63-4910-a426-35363201d503"
      );

      const isMCPConnection = name.toLowerCase().includes("mcp");

      if (isCopilotStudio) {
        const pvaTag = tags.find((t: string) => t.startsWith("power-virtual-agents-"));
        const pvaId = pvaTag ? pvaTag.replace("power-virtual-agents-", "") : null;

        await storage.upsertPowerPlatformResource({
          tenantId,
          environmentId: envId,
          resourceType: "bot",
          resourceId: app.appId || app.id,
          displayName: name,
          owner: null,
          status: "active",
          lastModifiedDate: app.createdDateTime || null,
          lastRunDate: null,
          details: {
            botType: "CopilotStudio",
            platform: "Microsoft Copilot Studio",
            tags,
            pvaAgentId: pvaId,
            signInAudience: app.signInAudience,
            homePageUrl: app.web?.homePageUrl,
          },
        });
        bots++;
      } else if (hasBotFramework) {
        await storage.upsertPowerPlatformResource({
          tenantId,
          environmentId: envId,
          resourceType: "bot",
          resourceId: app.appId || app.id,
          displayName: name || "Bot Framework App",
          owner: null,
          status: "registered",
          lastModifiedDate: app.createdDateTime || null,
          lastRunDate: null,
          details: {
            botType: "BotFramework",
            platform: "Azure Bot Service",
            tags,
            homePageUrl: app.web?.homePageUrl,
          },
        });
        bots++;
      } else if (isPowerAutomate) {
        await storage.upsertPowerPlatformResource({
          tenantId,
          environmentId: envId,
          resourceType: "flow",
          resourceId: app.appId || app.id,
          displayName: name || "Power Automate Flow",
          owner: null,
          status: "active",
          lastModifiedDate: app.createdDateTime || null,
          lastRunDate: null,
          details: { tags, signInAudience: app.signInAudience },
        });
        flows++;
      } else if (isPowerApp) {
        await storage.upsertPowerPlatformResource({
          tenantId,
          environmentId: envId,
          resourceType: "app",
          resourceId: app.appId || app.id,
          displayName: name || "Power App",
          owner: null,
          status: "published",
          lastModifiedDate: app.createdDateTime || null,
          lastRunDate: null,
          details: {
            appType: tagStr.includes("canvas") ? "CanvasApp" : "ModelDrivenApp",
            tags,
            signInAudience: app.signInAudience,
          },
        });
        apps++;
      } else if (isMCPConnection) {
        await storage.upsertPowerPlatformResource({
          tenantId,
          environmentId: envId,
          resourceType: "app",
          resourceId: app.appId || app.id,
          displayName: name,
          owner: null,
          status: "registered",
          lastModifiedDate: app.createdDateTime || null,
          lastRunDate: null,
          details: {
            appType: "MCPConnection",
            tags,
            homePageUrl: app.web?.homePageUrl,
          },
        });
        apps++;
      }
    }

    console.log(`[PowerPlatform] App registrations classified: ${bots} bots/agents, ${apps} apps, ${flows} flows`);
  } catch (err: any) {
    console.warn(`[PowerPlatform] App registration collection failed: ${err.message}`);
  }

  return { apps, bots, flows };
}

async function collectTeamsApps(
  tenantId: string,
  token: string,
  envId: string,
): Promise<number> {
  let agentCount = 0;

  try {
    const data = await graphBetaFetch(
      token,
      `/appCatalogs/teamsApps?$filter=distributionMethod eq 'organization'&$select=id,displayName,externalId,distributionMethod`,
    );

    const apps = data.value || [];
    console.log(`[PowerPlatform] Found ${apps.length} org-deployed Teams apps`);

    for (const app of apps) {
      let appDefs: any[] = [];
      try {
        const defData = await graphBetaFetch(
          token,
          `/appCatalogs/teamsApps/${app.id}/appDefinitions?$select=id,displayName,description,version,createdBy,publishingState,bot`,
        );
        appDefs = defData.value || [];
      } catch {
      }

      const latestDef = appDefs[appDefs.length - 1] || {};
      const hasBot = !!latestDef.bot ||
        latestDef.description?.toLowerCase().includes("agent") ||
        latestDef.description?.toLowerCase().includes("copilot") ||
        latestDef.description?.toLowerCase().includes("bot");

      if (hasBot) {
        await storage.upsertPowerPlatformResource({
          tenantId,
          environmentId: envId,
          resourceType: "bot",
          resourceId: app.externalId || app.id,
          displayName: latestDef.displayName || app.displayName || "Teams Agent",
          owner: latestDef.createdBy?.user?.displayName || null,
          status: latestDef.publishingState || "published",
          lastModifiedDate: null,
          lastRunDate: null,
          details: {
            botType: "M365Agent",
            platform: "Teams",
            version: latestDef.version,
            distributionMethod: app.distributionMethod,
            description: latestDef.description?.slice(0, 500),
          },
        });
        agentCount++;
      }
    }
  } catch (err: any) {
    const msg = err.message || "";
    if (msg.includes("Permission denied")) {
      console.warn(`[PowerPlatform] Teams app catalog: needs AppCatalog.Read.All permission`);
    } else {
      console.warn(`[PowerPlatform] Teams apps collection failed: ${msg.slice(0, 200)}`);
    }
  }

  return agentCount;
}

async function collectServicePrincipalBots(
  tenantId: string,
  token: string,
  envId: string,
  knownAppIds: Set<string>,
): Promise<number> {
  let botCount = 0;

  try {
    const allSPs = await graphBetaFetchAll(
      token,
      `/servicePrincipals?$select=id,displayName,appId,tags,createdDateTime,servicePrincipalType,accountEnabled`,
    );

    for (const sp of allSPs) {
      if (knownAppIds.has(sp.appId)) continue;

      const tags: string[] = sp.tags || [];
      const isBot = tags.some((t: string) =>
        t.includes("Bot") || t.includes("CopilotStudio") || t.includes("PVA") ||
        t.includes("VirtualAgent") || t === "AIAgentBuilder" || t === "AgenticApp"
      );

      if (isBot) {
        await storage.upsertPowerPlatformResource({
          tenantId,
          environmentId: envId,
          resourceType: "bot",
          resourceId: sp.appId || sp.id,
          displayName: sp.displayName || "Bot Service Principal",
          owner: null,
          status: sp.accountEnabled !== false ? "active" : "disabled",
          lastModifiedDate: sp.createdDateTime || null,
          lastRunDate: null,
          details: {
            botType: tags.some((t: string) => t.includes("CopilotStudio") || t === "AIAgentBuilder") ? "CopilotStudio" : "BotFramework",
            tags,
            servicePrincipalType: sp.servicePrincipalType,
            source: "servicePrincipal",
          },
        });
        botCount++;
        knownAppIds.add(sp.appId);
      }
    }
  } catch (err: any) {
    console.warn(`[PowerPlatform] Service principal bot scan: ${err.message?.slice(0, 200)}`);
  }

  return botCount;
}

export async function collectPowerPlatformTelemetry(tenantId: string): Promise<PPCollectionResult> {
  const result: PPCollectionResult = {
    environments: 0,
    apps: 0,
    flows: 0,
    bots: 0,
    errors: [],
  };

  const tenant = await storage.getTenant(tenantId);
  if (!tenant?.azureTenantId || !isAzureAppConfigured()) {
    result.errors.push("Azure AD not configured for this tenant");
    return result;
  }

  let token: string;
  try {
    token = await getGraphToken(tenant.azureTenantId);
  } catch (err: any) {
    result.errors.push(`Graph token acquisition failed: ${err.message}`);
    return result;
  }

  const { count: envCount, envIds } = await collectEnvironments(tenantId, token, tenant.azureTenantId);
  result.environments = envCount;

  const primaryEnvId = envIds[0] || `default-${tenant.azureTenantId}`;

  const appResults = await collectAppRegistrations(tenantId, token, primaryEnvId);
  result.apps += appResults.apps;
  result.bots += appResults.bots;
  result.flows += appResults.flows;

  const teamsAgents = await collectTeamsApps(tenantId, token, primaryEnvId);
  result.bots += teamsAgents;

  const knownAppIds = new Set<string>();
  const spBots = await collectServicePrincipalBots(tenantId, token, primaryEnvId, knownAppIds);
  result.bots += spBots;

  console.log(`[PowerPlatform] Collection complete for ${tenant.name}: ${result.environments} envs, ${result.apps} apps, ${result.flows} flows, ${result.bots} bots/agents`);
  return result;
}
