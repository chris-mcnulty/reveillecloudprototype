import { getUncachableSharePointClient } from "../sharepoint";
import { storage } from "../storage";

interface ServiceHealthResult {
  incidentsProcessed: number;
  newIncidents: number;
  updatedIncidents: number;
  alertsCreated: number;
  error?: string;
}

export async function collectServiceHealthIncidents(): Promise<ServiceHealthResult> {
  const result: ServiceHealthResult = {
    incidentsProcessed: 0,
    newIncidents: 0,
    updatedIncidents: 0,
    alertsCreated: 0,
  };

  try {
    const client = await getUncachableSharePointClient();

    let issues: any[] = [];
    try {
      const response = await client.api("/admin/serviceAnnouncement/issues")
        .filter("service eq 'SharePoint Online' or service eq 'OneDrive for Business' or service eq 'Microsoft 365 suite'")
        .top(50)
        .orderby("startDateTime desc")
        .get();
      issues = response.value || [];
    } catch (err: any) {
      if (err.statusCode === 403 || err.code === "Authorization_RequestDenied") {
        console.warn("[Service Health] Permission denied - requires ServiceHealth.Read.All");
        result.error = "Permission denied - requires ServiceHealth.Read.All";
        return result;
      }
      throw err;
    }

    const existing = await storage.getServiceHealthIncidents();
    const existingIds = new Set(existing.map(e => e.externalId));

    for (const issue of issues) {
      const isNew = !existingIds.has(issue.id);

      const incident = await storage.upsertServiceHealthIncident({
        externalId: issue.id,
        service: issue.service || "SharePoint Online",
        status: issue.status || "investigating",
        title: issue.title || "Unknown issue",
        classification: issue.classification || "incident",
        startDateTime: issue.startDateTime ? new Date(issue.startDateTime) : null,
        endDateTime: issue.endDateTime ? new Date(issue.endDateTime) : null,
        lastUpdatedAt: issue.lastModifiedDateTime ? new Date(issue.lastModifiedDateTime) : null,
        details: {
          impactDescription: issue.impactDescription,
          featureGroup: issue.featureGroup,
          feature: issue.feature,
          origin: issue.origin,
          isResolved: issue.isResolved,
          posts: issue.posts?.map((p: any) => ({
            createdDateTime: p.createdDateTime,
            description: p.description?.content,
            postType: p.postType,
          })),
        },
      });

      result.incidentsProcessed++;

      if (isNew) {
        result.newIncidents++;

        const severity = issue.classification === "incident" ? "critical" : "warning";
        const tenants = await storage.getTenants();
        const consentedTenants = tenants.filter(t => t.consentStatus === "Connected");

        for (const tenant of consentedTenants) {
          await storage.createAlert({
            tenantId: tenant.id,
            title: `M365 ${issue.classification}: ${issue.title}`,
            severity,
            message: `Service: ${issue.service}\nStatus: ${issue.status}\nImpact: ${issue.impactDescription || "See Microsoft 365 admin center for details"}`,
          });
          result.alertsCreated++;
        }
      } else {
        result.updatedIncidents++;
      }
    }

    return result;
  } catch (err: any) {
    result.error = err.message || String(err);
    console.error("[Service Health] Collection failed:", err.message);
    return result;
  }
}
