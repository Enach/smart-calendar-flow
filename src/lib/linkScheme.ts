// The scheme allowlist for every href we build out of data we did not write.
//
// A calendar event's description and conference block come from whoever sent
// the invite: provider → backend → our parse → an `<a href>` in the event
// panel. A `javascript:` href there runs on Paceday's own origin, where the
// API client already sends `credentials: "include"`, so the scheme is checked
// where the link node is built and never at render time (read-only security
// audit, 2026-11-22).

/**
 * What a link node may point at. `webcal:` is here because calendar invites
 * legitimately carry subscription links; everything else a provider might
 * send (`javascript:`, `data:`, `vbscript:`, `file:`, app deep links) is not
 * something we turn into a clickable link.
 */
export const ALLOWED_LINK_SCHEMES: readonly string[] = [
  "http:",
  "https:",
  "mailto:",
  "tel:",
  "webcal:",
];

// URL parsing throws two kinds of padding away before it looks at the scheme:
// every tab/newline anywhere in the input, and leading or trailing C0-or-space.
// Stripping exactly those and nothing else keeps what we check
// character-for-character identical to what the browser later navigates, so
// `java\nscript:alert(1)` and `  JavaScript:alert(1)` cannot read as one thing
// here and another in the address bar.
const URL_IGNORED_INSIDE = /[\t\n\r]/g;

function trimUrlPadding(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value.charCodeAt(start) <= 0x20) start += 1;
  while (end > start && value.charCodeAt(end - 1) <= 0x20) end -= 1;
  return value.slice(start, end);
}

/**
 * The href to use for `value`, or `null` when it is not a link we are willing
 * to make clickable.
 *
 * Parsed with `new URL()` and no base, so the scheme must be spelled out: a
 * relative (`/settings`) or protocol-relative (`//evil.example`) href fails to
 * parse and is refused. That is deliberate — invite content has no business
 * resolving against the page's own origin, and with a base `//evil.example`
 * would silently become `https://evil.example`.
 */
export function safeLinkUrl(value: string): string | null {
  const cleaned = trimUrlPadding(value.replace(URL_IGNORED_INSIDE, ""));
  if (!cleaned) return null;
  let parsed: URL;
  try {
    parsed = new URL(cleaned);
  } catch {
    return null;
  }
  // `URL` lower-cases the scheme, so `JavaScript:` arrives here as
  // `javascript:` and case variants need no handling of their own.
  return ALLOWED_LINK_SCHEMES.includes(parsed.protocol) ? cleaned : null;
}
