import { getClientCredentialsToken } from "../azureAuth";
import { storage } from "../storage";

interface CollectionResult {
  usersProcessed: number;
  interactionsCollected: number;
  errors: string[];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchUsersFromGraph(token: string): Promise<{ id: string; displayName: string; userPrincipalName: string }[]> {
  const url = "https://graph.microsoft.com/v1.0/users?$top=200&$select=id,displayName,userPrincipalName";
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Failed to fetch users: ${resp.status} ${errText.slice(0, 200)}`);
  }

  const data = await resp.json();
  return (data.value || []).map((u: any) => ({
    id: u.id,
    displayName: u.displayName || "",
    userPrincipalName: u.userPrincipalName || "",
  }));
}

export async function collectCopilotInteractions(tenantId: string): Promise<CollectionResult> {
  const errors: string[] = [];
  let usersProcessed = 0;
  let interactionsCollected = 0;

  const tenant = await storage.getTenant(tenantId);
  if (!tenant) {
    return { usersProcessed: 0, interactionsCollected: 0, errors: [`Tenant ${tenantId} not found`] };
  }

  if (!tenant.azureTenantId) {
    return { usersProcessed: 0, interactionsCollected: 0, errors: ["No azureTenantId configured for tenant"] };
  }

  let token: string;
  try {
    token = await getClientCredentialsToken(tenant.azureTenantId);
  } catch (err: any) {
    return { usersProcessed: 0, interactionsCollected: 0, errors: [`Token acquisition failed: ${err.message}`] };
  }

  let users: { id: string; displayName: string; userPrincipalName: string }[] = [];

  const siteUsersReport = await storage.getLatestUsageReport(tenantId, "siteUsers");
  if (siteUsersReport && siteUsersReport.data && (siteUsersReport.data as any).users) {
    const reportUsers = (siteUsersReport.data as any).users;
    users = reportUsers
      .filter((u: any) => u.id)
      .map((u: any) => ({
        id: u.id,
        displayName: u.displayName || u.display_name || "",
        userPrincipalName: u.userPrincipalName || u.user_principal_name || "",
      }));
    console.log(`[Copilot Interactions] Found ${users.length} users from siteUsers report`);
  }

  if (users.length === 0) {
    try {
      users = await fetchUsersFromGraph(token);
      console.log(`[Copilot Interactions] Fetched ${users.length} users from Graph API`);
    } catch (err: any) {
      return { usersProcessed: 0, interactionsCollected: 0, errors: [`Failed to get user list: ${err.message}`] };
    }
  }

  if (users.length === 0) {
    return { usersProcessed: 0, interactionsCollected: 0, errors: ["No users found to process"] };
  }

  const lastDate = await storage.getLatestCopilotInteractionDate(tenantId);
  const filterParam = lastDate
    ? `&$filter=createdDateTime gt ${lastDate.toISOString()}`
    : "";

  for (const user of users) {
    try {
      let url: string | null = `https://graph.microsoft.com/beta/copilot/users/${user.id}/interactionHistory/getAllEnterpriseInteractions?$top=100${filterParam}`;

      while (url) {
        const resp: Response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (resp.status === 403 || resp.status === 404) {
          console.log(`[Copilot Interactions] User ${user.userPrincipalName} - ${resp.status} (skipping)`);
          break;
        }

        if (!resp.ok) {
          const errText = await resp.text().catch(() => "");
          errors.push(`User ${user.userPrincipalName}: HTTP ${resp.status} - ${errText.slice(0, 200)}`);
          break;
        }

        const data: any = await resp.json();
        const interactions = data.value || [];

        for (const x of interactions) {
          const interactionId = x.id;
          if (!interactionId) continue;

          try {
            await storage.createCopilotInteraction({
              tenantId,
              interactionId,
              requestId: x.requestId || null,
              sessionId: x.sessionId || null,
              interactionType: x.interactionType || "unknown",
              appClass: x.appClass || null,
              userId: user.userPrincipalName || user.id,
              userName: user.displayName || null,
              bodyContent: x.body?.content || null,
              bodyContentType: x.body?.contentType || null,
              contexts: x.contexts || null,
              attachments: x.attachments || null,
              links: x.links || null,
              mentions: x.mentions || null,
              rawData: x,
              createdAt: x.createdDateTime ? new Date(x.createdDateTime) : new Date(),
            });
            interactionsCollected++;
          } catch (err: any) {
            if (err.message?.includes("duplicate") || err.message?.includes("unique")) {
              continue;
            }
            errors.push(`Failed to save interaction ${interactionId}: ${err.message}`);
          }
        }

        url = data["@odata.nextLink"] || null;
        if (url) {
          await delay(100);
        }
      }

      usersProcessed++;

      if (usersProcessed < users.length) {
        await delay(500);
      }
    } catch (err: any) {
      errors.push(`User ${user.userPrincipalName}: ${err.message}`);
      usersProcessed++;
    }
  }

  console.log(`[Copilot Interactions] Completed: ${usersProcessed} users processed, ${interactionsCollected} interactions collected, ${errors.length} errors`);

  return { usersProcessed, interactionsCollected, errors };
}
