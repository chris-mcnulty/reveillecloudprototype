import { getUncachableSharePointClient } from "../sharepoint";
import { getAzureGraphClient, isAzureAppConfigured, getManagementApiToken } from "../azureAuth";
import { storage } from "../storage";

interface AuditCollectionResult {
  entriesCollected: number;
  operationBreakdown: Record<string, number>;
  sources: string[];
  error?: string;
}

const SHAREPOINT_AUDIT_OPERATIONS = [
  "FileAccessed", "FileModified", "FileDeleted", "FileUploaded", "FileDownloaded",
  "FileMoved", "FileRenamed", "FileCheckedIn", "FileCheckedOut",
  "FolderCreated", "FolderDeleted", "FolderModified",
  "SharingSet", "SharingRevoked", "SharingInvitationCreated", "AnonymousLinkCreated",
  "CompanyLinkCreated", "SharingPolicyChanged",
  "PermissionLevelAdded", "PermissionLevelRemoved", "PermissionLevelsModified",
  "SiteCollectionCreated", "SiteDeleted", "SiteCollectionAdminAdded",
  "GroupAdded", "GroupRemoved", "GroupUpdated",
  "SearchQueryPerformed",
  "ListCreated", "ListUpdated", "ListDeleted", "ListItemCreated", "ListItemUpdated", "ListItemDeleted",
  "PageViewed", "PageViewedExtended",
  "RecycleBinItemRestored", "RecycleBinItemDeleted",
];

const MANAGEMENT_API_CONTENT_TYPES = [
  "Audit.SharePoint",
  "Audit.General",
];

async function ensureSubscription(
  baseUrl: string,
  token: string,
  contentType: string,
  existingSubscriptions: any[]
): Promise<boolean> {
  const existing = existingSubscriptions.find((s: any) => s.contentType === contentType);
  if (existing) return true;

  console.log(`[Audit Logs] No ${contentType} subscription found, attempting to start one...`);
  try {
    const startResponse = await fetch(
      `${baseUrl}/subscriptions/start?contentType=${contentType}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      }
    );

    if (!startResponse.ok) {
      const errText = await startResponse.text().catch(() => "");
      console.warn(`[Audit Logs] Failed to start ${contentType} subscription: ${startResponse.status} ${errText}`);
      return false;
    }
    console.log(`[Audit Logs] Started ${contentType} subscription — events will be available on next collection cycle`);
    return false;
  } catch (err: any) {
    console.warn(`[Audit Logs] Error starting ${contentType} subscription: ${err.message}`);
    return false;
  }
}

async function collectContentType(
  baseUrl: string,
  token: string,
  contentType: string,
  tenantId: string,
  startTime: string,
  endTime: string,
  result: AuditCollectionResult
): Promise<number> {
  const contentUrl = `${baseUrl}/subscriptions/content?contentType=${contentType}&startTime=${startTime}&endTime=${endTime}`;
  const contentResponse = await fetch(contentUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!contentResponse.ok) {
    console.warn(`[Audit Logs] ${contentType} content listing failed: ${contentResponse.status}`);
    return 0;
  }

  const contentBlobs = await contentResponse.json();
  if (!Array.isArray(contentBlobs) || contentBlobs.length === 0) {
    console.log(`[Audit Logs] ${contentType}: no content blobs in this time window`);
    return 0;
  }

  let totalEntries = 0;
  const maxBlobs = 10;

  for (const blob of contentBlobs.slice(0, maxBlobs)) {
    try {
      const blobResponse = await fetch(blob.contentUri, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!blobResponse.ok) continue;

      const events = await blobResponse.json();
      if (!Array.isArray(events)) continue;

      for (const event of events) {
        const operation = event.Operation || event.operation || "Unknown";
        const workload = event.Workload || contentType.replace("Audit.", "");

        await storage.createAuditLogEntry({
          tenantId,
          operation,
          userId: event.UserId || event.userId || null,
          userEmail: event.UserId || event.userId || null,
          objectId: event.ObjectId || event.objectId || null,
          itemType: event.ItemType || event.itemType || null,
          siteUrl: event.SiteUrl || event.siteUrl || null,
          timestamp: event.CreationTime ? new Date(event.CreationTime) : new Date(),
          clientIp: event.ClientIP || event.clientIp || null,
          details: {
            source: "managementActivityApi",
            contentType,
            workload,
            eventSource: event.EventSource || null,
            userAgent: event.UserAgent || null,
            correlationId: event.CorrelationId || null,
            listItemUniqueId: event.ListItemUniqueId || null,
            sourceFileName: event.SourceFileName || null,
            sourceRelativeUrl: event.SourceRelativeUrl || null,
            userType: event.UserType || null,
            eventData: event.EventData || null,
            teamName: event.TeamName || null,
            channelName: event.ChannelName || null,
            members: event.Members || null,
            communicationType: event.CommunicationType || null,
            appId: event.AppId || null,
          },
        });

        totalEntries++;
        const opKey = workload !== "SharePoint" ? `${workload}:${operation}` : operation;
        result.operationBreakdown[opKey] = (result.operationBreakdown[opKey] || 0) + 1;
      }
    } catch (blobErr: any) {
      console.warn(`[Audit Logs] Failed to process ${contentType} content blob: ${blobErr.message}`);
    }

    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return totalEntries;
}

async function collectViaManagementApi(
  azureTenantId: string,
  tenantId: string,
  result: AuditCollectionResult
): Promise<boolean> {
  try {
    const token = await getManagementApiToken(azureTenantId);
    const baseUrl = `https://manage.office.com/api/v1.0/${azureTenantId}/activity/feed`;

    const subsResponse = await fetch(`${baseUrl}/subscriptions/list`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!subsResponse.ok) {
      if (subsResponse.status === 403) {
        console.warn("[Audit Logs] Management Activity API not authorized — needs ActivityFeed.Read permission on Office 365 Management APIs");
        return false;
      }
      console.warn(`[Audit Logs] Management API subscriptions list failed: ${subsResponse.status}`);
      return false;
    }

    const subscriptions = await subsResponse.json();
    const existingSubs = Array.isArray(subscriptions) ? subscriptions : [];

    let anyNewSubscriptions = false;
    for (const contentType of MANAGEMENT_API_CONTENT_TYPES) {
      const ready = await ensureSubscription(baseUrl, token, contentType, existingSubs);
      if (!ready) anyNewSubscriptions = true;
    }

    if (existingSubs.length === 0 && anyNewSubscriptions) {
      result.sources.push("managementApi:subscriptionsStarted");
      return true;
    }

    const now = new Date();
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const startTime = since.toISOString().replace(/\.\d{3}Z$/, "");
    const endTime = now.toISOString().replace(/\.\d{3}Z$/, "");

    let grandTotal = 0;
    const typeSummaries: string[] = [];

    for (const contentType of MANAGEMENT_API_CONTENT_TYPES) {
      const hasSub = existingSubs.some((s: any) => s.contentType === contentType);
      if (!hasSub) continue;

      const count = await collectContentType(baseUrl, token, contentType, tenantId, startTime, endTime, result);
      grandTotal += count;
      if (count > 0) typeSummaries.push(`${contentType}:${count}`);
    }

    result.entriesCollected += grandTotal;
    const summary = typeSummaries.length > 0 ? typeSummaries.join(",") : "noContent";
    result.sources.push(`managementApi:${summary}`);
    console.log(`[Audit Logs] Management Activity API collected ${grandTotal} events across ${MANAGEMENT_API_CONTENT_TYPES.length} content types (${typeSummaries.join(", ") || "none available yet"})`);
    return true;
  } catch (err: any) {
    console.warn(`[Audit Logs] Management Activity API error: ${err.message}`);
    return false;
  }
}

async function collectViaGraphDirectoryAudits(
  client: any,
  tenantId: string,
  result: AuditCollectionResult
): Promise<boolean> {
  try {
    const now = new Date();
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const response = await client.api("/auditLogs/directoryAudits")
      .filter(`activityDateTime ge ${since.toISOString()}`)
      .top(100)
      .orderby("activityDateTime desc")
      .get();

    const auditEntries = response.value || [];
    if (auditEntries.length === 0) return false;

    for (const entry of auditEntries) {
      const operation = entry.activityDisplayName || entry.operationType || "Unknown";
      const initiatedBy = entry.initiatedBy?.user;

      await storage.createAuditLogEntry({
        tenantId,
        operation,
        userId: initiatedBy?.id || null,
        userEmail: initiatedBy?.userPrincipalName || null,
        objectId: entry.targetResources?.[0]?.id || null,
        itemType: entry.targetResources?.[0]?.type || null,
        siteUrl: null,
        timestamp: entry.activityDateTime ? new Date(entry.activityDateTime) : now,
        clientIp: entry.additionalDetails?.find((d: any) => d.key === "ipAddress")?.value || null,
        details: {
          source: "directoryAudits",
          category: entry.category,
          result: entry.result,
          resultReason: entry.resultReason,
          targetResources: entry.targetResources,
        },
      });
      result.entriesCollected++;
      result.operationBreakdown[operation] = (result.operationBreakdown[operation] || 0) + 1;
    }

    result.sources.push(`directoryAudits:${auditEntries.length}events`);
    return true;
  } catch (err: any) {
    if (err.statusCode === 403 || err.code === "Authorization_RequestDenied") {
      console.log("[Audit Logs] directoryAudits not available (requires AuditLog.Read.All)");
      return false;
    }
    console.warn("[Audit Logs] directoryAudits failed:", err.message);
    return false;
  }
}

async function collectViaGraphSignInLogs(
  client: any,
  tenantId: string,
  result: AuditCollectionResult
): Promise<boolean> {
  try {
    const now = new Date();
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const response = await client.api("/auditLogs/signIns")
      .filter(`createdDateTime ge ${since.toISOString()} and appDisplayName eq 'SharePoint Online'`)
      .top(50)
      .orderby("createdDateTime desc")
      .get();

    const signIns = response.value || [];
    if (signIns.length === 0) return false;

    for (const entry of signIns) {
      await storage.createAuditLogEntry({
        tenantId,
        operation: "UserSignIn",
        userId: entry.userId || null,
        userEmail: entry.userPrincipalName || null,
        objectId: entry.resourceId || null,
        itemType: "SignIn",
        siteUrl: null,
        timestamp: entry.createdDateTime ? new Date(entry.createdDateTime) : now,
        clientIp: entry.ipAddress || null,
        details: {
          source: "signInLogs",
          appDisplayName: entry.appDisplayName,
          clientAppUsed: entry.clientAppUsed,
          deviceDetail: entry.deviceDetail,
          location: entry.location,
          riskDetail: entry.riskDetail,
          riskLevelDuringSignIn: entry.riskLevelDuringSignIn,
          conditionalAccessStatus: entry.conditionalAccessStatus,
          status: entry.status,
          mfaDetail: entry.mfaDetail,
        },
      });
      result.entriesCollected++;
      result.operationBreakdown["UserSignIn"] = (result.operationBreakdown["UserSignIn"] || 0) + 1;
    }

    result.sources.push(`signInLogs:${signIns.length}events`);
    return true;
  } catch (err: any) {
    if (err.statusCode === 403 || err.code === "Authorization_RequestDenied") {
      console.log("[Audit Logs] signInLogs not available (requires AuditLog.Read.All)");
      return false;
    }
    console.warn("[Audit Logs] signInLogs failed:", err.message);
    return false;
  }
}

async function collectViaSiteFallback(
  client: any,
  tenantId: string,
  result: AuditCollectionResult
): Promise<boolean> {
  try {
    const now = new Date();
    const rootSite = await client.api("/sites/root").get();
    const siteId = rootSite.id;

    try {
      const analytics = await client.api(`/sites/${siteId}/analytics/lastSevenDays`).get();
      if (analytics) {
        await storage.createAuditLogEntry({
          tenantId,
          operation: "SiteAnalytics",
          userId: "system",
          userEmail: null,
          objectId: rootSite.webUrl,
          itemType: "Site",
          siteUrl: rootSite.webUrl,
          timestamp: now,
          clientIp: null,
          details: {
            source: "siteAnalytics",
            period: "lastSevenDays",
            access: analytics.access,
            pageViews: analytics.pageViews,
          },
        });
        result.entriesCollected++;
        result.operationBreakdown["SiteAnalytics"] = 1;
      }
    } catch (analyticsErr: any) {
      console.warn("[Audit Logs] Site analytics not available:", analyticsErr.message);
    }

    try {
      const activities = await client.api(`/sites/${siteId}/lists`)
        .select("id,displayName,lastModifiedDateTime,lastModifiedBy")
        .top(25)
        .orderby("lastModifiedDateTime desc")
        .get();

      if (activities.value) {
        for (const list of activities.value) {
          const modifiedBy = list.lastModifiedBy?.user;
          await storage.createAuditLogEntry({
            tenantId,
            operation: "ListModified",
            userId: modifiedBy?.id || null,
            userEmail: modifiedBy?.email || modifiedBy?.displayName || null,
            objectId: list.id,
            itemType: "List",
            siteUrl: rootSite.webUrl,
            timestamp: list.lastModifiedDateTime ? new Date(list.lastModifiedDateTime) : now,
            clientIp: null,
            details: {
              source: "graphListEnumeration",
              listName: list.displayName,
              lastModifiedDateTime: list.lastModifiedDateTime,
            },
          });
          result.entriesCollected++;
          result.operationBreakdown["ListModified"] = (result.operationBreakdown["ListModified"] || 0) + 1;
        }
      }
    } catch (listErr: any) {
      console.warn("[Audit Logs] List enumeration failed:", listErr.message);
    }

    try {
      const drives = await client.api(`/sites/${siteId}/drives`).get();
      if (drives.value) {
        for (const drive of drives.value.slice(0, 5)) {
          try {
            const recentItems = await client.api(`/drives/${drive.id}/recent`)
              .top(10)
              .get();

            if (recentItems.value) {
              for (const item of recentItems.value) {
                const lastMod = item.lastModifiedBy?.user;
                await storage.createAuditLogEntry({
                  tenantId,
                  operation: "FileModified",
                  userId: lastMod?.id || null,
                  userEmail: lastMod?.email || lastMod?.displayName || null,
                  objectId: item.webUrl || item.id,
                  itemType: item.folder ? "Folder" : "File",
                  siteUrl: rootSite.webUrl,
                  timestamp: item.lastModifiedDateTime ? new Date(item.lastModifiedDateTime) : now,
                  clientIp: null,
                  details: {
                    source: "graphDriveRecent",
                    fileName: item.name,
                    size: item.size,
                    mimeType: item.file?.mimeType,
                    driveName: drive.name,
                  },
                });
                result.entriesCollected++;
                result.operationBreakdown["FileModified"] = (result.operationBreakdown["FileModified"] || 0) + 1;
              }
            }
          } catch (recentErr: any) {
            console.warn(`[Audit Logs] Recent items failed for drive ${drive.name}:`, recentErr.message);
          }
        }
      }
    } catch (driveErr: any) {
      console.warn("[Audit Logs] Drive enumeration failed:", driveErr.message);
    }

    result.sources.push("siteFallback");
    return result.entriesCollected > 0;
  } catch (siteErr: any) {
    console.warn("[Audit Logs] Site fallback failed:", siteErr.message);
    return false;
  }
}

export async function collectAuditLogs(tenantId: string): Promise<AuditCollectionResult> {
  const result: AuditCollectionResult = {
    entriesCollected: 0,
    operationBreakdown: {},
    sources: [],
  };

  try {
    const tenant = await storage.getTenant(tenantId);
    const useAzure = isAzureAppConfigured() && tenant?.azureTenantId;

    let client;
    if (useAzure) {
      client = await getAzureGraphClient(tenant!.azureTenantId!);
    } else {
      client = await getUncachableSharePointClient();
    }

    if (useAzure && tenant?.azureTenantId) {
      await collectViaManagementApi(tenant.azureTenantId, tenantId, result);
    }

    await collectViaGraphDirectoryAudits(client, tenantId, result);

    if (useAzure) {
      await collectViaGraphSignInLogs(client, tenantId, result);
    }

    if (result.entriesCollected === 0) {
      await collectViaSiteFallback(client, tenantId, result);
    }

    if (result.sources.length === 0) {
      result.sources.push("none");
    }

    console.log(`[Audit Logs] Collected ${result.entriesCollected} entries from: ${result.sources.join(", ")}`);
    return result;
  } catch (err: any) {
    result.error = err.message || String(err);
    console.error("[Audit Logs] Collection failed:", err.message);
    return result;
  }
}
