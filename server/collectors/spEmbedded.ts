import { getAzureGraphClient, isAzureAppConfigured, getManagementApiToken, getClientCredentialsToken } from "../azureAuth";
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

  const tenantName = tenant.name || tenantId;

  let graphClient: any;
  try {
    graphClient = await getAzureGraphClient(tenant.azureTenantId);
  } catch (err: any) {
    result.errors.push(`Graph client: ${err.message}`);
    return result;
  }

  await collectContainersViaGraphApi(graphClient, tenantId, tenantName, result);

  await collectSpeAuditEvents(tenant.azureTenantId, tenantId, tenantName, result);

  await discoverContainersFromAccessEvents(tenantId, tenantName, result);

  return result;
}

async function collectContainersViaGraphApi(
  graphClient: any,
  tenantId: string,
  tenantName: string,
  result: SpeCollectionResult
): Promise<void> {
  try {
    console.log(`[SPE] Trying Graph containerTypes for ${tenantName}...`);
    const typeResp = await graphClient.api("/storage/fileStorage/containerTypes").version("beta").get();
    const types = typeResp?.value || [];
    console.log(`[SPE] Graph: ${types.length} container types for ${tenantName}`);

    for (const t of types) {
      if (!t.containerTypeId) continue;
      try {
        let resp = await graphClient.api("/storage/fileStorage/containers")
          .version("beta")
          .filter(`containerTypeId eq ${t.containerTypeId}`)
          .get();
        let all: any[] = resp?.value || [];
        while (resp["@odata.nextLink"]) {
          resp = await graphClient.api(resp["@odata.nextLink"]).get();
          all = all.concat(resp?.value || []);
        }
        console.log(`[SPE] Graph type ${t.displayName || t.containerTypeId}: ${all.length} containers`);

        for (const c of all) {
          try {
            const containerId = c.id || c.containerId;
            if (!containerId) continue;
            await storage.upsertSpeContainer({
              tenantId,
              containerId,
              containerType: t.displayName || t.containerTypeId || "graph-api",
              displayName: c.displayName || "Unnamed",
              description: c.description || null,
              ownerAppId: c.createdBy?.application?.id || null,
              ownerId: c.createdBy?.user?.id || null,
              ownerEmail: c.createdBy?.user?.userPrincipalName || null,
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
            result.errors.push(`Graph container ${c.id}: ${err.message}`);
          }
        }
      } catch (err: any) {
        console.warn(`[SPE] Graph container listing for type ${t.containerTypeId}: ${err.message}`);
      }
    }
  } catch (err: any) {
    const code = err.code || err.statusCode || "?";
    const msg = err.message || "";
    if (code === "accessDenied") {
      console.log(`[SPE] Graph container APIs require FileStorageContainer.Selected permission (not consented for ${tenantName})`);
      console.log(`[SPE] Will discover containers from 7-day audit log history instead`);
    } else {
      console.warn(`[SPE] Graph containerTypes failed for ${tenantName}: ${code} - ${msg}`);
    }
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
  const now = new Date();
  const DAYS_BACK = 7;

  const discoveredContainers = new Map<string, { url: string; operations: Set<string>; users: Set<string>; firstSeen: Date; lastSeen: Date; totalEvents: number }>();

  let allBlobs: any[] = [];
  for (let day = 0; day < DAYS_BACK; day++) {
    const dayEnd = new Date(now.getTime() - day * 24 * 60 * 60 * 1000);
    const dayStart = new Date(now.getTime() - (day + 1) * 24 * 60 * 60 * 1000);
    const startStr = dayStart.toISOString().replace(/\.\d+Z$/, "");
    const endStr = dayEnd.toISOString().replace(/\.\d+Z$/, "");

    try {
      const contentUrl = `${baseUrl}/subscriptions/content?contentType=Audit.SharePoint&startTime=${startStr}&endTime=${endStr}`;
      const contentResponse = await fetch(contentUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!contentResponse.ok) {
        if (contentResponse.status === 400) {
          console.log(`[SPE] Day ${day + 1}/${DAYS_BACK}: no content available for ${tenantName}`);
          continue;
        }
        console.warn(`[SPE] Day ${day + 1}/${DAYS_BACK}: content listing ${contentResponse.status} for ${tenantName}`);
        continue;
      }

      const blobs = await contentResponse.json();
      if (Array.isArray(blobs)) {
        allBlobs = allBlobs.concat(blobs);
      }
    } catch (err: any) {
      console.warn(`[SPE] Day ${day + 1}/${DAYS_BACK}: ${err.message}`);
    }
  }

  if (allBlobs.length === 0) {
    console.log(`[SPE] No SharePoint audit blobs in ${DAYS_BACK}-day window for ${tenantName}`);
    return;
  }

  console.log(`[SPE] Processing ${allBlobs.length} audit blobs (${DAYS_BACK}-day window) for SPE events in ${tenantName}...`);

  try {

    for (const blob of allBlobs) {
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
          const userId = event.UserId || event.userId || "";
          const eventTime = event.CreationTime ? new Date(event.CreationTime) : new Date();

          const existing = discoveredContainers.get(containerId);
          if (!existing) {
            discoveredContainers.set(containerId, {
              url: containerUrl,
              operations: new Set([operation]),
              users: new Set(userId ? [userId] : []),
              firstSeen: eventTime,
              lastSeen: eventTime,
              totalEvents: 1,
            });
          } else {
            existing.operations.add(operation);
            if (userId) existing.users.add(userId);
            if (eventTime < existing.firstSeen) existing.firstSeen = eventTime;
            if (eventTime > existing.lastSeen) existing.lastSeen = eventTime;
            existing.totalEvents++;
          }

          if (SPE_FILE_OPERATIONS.includes(operation)) {
            try {
              await storage.createSpeAccessEvent({
                tenantId,
                containerId,
                containerName: containerUrl,
                userId: userId || null,
                userEmail: userId || null,
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
                timestamp: eventTime,
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
                userId: userId || null,
                userEmail: userId || null,
                eventType: operation,
                severity,
                description: `${operation} on container ${containerId} by ${userId || "unknown"}`,
                resourceId: event.ObjectId || null,
                resourceName: event.SourceFileName || null,
                clientIp: event.ClientIP || null,
                details: {
                  eventSource: event.EventSource || null,
                  correlationId: event.CorrelationId || null,
                  objectId: event.ObjectId || null,
                  targetUsers: event.TargetUserOrGroupName || null,
                },
                timestamp: eventTime,
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

      await new Promise(resolve => setTimeout(resolve, 50));
    }

    console.log(`[SPE] 7-day audit scan complete for ${tenantName}: found ${discoveredContainers.size} unique containers, ${result.accessEventsCollected} access + ${result.securityEventsCollected} security events`);

    for (const [containerId, info] of discoveredContainers) {
      try {
        await storage.upsertSpeContainer({
          tenantId,
          containerId,
          containerType: "audit-discovery",
          displayName: info.url.startsWith("http") ? info.url : containerId,
          description: `Discovered from ${info.totalEvents} audit events (${info.operations.size} operations, ${info.users.size} users) over 7 days`,
          ownerAppId: null,
          ownerId: null,
          ownerEmail: info.users.size > 0 ? Array.from(info.users)[0] : null,
          siteUrl: info.url.startsWith("http") ? info.url : null,
          storageBytes: null,
          itemCount: null,
          sensitivityLabel: null,
          status: "active",
          createdAt: info.firstSeen,
          collectedAt: new Date(),
        });
        result.containersCollected++;
        console.log(`[SPE] Container ${containerId}: ${info.totalEvents} events, ${info.users.size} users, ops: ${Array.from(info.operations).join(",")}`);
      } catch (err: any) {
        result.errors.push(`Audit container ${containerId}: ${err.message}`);
      }
    }
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
    const recentEvents = await storage.getSpeAccessEvents(tenantId, { limit: 1000 });

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

    if (containerMap.size === 0) return;

    for (const [, info] of containerMap) {
      try {
        await storage.upsertSpeContainer({
          tenantId,
          containerId: info.containerId,
          containerType: "audit-discovery",
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
      } catch (err: any) {
        // ignore - container may already exist from audit scan
      }
    }
  } catch (err: any) {
    console.warn(`[SPE] Container discovery from events failed for ${tenantName}: ${err.message}`);
  }
}
