import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTenantSchema, insertOrganizationSchema, insertMonitoredSystemSchema, insertSyntheticTestSchema, insertAlertRuleSchema, insertMetricSchema, insertAlertSchema, insertAgentTraceSchema, insertAgentTraceSpanSchema, insertMcpServerSchema, insertMcpToolCallSchema, insertEntraSignInSchema } from "@shared/schema";
import { runTestAndRecord, isSharePointConnected } from "./testRunner";
import { getSchedulerStatus, triggerSyntheticTestsNow, triggerGraphReportsNow, triggerServiceHealthNow, triggerAuditLogsNow, triggerSiteStructureNow, triggerPowerPlatformNow, triggerCopilotInteractionsNow, triggerEntraSignInsNow, triggerSpeDataNow, resetStuckJob, resetAllStuckJobs, cancelJob } from "./scheduler";
import { collectEntraSignIns } from "./collectors/entraSignIns";
import { collectSpeData } from "./collectors/spEmbedded";
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
    const jobType = (req.body?.jobType || req.body?.job || req.query.jobType as string) || "syntheticTests";
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
      case "powerPlatform":
        await triggerPowerPlatformNow();
        break;
      case "copilotInteractions":
        await triggerCopilotInteractionsNow();
        break;
      case "entraSignIns":
        await triggerEntraSignInsNow();
        break;
      case "speData":
        await triggerSpeDataNow();
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

  app.get("/api/tenants/:tenantId/power-platform/environments", async (req, res) => {
    const envs = await storage.getPowerPlatformEnvironments(req.params.tenantId);
    res.json(envs);
  });

  app.get("/api/tenants/:tenantId/power-platform/resources", async (req, res) => {
    const envId = req.query.envId as string | undefined;
    const resourceType = req.query.type as string | undefined;
    const resources = await storage.getPowerPlatformResources(req.params.tenantId, envId, resourceType);
    res.json(resources);
  });

  app.get("/api/tenants/:tenantId/power-platform/stats", async (req, res) => {
    const stats = await storage.getPowerPlatformResourceStats(req.params.tenantId);
    const envs = await storage.getPowerPlatformEnvironments(req.params.tenantId);
    res.json({
      environments: envs.length,
      environmentsByType: envs.reduce((acc: Record<string, number>, e) => {
        const type = e.environmentType || "Unknown";
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {}),
      resourcesByType: stats.reduce((acc: Record<string, number>, s) => {
        acc[s.resourceType] = s.count;
        return acc;
      }, {}),
      totalResources: stats.reduce((sum, s) => sum + s.count, 0),
    });
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
        "Group.Read.All",
        "User.Read.All",
        "Directory.Read.All",
      ],
      permissionsByWorkload: {
        sharepoint: {
          label: "SharePoint Online",
          permissions: [
            { scope: "Sites.Read.All", purpose: "Site structure, lists, libraries, subsites, drives", status: "required" },
            { scope: "Files.ReadWrite.All", purpose: "Synthetic file upload/download tests", status: "required" },
            { scope: "Reports.Read.All", purpose: "Site usage detail, storage, file counts, page views, active users", status: "required" },
          ],
          endpoints: [
            "/sites/root, /sites/{id}/lists, /sites/{id}/drives — site structure enumeration",
            "/reports/getSharePointSiteUsageDetail — per-site storage, files, page views",
            "/reports/getSharePointSiteUsageStorage — daily storage consumption trends",
            "/reports/getSharePointSiteUsageFileCounts — daily file activity",
            "/reports/getSharePointActivityUserDetail — per-user activity (views, edits, syncs, shares)",
          ],
        },
        onedrive: {
          label: "OneDrive for Business",
          permissions: [
            { scope: "Reports.Read.All", purpose: "OneDrive usage, storage, file counts, sync activity", status: "required" },
            { scope: "Files.Read.All", purpose: "OneDrive file structure and quota monitoring", status: "recommended" },
          ],
          endpoints: [
            "/reports/getOneDriveUsageAccountDetail — per-user storage, file count, sync status",
            "/reports/getOneDriveUsageAccountCounts — daily active/inactive account trends",
            "/reports/getOneDriveUsageStorage — daily total storage consumption",
            "/reports/getOneDriveUsageFileCounts — daily file count trends",
            "/reports/getOneDriveActivityUserDetail — per-user file operations (synced, shared, viewed)",
          ],
        },
        exchange: {
          label: "Exchange Online / Outlook",
          permissions: [
            { scope: "Reports.Read.All", purpose: "Mailbox usage, app usage, email activity", status: "recommended" },
          ],
          endpoints: [
            "/reports/getEmailActivityUserDetail — sends, reads, receives per user",
            "/reports/getEmailAppUsageUserDetail — client app breakdown (Outlook, OWA, mobile)",
            "/reports/getMailboxUsageDetail — mailbox storage, item counts, quota status",
          ],
        },
        teams: {
          label: "Microsoft Teams",
          permissions: [
            { scope: "Reports.Read.All", purpose: "Teams activity, device usage, channel messages", status: "recommended" },
          ],
          endpoints: [
            "/reports/getTeamsUserActivityUserDetail — messages, calls, meetings per user",
            "/reports/getTeamsDeviceUsageUserDetail — device/platform breakdown",
            "/reports/getTeamsTeamActivityDetail — per-team channel messages, meetings",
          ],
        },
        m365Apps: {
          label: "Microsoft 365 Apps (Office)",
          permissions: [
            { scope: "Reports.Read.All", purpose: "Office app activation, usage across Word/Excel/PowerPoint", status: "recommended" },
          ],
          endpoints: [
            "/reports/getM365AppUserDetail — per-user app usage (Word, Excel, PowerPoint, Outlook, Teams, OneDrive)",
            "/reports/getM365AppPlatformUserCounts — platform breakdown (Windows, Mac, Web, Mobile)",
          ],
        },
        identity: {
          label: "Identity & Access (Entra ID)",
          permissions: [
            { scope: "AuditLog.Read.All", purpose: "Sign-in logs, directory audits, risky user events", status: "required" },
            { scope: "Directory.Read.All", purpose: "User/group enumeration, license assignment, MFA status", status: "recommended" },
            { scope: "User.Read.All", purpose: "User profiles, sign-in activity, account status", status: "required" },
            { scope: "Group.Read.All", purpose: "M365 group membership, Teams-connected groups", status: "required" },
          ],
          endpoints: [
            "/auditLogs/directoryAudits — admin activity (permission changes, app consents, config changes)",
            "/auditLogs/signIns — user sign-in events (location, device, risk, MFA status)",
            "/users — user enumeration with license and activity details",
            "/groups — M365/security group enumeration",
          ],
        },
        serviceHealth: {
          label: "Service Health & Communications",
          permissions: [
            { scope: "ServiceHealth.Read.All", purpose: "Service incidents, advisories, planned maintenance", status: "required" },
            { scope: "ServiceMessage.Read.All", purpose: "Message center posts (feature changes, retirements)", status: "recommended" },
          ],
          endpoints: [
            "/admin/serviceAnnouncement/issues — active incidents and advisories",
            "/admin/serviceAnnouncement/messages — message center posts",
            "/admin/serviceAnnouncement/healthOverviews — per-service health status",
          ],
        },
        security: {
          label: "Security & Compliance",
          permissions: [
            { scope: "SecurityEvents.Read.All", purpose: "Security alerts from Microsoft Defender", status: "optional" },
            { scope: "ThreatIndicators.Read.All", purpose: "Threat intelligence indicators", status: "optional" },
          ],
          endpoints: [
            "/security/alerts_v2 — security alerts from Defender for Office 365",
            "/security/secureScores — tenant security score and improvement actions",
          ],
        },
      },
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
          clearTokenCache(tenant.azureTenantId);
          if (azureTenantId && String(azureTenantId) !== tenant.azureTenantId) {
            clearTokenCache(String(azureTenantId));
          }
          console.log(`[Auth Callback] Consent granted for tenant ${tenant.name} (Azure: ${azureTenantId}) — token cache cleared`);
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

  app.get("/api/agent-traces", async (req, res) => {
    const tenantId = req.query.tenantId as string | undefined;
    const platform = req.query.platform as string | undefined;
    const status = req.query.status as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const traces = await storage.getAgentTraces(tenantId, platform, status, limit);
    res.json(traces);
  });

  app.post("/api/agent-traces/seed-demo", async (req, res) => {
    const allTenants = await storage.getTenants();
    const tenant = allTenants.find(t => t.consentStatus === "Connected") || allTenants[0];
    if (!tenant) return res.status(400).json({ message: "No tenants available for seeding" });
    const tid = tenant.id;
    const now = Date.now();

    const demoTraces = [
      {
        trace: { tenantId: tid, agentName: "SharePoint Content Copilot", platform: "copilot", status: "success", totalDurationMs: 3480, startedAt: new Date(now - 120000), completedAt: new Date(now - 116520), metadata: { userId: "user1@contoso.com" } },
        spans: [
          { spanName: "Entra ID Authentication", spanType: "auth", serviceName: "Entra ID", endpoint: "login.microsoftonline.com/oauth2/v2.0/token", durationMs: 245, statusCode: 200, status: "success", startOffset: 0, sortOrder: 0 },
          { spanName: "M365 Content Retrieval", spanType: "content", serviceName: "SharePoint Online", endpoint: "graph.microsoft.com/v1.0/sites/{siteId}/drive/items", durationMs: 1820, statusCode: 200, status: "success", startOffset: 245, sortOrder: 1 },
          { spanName: "MCP Tool: Document Search", spanType: "mcp", serviceName: "MCP Server", endpoint: "mcp.contoso.com/tools/document-search", durationMs: 980, statusCode: 200, status: "success", startOffset: 2065, sortOrder: 2 },
          { spanName: "License Validation", spanType: "license", serviceName: "AI Builder Licensing", endpoint: "api.powerplatform.com/licensing/check", durationMs: 435, statusCode: 200, status: "success", startOffset: 3045, sortOrder: 3 },
        ],
      },
      {
        trace: { tenantId: tid, agentName: "SharePoint Content Copilot", platform: "copilot", status: "failed", totalDurationMs: 890, errorSummary: "AADSTS50076: MFA claim required", startedAt: new Date(now - 3600000), completedAt: new Date(now - 3599110), metadata: { userId: "user2@contoso.com" } },
        spans: [
          { spanName: "Entra ID Authentication", spanType: "auth", serviceName: "Entra ID", endpoint: "login.microsoftonline.com/oauth2/v2.0/token", durationMs: 890, statusCode: 401, status: "failed", errorMessage: "AADSTS50076: Due to a configuration change made by your administrator, you must use multi-factor authentication to access this resource.", startOffset: 0, sortOrder: 0 },
          { spanName: "M365 Content Retrieval", spanType: "content", serviceName: "SharePoint Online", endpoint: "graph.microsoft.com/v1.0/sites/{siteId}/drive/items", durationMs: 0, status: "skipped", startOffset: 890, sortOrder: 1 },
          { spanName: "MCP Tool: Document Search", spanType: "mcp", serviceName: "MCP Server", endpoint: "mcp.contoso.com/tools/document-search", durationMs: 0, status: "skipped", startOffset: 890, sortOrder: 2 },
        ],
      },
      {
        trace: { tenantId: tid, agentName: "HR Policy Assistant", platform: "copilot", status: "failed", totalDurationMs: 32400, errorSummary: "MCP tool timeout after 30s", startedAt: new Date(now - 1800000), completedAt: new Date(now - 1767600), metadata: { userId: "user3@contoso.com" } },
        spans: [
          { spanName: "Entra ID Authentication", spanType: "auth", serviceName: "Entra ID", endpoint: "login.microsoftonline.com/oauth2/v2.0/token", durationMs: 310, statusCode: 200, status: "success", startOffset: 0, sortOrder: 0 },
          { spanName: "M365 Content Retrieval", spanType: "content", serviceName: "SharePoint Online", endpoint: "graph.microsoft.com/v1.0/sites/{siteId}/lists/{listId}/items", durationMs: 2090, statusCode: 200, status: "success", startOffset: 310, sortOrder: 1 },
          { spanName: "MCP Tool: HR Policy Lookup", spanType: "mcp", serviceName: "MCP Server", endpoint: "mcp.contoso.com/tools/hr-policy-search", durationMs: 30000, statusCode: 504, status: "failed", errorMessage: "Request timeout: MCP server did not respond within 30 seconds", startOffset: 2400, sortOrder: 2 },
        ],
      },
      {
        trace: { tenantId: tid, agentName: "SharePoint Content Copilot", platform: "copilot", status: "failed", totalDurationMs: 2950, errorSummary: "License limit exceeded: 0 AI units remaining", startedAt: new Date(now - 7200000), completedAt: new Date(now - 7197050), metadata: { userId: "user4@contoso.com" } },
        spans: [
          { spanName: "Entra ID Authentication", spanType: "auth", serviceName: "Entra ID", endpoint: "login.microsoftonline.com/oauth2/v2.0/token", durationMs: 220, statusCode: 200, status: "success", startOffset: 0, sortOrder: 0 },
          { spanName: "M365 Content Retrieval", spanType: "content", serviceName: "SharePoint Online", endpoint: "graph.microsoft.com/v1.0/sites/{siteId}/drive/items", durationMs: 1680, statusCode: 200, status: "success", startOffset: 220, sortOrder: 1 },
          { spanName: "MCP Tool: Document Search", spanType: "mcp", serviceName: "MCP Server", endpoint: "mcp.contoso.com/tools/document-search", durationMs: 650, statusCode: 200, status: "success", startOffset: 1900, sortOrder: 2 },
          { spanName: "License Validation", spanType: "license", serviceName: "AI Builder Licensing", endpoint: "api.powerplatform.com/licensing/check", durationMs: 400, statusCode: 403, status: "failed", errorMessage: "License limit exceeded: tenant has consumed 500/500 AI Builder credits. Resets March 15.", startOffset: 2550, sortOrder: 3 },
        ],
      },
      {
        trace: { tenantId: tid, agentName: "HR Policy Assistant", platform: "copilot", status: "degraded", totalDurationMs: 4200, errorSummary: "MCP returned incomplete results", startedAt: new Date(now - 5400000), completedAt: new Date(now - 5395800), metadata: { userId: "user5@contoso.com" } },
        spans: [
          { spanName: "Entra ID Authentication", spanType: "auth", serviceName: "Entra ID", endpoint: "login.microsoftonline.com/oauth2/v2.0/token", durationMs: 280, statusCode: 200, status: "success", startOffset: 0, sortOrder: 0 },
          { spanName: "M365 Content Retrieval", spanType: "content", serviceName: "SharePoint Online", endpoint: "graph.microsoft.com/v1.0/sites/{siteId}/lists/{listId}/items", durationMs: 1950, statusCode: 200, status: "success", startOffset: 280, sortOrder: 1 },
          { spanName: "MCP Tool: HR Policy Lookup", spanType: "mcp", serviceName: "MCP Server", endpoint: "mcp.contoso.com/tools/hr-policy-search", durationMs: 1970, statusCode: 206, status: "degraded", errorMessage: "Partial results: 3 of 8 policy documents returned due to index rebuild in progress", startOffset: 2230, sortOrder: 2 },
        ],
      },
      {
        trace: { tenantId: tid, agentName: "SharePoint Content Copilot", platform: "copilot", status: "success", totalDurationMs: 12400, startedAt: new Date(now - 900000), completedAt: new Date(now - 887600), metadata: { userId: "user6@contoso.com" } },
        spans: [
          { spanName: "Entra ID Authentication", spanType: "auth", serviceName: "Entra ID", endpoint: "login.microsoftonline.com/oauth2/v2.0/token", durationMs: 190, statusCode: 200, status: "success", startOffset: 0, sortOrder: 0 },
          { spanName: "M365 Content Retrieval", spanType: "content", serviceName: "SharePoint Online", endpoint: "graph.microsoft.com/v1.0/sites/{siteId}/drive/items", durationMs: 9800, statusCode: 200, status: "success", errorMessage: "SharePoint throttled (429) — retried after 3s backoff", startOffset: 190, sortOrder: 1 },
          { spanName: "MCP Tool: Document Search", spanType: "mcp", serviceName: "MCP Server", endpoint: "mcp.contoso.com/tools/document-search", durationMs: 1650, statusCode: 200, status: "success", startOffset: 9990, sortOrder: 2 },
          { spanName: "License Validation", spanType: "license", serviceName: "AI Builder Licensing", endpoint: "api.powerplatform.com/licensing/check", durationMs: 760, statusCode: 200, status: "success", startOffset: 11640, sortOrder: 3 },
        ],
      },
      {
        trace: { tenantId: tid, agentName: "SharePoint Content Copilot", platform: "copilot", status: "running", totalDurationMs: null, startedAt: new Date(now - 5000), completedAt: null, metadata: { userId: "user7@contoso.com" } },
        spans: [
          { spanName: "Entra ID Authentication", spanType: "auth", serviceName: "Entra ID", endpoint: "login.microsoftonline.com/oauth2/v2.0/token", durationMs: 310, statusCode: 200, status: "success", startOffset: 0, sortOrder: 0 },
          { spanName: "M365 Content Retrieval", spanType: "content", serviceName: "SharePoint Online", endpoint: "graph.microsoft.com/v1.0/sites/{siteId}/drive/items", durationMs: 2100, statusCode: 200, status: "success", startOffset: 310, sortOrder: 1 },
        ],
      },
      {
        trace: { tenantId: tid, agentName: "Customer Research GPT", platform: "gpt", status: "success", totalDurationMs: 5240, startedAt: new Date(now - 300000), completedAt: new Date(now - 294760), metadata: { model: "gpt-4-turbo" } },
        spans: [
          { spanName: "API Authentication", spanType: "auth", serviceName: "OpenAI", endpoint: "api.openai.com/v1/auth", durationMs: 180, statusCode: 200, status: "success", startOffset: 0, sortOrder: 0 },
          { spanName: "RAG Document Retrieval", spanType: "content", serviceName: "Vector Store", endpoint: "pinecone.io/query", durationMs: 1200, statusCode: 200, status: "success", startOffset: 180, sortOrder: 1 },
          { spanName: "GPT-4 Inference", spanType: "inference", serviceName: "OpenAI", endpoint: "api.openai.com/v1/chat/completions", durationMs: 3200, statusCode: 200, status: "success", startOffset: 1380, sortOrder: 2, metadata: { tokens: 4500, model: "gpt-4-turbo" } },
          { spanName: "Response Formatting", spanType: "api", serviceName: "API Gateway", endpoint: "api.contoso.com/format", durationMs: 660, statusCode: 200, status: "success", startOffset: 4580, sortOrder: 3 },
        ],
      },
      {
        trace: { tenantId: tid, agentName: "Customer Research GPT", platform: "gpt", status: "failed", totalDurationMs: 1850, errorSummary: "HTTP 429: Rate limit exceeded (TPM)", startedAt: new Date(now - 600000), completedAt: new Date(now - 598150), metadata: { model: "gpt-4-turbo" } },
        spans: [
          { spanName: "API Authentication", spanType: "auth", serviceName: "OpenAI", endpoint: "api.openai.com/v1/auth", durationMs: 150, statusCode: 200, status: "success", startOffset: 0, sortOrder: 0 },
          { spanName: "RAG Document Retrieval", spanType: "content", serviceName: "Vector Store", endpoint: "pinecone.io/query", durationMs: 980, statusCode: 200, status: "success", startOffset: 150, sortOrder: 1 },
          { spanName: "GPT-4 Inference", spanType: "inference", serviceName: "OpenAI", endpoint: "api.openai.com/v1/chat/completions", durationMs: 720, statusCode: 429, status: "failed", errorMessage: "Rate limit exceeded: 89,000/90,000 TPM used. Retry after 12 seconds.", startOffset: 1130, sortOrder: 2 },
        ],
      },
      {
        trace: { tenantId: tid, agentName: "Customer Research GPT", platform: "gpt", status: "failed", totalDurationMs: 2100, errorSummary: "Context window exceeded: 142k > 128k token limit", startedAt: new Date(now - 1200000), completedAt: new Date(now - 1197900), metadata: { model: "gpt-4-turbo" } },
        spans: [
          { spanName: "API Authentication", spanType: "auth", serviceName: "OpenAI", endpoint: "api.openai.com/v1/auth", durationMs: 160, statusCode: 200, status: "success", startOffset: 0, sortOrder: 0 },
          { spanName: "RAG Document Retrieval", spanType: "content", serviceName: "Vector Store", endpoint: "pinecone.io/query", durationMs: 1100, statusCode: 200, status: "success", startOffset: 160, sortOrder: 1, metadata: { documentsRetrieved: 47, totalTokens: 142000 } },
          { spanName: "GPT-4 Inference", spanType: "inference", serviceName: "OpenAI", endpoint: "api.openai.com/v1/chat/completions", durationMs: 840, statusCode: 400, status: "failed", errorMessage: "Context length exceeded: input 142,000 tokens exceeds maximum of 128,000 tokens", startOffset: 1260, sortOrder: 2 },
        ],
      },
      {
        trace: { tenantId: tid, agentName: "Case Routing Agent", platform: "agentforce", status: "success", totalDurationMs: 4120, startedAt: new Date(now - 240000), completedAt: new Date(now - 235880), metadata: { orgId: "00D5e000000XXXXX" } },
        spans: [
          { spanName: "Salesforce OAuth", spanType: "auth", serviceName: "Salesforce", endpoint: "login.salesforce.com/services/oauth2/token", durationMs: 420, statusCode: 200, status: "success", startOffset: 0, sortOrder: 0 },
          { spanName: "SOQL Case Query", spanType: "api", serviceName: "Salesforce Data", endpoint: "instance.salesforce.com/services/data/v59.0/query", durationMs: 1350, statusCode: 200, status: "success", startOffset: 420, sortOrder: 1, metadata: { recordsReturned: 12 } },
          { spanName: "Einstein AI Classification", spanType: "inference", serviceName: "Einstein AI", endpoint: "api.salesforce.com/einstein/prediction", durationMs: 1650, statusCode: 200, status: "success", startOffset: 1770, sortOrder: 2 },
          { spanName: "Case Record Update", spanType: "api", serviceName: "Salesforce Data", endpoint: "instance.salesforce.com/services/data/v59.0/sobjects/Case", durationMs: 700, statusCode: 200, status: "success", startOffset: 3420, sortOrder: 3 },
        ],
      },
      {
        trace: { tenantId: tid, agentName: "Case Routing Agent", platform: "agentforce", status: "failed", totalDurationMs: 1450, errorSummary: "Salesforce OAuth token refresh failed", startedAt: new Date(now - 2700000), completedAt: new Date(now - 2698550), metadata: { orgId: "00D5e000000XXXXX" } },
        spans: [
          { spanName: "Salesforce OAuth", spanType: "auth", serviceName: "Salesforce", endpoint: "login.salesforce.com/services/oauth2/token", durationMs: 1450, statusCode: 401, status: "failed", errorMessage: "invalid_grant: expired access/refresh token. Re-authentication required.", startOffset: 0, sortOrder: 0 },
          { spanName: "SOQL Case Query", spanType: "api", serviceName: "Salesforce Data", endpoint: "instance.salesforce.com/services/data/v59.0/query", durationMs: 0, status: "skipped", startOffset: 1450, sortOrder: 1 },
          { spanName: "Einstein AI Classification", spanType: "inference", serviceName: "Einstein AI", endpoint: "api.salesforce.com/einstein/prediction", durationMs: 0, status: "skipped", startOffset: 1450, sortOrder: 2 },
        ],
      },
    ];

    let tracesCreated = 0;
    let spansCreated = 0;

    for (const demo of demoTraces) {
      const trace = await storage.createAgentTrace(demo.trace as any);
      tracesCreated++;

      for (const span of demo.spans) {
        await storage.createAgentTraceSpan({ ...span, traceId: trace.id } as any);
        spansCreated++;
      }
    }

    await logAdminAction(null, "agentTrace.demoSeeded", "agentTrace", null, { tracesCreated, spansCreated });
    res.json({ message: "Demo data seeded", tracesCreated, spansCreated });
  });

  app.get("/api/agent-traces/:id", async (req, res) => {
    const result = await storage.getAgentTraceWithSpans(req.params.id);
    if (!result) return res.status(404).json({ message: "Trace not found" });
    res.json(result);
  });

  app.post("/api/agent-traces", async (req, res) => {
    const parsed = insertAgentTraceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid trace data", errors: parsed.error.flatten() });
    const trace = await storage.createAgentTrace(parsed.data);
    res.status(201).json(trace);
  });

  app.post("/api/agent-traces/:id/spans", async (req, res) => {
    const trace = await storage.getAgentTrace(req.params.id);
    if (!trace) return res.status(404).json({ message: "Trace not found" });
    const parsed = insertAgentTraceSpanSchema.safeParse({ ...req.body, traceId: req.params.id });
    if (!parsed.success) return res.status(400).json({ message: "Invalid span data", errors: parsed.error.flatten() });
    const span = await storage.createAgentTraceSpan(parsed.data);
    res.status(201).json(span);
  });

  app.delete("/api/agent-traces/:id", async (req, res) => {
    await storage.deleteAgentTrace(req.params.id);
    await logAdminAction(null, "agentTrace.deleted", "agentTrace", req.params.id);
    res.json({ message: "Trace deleted" });
  });

  app.get("/api/agent-health", async (req, res) => {
    const tenantId = req.query.tenantId as string | undefined;
    const summary = await storage.getAgentHealthSummary(tenantId);
    res.json(summary);
  });

  app.get("/api/tenants/:tenantId/copilot-interactions", async (req, res) => {
    const { tenantId } = req.params;
    const { userId, appClass, sessionId, limit } = req.query;
    const interactions = await storage.getCopilotInteractions(tenantId, {
      userId: userId as string | undefined,
      appClass: appClass as string | undefined,
      sessionId: sessionId as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : 50,
    });
    res.json(interactions);
  });

  app.get("/api/tenants/:tenantId/copilot-interactions/stats", async (req, res) => {
    const stats = await storage.getCopilotInteractionStats(req.params.tenantId);
    res.json(stats);
  });

  app.get("/api/tenants/:tenantId/copilot-interactions/session-list", async (req, res) => {
    const { tenantId } = req.params;
    const { appClass, userId, status, dateFrom, dateTo, offset, limit } = req.query;
    const result = await storage.getCopilotSessions(tenantId, {
      appClass: appClass as string | undefined,
      userId: userId as string | undefined,
      status: status as string | undefined,
      dateFrom: dateFrom as string | undefined,
      dateTo: dateTo as string | undefined,
      offset: offset ? parseInt(offset as string, 10) : 0,
      limit: limit ? parseInt(limit as string, 10) : 25,
    });
    res.json(result);
  });

  app.get("/api/tenants/:tenantId/copilot-interactions/sessions/:sessionId", async (req, res) => {
    const interactions = await storage.getCopilotSessionInteractions(req.params.tenantId, req.params.sessionId);
    res.json(interactions);
  });

  app.get("/api/tenants/:tenantId/copilot-interactions/pairs/:requestId", async (req, res) => {
    const interactions = await storage.getCopilotInteractionsByRequestId(req.params.tenantId, req.params.requestId);
    res.json(interactions);
  });

  app.get("/api/tenants/:tenantId/mcp-servers", async (req, res) => {
    const servers = await storage.getMcpServers(req.params.tenantId);
    res.json(servers.map(s => ({ ...s, apiKey: s.apiKey ? "••••••••" : null })));
  });

  function maskMcpServer(s: any) {
    return { ...s, apiKey: s.apiKey ? "••••••••" : null };
  }

  async function getMcpServerForTenant(serverId: string, tenantId: string) {
    const server = await storage.getMcpServer(serverId);
    if (!server || server.tenantId !== tenantId) return null;
    return server;
  }

  app.get("/api/tenants/:tenantId/mcp-servers/stats", async (req, res) => {
    const stats = await storage.getMcpServerStats(req.params.tenantId);
    res.json(stats);
  });

  app.post("/api/tenants/:tenantId/mcp-servers", async (req, res) => {
    const parsed = insertMcpServerSchema.safeParse({ ...req.body, tenantId: req.params.tenantId });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const server = await storage.createMcpServer(parsed.data);
    await logAdminAction(req.params.tenantId, "create", "mcpServer", server.id, { name: server.name });
    res.status(201).json(maskMcpServer(server));
  });

  app.get("/api/tenants/:tenantId/mcp-servers/:serverId", async (req, res) => {
    const server = await getMcpServerForTenant(req.params.serverId, req.params.tenantId);
    if (!server) return res.status(404).json({ error: "Server not found" });
    const health = await storage.getMcpServerHealth(req.params.serverId);
    res.json({ ...maskMcpServer(server), health });
  });

  app.patch("/api/tenants/:tenantId/mcp-servers/:serverId", async (req, res) => {
    const existing = await getMcpServerForTenant(req.params.serverId, req.params.tenantId);
    if (!existing) return res.status(404).json({ error: "Server not found" });
    const server = await storage.updateMcpServer(req.params.serverId, req.body);
    if (!server) return res.status(404).json({ error: "Server not found" });
    res.json(maskMcpServer(server));
  });

  app.delete("/api/tenants/:tenantId/mcp-servers/:serverId", async (req, res) => {
    const existing = await getMcpServerForTenant(req.params.serverId, req.params.tenantId);
    if (!existing) return res.status(404).json({ error: "Server not found" });
    await storage.deleteMcpServer(req.params.serverId);
    await logAdminAction(req.params.tenantId, "delete", "mcpServer", req.params.serverId);
    res.json({ success: true });
  });

  app.post("/api/tenants/:tenantId/mcp-servers/:serverId/tool-calls", async (req, res) => {
    const parsed = insertMcpToolCallSchema.safeParse({ ...req.body, serverId: req.params.serverId, tenantId: req.params.tenantId });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const call = await storage.createMcpToolCall(parsed.data);
    res.status(201).json(call);
  });

  app.get("/api/tenants/:tenantId/mcp-servers/:serverId/tool-calls", async (req, res) => {
    const { limit, method, status, sessionId } = req.query as any;
    const calls = await storage.getMcpToolCalls(req.params.serverId, {
      limit: limit ? parseInt(limit) : undefined,
      method, status, sessionId,
    });
    res.json(calls);
  });

  app.post("/api/tenants/:tenantId/mcp-servers/:serverId/heartbeat", async (req, res) => {
    const existing = await getMcpServerForTenant(req.params.serverId, req.params.tenantId);
    if (!existing) return res.status(404).json({ error: "Server not found" });
    const server = await storage.updateMcpServer(req.params.serverId, {
      status: "running",
      lastHeartbeat: new Date(),
      ...(req.body.uptime !== undefined ? { uptime: req.body.uptime } : {}),
      ...(req.body.version ? { version: req.body.version } : {}),
    } as any);
    if (!server) return res.status(404).json({ error: "Server not found" });
    res.json({ ok: true });
  });

  app.post("/api/tenants/:tenantId/mcp-servers/:serverId/probe", async (req, res) => {
    const server = await getMcpServerForTenant(req.params.serverId, req.params.tenantId);
    if (!server) return res.status(404).json({ error: "Server not found" });
    if (!server.url) return res.status(400).json({ error: "Server has no URL configured" });

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (server.apiKey) {
      headers["Authorization"] = `Bearer ${server.apiKey}`;
    }

    const results: { tools: any[]; serverInfo: any; error?: string; latencyMs: number } = {
      tools: [], serverInfo: null, latencyMs: 0,
    };

    try {
      const start = Date.now();

      const initResp = await fetch(server.url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1, method: "initialize",
          params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "reveille-cloud", version: "1.0.0" } },
        }),
      });
      const initData = await initResp.json() as any;
      if (initData.result) {
        results.serverInfo = initData.result;
      }

      const toolsResp = await fetch(server.url, {
        method: "POST",
        headers,
        body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
      });
      const toolsData = await toolsResp.json() as any;
      if (toolsData.result?.tools) {
        results.tools = toolsData.result.tools;
      }
      results.latencyMs = Date.now() - start;

      const toolNames = results.tools.map((t: any) => t.name);
      const capabilities: Record<string, any> = {
        tools: toolNames,
        resources: [],
        prompts: [],
      };
      if (results.serverInfo?.capabilities) {
        if (results.serverInfo.capabilities.resources) capabilities.resources = results.serverInfo.capabilities.resources;
        if (results.serverInfo.capabilities.prompts) capabilities.prompts = results.serverInfo.capabilities.prompts;
      }

      await storage.updateMcpServer(server.id, {
        status: "running",
        lastHeartbeat: new Date(),
        capabilities,
        version: results.serverInfo?.serverInfo?.version || server.version,
      } as any);

      res.json({ success: true, ...results });
    } catch (err: any) {
      await storage.updateMcpServer(server.id, { status: "error" } as any);
      results.error = err.message;
      res.json({ success: false, ...results });
    }
  });

  app.post("/api/tenants/:tenantId/mcp-servers/test-connection", async (req, res) => {
    const { url, apiKey } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    try {
      const start = Date.now();

      const initResp = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1, method: "initialize",
          params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "reveille-cloud", version: "1.0.0" } },
        }),
      });
      const initData = await initResp.json() as any;

      const toolsResp = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
      });
      const toolsData = await toolsResp.json() as any;
      const tools = toolsData.result?.tools || [];
      const latencyMs = Date.now() - start;

      res.json({
        success: true,
        tools,
        serverInfo: initData.result || null,
        latencyMs,
      });
    } catch (err: any) {
      res.json({ success: false, error: err.message, tools: [], serverInfo: null, latencyMs: 0 });
    }
  });

  app.post("/api/tenants/:tenantId/mcp-servers/:serverId/call-tool", async (req, res) => {
    const server = await getMcpServerForTenant(req.params.serverId, req.params.tenantId);
    if (!server) return res.status(404).json({ error: "Server not found" });
    if (!server.url) return res.status(400).json({ error: "Server has no URL configured" });

    const { toolName, arguments: toolArgs } = req.body;
    if (!toolName) return res.status(400).json({ error: "toolName is required" });

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (server.apiKey) headers["Authorization"] = `Bearer ${server.apiKey}`;

    const start = Date.now();
    try {
      const resp = await fetch(server.url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1, method: "tools/call",
          params: { name: toolName, arguments: toolArgs || {} },
        }),
      });
      const data = await resp.json() as any;
      const durationMs = Date.now() - start;

      await storage.createMcpToolCall({
        serverId: server.id,
        tenantId: server.tenantId,
        method: "tools/call",
        toolName,
        params: { name: toolName, arguments: toolArgs || {} },
        result: data.result || null,
        errorCode: data.error?.code || null,
        errorMessage: data.error?.message || null,
        durationMs,
        status: data.error ? "error" : "success",
        calledAt: new Date(),
      });

      res.json({ success: !data.error, result: data.result, error: data.error, durationMs });
    } catch (err: any) {
      const durationMs = Date.now() - start;
      await storage.createMcpToolCall({
        serverId: server.id,
        tenantId: server.tenantId,
        method: "tools/call",
        toolName,
        params: { name: toolName, arguments: toolArgs || {} },
        errorMessage: err.message,
        durationMs,
        status: "error",
        calledAt: new Date(),
      });
      res.json({ success: false, error: { message: err.message }, durationMs });
    }
  });

  app.post("/api/tenants/:tenantId/mcp-servers/seed-demo", async (req, res) => {
    const tenantId = req.params.tenantId;
    const now = new Date();

    const demoServers = [
      {
        tenantId,
        name: "SharePoint Document Search",
        description: "MCP server providing document search and retrieval tools across SharePoint libraries",
        transportType: "stdio",
        command: "node",
        args: ["dist/mcp-sharepoint.js"],
        status: "running",
        lastHeartbeat: new Date(now.getTime() - 30000),
        uptime: 86400,
        restartCount: 2,
        version: "1.4.2",
        capabilities: { tools: ["search_documents", "get_document", "list_libraries", "get_permissions"], resources: ["sharepoint://sites"], prompts: ["summarize_document"] },
      },
      {
        tenantId,
        name: "Microsoft Graph API Bridge",
        description: "Exposes Microsoft Graph API operations as MCP tools for agent consumption",
        transportType: "sse",
        url: "http://localhost:3100/sse",
        status: "running",
        lastHeartbeat: new Date(now.getTime() - 15000),
        uptime: 172800,
        restartCount: 0,
        version: "2.1.0",
        capabilities: { tools: ["get_user", "list_users", "send_email", "create_event", "get_teams_channels"], resources: ["graph://users", "graph://groups"], prompts: [] },
      },
      {
        tenantId,
        name: "Compliance & Audit Logger",
        description: "MCP server for compliance checking and audit log analysis",
        transportType: "streamable-http",
        url: "http://localhost:3200/mcp",
        status: "error",
        lastHeartbeat: new Date(now.getTime() - 300000),
        uptime: 0,
        restartCount: 5,
        version: "0.9.1",
        capabilities: { tools: ["check_compliance", "search_audit_logs", "get_dlp_policies"], resources: [], prompts: ["compliance_report"] },
      },
      {
        tenantId,
        name: "Teams Notification Hub",
        description: "Sends notifications and adaptive cards to Microsoft Teams channels",
        transportType: "stdio",
        command: "python",
        args: ["-m", "mcp_teams_notifier"],
        status: "stopped",
        lastHeartbeat: new Date(now.getTime() - 7200000),
        uptime: 0,
        restartCount: 1,
        version: "1.0.0",
        capabilities: { tools: ["send_notification", "send_adaptive_card", "create_channel"], resources: ["teams://channels"], prompts: [] },
      },
    ];

    const createdServers: any[] = [];
    for (const s of demoServers) {
      const server = await storage.createMcpServer(s as any);
      createdServers.push(server);
    }

    const toolNames: Record<string, string[]> = {
      "SharePoint Document Search": ["search_documents", "get_document", "list_libraries", "get_permissions"],
      "Microsoft Graph API Bridge": ["get_user", "list_users", "send_email", "create_event", "get_teams_channels"],
      "Compliance & Audit Logger": ["check_compliance", "search_audit_logs", "get_dlp_policies"],
      "Teams Notification Hub": ["send_notification", "send_adaptive_card", "create_channel"],
    };

    const sessions = ["sess-a1b2c3", "sess-d4e5f6", "sess-g7h8i9"];

    for (const server of createdServers) {
      const tools = toolNames[server.name] || [];
      const callCount = server.status === "running" ? 25 : server.status === "error" ? 8 : 3;
      for (let i = 0; i < callCount; i++) {
        const tool = tools[Math.floor(Math.random() * tools.length)];
        const isError = server.status === "error" ? Math.random() < 0.4 : Math.random() < 0.05;
        const duration = isError ? 5000 + Math.random() * 25000 : 50 + Math.random() * 2000;
        const session = sessions[Math.floor(Math.random() * sessions.length)];
        const callTime = new Date(now.getTime() - Math.random() * 86400000);

        await storage.createMcpToolCall({
          serverId: server.id,
          tenantId,
          sessionId: session,
          method: "tools/call",
          toolName: tool,
          params: { name: tool, arguments: { query: "demo" } },
          result: isError ? null : { content: [{ type: "text", text: `Result from ${tool}` }] },
          errorCode: isError ? (Math.random() < 0.5 ? -32603 : -32000) : null,
          errorMessage: isError ? (Math.random() < 0.5 ? "Internal server error" : "Connection timeout to upstream service") : null,
          durationMs: Math.round(duration),
          status: isError ? "error" : "success",
          calledAt: callTime,
        });
      }
    }

    await logAdminAction(tenantId, "seed_demo", "mcpServers", null, { serverCount: createdServers.length });
    res.json({ servers: createdServers.length, message: "Demo MCP servers and tool calls seeded" });
  });

  app.get("/api/tenants/:tenantId/entra-signins", async (req, res) => {
    const { limit, userId, appName, status, riskLevel, since } = req.query as any;
    const signIns = await storage.getEntraSignIns(req.params.tenantId, {
      limit: limit ? parseInt(limit) : undefined,
      userId, appName, status, riskLevel, since,
    });
    res.json(signIns);
  });

  app.get("/api/tenants/:tenantId/entra-signins/stats", async (req, res) => {
    const stats = await storage.getEntraSignInStats(req.params.tenantId);
    res.json(stats);
  });

  app.get("/api/tenants/:tenantId/entra-signins/users", async (req, res) => {
    const users = await storage.getEntraSignInUserBreakdown(req.params.tenantId);
    res.json(users);
  });

  app.post("/api/tenants/:tenantId/entra-signins/collect", async (req, res) => {
    try {
      const result = await collectEntraSignIns(req.params.tenantId);
      await logAdminAction(req.params.tenantId, "collect", "entraSignIns", null, { signInsCollected: result.signInsCollected });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/tenants/:tenantId/entra-signins/seed-demo", async (req, res) => {
    const tenantId = req.params.tenantId;
    const now = new Date();

    const users = [
      { id: "u1-alex", upn: "alex.johnson@contoso.com", name: "Alex Johnson" },
      { id: "u2-sarah", upn: "sarah.chen@contoso.com", name: "Sarah Chen" },
      { id: "u3-mike", upn: "mike.wilson@contoso.com", name: "Mike Wilson" },
      { id: "u4-emma", upn: "emma.davis@contoso.com", name: "Emma Davis" },
      { id: "u5-carlos", upn: "carlos.garcia@contoso.com", name: "Carlos Garcia" },
      { id: "u6-priya", upn: "priya.patel@contoso.com", name: "Priya Patel" },
      { id: "u7-external", upn: "vendor@external.com", name: "External Vendor" },
    ];

    const apps = [
      "Microsoft Teams", "SharePoint Online", "Outlook", "Microsoft 365 Portal",
      "Azure Portal", "Power BI", "OneDrive", "Microsoft Copilot",
    ];

    const locations = [
      { city: "Seattle", state: "WA", country: "US", lat: 47.6062, lng: -122.3321 },
      { city: "New York", state: "NY", country: "US", lat: 40.7128, lng: -74.0060 },
      { city: "London", state: "England", country: "GB", lat: 51.5074, lng: -0.1278 },
      { city: "Tokyo", state: "Tokyo", country: "JP", lat: 35.6762, lng: 139.6503 },
      { city: "Sydney", state: "NSW", country: "AU", lat: -33.8688, lng: 151.2093 },
      { city: null, state: null, country: null, lat: null, lng: null },
    ];

    const browsers = ["Chrome 120", "Edge 119", "Safari 17", "Firefox 121", "Mobile Safari", "Chrome Mobile"];
    const oses = ["Windows 11", "macOS 14", "iOS 17", "Android 14", "Windows 10", "Linux"];
    const clientApps = ["Browser", "Mobile Apps and Desktop clients", "Exchange ActiveSync", "Other clients"];

    let count = 0;
    for (let i = 0; i < 150; i++) {
      const user = users[Math.floor(Math.random() * users.length)];
      const app = apps[Math.floor(Math.random() * apps.length)];
      const loc = locations[Math.floor(Math.random() * locations.length)];
      const minutesAgo = Math.floor(Math.random() * 1440);
      const signInTime = new Date(now.getTime() - minutesAgo * 60 * 1000);

      const isExternalUser = user.id === "u7-external";
      const failChance = isExternalUser ? 0.4 : 0.08;
      const isFailed = Math.random() < failChance;
      const isRisky = isExternalUser ? Math.random() < 0.3 : Math.random() < 0.05;

      let riskLvl = "none";
      if (isRisky) {
        const r = Math.random();
        riskLvl = r < 0.5 ? "low" : r < 0.8 ? "medium" : "high";
      }

      const errorCodes = [0, 50126, 50074, 53003, 50076, 500121];
      const errorCode = isFailed ? errorCodes[Math.floor(Math.random() * (errorCodes.length - 1)) + 1] : 0;
      const failureReasons: Record<number, string> = {
        50126: "Invalid username or password",
        50074: "MFA required but not completed",
        53003: "Blocked by Conditional Access",
        50076: "MFA challenge required",
        500121: "Authentication failed during MFA",
      };

      const mfaRequired = Math.random() < 0.6;
      const caStatus = isFailed && errorCode === 53003 ? "failure" : (Math.random() < 0.8 ? "success" : "notApplied");

      await storage.upsertEntraSignIn({
        tenantId,
        signInId: `demo-signin-${i}-${Date.now()}`,
        userId: user.id,
        userPrincipalName: user.upn,
        userDisplayName: user.name,
        appDisplayName: app,
        appId: `app-${app.toLowerCase().replace(/\s+/g, "-")}`,
        clientAppUsed: clientApps[Math.floor(Math.random() * clientApps.length)],
        ipAddress: `${10 + Math.floor(Math.random() * 240)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`,
        city: loc.city,
        state: loc.state,
        countryOrRegion: loc.country,
        latitude: loc.lat,
        longitude: loc.lng,
        status: isFailed ? "failure" : "success",
        errorCode,
        failureReason: isFailed ? (failureReasons[errorCode] || "Unknown error") : null,
        riskLevel: riskLvl,
        riskState: isRisky ? "atRisk" : "none",
        riskDetail: isRisky ? "Sign-in from unfamiliar location" : null,
        conditionalAccessStatus: caStatus,
        mfaRequired,
        mfaResult: mfaRequired ? (isFailed && errorCode === 50074 ? "denied" : "succeeded") : null,
        deviceName: Math.random() < 0.5 ? `${user.name.split(" ")[0]}-PC` : null,
        deviceOS: oses[Math.floor(Math.random() * oses.length)],
        deviceBrowser: browsers[Math.floor(Math.random() * browsers.length)],
        isCompliant: Math.random() < 0.7,
        isManagedDevice: Math.random() < 0.6,
        isInteractive: Math.random() < 0.85,
        signInAt: signInTime,
      });
      count++;
    }

    await logAdminAction(tenantId, "seed_demo", "entraSignIns", null, { count });
    res.json({ count, message: "Demo Entra sign-in data seeded" });
  });

  app.post("/api/tenants/:tenantId/flush-token-cache", async (req, res) => {
    try {
      const tenant = await storage.getTenant(req.params.tenantId);
      if (!tenant) return res.status(404).json({ error: "Tenant not found" });
      clearTokenCache(tenant.azureTenantId);
      console.log(`[TokenCache] Flushed all cached tokens for ${tenant.name} (${tenant.azureTenantId})`);
      res.json({ success: true, message: `Token cache cleared for ${tenant.name}` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/tenants/:tenantId/spe/collect", async (req, res) => {
    try {
      const tenant = await storage.getTenant(req.params.tenantId);
      if (tenant) {
        clearTokenCache(tenant.azureTenantId);
        console.log(`[SPE] Token cache cleared before collection for ${tenant.name} — fresh tokens will pick up any new permissions`);
      }
      const result = await collectSpeData(req.params.tenantId);
      await logAdminAction(req.params.tenantId, "collect", "speData", null, {
        containersCollected: result.containersCollected,
        accessEventsCollected: result.accessEventsCollected,
        securityEventsCollected: result.securityEventsCollected,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/tenants/:tenantId/spe/containers", async (req, res) => {
    const containers = await storage.getSpeContainers(req.params.tenantId);
    res.json(containers);
  });

  app.get("/api/tenants/:tenantId/spe/access-events", async (req, res) => {
    const { containerId, since, limit, operation } = req.query as any;
    const events = await storage.getSpeAccessEvents(req.params.tenantId, {
      containerId,
      since: since ? new Date(since) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      operation,
    });
    res.json(events);
  });

  app.get("/api/tenants/:tenantId/spe/security-events", async (req, res) => {
    const { since, limit, severity, containerId } = req.query as any;
    const events = await storage.getSpeSecurityEvents(req.params.tenantId, {
      since: since ? new Date(since) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      severity,
      containerId,
    });
    res.json(events);
  });

  app.get("/api/tenants/:tenantId/spe/content-type-stats", async (req, res) => {
    const stats = await storage.getSpeContentTypeStats(req.params.tenantId, req.query.containerId as string | undefined);
    res.json(stats);
  });

  app.get("/api/tenants/:tenantId/spe/stats", async (req, res) => {
    const stats = await storage.getSpeStats(req.params.tenantId);
    res.json(stats);
  });

  return httpServer;
}
