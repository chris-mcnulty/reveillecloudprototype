import { db } from "./db";
import { tenants, metrics } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

export async function seedDemoMetrics() {
  const allTenants = await db.select().from(tenants);
  const findTenant = (name: string) => allTenants.find(t => t.name === name);

  const acme = findTenant("Acme Corp");
  const globex = findTenant("Globex");
  const initech = findTenant("Initech");
  const soylent = findTenant("Soylent");
  const cascadia = findTenant("Cascadia Oceanic");

  const existingCount = await db.select({ count: sql<number>`count(*)` }).from(metrics);
  if (Number(existingCount[0].count) > 0) {
    console.log(`Skipping demo metrics — ${existingCount[0].count} metrics already exist. Clear metrics table first if you want to reseed.`);
    return;
  }

  const now = Date.now();
  const metricValues: any[] = [];
  const sites = ["Hub", "HR Portal", "IT Support", "Marketing", "Engineering"];

  for (let i = 0; i < 48; i++) {
    const ts = new Date(now - i * 30 * 60 * 1000);
    const hour = ts.getHours();
    const loadFactor = hour >= 8 && hour <= 17 ? 1.5 : 0.8;

    if (acme) {
      metricValues.push(
        { tenantId: acme.id, metricName: "page_load", value: Math.round((400 + Math.random() * 200) * loadFactor), unit: "ms", site: sites[i % 5], status: Math.random() > 0.95 ? "Failed" : "Success", timestamp: ts },
        { tenantId: acme.id, metricName: "file_upload", value: Math.round((1000 + Math.random() * 500) * loadFactor), unit: "ms", site: "Documents", status: Math.random() > 0.9 ? "Failed" : "Success", timestamp: ts },
        { tenantId: acme.id, metricName: "search", value: Math.round((600 + Math.random() * 300) * loadFactor), unit: "ms", site: "Search", status: "Success", timestamp: ts },
      );
    }
    if (globex) {
      metricValues.push(
        { tenantId: globex.id, metricName: "page_load", value: Math.round((350 + Math.random() * 150) * loadFactor), unit: "ms", site: "Main Hub", status: "Success", timestamp: ts },
      );
    }
    if (initech) {
      metricValues.push(
        { tenantId: initech.id, metricName: "page_load", value: Math.round((2500 + Math.random() * 1500) * loadFactor), unit: "ms", site: "Portal", status: Math.random() > 0.7 ? "Failed" : "Success", timestamp: ts },
      );
    }
    if (soylent) {
      metricValues.push(
        { tenantId: soylent.id, metricName: "page_load", value: Math.round((380 + Math.random() * 120) * loadFactor), unit: "ms", site: "Hub", status: "Success", timestamp: ts },
      );
    }
    if (cascadia) {
      metricValues.push(
        { tenantId: cascadia.id, metricName: "page_load", value: Math.round((350 + Math.random() * 150) * loadFactor), unit: "ms", site: sites[i % 3], status: Math.random() > 0.95 ? "Failed" : "Success", timestamp: ts },
        { tenantId: cascadia.id, metricName: "file_upload", value: Math.round((900 + Math.random() * 400) * loadFactor), unit: "ms", site: "Documents", status: "Success", timestamp: ts },
      );
    }
  }

  for (let i = 0; i < metricValues.length; i += 50) {
    await db.insert(metrics).values(metricValues.slice(i, i + 50));
  }

  console.log(`Seeded ${metricValues.length} demo metrics across ${[acme, globex, initech, soylent, cascadia].filter(Boolean).length} tenants.`);
}

if (require.main === module) {
  seedDemoMetrics().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}
