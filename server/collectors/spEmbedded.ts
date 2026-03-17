/**
 * SharePoint Embedded (SPE) Observability Collector
 *
 * Collects container-level and tenant-level data from Microsoft Graph:
 *
 * 1. Container Inventory
 *    GET /storage/fileStorage/containers
 *    Enumerates all SPE containers, their owners, sizes, and item counts.
 *    Requires: FileStorageContainer.Read.All
 *
 * 2. Content Access Events
 *    Sourced from Office 365 Audit Log (Audit.SharePoint) filtering on
 *    EmbeddedContentStore operations (FileAccessed, FileModified, etc.)
 *    and from Graph /reports/getSharePointActivityUserDetail for aggregate stats.
 *    Requires: AuditLog.Read.All, ActivityFeed.Read (Mgmt API)
 *
 * 3. Security Events
 *    Derived from audit log entries flagging sensitive operations:
 *    external sharing links, bulk downloads, permission escalations,
 *    sensitivity label downgrades.
 *    Requires: AuditLog.Read.All
 *
 * 4. Content Type & Metadata Stats
 *    GET /storage/fileStorage/containers/{id}/drive/root/children
 *    Walks container drives to build content type and metadata distribution stats.
 *    Requires: FileStorageContainer.Read.All, Files.Read.All
 */

import { getAzureGraphClient, getManagementApiToken, isAzureAppConfigured } from "../azureAuth";
import { storage } from "../storage";
import type { InsertSpeContainer, InsertSpeAccessEvent, InsertSpeSecurityEvent, InsertSpeContentTypeStat } from "@shared/schema";

// ---------------------------------------------------------------------------
// Security event classification helpers
// ---------------------------------------------------------------------------

const SECURITY_OPERATIONS = new Set([
  "SharingSet",
  "SharingInvitationCreated",
  "AnonymousLinkCreated",
  "AnonymousLinkUpdated",
  "SecureLinkCreated",
  "PermissionLevelAdded",
  "PermissionLevelChanged",
  "SensitivityLabelChanged",
  "SensitivityLabelRemoved",
  "FileSyncDownloadedFull",
  "FileSyncDownloadedPartial",
  "FileDeleted",
  "FolderDeleted",
]);

function classifySecurityEvent(
  operation: string,
  details: Record<string, any>
): { eventType: string; severity: string } | null {
  const op = operation.toLowerCase();

  if (op.includes("anonymouslink")) {
    return { eventType: "AnonymousAccess", severity: "high" };
  }
  if (op.includes("sharingset") || op.includes("sharinginvitation") || op.includes("securelinkc")) {
    const targetType = (details.TargetUserOrGroupType || "").toLowerCase();
    const isExternal = targetType === "guest" || targetType === "external";
    return {
      eventType: isExternal ? "ExternalSharingLink" : "InternalSharingLink",
      severity: isExternal ? "high" : "low",
    };
  }
  if (op.includes("permissionlevel") || op.includes("permissionsmod")) {
    return { eventType: "PermissionEscalation", severity: "medium" };
  }
  if (op.includes("sensitivitylabel")) {
    const action = details.SensitivityLabelEventData?.ActionScoreChanged;
    return {
      eventType: action < 0 ? "SensitivityDowngrade" : "SensitivityLabelChange",
      severity: action < 0 ? "high" : "low",
    };
  }
  if (op.includes("filedeleted") || op.includes("folderdeleted")) {
    return { eventType: "MassDelete", severity: "medium" };
  }
  if (op.includes("filesyncdownloaded")) {
    return { eventType: "BulkDownload", severity: "medium" };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface SpeCollectionResult {
  containersCollected: number;
  accessEventsCollected: number;
  securityEventsCollected: number;
  contentTypeStatsCollected: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Main collection entry point
// ---------------------------------------------------------------------------

export async function collectSpeData(tenantId: string): Promise<SpeCollectionResult> {
  const result: SpeCollectionResult = {
    containersCollected: 0,
    accessEventsCollected: 0,
    securityEventsCollected: 0,
    contentTypeStatsCollected: 0,
    errors: [],
  };

  const tenant = await storage.getTenant(tenantId);
  if (!tenant || !tenant.azureTenantId) {
    result.errors.push("Tenant not found or missing Azure tenant ID");
    return result;
  }

  if (!isAzureAppConfigured()) {
    result.errors.push("Azure app not configured");
    return result;
  }

  const graphClient = await getAzureGraphClient(tenant.azureTenantId);

  // -------------------------------------------------------------------
  // 1. Container Inventory
  // -------------------------------------------------------------------
  const containers: Array<{ id: string; displayName: string; siteUrl?: string }> = [];

  try {
    let containersResponse: any;
    try {
      containersResponse = await graphClient
        .api("/storage/fileStorage/containers")
        .select("id,displayName,description,containerTypeId,createdDateTime,storageUsedInBytes,settings,owners")
        .top(100)
        .get();
    } catch (err: any) {
      if (err.statusCode === 403) {
        console.warn("[SPE] Container list requires FileStorageContainer.Read.All — falling back to audit-only mode");
        containersResponse = { value: [] };
      } else {
        throw err;
      }
    }

    const rawContainers: any[] = containersResponse.value || [];

    for (const c of rawContainers) {
      containers.push({ id: c.id, displayName: c.displayName || "Unnamed Container", siteUrl: c.settings?.siteUrl });

      let storageBytes: number | undefined;
      let itemCount: number | undefined;
      let ownerEmail: string | undefined;

      try {
        const driveInfo = await graphClient
          .api(`/storage/fileStorage/containers/${c.id}/drive`)
          .select("quota,owner")
          .get();
        storageBytes = driveInfo?.quota?.used;
        itemCount = driveInfo?.quota?.fileCount;
        ownerEmail = driveInfo?.owner?.user?.email || driveInfo?.owner?.user?.displayName;
      } catch {
        // drive info is optional
      }

      const upsertData: InsertSpeContainer = {
        tenantId,
        containerId: c.id,
        containerType: c.containerTypeId || "fileStorageContainer",
        displayName: c.displayName || "Unnamed Container",
        description: c.description || null,
        ownerAppId: c.containerTypeId || null,
        ownerId: c.owners?.[0]?.id || null,
        ownerEmail: ownerEmail || null,
        siteUrl: c.settings?.siteUrl || null,
        storageBytes: storageBytes ?? null,
        itemCount: itemCount ?? null,
        sensitivityLabel: null,
        status: "active",
        createdAt: c.createdDateTime ? new Date(c.createdDateTime) : null,
      };

      await storage.upsertSpeContainer(upsertData);
      result.containersCollected++;
    }
  } catch (err: any) {
    const msg = `Container inventory failed: ${err.message}`;
    console.error("[SPE]", msg);
    result.errors.push(msg);
  }

  // -------------------------------------------------------------------
  // 2. Access Events & Security Events — via Office 365 Management API
  // -------------------------------------------------------------------
  try {
    const mgmtToken = await getManagementApiToken(tenant.azureTenantId);
    const now = new Date();
    const startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000); // last 24h

    const feedUrl =
      `https://manage.office.com/api/v1.0/${tenant.azureTenantId}/activity/feed/subscriptions/content` +
      `?contentType=Audit.SharePoint` +
      `&startTime=${startTime.toISOString().replace(/\.\d+Z$/, "Z")}` +
      `&endTime=${now.toISOString().replace(/\.\d+Z$/, "Z")}`;

    const feedRes = await fetch(feedUrl, {
      headers: { Authorization: `Bearer ${mgmtToken}`, "Content-Type": "application/json" },
    });

    if (feedRes.ok) {
      const contentBlobs: any[] = await feedRes.json();

      for (const blob of contentBlobs.slice(0, 10)) {
        try {
          const blobRes = await fetch(blob.contentUri, {
            headers: { Authorization: `Bearer ${mgmtToken}` },
          });
          if (!blobRes.ok) continue;
          const records: any[] = await blobRes.json();

          for (const rec of records) {
            // Only process records that are SPE-related (SiteType = "ContainerSite" or ObjectType contains "EmbeddedContentStore")
            const isSpe =
              rec.SiteType === "ContainerSite" ||
              rec.SiteUrl?.includes("/contentstorage/") ||
              (rec.ObjectType && rec.ObjectType.toLowerCase().includes("storage"));

            if (!isSpe) continue;

            // Resolve containerId from SiteUrl or from our known containers
            const matchedContainer = containers.find(c => c.siteUrl && rec.SiteUrl?.includes(c.siteUrl));
            const containerId = matchedContainer?.id || (rec.SiteUrl?.match(/\/contentstorage\/([^/]+)/)?.[1] ?? "unknown");
            const containerName = matchedContainer?.displayName || rec.SiteUrl || "Unknown Container";

            const timestamp = rec.CreationTime ? new Date(rec.CreationTime) : new Date();

            // Access event
            const accessEvent: InsertSpeAccessEvent = {
              tenantId,
              containerId,
              containerName,
              userId: rec.UserId || null,
              userEmail: rec.UserId || null,
              appId: rec.AppId || null,
              operation: rec.Operation || "Unknown",
              resourceType: rec.ItemType || null,
              resourceId: rec.ObjectId || null,
              resourceName: rec.SourceFileName || rec.ObjectId || null,
              resourcePath: rec.SourceRelativeUrl || null,
              contentType: rec.SourceFileExtension ? `file/${rec.SourceFileExtension}` : null,
              sensitivityLabel: rec.SensitivityLabelId || null,
              sizeBytes: rec.FileSizeBytes || null,
              clientIp: rec.ClientIP || null,
              userAgent: rec.UserAgent || null,
              durationMs: null,
              statusCode: 200,
              success: rec.ResultStatus === "Succeeded" || !rec.ResultStatus,
              timestamp,
              details: {
                workload: rec.Workload,
                objectId: rec.ObjectId,
                siteUrl: rec.SiteUrl,
              },
            };

            await storage.createSpeAccessEvent(accessEvent);
            result.accessEventsCollected++;

            // Security event detection
            if (SECURITY_OPERATIONS.has(rec.Operation)) {
              const classification = classifySecurityEvent(rec.Operation, rec);
              if (classification) {
                const secEvent: InsertSpeSecurityEvent = {
                  tenantId,
                  containerId,
                  containerName,
                  userId: rec.UserId || null,
                  userEmail: rec.UserId || null,
                  eventType: classification.eventType,
                  severity: classification.severity,
                  description: `${rec.Operation} by ${rec.UserId || "unknown"} on ${rec.SourceFileName || rec.ObjectId || "unknown resource"}`,
                  resourceId: rec.ObjectId || null,
                  resourceName: rec.SourceFileName || null,
                  clientIp: rec.ClientIP || null,
                  details: { auditRecord: rec },
                  timestamp,
                };
                await storage.createSpeSecurityEvent(secEvent);
                result.securityEventsCollected++;
              }
            }
          }
        } catch (blobErr: any) {
          console.warn("[SPE] Blob fetch failed:", blobErr.message);
        }
      }
    } else if (feedRes.status === 403) {
      console.warn("[SPE] Audit feed requires ActivityFeed.Read on Office 365 Management APIs");
      result.errors.push("Audit feed requires ActivityFeed.Read permission");
    } else if (feedRes.status === 404) {
      // Subscription not started yet — try to start it
      try {
        await fetch(
          `https://manage.office.com/api/v1.0/${tenant.azureTenantId}/activity/feed/subscriptions/start?contentType=Audit.SharePoint`,
          { method: "POST", headers: { Authorization: `Bearer ${mgmtToken}`, "Content-Type": "application/json" }, body: "{}" }
        );
        console.log("[SPE] Started Audit.SharePoint subscription — content will be available on next collection cycle");
      } catch {
        // ignore start failure
      }
    }
  } catch (err: any) {
    const msg = `Access/security event collection failed: ${err.message}`;
    console.error("[SPE]", msg);
    result.errors.push(msg);
  }

  // -------------------------------------------------------------------
  // 3. Content Type & Metadata Stats — walk drive for known containers
  // -------------------------------------------------------------------
  for (const container of containers.slice(0, 5)) { // limit to 5 containers per run
    try {
      let driveItems: any[] = [];
      try {
        const driveResponse = await graphClient
          .api(`/storage/fileStorage/containers/${container.id}/drive/root/children`)
          .select("id,name,file,folder,size,parentReference")
          .top(200)
          .get();
        driveItems = driveResponse.value || [];
      } catch {
        continue;
      }

      // Count by content type (MIME / extension)
      const typeMap = new Map<string, { count: number; totalSize: number }>();
      for (const item of driveItems) {
        if (!item.file) continue; // skip folders at this level
        const mime = item.file.mimeType || "application/octet-stream";
        const existing = typeMap.get(mime) || { count: 0, totalSize: 0 };
        typeMap.set(mime, { count: existing.count + 1, totalSize: existing.totalSize + (item.size || 0) });
      }

      const today = new Date().toISOString().slice(0, 10);
      for (const [contentType, stats] of typeMap) {
        const stat: InsertSpeContentTypeStat = {
          tenantId,
          containerId: container.id,
          containerName: container.displayName,
          contentType,
          itemCount: stats.count,
          totalSizeBytes: stats.totalSize,
          avgSizeBytes: stats.count > 0 ? stats.totalSize / stats.count : null,
          withMetadataCount: 0, // metadata inspection would require individual item fetches
          withSensitivityCount: 0,
          sensitivityBreakdown: {},
          reportDate: today,
        };
        await storage.upsertSpeContentTypeStat(stat);
        result.contentTypeStatsCollected++;
      }
    } catch (err: any) {
      console.warn(`[SPE] Content type stats failed for container ${container.id}:`, err.message);
    }
  }

  return result;
}
