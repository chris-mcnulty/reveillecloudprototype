import { getAzureGraphClient, isAzureAppConfigured, getManagementApiToken } from "../azureAuth";
import { storage } from "../storage";

interface SpeCollectionResult {
  containersCollected: number;
  accessEventsCollected: number;
  securityEventsCollected: number;
  contentTypeStatsCollected: number;
  errors: string[];
}

const SPE_FILE_OPERATIONS = [
  "FileAccessed", "FileModified", "FileModifiedExtended", "FileDeleted",
  "FileUploaded", "FileDownloaded", "FileMoved", "FileRenamed",
  "FileCheckedIn", "FileCheckedOut", "FilePreviewed",
  "FolderCreated", "FolderDeleted", "FolderModified",
  "ListItemCreated", "ListItemUpdated", "ListItemDeleted",
];

const SPE_SECURITY_OPERATIONS = [
  "SharingSet", "SharingRevoked", "SharingInvitationCreated",
  "AnonymousLinkCreated", "CompanyLinkCreated", "SharingPolicyChanged",
  "PermissionLevelAdded", "PermissionLevelRemoved", "PermissionLevelsModified",
  "SiteCollectionAdminAdded", "GroupAdded", "GroupRemoved", "GroupUpdated",
];

function extractContainerId(siteUrl: string): string | null {
  const match = siteUrl.match(/(CSP_[0-9a-f-]+)/i);
  return match ? match[1] : null;
}

function isContentStorageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.includes("/contentstorage/") || url.includes("CSP_");
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

  let graphClient: any;

  try {
    graphClient = await getAzureGraphClient(tenant.azureTenantId);
  } catch (err: any) {
    result.errors.push(`Graph client: ${err.message}`);
    return result;
  }

  await collectContainersViaGraph(graphClient, tenantId, tenant.name || tenantId, result);

  await discoverContainersViaSites(graphClient, tenantId, tenant.name || tenantId, result);

  await collectSpeAuditEvents(tenant.azureTenantId, tenantId, tenant.name || tenantId, result);

  await discoverContainersFromAccessEvents(tenantId, tenant.name || tenantId, result);

  return result;
}

async function collectContainersViaGraph(
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
        .get(),
    },
    {
      name: "v1.0 /storage/fileStorage/containers",
      fn: () => graphClient.api("/storage/fileStorage/containers")
        .version("v1.0")
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
        console.log(`[SPE] Graph container listing unavailable for ${tenantName} — will discover containers from audit events`);
      }
    }
  }
}

async function discoverContainersViaSites(
  graphClient: any,
  tenantId: string,
  tenantName: string,
  result: SpeCollectionResult
): Promise<void> {
  try {
    console.log(`[SPE] Searching for contentstorage sites for ${tenantName}...`);

    let resp = await graphClient.api("/sites/getAllSites")
      .version("beta")
      .select("id,webUrl,displayName,createdDateTime,lastModifiedDateTime")
      .filter("webUrl ne null")
      .top(999)
      .get();

    let allSites: any[] = resp?.value || [];

    while (resp["@odata.nextLink"] && allSites.length < 5000) {
      resp = await graphClient.api(resp["@odata.nextLink"]).get();
      allSites = allSites.concat(resp?.value || []);
    }

    const cspSites = allSites.filter((s: any) =>
      s.webUrl && (s.webUrl.includes("/contentstorage/") || s.webUrl.includes("CSP_"))
    );

    console.log(`[SPE] Found ${cspSites.length} contentstorage sites out of ${allSites.length} total for ${tenantName}`);

    for (const site of cspSites) {
      const containerId = extractContainerId(site.webUrl);
      if (!containerId) continue;

      try {
        await storage.upsertSpeContainer({
          tenantId,
          containerId,
          containerType: "site-discovery",
          displayName: site.displayName || containerId,
          description: site.description || `Discovered via sites enumeration`,
          ownerAppId: null,
          ownerId: null,
          ownerEmail: null,
          siteUrl: site.webUrl,
          storageBytes: null,
          itemCount: null,
          sensitivityLabel: null,
          status: "active",
          createdAt: site.createdDateTime ? new Date(site.createdDateTime) : null,
          collectedAt: new Date(),
        });
        result.containersCollected++;
      } catch (err: any) {
        result.errors.push(`Site container ${containerId}: ${err.message}`);
      }
    }
  } catch (err: any) {
    console.warn(`[SPE] Sites discovery failed for ${tenantName}: ${err.message}`);
  }
}

async function collectSpeAuditEvents(
  azureTenantId: string,
  tenantId: string,
  tenantName: string,
  result: SpeCollectionResult
): Promise<void> {
  let token: string;
  try {
    token = await getManagementApiToken(azureTenantId);
  } catch (err: any) {
    console.warn(`[SPE] Management API token failed for ${tenantName}: ${err.message}`);
    return;
  }

  const baseUrl = `https://manage.office.com/api/v1.0/${azureTenantId}/activity/feed`;
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);
  const startStr = startTime.toISOString().replace(/\.\d+Z$/, "");
  const endStr = endTime.toISOString().replace(/\.\d+Z$/, "");

  try {
    const contentUrl = `${baseUrl}/subscriptions/content?contentType=Audit.SharePoint&startTime=${startStr}&endTime=${endStr}`;
    const contentResponse = await fetch(contentUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!contentResponse.ok) {
      console.warn(`[SPE] Audit.SharePoint content listing failed for ${tenantName}: ${contentResponse.status}`);
      return;
    }

    const contentBlobs = await contentResponse.json();
    if (!Array.isArray(contentBlobs) || contentBlobs.length === 0) {
      console.log(`[SPE] No SharePoint audit blobs for ${tenantName}`);
      return;
    }

    console.log(`[SPE] Processing ${contentBlobs.length} audit blobs for SPE events in ${tenantName}...`);

    for (const blob of contentBlobs.slice(0, 20)) {
      try {
        const blobResponse = await fetch(blob.contentUri, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!blobResponse.ok) continue;

        const events = await blobResponse.json();
        if (!Array.isArray(events)) continue;

        for (const event of events) {
          const siteUrl = event.SiteUrl || event.siteUrl || "";
          if (!isContentStorageUrl(siteUrl)) continue;

          const operation = event.Operation || event.operation || "Unknown";
          const containerId = extractContainerId(siteUrl);
          if (!containerId) continue;

          const containerUrl = siteUrl.split("/contentstorage/")[0] + "/contentstorage/" + containerId + "/";

          if (SPE_FILE_OPERATIONS.includes(operation)) {
            try {
              await storage.createSpeAccessEvent({
                tenantId,
                containerId,
                containerName: containerUrl,
                userId: event.UserId || event.userId || null,
                userEmail: event.UserId || event.userId || null,
                appId: event.AppId || null,
                operation,
                resourceType: event.ItemType || null,
                resourceId: event.ListItemUniqueId || null,
                resourceName: event.SourceFileName || null,
                resourcePath: event.SourceRelativeUrl || null,
                contentType: event.ItemType || null,
                sensitivityLabel: null,
                sizeBytes: event.FileSizeBytes || null,
                clientIp: event.ClientIP || null,
                userAgent: event.UserAgent || null,
                durationMs: null,
                statusCode: null,
                success: true,
                timestamp: event.CreationTime ? new Date(event.CreationTime) : new Date(),
                details: {
                  eventSource: event.EventSource || null,
                  correlationId: event.CorrelationId || null,
                  objectId: event.ObjectId || null,
                },
              });
              result.accessEventsCollected++;
            } catch (err: any) {
              if (!err.message?.includes("duplicate")) {
                result.errors.push(`SPE access event: ${err.message}`);
              }
            }
          } else if (SPE_SECURITY_OPERATIONS.includes(operation)) {
            const severity = ["AnonymousLinkCreated", "SharingPolicyChanged", "SiteCollectionAdminAdded"].includes(operation)
              ? "high"
              : ["SharingSet", "PermissionLevelAdded", "PermissionLevelsModified"].includes(operation)
                ? "medium"
                : "low";

            try {
              await storage.createSpeSecurityEvent({
                tenantId,
                containerId,
                containerName: containerUrl,
                userId: event.UserId || event.userId || null,
                userEmail: event.UserId || event.userId || null,
                eventType: operation,
                severity,
                description: `${operation} on container ${containerId} by ${event.UserId || "unknown"}`,
                resourceId: event.ObjectId || null,
                resourceName: event.SourceFileName || null,
                clientIp: event.ClientIP || null,
                details: {
                  eventSource: event.EventSource || null,
                  correlationId: event.CorrelationId || null,
                  objectId: event.ObjectId || null,
                  targetUsers: event.TargetUserOrGroupName || null,
                },
                timestamp: event.CreationTime ? new Date(event.CreationTime) : new Date(),
              });
              result.securityEventsCollected++;
            } catch (err: any) {
              if (!err.message?.includes("duplicate")) {
                result.errors.push(`SPE security event: ${err.message}`);
              }
            }
          }
        }
      } catch (blobErr: any) {
        console.warn(`[SPE] Failed to process audit blob: ${blobErr.message}`);
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`[SPE] Collected ${result.accessEventsCollected} access + ${result.securityEventsCollected} security events for ${tenantName}`);
  } catch (err: any) {
    console.warn(`[SPE] Audit event collection failed for ${tenantName}: ${err.message}`);
  }
}

async function discoverContainersFromAccessEvents(
  tenantId: string,
  tenantName: string,
  result: SpeCollectionResult
): Promise<void> {
  try {
    const recentEvents = await storage.getSpeAccessEvents(tenantId, { limit: 500 });

    const containerMap = new Map<string, { containerId: string; containerName: string; eventCount: number; latestEvent: Date }>();

    for (const event of recentEvents) {
      const existing = containerMap.get(event.containerId);
      if (!existing) {
        containerMap.set(event.containerId, {
          containerId: event.containerId,
          containerName: event.containerName || event.containerId,
          eventCount: 1,
          latestEvent: event.timestamp,
        });
      } else {
        existing.eventCount++;
        if (event.timestamp > existing.latestEvent) {
          existing.latestEvent = event.timestamp;
        }
      }
    }

    if (containerMap.size === 0) {
      console.log(`[SPE] No containers to discover from access events for ${tenantName}`);
      return;
    }

    console.log(`[SPE] Discovering ${containerMap.size} containers from access events for ${tenantName}...`);

    for (const [, info] of containerMap) {
      try {
        await storage.upsertSpeContainer({
          tenantId,
          containerId: info.containerId,
          containerType: "discovered",
          displayName: info.containerName,
          description: `Auto-discovered from ${info.eventCount} audit event(s)`,
          ownerAppId: null,
          ownerId: null,
          ownerEmail: null,
          siteUrl: info.containerName.startsWith("http") ? info.containerName : null,
          storageBytes: null,
          itemCount: null,
          sensitivityLabel: null,
          status: "active",
          createdAt: null,
          collectedAt: new Date(),
        });
        result.containersCollected++;
      } catch (err: any) {
        result.errors.push(`Discover container ${info.containerId}: ${err.message}`);
      }
    }

    console.log(`[SPE] Discovered ${result.containersCollected} containers for ${tenantName}`);
  } catch (err: any) {
    console.warn(`[SPE] Container discovery failed for ${tenantName}: ${err.message}`);
  }
}
