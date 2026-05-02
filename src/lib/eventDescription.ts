// Parses an event description that may contain a small subset of HTML
// (typically `<br>` and `<a href="...">...</a>` from Google/Outlook calendars)
// into a clean structure we can render with proper UI components.

export type DescriptionNode =
  | { type: "text"; value: string }
  | { type: "link"; url: string; label: string };

export interface ParsedDescription {
  /** Cleaned plain-text + link nodes, line-broken on `\n`. */
  lines: DescriptionNode[][];
  /** Links extracted from the description, de-duplicated by URL. */
  links: { url: string; label: string }[];
}

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

function decodeEntities(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => HTML_ENTITIES[m] ?? m);
}

const URL_RE = /(https?:\/\/[^\s<>"')]+)/gi;

/** Tokenize a plain-text segment, turning bare URLs into link nodes. */
function linkifyText(text: string): DescriptionNode[] {
  if (!text) return [];
  const out: DescriptionNode[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const idx = match.index ?? 0;
    if (idx > last) out.push({ type: "text", value: text.slice(last, idx) });
    const url = match[0];
    out.push({ type: "link", url, label: url });
    last = idx + url.length;
  }
  if (last < text.length) out.push({ type: "text", value: text.slice(last) });
  return out;
}

/**
 * Parse a description, normalizing common HTML markup from calendar providers.
 * - `<br>` → newline
 * - `<a href="X">Y</a>` → link node
 * - any other tag is stripped
 * - bare URLs in text are linkified
 *
 * If `excludeConferenceUrl` is provided, that URL (and a small "Video conference link:"
 * preamble around it) is removed so we don't double-render the Join button.
 */
export function parseDescription(
  raw: string,
  excludeConferenceUrl?: string,
): ParsedDescription {
  let s = raw;

  // Normalize <br> variants to newlines.
  s = s.replace(/<br\s*\/?>/gi, "\n");

  // Walk through extracting <a> tags; everything else gets HTML-stripped.
  const nodes: DescriptionNode[] = [];
  const A_RE = /<a\b[^>]*?href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let cursor = 0;
  for (const m of s.matchAll(A_RE)) {
    const idx = m.index ?? 0;
    if (idx > cursor) {
      const before = stripTags(s.slice(cursor, idx));
      nodes.push(...linkifyText(decodeEntities(before)));
    }
    const url = decodeEntities(m[1]);
    const label = decodeEntities(stripTags(m[2])) || url;
    nodes.push({ type: "link", url, label });
    cursor = idx + m[0].length;
  }
  if (cursor < s.length) {
    const tail = stripTags(s.slice(cursor));
    nodes.push(...linkifyText(decodeEntities(tail)));
  }

  // Optionally drop the "Video conference link: <url>" block so we don't duplicate
  // it next to the Join meeting button.
  let cleaned = nodes;
  if (excludeConferenceUrl) {
    cleaned = removeConferenceBlock(nodes, excludeConferenceUrl);
  }

  // Split into lines on text nodes that contain newlines.
  const lines: DescriptionNode[][] = [[]];
  for (const node of cleaned) {
    if (node.type === "text") {
      const parts = node.value.split("\n");
      parts.forEach((part, i) => {
        if (i > 0) lines.push([]);
        if (part) lines[lines.length - 1].push({ type: "text", value: part });
      });
    } else {
      lines[lines.length - 1].push(node);
    }
  }

  // Trim leading/trailing empty lines and collapse runs of >1 empty line.
  while (lines.length && lines[0].length === 0) lines.shift();
  while (lines.length && lines[lines.length - 1].length === 0) lines.pop();
  const collapsed: DescriptionNode[][] = [];
  for (const line of lines) {
    if (line.length === 0 && collapsed.length && collapsed[collapsed.length - 1].length === 0) continue;
    collapsed.push(line);
  }

  // Collect unique links for any "links" UI sections.
  const seen = new Set<string>();
  const links: { url: string; label: string }[] = [];
  for (const line of collapsed) {
    for (const n of line) {
      if (n.type === "link" && !seen.has(n.url)) {
        seen.add(n.url);
        links.push({ url: n.url, label: n.label });
      }
    }
  }

  return { lines: collapsed, links };
}

function stripTags(s: string): string {
  return s.replace(/<\/?[a-z][^>]*>/gi, "");
}

function removeConferenceBlock(
  nodes: DescriptionNode[],
  url: string,
): DescriptionNode[] {
  const target = normalizeUrl(url);
  const out: DescriptionNode[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.type === "link" && normalizeUrl(n.url) === target) {
      // Strip a preceding text node containing the "Video conference link:" preamble.
      const prev = out[out.length - 1];
      if (prev && prev.type === "text") {
        const cleaned = prev.value.replace(/(?:Video conference link|Join (?:with|on|via)[^:]*|Meeting link|Join meeting)\s*:?\s*\n?\s*$/i, "");
        if (cleaned.trim() === "") out.pop();
        else out[out.length - 1] = { type: "text", value: cleaned.replace(/\s+$/g, "") };
      }
      // Skip immediate trailing whitespace-only text node.
      const next = nodes[i + 1];
      if (next && next.type === "text" && next.value.trim() === "") i += 1;
      continue;
    }
    out.push(n);
  }
  return out;
}

function normalizeUrl(u: string): string {
  try {
    const parsed = new URL(u);
    // Ignore query params like ?authuser=0 and trailing slashes for matching.
    return `${parsed.origin}${parsed.pathname.replace(/\/$/, "")}`.toLowerCase();
  } catch {
    return u.toLowerCase();
  }
}
