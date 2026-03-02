import { isAzureAppConfigured } from "../azureAuth";
import { storage } from "../storage";

interface PPCollectionResult {
  environments: number;
  apps: number;
  flows: number;
  bots: number;
  errors: string[];
}

async function graphBetaFetch(token: string, path: string): Promise<any> {
  const url = `https://graph.microsoft.com/beta${path}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Accept": "application/json",
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
): Promise<{ count: number; envIds: string[] }> {
  try {
    const data = await graphBetaFetch(token, "/admin/powerPlatform/environments");

    const envs = data.value || [];
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
        state: env.lifecycleOperationsEnforcement?.allowedOperations ? "Ready" : (env.states?.management?.id || "Ready"),
        properties: {
          createdTime: env.createdDateTime,
          createdBy: env.createdBy?.displayName || env.createdBy?.userPrincipalName,
          linkedEnvironmentMetadata: env.linkedEnvironmentMetadata ? {
            instanceUrl: env.linkedEnvironmentMetadata.instanceUrl,
            type: env.linkedEnvironmentMetadata.type,
            version: env.linkedEnvironmentMetadata.version,
          } : null,
          retentionPeriod: env.retentionPeriod,
          isDefault: env.isDefault,
          governanceConfiguration: env.governanceConfiguration,
          description: env.description,
        },
      });
    }

    console.log(`[PowerPlatform] Found ${envs.length} environments via Graph beta`);
    return { count: envs.length, envIds };
  } catch (err: any) {
    if (err.message?.includes("Permission denied") || err.message?.includes("404")) {
      console.warn(`[PowerPlatform] Graph beta environments not available: ${err.message}`);
      return await collectEnvironmentsFallback(tenantId, token);
    }
    console.warn(`[PowerPlatform] Environment collection failed: ${err.message}`);
    return { count: 0, envIds: [] };
  }
}

async function collectEnvironmentsFallback(
  tenantId: string,
  token: string,
): Promise<{ count: number; envIds: string[] }> {
  try {
    const data = await graphBetaFetch(token, "/organization");
    const org = (data.value || [])[0];
    if (!org) return { count: 0, envIds: [] };

    const defaultEnvId = `default-${org.id}`;
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

    console.log(`[PowerPlatform] Created default environment from org data`);
    return { count: 1, envIds: [defaultEnvId] };
  } catch (err: any) {
    console.warn(`[PowerPlatform] Fallback environment creation failed: ${err.message}`);
    return { count: 0, envIds: [] };
  }
}

async function collectPowerApps(
  tenantId: string,
  token: string,
  envId: string,
): Promise<number> {
  try {
    const data = await graphBetaFetch(
      token,
      `/deviceAppManagement/mobileApps?$filter=isAssigned eq true&$top=100`,
    );

    const apps = data.value || [];
    let ppAppCount = 0;

    for (const app of apps) {
      if (app["@odata.type"]?.includes("managedApp") || app["@odata.type"]?.includes("webApp")) {
        await storage.upsertPowerPlatformResource({
          tenantId,
          environmentId: envId,
          resourceType: "app",
          resourceId: app.id,
          displayName: app.displayName || "Unknown App",
          owner: app.createdBy || app.lastModifiedBy || null,
          status: app.publishingState || "published",
          lastModifiedDate: app.lastModifiedDateTime || null,
          lastRunDate: null,
          details: {
            appType: app["@odata.type"]?.split(".")?.pop(),
            description: app.description,
            publisher: app.publisher,
            createdDateTime: app.createdDateTime,
            isFeatured: app.isFeatured,
            privacyInformationUrl: app.privacyInformationUrl,
          },
        });
        ppAppCount++;
      }
    }

    return ppAppCount;
  } catch (err: any) {
    if (!err.message?.includes("Permission denied")) {
      console.warn(`[PowerPlatform] App collection via Graph failed: ${err.message}`);
    }
    return 0;
  }
}

async function collectServicePrincipals(
  tenantId: string,
  token: string,
  envId: string,
): Promise<{ apps: number; bots: number }> {
  let apps = 0;
  let bots = 0;

  try {
    const ppAppsData = await graphBetaFetch(
      token,
      `/servicePrincipals?$filter=startswith(tags/any(t: t), 'PowerApp')&$top=200&$select=id,displayName,appId,appOwnerOrganizationId,tags,createdDateTime,servicePrincipalType`,
    );

    for (const sp of (ppAppsData.value || [])) {
      const isPowerApp = sp.tags?.some((t: string) => t.includes("PowerApp") || t.includes("CanvasApp") || t.includes("ModelDrivenApp"));
      if (isPowerApp) {
        await storage.upsertPowerPlatformResource({
          tenantId,
          environmentId: envId,
          resourceType: "app",
          resourceId: sp.appId || sp.id,
          displayName: sp.displayName || "Unknown App",
          owner: null,
          status: "published",
          lastModifiedDate: sp.createdDateTime || null,
          lastRunDate: null,
          details: {
            appType: sp.tags?.find((t: string) => t.includes("Canvas")) ? "CanvasApp" : "ModelDrivenApp",
            servicePrincipalType: sp.servicePrincipalType,
            tags: sp.tags,
          },
        });
        apps++;
      }
    }
  } catch (err: any) {
    // Silently handle — we'll try broader approach
  }

  try {
    const appsData = await graphBetaFetch(
      token,
      `/applications?$filter=tags/any(t: t eq 'power-platform') or tags/any(t: t eq 'powerapp')&$top=200&$select=id,displayName,appId,createdDateTime,tags,web`,
    );

    for (const app of (appsData.value || [])) {
      await storage.upsertPowerPlatformResource({
        tenantId,
        environmentId: envId,
        resourceType: "app",
        resourceId: app.appId || app.id,
        displayName: app.displayName || "Unknown App",
        owner: null,
        status: "registered",
        lastModifiedDate: app.createdDateTime || null,
        lastRunDate: null,
        details: {
          appType: "RegisteredApp",
          tags: app.tags,
          homePageUrl: app.web?.homePageUrl,
        },
      });
      apps++;
    }
  } catch {
    // Filter syntax may not match — non-critical
  }

  try {
    const botsData = await graphBetaFetch(
      token,
      `/servicePrincipals?$filter=tags/any(t: t eq 'BotServiceDirectLine') or tags/any(t: t eq 'BotServiceV4') or servicePrincipalType eq 'ManagedIdentity'&$top=200&$select=id,displayName,appId,tags,createdDateTime,servicePrincipalType,appOwnerOrganizationId`,
    );

    for (const sp of (botsData.value || [])) {
      const isBot = sp.tags?.some((t: string) =>
        t.includes("Bot") || t.includes("CopilotStudio") || t.includes("PVA") || t.includes("VirtualAgent")
      );
      if (isBot) {
        await storage.upsertPowerPlatformResource({
          tenantId,
          environmentId: envId,
          resourceType: "bot",
          resourceId: sp.appId || sp.id,
          displayName: sp.displayName || "Unknown Bot",
          owner: null,
          status: sp.accountEnabled !== false ? "active" : "disabled",
          lastModifiedDate: sp.createdDateTime || null,
          lastRunDate: null,
          details: {
            botType: sp.tags?.find((t: string) => t.includes("CopilotStudio")) ? "CopilotStudio" : "BotFramework",
            tags: sp.tags,
            servicePrincipalType: sp.servicePrincipalType,
          },
        });
        bots++;
      }
    }
  } catch {
    // Bot filter may not match — non-critical
  }

  return { apps, bots };
}

async function collectFlows(
  tenantId: string,
  token: string,
  envId: string,
): Promise<number> {
  try {
    const data = await graphBetaFetch(
      token,
      `/servicePrincipals?$filter=tags/any(t: t eq 'PowerAutomate') or tags/any(t: t eq 'LogicApp') or tags/any(t: t eq 'Flow')&$top=200&$select=id,displayName,appId,tags,createdDateTime,servicePrincipalType`,
    );

    const flows = data.value || [];
    let flowCount = 0;

    for (const sp of flows) {
      const isFlow = sp.tags?.some((t: string) =>
        t.includes("PowerAutomate") || t.includes("LogicApp") || t.includes("Flow")
      );
      if (isFlow) {
        await storage.upsertPowerPlatformResource({
          tenantId,
          environmentId: envId,
          resourceType: "flow",
          resourceId: sp.appId || sp.id,
          displayName: sp.displayName || "Unknown Flow",
          owner: null,
          status: "active",
          lastModifiedDate: sp.createdDateTime || null,
          lastRunDate: null,
          details: {
            tags: sp.tags,
            servicePrincipalType: sp.servicePrincipalType,
          },
        });
        flowCount++;
      }
    }

    return flowCount;
  } catch (err: any) {
    if (!err.message?.includes("Permission denied")) {
      console.warn(`[PowerPlatform] Flow collection via Graph failed: ${err.message}`);
    }
    return 0;
  }
}

async function collectM365Agents(
  tenantId: string,
  token: string,
  envId: string,
): Promise<{ agents: number }> {
  let agentCount = 0;

  try {
    const teamsAppsData = await graphBetaFetch(
      token,
      `/appCatalogs/teamsApps?$filter=distributionMethod eq 'organization'&$top=200&$select=id,displayName,externalId,distributionMethod`,
    );

    for (const app of (teamsAppsData.value || [])) {
      let appDefs: any[] = [];
      try {
        const defData = await graphBetaFetch(
          token,
          `/appCatalogs/teamsApps/${app.id}/appDefinitions?$select=id,displayName,description,version,createdBy,publishingState,bot`,
        );
        appDefs = defData.value || [];
      } catch {
        // Can't get definitions — skip
      }

      const latestDef = appDefs[appDefs.length - 1] || {};
      const hasBot = !!latestDef.bot || latestDef.description?.toLowerCase().includes("agent") || latestDef.description?.toLowerCase().includes("copilot");

      if (hasBot) {
        await storage.upsertPowerPlatformResource({
          tenantId,
          environmentId: envId,
          resourceType: "bot",
          resourceId: app.externalId || app.id,
          displayName: latestDef.displayName || app.displayName || "Unknown Agent",
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
    console.warn(`[PowerPlatform] M365 Agents collection failed: ${err.message}`);
  }

  try {
    const botAppsData = await graphBetaFetch(
      token,
      `/applications?$select=id,displayName,appId,createdDateTime,tags,web,requiredResourceAccess&$top=200`,
    );

    for (const app of (botAppsData.value || [])) {
      const hasBotFramework = app.requiredResourceAccess?.some((r: any) =>
        r.resourceAppId === "4345a7b9-9a63-4910-a426-35363201d503"
      );

      if (hasBotFramework) {
        await storage.upsertPowerPlatformResource({
          tenantId,
          environmentId: envId,
          resourceType: "bot",
          resourceId: app.appId || app.id,
          displayName: app.displayName || "Unknown Bot App",
          owner: null,
          status: "registered",
          lastModifiedDate: app.createdDateTime || null,
          lastRunDate: null,
          details: {
            botType: "BotFramework",
            platform: "AzureBotService",
            tags: app.tags,
            homePageUrl: app.web?.homePageUrl,
          },
        });
        agentCount++;
      }
    }
  } catch (err: any) {
    if (!err.message?.includes("Permission denied")) {
      console.warn(`[PowerPlatform] Bot Framework app detection failed: ${err.message}`);
    }
  }

  return { agents: agentCount };
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

  const { count: envCount, envIds } = await collectEnvironments(tenantId, token);
  result.environments = envCount;

  const primaryEnvId = envIds[0] || `default-${tenant.azureTenantId}`;

  const spResults = await collectServicePrincipals(tenantId, token, primaryEnvId);
  result.apps += spResults.apps;
  result.bots += spResults.bots;

  const flowCount = await collectFlows(tenantId, token, primaryEnvId);
  result.flows += flowCount;

  const agentResults = await collectM365Agents(tenantId, token, primaryEnvId);
  result.bots += agentResults.agents;

  for (const envId of envIds) {
    if (envId === primaryEnvId) continue;

    const appCount = await collectPowerApps(tenantId, token, envId);
    result.apps += appCount;

    await new Promise(resolve => setTimeout(resolve, 300));
  }

  console.log(`[PowerPlatform] Collection complete: ${result.environments} envs, ${result.apps} apps, ${result.flows} flows, ${result.bots} bots`);
  return result;
}
