// Future-proof candidate paths for a Copilot model identifier in Graph beta
// interactionHistory. Graph does not currently expose this; populate any new
// path here and run the backfill to apply it to historical rows.
//
// When Microsoft confirms an official path, ADD (don't replace) it here so
// previously-collected rows that used a now-deprecated preview path still
// resolve. The scheduled backfill (every 6h, see scheduler.ts) and the
// POST /api/admin/copilot-models/backfill endpoint will pick up new paths
// without code changes for new tenants beyond this list.
const MODEL_NAME_PATHS: ((raw: any) => string | null)[] = [
  (r) => r?.modelInfo?.name ?? null,
  (r) => r?.modelInfo?.modelName ?? null,
  (r) => r?.modelInfo?.id ?? null,
  (r) => r?.metadata?.modelName ?? null,
  (r) => r?.metadata?.modelId ?? null,
  (r) => r?.metadata?.model ?? null,
  (r) => r?.attribution?.modelName ?? null,
  (r) => r?.attribution?.model?.name ?? null,
  (r) => r?.body?.modelInfo?.name ?? null,
  (r) => r?.aiModel?.name ?? null,
  (r) => r?.aiModel?.id ?? null,
  (r) => r?.model?.name ?? null,
  (r) => r?.model?.id ?? null,
  (r) => (typeof r?.model === "string" ? r.model : null),
  (r) => (typeof r?.modelName === "string" ? r.modelName : null),
];

const SURFACE_FROM_APP_DISPLAY_NAME: Record<string, string> = {
  "Microsoft 365 Chat": "M365 Chat",
  "Microsoft Copilot": "Web Chat",
  "Copilot in Word": "Word",
  "Copilot in Excel": "Excel",
  "Copilot in PowerPoint": "PowerPoint",
  "Copilot in Outlook": "Outlook",
  "Copilot in Teams": "Teams",
  "Copilot in OneNote": "OneNote",
  "Copilot in Forms": "Forms",
  "Copilot in Loop": "Loop",
  "Copilot in Planner": "Planner",
  "Copilot in SharePoint": "SharePoint",
  "Copilot in Stream": "Stream",
  "Copilot in Whiteboard": "Whiteboard",
  "Copilot in Office": "Office",
  "Copilot in M365AdminCenter": "M365 Admin Center",
  "Copilot in OfficeCopilotSearchAnswer": "Search",
  "Copilot in OfficeCopilotNotebook": "Notebook",
  "Copilot in BizChat": "M365 Chat",
  "Copilot in WebChat": "Web Chat",
  "Temporary Chat": "Temp Chat",
};

const APP_CLASS_NORMALIZED: Record<string, string> = {
  "IPM.SkypeTeams.Message.Copilot.BizChat": "M365 Chat",
  "IPM.SkypeTeams.Message.Copilot.WebChat": "Web Chat",
};

const APP_CLASS_SURFACE_FALLBACK = (appClass: string | null | undefined): string | null => {
  if (!appClass) return null;
  if (APP_CLASS_NORMALIZED[appClass]) return APP_CLASS_NORMALIZED[appClass];
  const cleaned = appClass.replace(/^IPM\.SkypeTeams\.Message\.Copilot\./i, "").trim();
  if (!cleaned || cleaned === appClass) return null;
  return cleaned;
};

export function extractModelName(raw: any): string | null {
  if (!raw || typeof raw !== "object") return null;
  for (const accessor of MODEL_NAME_PATHS) {
    const v = accessor(raw);
    if (v && typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export function extractAttributedSurface(raw: any): string | null {
  if (!raw || typeof raw !== "object") return null;
  const appDisplayName: string | undefined = raw?.from?.application?.displayName;
  if (appDisplayName && SURFACE_FROM_APP_DISPLAY_NAME[appDisplayName]) {
    return SURFACE_FROM_APP_DISPLAY_NAME[appDisplayName];
  }
  if (appDisplayName && appDisplayName.startsWith("Copilot in ")) {
    return appDisplayName.replace(/^Copilot in /, "");
  }
  const fromAppClass = APP_CLASS_SURFACE_FALLBACK(raw?.appClass);
  if (fromAppClass) return fromAppClass;
  const conv = raw?.conversationType;
  if (conv === "bizchat") return "M365 Chat";
  if (conv === "webchat") return "Web Chat";
  return null;
}

export function extractCapabilities(raw: any): string[] {
  if (!raw || typeof raw !== "object") return [];
  const out = new Set<string>();

  const contexts = Array.isArray(raw.contexts) ? raw.contexts : [];
  if (contexts.length > 0) {
    for (const ctx of contexts) {
      const t = (ctx?.contextType || "").toString().toLowerCase();
      if (t.includes("file")) out.add("file-context");
      else if (t.includes("page") || t.includes("web")) out.add("page-ref");
      else if (t.includes("message") || t.includes("conversation")) out.add("conversation-ref");
      else if (t.includes("meeting") || t.includes("event")) out.add("meeting-ref");
      else if (t) out.add("context");
    }
  }

  const attachments = Array.isArray(raw.attachments) ? raw.attachments : [];
  if (attachments.length > 0) {
    let hasFileRef = false;
    let hasCard = false;
    for (const att of attachments) {
      const ct = (att?.contentType || "").toString().toLowerCase();
      if (ct === "reference" || ct.includes("file")) hasFileRef = true;
      else if (ct.includes("adaptivecard") || ct.includes("card")) hasCard = true;
    }
    if (hasFileRef) out.add("file-ref");
    if (hasCard) out.add("adaptive-card");
  }

  const links = Array.isArray(raw.links) ? raw.links : [];
  if (links.length > 0) out.add("link-ref");

  const mentions = Array.isArray(raw.mentions) ? raw.mentions : [];
  if (mentions.length > 0) out.add("mention");

  const appClassLower = (raw.appClass || "").toString().toLowerCase();
  if (appClassLower.includes("search")) out.add("search");
  if (appClassLower.includes("notebook")) out.add("notebook");

  const bodyContent: string = raw?.body?.content || "";
  if (bodyContent) {
    const lc = bodyContent.toLowerCase();
    if (/\bdraft(ed|ing)?\b/.test(lc) || lc.includes("here is a draft")) out.add("drafting");
    if (lc.includes("summary") || lc.includes("summarize") || lc.includes("summarise")) out.add("summarize");
    if (lc.includes("<table")) out.add("table-gen");
    if (lc.includes("![") || lc.includes("<img ")) out.add("image-gen");
  }

  return Array.from(out).sort();
}

export interface CopilotEnrichment {
  modelName: string | null;
  attributedSurface: string | null;
  capabilities: string[] | null;
}

export function extractCopilotEnrichment(raw: any): CopilotEnrichment {
  const caps = extractCapabilities(raw);
  return {
    modelName: extractModelName(raw),
    attributedSurface: extractAttributedSurface(raw),
    capabilities: caps.length > 0 ? caps : null,
  };
}

export function modelLabelFromRow(row: {
  modelName: string | null;
  attributedSurface: string | null;
}): string {
  return row.modelName || row.attributedSurface || "Unknown";
}
