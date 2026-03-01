import { db } from "./db";
import { organizations, tenants, monitoredSystems, syntheticTests, alertRules, alerts } from "@shared/schema";
import { sql } from "drizzle-orm";

export async function seedDatabase() {
  const existingOrgs = await db.select({ count: sql<number>`count(*)` }).from(organizations);
  if (Number(existingOrgs[0].count) > 0) return;

  const [cascadiaOrg] = await db.insert(organizations).values([
    { name: "Cascadia Oceanic", domain: "cascadiaoceanic.sharepoint.com", adminEmail: "chris@chrismcnulty.net", mode: "standard" },
  ]).returning();

  const [synozurOrg] = await db.insert(organizations).values([
    { name: "Synozur", domain: "synozur.sharepoint.com", adminEmail: "chris.mcnulty@synozur.com", mode: "msp" },
  ]).returning();

  const [cascadiaTenant] = await db.insert(tenants).values([
    { organizationId: cascadiaOrg.id, name: "Cascadia Oceanic", adminEmail: "chris@chrismcnulty.net", primaryDomain: "cascadiaoceanic.sharepoint.com", status: "Healthy", consentStatus: "Pending" },
  ]).returning();

  const [acme, globex, initech, soylent] = await db.insert(tenants).values([
    { organizationId: synozurOrg.id, name: "Acme Corp", adminEmail: "admin@acmecorp.com", primaryDomain: "acmecorp.onmicrosoft.com", status: "Healthy", consentStatus: "Connected", consentedBy: "admin@acmecorp.com", consentedAt: new Date("2023-10-24"), azureTenantId: "123e4567-e89b-12d3-a456-426614174000" },
    { organizationId: synozurOrg.id, name: "Globex", adminEmail: "admin@globex.com", primaryDomain: "globex.onmicrosoft.com", status: "Warning", consentStatus: "Connected", consentedBy: "admin@globex.com", consentedAt: new Date("2023-11-15"), azureTenantId: "789e0123-e89b-12d3-a456-426614174001" },
    { organizationId: synozurOrg.id, name: "Initech", adminEmail: "admin@initech.com", primaryDomain: "initech.onmicrosoft.com", status: "Critical", consentStatus: "Connected", consentedBy: "admin@initech.com", consentedAt: new Date("2024-01-10"), azureTenantId: "456e7890-e89b-12d3-a456-426614174002" },
    { organizationId: synozurOrg.id, name: "Soylent", adminEmail: "admin@soylent.com", primaryDomain: "soylent.onmicrosoft.com", status: "Healthy", consentStatus: "Connected", consentedBy: "admin@soylent.com", consentedAt: new Date("2024-02-20"), azureTenantId: "012e3456-e89b-12d3-a456-426614174003" },
  ]).returning();

  const [synozurTenant] = await db.insert(tenants).values([
    { organizationId: synozurOrg.id, name: "Synozur", adminEmail: "chris.mcnulty@synozur.com", primaryDomain: "synozur.sharepoint.com", status: "Healthy", consentStatus: "Connected", consentedBy: "chris.mcnulty@synozur.com", consentedAt: new Date("2024-03-01") },
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
    { tenantId: cascadiaTenant.id, name: "Microsoft 365", type: "m365", status: "Healthy", latency: "380ms" },
  ]);

  await db.insert(syntheticTests).values([
    { tenantId: acme.id, name: "Main Hub Load", type: "Page Load", target: "https://acmecorp.sharepoint.com", interval: "5 min", status: "Active" },
    { tenantId: acme.id, name: "Documents Library Upload", type: "File Transfer", target: "/sites/docs/Shared Documents", interval: "15 min", status: "Active" },
    { tenantId: acme.id, name: "People Search", type: "Search", target: "query='marketing'", interval: "10 min", status: "Paused" },
    { tenantId: acme.id, name: "Token Acquisition", type: "Authentication", target: "login.microsoftonline.com", interval: "5 min", status: "Active" },
    { tenantId: globex.id, name: "Globex Hub Load", type: "Page Load", target: "https://globex.sharepoint.com", interval: "5 min", status: "Active" },
    { tenantId: initech.id, name: "Initech Portal", type: "Page Load", target: "https://initech.sharepoint.com", interval: "5 min", status: "Active" },
    { tenantId: soylent.id, name: "Soylent Hub Load", type: "Page Load", target: "https://soylent.sharepoint.com", interval: "5 min", status: "Active" },
    { tenantId: cascadiaTenant.id, name: "Hub Load", type: "Page Load", target: "https://cascadiaoceanic.sharepoint.com", interval: "5 min", status: "Active" },
    { tenantId: cascadiaTenant.id, name: "File Upload", type: "File Transfer", target: "/sites/docs/Shared Documents", interval: "15 min", status: "Active" },
  ]);

  await db.insert(alertRules).values([
    { tenantId: acme.id, name: "Page Load SLA Breach", description: "Triggers when average page load time exceeds 3000ms", metric: "page_load", condition: "gt", threshold: 3000, enabled: true, channels: [{ type: "email", target: "admin@acmecorp.com" }, { type: "teams", target: "#it-ops-alerts" }] },
    { tenantId: acme.id, name: "Authentication Failure Spike", description: "Triggers when auth failure rate exceeds 5% in 15 mins", metric: "error_rate", condition: "gt", threshold: 5, enabled: false, channels: [{ type: "email", target: "admin@acmecorp.com" }] },
    { tenantId: globex.id, name: "File Transfer SLA", description: "Triggers when file upload exceeds 5000ms", metric: "file_upload", condition: "gt", threshold: 5000, enabled: true, channels: [{ type: "webhook", target: "https://globex.webhook.io/alerts" }] },
  ]);

  await db.insert(alerts).values([
    { tenantId: initech.id, title: "Critical: Page load exceeding 3.5s", severity: "critical", message: "Initech Portal load time consistently above SLA threshold for 2 hours.", acknowledged: false },
    { tenantId: globex.id, title: "Warning: OpenText latency elevated", severity: "warning", message: "OpenText API response times degraded to 1.2s average.", acknowledged: false },
    { tenantId: acme.id, title: "Resolved: HR Portal brief outage", severity: "info", message: "HR Portal experienced 5 min outage, now recovered.", acknowledged: true },
  ]);

  console.log("Database seeded successfully.");
}
