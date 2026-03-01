import { getUncachableSharePointClient } from "../sharepoint";
import { getAzureGraphClient, isAzureAppConfigured } from "../azureAuth";
import { storage } from "../storage";

interface AuditCollectionResult {
  entriesCollected: number;
  operationBreakdown: Record<string, number>;
  error?: string;
}

export async function collectAuditLogs(tenantId: string): Promise<AuditCollectionResult> {
  const result: AuditCollectionResult = {
    entriesCollected: 0,
    operationBreakdown: {},
  };

  try {
    const tenant = await storage.getTenant(tenantId);
    let client;
    if (isAzureAppConfigured() && tenant?.azureTenantId) {
      client = await getAzureGraphClient(tenant.azureTenantId);
    } else {
      client = await getUncachableSharePointClient();
    }

    const now = new Date();
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    let auditEntries: any[] = [];

    try {
      const response = await client.api("/auditLogs/directoryAudits")
        .filter(`activityDateTime ge ${since.toISOString()}`)
        .top(100)
        .orderby("activityDateTime desc")
        .get();
      auditEntries = response.value || [];
    } catch (err: any) {
      if (err.statusCode === 403 || err.code === "Authorization_RequestDenied") {
        console.log("[Audit Logs] directoryAudits not available, trying site analytics approach...");
      } else {
        console.warn("[Audit Logs] directoryAudits failed:", err.message);
      }
    }

    if (auditEntries.length === 0) {
      try {
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
      } catch (siteErr: any) {
        result.error = `Site access failed: ${siteErr.message}`;
      }
    } else {
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
    }

    return result;
  } catch (err: any) {
    result.error = err.message || String(err);
    console.error("[Audit Logs] Collection failed:", err.message);
    return result;
  }
}
