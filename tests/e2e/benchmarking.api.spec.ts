import { test, expect } from "@playwright/test";

interface Org {
  id: string;
  name: string;
  mode: "standard" | "msp";
}

let standardOrgId: string;
let mspOrgId: string;

test.beforeAll(async ({ request }) => {
  const resp = await request.get("/api/organizations");
  expect(resp.ok()).toBeTruthy();
  const orgs: Org[] = await resp.json();

  const standard = orgs.find((o) => o.mode === "standard");
  const msp = orgs.find((o) => o.mode === "msp");
  if (!standard || !msp) {
    throw new Error(
      `Expected at least one standard and one msp org for tests, got: ${JSON.stringify(orgs)}`,
    );
  }
  standardOrgId = standard.id;
  mspOrgId = msp.id;
});

test.describe("/api/benchmarking", () => {
  test("returns 400 when orgId is missing", async ({ request }) => {
    const r = await request.get("/api/benchmarking");
    expect(r.status()).toBe(400);
    const body = await r.json();
    expect(typeof body.message).toBe("string");
  });

  test("returns 400 for an invalid window", async ({ request }) => {
    const r = await request.get(`/api/benchmarking?orgId=${mspOrgId}&window=bogus`);
    expect(r.status()).toBe(400);
  });

  test("returns 403 for a standard-mode (non-MSP) org", async ({ request }) => {
    const r = await request.get(`/api/benchmarking?orgId=${standardOrgId}&window=7d`);
    expect(r.status()).toBe(403);
    const body = await r.json();
    expect(String(body.message)).toMatch(/MSP/i);
  });

  test("returns the full benchmarking shape for an MSP org", async ({ request }) => {
    const r = await request.get(`/api/benchmarking?orgId=${mspOrgId}&window=7d`);
    expect(r.status()).toBe(200);
    const body = await r.json();

    expect(body.orgId).toBe(mspOrgId);
    expect(typeof body.orgName).toBe("string");
    expect(body.windowLabel).toBe("7d");
    expect(typeof body.generatedAt).toBe("string");
    expect(Number.isFinite(Date.parse(body.generatedAt))).toBe(true);
    expect(typeof body.metricWindows).toBe("object");
    expect(Array.isArray(body.tenants)).toBe(true);
    expect(body.tenants.length).toBeGreaterThan(0);

    const requiredMetricKeys = [
      "latencyP95",
      "alertCount",
      "agentErrorRate",
      "copilotUsers",
      "llmSpend",
      "riskySignIns",
    ];

    for (const key of requiredMetricKeys) {
      expect(body.metricWindows[key]).toBeDefined();
      expect(typeof body.metricWindows[key].label).toBe("string");
      expect(typeof body.metricWindows[key].ms).toBe("number");
    }

    const t0 = body.tenants[0];
    expect(typeof t0.tenantId).toBe("string");
    expect(typeof t0.tenantName).toBe("string");
    expect(typeof t0.metrics).toBe("object");
    for (const key of requiredMetricKeys) {
      const cell = t0.metrics[key];
      expect(cell, `tenant should have metric ${key}`).toBeDefined();
      expect(typeof cell.value).toBe("number");
      expect(cell.prev === null || typeof cell.prev === "number").toBe(true);
      expect(cell.delta === null || typeof cell.delta === "number").toBe(true);
      expect(Array.isArray(cell.sparkline)).toBe(true);
    }
  });

  test("accepts each documented window value", async ({ request }) => {
    for (const w of ["24h", "7d", "30d", "90d"]) {
      const r = await request.get(`/api/benchmarking?orgId=${mspOrgId}&window=${w}`);
      expect(r.status(), `window=${w} should be 200`).toBe(200);
      const body = await r.json();
      expect(body.windowLabel).toBe(w);
    }
  });
});
