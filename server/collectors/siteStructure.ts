import { getUncachableSharePointClient } from "../sharepoint";
import { getAzureGraphClient, isAzureAppConfigured } from "../azureAuth";
import { storage } from "../storage";

interface StructureResult {
  reportType: string;
  recordsCollected: number;
  error?: string;
}

async function getGraphClientForTenant(tenantId: string) {
  const tenant = await storage.getTenant(tenantId);
  if (isAzureAppConfigured() && tenant?.azureTenantId) {
    return getAzureGraphClient(tenant.azureTenantId);
  }
  return getUncachableSharePointClient();
}

async function safeGraphCall(client: any, endpoint: string, permission: string): Promise<any | null> {
  try {
    const response = await client.api(endpoint).get();
    return response;
  } catch (err: any) {
    if (err.statusCode === 403 || err.code === "Authorization_RequestDenied") {
      console.warn(`[SiteStructure] Permission denied for ${endpoint} — requires ${permission}`);
      return null;
    }
    if (err.statusCode === 404) {
      return null;
    }
    throw err;
  }
}

async function collectSubsites(client: any, tenantId: string): Promise<StructureResult> {
  try {
    const rootSite = await safeGraphCall(client, "/sites/root", "Sites.Read.All");
    if (!rootSite) return { reportType: "subsites", recordsCollected: 0, error: "Permission denied" };

    const subsitesResp = await safeGraphCall(client, "/sites/root/sites?$top=100&$select=id,name,displayName,webUrl,createdDateTime,lastModifiedDateTime", "Sites.Read.All");
    if (!subsitesResp) return { reportType: "subsites", recordsCollected: 0, error: "Permission denied" };

    const subsites = subsitesResp.value || [];

    await storage.createUsageReport({
      tenantId,
      reportType: "subsites",
      reportDate: new Date().toISOString().split("T")[0],
      data: {
        rootSite: {
          id: rootSite.id,
          name: rootSite.name,
          displayName: rootSite.displayName,
          webUrl: rootSite.webUrl,
        },
        subsites: subsites.map((s: any) => ({
          id: s.id,
          name: s.name,
          displayName: s.displayName,
          webUrl: s.webUrl,
          createdDateTime: s.createdDateTime,
          lastModifiedDateTime: s.lastModifiedDateTime,
        })),
        totalSubsites: subsites.length,
      },
    });

    return { reportType: "subsites", recordsCollected: subsites.length + 1 };
  } catch (err: any) {
    return { reportType: "subsites", recordsCollected: 0, error: err.message };
  }
}

async function collectLists(client: any, tenantId: string): Promise<StructureResult> {
  try {
    const listsResp = await safeGraphCall(
      client,
      "/sites/root/lists?$top=200&$select=id,name,displayName,webUrl,createdDateTime,lastModifiedDateTime",
      "Sites.Read.All"
    );
    if (!listsResp) return { reportType: "siteLists", recordsCollected: 0, error: "Permission denied" };

    const allLists = listsResp.value || [];

    const listsWithDetails: any[] = [];
    let docLibCount = 0;
    let regularListCount = 0;

    for (const l of allLists) {
      try {
        const detail = await safeGraphCall(client, `/sites/root/lists/${l.id}?$select=id,displayName,list`, "Sites.Read.All");
        const template = detail?.list?.template || "unknown";
        if (template === "documentLibrary") docLibCount++;
        else regularListCount++;
        listsWithDetails.push({
          id: l.id,
          name: l.name,
          displayName: l.displayName,
          template,
          webUrl: l.webUrl,
          createdDateTime: l.createdDateTime,
          lastModifiedDateTime: l.lastModifiedDateTime,
          hidden: detail?.list?.hidden || false,
          contentTypesEnabled: detail?.list?.contentTypesEnabled || false,
        });
      } catch {
        listsWithDetails.push({
          id: l.id,
          name: l.name,
          displayName: l.displayName,
          template: "unknown",
          webUrl: l.webUrl,
          createdDateTime: l.createdDateTime,
          lastModifiedDateTime: l.lastModifiedDateTime,
        });
        regularListCount++;
      }
    }

    await storage.createUsageReport({
      tenantId,
      reportType: "siteLists",
      reportDate: new Date().toISOString().split("T")[0],
      data: {
        lists: listsWithDetails,
        totalLists: allLists.length,
        totalDocumentLibraries: docLibCount,
        totalRegularLists: regularListCount,
      },
    });

    return { reportType: "siteLists", recordsCollected: allLists.length };
  } catch (err: any) {
    return { reportType: "siteLists", recordsCollected: 0, error: err.message };
  }
}

const PERMISSION_DENIED = "PERMISSION_DENIED_ON_FIRST_PAGE";

async function* iterateGraphPages(
  client: any,
  initialUrl: string,
  scope: string,
): AsyncGenerator<any, void, unknown> {
  let nextLink: string | null = initialUrl;
  let firstPageOk = false;
  while (nextLink) {
    const resp: any = await safeGraphCall(client, nextLink, scope);
    if (!resp) {
      if (!firstPageOk) throw new Error(PERMISSION_DENIED);
      return;
    }
    firstPageOk = true;
    for (const item of resp.value || []) yield item;
    nextLink = resp["@odata.nextLink"] || null;
  }
}

async function collectDriveStructure(client: any, tenantId: string): Promise<StructureResult> {
  const driveDetails: any[] = [];
  let driveCount = 0;
  let totalStorageUsed = 0;
  let totalStorageQuota = 0;

  try {
    for await (const drive of iterateGraphPages(
      client,
      "/sites/root/drives?$top=200&$select=id,name,driveType,quota,webUrl,createdDateTime,lastModifiedDateTime",
      "Sites.Read.All",
    )) {
      driveCount++;
      const quotaUsed = drive.quota?.used || 0;
      const quotaTotal = drive.quota?.total || 0;
      totalStorageUsed += quotaUsed;
      totalStorageQuota += quotaTotal;

      try {
        let rootFileCount = 0;
        let rootFolderCount = 0;
        let estimatedTotalFiles = 0;
        const topLevelItems: any[] = [];

        for await (const item of iterateGraphPages(
          client,
          `/drives/${drive.id}/root/children?$top=200&$select=id,name,size,file,folder,webUrl,createdDateTime,lastModifiedDateTime`,
          "Sites.Read.All",
        )) {
          if (item.file) {
            rootFileCount++;
            estimatedTotalFiles++;
          } else if (item.folder) {
            rootFolderCount++;
            const childCount = item.folder?.childCount || 0;
            if (childCount > 0) estimatedTotalFiles += childCount;
          }
          if (topLevelItems.length < 50) {
            topLevelItems.push({
              name: item.name,
              type: item.file ? "file" : "folder",
              size: item.size || 0,
              childCount: item.folder?.childCount || 0,
              lastModifiedDateTime: item.lastModifiedDateTime,
            });
          }
        }

        driveDetails.push({
          id: drive.id,
          name: drive.name,
          driveType: drive.driveType,
          webUrl: drive.webUrl,
          createdDateTime: drive.createdDateTime,
          lastModifiedDateTime: drive.lastModifiedDateTime,
          quotaTotal,
          quotaUsed,
          quotaRemaining: drive.quota?.remaining || 0,
          quotaState: drive.quota?.state || "unknown",
          rootFileCount,
          rootFolderCount,
          estimatedTotalFiles,
          estimatedTotalFolders: rootFolderCount,
          topLevelItems,
        });
      } catch (driveErr: any) {
        driveDetails.push({
          id: drive.id,
          name: drive.name,
          driveType: drive.driveType,
          error: driveErr.message,
        });
      }

      await new Promise(resolve => setTimeout(resolve, 300));
    }
  } catch (err: any) {
    if (err.message === PERMISSION_DENIED) {
      return { reportType: "driveStructure", recordsCollected: 0, error: "Permission denied" };
    }
    return { reportType: "driveStructure", recordsCollected: 0, error: err.message };
  }

  await storage.createUsageReport({
    tenantId,
    reportType: "driveStructure",
    reportDate: new Date().toISOString().split("T")[0],
    data: {
      drives: driveDetails,
      totalDrives: driveCount,
      totalStorageUsed,
      totalStorageQuota,
    },
  });

  return { reportType: "driveStructure", recordsCollected: driveCount };
}

async function collectSiteGroups(client: any, tenantId: string): Promise<StructureResult> {
  try {
    const tenant = await storage.getTenant(tenantId);
    const domain = tenant?.primaryDomain?.replace(".sharepoint.com", "") || "";

    const groupsResp = await safeGraphCall(
      client,
      `/groups?$filter=groupTypes/any(g:g eq 'Unified')&$top=200&$select=id,displayName,mail,createdDateTime,membershipRule,groupTypes,securityEnabled,visibility&$count=true`,
      "Sites.Read.All"
    );
    if (!groupsResp) return { reportType: "siteGroups", recordsCollected: 0, error: "Permission denied" };

    const groups = groupsResp.value || [];

    await storage.createUsageReport({
      tenantId,
      reportType: "siteGroups",
      reportDate: new Date().toISOString().split("T")[0],
      data: {
        groups: groups.map((g: any) => ({
          id: g.id,
          displayName: g.displayName,
          mail: g.mail,
          createdDateTime: g.createdDateTime,
          visibility: g.visibility || "unknown",
          securityEnabled: g.securityEnabled || false,
          groupTypes: g.groupTypes || [],
        })),
        totalGroups: groups.length,
        publicGroups: groups.filter((g: any) => g.visibility === "Public").length,
        privateGroups: groups.filter((g: any) => g.visibility === "Private").length,
      },
    });

    return { reportType: "siteGroups", recordsCollected: groups.length };
  } catch (err: any) {
    return { reportType: "siteGroups", recordsCollected: 0, error: err.message };
  }
}

async function collectSiteUsers(client: any, tenantId: string): Promise<StructureResult> {
  try {
    const usersResp = await safeGraphCall(
      client,
      `/users?$top=200&$select=id,displayName,userPrincipalName,mail,accountEnabled,createdDateTime,lastSignInDateTime,userType&$count=true`,
      "Sites.Read.All"
    );
    if (!usersResp) return { reportType: "siteUsers", recordsCollected: 0, error: "Permission denied" };

    const users = usersResp.value || [];

    await storage.createUsageReport({
      tenantId,
      reportType: "siteUsers",
      reportDate: new Date().toISOString().split("T")[0],
      data: {
        users: users.map((u: any) => ({
          id: u.id,
          displayName: u.displayName,
          userPrincipalName: u.userPrincipalName,
          mail: u.mail,
          accountEnabled: u.accountEnabled,
          createdDateTime: u.createdDateTime,
          userType: u.userType || "Member",
        })),
        totalUsers: users.length,
        activeUsers: users.filter((u: any) => u.accountEnabled).length,
        guestUsers: users.filter((u: any) => u.userType === "Guest").length,
        memberUsers: users.filter((u: any) => u.userType !== "Guest").length,
      },
    });

    return { reportType: "siteUsers", recordsCollected: users.length };
  } catch (err: any) {
    return { reportType: "siteUsers", recordsCollected: 0, error: err.message };
  }
}

export async function collectSiteStructure(tenantId: string): Promise<{
  results: StructureResult[];
  totalCollected: number;
}> {
  const client = await getGraphClientForTenant(tenantId);

  const results: StructureResult[] = [];
  const collectors = [
    () => collectSubsites(client, tenantId),
    () => collectLists(client, tenantId),
    () => collectDriveStructure(client, tenantId),
    () => collectSiteGroups(client, tenantId),
    () => collectSiteUsers(client, tenantId),
  ];

  for (const collector of collectors) {
    const result = await collector();
    results.push(result);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  const totalCollected = results.reduce((sum, r) => sum + r.recordsCollected, 0);
  console.log(`[SiteStructure] Collected for tenant ${tenantId}: ${results.map(r => `${r.reportType}=${r.recordsCollected}${r.error ? '(err)' : ''}`).join(', ')}`);
  return { results, totalCollected };
}
