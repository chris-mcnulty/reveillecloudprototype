import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTenantSchema, insertOrganizationSchema, insertMonitoredSystemSchema, insertSyntheticTestSchema, insertAlertRuleSchema, insertMetricSchema, insertAlertSchema } from "@shared/schema";
import { runTestAndRecord, isSharePointConnected } from "./testRunner";
import { getSchedulerStatus, triggerSyntheticTestsNow, triggerGraphReportsNow, triggerServiceHealthNow, triggerAuditLogsNow, triggerSiteStructureNow, resetStuckJob, resetAllStuckJobs, cancelJob } from "./scheduler";
import { isAzureAppConfigured, buildAdminConsentUrl, buildCommonConsentUrl, clearTokenCache, signState, verifyState } from "./azureAuth";

async function logAdminAction(
  tenantId: string | null,
  action: string,
  targetType: string,
  targetId: string | null,
  details?: Record<string, any>
): Promise<void> {
  try {
    await storage.createAdminAuditEntry({
      tenantId,
      userId: "system",
      action,
      targetType,
      targetId,
      details: details || null,
    });
  } catch (err) {
    console.error("[AdminAudit] Failed to log action:", action, err);
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get("/api/organizations", async (_req, res) => {
    const data = await storage.getOrganizations();
    res.json(data);
  });

  app.get("/api/organizations/active", async (req, res) => {
    const orgId = req.query.orgId as string | undefined;
    let org;
    if (orgId) {
      org = await storage.getOrganization(orgId);
    } else {
      org = await storage.getActiveOrganization();
    }
    if (!org) return res.status(404).json({ message: "No organization found" });
    const orgTenants = await storage.getTenantsByOrg(org.id);
    const allOrgs = await storage.getOrganizations();
    res.json({ organization: org, tenants: orgTenants, isMsp: org.mode === "msp", allOrganizations: allOrgs });
  });

  app.post("/api/organizations", async (req, res) => {
    const parsed = insertOrganizationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const org = await storage.createOrganization(parsed.data);
    await logAdminAction(null, "organization.created", "organization", org.id, { name: org.name, mode: org.mode });
    res.status(201).json(org);
  });

  app.patch("/api/organizations/:id", async (req, res) => {
    const updated = await storage.updateOrganization(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: "Organization not found" });
    await logAdminAction(null, "organization.updated", "organization", req.params.id, { changes: req.body });
    res.json(updated);
  });

  app.get("/api/tenants", async (_req, res) => {
    const data = await storage.getTenants();
    res.json(data);
  });

  app.get("/api/tenants/:id", async (req, res) => {
    const tenant = await storage.getTenant(req.params.id);
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });
    res.json(tenant);
  });

  app.post("/api/tenants", async (req, res) => {
    const parsed = insertTenantSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const tenant = await storage.createTenant(parsed.data);
    await logAdminAction(tenant.id, "tenant.created", "tenant", tenant.id, { name: tenant.name, domain: tenant.domain });
    res.status(201).json(tenant);
  });

  app.patch("/api/tenants/:id", async (req, res) => {
    const updated = await storage.updateTenant(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: "Tenant not found" });
    await logAdminAction(req.params.id, "tenant.updated", "tenant", req.params.id, { changes: req.body });
    res.json(updated);
  });

  app.delete("/api/tenants/:id", async (req, res) => {
    const tenant = await storage.getTenant(req.params.id);
    await storage.deleteTenant(req.params.id);
    await logAdminAction(req.params.id, "tenant.deleted", "tenant", req.params.id, { name: tenant?.name });
    res.status(204).send();
  });

  app.get("/api/tenants/:tenantId/systems", async (req, res) => {
    const data = await storage.getMonitoredSystems(req.params.tenantId);
    res.json(data);
  });

  app.get("/api/systems", async (_req, res) => {
    const data = await storage.getAllMonitoredSystems();
    res.json(data);
  });

  app.post("/api/systems", async (req, res) => {
    const parsed = insertMonitoredSystemSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const system = await storage.createMonitoredSystem(parsed.data);
    await logAdminAction(system.tenantId, "system.created", "monitoredSystem", system.id, { name: system.name, type: system.type });
    res.status(201).json(system);
  });

  app.patch("/api/systems/:id", async (req, res) => {
    const updated = await storage.updateMonitoredSystem(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: "System not found" });
    await logAdminAction(updated.tenantId, "system.updated", "monitoredSystem", req.params.id, { changes: req.body });
    res.json(updated);
  });

  app.delete("/api/systems/:id", async (req, res) => {
    await storage.deleteMonitoredSystem(req.params.id);
    await logAdminAction(null, "system.deleted", "monitoredSystem", req.params.id);
    res.status(204).send();
  });

  app.get("/api/tenants/:tenantId/tests", async (req, res) => {
    const data = await storage.getSyntheticTests(req.params.tenantId);
    res.json(data);
  });

  app.get("/api/tests/:id", async (req, res) => {
    const test = await storage.getSyntheticTest(req.params.id);
    if (!test) return res.status(404).json({ message: "Test not found" });
    res.json(test);
  });

  app.post("/api/tests", async (req, res) => {
    const parsed = insertSyntheticTestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const test = await storage.createSyntheticTest(parsed.data);
    await logAdminAction(test.tenantId, "test.created", "syntheticTest", test.id, { name: test.name, type: test.type });
    res.status(201).json(test);
  });

  app.patch("/api/tests/:id", async (req, res) => {
    const test = await storage.getSyntheticTest(req.params.id);
    const updated = await storage.updateSyntheticTest(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: "Test not found" });
    await logAdminAction(test?.tenantId || null, "test.updated", "syntheticTest", req.params.id, { changes: req.body });
    res.json(updated);
  });

  app.delete("/api/tests/:id", async (req, res) => {
    const test = await storage.getSyntheticTest(req.params.id);
    await storage.deleteSyntheticTest(req.params.id);
    await logAdminAction(test?.tenantId || null, "test.deleted", "syntheticTest", req.params.id, { name: test?.name });
    res.status(204).send();
  });

  app.get("/api/tenants/:tenantId/alert-rules", async (req, res) => {
    const data = await storage.getAlertRules(req.params.tenantId);
    res.json(data);
  });

  app.post("/api/alert-rules", async (req, res) => {
    const parsed = insertAlertRuleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const rule = await storage.createAlertRule(parsed.data);
    await logAdminAction(rule.tenantId, "alertRule.created", "alertRule", rule.id, { name: rule.name, metric: rule.metric });
    res.status(201).json(rule);
  });

  app.patch("/api/alert-rules/:id", async (req, res) => {
    const updated = await storage.updateAlertRule(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: "Alert rule not found" });
    await logAdminAction(updated.tenantId, "alertRule.updated", "alertRule", req.params.id, { changes: req.body });
    res.json(updated);
  });

  app.delete("/api/alert-rules/:id", async (req, res) => {
    await storage.deleteAlertRule(req.params.id);
    await logAdminAction(null, "alertRule.deleted", "alertRule", req.params.id);
    res.status(204).send();
  });

  app.get("/api/tenants/:tenantId/metrics", async (req, res) => {
    const since = req.query.since ? new Date(req.query.since as string) : undefined;
    const data = await storage.getMetrics(req.params.tenantId, since);
    res.json(data);
  });

  app.get("/api/tenants/:tenantId/metrics/latest", async (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const data = await storage.getLatestMetrics(req.params.tenantId, limit);
    res.json(data);
  });

  app.get("/api/tenants/:tenantId/metrics/summary", async (req, res) => {
    const summary = await storage.getMetricsSummary(req.params.tenantId);
    res.json(summary);
  });

  app.post("/api/metrics", async (req, res) => {
    const parsed = insertMetricSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const metric = await storage.createMetric(parsed.data);
    res.status(201).json(metric);
  });

  app.get("/api/alerts", async (req, res) => {
    const tenantId = req.query.tenantId as string | undefined;
    const data = await storage.getAlerts(tenantId);
    res.json(data);
  });

  app.post("/api/alerts", async (req, res) => {
    const parsed = insertAlertSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const alert = await storage.createAlert(parsed.data);
    res.status(201).json(alert);
  });

  app.patch("/api/alerts/:id/acknowledge", async (req, res) => {
    const updated = await storage.acknowledgeAlert(req.params.id);
    if (!updated) return res.status(404).json({ message: "Alert not found" });
    await logAdminAction(updated.tenantId, "alert.acknowledged", "alert", req.params.id, { title: updated.title });
    res.json(updated);
  });

  app.get("/api/stats", async (_req, res) => {
    const stats = await storage.getGlobalStats();
    res.json(stats);
  });

  app.get("/api/sharepoint/status", async (_req, res) => {
    const connected = await isSharePointConnected();
    res.json({ connected });
  });

  app.post("/api/tests/:id/run", async (req, res) => {
    try {
      const test = await storage.getSyntheticTest(req.params.id);
      const run = await runTestAndRecord(req.params.id);
      await logAdminAction(test?.tenantId || null, "test.manualRun", "syntheticTest", req.params.id, { testName: test?.name, status: run.status });
      res.json(run);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/tests/:id/runs", async (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const runs = await storage.getTestRuns(req.params.id, limit);
    res.json(runs);
  });

  app.get("/api/tenants/:tenantId/test-runs", async (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const runs = await storage.getTestRunsByTenant(req.params.tenantId, limit);
    res.json(runs);
  });

  app.get("/api/all-tests", async (_req, res) => {
    const tests = await storage.getAllTests();
    res.json(tests);
  });

  app.get("/api/scheduler/status", async (_req, res) => {
    const status = getSchedulerStatus();
    res.json(status);
  });

  app.post("/api/scheduler/trigger", async (req, res) => {
    const jobType = req.query.jobType as string || "syntheticTests";
    switch (jobType) {
      case "syntheticTests":
        await triggerSyntheticTestsNow();
        break;
      case "graphReports":
        await triggerGraphReportsNow();
        break;
      case "serviceHealth":
        await triggerServiceHealthNow();
        break;
      case "auditLogs":
        await triggerAuditLogsNow();
        break;
      case "siteStructure":
        await triggerSiteStructureNow();
        break;
      default:
        return res.status(400).json({ message: `Unknown job type: ${jobType}` });
    }
    await logAdminAction(null, "scheduler.triggered", "scheduler", jobType, { jobType });
    res.json({ message: `${jobType} job triggered` });
  });

  app.post("/api/scheduler/reset/:jobType", async (req, res) => {
    const success = await resetStuckJob(req.params.jobType);
    if (!success) return res.status(404).json({ message: "Unknown job type" });
    await logAdminAction(null, "scheduler.reset", "scheduler", req.params.jobType);
    res.json({ message: `Job ${req.params.jobType} reset` });
  });

  app.post("/api/scheduler/reset-all", async (_req, res) => {
    const resetJobs = await resetAllStuckJobs();
    await logAdminAction(null, "scheduler.resetAll", "scheduler", null, { resetJobs });
    res.json({ resetJobs });
  });

  app.post("/api/scheduler/cancel/:jobType", async (req, res) => {
    const result = await cancelJob(req.params.jobType);
    await logAdminAction(null, "scheduler.cancelled", "scheduler", req.params.jobType, result);
    res.json(result);
  });

  app.get("/api/scheduler/job-runs", async (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
    const jobType = req.query.jobType as string | undefined;
    const tenantId = req.query.tenantId as string | undefined;

    let runs;
    if (jobType) {
      runs = await storage.getScheduledJobRunsByType(jobType, limit);
    } else if (tenantId) {
      runs = await storage.getScheduledJobRunsByTenant(tenantId, limit);
    } else {
      runs = await storage.getScheduledJobRuns(limit);
    }
    res.json(runs);
  });

  app.get("/api/tenants/:tenantId/usage-reports", async (req, res) => {
    const reportType = req.query.reportType as string | undefined;
    const since = req.query.since ? new Date(req.query.since as string) : undefined;
    const data = await storage.getUsageReports(req.params.tenantId, reportType, since);
    res.json(data);
  });

  app.get("/api/tenants/:tenantId/usage-reports/latest", async (req, res) => {
    const reportType = req.query.reportType as string;
    if (!reportType) return res.status(400).json({ message: "reportType query parameter is required" });
    const report = await storage.getLatestUsageReport(req.params.tenantId, reportType);
    if (!report) return res.status(404).json({ message: "No report found" });
    res.json(report);
  });

  app.get("/api/service-health", async (_req, res) => {
    const incidents = await storage.getActiveServiceHealthIncidents();
    res.json(incidents);
  });

  app.get("/api/service-health/incidents", async (req, res) => {
    const tenantId = req.query.tenantId as string | undefined;
    const status = req.query.status as string | undefined;
    const incidents = await storage.getServiceHealthIncidents(tenantId, status);
    res.json(incidents);
  });

  app.get("/api/tenants/:tenantId/audit-log", async (req, res) => {
    const since = req.query.since ? new Date(req.query.since as string) : undefined;
    const operation = req.query.operation as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 200;
    const entries = await storage.getAuditLogEntries(req.params.tenantId, since, operation, limit);
    res.json(entries);
  });

  app.get("/api/tenants/:tenantId/audit-log/stats", async (req, res) => {
    const stats = await storage.getAuditLogStats(req.params.tenantId);
    res.json(stats);
  });

  app.get("/api/admin-audit", async (req, res) => {
    const tenantId = req.query.tenantId as string | undefined;
    const since = req.query.since ? new Date(req.query.since as string) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
    const entries = await storage.getAdminAuditLog(tenantId || undefined, since, limit);
    res.json(entries);
  });

  app.get("/api/auth/azure-app-status", async (_req, res) => {
    const configured = isAzureAppConfigured();
    res.json({
      configured,
      clientId: configured ? process.env.AZURE_CLIENT_ID : null,
      requiredPermissions: [
        "Reports.Read.All",
        "ServiceHealth.Read.All",
        "AuditLog.Read.All",
        "Sites.Read.All",
        "Files.ReadWrite.All",
      ],
    });
  });

  app.get("/api/auth/consent-url", async (req, res) => {
    try {
      const tenantId = req.query.tenantId as string;
      if (!tenantId) return res.status(400).json({ message: "tenantId query parameter required" });

      const tenant = await storage.getTenant(tenantId);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });

      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const redirectUri = `${protocol}://${host}/api/auth/callback`;

      const state = signState({ dbTenantId: tenant.id, orgId: tenant.organizationId });

      let consentUrl: string;
      if (tenant.azureTenantId) {
        consentUrl = buildAdminConsentUrl(tenant.azureTenantId, redirectUri, state);
      } else {
        consentUrl = buildCommonConsentUrl(redirectUri, state);
      }

      res.json({ consentUrl, redirectUri });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/auth/callback", async (req, res) => {
    try {
      const { tenant: azureTenantId, admin_consent, error, error_description, state } = req.query;

      if (error) {
        const errorMsg = error_description || error;
        console.error("[Auth Callback] Consent denied:", errorMsg);
        return res.redirect(`/settings/tenant?consent_error=${encodeURIComponent(String(errorMsg))}`);
      }

      if (admin_consent !== "True") {
        return res.redirect("/settings/tenant?consent_error=Admin+consent+was+not+granted");
      }

      const stateData = state ? verifyState(String(state)) : null;
      if (!stateData || !stateData.dbTenantId) {
        console.error("[Auth Callback] Invalid or tampered state parameter");
        return res.redirect("/settings/tenant?consent_error=Invalid+state+parameter+-+consent+may+have+been+tampered");
      }

      const dbTenantId = stateData.dbTenantId;

      {
        const tenant = await storage.getTenant(dbTenantId);
        if (tenant) {
          await storage.updateTenant(dbTenantId, {
            consentStatus: "Connected",
            consentedBy: tenant.adminEmail,
            consentedAt: new Date(),
            azureTenantId: azureTenantId ? String(azureTenantId) : tenant.azureTenantId,
          });
          await logAdminAction(dbTenantId, "tenant.consented", "tenant", dbTenantId, {
            consentedBy: tenant.adminEmail,
            azureTenantId: String(azureTenantId),
            method: "azure_ad_admin_consent",
          });
          console.log(`[Auth Callback] Consent granted for tenant ${tenant.name} (Azure: ${azureTenantId})`);
        }
      }

      return res.redirect(`/settings/tenant?consent_success=true&azure_tenant=${azureTenantId || ""}`);
    } catch (err: any) {
      console.error("[Auth Callback] Error:", err.message);
      return res.redirect(`/settings/tenant?consent_error=${encodeURIComponent(err.message)}`);
    }
  });

  app.post("/api/tenants/:id/consent", async (req, res) => {
    const tenant = await storage.getTenant(req.params.id);
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });
    const updated = await storage.updateTenant(req.params.id, {
      consentStatus: "Connected",
      consentedBy: tenant.adminEmail,
      consentedAt: new Date(),
    });
    await logAdminAction(req.params.id, "tenant.consented", "tenant", req.params.id, { consentedBy: tenant.adminEmail, method: "manual" });
    res.json(updated);
  });

  app.post("/api/tenants/:id/revoke-consent", async (req, res) => {
    const tenant = await storage.getTenant(req.params.id);
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });
    if (tenant.azureTenantId) {
      clearTokenCache(tenant.azureTenantId);
    }
    const updated = await storage.updateTenant(req.params.id, {
      consentStatus: "Pending",
      consentedBy: null,
      consentedAt: null,
    });
    await logAdminAction(req.params.id, "tenant.consent_revoked", "tenant", req.params.id, { previousConsentedBy: tenant.consentedBy });
    res.json(updated);
  });

  return httpServer;
}
