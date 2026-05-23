import { getClientCredentialsToken } from "../azureAuth";
import { storage } from "../storage";
import { parseSkillMarkdown, isSkillFilename } from "./skillParser";

export interface OneDriveSkillsResult {
  usersScanned: number;
  skillsDiscovered: number;
  skillsUpdated: number;
  skillsMarkedMissing: number;
  errors: string[];
}

const MAX_FILE_BYTES = 256 * 1024;

const DEFAULT_SCAN_PATHS = [
  "/drive/root:/Skills",
  "/drive/root:/Documents/Skills",
  "/drive/root:/Coworker/Skills",
];

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function graphGet(url: string, token: string): Promise<any> {
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (resp.status === 403 || resp.status === 404) {
    const body = await resp.text().catch(() => "");
    const err: any = new Error(`Graph ${resp.status}: ${body.slice(0, 200)}`);
    err.status = resp.status;
    throw err;
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Graph ${resp.status}: ${body.slice(0, 200)}`);
  }
  return resp.json();
}

async function fetchFileContent(driveId: string, itemId: string, token: string): Promise<string | null> {
  const resp = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/content`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!resp.ok) return null;
  const lenHeader = resp.headers.get("content-length");
  if (lenHeader && parseInt(lenHeader, 10) > MAX_FILE_BYTES) return null;
  const text = await resp.text();
  if (text.length > MAX_FILE_BYTES) return text.slice(0, MAX_FILE_BYTES);
  return text;
}

async function listMembersFromSiteUsers(tenantId: string): Promise<{ id: string; upn: string; displayName: string }[]> {
  const report = await storage.getLatestUsageReport(tenantId, "siteUsers");
  if (!report?.data) return [];
  const reportUsers = (report.data as any).users || [];
  return reportUsers
    .filter((u: any) => {
      if (!u.id) return false;
      const upn = (u.userPrincipalName || u.user_principal_name || "").toLowerCase();
      const userType = (u.userType || u.user_type || "").toLowerCase();
      if (upn.includes("#ext#")) return false;
      if (userType === "guest") return false;
      return true;
    })
    .map((u: any) => ({
      id: u.id,
      upn: u.userPrincipalName || u.user_principal_name || "",
      displayName: u.displayName || u.display_name || "",
    }));
}

async function listUsersFromGraph(token: string): Promise<{ id: string; upn: string; displayName: string }[]> {
  try {
    const data = await graphGet(
      "https://graph.microsoft.com/v1.0/users?$top=200&$select=id,displayName,userPrincipalName,userType&$filter=userType eq 'Member'",
      token,
    );
    return (data.value || []).map((u: any) => ({
      id: u.id,
      upn: u.userPrincipalName || "",
      displayName: u.displayName || "",
    }));
  } catch {
    return [];
  }
}

async function getUserDriveId(userId: string, token: string): Promise<string | null> {
  try {
    const data = await graphGet(
      `https://graph.microsoft.com/v1.0/users/${userId}/drive?$select=id`,
      token,
    );
    return data.id || null;
  } catch {
    return null;
  }
}

async function listSkillFilesUnderPath(
  userId: string,
  pathExpr: string,
  token: string,
): Promise<Array<{ id: string; name: string; size: number; webUrl: string; lastModifiedDateTime: string; lastModifiedBy: string | null; parentPath: string }>> {
  // pathExpr looks like "/drive/root:/Skills". To list children we append :/children
  const url = `https://graph.microsoft.com/v1.0/users/${userId}${pathExpr}:/children?$select=id,name,size,webUrl,lastModifiedDateTime,lastModifiedBy,parentReference,file`;
  let data: any;
  try {
    data = await graphGet(url, token);
  } catch (err: any) {
    if (err.status === 404) return [];
    throw err;
  }
  const out: Array<{ id: string; name: string; size: number; webUrl: string; lastModifiedDateTime: string; lastModifiedBy: string | null; parentPath: string }> = [];
  for (const item of data.value || []) {
    if (!item.file) continue;
    if (!isSkillFilename(item.name)) continue;
    out.push({
      id: item.id,
      name: item.name,
      size: item.size || 0,
      webUrl: item.webUrl || "",
      lastModifiedDateTime: item.lastModifiedDateTime || new Date().toISOString(),
      lastModifiedBy: item.lastModifiedBy?.user?.displayName || item.lastModifiedBy?.user?.email || null,
      parentPath: item.parentReference?.path || pathExpr,
    });
  }
  return out;
}

export async function collectOneDriveSkills(tenantId: string): Promise<OneDriveSkillsResult> {
  const errors: string[] = [];
  const tenant = await storage.getTenant(tenantId);
  if (!tenant) return { usersScanned: 0, skillsDiscovered: 0, skillsUpdated: 0, skillsMarkedMissing: 0, errors: [`Tenant ${tenantId} not found`] };
  if (!tenant.azureTenantId) return { usersScanned: 0, skillsDiscovered: 0, skillsUpdated: 0, skillsMarkedMissing: 0, errors: ["No azureTenantId configured"] };

  let token: string;
  try {
    token = await getClientCredentialsToken(tenant.azureTenantId);
  } catch (err: any) {
    return { usersScanned: 0, skillsDiscovered: 0, skillsUpdated: 0, skillsMarkedMissing: 0, errors: [`Token acquisition failed: ${err.message}`] };
  }

  const sources = await storage.getAgentDiscoverySources(tenantId);
  const onedriveSources = sources.filter(s => s.kind === "onedrive_skills" && s.enabled);

  let scanPaths: string[];
  if (onedriveSources.length > 0) {
    scanPaths = onedriveSources
      .map(s => (s.config as any)?.folderPath as string | undefined)
      .filter((p): p is string => !!p)
      .map(p => (p.startsWith("/drive/root:") ? p : `/drive/root:${p.startsWith("/") ? p : "/" + p}`));
    if (scanPaths.length === 0) scanPaths = DEFAULT_SCAN_PATHS;
  } else {
    scanPaths = DEFAULT_SCAN_PATHS;
  }

  let users = await listMembersFromSiteUsers(tenantId);
  if (users.length === 0) users = await listUsersFromGraph(token);
  if (users.length === 0) {
    return { usersScanned: 0, skillsDiscovered: 0, skillsUpdated: 0, skillsMarkedMissing: 0, errors: ["No users available to scan"] };
  }

  let usersScanned = 0;
  let skillsDiscovered = 0;
  let skillsUpdated = 0;
  const seenSkillIds = new Set<string>();

  for (const user of users) {
    usersScanned++;
    let driveId: string | null = null;

    for (const pathExpr of scanPaths) {
      let files: Awaited<ReturnType<typeof listSkillFilesUnderPath>> = [];
      try {
        files = await listSkillFilesUnderPath(user.id, pathExpr, token);
      } catch (err: any) {
        if (err.status !== 404 && err.status !== 403) {
          errors.push(`user ${user.upn} ${pathExpr}: ${err.message}`);
        }
        continue;
      }
      if (files.length === 0) continue;

      if (!driveId) driveId = await getUserDriveId(user.id, token);
      if (!driveId) continue;

      for (const file of files) {
        if (file.size > MAX_FILE_BYTES) continue;
        let content: string | null = null;
        try {
          content = await fetchFileContent(driveId, file.id, token);
        } catch (err: any) {
          errors.push(`fetch ${file.name}: ${err.message}`);
          continue;
        }
        if (!content) continue;

        const parsed = parseSkillMarkdown(file.name, content);
        const { skill, created } = await storage.upsertSkillDefinitionByDriveItem({
          tenantId,
          source: "onedrive",
          driveId,
          itemId: file.id,
          siteId: null,
          libraryName: null,
          parentPath: file.parentPath,
          ownerUserId: user.id,
          ownerUserPrincipalName: user.upn,
          name: parsed.name,
          displayName: parsed.displayName,
          version: parsed.version,
          description: parsed.description,
          webUrl: file.webUrl,
          contentHash: parsed.contentHash,
          sizeBytes: file.size,
          frontmatter: parsed.frontmatter,
          tags: parsed.tags,
          parseStatus: parsed.parseStatus,
          parseError: parsed.parseError,
          status: "active",
          fileLastModifiedAt: file.lastModifiedDateTime ? new Date(file.lastModifiedDateTime) : null,
          fileLastModifiedBy: file.lastModifiedBy,
        });
        seenSkillIds.add(skill.id);
        if (created) skillsDiscovered++;
        else skillsUpdated++;
      }
    }

    await delay(150);
  }

  const skillsMarkedMissing = await storage.markUnseenSkillsMissing(tenantId, "onedrive", seenSkillIds);
  console.log(`[Skills OD] tenant ${tenantId}: ${usersScanned} users, ${skillsDiscovered} new, ${skillsUpdated} updated, ${skillsMarkedMissing} missing`);
  return { usersScanned, skillsDiscovered, skillsUpdated, skillsMarkedMissing, errors };
}
