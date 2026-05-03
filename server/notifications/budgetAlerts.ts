import { sendDigestEmail, sendTeamsAdaptiveCard, type AdaptiveCardPayload } from "../digests/delivery";
import type { Alert, AlertRule, Tenant } from "@shared/schema";
import { lookup } from "node:dns/promises";

export interface BudgetAlertContext {
  alert: Alert;
  rule: AlertRule;
  tenant: Tenant | undefined;
  thresholdPercent: number;
  spentCents: number;
  budgetCents: number;
  percent: number;
  modelLabel?: string | null;
}

export interface BudgetNotificationResult {
  channel: string;
  target: string;
  delivered: boolean;
  message: string;
}

function getBaseUrl(): string {
  return process.env.PUBLIC_BASE_URL || "https://reveille.local";
}

function costExplorerLink(tenantId: string): string {
  const base = getBaseUrl().replace(/\/+$/, "");
  return `${base}/llm-performance?tenant=${encodeURIComponent(tenantId)}`;
}

function severityColor(thresholdPercent: number): string {
  if (thresholdPercent >= 100) return "Attention";
  if (thresholdPercent >= 80) return "Warning";
  return "Accent";
}

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function buildSubject(ctx: BudgetAlertContext): string {
  const tenantName = ctx.tenant?.name ?? "Tenant";
  const scope = ctx.modelLabel ? ` (${ctx.modelLabel})` : "";
  if (ctx.thresholdPercent >= 100) {
    return `[Reveille] LLM budget exceeded for ${tenantName}${scope} — ${ctx.percent.toFixed(0)}%`;
  }
  return `[Reveille] LLM budget at ${ctx.thresholdPercent}% for ${tenantName}${scope}`;
}

function buildEmailHtml(ctx: BudgetAlertContext): string {
  const tenantName = ctx.tenant?.name ?? "Tenant";
  const scope = ctx.modelLabel ?? "All models";
  const link = costExplorerLink(ctx.rule.tenantId);
  const headline = ctx.thresholdPercent >= 100
    ? `LLM budget exceeded (${ctx.percent.toFixed(1)}%)`
    : `LLM budget reached ${ctx.thresholdPercent}% threshold`;
  return `
<!doctype html>
<html><body style="font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#111;background:#f6f7fb;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
    <div style="padding:16px 20px;background:${ctx.thresholdPercent >= 100 ? "#fee2e2" : "#fef3c7"};border-bottom:1px solid #e5e7eb;">
      <h2 style="margin:0;font-size:18px;">${headline}</h2>
    </div>
    <div style="padding:20px;">
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:6px 0;color:#6b7280;">Tenant</td><td style="padding:6px 0;text-align:right;font-weight:600;">${escapeHtml(tenantName)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Model scope</td><td style="padding:6px 0;text-align:right;">${escapeHtml(scope)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Threshold</td><td style="padding:6px 0;text-align:right;">${ctx.thresholdPercent}%</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">MTD spend</td><td style="padding:6px 0;text-align:right;font-weight:600;">${formatUsd(ctx.spentCents)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Monthly cap</td><td style="padding:6px 0;text-align:right;">${formatUsd(ctx.budgetCents)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">% of budget</td><td style="padding:6px 0;text-align:right;font-weight:600;">${ctx.percent.toFixed(1)}%</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Rule</td><td style="padding:6px 0;text-align:right;">${escapeHtml(ctx.rule.name)}</td></tr>
      </table>
      <div style="margin-top:20px;text-align:center;">
        <a href="${link}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Open Cost Explorer</a>
      </div>
      <p style="margin-top:18px;font-size:12px;color:#6b7280;">${escapeHtml(ctx.alert.message ?? "")}</p>
    </div>
  </div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c] as string));
}

function buildAdaptiveCard(ctx: BudgetAlertContext): AdaptiveCardPayload {
  const tenantName = ctx.tenant?.name ?? "Tenant";
  const scope = ctx.modelLabel ?? "All models";
  const link = costExplorerLink(ctx.rule.tenantId);
  const headline = ctx.thresholdPercent >= 100
    ? `LLM budget exceeded — ${ctx.percent.toFixed(0)}% of cap`
    : `LLM budget at ${ctx.thresholdPercent}% threshold`;

  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            {
              type: "TextBlock",
              size: "Large",
              weight: "Bolder",
              color: severityColor(ctx.thresholdPercent),
              text: headline,
              wrap: true,
            },
            {
              type: "TextBlock",
              spacing: "None",
              isSubtle: true,
              text: ctx.rule.name,
              wrap: true,
            },
            {
              type: "FactSet",
              facts: [
                { title: "Tenant", value: tenantName },
                { title: "Model scope", value: scope },
                { title: "Threshold", value: `${ctx.thresholdPercent}%` },
                { title: "MTD spend", value: formatUsd(ctx.spentCents) },
                { title: "Monthly cap", value: formatUsd(ctx.budgetCents) },
                { title: "% of budget", value: `${ctx.percent.toFixed(1)}%` },
              ],
            },
          ],
          actions: [
            {
              type: "Action.OpenUrl",
              title: "Open Cost Explorer",
              url: link,
            },
          ],
        },
      },
    ],
  };
}

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "ip6-localhost" || h === "ip6-loopback") return true;
  if (h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "metadata.google.internal" || h === "metadata") return true;

  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const parts = ipv4.slice(1, 5).map(Number);
    if (parts.some(n => n < 0 || n > 255)) return true;
    const [a, b] = parts;
    if (a === 10) return true;                      // 10.0.0.0/8
    if (a === 127) return true;                     // loopback
    if (a === 0) return true;                       // 0.0.0.0/8
    if (a === 169 && b === 254) return true;        // link-local / metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true;        // 192.168.0.0/16
    if (a === 192 && b === 0) return true;          // 192.0.0.0/24, 192.0.2.0/24
    if (a >= 224) return true;                      // multicast/reserved
    return false;
  }
  if (h.startsWith("[") && h.endsWith("]")) {
    const v6 = h.slice(1, -1);
    if (v6 === "::1" || v6 === "::" ) return true;
    if (v6.startsWith("fc") || v6.startsWith("fd")) return true; // ULA
    if (v6.startsWith("fe80")) return true;                       // link-local
    if (v6.startsWith("ff")) return true;                         // multicast
    return false;
  }
  return false;
}

async function sendWebhook(target: string, ctx: BudgetAlertContext): Promise<{ delivered: boolean; message: string }> {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return { delivered: false, message: "Invalid webhook URL" };
  }
  if (url.protocol !== "https:") {
    return { delivered: false, message: "Webhook URL must use HTTPS" };
  }
  if (url.username || url.password) {
    return { delivered: false, message: "Webhook URL must not contain credentials" };
  }
  if (isBlockedHost(url.hostname)) {
    return { delivered: false, message: `Webhook host '${url.hostname}' is blocked (private/loopback/metadata)` };
  }
  try {
    const addrs = await lookup(url.hostname, { all: true });
    for (const a of addrs) {
      const literal = a.family === 6 ? `[${a.address}]` : a.address;
      if (isBlockedHost(literal)) {
        return { delivered: false, message: `Webhook host '${url.hostname}' resolves to blocked address ${a.address}` };
      }
    }
  } catch (err) {
    return { delivered: false, message: `DNS lookup failed for ${url.hostname}: ${err instanceof Error ? err.message : "unknown"}` };
  }
  const payload = {
    type: "llm_budget_alert",
    alertId: ctx.alert.id,
    tenantId: ctx.rule.tenantId,
    tenantName: ctx.tenant?.name ?? null,
    ruleId: ctx.rule.id,
    ruleName: ctx.rule.name,
    thresholdPercent: ctx.thresholdPercent,
    spentCents: ctx.spentCents,
    budgetCents: ctx.budgetCents,
    percent: ctx.percent,
    modelScope: ctx.modelLabel ?? null,
    title: ctx.alert.title,
    message: ctx.alert.message,
    link: costExplorerLink(ctx.rule.tenantId),
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "error",
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      return { delivered: false, message: `Webhook failed: ${res.status} ${text.slice(0, 200)}` };
    }
    return { delivered: true, message: "ok" };
  } catch (err) {
    return { delivered: false, message: err instanceof Error ? err.message : "Unknown error" };
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendBudgetAlertNotifications(
  ctx: BudgetAlertContext,
): Promise<BudgetNotificationResult[]> {
  const channels = (ctx.rule.channels ?? []) as { type: string; target: string }[];
  if (!channels.length) return [];

  const subject = buildSubject(ctx);
  const html = buildEmailHtml(ctx);
  const card = buildAdaptiveCard(ctx);

  const results: BudgetNotificationResult[] = [];

  const emailRecipients = channels
    .filter(c => c.type.toLowerCase() === "email" && c.target.includes("@"))
    .map(c => c.target);

  if (emailRecipients.length > 0) {
    const r = await sendDigestEmail({ recipients: emailRecipients, subject, html });
    for (const target of emailRecipients) {
      results.push({ channel: "email", target, delivered: r.delivered, message: r.message });
    }
  }

  for (const c of channels) {
    const type = c.type.toLowerCase();
    if (type === "teams") {
      if (!/^https:\/\//i.test(c.target)) {
        results.push({ channel: "teams", target: c.target, delivered: false, message: "Teams target must be a webhook URL" });
        continue;
      }
      const r = await sendTeamsAdaptiveCard(c.target, card);
      results.push({ channel: "teams", target: c.target, delivered: r.delivered, message: r.message });
    } else if (type === "webhook") {
      const r = await sendWebhook(c.target, ctx);
      results.push({ channel: "webhook", target: c.target, delivered: r.delivered, message: r.message });
    } else if (type !== "email") {
      results.push({ channel: type, target: c.target, delivered: false, message: `Unsupported channel type '${type}'` });
    }
  }

  return results;
}
