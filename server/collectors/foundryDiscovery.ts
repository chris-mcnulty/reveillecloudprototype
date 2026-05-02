import { getArmToken, isAzureAppConfigured } from "../azureAuth";
import { storage } from "../storage";
import type { FoundryDeployment, LlmModel } from "@shared/schema";

export interface FoundryDiscoveryResult {
  deploymentsDiscovered: number;
  accountsScanned: number;
  subscriptionsScanned: number;
  metricsCollected: number;
  needsConsent: boolean;
  consentReason: string | null;
  errors: string[];
}

interface ArmListResponse<T> {
  value: T[];
  nextLink?: string;
}

interface ArmSubscription {
  subscriptionId: string;
  displayName: string;
  state: string;
}

interface ArmCognitiveAccount {
  id: string;
  name: string;
  kind?: string;
  location?: string;
  properties?: {
    endpoint?: string;
    endpoints?: Record<string, string>;
    provisioningState?: string;
  };
}

interface ArmCognitiveDeployment {
  id: string;
  name: string;
  sku?: { name?: string; capacity?: number };
  properties?: {
    model?: { name?: string; version?: string; format?: string };
    provisioningState?: string;
    raiPolicyName?: string;
    capabilities?: Record<string, unknown>;
  };
}

interface AzureMonitorPoint {
  timeStamp: string;
  total?: number;
  count?: number;
  average?: number;
}

interface AzureMonitorTimeseries {
  metadatavalues?: Array<{ name: { value: string }; value: string }>;
  data?: AzureMonitorPoint[];
}

interface AzureMonitorMetric {
  name?: { value: string; localizedValue?: string };
  unit?: string;
  timeseries?: AzureMonitorTimeseries[];
}

interface AzureMonitorResponse {
  value?: AzureMonitorMetric[];
  timespan?: string;
  interval?: string;
}

const ARM_BASE = "https://management.azure.com";

const CONSENT_MESSAGE_RBAC =
  "The discovery service principal needs Azure RBAC role assignments on the subscription(s) it should monitor. " +
  "At minimum: 'Reader' on the subscription (to enumerate Cognitive Services / AI Foundry accounts and deployments) and 'Monitoring Reader' on each account or its resource group (to read Azure Monitor metrics). " +
  "Token scope used: https://management.azure.com/.default (client credentials, no delegated user impersonation).";

async function armFetch<T>(
  token: string,
  path: string,
): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
  const url = path.startsWith("http") ? path : `${ARM_BASE}${path}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    return { ok: false, status: resp.status, message: text.slice(0, 500) };
  }
  const data = (await resp.json()) as T;
  return { ok: true, data };
}

async function armList<T>(token: string, path: string): Promise<{ items: T[]; error?: { status: number; message: string } }> {
  const items: T[] = [];
  let nextPath: string | undefined = path;
  let firstError: { status: number; message: string } | undefined;
  let safety = 0;
  while (nextPath && safety < 50) {
    safety++;
    const resp: { ok: true; data: ArmListResponse<T> } | { ok: false; status: number; message: string } =
      await armFetch<ArmListResponse<T>>(token, nextPath);
    if (!resp.ok) {
      if (!firstError) firstError = { status: resp.status, message: resp.message };
      break;
    }
    if (Array.isArray(resp.data.value)) items.push(...resp.data.value);
    nextPath = resp.data.nextLink;
  }
  return { items, error: firstError };
}

function parseAccountResourceId(id: string): { subscriptionId: string; resourceGroup: string; accountName: string } | null {
  const m = id.match(/\/subscriptions\/([^/]+)\/resourceGroups\/([^/]+)\/providers\/Microsoft\.CognitiveServices\/accounts\/([^/]+)/i);
  if (!m) return null;
  return { subscriptionId: m[1], resourceGroup: m[2], accountName: m[3] };
}

interface MetricWindow {
  hours: number;
  interval: string;
}

const METRIC_WINDOWS: MetricWindow[] = [
  { hours: 24, interval: "PT1H" },
  { hours: 168, interval: "PT6H" },
  { hours: 720, interval: "P1D" },
];

async function fetchMetrics(
  token: string,
  deployment: FoundryDeployment,
  metricNames: string[],
  window: MetricWindow,
  extraFilter?: string,
): Promise<{ ok: boolean; raw?: AzureMonitorResponse; error?: string; status?: number }> {
  const now = new Date();
  const start = new Date(now.getTime() - window.hours * 60 * 60 * 1000);
  const timespan = `${start.toISOString()}/${now.toISOString()}`;
  const filterParts = [`ModelDeploymentName eq '${deployment.deploymentName}'`];
  if (extraFilter) filterParts.push(extraFilter);
  const filter = encodeURIComponent(filterParts.join(" and "));

  const basePath =
    `/subscriptions/${deployment.subscriptionId}` +
    `/resourceGroups/${deployment.resourceGroup}` +
    `/providers/Microsoft.CognitiveServices/accounts/${deployment.accountName}` +
    `/providers/Microsoft.Insights/metrics` +
    `?api-version=2023-10-01` +
    `&metricnames=${metricNames.join(",")}` +
    `&aggregation=Total` +
    `&interval=${window.interval}` +
    `&timespan=${encodeURIComponent(timespan)}`;

  const withFilter = `${basePath}&$filter=${filter}`;
  const resp = await armFetch<AzureMonitorResponse>(token, withFilter);
  if (resp.ok) return { ok: true, raw: resp.data };

  // Some metrics don't support certain dimension filters (StatusCode in particular);
  // fall back to no $filter so we at least get an aggregate.
  if (resp.status === 400 && extraFilter) {
    const fallbackFilter = encodeURIComponent(`ModelDeploymentName eq '${deployment.deploymentName}'`);
    const r2 = await armFetch<AzureMonitorResponse>(token, `${basePath}&$filter=${fallbackFilter}`);
    if (r2.ok) return { ok: true, raw: r2.data };
  }
  if (resp.status === 400) {
    const r3 = await armFetch<AzureMonitorResponse>(token, basePath);
    if (r3.ok) return { ok: true, raw: r3.data };
  }
  return { ok: false, error: `${resp.status}: ${resp.message}`, status: resp.status };
}

function extractMetricTotal(raw: AzureMonitorResponse | undefined, metricName: string): number {
  if (!raw?.value) return 0;
  const metric = raw.value.find((m) => (m?.name?.value || "").toLowerCase() === metricName.toLowerCase());
  if (!metric?.timeseries) return 0;
  let total = 0;
  for (const ts of metric.timeseries) {
    for (const point of ts.data || []) {
      if (typeof point.total === "number") total += point.total;
    }
  }
  return total;
}

function computeInferredCostCents(
  promptTokens: number,
  generatedTokens: number,
  llmModel: LlmModel | null,
): number | null {
  if (!llmModel) return null;
  const inputRate = llmModel.inputCostPerMtok;
  const outputRate = llmModel.outputCostPerMtok;
  if (inputRate == null && outputRate == null) return null;
  const inputCost = inputRate != null ? (promptTokens / 1_000_000) * inputRate * 100 : 0;
  const outputCost = outputRate != null ? (generatedTokens / 1_000_000) * outputRate * 100 : 0;
  return Number((inputCost + outputCost).toFixed(4));
}

async function collectWindowSnapshot(
  token: string,
  deployment: FoundryDeployment,
  window: MetricWindow,
  llmModel: LlmModel | null,
): Promise<{ ok: boolean; error?: string; status?: number }> {
  // Required by the task contract: ProcessedPromptTokens, GeneratedTokens, TotalCalls, Ratelimit.
  const tokenMetrics = await fetchMetrics(
    token,
    deployment,
    ["ProcessedPromptTokens", "GeneratedTokens", "TotalCalls", "Ratelimit", "AzureOpenAIRequests"],
    window,
  );
  if (!tokenMetrics.ok) return { ok: false, error: tokenMetrics.error, status: tokenMetrics.status };

  // Authoritative throttled-call count via AzureOpenAIRequests split by StatusCode=429.
  // The Ratelimit metric (above) reflects the configured rate-limit headroom; this counts
  // requests that were actually rejected with HTTP 429.
  const throttledMetrics = await fetchMetrics(
    token,
    deployment,
    ["AzureOpenAIRequests"],
    window,
    "StatusCode eq '429'",
  );

  const processedPromptTokens = extractMetricTotal(tokenMetrics.raw, "ProcessedPromptTokens");
  const generatedTokens = extractMetricTotal(tokenMetrics.raw, "GeneratedTokens");
  const totalCalls =
    extractMetricTotal(tokenMetrics.raw, "TotalCalls") ||
    extractMetricTotal(tokenMetrics.raw, "AzureOpenAIRequests");
  const rateLimitMaxObserved = extractMetricTotal(tokenMetrics.raw, "Ratelimit");
  const throttledCalls = throttledMetrics.ok
    ? extractMetricTotal(throttledMetrics.raw, "AzureOpenAIRequests")
    : 0;

  const now = new Date();
  const windowEnd = now;
  const windowStart = new Date(now.getTime() - window.hours * 60 * 60 * 1000);

  const inferredCostCents = computeInferredCostCents(processedPromptTokens, generatedTokens, llmModel);

  const rawMetrics: Record<string, unknown> = {
    tokens: tokenMetrics.raw,
    throttled: throttledMetrics.ok ? throttledMetrics.raw : null,
    rateLimitMaxObserved,
  };

  await storage.upsertFoundryUsageSnapshot({
    tenantId: deployment.tenantId,
    deploymentId: deployment.id,
    windowHours: window.hours,
    windowStart,
    windowEnd,
    processedPromptTokens,
    generatedTokens,
    totalCalls,
    throttledCalls,
    inferredCostCents,
    rawMetrics,
  });

  return { ok: true };
}

export async function collectFoundryDiscovery(tenantId: string): Promise<FoundryDiscoveryResult> {
  const result: FoundryDiscoveryResult = {
    deploymentsDiscovered: 0,
    accountsScanned: 0,
    subscriptionsScanned: 0,
    metricsCollected: 0,
    needsConsent: false,
    consentReason: null,
    errors: [],
  };

  if (!isAzureAppConfigured()) {
    result.errors.push("Azure app not configured");
    return result;
  }

  const tenant = await storage.getTenant(tenantId);
  if (!tenant?.azureTenantId) {
    result.errors.push("Tenant has no Azure tenant ID");
    return result;
  }

  let token: string;
  try {
    token = await getArmToken(tenant.azureTenantId);
  } catch (err: unknown) {
    const e = err as { message?: string; status?: number; azureError?: string };
    result.errors.push(`ARM token: ${e.message ?? String(err)}`);
    if (
      e.status === 401 ||
      e.status === 403 ||
      e.azureError === "invalid_client" ||
      e.azureError === "unauthorized_client"
    ) {
      result.needsConsent = true;
      result.consentReason = CONSENT_MESSAGE_RBAC;
    }
    return result;
  }

  const subsResp = await armList<ArmSubscription>(token, "/subscriptions?api-version=2022-12-01");
  if (subsResp.error) {
    result.errors.push(`Subscriptions: ${subsResp.error.status} ${subsResp.error.message}`);
    if (subsResp.error.status === 401 || subsResp.error.status === 403) {
      result.needsConsent = true;
      result.consentReason = CONSENT_MESSAGE_RBAC;
    }
    return result;
  }

  const enabledSubs = subsResp.items.filter((s) => s.state === "Enabled" || !s.state);
  result.subscriptionsScanned = enabledSubs.length;

  const allDeployments: FoundryDeployment[] = [];

  for (const sub of enabledSubs) {
    const accountsResp = await armList<ArmCognitiveAccount>(
      token,
      `/subscriptions/${sub.subscriptionId}/providers/Microsoft.CognitiveServices/accounts?api-version=2023-05-01`,
    );

    if (accountsResp.error) {
      if (accountsResp.error.status === 401 || accountsResp.error.status === 403) {
        result.errors.push(`Subscription ${sub.subscriptionId}: insufficient permissions to list Cognitive Services accounts`);
        if (!result.needsConsent) {
          result.needsConsent = true;
          result.consentReason = CONSENT_MESSAGE_RBAC;
        }
      } else {
        result.errors.push(`Accounts in ${sub.subscriptionId}: ${accountsResp.error.status} ${accountsResp.error.message}`);
      }
      continue;
    }

    const aiAccounts = accountsResp.items.filter((acc) => {
      const kind = (acc.kind || "").toLowerCase();
      return (
        kind === "openai" ||
        kind === "aiservices" ||
        kind === "cognitiveservices" ||
        kind.includes("openai") ||
        kind.includes("ai")
      );
    });

    result.accountsScanned += aiAccounts.length;

    for (const account of aiAccounts) {
      const parsed = parseAccountResourceId(account.id);
      if (!parsed) continue;

      const deploymentsResp = await armList<ArmCognitiveDeployment>(
        token,
        `/subscriptions/${parsed.subscriptionId}/resourceGroups/${parsed.resourceGroup}/providers/Microsoft.CognitiveServices/accounts/${parsed.accountName}/deployments?api-version=2023-05-01`,
      );

      if (deploymentsResp.error) {
        result.errors.push(
          `Deployments for ${account.name}: ${deploymentsResp.error.status} ${deploymentsResp.error.message}`,
        );
        continue;
      }

      for (const dep of deploymentsResp.items) {
        try {
          const upserted = await storage.upsertFoundryDeployment({
            tenantId,
            subscriptionId: parsed.subscriptionId,
            subscriptionName: sub.displayName ?? null,
            resourceGroup: parsed.resourceGroup,
            accountName: parsed.accountName,
            accountKind: account.kind ?? null,
            accountResourceId: account.id,
            endpoint: account.properties?.endpoint ?? null,
            region: account.location ?? null,
            deploymentName: dep.name,
            modelName: dep.properties?.model?.name ?? null,
            modelVersion: dep.properties?.model?.version ?? null,
            modelFormat: dep.properties?.model?.format ?? null,
            skuName: dep.sku?.name ?? null,
            skuCapacity: dep.sku?.capacity ?? null,
            provisioningState: dep.properties?.provisioningState ?? null,
            raiPolicyName: dep.properties?.raiPolicyName ?? null,
            rawProperties: (dep.properties ?? {}) as Record<string, unknown>,
          });
          allDeployments.push(upserted);
          result.deploymentsDiscovered++;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          result.errors.push(`Upsert deployment ${dep.name}: ${msg}`);
        }
      }
    }
  }

  for (const deployment of allDeployments) {
    const llmModel = deployment.llmModelId ? (await storage.getLlmModel(deployment.llmModelId)) ?? null : null;

    for (const window of METRIC_WINDOWS) {
      try {
        const snap = await collectWindowSnapshot(token, deployment, window, llmModel);
        if (!snap.ok) {
          if (snap.status === 401 || snap.status === 403) {
            if (!result.needsConsent) {
              result.needsConsent = true;
              result.consentReason = CONSENT_MESSAGE_RBAC;
            }
            result.errors.push(`Metrics ${window.hours}h for ${deployment.deploymentName}: ${snap.error}`);
            break;
          }
          result.errors.push(`Metrics ${window.hours}h for ${deployment.deploymentName}: ${snap.error}`);
          continue;
        }
        result.metricsCollected++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`Metrics ${window.hours}h for ${deployment.deploymentName}: ${msg}`);
      }
    }
  }

  return result;
}
