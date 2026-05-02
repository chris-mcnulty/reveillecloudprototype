import PDFDocument from "pdfkit";
import { storage } from "../storage";
import type { Tenant } from "@shared/schema";
import type { AdaptiveCardPayload } from "./delivery";

export type DigestSection = "performance" | "alerts" | "llm" | "copilot" | "signins";

export interface DigestData {
  digestName: string;
  organizationName: string;
  tenants: Tenant[];
  generatedAt: Date;
  sections: DigestSection[];
  windowDays: number;
  perTenant: Record<string, TenantSectionData>;
}

export interface TenantSectionData {
  tenantId: string;
  tenantName: string;
  performance?: {
    totalTests: number;
    avgLatencyMs: number;
    errorCount: number;
  };
  alerts?: {
    activeCount: number;
    criticalCount: number;
    warningCount: number;
    recent: { title: string; severity: string; timestamp: string | null }[];
  };
  llm?: {
    totalCalls: number;
    successCount: number;
    errorRate: number;
    avgDurationMs: number;
    totalCostCents: number;
  };
  copilot?: {
    totalInteractions: number;
    uniqueUsers: number;
    successRate: number;
  };
  signins?: {
    totalSignIns: number;
    failureCount: number;
    riskySignIns: number;
    mfaRate: number;
  };
}

const SECTION_LABELS: Record<DigestSection, string> = {
  performance: "Performance",
  alerts: "Alerts",
  llm: "LLM Spend",
  copilot: "Copilot",
  signins: "Sign-Ins",
};

export async function gatherDigestData(args: {
  digestName: string;
  organizationId: string;
  organizationName: string;
  tenantId: string | null;
  sections: DigestSection[];
  windowDays?: number;
}): Promise<DigestData> {
  const windowDays = args.windowDays ?? 7;
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const allTenants = args.tenantId
    ? [await storage.getTenant(args.tenantId)].filter(Boolean) as Tenant[]
    : (await storage.getTenantsByOrg(args.organizationId));

  const perTenant: Record<string, TenantSectionData> = {};

  for (const tenant of allTenants) {
    const t: TenantSectionData = { tenantId: tenant.id, tenantName: tenant.name };

    if (args.sections.includes("performance")) {
      try {
        const summary = await storage.getMetricsSummary(tenant.id);
        t.performance = {
          totalTests: summary.totalTests,
          avgLatencyMs: Math.round(summary.avgLatency || 0),
          errorCount: summary.errorCount,
        };
      } catch {
        t.performance = { totalTests: 0, avgLatencyMs: 0, errorCount: 0 };
      }
    }

    if (args.sections.includes("alerts")) {
      try {
        const all = await storage.getAlerts(tenant.id);
        const active = all.filter(a => !a.acknowledged);
        t.alerts = {
          activeCount: active.length,
          criticalCount: active.filter(a => a.severity === "critical").length,
          warningCount: active.filter(a => a.severity === "warning").length,
          recent: active.slice(0, 5).map(a => ({
            title: a.title,
            severity: a.severity,
            timestamp: a.timestamp ? new Date(a.timestamp).toISOString() : null,
          })),
        };
      } catch {
        t.alerts = { activeCount: 0, criticalCount: 0, warningCount: 0, recent: [] };
      }
    }

    if (args.sections.includes("llm")) {
      try {
        const stats = await storage.getLlmStats(tenant.id, { since });
        t.llm = {
          totalCalls: stats.totalCalls,
          successCount: stats.successCount,
          errorRate: stats.errorRate,
          avgDurationMs: Math.round(stats.avgDurationMs || 0),
          totalCostCents: Math.round(stats.totalCostCents || 0),
        };
      } catch {
        t.llm = { totalCalls: 0, successCount: 0, errorRate: 0, avgDurationMs: 0, totalCostCents: 0 };
      }
    }

    if (args.sections.includes("copilot")) {
      try {
        const stats = await storage.getCopilotInteractionStats(tenant.id);
        t.copilot = {
          totalInteractions: stats.totalInteractions,
          uniqueUsers: stats.uniqueUsers,
          successRate: stats.successRate,
        };
      } catch {
        t.copilot = { totalInteractions: 0, uniqueUsers: 0, successRate: 0 };
      }
    }

    if (args.sections.includes("signins")) {
      try {
        const stats = await storage.getEntraSignInStats(tenant.id);
        t.signins = {
          totalSignIns: stats.totalSignIns,
          failureCount: stats.failureCount,
          riskySignIns: stats.riskySignIns,
          mfaRate: stats.mfaRate,
        };
      } catch {
        t.signins = { totalSignIns: 0, failureCount: 0, riskySignIns: 0, mfaRate: 0 };
      }
    }

    perTenant[tenant.id] = t;
  }

  return {
    digestName: args.digestName,
    organizationName: args.organizationName,
    tenants: allTenants,
    generatedAt: new Date(),
    sections: args.sections,
    windowDays,
    perTenant,
  };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtNum(n: number): string {
  return Number.isFinite(n) ? n.toLocaleString() : "0";
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function fmtCostCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function renderDigestHtml(data: DigestData, baseUrl?: string): string {
  const link = baseUrl || "https://reveille.local";
  const sectionRows = (t: TenantSectionData) => {
    const out: string[] = [];
    if (t.performance) {
      out.push(`<tr><td><strong>Performance</strong></td><td>${fmtNum(t.performance.totalTests)} tests · avg ${t.performance.avgLatencyMs}ms · ${fmtNum(t.performance.errorCount)} errors</td></tr>`);
    }
    if (t.alerts) {
      out.push(`<tr><td><strong>Alerts</strong></td><td>${fmtNum(t.alerts.activeCount)} active (<span style="color:#dc2626">${fmtNum(t.alerts.criticalCount)} critical</span>, <span style="color:#d97706">${fmtNum(t.alerts.warningCount)} warning</span>)</td></tr>`);
      if (t.alerts.recent.length > 0) {
        out.push(`<tr><td></td><td><ul style="margin:4px 0 0 0;padding-left:18px;font-size:12px;color:#475569">${t.alerts.recent.map(a => `<li>[${escapeHtml(a.severity)}] ${escapeHtml(a.title)}</li>`).join("")}</ul></td></tr>`);
      }
    }
    if (t.llm) {
      out.push(`<tr><td><strong>LLM Spend</strong></td><td>${fmtNum(t.llm.totalCalls)} calls · ${fmtPct(1 - t.llm.errorRate)} success · ${t.llm.avgDurationMs}ms avg · ${fmtCostCents(t.llm.totalCostCents)} cost</td></tr>`);
    }
    if (t.copilot) {
      out.push(`<tr><td><strong>Copilot</strong></td><td>${fmtNum(t.copilot.totalInteractions)} interactions · ${fmtNum(t.copilot.uniqueUsers)} users · ${fmtPct(t.copilot.successRate)} success</td></tr>`);
    }
    if (t.signins) {
      out.push(`<tr><td><strong>Sign-Ins</strong></td><td>${fmtNum(t.signins.totalSignIns)} total · ${fmtNum(t.signins.failureCount)} failures · ${fmtNum(t.signins.riskySignIns)} risky · MFA ${fmtPct(t.signins.mfaRate)}</td></tr>`);
    }
    return out.join("");
  };

  const tenantBlocks = data.tenants.map(t => {
    const td = data.perTenant[t.id];
    return `
      <div style="border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:16px;background:#fff">
        <h3 style="margin:0 0 12px 0;color:#0f172a;font-size:16px">${escapeHtml(t.name)}</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px;color:#0f172a">
          ${sectionRows(td)}
        </table>
      </div>
    `;
  }).join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(data.digestName)}</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a">
<div style="max-width:720px;margin:0 auto;padding:24px">
  <div style="background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);color:#fff;padding:24px;border-radius:8px;margin-bottom:20px">
    <h1 style="margin:0 0 4px 0;font-size:22px">${escapeHtml(data.digestName)}</h1>
    <p style="margin:0;color:#cbd5e1;font-size:13px">${escapeHtml(data.organizationName)} · ${data.windowDays}-day window · Generated ${data.generatedAt.toLocaleString("en-US")}</p>
  </div>
  <div style="margin-bottom:16px;font-size:13px;color:#475569">
    Sections: ${data.sections.map(s => SECTION_LABELS[s]).join(" · ")}
  </div>
  ${tenantBlocks}
  <div style="text-align:center;padding:16px;color:#64748b;font-size:12px">
    <a href="${escapeHtml(link)}" style="color:#3b82f6;text-decoration:none">Open Reveille</a>
  </div>
</div>
</body></html>`;
}

export async function renderDigestPdf(data: DigestData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 48, size: "LETTER" });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc.fontSize(20).fillColor("#0f172a").text(data.digestName, { align: "left" });
      doc.fontSize(10).fillColor("#64748b").text(`${data.organizationName} · ${data.windowDays}-day window`);
      doc.text(`Generated ${data.generatedAt.toLocaleString("en-US")}`);
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor("#475569").text(`Sections: ${data.sections.map(s => SECTION_LABELS[s]).join(", ")}`);
      doc.moveDown(1);

      for (const t of data.tenants) {
        const td = data.perTenant[t.id];
        doc.fontSize(14).fillColor("#0f172a").text(t.name);
        doc.moveDown(0.3);
        doc.fontSize(10).fillColor("#0f172a");

        if (td.performance) {
          doc.text(`Performance: ${td.performance.totalTests} tests, avg ${td.performance.avgLatencyMs}ms, ${td.performance.errorCount} errors`);
        }
        if (td.alerts) {
          doc.text(`Alerts: ${td.alerts.activeCount} active (${td.alerts.criticalCount} critical, ${td.alerts.warningCount} warning)`);
          for (const a of td.alerts.recent) {
            doc.fontSize(9).fillColor("#475569").text(`  - [${a.severity}] ${a.title}`);
          }
          doc.fontSize(10).fillColor("#0f172a");
        }
        if (td.llm) {
          doc.text(`LLM Spend: ${td.llm.totalCalls} calls, ${fmtPct(1 - td.llm.errorRate)} success, avg ${td.llm.avgDurationMs}ms, ${fmtCostCents(td.llm.totalCostCents)} cost`);
        }
        if (td.copilot) {
          doc.text(`Copilot: ${td.copilot.totalInteractions} interactions, ${td.copilot.uniqueUsers} users, ${fmtPct(td.copilot.successRate)} success`);
        }
        if (td.signins) {
          doc.text(`Sign-Ins: ${td.signins.totalSignIns} total, ${td.signins.failureCount} failures, ${td.signins.riskySignIns} risky, MFA ${fmtPct(td.signins.mfaRate)}`);
        }

        doc.moveDown(0.8);
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

export function buildAdaptiveCard(data: DigestData, deepLinkUrl: string): AdaptiveCardPayload {
  const totals = data.tenants.reduce((acc, t) => {
    const td = data.perTenant[t.id];
    if (td.alerts) {
      acc.activeAlerts += td.alerts.activeCount;
      acc.criticalAlerts += td.alerts.criticalCount;
    }
    if (td.llm) {
      acc.llmCalls += td.llm.totalCalls;
      acc.llmCostCents += td.llm.totalCostCents;
    }
    if (td.signins) {
      acc.signinFailures += td.signins.failureCount;
    }
    return acc;
  }, { activeAlerts: 0, criticalAlerts: 0, llmCalls: 0, llmCostCents: 0, signinFailures: 0 });

  const facts: { title: string; value: string }[] = [
    { title: "Tenants", value: String(data.tenants.length) },
    { title: "Window", value: `${data.windowDays} days` },
  ];
  if (data.sections.includes("alerts")) {
    facts.push({ title: "Active alerts", value: `${totals.activeAlerts} (${totals.criticalAlerts} critical)` });
  }
  if (data.sections.includes("llm")) {
    facts.push({ title: "LLM calls", value: fmtNum(totals.llmCalls) });
    facts.push({ title: "LLM spend", value: fmtCostCents(totals.llmCostCents) });
  }
  if (data.sections.includes("signins")) {
    facts.push({ title: "Sign-in failures", value: fmtNum(totals.signinFailures) });
  }

  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          type: "AdaptiveCard",
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          version: "1.4",
          body: [
            {
              type: "TextBlock",
              size: "Large",
              weight: "Bolder",
              text: data.digestName,
            },
            {
              type: "TextBlock",
              isSubtle: true,
              spacing: "None",
              text: `${data.organizationName} · ${data.generatedAt.toLocaleDateString("en-US")}`,
            },
            {
              type: "FactSet",
              facts,
            },
            {
              type: "TextBlock",
              text: `Sections: ${data.sections.map(s => SECTION_LABELS[s]).join(" · ")}`,
              isSubtle: true,
              wrap: true,
            },
          ],
          actions: [
            {
              type: "Action.OpenUrl",
              title: "View in Reveille",
              url: deepLinkUrl,
            },
          ],
        },
      },
    ],
  };
}
