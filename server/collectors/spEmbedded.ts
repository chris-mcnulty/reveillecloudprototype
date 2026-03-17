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

  await discoverContainersViaSiteEnumeration(graphClient, tenantId, tenantName, result);

  await collectSpeAuditEvents(tenant.azureTenantId, tenantId, tenantName, result);

  await discoverContainersFromAccessEvents(tenantId, tenantName, result);

  await enrichContainersFromGraph(graphClient, tenantId, tenantName);

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
    const body = err.body ? JSON.stringify(err.body).substring(0, 300) : "";
    if (code === "accessDenied") {
      console.log(`[SPE] Graph containerTypes accessDenied for ${tenantName}: ${msg.substring(0, 200)}`);

      try {
        const token = await graphClient.api("/me").version("v1.0")
          .header("Authorization", "").get().catch(() => null);
        // Decode token to check roles
        const { getClientCredentialsToken } = await import("./azureAuth");
        const tenantRecord = await storage.getTenants();
        const t = tenantRecord.find((t: any) => t.name === tenantName);
        if (t?.azureTenantId) {
          const rawToken = await getClientCredentialsToken(t.azureTenantId);
          const parts = rawToken.split(".");
          if (parts.length >= 2) {
            const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
            const roles = payload.roles || [];
            console.log(`[SPE] Token roles for ${tenantName}: ${roles.join(", ")}`);
            const hasFSC = roles.some((r: string) => r.includes("FileStorageContainer"));
            console.log(`[SPE] FileStorageContainer.Selected in token: ${hasFSC}`);
          }
        }
      } catch { }

      console.log(`[SPE] Will discover containers from 7-day audit log history instead`);
    } else {
      console.warn(`[SPE] Graph containerTypes failed for ${tenantName}: ${code} - ${msg} ${body}`);
    }
  }
}

function graphSiteIdToCspGuid(graphSiteId: string): string | null {
  try {
    const b64 = graphSiteId.replace("b!", "");
    const b64std = b64.replace(/-/g, "+").replace(/_/g, "/");
    const buf = Buffer.from(b64std, "base64");
    if (buf.length < 16) return null;
    const d1 = buf.readUInt32LE(0).toString(16).padStart(8, "0");
    const d2 = buf.readUInt16LE(4).toString(16).padStart(4, "0");
    const d3 = buf.readUInt16LE(6).toString(16).padStart(4, "0");
    const d4 = buf.subarray(8, 10).toString("hex");
    const d5 = buf.subarray(10, 16).toString("hex");
    return `${d1}-${d2}-${d3}-${d4}-${d5}`;
  } catch {
    return null;
  }
}

async function discoverContainersViaSiteEnumeration(
  graphClient: any,
  tenantId: string,
  tenantName: string,
  result: SpeCollectionResult
): Promise<void> {
  try {
    console.log(`[SPE] Attempting site enumeration for contentstorage sites in ${tenantName}...`);

    const siteMap = new Map<string, any>();

    // Strategy 1: GET /sites/getAllSites (beta) with $filter on webUrl containing contentstorage
    try {
      let resp = await graphClient.api("/sites/getAllSites")
        .version("beta")
        .filter("webUrl ne null")
        .select("id,webUrl,displayName,createdDateTime,description")
        .top(999)
        .get();
      let pages = 0;
      let totalScanned = 0;
      while (resp) {
        const sites = resp?.value || [];
        totalScanned += sites.length;
        for (const s of sites) {
          if (s.webUrl?.includes("/contentstorage/")) {
            siteMap.set(s.id, s);
          }
        }
        pages++;
        if (resp["@odata.nextLink"] && pages < 200) {
          resp = await graphClient.api(resp["@odata.nextLink"]).get();
        } else {
          break;
        }
      }
      console.log(`[SPE] getAllSites found ${siteMap.size} contentstorage sites (scanned ${totalScanned} sites across ${pages} pages) for ${tenantName}`);
    } catch (err: any) {
      const code = err.code || err.statusCode || "?";
      console.log(`[SPE] getAllSites: ${code} - ${(err.message || "").substring(0, 150)}`);
    }

    // Strategy 2: search-based discovery (always run as complement)
    const searchTerms = ["contentstorage", "CSP_"];
    for (const term of searchTerms) {
      try {
        let searchResp = await graphClient.api("/sites")
          .query({ search: term })
          .select("id,webUrl,displayName,createdDateTime,description")
          .top(999)
          .get();
        let searchPages = 0;
        let termFound = 0;
        while (searchResp) {
          const searchSites = searchResp?.value || [];
          for (const s of searchSites) {
            if (s.webUrl?.includes("/contentstorage/") && !siteMap.has(s.id)) {
              siteMap.set(s.id, s);
              termFound++;
            }
          }
          searchPages++;
          if (searchResp["@odata.nextLink"] && searchPages < 10) {
            searchResp = await graphClient.api(searchResp["@odata.nextLink"]).get();
          } else {
            break;
          }
        }
        if (termFound > 0) {
          console.log(`[SPE] search "${term}" found ${termFound} new contentstorage sites (total now ${siteMap.size}) for ${tenantName}`);
        }
      } catch (err: any) {
        const code = err.code || err.statusCode || "?";
        console.log(`[SPE] sites?search=${term}: ${code} - ${(err.message || "").substring(0, 150)}`);
      }
    }
    console.log(`[SPE] Site search total: ${siteMap.size} contentstorage sites for ${tenantName}`);

    if (siteMap.size === 0) {
      console.log(`[SPE] No contentstorage sites found via site enumeration for ${tenantName}`);
      return;
    }

    let discovered = 0;
    for (const [, site] of siteMap) {
      try {
        const webUrl = site.webUrl || "";
        const cspMatch = webUrl.match(/(CSP_[0-9a-f-]+)/i);
        let containerId: string | null = cspMatch ? cspMatch[1] : null;

        if (!containerId && site.id?.startsWith("b!")) {
          const guid = graphSiteIdToCspGuid(site.id);
          if (guid) containerId = `CSP_${guid}`;
        }

        if (!containerId) {
          const urlParts = webUrl.split("/contentstorage/");
          if (urlParts.length > 1) {
            const segment = urlParts[1].replace(/\/$/, "");
            if (segment.startsWith("CSP_")) containerId = segment;
            else containerId = `CSP_${segment}`;
          }
        }

        if (!containerId) continue;

        const displayName = site.displayName || containerId;

        await storage.upsertSpeContainer({
          tenantId,
          containerId,
          containerType: "site-enumeration",
          displayName,
          description: site.description || null,
          graphSiteId: site.id || null,
          ownerAppId: null,
          ownerId: null,
          ownerEmail: null,
          siteUrl: webUrl || null,
          storageBytes: null,
          itemCount: null,
          sensitivityLabel: null,
          status: "active",
          createdAt: site.createdDateTime ? new Date(site.createdDateTime) : null,
          collectedAt: new Date(),
        });
        discovered++;
      } catch (err: any) {
        console.log(`[SPE] Site enum container error: ${(err.message || "").substring(0, 100)}`);
      }
    }

    if (discovered > 0) {
      result.containersCollected += discovered;
      console.log(`[SPE] Site enumeration discovered ${discovered} containers for ${tenantName}`);
    }
  } catch (err: any) {
    console.warn(`[SPE] Site enumeration failed for ${tenantName}: ${err.message}`);
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

  const speEvents: Array<{ event: any; containerId: string; containerUrl: string; operation: string; userId: string; eventTime: Date }> = [];

  try {
    const BATCH_SIZE = 10;
    for (let i = 0; i < allBlobs.length; i += BATCH_SIZE) {
      const batch = allBlobs.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(async (blob: any) => {
          const blobResponse = await fetch(blob.contentUri, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!blobResponse.ok) return [];
          const events = await blobResponse.json();
          return Array.isArray(events) ? events : [];
        })
      );

      for (const batchResult of batchResults) {
        if (batchResult.status !== "fulfilled") continue;
        for (const event of batchResult.value) {
          const siteUrl = event.SiteUrl || event.siteUrl || "";
          if (!isContentStorageUrl(siteUrl)) continue;

          const operation = event.Operation || event.operation || "Unknown";
          const containerId = extractContainerId(siteUrl);
          if (!containerId) continue;

          const containerUrl = siteUrl.split("/contentstorage/")[0] + "/contentstorage/" + containerId + "/";
          const userId = event.UserId || event.userId || "";
          const eventTime = event.CreationTime ? new Date(event.CreationTime) : new Date();

          speEvents.push({ event, containerId, containerUrl, operation, userId, eventTime });

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
        }
      }
    }

    console.log(`[SPE] Fetched ${speEvents.length} contentstorage events from ${allBlobs.length} blobs for ${tenantName}`);

    for (const { event, containerId, containerUrl, operation, userId, eventTime } of speEvents) {
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

async function enrichContainersFromGraph(
  graphClient: any,
  tenantId: string,
  tenantName: string
): Promise<void> {
  try {
    const containers = await storage.getSpeContainers(tenantId);
    if (!containers || containers.length === 0) return;

    const accessEvents = await storage.getSpeAccessEvents(tenantId, { limit: 5000 });

    const containerStats = new Map<string, {
      uniqueFiles: Set<string>;
      uniqueUsers: Set<string>;
      totalSizeBytes: number;
      fileTypes: Map<string, number>;
      latestActivity: Date | null;
      ownerApp: string | null;
    }>();

    for (const event of accessEvents) {
      let stats = containerStats.get(event.containerId);
      if (!stats) {
        stats = {
          uniqueFiles: new Set(),
          uniqueUsers: new Set(),
          totalSizeBytes: 0,
          fileTypes: new Map(),
          latestActivity: null,
          ownerApp: null,
        };
        containerStats.set(event.containerId, stats);
      }

      if (event.resourceName) {
        const fileKey = event.resourcePath ? `${event.resourcePath}/${event.resourceName}` : event.resourceName;
        stats.uniqueFiles.add(fileKey);
      }
      if (event.userEmail) stats.uniqueUsers.add(event.userEmail);
      if (event.sizeBytes) stats.totalSizeBytes += event.sizeBytes;
      if (event.appId && !stats.ownerApp) stats.ownerApp = event.appId;

      if (event.resourceName) {
        const ext = event.resourceName.split(".").pop()?.toLowerCase() || "other";
        stats.fileTypes.set(ext, (stats.fileTypes.get(ext) || 0) + 1);
      }

      if (event.timestamp && (!stats.latestActivity || event.timestamp > stats.latestActivity)) {
        stats.latestActivity = event.timestamp;
      }
    }

    console.log(`[SPE] Enriching ${containers.length} containers from ${accessEvents.length} audit events for ${tenantName}...`);

    let enriched = 0;
    for (const container of containers) {
      const cspId = container.containerId;
      const stats = containerStats.get(cspId);

      const itemCount = stats ? stats.uniqueFiles.size : null;
      const storageBytes = stats && stats.totalSizeBytes > 0 ? stats.totalSizeBytes : null;
      const ownerApp = stats?.ownerApp || container.ownerAppId;

      const topTypes = stats ? Array.from(stats.fileTypes.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([ext, count]) => `${ext}:${count}`)
        .join(", ") : "";

      const userCount = stats ? stats.uniqueUsers.size : 0;
      const description = stats
        ? `${stats.uniqueFiles.size} unique files (${topTypes}), ${userCount} active user${userCount !== 1 ? "s" : ""}`
        : container.description;

      const needsUpdate = itemCount !== container.itemCount ||
        storageBytes !== container.storageBytes ||
        description !== container.description;

      if (needsUpdate && stats) {
        await storage.upsertSpeContainer({
          tenantId,
          containerId: cspId,
          containerType: container.containerType || "audit-discovery",
          displayName: container.displayName,
          description,
          ownerAppId: ownerApp,
          ownerId: container.ownerId,
          ownerEmail: stats.uniqueUsers.size > 0 ? Array.from(stats.uniqueUsers)[0] : container.ownerEmail,
          siteUrl: container.siteUrl,
          storageBytes: storageBytes ?? container.storageBytes,
          itemCount: itemCount ?? container.itemCount,
          sensitivityLabel: container.sensitivityLabel,
          status: container.status || "active",
          createdAt: container.createdAt,
          collectedAt: new Date(),
        });
        enriched++;
        console.log(`[SPE] Enriched ${cspId}: ${itemCount} files, ${userCount} users, ${topTypes}`);
      }
    }

    let tenantDomain: string | null = null;
    try {
      const orgResp = await graphClient.api("/organization").select("verifiedDomains").get();
      const org = orgResp?.value?.[0];
      if (org?.verifiedDomains) {
        for (const d of org.verifiedDomains) {
          if (d.name?.endsWith(".onmicrosoft.com") && !d.name?.includes(".mail.")) {
            tenantDomain = d.name.replace(".onmicrosoft.com", "");
            break;
          }
        }
      }
    } catch { }

    if (tenantDomain) {
      const hostname = `${tenantDomain}.sharepoint.com`;
      const needsGraphEnrichment = containers.filter(c =>
        !c.siteUrl && !c.graphSiteId && c.displayName === c.containerId
      );
      if (needsGraphEnrichment.length > 0) {
        console.log(`[SPE] Attempting Graph site enrichment for ${needsGraphEnrichment.length}/${containers.length} containers needing names via ${hostname}...`);
      }
      for (const container of needsGraphEnrichment) {
        const cspId = container.containerId;
        try {
          const siteResp = await graphClient
            .api(`/sites/${hostname}:/contentstorage/${cspId}`)
            .select("id,webUrl,displayName,createdDateTime,description")
            .get();

          if (siteResp?.displayName && siteResp.displayName !== cspId) {
            const siteId = siteResp.id;
            let driveItemCount: number | null = null;
            let driveStorage: number | null = null;

            try {
              const driveResp = await graphClient.api(`/sites/${siteId}/drive`).select("quota").get();
              if (driveResp?.quota) {
                driveStorage = driveResp.quota.used ?? null;
                driveItemCount = driveResp.quota.fileCount ?? null;
              }
            } catch { }

            if (!driveItemCount) {
              try {
                const rootResp = await graphClient.api(`/sites/${siteId}/drive/root`).select("id,childCount").get();
                driveItemCount = rootResp?.childCount ?? null;
              } catch { }
            }

            await storage.upsertSpeContainer({
              tenantId,
              containerId: cspId,
              containerType: container.containerType || "enriched",
              displayName: siteResp.displayName,
              description: siteResp.description || container.description,
              ownerAppId: container.ownerAppId,
              ownerId: container.ownerId,
              ownerEmail: container.ownerEmail,
              siteUrl: siteResp.webUrl || container.siteUrl,
              storageBytes: driveStorage ?? container.storageBytes,
              itemCount: driveItemCount ?? container.itemCount,
              sensitivityLabel: container.sensitivityLabel,
              status: container.status || "active",
              createdAt: siteResp.createdDateTime ? new Date(siteResp.createdDateTime) : container.createdAt,
              collectedAt: new Date(),
            });
            enriched++;
            console.log(`[SPE] Graph enriched ${cspId}: "${siteResp.displayName}" items=${driveItemCount ?? "?"} storage=${driveStorage ?? "?"}`);
          }
        } catch (siteErr: any) {
          const siteCode = siteErr.code || siteErr.statusCode || "?";
          console.log(`[SPE] Graph site query ${cspId}: ${siteCode} - ${(siteErr.message || "").substring(0, 120)}`);
        }
      }
    }

    console.log(`[SPE] Enriched ${enriched}/${containers.length} containers for ${tenantName}`);
  } catch (err: any) {
    console.warn(`[SPE] Container enrichment failed for ${tenantName}: ${err.message}`);
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
