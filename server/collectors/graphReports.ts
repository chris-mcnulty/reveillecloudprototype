import { getUncachableSharePointClient } from "../sharepoint";
import { getAzureGraphClient, getClientCredentialsToken, isAzureAppConfigured } from "../azureAuth";
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

async function fetchReport(client: any, endpoint: string, azureTenantId?: string, useBeta = false): Promise<{ csv: string | null; json: any[] | null }> {
  const shortEndpoint = endpoint.split("/").pop()?.split("(")[0] || endpoint;
  const apiVersion = useBeta ? "beta" : "v1.0";

  if (azureTenantId) {
    try {
      const token = await getClientCredentialsToken(azureTenantId);
      const url = `https://graph.microsoft.com/${apiVersion}${endpoint}`;
      const resp = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        redirect: "follow",
      });

      if (resp.status === 403 || resp.status === 401) {
        console.warn(`[Graph Reports] Permission denied for ${shortEndpoint} (${resp.status})`);
        return { csv: null, json: null };
      }

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        throw new Error(`Graph API ${resp.status}: ${errText.slice(0, 200)}`);
      }

      const contentType = resp.headers.get("content-type") || "";
      const body = await resp.text();

      if (contentType.includes("application/json")) {
        try {
          const parsed = JSON.parse(body);
          const rows = Array.isArray(parsed) ? parsed : parsed.value || [parsed];
          return { csv: null, json: rows };
        } catch {
          return { csv: body, json: null };
        }
      }

      return { csv: body, json: null };
    } catch (err: any) {
      if (err.message?.includes("403") || err.message?.includes("Authorization_RequestDenied")) {
        console.warn(`[Graph Reports] Permission denied for ${shortEndpoint}`);
        return { csv: null, json: null };
      }
      throw err;
    }
  }

  try {
    const apiCall = useBeta ? client.api(endpoint).version("beta") : client.api(endpoint);
    const response = await apiCall.get();

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

async function collectSiteUsageDetail(client: any, tenantId: string, azureTenantId?: string): Promise<ReportResult> {
  try {
    const { csv, json } = await fetchReport(client, "/reports/getSharePointSiteUsageDetail(period='D7')", azureTenantId);
    if (!csv && !json) return { reportType: "siteUsageDetail", recordsCollected: 0, error: "Permission denied" };

    let sites: any[] = [];
    let reportDate = new Date().toISOString().split("T")[0];

    if (json && json.length > 0) {
      reportDate = json[0].reportRefreshDate || reportDate;
      sites = json.map(r => ({
        siteUrl: r.siteUrl || r["Site URL"],
        owner: r.ownerDisplayName || r["Owner Display Name"],
        storageUsedBytes: r.storageUsedInBytes || parseInt(r["Storage Used (Byte)"] || "0") || 0,
        storageAllocatedBytes: r.storageAllocatedInBytes || parseInt(r["Storage Allocated (Byte)"] || "0") || 0,
        fileCount: r.fileCount || parseInt(r["File Count"] || "0") || 0,
        activeFileCount: r.activeFileCount || parseInt(r["Active File Count"] || "0") || 0,
        pageViewCount: r.pageViewCount || parseInt(r["Page View Count"] || "0") || 0,
        visitedPageCount: r.visitedPageCount || parseInt(r["Visited Page Count"] || "0") || 0,
        lastActivityDate: r.lastActivityDate || r["Last Activity Date"],
      }));
    }
    if (!sites.length && csv) {
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

async function collectSiteUsageSiteCounts(client: any, tenantId: string, azureTenantId?: string): Promise<ReportResult> {
  try {
    const { csv, json } = await fetchReport(client, "/reports/getSharePointSiteUsageSiteCounts(period='D7')", azureTenantId);
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

async function collectStorageUsage(client: any, tenantId: string, azureTenantId?: string): Promise<ReportResult> {
  try {
    const { csv, json } = await fetchReport(client, "/reports/getSharePointSiteUsageStorage(period='D7')", azureTenantId);
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

async function collectFileActivity(client: any, tenantId: string, azureTenantId?: string): Promise<ReportResult> {
  try {
    const { csv, json } = await fetchReport(client, "/reports/getSharePointSiteUsageFileCounts(period='D7')", azureTenantId);
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

async function collectActiveUsers(client: any, tenantId: string, azureTenantId?: string): Promise<ReportResult> {
  try {
    const { csv, json } = await fetchReport(client, "/reports/getSharePointActivityUserDetail(period='D7')", azureTenantId);
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

async function collectOneDriveUsageDetail(client: any, tenantId: string, azureTenantId?: string): Promise<ReportResult> {
  try {
    const { csv, json } = await fetchReport(client, "/reports/getOneDriveUsageAccountDetail(period='D7')", azureTenantId);
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

async function collectOneDriveActivityDetail(client: any, tenantId: string, azureTenantId?: string): Promise<ReportResult> {
  try {
    const { csv, json } = await fetchReport(client, "/reports/getOneDriveActivityUserDetail(period='D7')", azureTenantId);
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

async function collectOneDriveStorageUsage(client: any, tenantId: string, azureTenantId?: string): Promise<ReportResult> {
  try {
    const { csv, json } = await fetchReport(client, "/reports/getOneDriveUsageStorage(period='D7')", azureTenantId);
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

async function collectM365AppUsage(client: any, tenantId: string, azureTenantId?: string): Promise<ReportResult> {
  try {
    const { csv, json } = await fetchReport(client, "/reports/getM365AppUserDetail(period='D7')", azureTenantId);
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

async function collectTeamsActivity(client: any, tenantId: string, azureTenantId?: string): Promise<ReportResult> {
  try {
    const { csv, json } = await fetchReport(client, "/reports/getTeamsUserActivityUserDetail(period='D7')", azureTenantId);
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

async function collectEmailActivity(client: any, tenantId: string, azureTenantId?: string): Promise<ReportResult> {
  try {
    const { csv, json } = await fetchReport(client, "/reports/getEmailActivityUserDetail(period='D7')", azureTenantId);
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

async function collectCopilotUsageDetail(client: any, tenantId: string, azureTenantId?: string): Promise<ReportResult> {
  try {
    const { csv, json } = await fetchReport(client, "/reports/getMicrosoft365CopilotUsageUserDetail(period='D7')", azureTenantId, true);
    console.log(`[Graph Reports] Copilot usage detail: csv=${csv ? csv.length + ' chars' : 'null'}, json=${json ? json.length + ' items' : 'null'}`);
    if (!csv && !json) return { reportType: "copilotUsageDetail", recordsCollected: 0, error: "Permission denied or not available" };

    let users: any[] = [];
    let reportDate = new Date().toISOString().split("T")[0];

    if (json && json.length > 0) {
      reportDate = json[0].reportRefreshDate || reportDate;
      users = json.map(r => ({
        userPrincipal: r.userPrincipalName,
        displayName: r.displayName,
        lastActivityDate: r.lastActivityDate,
        copilotChatLastActivityDate: r.microsoftTeamsCopilotLastActivityDate || r.copilotChatLastActivityDate || null,
        wordCopilotLastActivityDate: r.wordCopilotLastActivityDate || null,
        excelCopilotLastActivityDate: r.excelCopilotLastActivityDate || null,
        powerPointCopilotLastActivityDate: r.powerPointCopilotLastActivityDate || null,
        outlookCopilotLastActivityDate: r.outlookCopilotLastActivityDate || null,
        oneNoteCopilotLastActivityDate: r.oneNoteCopilotLastActivityDate || null,
        teamsCopilotLastActivityDate: r.microsoftTeamsCopilotLastActivityDate || null,
      }));
    } else if (csv) {
      const rows = parseCSV(csv);
      if (rows.length === 0) return { reportType: "copilotUsageDetail", recordsCollected: 0 };
      reportDate = rows[0]["Report Refresh Date"] || reportDate;
      users = rows.map(r => ({
        userPrincipal: r["User Principal Name"],
        displayName: r["Display Name"],
        lastActivityDate: r["Last Activity Date"],
        copilotChatLastActivityDate: r["Microsoft Teams Copilot Last Activity Date"] || r["Copilot Chat Last Activity Date"] || null,
        wordCopilotLastActivityDate: r["Word Copilot Last Activity Date"] || null,
        excelCopilotLastActivityDate: r["Excel Copilot Last Activity Date"] || null,
        powerPointCopilotLastActivityDate: r["PowerPoint Copilot Last Activity Date"] || null,
        outlookCopilotLastActivityDate: r["Outlook Copilot Last Activity Date"] || null,
        oneNoteCopilotLastActivityDate: r["OneNote Copilot Last Activity Date"] || null,
        teamsCopilotLastActivityDate: r["Microsoft Teams Copilot Last Activity Date"] || null,
      }));
    }

    if (users.length === 0) return { reportType: "copilotUsageDetail", recordsCollected: 0 };

    const activeUsers = users.filter(u => u.lastActivityDate);
    const appsUsed: Record<string, number> = {};
    for (const u of users) {
      if (u.wordCopilotLastActivityDate) appsUsed["Word"] = (appsUsed["Word"] || 0) + 1;
      if (u.excelCopilotLastActivityDate) appsUsed["Excel"] = (appsUsed["Excel"] || 0) + 1;
      if (u.powerPointCopilotLastActivityDate) appsUsed["PowerPoint"] = (appsUsed["PowerPoint"] || 0) + 1;
      if (u.outlookCopilotLastActivityDate) appsUsed["Outlook"] = (appsUsed["Outlook"] || 0) + 1;
      if (u.oneNoteCopilotLastActivityDate) appsUsed["OneNote"] = (appsUsed["OneNote"] || 0) + 1;
      if (u.teamsCopilotLastActivityDate) appsUsed["Teams"] = (appsUsed["Teams"] || 0) + 1;
      if (u.copilotChatLastActivityDate) appsUsed["CopilotChat"] = (appsUsed["CopilotChat"] || 0) + 1;
    }

    await storage.createUsageReport({
      tenantId, reportType: "copilotUsageDetail", reportDate,
      data: { users, totalUsers: users.length, activeUsers: activeUsers.length, appsUsed },
    });
    return { reportType: "copilotUsageDetail", recordsCollected: users.length };
  } catch (err: any) {
    if (err.statusCode === 404 || err.code === "Request_ResourceNotFound") {
      console.log("[Graph Reports] Copilot usage detail not available — tenant may not have Copilot licenses");
      return { reportType: "copilotUsageDetail", recordsCollected: 0 };
    }
    console.log(`[Graph Reports] Copilot usage detail error: ${err.statusCode || ''} ${err.code || ''} ${err.message}`);
    return { reportType: "copilotUsageDetail", recordsCollected: 0, error: err.message };
  }
}

async function collectCopilotUserCounts(client: any, tenantId: string, azureTenantId?: string): Promise<ReportResult> {
  try {
    const { csv, json } = await fetchReport(client, "/reports/getMicrosoft365CopilotUserCountSummary(period='D7')", azureTenantId, true);
    console.log(`[Graph Reports] Copilot user counts: csv=${csv ? csv.length + ' chars' : 'null'}, json=${json ? json.length + ' items' : 'null'}`);
    if (!csv && !json) return { reportType: "copilotUserCounts", recordsCollected: 0, error: "Permission denied or not available" };

    let summary: any[] = [];
    let reportDate = new Date().toISOString().split("T")[0];

    if (json && json.length > 0) {
      reportDate = json[0].reportDate || json[0].reportRefreshDate || reportDate;
      summary = json.map(r => ({
        reportDate: r.reportDate,
        enabledUsers: r.enabledUsers || r.copilotEnabledUserCount || 0,
        activeUsers: r.activeUsers || r.copilotActiveUserCount || 0,
        app: r.copilotProduct || r.app || "All",
      }));
    } else if (csv) {
      const rows = parseCSV(csv);
      if (rows.length === 0) return { reportType: "copilotUserCounts", recordsCollected: 0 };
      reportDate = rows[0]["Report Date"] || rows[0]["Report Refresh Date"] || reportDate;
      summary = rows.map(r => ({
        reportDate: r["Report Date"],
        enabledUsers: parseInt(r["Enabled Users"] || r["Copilot Enabled User Count"] || "0"),
        activeUsers: parseInt(r["Active Users"] || r["Copilot Active User Count"] || "0"),
        app: r["Copilot Product"] || r["App"] || "All",
      }));
    }

    if (summary.length === 0) return { reportType: "copilotUserCounts", recordsCollected: 0 };

    await storage.createUsageReport({
      tenantId, reportType: "copilotUserCounts", reportDate,
      data: { summary },
    });
    return { reportType: "copilotUserCounts", recordsCollected: summary.length };
  } catch (err: any) {
    if (err.statusCode === 404 || err.code === "Request_ResourceNotFound") {
      console.log("[Graph Reports] Copilot user counts not available — tenant may not have Copilot licenses");
      return { reportType: "copilotUserCounts", recordsCollected: 0 };
    }
    return { reportType: "copilotUserCounts", recordsCollected: 0, error: err.message };
  }
}

async function collectCopilotUserCountTrend(client: any, tenantId: string, azureTenantId?: string): Promise<ReportResult> {
  try {
    const { csv, json } = await fetchReport(client, "/reports/getMicrosoft365CopilotUserCountTrend(period='D7')", azureTenantId, true);
    console.log(`[Graph Reports] Copilot user count trend: csv=${csv ? csv.length + ' chars' : 'null'}, json=${json ? json.length + ' items' : 'null'}`);
    if (!csv && !json) return { reportType: "copilotUserCountTrend", recordsCollected: 0, error: "Permission denied or not available" };

    let daily: any[] = [];
    let reportDate = new Date().toISOString().split("T")[0];

    if (json && json.length > 0) {
      reportDate = json[0].reportDate || json[0].reportRefreshDate || reportDate;
      daily = json.map(r => ({
        reportDate: r.reportDate,
        enabledUsers: r.enabledUsers || r.copilotEnabledUserCount || 0,
        activeUsers: r.activeUsers || r.copilotActiveUserCount || 0,
      }));
    } else if (csv) {
      const rows = parseCSV(csv);
      if (rows.length === 0) return { reportType: "copilotUserCountTrend", recordsCollected: 0 };
      reportDate = rows[0]["Report Date"] || rows[0]["Report Refresh Date"] || reportDate;
      daily = rows.map(r => ({
        reportDate: r["Report Date"],
        enabledUsers: parseInt(r["Enabled Users"] || r["Copilot Enabled User Count"] || "0"),
        activeUsers: parseInt(r["Active Users"] || r["Copilot Active User Count"] || "0"),
      }));
    }

    if (daily.length === 0) return { reportType: "copilotUserCountTrend", recordsCollected: 0 };

    await storage.createUsageReport({
      tenantId, reportType: "copilotUserCountTrend", reportDate,
      data: { daily },
    });
    return { reportType: "copilotUserCountTrend", recordsCollected: daily.length };
  } catch (err: any) {
    if (err.statusCode === 404 || err.code === "Request_ResourceNotFound") {
      console.log("[Graph Reports] Copilot user count trend not available — tenant may not have Copilot licenses");
      return { reportType: "copilotUserCountTrend", recordsCollected: 0 };
    }
    return { reportType: "copilotUserCountTrend", recordsCollected: 0, error: err.message };
  }
}

async function getGraphClientForTenant(tenantId: string): Promise<{ client: any; azureTenantId?: string }> {
  const tenant = await storage.getTenant(tenantId);
  if (isAzureAppConfigured() && tenant?.azureTenantId) {
    const client = await getAzureGraphClient(tenant.azureTenantId);
    return { client, azureTenantId: tenant.azureTenantId };
  }
  const client = await getUncachableSharePointClient();
  return { client };
}

export async function collectSharePointUsageReports(tenantId: string): Promise<{
  results: ReportResult[];
  totalCollected: number;
}> {
  const { client, azureTenantId } = await getGraphClientForTenant(tenantId);

  const results: ReportResult[] = [];
  const collectors = [
    () => collectSiteUsageDetail(client, tenantId, azureTenantId),
    () => collectSiteUsageSiteCounts(client, tenantId, azureTenantId),
    () => collectStorageUsage(client, tenantId, azureTenantId),
    () => collectFileActivity(client, tenantId, azureTenantId),
    () => collectActiveUsers(client, tenantId, azureTenantId),
    () => collectOneDriveUsageDetail(client, tenantId, azureTenantId),
    () => collectOneDriveActivityDetail(client, tenantId, azureTenantId),
    () => collectOneDriveStorageUsage(client, tenantId, azureTenantId),
    () => collectM365AppUsage(client, tenantId, azureTenantId),
    () => collectTeamsActivity(client, tenantId, azureTenantId),
    () => collectEmailActivity(client, tenantId, azureTenantId),
    () => collectCopilotUsageDetail(client, tenantId, azureTenantId),
    () => collectCopilotUserCounts(client, tenantId, azureTenantId),
    () => collectCopilotUserCountTrend(client, tenantId, azureTenantId),
  ];

  for (const collector of collectors) {
    const result = await collector();
    results.push(result);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  const totalCollected = results.reduce((sum, r) => sum + r.recordsCollected, 0);
  return { results, totalCollected };
}
