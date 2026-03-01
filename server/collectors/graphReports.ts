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

async function fetchReport(client: any, endpoint: string): Promise<string | null> {
  try {
    const response = await client.api(endpoint).get();
    if (typeof response === "string") return response;
    if (response && typeof response === "object" && response.value) {
      return JSON.stringify(response.value);
    }
    return typeof response === "string" ? response : JSON.stringify(response);
  } catch (err: any) {
    if (err.statusCode === 403 || err.code === "Authorization_RequestDenied") {
      console.warn(`[Graph Reports] Permission denied for ${endpoint} - requires Reports.Read.All`);
      return null;
    }
    throw err;
  }
}

async function collectSiteUsageDetail(client: any, tenantId: string): Promise<ReportResult> {
  try {
    const csvData = await fetchReport(client, "/reports/getSharePointSiteUsageDetail(period='D7')");
    if (!csvData) return { reportType: "siteUsageDetail", recordsCollected: 0, error: "Permission denied" };

    const rows = parseCSV(csvData);
    if (rows.length === 0) return { reportType: "siteUsageDetail", recordsCollected: 0 };

    const reportDate = rows[0]["Report Refresh Date"] || new Date().toISOString().split("T")[0];

    await storage.createUsageReport({
      tenantId,
      reportType: "siteUsageDetail",
      reportDate,
      data: {
        sites: rows.map(r => ({
          siteUrl: r["Site URL"],
          owner: r["Owner Display Name"],
          storageUsedBytes: parseInt(r["Storage Used (Byte)"] || "0"),
          storageAllocatedBytes: parseInt(r["Storage Allocated (Byte)"] || "0"),
          fileCount: parseInt(r["File Count"] || "0"),
          activeFileCount: parseInt(r["Active File Count"] || "0"),
          pageViewCount: parseInt(r["Page View Count"] || "0"),
          visitedPageCount: parseInt(r["Visited Page Count"] || "0"),
          lastActivityDate: r["Last Activity Date"],
        })),
        totalSites: rows.length,
      },
    });

    return { reportType: "siteUsageDetail", recordsCollected: rows.length };
  } catch (err: any) {
    return { reportType: "siteUsageDetail", recordsCollected: 0, error: err.message };
  }
}

async function collectSiteUsageSiteCounts(client: any, tenantId: string): Promise<ReportResult> {
  try {
    const csvData = await fetchReport(client, "/reports/getSharePointSiteUsageSiteCounts(period='D7')");
    if (!csvData) return { reportType: "siteUsageCounts", recordsCollected: 0, error: "Permission denied" };

    const rows = parseCSV(csvData);
    if (rows.length === 0) return { reportType: "siteUsageCounts", recordsCollected: 0 };

    await storage.createUsageReport({
      tenantId,
      reportType: "siteUsageCounts",
      reportDate: rows[0]["Report Date"] || new Date().toISOString().split("T")[0],
      data: {
        daily: rows.map(r => ({
          reportDate: r["Report Date"],
          total: parseInt(r["Total"] || "0"),
          active: parseInt(r["Active"] || "0"),
        })),
      },
    });

    return { reportType: "siteUsageCounts", recordsCollected: rows.length };
  } catch (err: any) {
    return { reportType: "siteUsageCounts", recordsCollected: 0, error: err.message };
  }
}

async function collectStorageUsage(client: any, tenantId: string): Promise<ReportResult> {
  try {
    const csvData = await fetchReport(client, "/reports/getSharePointSiteUsageStorage(period='D7')");
    if (!csvData) return { reportType: "storageUsage", recordsCollected: 0, error: "Permission denied" };

    const rows = parseCSV(csvData);
    if (rows.length === 0) return { reportType: "storageUsage", recordsCollected: 0 };

    await storage.createUsageReport({
      tenantId,
      reportType: "storageUsage",
      reportDate: rows[0]["Report Date"] || new Date().toISOString().split("T")[0],
      data: {
        daily: rows.map(r => ({
          reportDate: r["Report Date"],
          storageUsedBytes: parseInt(r["Storage Used (Byte)"] || "0"),
        })),
      },
    });

    return { reportType: "storageUsage", recordsCollected: rows.length };
  } catch (err: any) {
    return { reportType: "storageUsage", recordsCollected: 0, error: err.message };
  }
}

async function collectFileActivity(client: any, tenantId: string): Promise<ReportResult> {
  try {
    const csvData = await fetchReport(client, "/reports/getSharePointSiteUsageFileCounts(period='D7')");
    if (!csvData) return { reportType: "fileActivity", recordsCollected: 0, error: "Permission denied" };

    const rows = parseCSV(csvData);
    if (rows.length === 0) return { reportType: "fileActivity", recordsCollected: 0 };

    await storage.createUsageReport({
      tenantId,
      reportType: "fileActivity",
      reportDate: rows[0]["Report Date"] || new Date().toISOString().split("T")[0],
      data: {
        daily: rows.map(r => ({
          reportDate: r["Report Date"],
          total: parseInt(r["Total"] || "0"),
          active: parseInt(r["Active"] || "0"),
        })),
      },
    });

    return { reportType: "fileActivity", recordsCollected: rows.length };
  } catch (err: any) {
    return { reportType: "fileActivity", recordsCollected: 0, error: err.message };
  }
}

async function collectActiveUsers(client: any, tenantId: string): Promise<ReportResult> {
  try {
    const csvData = await fetchReport(client, "/reports/getSharePointActivityUserDetail(period='D7')");
    if (!csvData) return { reportType: "activeUsers", recordsCollected: 0, error: "Permission denied" };

    const rows = parseCSV(csvData);
    if (rows.length === 0) return { reportType: "activeUsers", recordsCollected: 0 };

    await storage.createUsageReport({
      tenantId,
      reportType: "activeUsers",
      reportDate: rows[0]["Report Refresh Date"] || new Date().toISOString().split("T")[0],
      data: {
        users: rows.map(r => ({
          userPrincipal: r["User Principal Name"],
          lastActivityDate: r["Last Activity Date"],
          viewedOrEdited: parseInt(r["Viewed Or Edited File Count"] || "0"),
          syncedFileCount: parseInt(r["Synced File Count"] || "0"),
          sharedInternallyCount: parseInt(r["Shared Internally File Count"] || "0"),
          sharedExternallyCount: parseInt(r["Shared Externally File Count"] || "0"),
          visitedPageCount: parseInt(r["Visited Page Count"] || "0"),
        })),
        totalActiveUsers: rows.length,
      },
    });

    return { reportType: "activeUsers", recordsCollected: rows.length };
  } catch (err: any) {
    return { reportType: "activeUsers", recordsCollected: 0, error: err.message };
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
  ];

  for (const collector of collectors) {
    const result = await collector();
    results.push(result);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  const totalCollected = results.reduce((sum, r) => sum + r.recordsCollected, 0);
  return { results, totalCollected };
}
