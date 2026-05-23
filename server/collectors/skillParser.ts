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
// typically use (scalars, quoted strings, flow-style lists, block-style lists,
// and nested mappings via 2-space indentation). Not a full YAML parser; on
// anything ambiguous it falls back to a string value rather than throwing.
//
// Implementation note: a frame whose `pendingKey` is set has just seen
// `<key>:` with an empty value. The next line at greater indent decides
// whether that key becomes a block list (`- item`) or a nested object
// (`subkey: subval`). The pending object is created lazily so we don't have
// to convert `{}` to `[]` after the fact.
function parseFrontmatter(raw: string): Record<string, any> {
  const lines = raw.split(/\r?\n/);
  const root: Record<string, any> = {};
  type Frame = { indent: number; container: any; pendingKey: string | null; pendingIndent: number };
  const stack: Frame[] = [
    { indent: -1, container: root, pendingKey: null, pendingIndent: -1 },
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

  function findPendingFrame(currentIndent: number): Frame | null {
    // Walk the stack from the top looking for the first frame with a pending
    // key whose indent is shallower than the current line.
    for (let i = stack.length - 1; i >= 0; i--) {
      const f = stack[i];
      if (f.pendingKey && currentIndent > f.pendingIndent) return f;
    }
    return null;
  }

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith("#")) continue;

    const indent = line.length - line.trimStart().length;
    // Strict `<` so that sibling lines at the same nested indent stay in the
    // same frame. (Using `<=` would pop the frame after its first child.)
    while (stack.length > 1 && indent < stack[stack.length - 1].indent) {
      stack.pop();
    }

    const trimmed = line.trim();

    if (trimmed.startsWith("- ")) {
      const pending = findPendingFrame(indent);
      if (!pending) continue;
      const key = pending.pendingKey!;
      if (!Array.isArray(pending.container[key])) {
        pending.container[key] = [];
      }
      const itemText = trimmed.slice(2).trim();
      const colonIdxItem = itemText.indexOf(": ");
      if (colonIdxItem !== -1) {
        const obj: Record<string, any> = {};
        const k = itemText.slice(0, colonIdxItem).trim();
        const v = itemText.slice(colonIdxItem + 1).trim();
        if (v) obj[k] = coerceScalar(v);
        (pending.container[key] as any[]).push(obj);
      } else {
        (pending.container[key] as any[]).push(coerceScalar(itemText));
      }
      continue;
    }

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;
    const key = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim();

    const pending = findPendingFrame(indent);
    if (pending && stack[stack.length - 1] === pending) {
      // First nested k/v under a pending key — materialize the child mapping,
      // push a frame for it, and clear the parent's pendingKey so siblings at
      // the same indent are routed to the top frame directly.
      const pk = pending.pendingKey!;
      const child: Record<string, any> = (pending.container[pk] && typeof pending.container[pk] === "object" && !Array.isArray(pending.container[pk])) ? pending.container[pk] : {};
      pending.container[pk] = child;
      pending.pendingKey = null;
      pending.pendingIndent = -1;
      const childFrame: Frame = { indent, container: child, pendingKey: null, pendingIndent: -1 };
      stack.push(childFrame);
      if (value === "") {
        childFrame.pendingKey = key;
        childFrame.pendingIndent = indent;
      } else {
        child[key] = coerceScalar(value);
      }
      continue;
    }

    const top = stack[stack.length - 1];
    if (value === "") {
      top.pendingKey = key;
      top.pendingIndent = indent;
    } else {
      top.container[key] = coerceScalar(value);
      top.pendingKey = null;
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
