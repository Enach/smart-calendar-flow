/**
 * PAC-91 (contract section 3.1): the booking page is the one Paceday page any
 * site may frame (owner decision PAC-81 Q-O2). Links that leave it for another
 * Paceday page must leave the frame too, and no other page renders framed.
 */

/**
 * The public booking page's route, the one route any site may frame (owner
 * PAC-81 Q-O2). App.tsx routes it and FrameGuard matches it: one definition.
 */
export const BOOKING_ROUTE_PATH = "/book/:slug";

/**
 * Target of every link that leaves a possibly framed page for another Paceday
 * page (spec D-2). Owner question OQ-1 is open: "_top" replaces the embedding
 * page (the default); answering "new tab" changes this one value to "_blank"
 * (browsers imply noopener for it) and nothing else.
 */
export const TOP_LEVEL_LINK_TARGET = "_top";

/**
 * True when this window is not the top-level browsing context. It compares
 * window identities only and never reads anything from the embedder, so it
 * cannot throw across origins; should a browser throw anyway, it answers
 * "framed" (fail closed).
 */
export function isFramed(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}
