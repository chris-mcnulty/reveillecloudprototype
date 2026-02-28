import { db } from "./db";
import { tenants, monitoredSystems, syntheticTests, alertRules, metrics, alerts } from "@shared/schema";
import { sql } from "drizzle-orm";

export async function seedDatabase() {
  const existing = await db.select({ count: sql<number>`count(*)` }).from(tenants);
  if (Number(existing[0].count) > 0) return;

  const [acme, globex, initech, soylent] = await db.insert(tenants).values([
    { name: "Acme Corp", adminEmail: "admin@acmecorp.com", primaryDomain: "acmecorp.onmicrosoft.com", status: "Healthy", consentStatus: "Connected", consentedBy: "admin@acmecorp.com", consentedAt: new Date("2023-10-24"), azureTenantId: "123e4567-e89b-12d3-a456-426614174000" },
    { name: "Globex", adminEmail: "admin@globex.com", primaryDomain: "globex.onmicrosoft.com", status: "Warning", consentStatus: "Connected", consentedBy: "admin@globex.com", consentedAt: new Date("2023-11-15"), azureTenantId: "789e0123-e89b-12d3-a456-426614174001" },
    { name: "Initech", adminEmail: "admin@initech.com", primaryDomain: "initech.onmicrosoft.com", status: "Critical", consentStatus: "Connected", consentedBy: "admin@initech.com", consentedAt: new Date("2024-01-10"), azureTenantId: "456e7890-e89b-12d3-a456-426614174002" },
    { name: "Soylent", adminEmail: "admin@soylent.com", primaryDomain: "soylent.onmicrosoft.com", status: "Healthy", consentStatus: "Connected", consentedBy: "admin@soylent.com", consentedAt: new Date("2024-02-20"), azureTenantId: "012e3456-e89b-12d3-a456-426614174003" },
  ]).returning();

  await db.insert(monitoredSystems).values([
    { tenantId: acme.id, name: "Microsoft 365", type: "m365", status: "Healthy", latency: "420ms" },
    { tenantId: acme.id, name: "Google Workspace", type: "gws", status: "Warning", latency: "850ms" },
    { tenantId: globex.id, name: "Microsoft 365", type: "m365", status: "Healthy", latency: "380ms" },
    { tenantId: globex.id, name: "OpenText", type: "opentext", status: "Warning", latency: "1.2s" },
    { tenantId: initech.id, name: "Microsoft 365", type: "m365", status: "Critical", latency: "3.5s" },
    { tenantId: soylent.id, name: "Microsoft 365", type: "m365", status: "Healthy", latency: "450ms" },
    { tenantId: soylent.id, name: "OpenText", type: "opentext", status: "Healthy", latency: "600ms" },
    { tenantId: soylent.id, name: "Google Workspace", type: "gws", status: "Healthy", latency: "320ms" },
  ]);

  await db.insert(syntheticTests).values([
    { tenantId: acme.id, name: "Main Hub Load", type: "Page Load", target: "https://acmecorp.sharepoint.com", interval: "5 min", status: "Active" },
    { tenantId: acme.id, name: "Documents Library Upload", type: "File Transfer", target: "/sites/docs/Shared Documents", interval: "15 min", status: "Active" },
    { tenantId: acme.id, name: "People Search", type: "Search", target: "query='marketing'", interval: "10 min", status: "Paused" },
    { tenantId: acme.id, name: "Token Acquisition", type: "Authentication", target: "login.microsoftonline.com", interval: "5 min", status: "Active" },
    { tenantId: globex.id, name: "Globex Hub Load", type: "Page Load", target: "https://globex.sharepoint.com", interval: "5 min", status: "Active" },
    { tenantId: initech.id, name: "Initech Portal", type: "Page Load", target: "https://initech.sharepoint.com", interval: "5 min", status: "Active" },
    { tenantId: soylent.id, name: "Soylent Hub Load", type: "Page Load", target: "https://soylent.sharepoint.com", interval: "5 min", status: "Active" },
  ]);

  await db.insert(alertRules).values([
    { tenantId: acme.id, name: "Page Load SLA Breach", description: "Triggers when average page load time exceeds 3000ms", metric: "page_load", condition: "gt", threshold: 3000, enabled: true, channels: [{ type: "email", target: "admin@acmecorp.com" }, { type: "teams", target: "#it-ops-alerts" }] },
    { tenantId: acme.id, name: "Authentication Failure Spike", description: "Triggers when auth failure rate exceeds 5% in 15 mins", metric: "error_rate", condition: "gt", threshold: 5, enabled: false, channels: [{ type: "email", target: "admin@acmecorp.com" }] },
    { tenantId: globex.id, name: "File Transfer SLA", description: "Triggers when file upload exceeds 5000ms", metric: "file_upload", condition: "gt", threshold: 5000, enabled: true, channels: [{ type: "webhook", target: "https://globex.webhook.io/alerts" }] },
  ]);

  const now = Date.now();
  const metricValues: any[] = [];
  const sites = ["Hub", "HR Portal", "IT Support", "Marketing", "Engineering"];
  const testTypes = ["Page Load", "File Upload", "Search Query", "Authentication"];

  for (let i = 0; i < 48; i++) {
    const ts = new Date(now - i * 30 * 60 * 1000);
    const hour = ts.getHours();
    const loadFactor = hour >= 8 && hour <= 17 ? 1.5 : 0.8;

    metricValues.push(
      { tenantId: acme.id, metricName: "page_load", value: Math.round((400 + Math.random() * 200) * loadFactor), unit: "ms", site: sites[i % 5], status: Math.random() > 0.95 ? "Failed" : "Success", timestamp: ts },
      { tenantId: acme.id, metricName: "file_upload", value: Math.round((1000 + Math.random() * 500) * loadFactor), unit: "ms", site: "Documents", status: Math.random() > 0.9 ? "Failed" : "Success", timestamp: ts },
      { tenantId: acme.id, metricName: "search", value: Math.round((600 + Math.random() * 300) * loadFactor), unit: "ms", site: "Search", status: "Success", timestamp: ts },
      { tenantId: globex.id, metricName: "page_load", value: Math.round((350 + Math.random() * 150) * loadFactor), unit: "ms", site: "Main Hub", status: "Success", timestamp: ts },
      { tenantId: initech.id, metricName: "page_load", value: Math.round((2500 + Math.random() * 1500) * loadFactor), unit: "ms", site: "Portal", status: Math.random() > 0.7 ? "Failed" : "Success", timestamp: ts },
      { tenantId: soylent.id, metricName: "page_load", value: Math.round((380 + Math.random() * 120) * loadFactor), unit: "ms", site: "Hub", status: "Success", timestamp: ts },
    );
  }

  for (let i = 0; i < metricValues.length; i += 50) {
    await db.insert(metrics).values(metricValues.slice(i, i + 50));
  }

  await db.insert(alerts).values([
    { tenantId: initech.id, title: "Critical: Page load exceeding 3.5s", severity: "critical", message: "Initech Portal load time consistently above SLA threshold for 2 hours.", acknowledged: false },
    { tenantId: globex.id, title: "Warning: OpenText latency elevated", severity: "warning", message: "OpenText API response times degraded to 1.2s average.", acknowledged: false },
    { tenantId: acme.id, title: "Resolved: HR Portal brief outage", severity: "info", message: "HR Portal experienced 5 min outage, now recovered.", acknowledged: true },
  ]);

  console.log("Database seeded successfully.");
}
