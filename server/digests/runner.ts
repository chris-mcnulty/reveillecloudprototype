import { storage } from "../storage";
import {
  gatherDigestData,
  renderDigestHtml,
  renderDigestPdf,
  buildAdaptiveCard,
  type DigestSection,
} from "./render";
import { sendDigestEmail, sendTeamsAdaptiveCard } from "./delivery";
import type { ScheduledDigest } from "@shared/schema";

export interface DigestRunResult {
  runId: string;
  digestId: string;
  status: "completed" | "failed";
  emailRecipientCount: number;
  teamsDelivered: boolean;
  durationMs: number;
  error?: string;
}

interface DigestSchedule {
  cadence?: string | null;
  hourOfDay?: number | null;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  timezone?: string | null;
}

function getTzOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(instant).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
  const hour = parseInt(parts.hour, 10);
  const localAsUtc = Date.UTC(
    parseInt(parts.year, 10),
    parseInt(parts.month, 10) - 1,
    parseInt(parts.day, 10),
    hour === 24 ? 0 : hour,
    parseInt(parts.minute, 10),
    parseInt(parts.second, 10),
  );
  return localAsUtc - instant.getTime();
}

function utcInstantForLocal(year: number, month: number, day: number, hour: number, timeZone: string): Date {
  let utcMs = Date.UTC(year, month - 1, day, hour, 0, 0);
  for (let i = 0; i < 3; i++) {
    const offset = getTzOffsetMs(new Date(utcMs), timeZone);
    const next = Date.UTC(year, month - 1, day, hour, 0, 0) - offset;
    if (next === utcMs) break;
    utcMs = next;
  }
  return new Date(utcMs);
}

function getLocalParts(instant: Date, timeZone: string): { year: number; month: number; day: number; hour: number; weekday: number } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    weekday: "short",
  });
  const parts = dtf.formatToParts(instant).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hour = parseInt(parts.hour, 10);
  return {
    year: parseInt(parts.year, 10),
    month: parseInt(parts.month, 10),
    day: parseInt(parts.day, 10),
    hour: hour === 24 ? 0 : hour,
    weekday: weekdayMap[parts.weekday] ?? 0,
  };
}

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function computeNextRunAt(digest: DigestSchedule, from: Date = new Date()): Date {
  const tz = digest.timezone && isValidTimeZone(digest.timezone) ? digest.timezone : "UTC";
  const hour = digest.hourOfDay ?? 8;

  const local = getLocalParts(from, tz);

  // Helper: shift a (year, month, day) calendar tuple by N days using UTC as a
  // pure calendar carrier (UTC has no DST, so the arithmetic is exact).
  const shiftDays = (y: number, m: number, d: number, days: number) => {
    const ms = Date.UTC(y, m - 1, d) + days * 24 * 3600 * 1000;
    const dt = new Date(ms);
    return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
  };

  if (digest.cadence === "daily") {
    let candidate = utcInstantForLocal(local.year, local.month, local.day, hour, tz);
    if (candidate.getTime() <= from.getTime()) {
      const np = shiftDays(local.year, local.month, local.day, 1);
      candidate = utcInstantForLocal(np.year, np.month, np.day, hour, tz);
    }
    return candidate;
  }

  if (digest.cadence === "monthly") {
    const dom = Math.min(Math.max(digest.dayOfMonth ?? 1, 1), 28);
    let year = local.year;
    let month = local.month;
    let candidate = utcInstantForLocal(year, month, dom, hour, tz);
    if (candidate.getTime() <= from.getTime()) {
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
      candidate = utcInstantForLocal(year, month, dom, hour, tz);
    }
    return candidate;
  }

  // weekly
  const dow = digest.dayOfWeek ?? 1;
  let delta = dow - local.weekday;
  if (delta < 0) delta += 7;
  let cp = shiftDays(local.year, local.month, local.day, delta);
  let candidate = utcInstantForLocal(cp.year, cp.month, cp.day, hour, tz);
  if (candidate.getTime() <= from.getTime()) {
    cp = shiftDays(cp.year, cp.month, cp.day, 7);
    candidate = utcInstantForLocal(cp.year, cp.month, cp.day, hour, tz);
  }
  return candidate;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return String(err);
}

export async function runDigest(digestId: string, options?: { dryRun?: boolean; baseUrl?: string }): Promise<DigestRunResult> {
  const digest = await storage.getScheduledDigest(digestId);
  if (!digest) throw new Error(`Digest ${digestId} not found`);

  const org = await storage.getOrganization(digest.organizationId);
  if (!org) throw new Error(`Organization ${digest.organizationId} not found`);

  const startedAt = new Date();
  const run = await storage.createScheduledDigestRun({
    digestId: digest.id,
    status: "running",
    emailRecipientCount: 0,
    teamsDelivered: false,
    durationMs: null,
    sectionsRendered: null,
    errorMessage: null,
    completedAt: null,
  });

  try {
    const sections = (digest.sections || []) as DigestSection[];
    const data = await gatherDigestData({
      digestName: digest.name,
      organizationId: digest.organizationId,
      organizationName: org.name,
      tenantId: digest.tenantId,
      sections,
    });

    const html = renderDigestHtml(data, options?.baseUrl);
    const pdfBuffer = await renderDigestPdf(data);

    let emailRecipientCount = 0;
    let teamsDelivered = false;
    const baseUrl = options?.baseUrl || process.env.PUBLIC_BASE_URL || "https://reveille.local";

    const hasEmailChannel = !!(digest.deliveryEmails && digest.deliveryEmails.length > 0);
    const hasTeamsChannel = !!digest.teamsWebhookUrl;
    const deliveryErrors: string[] = [];
    let anyChannelSucceeded = false;

    if (!options?.dryRun) {
      if (hasEmailChannel) {
        const result = await sendDigestEmail({
          recipients: digest.deliveryEmails!,
          subject: `${digest.name} · ${data.generatedAt.toLocaleDateString("en-US")}`,
          html,
          pdfAttachment: { filename: `${digest.name.replace(/\s+/g, "_")}.pdf`, content: pdfBuffer },
        });
        if (result.delivered) {
          emailRecipientCount = result.recipientCount;
          anyChannelSucceeded = true;
        } else {
          deliveryErrors.push(`email: ${result.message}`);
        }
      }

      if (hasTeamsChannel) {
        const card = buildAdaptiveCard(data, baseUrl);
        const teams = await sendTeamsAdaptiveCard(digest.teamsWebhookUrl!, card);
        teamsDelivered = teams.delivered;
        if (teams.delivered) {
          anyChannelSucceeded = true;
        } else {
          deliveryErrors.push(`teams: ${teams.message}`);
        }
      }

      if (!hasEmailChannel && !hasTeamsChannel) {
        deliveryErrors.push("no delivery channels configured");
      }
    } else {
      // Dry runs are inherently successful: no delivery attempted.
      emailRecipientCount = (digest.deliveryEmails || []).length;
      anyChannelSucceeded = true;
    }

    const durationMs = Date.now() - startedAt.getTime();
    const succeeded = options?.dryRun ? true : anyChannelSucceeded;
    const finalStatus: "completed" | "failed" = succeeded ? "completed" : "failed";
    const errorMsg = succeeded ? null : deliveryErrors.join("; ");

    await storage.updateScheduledDigestRun(run.id, {
      status: finalStatus,
      emailRecipientCount,
      teamsDelivered,
      durationMs,
      sectionsRendered: { sections, tenantCount: data.tenants.length, htmlBytes: html.length, pdfBytes: pdfBuffer.length },
      errorMessage: errorMsg,
      completedAt: new Date(),
    });

    if (!options?.dryRun) {
      // Always advance schedule (even on failure) so a stuck failing digest
      // doesn't block subsequent attempts; lastRunAt records the last attempt.
      await storage.updateScheduledDigest(digest.id, {
        lastRunAt: new Date(),
        nextRunAt: computeNextRunAt(digest, new Date()),
      });
    }

    return {
      runId: run.id,
      digestId: digest.id,
      status: finalStatus,
      emailRecipientCount,
      teamsDelivered,
      durationMs,
      error: errorMsg ?? undefined,
    };
  } catch (err) {
    const durationMs = Date.now() - startedAt.getTime();
    const message = errorMessage(err);
    await storage.updateScheduledDigestRun(run.id, {
      status: "failed",
      durationMs,
      errorMessage: message,
      completedAt: new Date(),
    });
    return {
      runId: run.id,
      digestId: digest.id,
      status: "failed",
      emailRecipientCount: 0,
      teamsDelivered: false,
      durationMs,
      error: message,
    };
  }
}
