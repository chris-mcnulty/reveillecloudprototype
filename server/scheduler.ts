import { storage } from "./storage";
import { runTestAndRecord, isSharePointConnected } from "./testRunner";
import { collectSharePointUsageReports } from "./collectors/graphReports";
import { collectServiceHealthIncidents } from "./collectors/serviceHealth";
import { collectAuditLogs } from "./collectors/auditLogs";
import { collectSiteStructure } from "./collectors/siteStructure";
import { collectPowerPlatformTelemetry } from "./collectors/powerPlatform";
import { collectCopilotInteractions } from "./collectors/copilotInteractions";
import { collectEntraSignIns } from "./collectors/entraSignIns";
import { collectSpeData } from "./collectors/spEmbedded";
import { runAnomalyDetection } from "./anomalyDetection";
import { collectFoundryDiscovery } from "./collectors/foundryDiscovery";
import { collectSharePointSkills } from "./collectors/skillsSharePoint";
import { collectOneDriveSkills } from "./collectors/skillsOneDrive";
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
  powerPlatform: { lastRun: null, isRunning: false, nextRun: null, abortController: null, activeJobRunId: null },
  copilotInteractions: { lastRun: null, isRunning: false, nextRun: null, abortController: null, activeJobRunId: null },
  copilotEnrichmentBackfill: { lastRun: null, isRunning: false, nextRun: null, abortController: null, activeJobRunId: null },
  entraSignIns: { lastRun: null, isRunning: false, nextRun: null, abortController: null, activeJobRunId: null },
  speData: { lastRun: null, isRunning: false, nextRun: null, abortController: null, activeJobRunId: null },
  anomalyDetection: { lastRun: null, isRunning: false, nextRun: null, abortController: null, activeJobRunId: null },
  digests: { lastRun: null, isRunning: false, nextRun: null, abortController: null, activeJobRunId: null },
  foundryDiscovery: { lastRun: null, isRunning: false, nextRun: null, abortController: null, activeJobRunId: null },
  llmSpendRollup: { lastRun: null, isRunning: false, nextRun: null, abortController: null, activeJobRunId: null },
  llmBudgetEval: { lastRun: null, isRunning: false, nextRun: null, abortController: null, activeJobRunId: null },
  copilotSurfaceEval: { lastRun: null, isRunning: false, nextRun: null, abortController: null, activeJobRunId: null },
  llmPerfEval: { lastRun: null, isRunning: false, nextRun: null, abortController: null, activeJobRunId: null },
  skillsSharePointDiscovery: { lastRun: null, isRunning: false, nextRun: null, abortController: null, activeJobRunId: null },
  skillsOneDriveDiscovery: { lastRun: null, isRunning: false, nextRun: null, abortController: null, activeJobRunId: null },
};

let llmSpendRollupInterval: NodeJS.Timeout | null = null;
let llmBudgetEvalInterval: NodeJS.Timeout | null = null;
let copilotSurfaceEvalInterval: NodeJS.Timeout | null = null;
let llmPerfEvalInterval: NodeJS.Timeout | null = null;

async function runLlmSpendRollupJob(): Promise<void> {
  if (jobStatus.llmSpendRollup.isRunning) return;
  jobStatus.llmSpendRollup.isRunning = true;
  const jobRunId = await trackJobStart("llmSpendRollup");
  jobStatus.llmSpendRollup.activeJobRunId = jobRunId;
  try {
    const result = await storage.rollupLlmSpendDaily({ sinceDays: 35 });
    await trackJobComplete(jobRunId, "completed", result);
    console.log(`[Scheduler] LLM spend rollup: ${result.rolledUp} rows, ${result.tenants} tenants`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await trackJobComplete(jobRunId, "failed", undefined, msg);
    console.error("[Scheduler] LLM spend rollup failed:", msg);
  } finally {
    jobStatus.llmSpendRollup.isRunning = false;
    jobStatus.llmSpendRollup.activeJobRunId = null;
    jobStatus.llmSpendRollup.lastRun = new Date();
  }
}

async function runLlmBudgetEvalJob(): Promise<void> {
  if (jobStatus.llmBudgetEval.isRunning) return;
  jobStatus.llmBudgetEval.isRunning = true;
  const jobRunId = await trackJobStart("llmBudgetEval");
  jobStatus.llmBudgetEval.activeJobRunId = jobRunId;
  try {
    const result = await storage.evaluateLlmBudgets();
    await trackJobComplete(jobRunId, "completed", result);
    console.log(`[Scheduler] LLM budget eval: ${result.rulesEvaluated} rules, ${result.alertsCreated} alerts`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await trackJobComplete(jobRunId, "failed", undefined, msg);
    console.error("[Scheduler] LLM budget eval failed:", msg);
  } finally {
    jobStatus.llmBudgetEval.isRunning = false;
    jobStatus.llmBudgetEval.activeJobRunId = null;
    jobStatus.llmBudgetEval.lastRun = new Date();
  }
}

async function runCopilotSurfaceEvalJob(): Promise<void> {
  if (jobStatus.copilotSurfaceEval.isRunning) return;
  jobStatus.copilotSurfaceEval.isRunning = true;
  const jobRunId = await trackJobStart("copilotSurfaceEval");
  jobStatus.copilotSurfaceEval.activeJobRunId = jobRunId;
  try {
    const result = await storage.evaluateCopilotSurfaceAlerts();
    await trackJobComplete(jobRunId, "completed", result);
    console.log(`[Scheduler] Copilot surface eval: ${result.rulesEvaluated} rules, ${result.alertsCreated} alerts created, ${result.alertsResolved} resolved`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await trackJobComplete(jobRunId, "failed", undefined, msg);
    console.error("[Scheduler] Copilot surface eval failed:", msg);
  } finally {
    jobStatus.copilotSurfaceEval.isRunning = false;
    jobStatus.copilotSurfaceEval.activeJobRunId = null;
    jobStatus.copilotSurfaceEval.lastRun = new Date();
  }
}

async function runLlmPerfEvalJob(): Promise<void> {
  if (jobStatus.llmPerfEval.isRunning) return;
  jobStatus.llmPerfEval.isRunning = true;
  const jobRunId = await trackJobStart("llmPerfEval");
  jobStatus.llmPerfEval.activeJobRunId = jobRunId;
  try {
    const result = await storage.evaluateLlmPerformanceAlerts();
    await trackJobComplete(jobRunId, "completed", result);
    console.log(`[Scheduler] LLM perf eval: ${result.rulesEvaluated} rules, ${result.alertsCreated} alerts created, ${result.alertsResolved} resolved`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await trackJobComplete(jobRunId, "failed", undefined, msg);
    console.error("[Scheduler] LLM perf eval failed:", msg);
  } finally {
    jobStatus.llmPerfEval.isRunning = false;
    jobStatus.llmPerfEval.activeJobRunId = null;
    jobStatus.llmPerfEval.lastRun = new Date();
  }
}

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

async function runPowerPlatformJob(): Promise<void> {
  if (jobStatus.powerPlatform.isRunning) {
    console.log("[Scheduler] Power Platform already running, skipping...");
    return;
  }

  jobStatus.powerPlatform.isRunning = true;
  console.log("[Scheduler] Starting Power Platform collection...");

  try {
    const allTenants = await storage.getTenants();
    const consentedTenants = allTenants.filter(t => t.consentStatus === "Connected");
    const azureConfigured = isAzureAppConfigured();

    for (const tenant of consentedTenants) {
      if (!azureConfigured || !tenant.azureTenantId) continue;

      const jobRunId = await trackJobStart("powerPlatform", tenant.id, undefined, `Power Platform for ${tenant.name}`);
      jobStatus.powerPlatform.activeJobRunId = jobRunId;

      try {
        const result = await collectPowerPlatformTelemetry(tenant.id);
        const hasErrors = result.errors.length > 0;
        const totalResources = result.apps + result.flows + result.bots;
        await trackJobComplete(jobRunId, hasErrors && totalResources === 0 ? "failed" : "completed", {
          environments: result.environments,
          apps: result.apps,
          flows: result.flows,
          bots: result.bots,
        }, hasErrors ? result.errors.join("; ") : undefined);
        console.log(`[Scheduler] Power Platform for ${tenant.name}: ${result.environments} envs, ${result.apps} apps, ${result.flows} flows, ${result.bots} bots`);
      } catch (err: any) {
        await trackJobComplete(jobRunId, "failed", undefined, err.message);
        console.error(`[Scheduler] Power Platform failed for ${tenant.name}:`, err.message);
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } catch (error) {
    console.error("[Scheduler] Power Platform job failed:", error);
  } finally {
    jobStatus.powerPlatform.isRunning = false;
    jobStatus.powerPlatform.activeJobRunId = null;
    jobStatus.powerPlatform.lastRun = new Date();
  }
}

async function runCopilotInteractionsJob(): Promise<void> {
  if (jobStatus.copilotInteractions.isRunning) {
    console.log("[Scheduler] Copilot interactions already running, skipping...");
    return;
  }

  const connected = await isSharePointConnected();
  if (!connected) {
    console.log("[Scheduler] SharePoint not connected, skipping Copilot interactions");
    return;
  }

  jobStatus.copilotInteractions.isRunning = true;
  console.log("[Scheduler] Starting Copilot interactions collection...");

  try {
    const allTenants = await storage.getTenants();
    const consentedTenants = allTenants.filter(t => t.consentStatus === "Connected");
    const azureConfigured = isAzureAppConfigured();

    for (const tenant of consentedTenants) {
      const hasAzureAuth = azureConfigured && tenant.azureTenantId;
      if (!hasAzureAuth) continue;

      const jobRunId = await trackJobStart("copilotInteractions", tenant.id, undefined, `Copilot interactions for ${tenant.name}`);
      jobStatus.copilotInteractions.activeJobRunId = jobRunId;

      try {
        const result = await collectCopilotInteractions(tenant.id);
        const hasErrors = result.errors.length > 0;
        await trackJobComplete(jobRunId, hasErrors ? "completed" : "completed", {
          usersProcessed: result.usersProcessed,
          interactionsCollected: result.interactionsCollected,
          errors: result.errors,
        }, hasErrors ? result.errors.join("; ") : undefined);
        console.log(`[Scheduler] Copilot interactions for ${tenant.name}: ${result.interactionsCollected} interactions from ${result.usersProcessed} users`);
      } catch (err: any) {
        await trackJobComplete(jobRunId, "failed", undefined, err.message);
        console.error(`[Scheduler] Copilot interactions failed for ${tenant.name}:`, err.message);
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } catch (error) {
    console.error("[Scheduler] Copilot interactions job failed:", error);
  } finally {
    jobStatus.copilotInteractions.isRunning = false;
    jobStatus.copilotInteractions.activeJobRunId = null;
    jobStatus.copilotInteractions.lastRun = new Date();
  }
}

async function runCopilotEnrichmentBackfillJob(): Promise<void> {
  if (jobStatus.copilotEnrichmentBackfill.isRunning) {
    console.log("[Scheduler] Copilot enrichment backfill already running, skipping...");
    return;
  }
  jobStatus.copilotEnrichmentBackfill.isRunning = true;
  console.log("[Scheduler] Starting Copilot enrichment backfill (all tenants)...");

  const jobRunId = await trackJobStart("copilotEnrichmentBackfill", undefined, undefined, "Copilot enrichment backfill (all tenants)");
  jobStatus.copilotEnrichmentBackfill.activeJobRunId = jobRunId;

  try {
    const result = await storage.backfillCopilotEnrichment();
    await trackJobComplete(jobRunId, "completed", result);
    console.log(`[Scheduler] Copilot enrichment backfill: scanned ${result.scanned}, updated ${result.updated}, latency computed ${result.latencyComputed}, tenants touched ${result.tenantsTouched}`);
  } catch (err: any) {
    await trackJobComplete(jobRunId, "failed", undefined, err.message);
    console.error("[Scheduler] Copilot enrichment backfill failed:", err.message);
  } finally {
    jobStatus.copilotEnrichmentBackfill.isRunning = false;
    jobStatus.copilotEnrichmentBackfill.activeJobRunId = null;
    jobStatus.copilotEnrichmentBackfill.lastRun = new Date();
  }
}

async function runEntraSignInsJob(): Promise<void> {
  if (jobStatus.entraSignIns.isRunning) {
    console.log("[Scheduler] Entra sign-ins already running, skipping...");
    return;
  }

  if (!isAzureAppConfigured()) {
    console.log("[Scheduler] Azure app not configured, skipping Entra sign-ins");
    return;
  }

  jobStatus.entraSignIns.isRunning = true;
  console.log("[Scheduler] Starting Entra sign-ins collection...");

  try {
    const allTenants = await storage.getTenants();
    const consentedTenants = allTenants.filter(t => t.consentStatus === "Connected");

    for (const tenant of consentedTenants) {
      if (!tenant.azureTenantId) continue;

      const jobRunId = await trackJobStart("entraSignIns", tenant.id, undefined, `Entra sign-ins for ${tenant.name}`);
      jobStatus.entraSignIns.activeJobRunId = jobRunId;

      try {
        const result = await collectEntraSignIns(tenant.id);
        const hasErrors = result.errors.length > 0;
        await trackJobComplete(jobRunId, "completed", {
          signInsCollected: result.signInsCollected,
          errors: result.errors,
        }, hasErrors ? result.errors.join("; ") : undefined);
        console.log(`[Scheduler] Entra sign-ins for ${tenant.name}: ${result.signInsCollected} sign-ins`);
      } catch (err: any) {
        await trackJobComplete(jobRunId, "failed", undefined, err.message);
        console.error(`[Scheduler] Entra sign-ins failed for ${tenant.name}:`, err.message);
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } catch (error) {
    console.error("[Scheduler] Entra sign-ins job failed:", error);
  } finally {
    jobStatus.entraSignIns.isRunning = false;
    jobStatus.entraSignIns.activeJobRunId = null;
    jobStatus.entraSignIns.lastRun = new Date();
  }
}

async function runSpeDataJob(): Promise<void> {
  if (jobStatus.speData.isRunning) {
    console.log("[Scheduler] SPE data already running, skipping...");
    return;
  }

  if (!isAzureAppConfigured()) {
    console.log("[Scheduler] Azure app not configured, skipping SPE data");
    return;
  }

  jobStatus.speData.isRunning = true;
  console.log("[Scheduler] Starting SPE data collection...");

  try {
    const allTenants = await storage.getTenants();
    const consentedTenants = allTenants.filter(t => t.consentStatus === "Connected");

    for (const tenant of consentedTenants) {
      if (!tenant.azureTenantId) continue;

      const jobRunId = await trackJobStart("speData", tenant.id, undefined, `SPE data for ${tenant.name}`);
      jobStatus.speData.activeJobRunId = jobRunId;

      try {
        const result = await collectSpeData(tenant.id);
        const hasErrors = result.errors.length > 0;
        await trackJobComplete(jobRunId, "completed", {
          containersCollected: result.containersCollected,
          accessEventsCollected: result.accessEventsCollected,
          securityEventsCollected: result.securityEventsCollected,
          contentTypeStatsCollected: result.contentTypeStatsCollected,
          errors: result.errors,
        }, hasErrors ? result.errors.join("; ") : undefined);
        console.log(`[Scheduler] SPE data for ${tenant.name}: ${result.containersCollected} containers`);
      } catch (err: any) {
        await trackJobComplete(jobRunId, "failed", undefined, err.message);
        console.error(`[Scheduler] SPE data failed for ${tenant.name}:`, err.message);
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } catch (error) {
    console.error("[Scheduler] SPE data job failed:", error);
  } finally {
    jobStatus.speData.isRunning = false;
    jobStatus.speData.activeJobRunId = null;
    jobStatus.speData.lastRun = new Date();
  }
}

async function runDigestsJob(): Promise<void> {
  if (jobStatus.digests.isRunning) {
    return;
  }
  jobStatus.digests.isRunning = true;
  try {
    const due = await storage.getScheduledDigestsDue(new Date());
    if (due.length > 0) {
      console.log(`[Scheduler] Processing ${due.length} due digest(s)...`);
      const { runDigest } = await import("./digests/runner");
      for (const digest of due) {
        try {
          const result = await runDigest(digest.id);
          console.log(`[Scheduler] Digest ${digest.name}: ${result.status} (email=${result.emailRecipientCount}, teams=${result.teamsDelivered})`);
        } catch (err: any) {
          console.error(`[Scheduler] Digest ${digest.name} failed:`, err.message);
        }
      }
    }
  } catch (err: any) {
    console.error("[Scheduler] runDigestsJob error:", err.message || err);
  } finally {
    jobStatus.digests.isRunning = false;
    jobStatus.digests.lastRun = new Date();
  }
}

async function runFoundryDiscoveryJob(): Promise<void> {
  if (jobStatus.foundryDiscovery.isRunning) {
    console.log("[Scheduler] Foundry discovery already running, skipping...");
    return;
  }

  if (!isAzureAppConfigured()) {
    console.log("[Scheduler] Azure app not configured, skipping Foundry discovery");
    return;
  }

  jobStatus.foundryDiscovery.isRunning = true;
  console.log("[Scheduler] Starting Foundry deployment discovery...");

  try {
    const allTenants = await storage.getTenants();
    const consentedTenants = allTenants.filter(t => t.consentStatus === "Connected");

    for (const tenant of consentedTenants) {
      if (!tenant.azureTenantId) continue;

      const jobRunId = await trackJobStart("foundryDiscovery", tenant.id, undefined, `Foundry discovery for ${tenant.name}`);
      jobStatus.foundryDiscovery.activeJobRunId = jobRunId;

      try {
        const result = await collectFoundryDiscovery(tenant.id);
        let throttleAlertsCreated = 0;
        let throttleRulesEvaluated = 0;
        if (!result.needsConsent && result.deploymentsDiscovered > 0) {
          try {
            const evalResult = await storage.evaluateFoundryThrottleRules(tenant.id);
            throttleAlertsCreated = evalResult.alertsCreated;
            throttleRulesEvaluated = evalResult.rulesEvaluated;
          } catch (evalErr) {
            const msg = evalErr instanceof Error ? evalErr.message : String(evalErr);
            result.errors.push(`Throttle rule eval: ${msg}`);
          }
        }
        const status = result.needsConsent ? "failed" : "completed";
        await trackJobComplete(jobRunId, status, {
          deploymentsDiscovered: result.deploymentsDiscovered,
          accountsScanned: result.accountsScanned,
          subscriptionsScanned: result.subscriptionsScanned,
          metricsCollected: result.metricsCollected,
          throttledCallsTotal: result.throttledCallsTotal,
          throttledByDeployment: result.throttledByDeployment,
          throttleRulesEvaluated,
          throttleAlertsCreated,
          needsConsent: result.needsConsent,
          consentReason: result.consentReason,
          errors: result.errors,
        }, result.errors.length ? result.errors.join("; ") : undefined);
        console.log(`[Scheduler] Foundry discovery for ${tenant.name}: ${result.deploymentsDiscovered} deployments, ${result.metricsCollected} metric snapshots, ${result.throttledCallsTotal.toFixed(0)} throttled calls (${throttleRulesEvaluated} rules → ${throttleAlertsCreated} alerts)${result.needsConsent ? " (needs consent)" : ""}`);
      } catch (err: any) {
        await trackJobComplete(jobRunId, "failed", undefined, err.message);
        console.error(`[Scheduler] Foundry discovery failed for ${tenant.name}:`, err.message);
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } catch (error) {
    console.error("[Scheduler] Foundry discovery job failed:", error);
  } finally {
    jobStatus.foundryDiscovery.isRunning = false;
    jobStatus.foundryDiscovery.activeJobRunId = null;
    jobStatus.foundryDiscovery.lastRun = new Date();
  }
}

let syntheticTestInterval: NodeJS.Timeout | null = null;
let graphReportsInterval: NodeJS.Timeout | null = null;
let serviceHealthInterval: NodeJS.Timeout | null = null;
let auditLogsInterval: NodeJS.Timeout | null = null;
let siteStructureInterval: NodeJS.Timeout | null = null;
let powerPlatformInterval: NodeJS.Timeout | null = null;
let copilotInteractionsInterval: NodeJS.Timeout | null = null;
let copilotEnrichmentBackfillInterval: NodeJS.Timeout | null = null;
let entraSignInsInterval: NodeJS.Timeout | null = null;
let speDataInterval: NodeJS.Timeout | null = null;
let anomalyDetectionInterval: NodeJS.Timeout | null = null;
let digestsInterval: NodeJS.Timeout | null = null;
let foundryDiscoveryInterval: NodeJS.Timeout | null = null;
let stuckJobInterval: NodeJS.Timeout | null = null;

async function runAnomalyDetectionJob(): Promise<void> {
  if (jobStatus.anomalyDetection.isRunning) {
    console.log("[Scheduler] Anomaly detection already running, skipping...");
    return;
  }

  jobStatus.anomalyDetection.isRunning = true;
  const jobRunId = await trackJobStart("anomalyDetection", undefined, undefined, "Anomaly detection sweep");
  jobStatus.anomalyDetection.activeJobRunId = jobRunId;

  try {
    const result = await runAnomalyDetection();
    await trackJobComplete(
      jobRunId,
      "completed",
      {
        tenants: result.tenants,
        streamsEvaluated: result.streamsEvaluated,
        baselinesUpdated: result.baselinesUpdated,
        alertsCreated: result.alertsCreated,
        recoveriesMarked: result.recoveriesMarked,
        errors: result.errors,
      },
      result.errors.length > 0 ? result.errors.slice(0, 3).join("; ") : undefined,
    );
    console.log(`[Scheduler] Anomaly detection: ${result.tenants} tenants, ${result.baselinesUpdated} baselines updated, ${result.alertsCreated} alerts created, ${result.recoveriesMarked} recoveries`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await trackJobComplete(jobRunId, "failed", undefined, msg);
    console.error("[Scheduler] Anomaly detection failed:", msg);
  } finally {
    jobStatus.anomalyDetection.isRunning = false;
    jobStatus.anomalyDetection.activeJobRunId = null;
    jobStatus.anomalyDetection.lastRun = new Date();
  }
}

async function runSkillsSharePointJob(): Promise<void> {
  if (jobStatus.skillsSharePointDiscovery.isRunning) {
    console.log("[Scheduler] SharePoint skills discovery already running, skipping...");
    return;
  }
  if (!isAzureAppConfigured()) return;

  jobStatus.skillsSharePointDiscovery.isRunning = true;
  console.log("[Scheduler] Starting SharePoint skills discovery...");

  try {
    const tenants = (await storage.getTenants()).filter(t => t.consentStatus === "Connected" && t.azureTenantId);
    for (const tenant of tenants) {
      const jobRunId = await trackJobStart("skillsSharePointDiscovery", tenant.id, undefined, `SharePoint skills for ${tenant.name}`);
      jobStatus.skillsSharePointDiscovery.activeJobRunId = jobRunId;
      try {
        const result = await collectSharePointSkills(tenant.id);
        const hasErrors = result.errors.length > 0;
        await trackJobComplete(jobRunId, "completed", result, hasErrors ? result.errors.slice(0, 3).join("; ") : undefined);
      } catch (err: any) {
        await trackJobComplete(jobRunId, "failed", undefined, err.message);
        console.error(`[Scheduler] SharePoint skills failed for ${tenant.name}:`, err.message);
      }
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  } catch (err) {
    console.error("[Scheduler] SharePoint skills discovery job failed:", err);
  } finally {
    jobStatus.skillsSharePointDiscovery.isRunning = false;
    jobStatus.skillsSharePointDiscovery.activeJobRunId = null;
    jobStatus.skillsSharePointDiscovery.lastRun = new Date();
  }
}

async function runSkillsOneDriveJob(): Promise<void> {
  if (jobStatus.skillsOneDriveDiscovery.isRunning) {
    console.log("[Scheduler] OneDrive skills discovery already running, skipping...");
    return;
  }
  if (!isAzureAppConfigured()) return;

  jobStatus.skillsOneDriveDiscovery.isRunning = true;
  console.log("[Scheduler] Starting OneDrive skills discovery...");

  try {
    const tenants = (await storage.getTenants()).filter(t => t.consentStatus === "Connected" && t.azureTenantId);
    for (const tenant of tenants) {
      const jobRunId = await trackJobStart("skillsOneDriveDiscovery", tenant.id, undefined, `OneDrive skills for ${tenant.name}`);
      jobStatus.skillsOneDriveDiscovery.activeJobRunId = jobRunId;
      try {
        const result = await collectOneDriveSkills(tenant.id);
        const hasErrors = result.errors.length > 0;
        await trackJobComplete(jobRunId, "completed", result, hasErrors ? result.errors.slice(0, 3).join("; ") : undefined);
      } catch (err: any) {
        await trackJobComplete(jobRunId, "failed", undefined, err.message);
        console.error(`[Scheduler] OneDrive skills failed for ${tenant.name}:`, err.message);
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } catch (err) {
    console.error("[Scheduler] OneDrive skills discovery job failed:", err);
  } finally {
    jobStatus.skillsOneDriveDiscovery.isRunning = false;
    jobStatus.skillsOneDriveDiscovery.activeJobRunId = null;
    jobStatus.skillsOneDriveDiscovery.lastRun = new Date();
  }
}

let skillsSharePointInterval: NodeJS.Timeout | null = null;
let skillsOneDriveInterval: NodeJS.Timeout | null = null;

export function startScheduler(): void {
  console.log("[Scheduler] Initializing scheduled jobs...");

  if (syntheticTestInterval) clearInterval(syntheticTestInterval);
  if (graphReportsInterval) clearInterval(graphReportsInterval);
  if (serviceHealthInterval) clearInterval(serviceHealthInterval);
  if (auditLogsInterval) clearInterval(auditLogsInterval);
  if (siteStructureInterval) clearInterval(siteStructureInterval);
  if (powerPlatformInterval) clearInterval(powerPlatformInterval);
  if (copilotInteractionsInterval) clearInterval(copilotInteractionsInterval);
  if (copilotEnrichmentBackfillInterval) clearInterval(copilotEnrichmentBackfillInterval);
  if (entraSignInsInterval) clearInterval(entraSignInsInterval);
  if (speDataInterval) clearInterval(speDataInterval);
  if (anomalyDetectionInterval) clearInterval(anomalyDetectionInterval);
  if (digestsInterval) clearInterval(digestsInterval);
  if (foundryDiscoveryInterval) clearInterval(foundryDiscoveryInterval);
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

  powerPlatformInterval = setInterval(() => {
    runPowerPlatformJob();
  }, 30 * 60 * 1000);

  copilotInteractionsInterval = setInterval(() => {
    runCopilotInteractionsJob();
  }, 60 * 60 * 1000);

  copilotEnrichmentBackfillInterval = setInterval(() => {
    runCopilotEnrichmentBackfillJob();
  }, 6 * 60 * 60 * 1000);

  entraSignInsInterval = setInterval(() => {
    runEntraSignInsJob();
  }, 30 * 60 * 1000);

  speDataInterval = setInterval(() => {
    runSpeDataJob();
  }, 30 * 60 * 1000);

  anomalyDetectionInterval = setInterval(() => {
    runAnomalyDetectionJob();
  }, 60 * 60 * 1000);

  digestsInterval = setInterval(() => {
    runDigestsJob();
  }, 5 * 60 * 1000);

  foundryDiscoveryInterval = setInterval(() => {
    runFoundryDiscoveryJob();
  }, 60 * 60 * 1000);

  llmSpendRollupInterval = setInterval(() => {
    runLlmSpendRollupJob();
  }, 60 * 60 * 1000);

  llmBudgetEvalInterval = setInterval(() => {
    runLlmBudgetEvalJob();
  }, 60 * 60 * 1000);

  copilotSurfaceEvalInterval = setInterval(() => {
    runCopilotSurfaceEvalJob();
  }, 15 * 60 * 1000);

  llmPerfEvalInterval = setInterval(() => {
    runLlmPerfEvalJob();
  }, 15 * 60 * 1000);

  if (skillsSharePointInterval) clearInterval(skillsSharePointInterval);
  if (skillsOneDriveInterval) clearInterval(skillsOneDriveInterval);

  skillsSharePointInterval = setInterval(() => {
    runSkillsSharePointJob();
  }, 6 * 60 * 60 * 1000);

  skillsOneDriveInterval = setInterval(() => {
    runSkillsOneDriveJob();
  }, 6 * 60 * 60 * 1000);

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

  setTimeout(() => {
    console.log("[Scheduler] Running initial Power Platform collection...");
    runPowerPlatformJob();
  }, 55 * 1000);

  setTimeout(() => {
    console.log("[Scheduler] Running initial Copilot interactions collection...");
    runCopilotInteractionsJob();
  }, 65 * 1000);

  setTimeout(() => {
    console.log("[Scheduler] Running initial Copilot enrichment backfill...");
    runCopilotEnrichmentBackfillJob();
  }, 70 * 1000);

  setTimeout(() => {
    console.log("[Scheduler] Running initial Entra sign-ins collection...");
    runEntraSignInsJob();
  }, 75 * 1000);

  setTimeout(() => {
    console.log("[Scheduler] Running initial SPE data collection...");
    runSpeDataJob();
  }, 85 * 1000);

  setTimeout(() => {
    console.log("[Scheduler] Running initial anomaly detection sweep...");
    runAnomalyDetectionJob();
  }, 95 * 1000);

  setTimeout(() => {
    console.log("[Scheduler] Running initial digest sweep...");
    runDigestsJob();
  }, 100 * 1000);

  setTimeout(() => {
    console.log("[Scheduler] Running initial Foundry discovery...");
    runFoundryDiscoveryJob();
  }, 105 * 1000);

  setTimeout(() => {
    console.log("[Scheduler] Running initial LLM spend rollup...");
    runLlmSpendRollupJob().then(() => {
      setTimeout(() => {
        console.log("[Scheduler] Running initial LLM budget evaluation...");
        runLlmBudgetEvalJob();
      }, 5 * 1000);
    });
  }, 115 * 1000);

  setTimeout(() => {
    console.log("[Scheduler] Running initial LLM performance evaluation...");
    runLlmPerfEvalJob();
  }, 125 * 1000);

  setTimeout(() => {
    console.log("[Scheduler] Running initial SharePoint skills discovery...");
    runSkillsSharePointJob();
  }, 130 * 1000);

  setTimeout(() => {
    console.log("[Scheduler] Running initial OneDrive skills discovery...");
    runSkillsOneDriveJob();
  }, 145 * 1000);

  console.log("[Scheduler] Jobs scheduled:");
  console.log("  - Synthetic tests: every 60s (initial in 10s)");
  console.log("  - Service health: every 5m (initial in 15s)");
  console.log("  - Audit logs: every 15m (initial in 20s)");
  console.log("  - Graph reports: every 6h (initial in 30s)");
  console.log("  - Site structure: every 1h (initial in 45s)");
  console.log("  - Power Platform: every 30m (initial in 55s)");
  console.log("  - Copilot interactions: every 1h (initial in 65s)");
  console.log("  - Copilot enrichment backfill: every 6h (initial in 70s)");
  console.log("  - Entra sign-ins: every 30m (initial in 75s)");
  console.log("  - SPE data: every 30m (initial in 85s)");
  console.log("  - Digests: every 5m (initial in 100s)");
  console.log("  - Foundry discovery: every 1h (initial in 105s)");
  console.log("  - LLM spend rollup: every 1h (initial in 115s)");
  console.log("  - LLM budget eval: every 1h (initial in 120s)");
  console.log("  - SharePoint skills discovery: every 6h (initial in 130s)");
  console.log("  - OneDrive skills discovery: every 6h (initial in 145s)");
  console.log("  - Stuck job cleanup: every 15m");
}

export function stopScheduler(): void {
  if (syntheticTestInterval) { clearInterval(syntheticTestInterval); syntheticTestInterval = null; }
  if (graphReportsInterval) { clearInterval(graphReportsInterval); graphReportsInterval = null; }
  if (serviceHealthInterval) { clearInterval(serviceHealthInterval); serviceHealthInterval = null; }
  if (auditLogsInterval) { clearInterval(auditLogsInterval); auditLogsInterval = null; }
  if (siteStructureInterval) { clearInterval(siteStructureInterval); siteStructureInterval = null; }
  if (powerPlatformInterval) { clearInterval(powerPlatformInterval); powerPlatformInterval = null; }
  if (copilotInteractionsInterval) { clearInterval(copilotInteractionsInterval); copilotInteractionsInterval = null; }
  if (copilotEnrichmentBackfillInterval) { clearInterval(copilotEnrichmentBackfillInterval); copilotEnrichmentBackfillInterval = null; }
  if (entraSignInsInterval) { clearInterval(entraSignInsInterval); entraSignInsInterval = null; }
  if (speDataInterval) { clearInterval(speDataInterval); speDataInterval = null; }
  if (anomalyDetectionInterval) { clearInterval(anomalyDetectionInterval); anomalyDetectionInterval = null; }
  if (digestsInterval) { clearInterval(digestsInterval); digestsInterval = null; }
  if (foundryDiscoveryInterval) { clearInterval(foundryDiscoveryInterval); foundryDiscoveryInterval = null; }
  if (llmSpendRollupInterval) { clearInterval(llmSpendRollupInterval); llmSpendRollupInterval = null; }
  if (llmBudgetEvalInterval) { clearInterval(llmBudgetEvalInterval); llmBudgetEvalInterval = null; }
  if (copilotSurfaceEvalInterval) { clearInterval(copilotSurfaceEvalInterval); copilotSurfaceEvalInterval = null; }
  if (llmPerfEvalInterval) { clearInterval(llmPerfEvalInterval); llmPerfEvalInterval = null; }
  if (skillsSharePointInterval) { clearInterval(skillsSharePointInterval); skillsSharePointInterval = null; }
  if (skillsOneDriveInterval) { clearInterval(skillsOneDriveInterval); skillsOneDriveInterval = null; }
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

export async function triggerPowerPlatformNow(): Promise<void> {
  runPowerPlatformJob();
}

export async function triggerCopilotInteractionsNow(): Promise<void> {
  runCopilotInteractionsJob();
}

export async function triggerCopilotEnrichmentBackfillNow(): Promise<void> {
  runCopilotEnrichmentBackfillJob();
}

export async function triggerEntraSignInsNow(): Promise<void> {
  runEntraSignInsJob();
}

export async function triggerSpeDataNow(): Promise<void> {
  runSpeDataJob();
}

export async function triggerAnomalyDetectionNow(): Promise<void> {
  runAnomalyDetectionJob();
}

export async function triggerFoundryDiscoveryNow(): Promise<void> {
  runFoundryDiscoveryJob();
}

export async function triggerLlmSpendRollupNow(): Promise<void> {
  runLlmSpendRollupJob();
}

export async function triggerLlmBudgetEvalNow(): Promise<void> {
  runLlmBudgetEvalJob();
}

export async function triggerCopilotSurfaceEvalNow(): Promise<void> {
  runCopilotSurfaceEvalJob();
}

export async function triggerLlmPerfEvalNow(): Promise<void> {
  runLlmPerfEvalJob();
}

export async function triggerSkillsSharePointDiscoveryNow(): Promise<void> {
  runSkillsSharePointJob();
}

export async function triggerSkillsOneDriveDiscoveryNow(): Promise<void> {
  runSkillsOneDriveJob();
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
