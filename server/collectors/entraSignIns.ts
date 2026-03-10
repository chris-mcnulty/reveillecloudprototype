import { getAzureGraphClient, isAzureAppConfigured } from "../azureAuth";
import { storage } from "../storage";
import type { InsertEntraSignIn } from "@shared/schema";

interface EntraSignInResult {
  signInsCollected: number;
  errors: string[];
}

export async function collectEntraSignIns(tenantId: string): Promise<EntraSignInResult> {
  const result: EntraSignInResult = { signInsCollected: 0, errors: [] };

  if (!isAzureAppConfigured()) {
    result.errors.push("Azure app not configured");
    return result;
  }

  const tenant = await storage.getTenant(tenantId);
  if (!tenant?.azureTenantId) {
    result.errors.push("Tenant has no Azure tenant ID");
    return result;
  }

  try {
    const client = await getAzureGraphClient(tenant.azureTenantId);
    const now = new Date();
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    let nextLink: string | null = null;
    let page = 0;
    const maxPages = 10;

    do {
      let response: any;
      if (nextLink) {
        response = await client.api(nextLink).get();
      } else {
        response = await client.api("/auditLogs/signIns")
          .filter(`createdDateTime ge ${since.toISOString()}`)
          .top(100)
          .orderby("createdDateTime desc")
          .get();
      }

      const signIns = response.value || [];
      for (const entry of signIns) {
        try {
          const statusObj = entry.status || {};
          const signInStatus = statusObj.errorCode === 0 ? "success" : "failure";
          const location = entry.location || {};
          const geoCoord = location.geoCoordinates || {};
          const device = entry.deviceDetail || {};

          const data: InsertEntraSignIn = {
            tenantId,
            signInId: entry.id,
            userId: entry.userId || null,
            userPrincipalName: entry.userPrincipalName || null,
            userDisplayName: entry.userDisplayName || null,
            appDisplayName: entry.appDisplayName || null,
            appId: entry.appId || null,
            clientAppUsed: entry.clientAppUsed || null,
            ipAddress: entry.ipAddress || null,
            city: location.city || null,
            state: location.state || null,
            countryOrRegion: location.countryOrRegion || null,
            latitude: geoCoord.latitude ? parseFloat(geoCoord.latitude) : null,
            longitude: geoCoord.longitude ? parseFloat(geoCoord.longitude) : null,
            status: signInStatus,
            errorCode: statusObj.errorCode ?? null,
            failureReason: statusObj.failureReason || null,
            riskLevel: entry.riskLevelDuringSignIn || "none",
            riskState: entry.riskState || null,
            riskDetail: entry.riskDetail || null,
            conditionalAccessStatus: entry.conditionalAccessStatus || null,
            mfaRequired: !!(entry.mfaDetail?.authMethod),
            mfaResult: entry.mfaDetail?.authDetail || null,
            deviceName: device.displayName || null,
            deviceOS: device.operatingSystem || null,
            deviceBrowser: device.browser || null,
            isCompliant: entry.deviceDetail?.isCompliant ?? null,
            isManagedDevice: entry.deviceDetail?.isManaged ?? null,
            isInteractive: entry.isInteractive !== false,
            signInAt: entry.createdDateTime ? new Date(entry.createdDateTime) : now,
          };

          await storage.upsertEntraSignIn(data);
          result.signInsCollected++;
        } catch (err: any) {
          result.errors.push(`Entry ${entry.id}: ${err.message}`);
        }
      }

      nextLink = response["@odata.nextLink"] || null;
      page++;
    } while (nextLink && page < maxPages);

    console.log(`[Entra Sign-Ins] Collected ${result.signInsCollected} sign-ins for tenant ${tenant.name}`);
  } catch (err: any) {
    if (err.statusCode === 403 || err.code === "Authorization_RequestDenied") {
      result.errors.push("Requires AuditLog.Read.All permission");
    } else {
      result.errors.push(err.message);
    }
    console.warn(`[Entra Sign-Ins] Collection failed for tenant ${tenantId}:`, err.message);
  }

  return result;
}
