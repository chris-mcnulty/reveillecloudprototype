import { storage } from "./storage";
import { runTestAndRecord, isSharePointConnected } from "./testRunner";
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

let sweepInterval: NodeJS.Timeout | null = null;
let stuckJobInterval: NodeJS.Timeout | null = null;

export function startScheduler(): void {
  console.log("[Scheduler] Initializing scheduled jobs...");

  if (sweepInterval) clearInterval(sweepInterval);
  if (stuckJobInterval) clearInterval(stuckJobInterval);

  sweepInterval = setInterval(() => {
    runSyntheticTestsJob();
  }, 60 * 1000);

  stuckJobInterval = setInterval(() => {
    cleanupStuckJobs().catch(err => {
      console.error("[Scheduler] Periodic stuck job cleanup error:", err);
    });
  }, 15 * 60 * 1000);

  cleanupStuckJobs().catch(err => {
    console.error("[Scheduler] Error cleaning up stuck jobs on startup:", err);
  });

  setTimeout(() => {
    console.log("[Scheduler] Running initial test sweep for any overdue items...");
    runSyntheticTestsJob();
  }, 10 * 1000);

  console.log("[Scheduler] Scheduler started - sweeps every 60s, stuck job cleanup every 15m");
  console.log("[Scheduler] Initial sweep will start in 10 seconds");
}

export function stopScheduler(): void {
  if (sweepInterval) {
    clearInterval(sweepInterval);
    sweepInterval = null;
  }
  if (stuckJobInterval) {
    clearInterval(stuckJobInterval);
    stuckJobInterval = null;
  }
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
