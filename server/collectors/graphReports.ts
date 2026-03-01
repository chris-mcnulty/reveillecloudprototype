import { getUncachableSharePointClient } from "../sharepoint";
import { getAzureGraphClient, isAzureAppConfigured } from "../azureAuth";
import { storage } from "../storage";

interface ReportResult {
  reportType: string;
  recordsCollected: number;
  error?: string;
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseCSV(csvText: string): Record<string, string>[] {
  const rawLines = csvText.trim().split("\n").map(l => l.replace(/\r$/, ""));
  if (rawLines.length > 0 && rawLines[0].charCodeAt(0) === 0xFEFF) {
    rawLines[0] = rawLines[0].slice(1);
  }
  if (rawLines.length < 2) return [];

  const headers = parseCSVLine(rawLines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < rawLines.length; i++) {
    if (!rawLines[i].trim()) continue;
    const values = parseCSVLine(rawLines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || "";
    });
    rows.push(row);
  }
  return rows;
}

async function fetchReport(client: any, endpoint: string): Promise<{ csv: string | null; json: any[] | null }> {
  try {
    const response = await client.api(endpoint)
      .header("Accept", "application/json")
      .get();

    if (typeof response === "string") {
      if (response.trim().startsWith("[") || response.trim().startsWith("{")) {
        try {
          const parsed = JSON.parse(response);
          return { csv: null, json: Array.isArray(parsed) ? parsed : parsed.value || [parsed] };
        } catch {
          return { csv: response, json: null };
        }
      }
      return { csv: response, json: null };
    }

    if (response && typeof response === "object") {
      if (Array.isArray(response)) {
        return { csv: null, json: response };
      }
      if (response.value && Array.isArray(response.value)) {
        return { csv: null, json: response.value };
      }
      return { csv: null, json: [response] };
    }

    return { csv: String(response), json: null };
  } catch (err: any) {
    if (err.statusCode === 403 || err.code === "Authorization_RequestDenied") {
      console.warn(`[Graph Reports] Permission denied for ${endpoint} - requires Reports.Read.All`);
      return { csv: null, json: null };
    }
    throw err;
  }
}

function normalizeJsonReport(rows: any[], fieldMap: Record<string, string>): any[] {
  return rows.map(row => {
    const normalized: Record<string, any> = {};
    for (const [jsonKey, outputKey] of Object.entries(fieldMap)) {
      if (row[jsonKey] !== undefined) {
        normalized[outputKey] = row[jsonKey];
      }
    }
    return normalized;
  });
}

async function collectSiteUsageDetail(client: any, tenantId: string): Promise<ReportResult> {
  try {
    const { csv, json } = await fetchReport(client, "/reports/getSharePointSiteUsageDetail(period='D7')");
    if (!csv && !json) return { reportType: "siteUsageDetail", recordsCollected: 0, error: "Permission denied" };

    let sites: any[] = [];
    let reportDate = new Date().toISOString().split("T")[0];

    if (json && json.length > 0) {
      reportDate = json[0].reportRefreshDate || reportDate;
      sites = json.map(r => ({
        siteUrl: r.siteUrl,
        owner: r.ownerDisplayName,
        storageUsedBytes: r.storageUsedInBytes || 0,
        storageAllocatedBytes: r.storageAllocatedInBytes || 0,
        fileCount: r.fileCount || 0,
        activeFileCount: r.activeFileCount || 0,
        pageViewCount: r.pageViewCount || 0,
        visitedPageCount: r.visitedPageCount || 0,
        lastActivityDate: r.lastActivityDate,
      }));
    } else if (csv) {
      const rows = parseCSV(csv);
      if (rows.length === 0) return { reportType: "siteUsageDetail", recordsCollected: 0 };
      reportDate = rows[0]["Report Refresh Date"] || reportDate;
      sites = rows.map(r => ({
        siteUrl: r["Site URL"],
        owner: r["Owner Display Name"],
        storageUsedBytes: parseInt(r["Storage Used (Byte)"] || "0"),
        storageAllocatedBytes: parseInt(r["Storage Allocated (Byte)"] || "0"),
        fileCount: parseInt(r["File Count"] || "0"),
        activeFileCount: parseInt(r["Active File Count"] || "0"),
        pageViewCount: parseInt(r["Page View Count"] || "0"),
        visitedPageCount: parseInt(r["Visited Page Count"] || "0"),
        lastActivityDate: r["Last Activity Date"],
      }));
    }

    if (sites.length === 0) return { reportType: "siteUsageDetail", recordsCollected: 0 };

    await storage.createUsageReport({
      tenantId,
      reportType: "siteUsageDetail",
      reportDate,
      data: { sites, totalSites: sites.length },
    });

    return { reportType: "siteUsageDetail", recordsCollected: sites.length };
  } catch (err: any) {
    return { reportType: "siteUsageDetail", recordsCollected: 0, error: err.message };
  }
}

async function collectSiteUsageSiteCounts(client: any, tenantId: string): Promise<ReportResult> {
  try {
    const { csv, json } = await fetchReport(client, "/reports/getSharePointSiteUsageSiteCounts(period='D7')");
    if (!csv && !json) return { reportType: "siteUsageCounts", recordsCollected: 0, error: "Permission denied" };

    let daily: any[] = [];
    let reportDate = new Date().toISOString().split("T")[0];

    if (json && json.length > 0) {
      reportDate = json[0].reportDate || reportDate;
      daily = json.map(r => ({
        reportDate: r.reportDate,
        total: r.siteCount || r.total || 0,
        active: r.active || 0,
      }));
    } else if (csv) {
      const rows = parseCSV(csv);
      if (rows.length === 0) return { reportType: "siteUsageCounts", recordsCollected: 0 };
      reportDate = rows[0]["Report Date"] || reportDate;
      daily = rows.map(r => ({
        reportDate: r["Report Date"],
        total: parseInt(r["Total"] || r["Site Count"] || "0"),
        active: parseInt(r["Active"] || "0"),
      }));
    }

    if (daily.length === 0) return { reportType: "siteUsageCounts", recordsCollected: 0 };

    await storage.createUsageReport({ tenantId, reportType: "siteUsageCounts", reportDate, data: { daily } });
    return { reportType: "siteUsageCounts", recordsCollected: daily.length };
  } catch (err: any) {
    return { reportType: "siteUsageCounts", recordsCollected: 0, error: err.message };
  }
}

async function collectStorageUsage(client: any, tenantId: string): Promise<ReportResult> {
  try {
    const { csv, json } = await fetchReport(client, "/reports/getSharePointSiteUsageStorage(period='D7')");
    if (!csv && !json) return { reportType: "storageUsage", recordsCollected: 0, error: "Permission denied" };

    let daily: any[] = [];
    let reportDate = new Date().toISOString().split("T")[0];

    if (json && json.length > 0) {
      reportDate = json[0].reportDate || reportDate;
      daily = json.map(r => ({
        reportDate: r.reportDate,
        storageUsedBytes: r.storageUsedInBytes || 0,
      }));
    } else if (csv) {
      const rows = parseCSV(csv);
      if (rows.length === 0) return { reportType: "storageUsage", recordsCollected: 0 };
      reportDate = rows[0]["Report Date"] || reportDate;
      daily = rows.map(r => ({
        reportDate: r["Report Date"],
        storageUsedBytes: parseInt(r["Storage Used (Byte)"] || "0"),
      }));
    }

    if (daily.length === 0) return { reportType: "storageUsage", recordsCollected: 0 };

    await storage.createUsageReport({ tenantId, reportType: "storageUsage", reportDate, data: { daily } });
    return { reportType: "storageUsage", recordsCollected: daily.length };
  } catch (err: any) {
    return { reportType: "storageUsage", recordsCollected: 0, error: err.message };
  }
}

async function collectFileActivity(client: any, tenantId: string): Promise<ReportResult> {
  try {
    const { csv, json } = await fetchReport(client, "/reports/getSharePointSiteUsageFileCounts(period='D7')");
    if (!csv && !json) return { reportType: "fileActivity", recordsCollected: 0, error: "Permission denied" };

    let daily: any[] = [];
    let reportDate = new Date().toISOString().split("T")[0];

    if (json && json.length > 0) {
      reportDate = json[0].reportDate || reportDate;
      daily = json.map(r => ({
        reportDate: r.reportDate,
        total: r.total || r.fileCount || 0,
        active: r.active || r.activeFileCount || 0,
      }));
    } else if (csv) {
      const rows = parseCSV(csv);
      if (rows.length === 0) return { reportType: "fileActivity", recordsCollected: 0 };
      reportDate = rows[0]["Report Date"] || reportDate;
      daily = rows.map(r => ({
        reportDate: r["Report Date"],
        total: parseInt(r["Total"] || r["File Count"] || "0"),
        active: parseInt(r["Active"] || r["Active File Count"] || "0"),
      }));
    }

    if (daily.length === 0) return { reportType: "fileActivity", recordsCollected: 0 };

    await storage.createUsageReport({ tenantId, reportType: "fileActivity", reportDate, data: { daily } });
    return { reportType: "fileActivity", recordsCollected: daily.length };
  } catch (err: any) {
    return { reportType: "fileActivity", recordsCollected: 0, error: err.message };
  }
}

async function collectActiveUsers(client: any, tenantId: string): Promise<ReportResult> {
  try {
    const { csv, json } = await fetchReport(client, "/reports/getSharePointActivityUserDetail(period='D7')");
    if (!csv && !json) return { reportType: "activeUsers", recordsCollected: 0, error: "Permission denied" };

    let users: any[] = [];
    let reportDate = new Date().toISOString().split("T")[0];

    if (json && json.length > 0) {
      reportDate = json[0].reportRefreshDate || reportDate;
      users = json.map(r => ({
        userPrincipal: r.userPrincipalName,
        lastActivityDate: r.lastActivityDate,
        viewedOrEdited: r.viewedOrEditedFileCount || 0,
        syncedFileCount: r.syncedFileCount || 0,
        sharedInternallyCount: r.sharedInternallyFileCount || 0,
        sharedExternallyCount: r.sharedExternallyFileCount || 0,
        visitedPageCount: r.visitedPageCount || 0,
      }));
    } else if (csv) {
      const rows = parseCSV(csv);
      if (rows.length === 0) return { reportType: "activeUsers", recordsCollected: 0 };
      reportDate = rows[0]["Report Refresh Date"] || reportDate;
      users = rows.map(r => ({
        userPrincipal: r["User Principal Name"],
        lastActivityDate: r["Last Activity Date"],
        viewedOrEdited: parseInt(r["Viewed Or Edited File Count"] || "0"),
        syncedFileCount: parseInt(r["Synced File Count"] || "0"),
        sharedInternallyCount: parseInt(r["Shared Internally File Count"] || "0"),
        sharedExternallyCount: parseInt(r["Shared Externally File Count"] || "0"),
        visitedPageCount: parseInt(r["Visited Page Count"] || "0"),
      }));
    }

    if (users.length === 0) return { reportType: "activeUsers", recordsCollected: 0 };

    await storage.createUsageReport({
      tenantId, reportType: "activeUsers", reportDate,
      data: { users, totalActiveUsers: users.length },
    });
    return { reportType: "activeUsers", recordsCollected: users.length };
  } catch (err: any) {
    return { reportType: "activeUsers", recordsCollected: 0, error: err.message };
  }
}

async function collectOneDriveUsageDetail(client: any, tenantId: string): Promise<ReportResult> {
  try {
    const { csv, json } = await fetchReport(client, "/reports/getOneDriveUsageAccountDetail(period='D7')");
    if (!csv && !json) return { reportType: "onedriveUsageDetail", recordsCollected: 0, error: "Permission denied" };

    let accounts: any[] = [];
    let reportDate = new Date().toISOString().split("T")[0];

    if (json && json.length > 0) {
      reportDate = json[0].reportRefreshDate || reportDate;
      accounts = json.map(r => ({
        ownerPrincipal: r.ownerPrincipalName,
        ownerDisplayName: r.ownerDisplayName,
        siteUrl: r.siteUrl,
        isDeleted: r.isDeleted || false,
        lastActivityDate: r.lastActivityDate,
        fileCount: r.fileCount || 0,
        activeFileCount: r.activeFileCount || 0,
        storageUsedBytes: r.storageUsedInBytes || 0,
        storageAllocatedBytes: r.storageAllocatedInBytes || 0,
      }));
    } else if (csv) {
      const rows = parseCSV(csv);
      if (rows.length === 0) return { reportType: "onedriveUsageDetail", recordsCollected: 0 };
      reportDate = rows[0]["Report Refresh Date"] || reportDate;
      accounts = rows.map(r => ({
        ownerPrincipal: r["Owner Principal Name"],
        ownerDisplayName: r["Owner Display Name"],
        siteUrl: r["Site URL"],
        isDeleted: r["Is Deleted"] === "TRUE",
        lastActivityDate: r["Last Activity Date"],
        fileCount: parseInt(r["File Count"] || "0"),
        activeFileCount: parseInt(r["Active File Count"] || "0"),
        storageUsedBytes: parseInt(r["Storage Used (Byte)"] || "0"),
        storageAllocatedBytes: parseInt(r["Storage Allocated (Byte)"] || "0"),
      }));
    }

    if (accounts.length === 0) return { reportType: "onedriveUsageDetail", recordsCollected: 0 };

    await storage.createUsageReport({
      tenantId, reportType: "onedriveUsageDetail", reportDate,
      data: { accounts, totalAccounts: accounts.length },
    });
    return { reportType: "onedriveUsageDetail", recordsCollected: accounts.length };
  } catch (err: any) {
    return { reportType: "onedriveUsageDetail", recordsCollected: 0, error: err.message };
  }
}

async function collectOneDriveActivityDetail(client: any, tenantId: string): Promise<ReportResult> {
  try {
    const { csv, json } = await fetchReport(client, "/reports/getOneDriveActivityUserDetail(period='D7')");
    if (!csv && !json) return { reportType: "onedriveActivityDetail", recordsCollected: 0, error: "Permission denied" };

    let users: any[] = [];
    let reportDate = new Date().toISOString().split("T")[0];

    if (json && json.length > 0) {
      reportDate = json[0].reportRefreshDate || reportDate;
      users = json.map(r => ({
        userPrincipal: r.userPrincipalName,
        lastActivityDate: r.lastActivityDate,
        viewedOrEdited: r.viewedOrEditedFileCount || 0,
        syncedFileCount: r.syncedFileCount || 0,
        sharedInternallyCount: r.sharedInternallyFileCount || 0,
        sharedExternallyCount: r.sharedExternallyFileCount || 0,
      }));
    } else if (csv) {
      const rows = parseCSV(csv);
      if (rows.length === 0) return { reportType: "onedriveActivityDetail", recordsCollected: 0 };
      reportDate = rows[0]["Report Refresh Date"] || reportDate;
      users = rows.map(r => ({
        userPrincipal: r["User Principal Name"],
        lastActivityDate: r["Last Activity Date"],
        viewedOrEdited: parseInt(r["Viewed Or Edited File Count"] || "0"),
        syncedFileCount: parseInt(r["Synced File Count"] || "0"),
        sharedInternallyCount: parseInt(r["Shared Internally File Count"] || "0"),
        sharedExternallyCount: parseInt(r["Shared Externally File Count"] || "0"),
      }));
    }

    if (users.length === 0) return { reportType: "onedriveActivityDetail", recordsCollected: 0 };

    await storage.createUsageReport({
      tenantId, reportType: "onedriveActivityDetail", reportDate,
      data: { users, totalActiveUsers: users.length },
    });
    return { reportType: "onedriveActivityDetail", recordsCollected: users.length };
  } catch (err: any) {
    return { reportType: "onedriveActivityDetail", recordsCollected: 0, error: err.message };
  }
}

async function collectOneDriveStorageUsage(client: any, tenantId: string): Promise<ReportResult> {
  try {
    const { csv, json } = await fetchReport(client, "/reports/getOneDriveUsageStorage(period='D7')");
    if (!csv && !json) return { reportType: "onedriveStorageUsage", recordsCollected: 0, error: "Permission denied" };

    let daily: any[] = [];
    let reportDate = new Date().toISOString().split("T")[0];

    if (json && json.length > 0) {
      reportDate = json[0].reportDate || reportDate;
      daily = json.map(r => ({
        reportDate: r.reportDate,
        siteType: r.siteType || "OneDrive",
        storageUsedBytes: r.storageUsedInBytes || 0,
      }));
    } else if (csv) {
      const rows = parseCSV(csv);
      if (rows.length === 0) return { reportType: "onedriveStorageUsage", recordsCollected: 0 };
      reportDate = rows[0]["Report Date"] || reportDate;
      daily = rows.map(r => ({
        reportDate: r["Report Date"],
        siteType: r["Site Type"] || "OneDrive",
        storageUsedBytes: parseInt(r["Storage Used (Byte)"] || "0"),
      }));
    }

    if (daily.length === 0) return { reportType: "onedriveStorageUsage", recordsCollected: 0 };

    await storage.createUsageReport({ tenantId, reportType: "onedriveStorageUsage", reportDate, data: { daily } });
    return { reportType: "onedriveStorageUsage", recordsCollected: daily.length };
  } catch (err: any) {
    return { reportType: "onedriveStorageUsage", recordsCollected: 0, error: err.message };
  }
}

async function collectM365AppUsage(client: any, tenantId: string): Promise<ReportResult> {
  try {
    const { csv, json } = await fetchReport(client, "/reports/getM365AppUserDetail(period='D7')");
    if (!csv && !json) return { reportType: "m365AppUsage", recordsCollected: 0, error: "Permission denied" };

    let users: any[] = [];
    let reportDate = new Date().toISOString().split("T")[0];

    if (json && json.length > 0) {
      reportDate = json[0].reportRefreshDate || reportDate;
      users = json.map(r => ({
        userPrincipal: r.userPrincipalName,
        lastActivationDate: r.lastActivationDate,
        lastActivityDate: r.lastActivityDate,
        details: r.details || [],
        windows: r.windows || false,
        mac: r.mac || false,
        mobile: r.mobile || false,
        web: r.web || false,
        outlook: r.outlook || false,
        word: r.word || false,
        excel: r.excel || false,
        powerPoint: r.powerPoint || false,
        oneNote: r.oneNote || false,
        teams: r.teams || false,
        outlookWindows: r.outlookWindows || false,
        wordWindows: r.wordWindows || false,
        excelWindows: r.excelWindows || false,
        powerPointWindows: r.powerPointWindows || false,
        oneNoteWindows: r.oneNoteWindows || false,
        teamsWindows: r.teamsWindows || false,
      }));
    } else if (csv) {
      const rows = parseCSV(csv);
      if (rows.length === 0) return { reportType: "m365AppUsage", recordsCollected: 0 };
      reportDate = rows[0]["Report Refresh Date"] || reportDate;
      users = rows.map(r => ({
        userPrincipal: r["User Principal Name"],
        lastActivationDate: r["Last Activation Date"],
        lastActivityDate: r["Last Activity Date"],
        windows: r["Windows"] === "Yes",
        mac: r["Mac"] === "Yes",
        mobile: r["Mobile"] === "Yes",
        web: r["Web"] === "Yes",
      }));
    }

    if (users.length === 0) return { reportType: "m365AppUsage", recordsCollected: 0 };

    await storage.createUsageReport({
      tenantId, reportType: "m365AppUsage", reportDate,
      data: { users, totalUsers: users.length },
    });
    return { reportType: "m365AppUsage", recordsCollected: users.length };
  } catch (err: any) {
    return { reportType: "m365AppUsage", recordsCollected: 0, error: err.message };
  }
}

async function collectTeamsActivity(client: any, tenantId: string): Promise<ReportResult> {
  try {
    const { csv, json } = await fetchReport(client, "/reports/getTeamsUserActivityUserDetail(period='D7')");
    if (!csv && !json) return { reportType: "teamsActivity", recordsCollected: 0, error: "Permission denied" };

    let users: any[] = [];
    let reportDate = new Date().toISOString().split("T")[0];

    if (json && json.length > 0) {
      reportDate = json[0].reportRefreshDate || reportDate;
      users = json.map(r => ({
        userPrincipal: r.userPrincipalName,
        lastActivityDate: r.lastActivityDate,
        teamChatMessageCount: r.teamChatMessageCount || 0,
        privateChatMessageCount: r.privateChatMessageCount || 0,
        callCount: r.callCount || 0,
        meetingCount: r.meetingCount || 0,
        meetingsOrganizedCount: r.meetingsOrganizedCount || 0,
        meetingsAttendedCount: r.meetingsAttendedCount || 0,
        hasOtherAction: r.hasOtherAction || false,
      }));
    } else if (csv) {
      const rows = parseCSV(csv);
      if (rows.length === 0) return { reportType: "teamsActivity", recordsCollected: 0 };
      reportDate = rows[0]["Report Refresh Date"] || reportDate;
      users = rows.map(r => ({
        userPrincipal: r["User Principal Name"],
        lastActivityDate: r["Last Activity Date"],
        teamChatMessageCount: parseInt(r["Team Chat Message Count"] || "0"),
        privateChatMessageCount: parseInt(r["Private Chat Message Count"] || "0"),
        callCount: parseInt(r["Call Count"] || "0"),
        meetingCount: parseInt(r["Meeting Count"] || "0"),
      }));
    }

    if (users.length === 0) return { reportType: "teamsActivity", recordsCollected: 0 };

    await storage.createUsageReport({
      tenantId, reportType: "teamsActivity", reportDate,
      data: { users, totalActiveUsers: users.length },
    });
    return { reportType: "teamsActivity", recordsCollected: users.length };
  } catch (err: any) {
    return { reportType: "teamsActivity", recordsCollected: 0, error: err.message };
  }
}

async function collectEmailActivity(client: any, tenantId: string): Promise<ReportResult> {
  try {
    const { csv, json } = await fetchReport(client, "/reports/getEmailActivityUserDetail(period='D7')");
    if (!csv && !json) return { reportType: "emailActivity", recordsCollected: 0, error: "Permission denied" };

    let users: any[] = [];
    let reportDate = new Date().toISOString().split("T")[0];

    if (json && json.length > 0) {
      reportDate = json[0].reportRefreshDate || reportDate;
      users = json.map(r => ({
        userPrincipal: r.userPrincipalName,
        lastActivityDate: r.lastActivityDate,
        sendCount: r.sendCount || 0,
        receiveCount: r.receiveCount || 0,
        readCount: r.readCount || 0,
      }));
    } else if (csv) {
      const rows = parseCSV(csv);
      if (rows.length === 0) return { reportType: "emailActivity", recordsCollected: 0 };
      reportDate = rows[0]["Report Refresh Date"] || reportDate;
      users = rows.map(r => ({
        userPrincipal: r["User Principal Name"],
        lastActivityDate: r["Last Activity Date"],
        sendCount: parseInt(r["Send Count"] || "0"),
        receiveCount: parseInt(r["Receive Count"] || "0"),
        readCount: parseInt(r["Read Count"] || "0"),
      }));
    }

    if (users.length === 0) return { reportType: "emailActivity", recordsCollected: 0 };

    await storage.createUsageReport({
      tenantId, reportType: "emailActivity", reportDate,
      data: { users, totalActiveUsers: users.length },
    });
    return { reportType: "emailActivity", recordsCollected: users.length };
  } catch (err: any) {
    return { reportType: "emailActivity", recordsCollected: 0, error: err.message };
  }
}

async function getGraphClientForTenant(tenantId: string) {
  const tenant = await storage.getTenant(tenantId);
  if (isAzureAppConfigured() && tenant?.azureTenantId) {
    return getAzureGraphClient(tenant.azureTenantId);
  }
  return getUncachableSharePointClient();
}

export async function collectSharePointUsageReports(tenantId: string): Promise<{
  results: ReportResult[];
  totalCollected: number;
}> {
  const client = await getGraphClientForTenant(tenantId);

  const results: ReportResult[] = [];
  const collectors = [
    () => collectSiteUsageDetail(client, tenantId),
    () => collectSiteUsageSiteCounts(client, tenantId),
    () => collectStorageUsage(client, tenantId),
    () => collectFileActivity(client, tenantId),
    () => collectActiveUsers(client, tenantId),
    () => collectOneDriveUsageDetail(client, tenantId),
    () => collectOneDriveActivityDetail(client, tenantId),
    () => collectOneDriveStorageUsage(client, tenantId),
    () => collectM365AppUsage(client, tenantId),
    () => collectTeamsActivity(client, tenantId),
    () => collectEmailActivity(client, tenantId),
  ];

  for (const collector of collectors) {
    const result = await collector();
    results.push(result);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  const totalCollected = results.reduce((sum, r) => sum + r.recordsCollected, 0);
  return { results, totalCollected };
}
