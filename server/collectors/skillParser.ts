import crypto from "crypto";

export interface ParsedSkill {
  name: string;
  displayName: string | null;
  version: string | null;
  description: string | null;
  tags: string[] | null;
  frontmatter: Record<string, any> | null;
  contentHash: string;
  parseStatus: "ok" | "invalid" | "no_frontmatter";
  parseError: string | null;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

// Minimal YAML-ish frontmatter parser. Handles the shape that skill.md files
// typically use (scalars, quoted strings, flow-style and block-style lists,
// nested mappings via 2-space indentation). Not a full YAML parser; on
// anything ambiguous it falls back to a string value rather than throwing.
function parseFrontmatter(raw: string): Record<string, any> {
  const lines = raw.split(/\r?\n/);
  const root: Record<string, any> = {};
  const stack: Array<{ indent: number; container: any; keyForListAppend: string | null }> = [
    { indent: -1, container: root, keyForListAppend: null },
  ];

  function unquote(s: string): string {
    const t = s.trim();
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
      return t.slice(1, -1);
    }
    return t;
  }

  function coerceScalar(s: string): any {
    const t = s.trim();
    if (t === "" || t === "~" || t.toLowerCase() === "null") return null;
    if (t.toLowerCase() === "true") return true;
    if (t.toLowerCase() === "false") return false;
    if (/^-?\d+$/.test(t)) {
      const n = Number(t);
      if (Number.isSafeInteger(n)) return n;
    }
    if (/^-?\d+\.\d+$/.test(t)) {
      const n = Number(t);
      if (Number.isFinite(n)) return n;
    }
    if (t.startsWith("[") && t.endsWith("]")) {
      const inner = t.slice(1, -1).trim();
      if (inner === "") return [];
      return inner.split(",").map(p => coerceScalar(unquote(p.trim())));
    }
    return unquote(t);
  }

  function topContainer(): any {
    return stack[stack.length - 1].container;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) continue;

    const indent = line.length - line.trimStart().length;
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const trimmed = line.trim();

    if (trimmed.startsWith("- ")) {
      const parent = stack[stack.length - 1];
      const key = parent.keyForListAppend;
      if (!key) continue;
      const container = parent.container;
      if (!Array.isArray(container[key])) container[key] = [];
      const itemText = trimmed.slice(2).trim();
      if (itemText.includes(": ")) {
        const obj: Record<string, any> = {};
        container[key].push(obj);
        const [k, ...rest] = itemText.split(":");
        const v = rest.join(":").trim();
        if (v) obj[k.trim()] = coerceScalar(v);
      } else {
        container[key].push(coerceScalar(itemText));
      }
      continue;
    }

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;
    const key = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim();
    const container = topContainer();

    if (value === "") {
      // Block-style child: could be a list (next line starts with `- `) or a
      // mapping. We don't know yet, so push a frame and let the next line
      // decide. Default to mapping; the list-handler creates the array on
      // demand.
      const child: Record<string, any> = {};
      container[key] = child;
      stack[stack.length - 1].keyForListAppend = key;
      stack.push({ indent, container: child, keyForListAppend: null });
    } else {
      container[key] = coerceScalar(value);
      stack[stack.length - 1].keyForListAppend = null;
    }
  }

  return root;
}

function asString(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

function asStringArray(v: unknown): string[] | null {
  if (!v) return null;
  if (Array.isArray(v)) {
    const arr = v.map(asString).filter((x): x is string => !!x);
    return arr.length ? arr : null;
  }
  if (typeof v === "string") {
    const parts = v.split(",").map(s => s.trim()).filter(Boolean);
    return parts.length ? parts : null;
  }
  return null;
}

export function parseSkillMarkdown(filename: string, content: string): ParsedSkill {
  const contentHash = crypto.createHash("sha256").update(content).digest("hex");
  const fallbackName = filename.replace(/\.(skill\.)?md$/i, "").replace(/\.skill\.ya?ml$/i, "");

  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    return {
      name: fallbackName,
      displayName: null,
      version: null,
      description: null,
      tags: null,
      frontmatter: null,
      contentHash,
      parseStatus: "no_frontmatter",
      parseError: null,
    };
  }

  let fm: Record<string, any>;
  try {
    fm = parseFrontmatter(match[1]);
  } catch (err: any) {
    return {
      name: fallbackName,
      displayName: null,
      version: null,
      description: null,
      tags: null,
      frontmatter: null,
      contentHash,
      parseStatus: "invalid",
      parseError: err?.message?.slice(0, 500) || "Failed to parse frontmatter",
    };
  }

  const name = asString(fm.name) || asString(fm.id) || fallbackName;
  const displayName = asString(fm.display_name) || asString(fm.displayName) || asString(fm.title);
  const version = asString(fm.version) || asString(fm.v);
  const description = asString(fm.description) || asString(fm.summary);
  const tags = asStringArray(fm.tags) || asStringArray(fm.categories);

  return {
    name,
    displayName,
    version,
    description,
    tags,
    frontmatter: fm,
    contentHash,
    parseStatus: "ok",
    parseError: null,
  };
}

export function isSkillFilename(name: string): boolean {
  return /\.skill\.md$/i.test(name) || /^skill\.md$/i.test(name) || /\.skill\.ya?ml$/i.test(name);
}
