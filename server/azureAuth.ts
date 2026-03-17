import { Client } from '@microsoft/microsoft-graph-client';
import crypto from 'crypto';

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

const tokenCache = new Map<string, TokenCache>();

function getSigningSecret(): string {
  return process.env.SESSION_SECRET || process.env.AZURE_CLIENT_SECRET || "reveille-cloud-state-signing";
}

export function isAzureAppConfigured(): boolean {
  return !!(process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET);
}

export function getAzureAppConfig() {
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Azure AD app not configured — set AZURE_CLIENT_ID and AZURE_CLIENT_SECRET");
  }
  return { clientId, clientSecret };
}

export function signState(payload: Record<string, string>): string {
  const nonce = crypto.randomBytes(16).toString("hex");
  const data = { ...payload, nonce, ts: Date.now().toString() };
  const json = JSON.stringify(data);
  const hmac = crypto.createHmac("sha256", getSigningSecret()).update(json).digest("hex");
  const signed = Buffer.from(JSON.stringify({ data: json, sig: hmac })).toString("base64url");
  return signed;
}

export function verifyState(state: string): Record<string, string> | null {
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf-8"));
    const { data, sig } = decoded;
    const expectedSig = crypto.createHmac("sha256", getSigningSecret()).update(data).digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
      console.error("[AzureAuth] State signature mismatch");
      return null;
    }
    const parsed = JSON.parse(data);
    const ts = parseInt(parsed.ts);
    if (Date.now() - ts > 15 * 60 * 1000) {
      console.error("[AzureAuth] State expired (>15 min)");
      return null;
    }
    return parsed;
  } catch (err) {
    console.error("[AzureAuth] State verification failed:", err);
    return null;
  }
}

export function buildAdminConsentUrl(tenantId: string, redirectUri: string, state: string): string {
  const { clientId } = getAzureAppConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: "https://graph.microsoft.com/.default",
  });
  return `https://login.microsoftonline.com/${tenantId}/adminconsent?${params.toString()}`;
}

export function buildCommonConsentUrl(redirectUri: string, state: string): string {
  const { clientId } = getAzureAppConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: "https://graph.microsoft.com/.default",
  });
  return `https://login.microsoftonline.com/common/adminconsent?${params.toString()}`;
}

export async function getClientCredentialsToken(azureTenantId: string): Promise<string> {
  const cached = tokenCache.get(azureTenantId);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.accessToken;
  }

  const { clientId, clientSecret } = getAzureAppConfig();

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const response = await fetch(
    `https://login.microsoftonline.com/${azureTenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorDesc = errorData.error_description || errorData.error || response.statusText;
    throw new Error(`Token acquisition failed for tenant ${azureTenantId}: ${errorDesc}`);
  }

  const data = await response.json();
  const accessToken = data.access_token;
  const expiresIn = data.expires_in || 3600;

  tokenCache.set(azureTenantId, {
    accessToken,
    expiresAt: Date.now() + expiresIn * 1000,
  });

  return accessToken;
}

export async function getAzureGraphClient(azureTenantId: string): Promise<ReturnType<typeof Client.initWithMiddleware>> {
  return Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => getClientCredentialsToken(azureTenantId),
    },
  });
}

export function clearTokenCache(azureTenantId?: string) {
  if (azureTenantId) {
    tokenCache.delete(azureTenantId);
    tokenCache.delete(`mgmt:${azureTenantId}`);
    tokenCache.delete(`pp:${azureTenantId}`);
    tokenCache.delete(`spo:${azureTenantId}`);
  } else {
    tokenCache.clear();
  }
}

export async function getPowerPlatformToken(azureTenantId: string): Promise<string> {
  const cacheKey = `pp:${azureTenantId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.accessToken;
  }

  const { clientId, clientSecret } = getAzureAppConfig();

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://api.bap.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const response = await fetch(
    `https://login.microsoftonline.com/${azureTenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorDesc = errorData.error_description || errorData.error || response.statusText;
    throw new Error(`Power Platform token failed for tenant ${azureTenantId}: ${errorDesc}`);
  }

  const data = await response.json();
  tokenCache.set(cacheKey, {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  });

  return data.access_token;
}

export async function getSharePointToken(azureTenantId: string, tenantDomain: string): Promise<string> {
  const cacheKey = `spo:${azureTenantId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.accessToken;
  }

  const { clientId, clientSecret } = getAzureAppConfig();

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: `https://${tenantDomain}.sharepoint.com/.default`,
    grant_type: "client_credentials",
  });

  const response = await fetch(
    `https://login.microsoftonline.com/${azureTenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorDesc = errorData.error_description || errorData.error || response.statusText;
    throw new Error(`SharePoint token failed for tenant ${azureTenantId}: ${errorDesc}`);
  }

  const data = await response.json();
  tokenCache.set(cacheKey, {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  });

  return data.access_token;
}

export async function getManagementApiToken(azureTenantId: string): Promise<string> {
  const cacheKey = `mgmt:${azureTenantId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.accessToken;
  }

  const { clientId, clientSecret } = getAzureAppConfig();

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://manage.office.com/.default",
    grant_type: "client_credentials",
  });

  const response = await fetch(
    `https://login.microsoftonline.com/${azureTenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorDesc = errorData.error_description || errorData.error || response.statusText;
    throw new Error(`Management API token failed for tenant ${azureTenantId}: ${errorDesc}`);
  }

  const data = await response.json();
  tokenCache.set(cacheKey, {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  });

  return data.access_token;
}
