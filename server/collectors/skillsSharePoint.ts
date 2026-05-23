import { getClientCredentialsToken } from "../azureAuth";
import { storage } from "../storage";
import { parseSkillMarkdown, isSkillFilename } from "./skillParser";

export interface SharePointSkillsResult {
  sitesScanned: number;
  librariesScanned: number;
  skillsDiscovered: number;
  skillsUpdated: number;
  skillsMarkedMissing: number;
  errors: string[];
}

const AGENT_ASSETS_LIBRARY_NAMES = ["agent assets", "agent-assets", "agentassets", "skills"];
const MAX_FILE_BYTES = 256 * 1024;

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

async function listAgentAssetSites(token: string): Promise<{ id: string; webUrl: string; displayName: string }[]> {
  const sites: { id: string; webUrl: string; displayName: string }[] = [];
  let url: string | null =
    "https://graph.microsoft.com/v1.0/sites?search=*&$select=id,webUrl,displayName&$top=200";
  while (url) {
    let data: any;
    try {
      data = await graphGet(url, token);
    } catch (err: any) {
      if (err.status === 403 || err.status === 404) return sites;
      throw err;
    }
    for (const s of data.value || []) {
      sites.push({ id: s.id, webUrl: s.webUrl || "", displayName: s.displayName || "" });
    }
    url = data["@odata.nextLink"] || null;
    if (url) await delay(150);
  }
  return sites;
}

async function findAgentAssetDrivesForSite(siteId: string, token: string): Promise<{ driveId: string; libraryName: string }[]> {
  let data: any;
  try {
    data = await graphGet(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/drives?$select=id,name,driveType`,
      token,
    );
  } catch {
    return [];
  }
  const matches: { driveId: string; libraryName: string }[] = [];
  for (const d of data.value || []) {
    const lower = (d.name || "").toLowerCase();
    if (AGENT_ASSETS_LIBRARY_NAMES.includes(lower)) {
      matches.push({ driveId: d.id, libraryName: d.name });
    }
  }
  return matches;
}

async function* iterateMarkdownFiles(
  driveId: string,
  token: string,
): AsyncGenerator<{ id: string; name: string; size: number; webUrl: string; lastModifiedDateTime: string; lastModifiedBy: string | null; parentPath: string }> {
  let url: string | null = `https://graph.microsoft.com/v1.0/drives/${driveId}/root/delta?$select=id,name,size,webUrl,lastModifiedDateTime,lastModifiedBy,parentReference,file`;
  while (url) {
    let data: any;
    try {
      data = await graphGet(url, token);
    } catch {
      return;
    }
    for (const item of data.value || []) {
      if (!item.file) continue;
      const name = item.name as string;
      if (!isSkillFilename(name)) continue;
      yield {
        id: item.id,
        name,
        size: item.size || 0,
        webUrl: item.webUrl || "",
        lastModifiedDateTime: item.lastModifiedDateTime || new Date().toISOString(),
        lastModifiedBy: item.lastModifiedBy?.user?.displayName || item.lastModifiedBy?.user?.email || null,
        parentPath: item.parentReference?.path || "",
      };
    }
    url = data["@odata.nextLink"] || data["@odata.deltaLink"] ? data["@odata.nextLink"] : null;
    if (url) await delay(100);
  }
}

export async function collectSharePointSkills(tenantId: string): Promise<SharePointSkillsResult> {
  const errors: string[] = [];
  const tenant = await storage.getTenant(tenantId);
  if (!tenant) return { sitesScanned: 0, librariesScanned: 0, skillsDiscovered: 0, skillsUpdated: 0, skillsMarkedMissing: 0, errors: [`Tenant ${tenantId} not found`] };
  if (!tenant.azureTenantId) return { sitesScanned: 0, librariesScanned: 0, skillsDiscovered: 0, skillsUpdated: 0, skillsMarkedMissing: 0, errors: ["No azureTenantId configured"] };

  let token: string;
  try {
    token = await getClientCredentialsToken(tenant.azureTenantId);
  } catch (err: any) {
    return { sitesScanned: 0, librariesScanned: 0, skillsDiscovered: 0, skillsUpdated: 0, skillsMarkedMissing: 0, errors: [`Token acquisition failed: ${err.message}`] };
  }

  const sources = await storage.getAgentDiscoverySources(tenantId);
  const configured = sources.filter(s => s.kind === "sharepoint_agent_assets" && s.enabled);

  let sites: { id: string; webUrl: string; displayName: string }[] = [];
  if (configured.length > 0) {
    for (const src of configured) {
      const cfg = (src.config as any) || {};
      if (cfg.siteId) {
        sites.push({ id: cfg.siteId, webUrl: cfg.webUrl || "", displayName: src.label });
      }
    }
  } else {
    try {
      sites = await listAgentAssetSites(token);
    } catch (err: any) {
      errors.push(`Failed to list sites: ${err.message}`);
    }
  }

  let sitesScanned = 0;
  let librariesScanned = 0;
  let skillsDiscovered = 0;
  let skillsUpdated = 0;
  const seenItemIds = new Set<string>();

  for (const site of sites) {
    sitesScanned++;
    let drives: { driveId: string; libraryName: string }[] = [];
    try {
      drives = await findAgentAssetDrivesForSite(site.id, token);
    } catch (err: any) {
      errors.push(`site ${site.displayName}: ${err.message}`);
      continue;
    }

    for (const { driveId, libraryName } of drives) {
      librariesScanned++;
      try {
        for await (const file of iterateMarkdownFiles(driveId, token)) {
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
            source: "sharepoint_agent_assets",
            driveId,
            itemId: file.id,
            siteId: site.id,
            libraryName,
            parentPath: file.parentPath,
            ownerUserId: null,
            ownerUserPrincipalName: null,
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
          seenItemIds.add(skill.id);
          if (created) skillsDiscovered++;
          else skillsUpdated++;
        }
      } catch (err: any) {
        errors.push(`library ${libraryName}: ${err.message}`);
      }
      await delay(200);
    }
  }

  const skillsMarkedMissing = await storage.markUnseenSkillsMissing(tenantId, "sharepoint_agent_assets", seenItemIds);

  console.log(`[Skills SP] tenant ${tenantId}: ${sitesScanned} sites, ${librariesScanned} libraries, ${skillsDiscovered} new, ${skillsUpdated} updated, ${skillsMarkedMissing} missing`);
  return { sitesScanned, librariesScanned, skillsDiscovered, skillsUpdated, skillsMarkedMissing, errors };
}
