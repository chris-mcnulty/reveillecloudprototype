import { storage } from "./storage";
import { runTestAndRecord, isSharePointConnected } from "./testRunner";
import { collectSharePointUsageReports } from "./collectors/graphReports";
import { collectServiceHealthIncidents } from "./collectors/serviceHealth";
import { collectAuditLogs } from "./collectors/auditLogs";
import { collectSiteStructure } from "./collectors/siteStructure";
import { isAzureAppConfigured } from "./azureAuth";
import type { SyntheticTest } from "@shared/schema";

interface JobStatus {
  lastRun: Date | null;
  isRunning: boolean;
  nextRun: Date | null;
  abortController: AbortController | null;
  activeJobRunId: string | null;
}

const jobStatus: Record<string, JobStatus> = {
  syntheticTests: { lastRun: null, isRunning: false, nextRun: null, abortController: null, activeJobRunId: null },
  graphReports: { lastRun: null, isRunning: false, nextRun: null, abortController: null, activeJobRunId: null },
  serviceHealth: { lastRun: null, isRunning: false, nextRun: null, abortController: null, activeJobRunId: null },
  auditLogs: { lastRun: null, isRunning: false, nextRun: null, abortController: null, activeJobRunId: null },
  siteStructure: { lastRun: null, isRunning: false, nextRun: null, abortController: null, activeJobRunId: null },
};

function parseIntervalMs(interval: string): number {
  const normalized = interval.trim().toLowerCase();

  const match = normalized.match(/^(\d+)\s*(min|minute|minutes|m|hr|hour|hours|h|s|sec|seconds)$/);
  if (match) {
    const value = parseInt(match[1], 10);
    const unit = match[2];
    if (unit.startsWith("h")) return value * 60 * 60 * 1000;
    if (unit === "s" || unit.startsWith("sec")) return value * 1000;
    return value * 60 * 1000;
  }

  const spacedMatch = normalized.match(/^(\d+)\s+(min|m|hr|h|s)$/);
  if (spacedMatch) {
    const value = parseInt(spacedMatch[1], 10);
    const unit = spacedMatch[2];
    if (unit === "h" || unit === "hr") return value * 60 * 60 * 1000;
    if (unit === "s") return value * 1000;
    return value * 60 * 1000;
  }

  if (normalized === "daily") return 24 * 60 * 60 * 1000;
  if (normalized === "hourly") return 60 * 60 * 1000;
  if (normalized === "weekly") return 7 * 24 * 60 * 60 * 1000;

  console.warn(`[Scheduler] Unrecognized interval "${interval}", defaulting to 5 minutes`);
  return 5 * 60 * 1000;
}

async function trackJobStart(
  jobType: string,
  tenantId?: string,
  testId?: string,
  testName?: string
): Promise<string> {
  try {
    const jobRun = await storage.createScheduledJobRun({
      jobType,
      tenantId: tenantId || null,
      testId: testId || null,
      testName: testName || null,
      status: "running",
      startedAt: new Date(),
    });
    return jobRun.id;
  } catch (error) {
    console.error(`[Scheduler] Failed to track job start:`, error);
    return "";
  }
}

async function trackJobComplete(
  jobRunId: string,
  status: "completed" | "failed" | "cancelled",
  result?: Record<string, any>,
  errorMessage?: string
): Promise<void> {
  if (!jobRunId) return;
  try {
    await storage.updateScheduledJobRun(jobRunId, {
      status,
      completedAt: new Date(),
      result: result || null,
      errorMessage: errorMessage || null,
    });
  } catch (error) {
    console.error(`[Scheduler] Failed to track job completion:`, error);
  }
}

async function cleanupStuckJobs(): Promise<void> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const stuckJobs = await storage.getRunningJobs();

  const jobsToFail = stuckJobs.filter(job => {
    if (!job.startedAt) return true;
    return new Date(job.startedAt) < oneHourAgo;
  });

  if (jobsToFail.length > 0) {
    console.log(`[Scheduler] Cleaning up ${jobsToFail.length} stuck job(s)...`);
    for (const job of jobsToFail) {
      try {
        await storage.updateScheduledJobRun(job.id, {
          status: "failed",
          completedAt: new Date(),
          result: { error: "Job timed out - automatically marked as failed" },
          errorMessage: "Job timed out after 1 hour",
        });

        for (const [key, status] of Object.entries(jobStatus)) {
          if (status.activeJobRunId === job.id) {
            if (status.abortController) {
              status.abortController.abort();
              status.abortController = null;
            }
            status.isRunning = false;
            status.activeJobRunId = null;
            console.log(`[Scheduler] Also reset in-memory state for ${key}`);
          }
        }

        console.log(`[Scheduler] Marked stuck job ${job.id} (${job.jobType}) as failed`);
      } catch (error) {
        console.error(`[Scheduler] Failed to clean up stuck job ${job.id}:`, error);
      }
    }
  }
}

async function isTestDue(test: SyntheticTest): Promise<boolean> {
  const intervalMs = parseIntervalMs(test.interval);
  const latestRun = await storage.getLatestJobRunForTest(test.id);

  if (!latestRun) return true;

  const referenceTime = latestRun.completedAt || latestRun.startedAt;
  if (!referenceTime) return true;

  const elapsed = Date.now() - new Date(referenceTime).getTime();
  return elapsed >= intervalMs;
}

async function runSyntheticTestsJob(): Promise<void> {
  if (jobStatus.syntheticTests.isRunning) {
    console.log("[Scheduler] Synthetic tests already running, skipping...");
    return;
  }

  const connected = await isSharePointConnected();
  if (!connected) {
    console.log("[Scheduler] SharePoint not connected, skipping scheduled tests");
    return;
  }

  const abortController = new AbortController();
  jobStatus.syntheticTests.abortController = abortController;
  jobStatus.syntheticTests.isRunning = true;
  console.log("[Scheduler] Starting synthetic test sweep...");

  try {
    const allTenants = await storage.getTenants();

    let testsRun = 0;
    let testsSkipped = 0;
    let testsFailed = 0;

    for (const tenant of allTenants) {
      if (abortController.signal.aborted) {
        console.log("[Scheduler] Job was cancelled");
        break;
      }

      if (tenant.consentStatus !== "Connected") continue;

      const tests = await storage.getSyntheticTests(tenant.id);
      const activeTests = tests.filter(t => t.status === "Active");

      for (const test of activeTests) {
        if (abortController.signal.aborted) break;

        const due = await isTestDue(test);
        if (!due) {
          testsSkipped++;
          continue;
        }

        console.log(`[Scheduler] Running ${test.type} test "${test.name}" for tenant ${tenant.name}`);

        const jobRunId = await trackJobStart("syntheticTest", tenant.id, test.id, test.name);
        jobStatus.syntheticTests.activeJobRunId = jobRunId;

        try {
          const run = await runTestAndRecord(test.id);

          await trackJobComplete(jobRunId, run.status === "error" ? "failed" : "completed", {
            testRunId: run.id,
            durationMs: run.durationMs,
            status: run.status,
          }, run.error || undefined);

          if (run.status === "error") {
            testsFailed++;
          } else {
            testsRun++;
          }
        } catch (err: any) {
          await trackJobComplete(jobRunId, "failed", undefined, err.message || String(err));
          testsFailed++;
          console.error(`[Scheduler] Test "${test.name}" failed:`, err.message);
        }

        const jitter = 1000 + Math.random() * 2000;
        await new Promise(resolve => setTimeout(resolve, jitter));
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`[Scheduler] Sweep complete: ${testsRun} run, ${testsSkipped} skipped (not due), ${testsFailed} failed`);
  } catch (error) {
    console.error("[Scheduler] Synthetic test job failed:", error);
  } finally {
    jobStatus.syntheticTests.isRunning = false;
    jobStatus.syntheticTests.abortController = null;
    jobStatus.syntheticTests.activeJobRunId = null;
    jobStatus.syntheticTests.lastRun = new Date();
  }
}

async function runGraphReportsJob(): Promise<void> {
  if (jobStatus.graphReports.isRunning) {
    console.log("[Scheduler] Graph reports already running, skipping...");
    return;
  }

  const connected = await isSharePointConnected();
  if (!connected) {
    console.log("[Scheduler] SharePoint not connected, skipping graph reports");
    return;
  }

  jobStatus.graphReports.isRunning = true;
  console.log("[Scheduler] Starting Graph usage reports collection...");

  try {
    const allTenants = await storage.getTenants();
    const consentedTenants = allTenants.filter(t => t.consentStatus === "Connected");
    const azureConfigured = isAzureAppConfigured();

    for (const tenant of consentedTenants) {
      const hasAzureAuth = azureConfigured && tenant.azureTenantId;
      if (!hasAzureAuth) {
        continue;
      }

      const jobRunId = await trackJobStart("graphReports", tenant.id, undefined, `Usage reports for ${tenant.name}`);
      jobStatus.graphReports.activeJobRunId = jobRunId;

      try {
        const result = await collectSharePointUsageReports(tenant.id);
        const allFailed = result.results.every(r => r.error);
        const hasErrors = result.results.some(r => r.error);
        const status = allFailed ? "failed" : hasErrors ? "completed" : "completed";
        await trackJobComplete(jobRunId, status, {
          totalCollected: result.totalCollected,
          reports: result.results.map(r => ({ type: r.reportType, records: r.recordsCollected, error: r.error })),
        }, allFailed ? result.results.map(r => r.error).filter(Boolean).join("; ") : undefined);
        console.log(`[Scheduler] Graph reports for ${tenant.name}: ${result.totalCollected} records collected${allFailed ? " (all failed)" : ""}`);
      } catch (err: any) {
        await trackJobComplete(jobRunId, "failed", undefined, err.message);
        console.error(`[Scheduler] Graph reports failed for ${tenant.name}:`, err.message);
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } catch (error) {
    console.error("[Scheduler] Graph reports job failed:", error);
  } finally {
    jobStatus.graphReports.isRunning = false;
    jobStatus.graphReports.activeJobRunId = null;
    jobStatus.graphReports.lastRun = new Date();
  }
}

async function runServiceHealthJob(): Promise<void> {
  if (jobStatus.serviceHealth.isRunning) {
    console.log("[Scheduler] Service health already running, skipping...");
    return;
  }

  const connected = await isSharePointConnected();
  if (!connected) {
    console.log("[Scheduler] SharePoint not connected, skipping service health check");
    return;
  }

  jobStatus.serviceHealth.isRunning = true;

  const jobRunId = await trackJobStart("serviceHealth", undefined, undefined, "M365 Service Health check");
  jobStatus.serviceHealth.activeJobRunId = jobRunId;

  try {
    const result = await collectServiceHealthIncidents();
    await trackJobComplete(
      jobRunId,
      result.error ? "failed" : "completed",
      {
        incidentsProcessed: result.incidentsProcessed,
        newIncidents: result.newIncidents,
        updatedIncidents: result.updatedIncidents,
        alertsCreated: result.alertsCreated,
      },
      result.error,
    );

    if (result.incidentsProcessed > 0 || result.error) {
      console.log(`[Scheduler] Service health: ${result.incidentsProcessed} incidents processed, ${result.newIncidents} new, ${result.alertsCreated} alerts created${result.error ? ` (error: ${result.error})` : ""}`);
    }
  } catch (err: any) {
    await trackJobComplete(jobRunId, "failed", undefined, err.message);
    console.error("[Scheduler] Service health job failed:", err.message);
  } finally {
    jobStatus.serviceHealth.isRunning = false;
    jobStatus.serviceHealth.activeJobRunId = null;
    jobStatus.serviceHealth.lastRun = new Date();
  }
}

async function runAuditLogsJob(): Promise<void> {
  if (jobStatus.auditLogs.isRunning) {
    console.log("[Scheduler] Audit logs already running, skipping...");
    return;
  }

  const connected = await isSharePointConnected();
  if (!connected) {
    console.log("[Scheduler] SharePoint not connected, skipping audit log collection");
    return;
  }

  jobStatus.auditLogs.isRunning = true;
  console.log("[Scheduler] Starting audit log collection...");

  try {
    const allTenants = await storage.getTenants();
    const consentedTenants = allTenants.filter(t => t.consentStatus === "Connected");
    const azureConfigured = isAzureAppConfigured();

    for (const tenant of consentedTenants) {
      const hasAzureAuth = azureConfigured && tenant.azureTenantId;
      if (!hasAzureAuth) {
        continue;
      }

      const jobRunId = await trackJobStart("auditLogs", tenant.id, undefined, `Audit logs for ${tenant.name}`);
      jobStatus.auditLogs.activeJobRunId = jobRunId;

      try {
        const result = await collectAuditLogs(tenant.id);
        const status = (result.error || result.entriesCollected === 0) ? "failed" : "completed";
        await trackJobComplete(
          jobRunId,
          status,
          {
            entriesCollected: result.entriesCollected,
            operationBreakdown: result.operationBreakdown,
          },
          result.error || (result.entriesCollected === 0 ? "No data collected — may lack required permissions" : undefined),
        );
        console.log(`[Scheduler] Audit logs for ${tenant.name}: ${result.entriesCollected} entries collected${status === "failed" ? " (failed)" : ""}`);
      } catch (err: any) {
        await trackJobComplete(jobRunId, "failed", undefined, err.message);
        console.error(`[Scheduler] Audit logs failed for ${tenant.name}:`, err.message);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } catch (error) {
    console.error("[Scheduler] Audit logs job failed:", error);
  } finally {
    jobStatus.auditLogs.isRunning = false;
    jobStatus.auditLogs.activeJobRunId = null;
    jobStatus.auditLogs.lastRun = new Date();
  }
}

async function runSiteStructureJob(): Promise<void> {
  if (jobStatus.siteStructure.isRunning) {
    console.log("[Scheduler] Site structure already running, skipping...");
    return;
  }

  const connected = await isSharePointConnected();
  if (!connected) {
    console.log("[Scheduler] SharePoint not connected, skipping site structure collection");
    return;
  }

  jobStatus.siteStructure.isRunning = true;
  console.log("[Scheduler] Starting site structure collection...");

  try {
    const allTenants = await storage.getTenants();
    const consentedTenants = allTenants.filter(t => t.consentStatus === "Connected");
    const azureConfigured = isAzureAppConfigured();

    for (const tenant of consentedTenants) {
      const hasAzureAuth = azureConfigured && tenant.azureTenantId;
      if (!hasAzureAuth) {
        continue;
      }

      const jobRunId = await trackJobStart("siteStructure", tenant.id, undefined, `Site structure for ${tenant.name}`);
      jobStatus.siteStructure.activeJobRunId = jobRunId;

      try {
        const result = await collectSiteStructure(tenant.id);
        const allFailed = result.results.every(r => r.error);
        const hasErrors = result.results.some(r => r.error);
        await trackJobComplete(jobRunId, allFailed ? "failed" : "completed", {
          totalCollected: result.totalCollected,
          reports: result.results.map(r => ({ type: r.reportType, records: r.recordsCollected, error: r.error })),
        }, allFailed ? result.results.map(r => r.error).filter(Boolean).join("; ") : undefined);
        console.log(`[Scheduler] Site structure for ${tenant.name}: ${result.totalCollected} records collected${allFailed ? " (all failed)" : ""}`);
      } catch (err: any) {
        await trackJobComplete(jobRunId, "failed", undefined, err.message);
        console.error(`[Scheduler] Site structure failed for ${tenant.name}:`, err.message);
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } catch (error) {
    console.error("[Scheduler] Site structure job failed:", error);
  } finally {
    jobStatus.siteStructure.isRunning = false;
    jobStatus.siteStructure.activeJobRunId = null;
    jobStatus.siteStructure.lastRun = new Date();
  }
}

let syntheticTestInterval: NodeJS.Timeout | null = null;
let graphReportsInterval: NodeJS.Timeout | null = null;
let serviceHealthInterval: NodeJS.Timeout | null = null;
let auditLogsInterval: NodeJS.Timeout | null = null;
let siteStructureInterval: NodeJS.Timeout | null = null;
let stuckJobInterval: NodeJS.Timeout | null = null;

export function startScheduler(): void {
  console.log("[Scheduler] Initializing scheduled jobs...");

  if (syntheticTestInterval) clearInterval(syntheticTestInterval);
  if (graphReportsInterval) clearInterval(graphReportsInterval);
  if (serviceHealthInterval) clearInterval(serviceHealthInterval);
  if (auditLogsInterval) clearInterval(auditLogsInterval);
  if (siteStructureInterval) clearInterval(siteStructureInterval);
  if (stuckJobInterval) clearInterval(stuckJobInterval);

  syntheticTestInterval = setInterval(() => {
    runSyntheticTestsJob();
  }, 60 * 1000);

  graphReportsInterval = setInterval(() => {
    runGraphReportsJob();
  }, 6 * 60 * 60 * 1000);

  serviceHealthInterval = setInterval(() => {
    runServiceHealthJob();
  }, 5 * 60 * 1000);

  auditLogsInterval = setInterval(() => {
    runAuditLogsJob();
  }, 15 * 60 * 1000);

  siteStructureInterval = setInterval(() => {
    runSiteStructureJob();
  }, 60 * 60 * 1000);

  stuckJobInterval = setInterval(() => {
    cleanupStuckJobs().catch(err => {
      console.error("[Scheduler] Periodic stuck job cleanup error:", err);
    });
  }, 15 * 60 * 1000);

  cleanupStuckJobs().catch(err => {
    console.error("[Scheduler] Error cleaning up stuck jobs on startup:", err);
  });

  setTimeout(() => {
    console.log("[Scheduler] Running initial synthetic test sweep...");
    runSyntheticTestsJob();
  }, 10 * 1000);

  setTimeout(() => {
    console.log("[Scheduler] Running initial service health check...");
    runServiceHealthJob();
  }, 15 * 1000);

  setTimeout(() => {
    console.log("[Scheduler] Running initial audit log collection...");
    runAuditLogsJob();
  }, 20 * 1000);

  setTimeout(() => {
    console.log("[Scheduler] Running initial graph reports collection...");
    runGraphReportsJob();
  }, 30 * 1000);

  setTimeout(() => {
    console.log("[Scheduler] Running initial site structure collection...");
    runSiteStructureJob();
  }, 45 * 1000);

  console.log("[Scheduler] Jobs scheduled:");
  console.log("  - Synthetic tests: every 60s (initial in 10s)");
  console.log("  - Service health: every 5m (initial in 15s)");
  console.log("  - Audit logs: every 15m (initial in 20s)");
  console.log("  - Graph reports: every 6h (initial in 30s)");
  console.log("  - Site structure: every 1h (initial in 45s)");
  console.log("  - Stuck job cleanup: every 15m");
}

export function stopScheduler(): void {
  if (syntheticTestInterval) { clearInterval(syntheticTestInterval); syntheticTestInterval = null; }
  if (graphReportsInterval) { clearInterval(graphReportsInterval); graphReportsInterval = null; }
  if (serviceHealthInterval) { clearInterval(serviceHealthInterval); serviceHealthInterval = null; }
  if (auditLogsInterval) { clearInterval(auditLogsInterval); auditLogsInterval = null; }
  if (siteStructureInterval) { clearInterval(siteStructureInterval); siteStructureInterval = null; }
  if (stuckJobInterval) { clearInterval(stuckJobInterval); stuckJobInterval = null; }
  console.log("[Scheduler] All scheduled jobs stopped");
}

export function getSchedulerStatus(): Record<string, Omit<JobStatus, "abortController">> {
  const result: Record<string, Omit<JobStatus, "abortController">> = {};
  for (const [key, status] of Object.entries(jobStatus)) {
    result[key] = {
      lastRun: status.lastRun,
      isRunning: status.isRunning,
      nextRun: status.nextRun,
      activeJobRunId: status.activeJobRunId,
    };
  }
  return result;
}

export async function triggerSyntheticTestsNow(): Promise<void> {
  runSyntheticTestsJob();
}

export async function triggerGraphReportsNow(): Promise<void> {
  runGraphReportsJob();
}

export async function triggerServiceHealthNow(): Promise<void> {
  runServiceHealthJob();
}

export async function triggerAuditLogsNow(): Promise<void> {
  runAuditLogsJob();
}

export async function triggerSiteStructureNow(): Promise<void> {
  runSiteStructureJob();
}

export async function resetStuckJob(jobType: string): Promise<boolean> {
  const job = jobStatus[jobType];
  if (!job) return false;

  if (job.abortController) {
    job.abortController.abort();
    job.abortController = null;
  }

  if (job.activeJobRunId) {
    await trackJobComplete(job.activeJobRunId, "cancelled", { reason: "Manual reset" });
    job.activeJobRunId = null;
  }

  job.isRunning = false;
  console.log(`[Scheduler] Reset stuck job: ${jobType}`);
  return true;
}

export async function resetAllStuckJobs(): Promise<string[]> {
  const resetJobs: string[] = [];
  for (const [key, status] of Object.entries(jobStatus)) {
    if (status.isRunning) {
      if (status.abortController) {
        status.abortController.abort();
        status.abortController = null;
      }
      if (status.activeJobRunId) {
        await trackJobComplete(status.activeJobRunId, "cancelled", { reason: "Manual reset (all)" });
        status.activeJobRunId = null;
      }
      status.isRunning = false;
      resetJobs.push(key);
      console.log(`[Scheduler] Reset stuck job: ${key}`);
    }
  }
  return resetJobs;
}

export async function cancelJob(jobType: string): Promise<{ cancelled: boolean; wasRunning: boolean }> {
  const job = jobStatus[jobType];
  if (!job) {
    return { cancelled: false, wasRunning: false };
  }

  const wasRunning = job.isRunning;

  if (job.abortController) {
    job.abortController.abort();
    job.abortController = null;
    console.log(`[Scheduler] Cancelled running job: ${jobType}`);
  }

  if (job.activeJobRunId) {
    await trackJobComplete(job.activeJobRunId, "cancelled", { reason: "Manual cancellation" });
    job.activeJobRunId = null;
  }

  job.isRunning = false;

  return { cancelled: true, wasRunning };
}
