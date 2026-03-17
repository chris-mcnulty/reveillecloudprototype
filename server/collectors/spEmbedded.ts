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

  try {
    const graphClient = await getAzureGraphClient(tenant.azureTenantId);

    try {
      const containersResp = await graphClient.api("/storage/fileStorage/containers")
        .version("v1.0")
        .top(100)
        .get();

      const containers = containersResp?.value || [];
      console.log(`[SPE] Found ${containers.length} containers for tenant ${tenant.name}`);
      for (const c of containers) {
        try {
          await storage.upsertSpeContainer({
            tenantId,
            containerId: c.id,
            containerType: c.containerTypeId || "fileStorageContainer",
            displayName: c.displayName || "Unnamed",
            description: c.description || null,
            ownerAppId: c.createdBy?.application?.id || null,
            ownerId: c.createdBy?.user?.id || null,
            ownerEmail: c.createdBy?.user?.email || null,
            siteUrl: null,
            storageBytes: c.storageUsedInBytes || null,
            itemCount: null,
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
    } catch (err: any) {
      const graphBody = err.body ? JSON.stringify(err.body) : "";
      const code = err.code || err.statusCode || "unknown";
      const msg = err.message || "";
      console.error(`[SPE] Containers API error for ${tenant.name}: code=${code} message=${msg} body=${graphBody}`);
      result.errors.push(`Containers: ${code} - ${msg}${graphBody ? ` (${graphBody})` : ""}`);
    }
  } catch (err: any) {
    result.errors.push(`Graph client: ${err.message}`);
  }

  return result;
}
