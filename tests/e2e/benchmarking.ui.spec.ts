import { test, expect, type Page } from "@playwright/test";

const COLS_KEY = "benchmarking.visibleCols.v1";

interface Org {
  id: string;
  name: string;
  mode: "standard" | "msp";
}

async function fetchOrgs(page: Page): Promise<{ standard: Org; msp: Org }> {
  const resp = await page.request.get("/api/organizations");
  expect(resp.ok()).toBeTruthy();
  const orgs: Org[] = await resp.json();
  const standard = orgs.find((o) => o.mode === "standard");
  const msp = orgs.find((o) => o.mode === "msp");
  if (!standard || !msp) {
    throw new Error("Need both a standard and an MSP org seeded for these tests");
  }
  return { standard, msp };
}

/**
 * The active org is held in React state only — page.goto / page.reload reset it
 * to the default "Cascadia Oceanic" (standard). Use the header switcher to pick
 * the MSP org, then SPA-navigate via pushState + popstate (wouter listens on
 * 'popstate') so the active org survives the navigation.
 */
async function spaNavigate(page: Page, path: string) {
  await page.evaluate((p) => {
    window.history.pushState({}, "", p);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
}

async function selectMspOrg(page: Page, mspName: string) {
  await page.getByTestId("select-header-org").click();
  await page.getByRole("option", { name: new RegExp(`^${mspName}\\b`) }).click();
  // Wait for the org context query to refetch and the tenant switcher to appear
  await expect(page.getByTestId("select-header-tenant")).toBeVisible();
}

async function gotoBenchmarkingAsMsp(page: Page, mspName: string) {
  await page.goto("/");
  await selectMspOrg(page, mspName);
  await spaNavigate(page, "/benchmarking");
  await expect(page.getByTestId("table-benchmarking")).toBeVisible();
}

test.describe("Benchmarking page", () => {
  test("redirects non-MSP orgs from /benchmarking back to /", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());

    await page.goto("/benchmarking");
    // The redirect only fires after orgLoading flips to false. Wait for it.
    await page.waitForURL((url) => new URL(url).pathname === "/", { timeout: 10_000 });
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("text-page-title")).not.toHaveText(
      "Cross-Tenant Benchmarking",
    );
  });

  test("renders the grid for an MSP org with all six metric columns", async ({ page }) => {
    const { msp } = await fetchOrgs(page);
    await gotoBenchmarkingAsMsp(page, msp.name);

    await expect(page).toHaveURL(/\/benchmarking$/);
    await expect(page.getByTestId("text-page-title")).toHaveText("Cross-Tenant Benchmarking");
    await expect(page.locator("[data-testid^='row-tenant-']").first()).toBeVisible();
    await expect(page.getByTestId("select-window")).toContainText("Last 7 days");

    for (const k of [
      "latencyP95",
      "alertCount",
      "agentErrorRate",
      "copilotUsers",
      "llmSpend",
      "riskySignIns",
    ]) {
      await expect(page.getByTestId(`header-${k}`)).toBeVisible();
    }

    // Selector-driven and fixed-window labels
    await expect(page.getByTestId("header-latencyP95")).toContainText(/7D/i);
    await expect(page.getByTestId("header-copilotUsers")).toContainText(/28D/i);
    await expect(page.getByTestId("header-llmSpend")).toContainText(/MTD/i);
    await expect(page.getByTestId("header-riskySignIns")).toContainText(/7D/i);
  });

  test("window selector refetches data and updates selector-driven headers only", async ({
    page,
  }) => {
    const { msp } = await fetchOrgs(page);
    await gotoBenchmarkingAsMsp(page, msp.name);

    const refetch = page.waitForResponse(
      (r) =>
        r.url().includes("/api/benchmarking") &&
        r.url().includes("window=30d") &&
        r.status() === 200,
    );

    await page.getByTestId("select-window").click();
    await page.getByTestId("window-30d").click();
    await refetch;

    await expect(page.getByTestId("select-window")).toContainText("Last 30 days");
    await expect(page.getByTestId("header-latencyP95")).toContainText(/30D/i);
    await expect(page.getByTestId("header-alertCount")).toContainText(/30D/i);
    await expect(page.getByTestId("header-agentErrorRate")).toContainText(/30D/i);

    // Fixed-window columns are unaffected by the selector
    await expect(page.getByTestId("header-copilotUsers")).toContainText(/28D/i);
    await expect(page.getByTestId("header-llmSpend")).toContainText(/MTD/i);
    await expect(page.getByTestId("header-riskySignIns")).toContainText(/7D/i);
  });

  test("column toggles persist across a full reload", async ({ page }) => {
    const { msp } = await fetchOrgs(page);
    await gotoBenchmarkingAsMsp(page, msp.name);

    // Hide the LLM spend column
    await page.getByTestId("button-columns").click();
    await page.getByTestId("toggle-col-llmSpend").click();
    await page.keyboard.press("Escape");

    await expect(page.getByTestId("header-llmSpend")).toHaveCount(0);
    await expect(page.getByTestId("button-columns")).toContainText("(5/6)");

    const stored = await page.evaluate((k) => localStorage.getItem(k), COLS_KEY);
    const parsed: string[] = JSON.parse(stored || "[]");
    expect(parsed).not.toContain("llmSpend");
    for (const k of [
      "latencyP95",
      "alertCount",
      "agentErrorRate",
      "copilotUsers",
      "riskySignIns",
    ]) {
      expect(parsed).toContain(k);
    }

    // Hard reload — resets active org to standard, so the page redirects.
    // Re-pick MSP and SPA-navigate back to /benchmarking to verify localStorage
    // persistence applied.
    await page.reload();
    await selectMspOrg(page, msp.name);
    await spaNavigate(page, "/benchmarking");
    await expect(page.getByTestId("table-benchmarking")).toBeVisible();

    await expect(page.getByTestId("header-llmSpend")).toHaveCount(0);
    await expect(page.getByTestId("button-columns")).toContainText("(5/6)");

    // Re-enable to restore default state for subsequent tests
    await page.getByTestId("button-columns").click();
    await page.getByTestId("toggle-col-llmSpend").click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("header-llmSpend")).toBeVisible();
    await expect(page.getByTestId("button-columns")).toContainText("(6/6)");
  });

  test("cell click deep-links with tenantId + window applied", async ({ page }) => {
    const { msp } = await fetchOrgs(page);
    await gotoBenchmarkingAsMsp(page, msp.name);

    // Switch to 30d so we can verify selector-window plumbing.
    await page.getByTestId("select-window").click();
    await page.getByTestId("window-30d").click();
    await expect(page.getByTestId("header-latencyP95")).toContainText(/30D/i);

    // 1) Selector-window cell: latencyP95 → /performance?window=30d
    const latencyCell = page.locator("[data-testid^='cell-'][data-testid$='-latencyP95']").first();
    const latencyTestId = await latencyCell.getAttribute("data-testid");
    const tenantA = latencyTestId!.replace(/^cell-/, "").replace(/-latencyP95$/, "");
    const tenantAName = (
      await page.getByTestId(`text-tenant-name-${tenantA}`).textContent()
    )?.trim();
    expect(tenantAName).toBeTruthy();

    await latencyCell.click();
    await page.waitForURL(/\/performance\?/);
    expect(new URL(page.url()).pathname).toBe("/performance");
    expect(new URL(page.url()).searchParams.get("tenantId")).toBe(tenantA);
    expect(new URL(page.url()).searchParams.get("window")).toBe("30d");
    await expect(page.getByTestId("text-page-title")).toHaveText("Performance Explorer");
    await expect(page.getByTestId("select-header-tenant")).toContainText(tenantAName!);

    // 2) Fixed-window cell: llmSpend → /llm-performance?window=mtd (NOT 30d)
    await spaNavigate(page, "/benchmarking");
    await expect(page.getByTestId("table-benchmarking")).toBeVisible();

    const llmCell = page.locator("[data-testid^='cell-'][data-testid$='-llmSpend']").first();
    const llmTestId = await llmCell.getAttribute("data-testid");
    const tenantB = llmTestId!.replace(/^cell-/, "").replace(/-llmSpend$/, "");
    await llmCell.click();
    await page.waitForURL(/\/llm-performance\?/);
    expect(new URL(page.url()).pathname).toBe("/llm-performance");
    expect(new URL(page.url()).searchParams.get("tenantId")).toBe(tenantB);
    expect(new URL(page.url()).searchParams.get("window")).toBe("mtd");
    await expect(page.getByTestId("text-page-title")).toHaveText("LLM Performance");

    // 3) Fixed-window cell: riskySignIns → /entra-signins?window=7d
    await spaNavigate(page, "/benchmarking");
    await expect(page.getByTestId("table-benchmarking")).toBeVisible();

    const riskCell = page
      .locator("[data-testid^='cell-'][data-testid$='-riskySignIns']")
      .first();
    const riskTestId = await riskCell.getAttribute("data-testid");
    const tenantC = riskTestId!.replace(/^cell-/, "").replace(/-riskySignIns$/, "");
    await riskCell.click();
    await page.waitForURL(/\/entra-signins\?/);
    expect(new URL(page.url()).pathname).toBe("/entra-signins");
    expect(new URL(page.url()).searchParams.get("tenantId")).toBe(tenantC);
    expect(new URL(page.url()).searchParams.get("window")).toBe("7d");
    await expect(page.getByTestId("text-page-title")).toHaveText("Entra ID Sign-Ins");
  });
});
