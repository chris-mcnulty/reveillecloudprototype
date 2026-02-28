import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTenantSchema, insertMonitoredSystemSchema, insertSyntheticTestSchema, insertAlertRuleSchema, insertMetricSchema, insertAlertSchema } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

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
    res.status(201).json(tenant);
  });

  app.patch("/api/tenants/:id", async (req, res) => {
    const updated = await storage.updateTenant(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: "Tenant not found" });
    res.json(updated);
  });

  app.delete("/api/tenants/:id", async (req, res) => {
    await storage.deleteTenant(req.params.id);
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
    res.status(201).json(system);
  });

  app.patch("/api/systems/:id", async (req, res) => {
    const updated = await storage.updateMonitoredSystem(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: "System not found" });
    res.json(updated);
  });

  app.delete("/api/systems/:id", async (req, res) => {
    await storage.deleteMonitoredSystem(req.params.id);
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
    res.status(201).json(test);
  });

  app.patch("/api/tests/:id", async (req, res) => {
    const updated = await storage.updateSyntheticTest(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: "Test not found" });
    res.json(updated);
  });

  app.delete("/api/tests/:id", async (req, res) => {
    await storage.deleteSyntheticTest(req.params.id);
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
    res.status(201).json(rule);
  });

  app.patch("/api/alert-rules/:id", async (req, res) => {
    const updated = await storage.updateAlertRule(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: "Alert rule not found" });
    res.json(updated);
  });

  app.delete("/api/alert-rules/:id", async (req, res) => {
    await storage.deleteAlertRule(req.params.id);
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
    res.json(updated);
  });

  app.get("/api/stats", async (_req, res) => {
    const stats = await storage.getGlobalStats();
    res.json(stats);
  });

  return httpServer;
}
