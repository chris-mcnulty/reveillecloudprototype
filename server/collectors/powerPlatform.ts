import { getPowerPlatformToken, isAzureAppConfigured } from "../azureAuth";
import { storage } from "../storage";

interface PPCollectionResult {
  environments: number;
  apps: number;
  flows: number;
  bots: number;
  errors: string[];
}

async function bapFetch(token: string, path: string): Promise<any> {
  const url = `https://api.bap.microsoft.com${path}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Accept": "application/json",
    },
  });

  if (resp.status === 401 || resp.status === 403) {
    throw new Error(`Permission denied (${resp.status}) for ${path}`);
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`BAP API ${resp.status}: ${text.slice(0, 200)}`);
  }

  return resp.json();
}

async function flowFetch(token: string, path: string): Promise<any> {
  const url = `https://api.flow.microsoft.com${path}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Accept": "application/json",
    },
  });

  if (resp.status === 401 || resp.status === 403) {
    return null;
  }

  if (!resp.ok) {
    return null;
  }

  return resp.json();
}

async function collectEnvironments(
  tenantId: string,
  azureTenantId: string,
  token: string,
): Promise<{ count: number; envIds: string[] }> {
  try {
    const data = await bapFetch(
      token,
      "/providers/Microsoft.BusinessAppsPlatform/scopes/admin/environments?api-version=2016-11-01&$expand=permissions,properties.capacity,properties",
    );

    const envs = data.value || [];
    const envIds: string[] = [];

    for (const env of envs) {
      const envId = env.name || env.id;
      envIds.push(envId);

      const props = env.properties || {};
      await storage.upsertPowerPlatformEnvironment({
        tenantId,
        environmentId: envId,
        displayName: props.displayName || envId,
        environmentType: props.environmentSku || props.environmentType || "Unknown",
        region: props.azureRegion || props.location || null,
        state: props.states?.management?.id || env.properties?.provisioningState || "Ready",
        properties: {
          createdTime: props.createdTime,
          createdBy: props.createdBy?.displayName,
          linkedEnvironmentMetadata: props.linkedEnvironmentMetadata ? {
            instanceUrl: props.linkedEnvironmentMetadata.instanceUrl,
            type: props.linkedEnvironmentMetadata.type,
            version: props.linkedEnvironmentMetadata.version,
          } : null,
          capacity: props.capacity,
          databaseType: props.databaseType,
          isDefault: props.isDefault,
        },
      });
    }

    console.log(`[PowerPlatform] Found ${envs.length} environments for tenant`);
    return { count: envs.length, envIds };
  } catch (err: any) {
    console.warn(`[PowerPlatform] Environment collection failed: ${err.message}`);
    return { count: 0, envIds: [] };
  }
}

async function collectPowerApps(
  tenantId: string,
  azureTenantId: string,
  token: string,
  envId: string,
): Promise<number> {
  try {
    const data = await bapFetch(
      token,
      `/providers/Microsoft.BusinessAppsPlatform/scopes/admin/environments/${envId}/apps?api-version=2016-11-01`,
    );

    const apps = data.value || [];

    for (const app of apps) {
      const props = app.properties || {};
      await storage.upsertPowerPlatformResource({
        tenantId,
        environmentId: envId,
        resourceType: "app",
        resourceId: app.name || app.id,
        displayName: props.displayName || app.name || "Unknown App",
        owner: props.owner?.displayName || props.createdBy?.displayName || null,
        status: props.status || null,
        lastModifiedDate: props.lastModifiedTime || props.lastPublishedTime || null,
        lastRunDate: null,
        details: {
          appType: props.appType,
          appVersion: props.appVersion,
          createdTime: props.createdTime,
          lastPublishedTime: props.lastPublishedTime,
          sharedGroupsCount: props.sharedGroupsCount,
          sharedUsersCount: props.sharedUsersCount,
          connectionReferences: props.connectionReferences ? Object.keys(props.connectionReferences) : [],
          embeddedApp: props.embeddedApp,
        },
      });
    }

    return apps.length;
  } catch (err: any) {
    if (err.message?.includes("Permission denied")) {
      console.warn(`[PowerPlatform] No permission to list apps in ${envId}`);
    } else {
      console.warn(`[PowerPlatform] App collection failed for ${envId}: ${err.message}`);
    }
    return 0;
  }
}

async function collectFlows(
  tenantId: string,
  azureTenantId: string,
  token: string,
  envId: string,
): Promise<number> {
  try {
    const data = await bapFetch(
      token,
      `/providers/Microsoft.BusinessAppsPlatform/scopes/admin/environments/${envId}/flows?api-version=2016-11-01`,
    );

    const flows = data.value || [];

    for (const flow of flows) {
      const props = flow.properties || {};
      await storage.upsertPowerPlatformResource({
        tenantId,
        environmentId: envId,
        resourceType: "flow",
        resourceId: flow.name || flow.id,
        displayName: props.displayName || flow.name || "Unknown Flow",
        owner: props.creator?.displayName || props.createdBy?.displayName || null,
        status: props.state || null,
        lastModifiedDate: props.lastModifiedTime || null,
        lastRunDate: null,
        details: {
          flowSuspensionReason: props.flowSuspensionReason,
          flowSuspensionTime: props.flowSuspensionTime,
          createdTime: props.createdTime,
          triggerType: props.definitionSummary?.triggers?.[0]?.type,
          actionCount: props.definitionSummary?.actions?.length,
          connectionReferences: props.connectionReferences ? Object.keys(props.connectionReferences) : [],
          flowFailureAlertSubscribed: props.flowFailureAlertSubscribed,
          sharingType: props.sharingType,
        },
      });
    }

    return flows.length;
  } catch (err: any) {
    if (err.message?.includes("Permission denied")) {
      console.warn(`[PowerPlatform] No permission to list flows in ${envId}`);
    } else {
      console.warn(`[PowerPlatform] Flow collection failed for ${envId}: ${err.message}`);
    }
    return 0;
  }
}

async function collectCopilotBots(
  tenantId: string,
  azureTenantId: string,
  token: string,
  envId: string,
): Promise<number> {
  try {
    const data = await bapFetch(
      token,
      `/providers/Microsoft.BusinessAppsPlatform/scopes/admin/environments/${envId}/bots?api-version=2016-11-01`,
    );

    const bots = data.value || [];

    for (const bot of bots) {
      const props = bot.properties || {};
      await storage.upsertPowerPlatformResource({
        tenantId,
        environmentId: envId,
        resourceType: "bot",
        resourceId: bot.name || bot.id,
        displayName: props.displayName || bot.name || "Unknown Bot",
        owner: props.owner?.displayName || null,
        status: props.state || props.status || null,
        lastModifiedDate: props.lastModifiedTime || null,
        lastRunDate: null,
        details: {
          botType: props.botType,
          createdTime: props.createdTime,
          schemaName: props.schemaName,
          applicationManifestInformation: props.applicationManifestInformation,
        },
      });
    }

    return bots.length;
  } catch (err: any) {
    return 0;
  }
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
    token = await getPowerPlatformToken(tenant.azureTenantId);
  } catch (err: any) {
    result.errors.push(`Token acquisition failed: ${err.message}`);
    return result;
  }

  const { count: envCount, envIds } = await collectEnvironments(tenantId, tenant.azureTenantId, token);
  result.environments = envCount;

  for (const envId of envIds) {
    const appCount = await collectPowerApps(tenantId, tenant.azureTenantId, token, envId);
    result.apps += appCount;

    const flowCount = await collectFlows(tenantId, tenant.azureTenantId, token, envId);
    result.flows += flowCount;

    const botCount = await collectCopilotBots(tenantId, tenant.azureTenantId, token, envId);
    result.bots += botCount;

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`[PowerPlatform] Collection complete: ${result.environments} envs, ${result.apps} apps, ${result.flows} flows, ${result.bots} bots`);
  return result;
}
