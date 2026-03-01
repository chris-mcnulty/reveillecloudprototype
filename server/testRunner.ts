import { getUncachableSharePointClient, isSharePointConnected } from "./sharepoint";
import { getAzureGraphClient, isAzureAppConfigured, getClientCredentialsToken } from "./azureAuth";
import { storage } from "./storage";
import type { SyntheticTest } from "@shared/schema";

export interface TestResult {
  status: "success" | "failed" | "error";
  durationMs: number;
  metrics: Record<string, any>;
  error?: string;
}

type AuthMethod = "app" | "delegated";

async function getGraphClientForTest(test: SyntheticTest): Promise<{ client: any; authMethod: AuthMethod }> {
  const tenant = await storage.getTenant(test.tenantId);

  if (isAzureAppConfigured() && tenant?.azureTenantId && tenant.consentStatus === "Connected") {
    const client = await getAzureGraphClient(tenant.azureTenantId);
    return { client, authMethod: "app" };
  }

  const connected = await isSharePointConnected();
  if (connected) {
    const client = await getUncachableSharePointClient();
    return { client, authMethod: "delegated" };
  }

  throw new Error("No authentication available — configure Azure AD app consent or connect the SharePoint integration");
}

async function runPageLoadTest(test: SyntheticTest): Promise<TestResult> {
  const start = Date.now();
  try {
    const { client, authMethod } = await getGraphClientForTest(test);
    const siteUrl = new URL(test.target);
    const hostname = siteUrl.hostname;
    const sitePath = siteUrl.pathname === "/" ? "" : siteUrl.pathname;

    const graphStart = Date.now();
    let siteInfo: any;

    if (sitePath && sitePath !== "/") {
      siteInfo = await client.api(`/sites/${hostname}:${sitePath}`).get();
    } else {
      siteInfo = await client.api(`/sites/${hostname}`).get();
    }
    const graphEnd = Date.now();
    const graphLatency = graphEnd - graphStart;

    const listsStart = Date.now();
    const lists = await client.api(`/sites/${siteInfo.id}/lists`).top(5).get();
    const listsEnd = Date.now();
    const listsLatency = listsEnd - listsStart;

    const totalDuration = Date.now() - start;

    return {
      status: totalDuration > (test.timeout || 30) * 1000 ? "failed" : "success",
      durationMs: totalDuration,
      metrics: {
        siteResolutionMs: graphLatency,
        listsEnumerationMs: listsLatency,
        totalMs: totalDuration,
        siteName: siteInfo.displayName,
        siteId: siteInfo.id,
        listsCount: lists.value?.length || 0,
        authMethod,
      },
    };
  } catch (err: any) {
    return {
      status: "error",
      durationMs: Date.now() - start,
      metrics: {},
      error: err.message || String(err),
    };
  }
}

async function runFileTransferTest(test: SyntheticTest): Promise<TestResult> {
  const start = Date.now();
  try {
    const { client, authMethod } = await getGraphClientForTest(test);

    const testContent = `Reveille Cloud synthetic test - ${new Date().toISOString()}`;
    const fileName = `reveille-test-${Date.now()}.txt`;

    const driveStart = Date.now();
    let targetPath: string;
    let hostname: string | null = null;
    try {
      const parsed = new URL(test.target);
      hostname = parsed.hostname;
      targetPath = parsed.pathname;
    } catch {
      targetPath = test.target.startsWith("/") ? test.target : `/${test.target}`;
    }

    const parts = targetPath.split("/").filter(Boolean);
    const decodedParts = parts.map(p => decodeURIComponent(p));
    const siteIndex = decodedParts.indexOf("sites");
    const siteName = siteIndex >= 0 && decodedParts[siteIndex + 1] ? decodedParts[siteIndex + 1] : null;
    const folderPath = siteIndex >= 0 ? decodedParts.slice(siteIndex + 2).join("/") || "General" : decodedParts.join("/") || "General";

    let driveId: string;
    try {
      let site: any;
      if (hostname && siteName) {
        site = await client.api(`/sites/${hostname}:/sites/${siteName}`).get();
      } else if (siteName) {
        site = await client.api(`/sites/root:/sites/${siteName}`).get();
      } else if (hostname) {
        site = await client.api(`/sites/${hostname}`).get();
      } else {
        site = await client.api('/sites/root').get();
      }
      const drives = await client.api(`/sites/${site.id}/drives`).get();
      if (!drives.value?.length) throw new Error(`No document libraries found on site "${siteName || "root"}"`);
      driveId = drives.value[0].id;
    } catch (siteErr: any) {
      if (siteErr.message?.includes("No document libraries")) throw siteErr;
      const rootSite = await client.api('/sites/root').get();
      const drives = await client.api(`/sites/${rootSite.id}/drives`).get();
      if (!drives.value?.length) throw new Error("No document libraries found on root site");
      driveId = drives.value[0].id;
    }
    const driveResolveMs = Date.now() - driveStart;

    const uploadStart = Date.now();
    await client.api(`/drives/${driveId}/root:/${folderPath}/${fileName}:/content`)
      .put(testContent);
    const uploadMs = Date.now() - uploadStart;

    const downloadStart = Date.now();
    const downloadedContent = await client.api(`/drives/${driveId}/root:/${folderPath}/${fileName}:/content`)
      .get();
    const downloadMs = Date.now() - downloadStart;

    const deleteStart = Date.now();
    try {
      await client.api(`/drives/${driveId}/root:/${folderPath}/${fileName}`)
        .delete();
    } catch {}
    const deleteMs = Date.now() - deleteStart;

    const totalDuration = Date.now() - start;

    return {
      status: totalDuration > (test.timeout || 30) * 1000 ? "failed" : "success",
      durationMs: totalDuration,
      metrics: {
        driveResolveMs,
        uploadMs,
        downloadMs,
        cleanupMs: deleteMs,
        totalMs: totalDuration,
        fileSize: testContent.length,
        authMethod,
      },
    };
  } catch (err: any) {
    return {
      status: "error",
      durationMs: Date.now() - start,
      metrics: {},
      error: err.message || String(err),
    };
  }
}

async function runSearchTest(test: SyntheticTest): Promise<TestResult> {
  const start = Date.now();
  try {
    const { client, authMethod } = await getGraphClientForTest(test);

    let query = test.target;
    if (query.startsWith("query=")) {
      query = query.replace(/^query=['"]?/, "").replace(/['"]$/, "");
    }

    const searchStart = Date.now();
    const searchResult = await client.api("/search/query").post({
      requests: [
        {
          entityTypes: ["site", "driveItem", "listItem"],
          query: { queryString: query },
          from: 0,
          size: 10,
        },
      ],
    });
    const searchMs = Date.now() - searchStart;
    const totalDuration = Date.now() - start;

    const hitsContainer = searchResult.value?.[0]?.hitsContainers?.[0];
    const totalHits = hitsContainer?.total || 0;
    const returnedHits = hitsContainer?.hits?.length || 0;

    return {
      status: totalDuration > (test.timeout || 30) * 1000 ? "failed" : "success",
      durationMs: totalDuration,
      metrics: {
        searchLatencyMs: searchMs,
        totalMs: totalDuration,
        totalResults: totalHits,
        returnedResults: returnedHits,
        query,
        authMethod,
      },
    };
  } catch (err: any) {
    return {
      status: "error",
      durationMs: Date.now() - start,
      metrics: {},
      error: err.message || String(err),
    };
  }
}

async function runAuthTest(test: SyntheticTest): Promise<TestResult> {
  const start = Date.now();
  try {
    const tenant = await storage.getTenant(test.tenantId);
    const useAppAuth = isAzureAppConfigured() && tenant?.azureTenantId && tenant.consentStatus === "Connected";

    if (useAppAuth) {
      const tokenStart = Date.now();
      const token = await getClientCredentialsToken(tenant!.azureTenantId!);
      const tokenMs = Date.now() - tokenStart;

      const client = await getAzureGraphClient(tenant!.azureTenantId!);

      const orgStart = Date.now();
      const org = await client.api("/organization").get();
      const orgMs = Date.now() - orgStart;

      const totalDuration = Date.now() - start;

      return {
        status: totalDuration > (test.timeout || 30) * 1000 ? "failed" : "success",
        durationMs: totalDuration,
        metrics: {
          tokenAcquisitionMs: tokenMs,
          profileFetchMs: orgMs,
          totalMs: totalDuration,
          tenantDisplayName: org.value?.[0]?.displayName || "Unknown",
          tenantId: org.value?.[0]?.id || tenant!.azureTenantId,
          authMethod: "app",
        },
      };
    }

    const connected = await isSharePointConnected();
    if (!connected) {
      throw new Error("No authentication available — configure Azure AD app consent or connect the SharePoint integration");
    }

    const tokenStart = Date.now();
    const client = await getUncachableSharePointClient();
    const tokenMs = Date.now() - tokenStart;

    const profileStart = Date.now();
    const me = await client.api("/me").get();
    const profileMs = Date.now() - profileStart;

    const totalDuration = Date.now() - start;

    return {
      status: totalDuration > (test.timeout || 30) * 1000 ? "failed" : "success",
      durationMs: totalDuration,
      metrics: {
        tokenAcquisitionMs: tokenMs,
        profileFetchMs: profileMs,
        totalMs: totalDuration,
        userPrincipal: me.userPrincipalName,
        displayName: me.displayName,
        authMethod: "delegated",
      },
    };
  } catch (err: any) {
    return {
      status: "error",
      durationMs: Date.now() - start,
      metrics: {},
      error: err.message || String(err),
    };
  }
}

export async function executeTest(test: SyntheticTest): Promise<TestResult> {
  const tenant = await storage.getTenant(test.tenantId);
  const hasAzureAuth = isAzureAppConfigured() && tenant?.azureTenantId && tenant.consentStatus === "Connected";
  const hasConnector = await isSharePointConnected();

  if (!hasAzureAuth && !hasConnector) {
    return {
      status: "error",
      durationMs: 0,
      metrics: {},
      error: "No authentication available — configure Azure AD app consent or connect the SharePoint integration",
    };
  }

  switch (test.type) {
    case "Page Load":
      return runPageLoadTest(test);
    case "File Transfer":
      return runFileTransferTest(test);
    case "Search":
      return runSearchTest(test);
    case "Authentication":
      return runAuthTest(test);
    default:
      return {
        status: "error",
        durationMs: 0,
        metrics: {},
        error: `Unknown test type: ${test.type}`,
      };
  }
}

export async function runTestAndRecord(testId: string): Promise<any> {
  const test = await storage.getSyntheticTest(testId);
  if (!test) throw new Error("Test not found");

  const run = await storage.createTestRun({
    testId: test.id,
    tenantId: test.tenantId,
    status: "running",
    startedAt: new Date(),
  });

  try {
    const result = await executeTest(test);

    const completedRun = await storage.updateTestRun(run.id, {
      status: result.status,
      completedAt: new Date(),
      durationMs: result.durationMs,
      results: result.metrics,
      error: result.error || null,
    });

    await storage.createMetric({
      tenantId: test.tenantId,
      testId: test.id,
      metricName: test.type.toLowerCase().replace(/\s/g, "_"),
      value: result.durationMs,
      unit: "ms",
      site: test.target,
      status: result.status === "success" ? "Success" : "Failed",
    });

    return completedRun;
  } catch (err: any) {
    const failedRun = await storage.updateTestRun(run.id, {
      status: "error",
      completedAt: new Date(),
      durationMs: Date.now() - run.startedAt.getTime(),
      error: err.message || String(err),
    });
    return failedRun;
  }
}

export { isSharePointConnected };
