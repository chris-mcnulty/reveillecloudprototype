import { getAzureGraphClient, isAzureAppConfigured } from "../azureAuth";
import { storage } from "../storage";

interface SpeCollectionResult {
  containersCollected: number;
  accessEventsCollected: number;
  securityEventsCollected: number;
  contentTypeStatsCollected: number;
  errors: string[];
}

export async function collectSpeData(tenantId: string): Promise<SpeCollectionResult> {
  const result: SpeCollectionResult = {
    containersCollected: 0,
    accessEventsCollected: 0,
    securityEventsCollected: 0,
    contentTypeStatsCollected: 0,
    errors: [],
  };

  if (!isAzureAppConfigured()) {
    result.errors.push("Azure app not configured");
    return result;
  }

  const tenant = await storage.getTenant(tenantId);
  if (!tenant?.azureTenantId) {
    result.errors.push("Tenant has no Azure tenant ID");
    return result;
  }

  let graphClient: ReturnType<typeof import("@microsoft/microsoft-graph-client").Client.initWithMiddleware> extends Promise<infer T> ? T : any;

  try {
    graphClient = await getAzureGraphClient(tenant.azureTenantId);
  } catch (err: any) {
    result.errors.push(`Graph client: ${err.message}`);
    return result;
  }

  await collectContainers(graphClient, tenantId, tenant.name || tenantId, result);

  return result;
}

async function collectContainers(
  graphClient: any,
  tenantId: string,
  tenantName: string,
  result: SpeCollectionResult
): Promise<void> {
  const approaches = [
    {
      name: "beta /storage/fileStorage/containers",
      fn: () => graphClient.api("/storage/fileStorage/containers")
        .version("beta")
        .top(999)
        .get(),
    },
    {
      name: "v1.0 /storage/fileStorage/containers",
      fn: () => graphClient.api("/storage/fileStorage/containers")
        .version("v1.0")
        .top(999)
        .get(),
    },
  ];

  for (const approach of approaches) {
    try {
      console.log(`[SPE] Trying ${approach.name} for ${tenantName}...`);
      let resp = await approach.fn();
      let allContainers: any[] = resp?.value || [];

      while (resp["@odata.nextLink"]) {
        resp = await graphClient.api(resp["@odata.nextLink"]).get();
        allContainers = allContainers.concat(resp?.value || []);
      }

      console.log(`[SPE] ${approach.name}: found ${allContainers.length} containers for ${tenantName}`);

      for (const c of allContainers) {
        try {
          await storage.upsertSpeContainer({
            tenantId,
            containerId: c.id,
            containerType: c.containerTypeId?.toString() || c.containerTypeName || "unknown",
            displayName: c.displayName || "Unnamed",
            description: c.description || null,
            ownerAppId: c.createdBy?.application?.id || c.ownershipType || null,
            ownerId: c.createdBy?.user?.id || null,
            ownerEmail: c.createdBy?.user?.userPrincipalName || c.createdBy?.user?.email || null,
            siteUrl: c.webUrl || null,
            storageBytes: c.storageUsedInBytes ?? c.storage?.usedInBytes ?? null,
            itemCount: c.itemCount ?? null,
            sensitivityLabel: c.sensitivityLabel?.labelId || null,
            status: c.status || "active",
            createdAt: c.createdDateTime ? new Date(c.createdDateTime) : null,
            collectedAt: new Date(),
          });
          result.containersCollected++;
        } catch (err: any) {
          result.errors.push(`Container ${c.id}: ${err.message}`);
        }
      }

      return;
    } catch (err: any) {
      const code = err.code || err.statusCode || "unknown";
      const msg = err.message || "";
      console.warn(`[SPE] ${approach.name} failed for ${tenantName}: ${code} - ${msg}`);

      if (approach === approaches[approaches.length - 1]) {
        result.errors.push(`All container API approaches failed. Last error: ${code} - ${msg}`);
      }
    }
  }
}
