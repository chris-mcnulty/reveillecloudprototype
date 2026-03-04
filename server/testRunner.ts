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

const regionCache = new Map<string, string>();

async function detectTenantRegion(azureTenantId: string): Promise<string> {
  if (regionCache.has(azureTenantId)) return regionCache.get(azureTenantId)!;

  try {
    const client = await getAzureGraphClient(azureTenantId);
    const org = await client.api("/organization").select("id,countryLetterCode").get();
    const country = org.value?.[0]?.countryLetterCode || "";

    let region = "US";
    const eurCountries = ["DE", "FR", "IT", "ES", "NL", "BE", "AT", "CH", "SE", "NO", "DK", "FI", "PL", "PT", "IE", "CZ", "RO", "HU", "BG", "HR", "SK", "SI", "LT", "LV", "EE"];
    const apcCountries = ["SG", "HK", "TW", "KR", "TH", "MY", "PH", "ID", "VN"];
    if (country === "GB" || country === "UK") region = "GBR";
    else if (country === "AU" || country === "NZ") region = "AUS";
    else if (country === "JP") region = "JPN";
    else if (country === "IN") region = "IND";
    else if (country === "CA") region = "CAN";
    else if (eurCountries.includes(country)) region = "EUR";
    else if (apcCountries.includes(country)) region = "APC";
    else if (country === "US") region = "US";

    regionCache.set(azureTenantId, region);
    return region;
  } catch (err) {
    console.warn(`[TestRunner] Could not detect region for tenant ${azureTenantId}, defaulting to US`);
    regionCache.set(azureTenantId, "US");
    return "US";
  }
}

async function retryOnTransient<T>(fn: () => Promise<T>, retries = 1, delayMs = 2000): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const status = err.statusCode || err.code || 0;
      const msg = (err.message || "").toLowerCase();
      const isTransient = status === 503 || status === 504 || status === 429
        || msg.includes("service unavailable") || msg.includes("gateway timeout")
        || msg.includes("too many requests");

      if (isTransient && attempt < retries) {
        const wait = delayMs * Math.pow(2, attempt) + Math.random() * 1000;
        console.log(`[TestRunner] Transient error (attempt ${attempt + 1}/${retries + 1}): ${err.message}. Retrying in ${Math.round(wait)}ms...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Retry exhausted");
}

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
  const phases: Record<string, number> = {};
  let failedPhase = "";
  try {
    const { client, authMethod } = await getGraphClientForTest(test);
    phases.authMethod = 0;

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

    failedPhase = "driveResolve";
    let driveId: string;
    try {
      let site: any;
      if (hostname && siteName) {
        site = await retryOnTransient(() => client.api(`/sites/${hostname}:/sites/${siteName}`).get());
      } else if (siteName) {
        site = await retryOnTransient(() => client.api(`/sites/root:/sites/${siteName}`).get());
      } else if (hostname) {
        site = await retryOnTransient(() => client.api(`/sites/${hostname}`).get());
      } else {
        site = await retryOnTransient(() => client.api('/sites/root').get());
      }
      const drives = await retryOnTransient(() => client.api(`/sites/${site.id}/drives`).get());
      if (!drives.value?.length) throw new Error(`No document libraries found on site "${siteName || "root"}"`);
      driveId = drives.value[0].id;
    } catch (siteErr: any) {
      if (siteErr.message?.includes("No document libraries")) throw siteErr;
      const rootSite = await retryOnTransient(() => client.api('/sites/root').get());
      const drives = await retryOnTransient(() => client.api(`/sites/${rootSite.id}/drives`).get());
      if (!drives.value?.length) throw new Error("No document libraries found on root site");
      driveId = drives.value[0].id;
    }
    phases.driveResolveMs = Date.now() - driveStart;
    failedPhase = "upload";

    const uploadStart = Date.now();
    await retryOnTransient(() => client.api(`/drives/${driveId}/root:/${folderPath}/${fileName}:/content`)
      .put(testContent));
    phases.uploadMs = Date.now() - uploadStart;
    failedPhase = "download";

    await new Promise(r => setTimeout(r, 500));

    const downloadStart = Date.now();
    const downloadedContent = await retryOnTransient(() => client.api(`/drives/${driveId}/root:/${folderPath}/${fileName}:/content`)
      .get());
    phases.downloadMs = Date.now() - downloadStart;
    failedPhase = "cleanup";

    const deleteStart = Date.now();
    try {
      await client.api(`/drives/${driveId}/root:/${folderPath}/${fileName}`)
        .delete();
    } catch {}
    phases.cleanupMs = Date.now() - deleteStart;

    const totalDuration = Date.now() - start;

    return {
      status: totalDuration > (test.timeout || 30) * 1000 ? "failed" : "success",
      durationMs: totalDuration,
      metrics: {
        ...phases,
        totalMs: totalDuration,
        fileSize: testContent.length,
        authMethod,
      },
    };
  } catch (err: any) {
    const totalDuration = Date.now() - start;
    return {
      status: "error",
      durationMs: totalDuration,
      metrics: {
        ...phases,
        totalMs: totalDuration,
        failedPhase,
      },
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

    const tenant = await storage.getTenant(test.tenantId);
    let region = tenant?.azureTenantId ? await detectTenantRegion(tenant.azureTenantId) : "NAM";

    const buildSearchBody = (r: string) => ({
      requests: [
        {
          entityTypes: ["site", "driveItem", "listItem"],
          query: { queryString: query },
          from: 0,
          size: 10,
          region: r,
        },
      ],
    });

    const searchStart = Date.now();
    let searchResult: any;
    try {
      searchResult = await client.api("/search/query").post(buildSearchBody(region));
    } catch (regionErr: any) {
      const errMsg = regionErr.message || "";
      const validMatch = errMsg.match(/Only valid regions? (?:are|is) (.+?)\.?$/i);
      if (validMatch) {
        const validRegion = validMatch[1].trim().split(/[,\s]+/)[0];
        if (validRegion && validRegion !== region) {
          console.log(`[TestRunner] Region "${region}" invalid, retrying with "${validRegion}"`);
          if (tenant?.azureTenantId) regionCache.set(tenant.azureTenantId, validRegion);
          region = validRegion;
          searchResult = await client.api("/search/query").post(buildSearchBody(region));
        } else {
          throw regionErr;
        }
      } else {
        throw regionErr;
      }
    }
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
    const duration = Date.now() - run.startedAt.getTime();
    const failedRun = await storage.updateTestRun(run.id, {
      status: "error",
      completedAt: new Date(),
      durationMs: duration,
      error: err.message || String(err),
    });
    try {
      await storage.createMetric({
        tenantId: test.tenantId,
        testId: test.id,
        metricName: test.type.toLowerCase().replace(/\s/g, "_"),
        value: duration,
        unit: "ms",
        site: test.target,
        status: "Failed",
      });
    } catch {}
    return failedRun;
  }
}

export { isSharePointConnected };
