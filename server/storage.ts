import { db } from "./db";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import {
  organizations, type Organization, type InsertOrganization,
  tenants, type Tenant, type InsertTenant,
  monitoredSystems, type MonitoredSystem, type InsertMonitoredSystem,
  syntheticTests, type SyntheticTest, type InsertSyntheticTest,
  alertRules, type AlertRule, type InsertAlertRule,
  metrics, type Metric, type InsertMetric,
  alerts, type Alert, type InsertAlert,
  testRuns, type TestRun, type InsertTestRun,
  scheduledJobRuns, type ScheduledJobRun, type InsertScheduledJobRun,
} from "@shared/schema";

export interface IStorage {
  getOrganizations(): Promise<Organization[]>;
  getOrganization(id: string): Promise<Organization | undefined>;
  createOrganization(org: InsertOrganization): Promise<Organization>;
  updateOrganization(id: string, data: Partial<InsertOrganization>): Promise<Organization | undefined>;
  getActiveOrganization(): Promise<Organization | undefined>;

  getTenants(): Promise<Tenant[]>;
  getTenantsByOrg(orgId: string): Promise<Tenant[]>;
  getTenant(id: string): Promise<Tenant | undefined>;
  createTenant(tenant: InsertTenant): Promise<Tenant>;
  updateTenant(id: string, data: Partial<InsertTenant>): Promise<Tenant | undefined>;
  deleteTenant(id: string): Promise<void>;

  getMonitoredSystems(tenantId: string): Promise<MonitoredSystem[]>;
  getAllMonitoredSystems(): Promise<MonitoredSystem[]>;
  createMonitoredSystem(system: InsertMonitoredSystem): Promise<MonitoredSystem>;
  updateMonitoredSystem(id: string, data: Partial<InsertMonitoredSystem>): Promise<MonitoredSystem | undefined>;
  deleteMonitoredSystem(id: string): Promise<void>;

  getSyntheticTests(tenantId: string): Promise<SyntheticTest[]>;
  getSyntheticTest(id: string): Promise<SyntheticTest | undefined>;
  createSyntheticTest(test: InsertSyntheticTest): Promise<SyntheticTest>;
  updateSyntheticTest(id: string, data: Partial<InsertSyntheticTest>): Promise<SyntheticTest | undefined>;
  deleteSyntheticTest(id: string): Promise<void>;

  getAlertRules(tenantId: string): Promise<AlertRule[]>;
  createAlertRule(rule: InsertAlertRule): Promise<AlertRule>;
  updateAlertRule(id: string, data: Partial<InsertAlertRule>): Promise<AlertRule | undefined>;
  deleteAlertRule(id: string): Promise<void>;

  getMetrics(tenantId: string, since?: Date): Promise<Metric[]>;
  getLatestMetrics(tenantId: string, limit?: number): Promise<Metric[]>;
  createMetric(metric: InsertMetric): Promise<Metric>;
  getMetricsSummary(tenantId: string): Promise<{ avgLatency: number; errorCount: number; totalTests: number }>;

  getAlerts(tenantId?: string): Promise<Alert[]>;
  createAlert(alert: InsertAlert): Promise<Alert>;
  acknowledgeAlert(id: string): Promise<Alert | undefined>;

  getGlobalStats(): Promise<{ totalTenants: number; activeIncidents: number; totalTests24h: number }>;

  getTestRuns(testId: string, limit?: number): Promise<TestRun[]>;
  getTestRunsByTenant(tenantId: string, limit?: number): Promise<TestRun[]>;
  createTestRun(run: InsertTestRun): Promise<TestRun>;
  updateTestRun(id: string, data: Partial<TestRun>): Promise<TestRun | undefined>;
  getAllTests(): Promise<SyntheticTest[]>;

  createScheduledJobRun(data: InsertScheduledJobRun): Promise<ScheduledJobRun>;
  updateScheduledJobRun(id: string, data: Partial<InsertScheduledJobRun>): Promise<ScheduledJobRun | null>;
  getScheduledJobRuns(limit?: number): Promise<ScheduledJobRun[]>;
  getScheduledJobRunsByTenant(tenantId: string, limit?: number): Promise<ScheduledJobRun[]>;
  getScheduledJobRunsByType(jobType: string, limit?: number): Promise<ScheduledJobRun[]>;
  getRunningJobs(): Promise<ScheduledJobRun[]>;
  getLatestJobRunForTest(testId: string): Promise<ScheduledJobRun | null>;
}

export class DatabaseStorage implements IStorage {
  async getOrganizations(): Promise<Organization[]> {
    return db.select().from(organizations);
  }

  async getOrganization(id: string): Promise<Organization | undefined> {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, id));
    return org;
  }

  async createOrganization(org: InsertOrganization): Promise<Organization> {
    const [created] = await db.insert(organizations).values(org).returning();
    return created;
  }

  async updateOrganization(id: string, data: Partial<InsertOrganization>): Promise<Organization | undefined> {
    const [updated] = await db.update(organizations).set(data).where(eq(organizations.id, id)).returning();
    return updated;
  }

  async getActiveOrganization(): Promise<Organization | undefined> {
    const orgs = await db.select().from(organizations);
    if (orgs.length === 1) return orgs[0];
    return orgs.find(o => o.mode === "standard") || orgs[0];
  }

  async getTenants(): Promise<Tenant[]> {
    return db.select().from(tenants);
  }

  async getTenantsByOrg(orgId: string): Promise<Tenant[]> {
    return db.select().from(tenants).where(eq(tenants.organizationId, orgId));
  }

  async getTenant(id: string): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id));
    return tenant;
  }

  async createTenant(tenant: InsertTenant): Promise<Tenant> {
    const [created] = await db.insert(tenants).values(tenant).returning();
    return created;
  }

  async updateTenant(id: string, data: Partial<InsertTenant>): Promise<Tenant | undefined> {
    const [updated] = await db.update(tenants).set(data).where(eq(tenants.id, id)).returning();
    return updated;
  }

  async deleteTenant(id: string): Promise<void> {
    await db.delete(tenants).where(eq(tenants.id, id));
  }

  async getMonitoredSystems(tenantId: string): Promise<MonitoredSystem[]> {
    return db.select().from(monitoredSystems).where(eq(monitoredSystems.tenantId, tenantId));
  }

  async getAllMonitoredSystems(): Promise<MonitoredSystem[]> {
    return db.select().from(monitoredSystems);
  }

  async createMonitoredSystem(system: InsertMonitoredSystem): Promise<MonitoredSystem> {
    const [created] = await db.insert(monitoredSystems).values(system).returning();
    return created;
  }

  async updateMonitoredSystem(id: string, data: Partial<InsertMonitoredSystem>): Promise<MonitoredSystem | undefined> {
    const [updated] = await db.update(monitoredSystems).set(data).where(eq(monitoredSystems.id, id)).returning();
    return updated;
  }

  async deleteMonitoredSystem(id: string): Promise<void> {
    await db.delete(monitoredSystems).where(eq(monitoredSystems.id, id));
  }

  async getSyntheticTests(tenantId: string): Promise<SyntheticTest[]> {
    return db.select().from(syntheticTests).where(eq(syntheticTests.tenantId, tenantId));
  }

  async getSyntheticTest(id: string): Promise<SyntheticTest | undefined> {
    const [test] = await db.select().from(syntheticTests).where(eq(syntheticTests.id, id));
    return test;
  }

  async createSyntheticTest(test: InsertSyntheticTest): Promise<SyntheticTest> {
    const [created] = await db.insert(syntheticTests).values(test).returning();
    return created;
  }

  async updateSyntheticTest(id: string, data: Partial<InsertSyntheticTest>): Promise<SyntheticTest | undefined> {
    const [updated] = await db.update(syntheticTests).set(data).where(eq(syntheticTests.id, id)).returning();
    return updated;
  }

  async deleteSyntheticTest(id: string): Promise<void> {
    await db.delete(syntheticTests).where(eq(syntheticTests.id, id));
  }

  async getAlertRules(tenantId: string): Promise<AlertRule[]> {
    return db.select().from(alertRules).where(eq(alertRules.tenantId, tenantId));
  }

  async createAlertRule(rule: InsertAlertRule): Promise<AlertRule> {
    const [created] = await db.insert(alertRules).values(rule).returning();
    return created;
  }

  async updateAlertRule(id: string, data: Partial<InsertAlertRule>): Promise<AlertRule | undefined> {
    const [updated] = await db.update(alertRules).set(data).where(eq(alertRules.id, id)).returning();
    return updated;
  }

  async deleteAlertRule(id: string): Promise<void> {
    await db.delete(alertRules).where(eq(alertRules.id, id));
  }

  async getMetrics(tenantId: string, since?: Date): Promise<Metric[]> {
    if (since) {
      return db.select().from(metrics)
        .where(and(eq(metrics.tenantId, tenantId), gte(metrics.timestamp, since)))
        .orderBy(desc(metrics.timestamp));
    }
    return db.select().from(metrics)
      .where(eq(metrics.tenantId, tenantId))
      .orderBy(desc(metrics.timestamp))
      .limit(500);
  }

  async getLatestMetrics(tenantId: string, limit = 10): Promise<Metric[]> {
    return db.select().from(metrics)
      .where(eq(metrics.tenantId, tenantId))
      .orderBy(desc(metrics.timestamp))
      .limit(limit);
  }

  async createMetric(metric: InsertMetric): Promise<Metric> {
    const [created] = await db.insert(metrics).values(metric).returning();
    return created;
  }

  async getMetricsSummary(tenantId: string): Promise<{ avgLatency: number; errorCount: number; totalTests: number }> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = await db.select({
      avgLatency: sql<number>`coalesce(avg(${metrics.value}), 0)`,
      errorCount: sql<number>`count(*) filter (where ${metrics.status} = 'Failed')`,
      totalTests: sql<number>`count(*)`,
    }).from(metrics)
      .where(and(eq(metrics.tenantId, tenantId), gte(metrics.timestamp, since)));
    return result[0] || { avgLatency: 0, errorCount: 0, totalTests: 0 };
  }

  async getAlerts(tenantId?: string): Promise<Alert[]> {
    if (tenantId) {
      return db.select().from(alerts).where(eq(alerts.tenantId, tenantId)).orderBy(desc(alerts.timestamp));
    }
    return db.select().from(alerts).orderBy(desc(alerts.timestamp));
  }

  async createAlert(alert: InsertAlert): Promise<Alert> {
    const [created] = await db.insert(alerts).values(alert).returning();
    return created;
  }

  async acknowledgeAlert(id: string): Promise<Alert | undefined> {
    const [updated] = await db.update(alerts).set({ acknowledged: true }).where(eq(alerts.id, id)).returning();
    return updated;
  }

  async getGlobalStats(): Promise<{ totalTenants: number; activeIncidents: number; totalTests24h: number }> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [tenantCount] = await db.select({ count: sql<number>`count(*)` }).from(tenants);
    const [incidentCount] = await db.select({ count: sql<number>`count(*)` }).from(alerts).where(eq(alerts.acknowledged, false));
    const [testCount] = await db.select({ count: sql<number>`count(*)` }).from(metrics).where(gte(metrics.timestamp, since));
    return {
      totalTenants: Number(tenantCount?.count || 0),
      activeIncidents: Number(incidentCount?.count || 0),
      totalTests24h: Number(testCount?.count || 0),
    };
  }

  async getTestRuns(testId: string, limit = 20): Promise<TestRun[]> {
    return db.select().from(testRuns)
      .where(eq(testRuns.testId, testId))
      .orderBy(desc(testRuns.startedAt))
      .limit(limit);
  }

  async getTestRunsByTenant(tenantId: string, limit = 50): Promise<TestRun[]> {
    return db.select().from(testRuns)
      .where(eq(testRuns.tenantId, tenantId))
      .orderBy(desc(testRuns.startedAt))
      .limit(limit);
  }

  async createTestRun(run: InsertTestRun): Promise<TestRun> {
    const [created] = await db.insert(testRuns).values(run).returning();
    return created;
  }

  async updateTestRun(id: string, data: Partial<TestRun>): Promise<TestRun | undefined> {
    const [updated] = await db.update(testRuns).set(data).where(eq(testRuns.id, id)).returning();
    return updated;
  }

  async getAllTests(): Promise<SyntheticTest[]> {
    return db.select().from(syntheticTests);
  }

  async createScheduledJobRun(data: InsertScheduledJobRun): Promise<ScheduledJobRun> {
    const [jobRun] = await db.insert(scheduledJobRuns).values(data).returning();
    return jobRun;
  }

  async updateScheduledJobRun(id: string, data: Partial<InsertScheduledJobRun>): Promise<ScheduledJobRun | null> {
    const [jobRun] = await db.update(scheduledJobRuns)
      .set(data)
      .where(eq(scheduledJobRuns.id, id))
      .returning();
    return jobRun || null;
  }

  async getScheduledJobRuns(limit = 100): Promise<ScheduledJobRun[]> {
    return db.select().from(scheduledJobRuns)
      .orderBy(desc(scheduledJobRuns.createdAt))
      .limit(limit);
  }

  async getScheduledJobRunsByTenant(tenantId: string, limit = 50): Promise<ScheduledJobRun[]> {
    return db.select().from(scheduledJobRuns)
      .where(eq(scheduledJobRuns.tenantId, tenantId))
      .orderBy(desc(scheduledJobRuns.createdAt))
      .limit(limit);
  }

  async getScheduledJobRunsByType(jobType: string, limit = 50): Promise<ScheduledJobRun[]> {
    return db.select().from(scheduledJobRuns)
      .where(eq(scheduledJobRuns.jobType, jobType))
      .orderBy(desc(scheduledJobRuns.createdAt))
      .limit(limit);
  }

  async getRunningJobs(): Promise<ScheduledJobRun[]> {
    return db.select().from(scheduledJobRuns)
      .where(eq(scheduledJobRuns.status, "running"))
      .orderBy(desc(scheduledJobRuns.startedAt));
  }

  async getLatestJobRunForTest(testId: string): Promise<ScheduledJobRun | null> {
    const [run] = await db.select().from(scheduledJobRuns)
      .where(and(
        eq(scheduledJobRuns.testId, testId),
        eq(scheduledJobRuns.jobType, "syntheticTest"),
      ))
      .orderBy(desc(scheduledJobRuns.createdAt))
      .limit(1);
    return run || null;
  }
}

export const storage = new DatabaseStorage();
