import type { ApiPort, CalendarEventDTO, CompressionApplyResponse } from "./contract";
import {
  AIStatus as AIStatusSchema,
  CalendarDisconnectUnsupported,
  ConnectStartResponse as ConnectStartResponseSchema,
  OrganizationAIConfiguration as OrganizationAIConfigurationSchema,
  OrganizationAIConsentConflict as OrganizationAIConsentConflictSchema,
  OrganizationAIWriteFreshLoginRequired,
  OrganizationAIWriteStepupRequired,
  ProviderDisconnectResult as ProviderDisconnectResultSchema,
  RequestBudgetExpiredError,
  SettingsUpdate,
  SsoStepupOptions as SsoStepupOptionsSchema,
  SsoWriteMembershipRequired,
  SsoWriteStepupRequired,
} from "./generated/schemas";
import type { SsoStepupProvider, SsoStepupPurpose, SsoStepupScopes } from "./generated/schemas";
import { apiUrl } from "@/lib/api";
import { demoOrReal } from "./demoGate";

import type {
  AuditEntry,
  AuthStatus,
  Attendee,
  CalendarEvent,
  CalendarProvider,
  CompressionApplyProposal,
  CompressionResult,
  ConferenceLink,
  ConferenceProvider,
  ConferenceProviderStatus,
  CoverageProvider,
  CoverageStatus,
  DayInterval,
  LunchBreaks,
  WeekdayKey,
  WorkingHours,
  WorkingHoursMode,

  FocusBlock,
  FocusRunBlock,
  IntegrationAvailability,
  FocusRunResult,
  FreeBusyResponse,
  LLMTestResult,
  MoveProposal,
  ParseResult,
  ParticipantCoverage,
  PersonalCalendar,
  PersonalCalendarType,
  ProviderDisconnectResult,
  Room,
  OrganizationAIConfiguration,
  OrganizationAIConfigurationUpdate,
  AIStatus,
  Settings,
  SuggestedSlot,
} from "./types";
import { isKeyProvider, runsOnOrganizationAIInsteadOfOwnChoice } from "@/lib/aiProviders";

/**
 * The apply request's proposal (snake_case, three fields) for a proposal the
 * preview returned (camelCase). Only the event and its proposed times are
 * sent: the server reads nothing else (contract applyCompress).
 */
function toApplyProposal(p: MoveProposal): CompressionApplyProposal {
  return { event_id: p.eventId, proposed_start: p.proposedStart, proposed_end: p.proposedEnd };
}

// ---------- Transport: bounds, error taxonomy, requestApi (PAC-83) ----------

const API_BASE =
  (window as Window & { __API_BASE_URL__?: string }).__API_BASE_URL__ ??
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "/api";

/**
 * PAC-83 (contract §2.5, §3.1). The server bounds every request at 90 s and
 * answers its own 503; its write backstop cuts at 120 s; nginx answers 502/504
 * at 130 s. The client waits longer than all of them, so whatever the stack
 * says reaches the user. Only past this bound is the connection called lost.
 * Never shortened per operation.
 */
export const CLIENT_REQUEST_BOUND_MS = 135_000;
/** The background health probe and the pre-sign-in check: not a user action. */
export const HEALTH_PROBE_BOUND_MS = 10_000;
/** After this long a user-started call says it is still working (spec D-3). */
export const STILL_WORKING_AFTER_MS = 8_000;

/**
 * The backend answered with a status >= 400 and a JSON body (or a 4xx
 * without one). Never replaced with invented data — the UI must surface it.
 */
export class ApiHttpError extends Error {
  readonly status: number;
  readonly data: unknown;
  constructor(status: number, data?: unknown, message?: string) {
    super(message ?? `HTTP ${status}`);
    this.name = "ApiHttpError";
    this.status = status;
    this.data = data;
  }
}

/**
 * A 5xx whose body is not JSON: nginx's 502/504 page, an operator proxy's
 * 502/503/504/52x page, the dev proxy's text/plain 500 (contract §2.3). It
 * proves nothing about what the server did.
 */
export class ApiGatewayError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`Gateway error (HTTP ${status})`);
    this.name = "ApiGatewayError";
    this.status = status;
  }
}

export type UnreachableReason = "network" | "timeout" | "non-json";

/**
 * No usable answer: the request failed at the network level, nothing came
 * back within CLIENT_REQUEST_BOUND_MS, or a 2xx was not JSON. It switches
 * nothing and is never answered with invented data (PAC-83).
 */
export class ApiUnreachableError extends Error {
  readonly reason: UnreachableReason;
  readonly status?: number;
  constructor(reason: UnreachableReason = "network", status?: number) {
    super(reason === "timeout" ? "No answer from Paceday in time" : reason === "non-json" ? "Unexpected answer from Paceday" : "Can't reach Paceday");
    this.name = "ApiUnreachableError";
    this.reason = reason;
    this.status = status;
  }
}

export function isApiHttpError(e: unknown): e is ApiHttpError {
  return e instanceof ApiHttpError;
}
export function isApiUnreachableError(e: unknown): e is ApiUnreachableError {
  return e instanceof ApiUnreachableError;
}
export function isGatewayError(e: unknown): e is ApiGatewayError {
  return e instanceof ApiGatewayError;
}
/** The answer is lost: nothing (or nothing usable) came back. */
export function isAnswerLost(e: unknown): boolean {
  return isApiUnreachableError(e) || isGatewayError(e);
}
/** The server's own budget answer: 503 AND a RequestBudgetExpiredError body (contract §2.1). Never status alone. */
export function isBudgetExpired(e: unknown): boolean {
  return isApiHttpError(e) && e.status === 503 && RequestBudgetExpiredError.safeParse(e.data).success;
}
/** 413, recognised by status alone (contract §2.2). */
export function isRequestTooLarge(e: unknown): boolean {
  return isApiHttpError(e) && e.status === 413;
}

/** What both calendar-disconnect surfaces say when disconnect is not offered (PAC-35). */
export const CALENDAR_DISCONNECT_UNAVAILABLE_MESSAGE = "Disconnecting this kind of calendar is not available yet.";

/**
 * Whether the app offers a disconnect for a calendar the server's status
 * reports as `provider`. The server disconnects only Google calendars, and its
 * status answers "google" for a blank or unknown provider, so only Outlook
 * and WebCal are excluded (PAC-35, spec D-6/D-8).
 */
export function canDisconnectCalendar(provider: string | undefined): boolean {
  return provider !== "outlook" && provider !== "webcal";
}

/**
 * The server's 409 CalendarDisconnectUnsupported: the caller's calendar is
 * not Google, nothing was deleted. A failure, never a success (PAC-35 D-8).
 */
export function isCalendarDisconnectUnsupported(e: unknown): boolean {
  return isApiHttpError(e) && e.status === 409 && CalendarDisconnectUnsupported.safeParse(e.data).success;
}

/**
 * The request was aborted because the page is being left (a full navigation
 * or a closed tab): the browser cancels in-flight requests and delivers the
 * rejection to the page being left, after "pagehide". That says nothing about
 * the backend: nothing is shown, nothing is recorded (NEW-e2e-pac55-ac10,
 * PAC-83 AC-20).
 */
export class ApiRequestCancelledError extends Error {
  constructor(message = "Request cancelled: the page is being left") {
    super(message);
    this.name = "ApiRequestCancelledError";
  }
}

let pageLeaving = false;
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    pageLeaving = true;
  });
  // Restored from the back/forward cache: the page is live again.
  window.addEventListener("pageshow", () => {
    pageLeaving = false;
  });
}

// ---------- PAC-50: the optional SSO administrator step-up ----------

/**
 * What a refused SSO configuration write (403 SsoWriteStepupRequired) or the
 * Settings entry point (getSsoStepupOptions) says about the optional
 * administrator step-up (PAC-50 AC-22, AC-25). The client never navigates on
 * its own: a screen explains `stepupScopes` and `withoutStepup`, lets the user
 * decline, and only on "go ahead", with a provider chosen, navigates to
 * `ssoStepupStartUrl(...)`.
 */
export interface SsoStepupOffer {
  /** `stepup_url` resolved against the API base's origin, never the page's (spec §9 D-6). */
  stepupUrl: string;
  /** As received: a key only for each provider configured on the deployment. */
  stepupScopes: SsoStepupScopes;
  /** As received, unknown codes included (an open list, contract revision 6). */
  withoutStepup: string[];
  /** The keys of `stepupScopes`, in a fixed order; empty means no step-up can be started. */
  providers: SsoStepupProvider[];
}

/** The step-up-required outcome of a refused SSO configuration write (AC-22). */
export interface SsoStepupRequired extends SsoStepupOffer {
  kind: "sso_stepup_required";
}

const STEPUP_PROVIDERS: SsoStepupProvider[] = ["google", "microsoft"];

function toOffer(raw: { stepup_url: string; stepup_scopes: SsoStepupScopes; without_stepup: string[] }): SsoStepupOffer {
  return {
    stepupUrl: apiUrl(raw.stepup_url),
    stepupScopes: raw.stepup_scopes,
    withoutStepup: raw.without_stepup,
    providers: STEPUP_PROVIDERS.filter((p) => raw.stepup_scopes[p] !== undefined),
  };
}

/**
 * The step-up-required outcome carried by an API failure, or null. Only a 403
 * whose body is SsoWriteStepupRequired (it carries `stepup_url`) qualifies; any
 * other 403 is rendered as before by apiErrorMessage (AC-22).
 */
export function ssoStepupRequired(e: unknown): SsoStepupRequired | null {
  if (!isApiHttpError(e) || e.status !== 403) return null;
  const parsed = SsoWriteStepupRequired.safeParse(e.data);
  if (!parsed.success) return null;
  return { kind: "sso_stepup_required", ...toOffer(parsed.data) };
}

/**
 * Where the browser goes once the user has chosen to go ahead with `provider`.
 * PAC-73 Part 2: a step-up for another write than SSO names its purpose; an
 * SSO step-up sends none, exactly as under PAC-50.
 */
export function ssoStepupStartUrl(offer: SsoStepupOffer, provider: SsoStepupProvider, purpose?: SsoStepupPurpose): string {
  const base = `${offer.stepupUrl}?provider=${encodeURIComponent(provider)}`;
  return purpose && purpose !== "sso_write" ? `${base}&purpose=${encodeURIComponent(purpose)}` : base;
}

/**
 * GET /api/admin/sso/stepup/options (getSsoStepupOptions, PAC-50 contract
 * revision 8): the step-up offer without making an SSO write. Read-only on
 * the server. A 403 (no organisation) is an ApiHttpError: the caller offers no
 * entry point. There is no preview fallback: in preview the entry point is not
 * offered.
 */
export async function fetchSsoStepupOptions(purpose?: SsoStepupPurpose): Promise<SsoStepupOffer> {
  const query = purpose && purpose !== "sso_write" ? { purpose } : undefined;
  return toOffer(SsoStepupOptionsSchema.parse(await requestApi<unknown>("GET", "/admin/sso/stepup/options", undefined, query)));
}

// ---------- PAC-73 Part 2: the organisation's AI configuration ----------

/** The step-up purpose of an organisation-AI change (contract SsoStepupPurpose). */
export const ORG_AI_STEPUP_PURPOSE: SsoStepupPurpose = "llm_org_key_write";

/**
 * GET /api/organization/ai (getOrganizationAI): every member reads the same
 * configuration, never the key. A 403 (no organisation) is an ApiHttpError.
 * No preview fallback: in preview the section is not shown.
 */
export async function fetchOrganizationAI(): Promise<OrganizationAIConfiguration> {
  return OrganizationAIConfigurationSchema.parse(await requestApi<unknown>("GET", "/organization/ai"));
}

/** What a patchOrganizationAI answered, other than a body error (an ApiHttpError). */
export type OrganizationAIChangeResult =
  | { kind: "saved"; configuration: OrganizationAIConfiguration }
  /** Another administrator changed it first: nothing stored, the proof is kept. */
  | { kind: "conflict"; configuration: OrganizationAIConfiguration }
  /** No live proof for this purpose: the step-up for it, as offered. */
  | { kind: "stepup_required"; offer: SsoStepupOffer }
  /** A break-glass address whose session is stale or already made a change. */
  | { kind: "fresh_login_required" }
  /** No organisation. */
  | { kind: "no_organization" };

/**
 * PATCH /api/organization/ai (patchOrganizationAI). The body names the
 * version the administrator was shown. 200, 403 and 409 are outcomes; a 400
 * (the change itself is refused) or a 5xx is thrown as an ApiHttpError.
 */
export async function patchOrganizationAI(body: OrganizationAIConfigurationUpdate): Promise<OrganizationAIChangeResult> {
  try {
    const raw = await requestApi<unknown>("PATCH", "/organization/ai", body);
    return { kind: "saved", configuration: OrganizationAIConfigurationSchema.parse(raw) };
  } catch (e) {
    if (isApiHttpError(e) && e.status === 409) {
      const c = OrganizationAIConsentConflictSchema.safeParse(e.data);
      if (c.success) return { kind: "conflict", configuration: c.data.organization };
    }
    if (isApiHttpError(e) && e.status === 403) {
      const stepup = OrganizationAIWriteStepupRequired.safeParse(e.data);
      if (stepup.success) return { kind: "stepup_required", offer: toOffer(stepup.data) };
      if (OrganizationAIWriteFreshLoginRequired.safeParse(e.data).success) return { kind: "fresh_login_required" };
      if (SsoWriteMembershipRequired.safeParse(e.data).success) return { kind: "no_organization" };
    }
    throw e;
  }
}

/**
 * The settings write that chooses "Use my organisation's AI" (patchSettings
 * `llmProvider: organization`). It records no confirmation (P2-AC-38): it is
 * sent only after confirmOrganizationAI has recorded the user's confirmation.
 */
export async function chooseOrganizationAIChoice(): Promise<Settings> {
  return normalizeSettings(await requestApi<unknown>("PATCH", "/settings", { llmProvider: "organization" }));
}

/** What confirmOrganizationAI answered. */
export type OrganizationAIConsentResult =
  | { kind: "confirmed"; status: AIStatus }
  /** Nothing recorded: the configuration changed since it was shown, or is not complete. */
  | { kind: "conflict"; reason: "configuration_changed" | "organization_not_configured"; configuration: OrganizationAIConfiguration };

/**
 * POST /api/organization/ai/consent (confirmOrganizationAI): the user confirms
 * the version they were shown (owner O-13). Called only on the user's
 * explicit confirmation; the only way a confirmation is recorded.
 */
export async function confirmOrganizationAI(configurationVersion: number): Promise<OrganizationAIConsentResult> {
  try {
    const raw = await requestApi<unknown>("POST", "/organization/ai/consent", { configurationVersion });
    return { kind: "confirmed", status: AIStatusSchema.parse(raw) };
  } catch (e) {
    if (isApiHttpError(e) && e.status === 409) {
      const c = OrganizationAIConsentConflictSchema.safeParse(e.data);
      if (c.success) return { kind: "conflict", reason: c.data.reason, configuration: c.data.organization };
    }
    throw e;
  }
}

/**
 * PAC-71: the conferencing 400s that tell the user to (re)connect Outlook
 * for Teams, in the server's exact words (contract: createConferenceLink,
 * addEventConference), and how the app says them. They point to Settings,
 * where the connect is a signed-in step, never to a sign-in start.
 */
const TEAMS_CONNECT_TEXT: ReadonlyMap<string, string> = new Map([
  [
    "teams: not connected — connect Outlook in Settings (POST /api/auth/microsoft/connect)",
    "Microsoft Teams is not connected. Connect Outlook in Settings to add Teams links.",
  ],
  [
    "teams: connection lost — reconnect Outlook in Settings (POST /api/auth/microsoft/connect)",
    "The Microsoft Teams connection was lost. Reconnect Outlook in Settings to add Teams links.",
  ],
]);

// ---------- PAC-83: classification and the user-facing wording ----------

export type ApiFailureKind = "cancelled" | "budget" | "too-large" | "lost" | "http";
/** Per operation, never derived from the HTTP method (contract §3.3). */
export type ApiEffect = "read" | "write" | "booking";

/** The spec's strings (§3.4, §3.5), exported so tests and e2e read them from one place. */
export const API_MESSAGES = {
  budgetRead: "This took too long and was stopped. Try again.",
  budgetWriteSuffix: " Refresh to check whether it was applied.",
  budgetBooking: "Your booking was not made because the service was too slow. You can try again.",
  tooLarge: "This is too large to send.",
  lostRead: "Can't reach Paceday right now. Check your connection and try again.",
  lostWrite: "Paceday didn't confirm this. It may or may not have been applied — refresh to check before trying again.",
  lostBooking: "We couldn't confirm your booking. It may have been saved — check your email for a confirmation before booking again.",
} as const;

/** In precedence order: cancelled, budget, too-large, lost, http. */
export function classifyApiFailure(e: unknown): ApiFailureKind {
  if (e instanceof ApiRequestCancelledError) return "cancelled";
  if (isBudgetExpired(e)) return "budget";
  if (isRequestTooLarge(e)) return "too-large";
  if (isAnswerLost(e)) return "lost";
  return "http";
}

/**
 * What the user is told about a failed call, and whether a manual retry is
 * offered (contract §3.3). `shorten` names what to shorten for a 413.
 */
export function apiFailureMessage(e: unknown, effect: ApiEffect, shorten?: string): { message: string; retry: boolean } {
  const kind = classifyApiFailure(e);
  switch (kind) {
    case "cancelled":
      return { message: "", retry: false };
    case "budget":
      if (effect === "booking") return { message: API_MESSAGES.budgetBooking, retry: false };
      if (effect === "write") return { message: API_MESSAGES.budgetRead + API_MESSAGES.budgetWriteSuffix, retry: false };
      return { message: API_MESSAGES.budgetRead, retry: true };
    case "too-large":
      return { message: shorten ? `${API_MESSAGES.tooLarge} Shorten ${shorten}.` : API_MESSAGES.tooLarge, retry: false };
    case "lost":
      if (effect === "booking") return { message: API_MESSAGES.lostBooking, retry: false };
      if (effect === "write") return { message: API_MESSAGES.lostWrite, retry: false };
      return { message: API_MESSAGES.lostRead, retry: true };
    default:
      // Booking create: every 5xx other than the budget 503 is "may have been saved" (contract §2.4).
      if (effect === "booking" && isApiHttpError(e) && e.status >= 500) return { message: API_MESSAGES.lostBooking, retry: false };
      return { message: httpErrorMessage(e), retry: effect === "read" };
  }
}

/** Today's mapping for an HTTP error answer (unchanged by PAC-83). */
function httpErrorMessage(e: unknown): string {
  if (ssoStepupRequired(e)) {
    return "This change needs a confirmation from an administrator account of your organisation (Google Workspace or Microsoft 365).";
  }
  if (isApiHttpError(e)) {
    const data = e.data as { error?: string; message?: string; detail?: string } | undefined;
    const detail = data?.error ?? data?.message ?? data?.detail;
    const teams = e.status === 400 && detail ? TEAMS_CONNECT_TEXT.get(detail) : undefined;
    if (teams) return teams;
    if (detail) return detail;
    switch (e.status) {
      case 401:
        return "Your session expired. Please sign in again.";
      case 403:
        return "You don't have permission to do this.";
      case 409:
        return "This conflicts with the current state. Refresh and try again.";
      case 410:
        return "This resource is no longer available.";
      case 422:
        return "Some of the submitted data is invalid.";
      default:
        return e.status >= 500 ? "The server had a problem. Try again shortly." : `Request failed (${e.status}).`;
    }
  }
  return e instanceof Error ? e.message : "Unexpected error.";
}

/** The two calendars a connect can attach (PAC-71): Google and Outlook (Microsoft). */
export type ConnectProvider = Extract<CalendarProvider, "google" | "outlook">;

/** PAC-71: the connect start's path for a calendar provider. */
export function connectStartPath(provider: ConnectProvider): string {
  return provider === "outlook" ? "/auth/microsoft/connect" : "/auth/google/connect";
}

/**
 * PAC-71: POST the connect start and return where to send the window. The
 * answer is parsed strictly (ConnectStartResponse); a URL that is not https
 * is refused rather than followed.
 */
async function startConnect(provider: ConnectProvider): Promise<string> {
  const raw = await requestApi<unknown>("POST", connectStartPath(provider));
  const { authorize_url } = ConnectStartResponseSchema.parse(raw);
  if (new URL(authorize_url).protocol !== "https:") {
    throw new Error("The connect start answered an address that is not a secure web address.");
  }
  return authorize_url;
}

/**
 * Human-readable message for an API failure, usable directly in the UI.
 * `effect` defaults to a read; a write's caller passes "write" so a lost
 * answer says it may or may not have been applied (PAC-83 §3.4).
 */
export function apiErrorMessage(e: unknown, effect: ApiEffect = "read"): string {
  return apiFailureMessage(e, effect).message;
}

/**
 * One bounded exchange: the timer (a setTimeout, so fake timers and
 * Playwright's page.clock drive it) covers the headers AND the body, and is
 * cleared only once the body has been read (contract §3.1).
 */
export async function boundedExchange(
  url: string,
  init: RequestInit,
  boundMs: number,
): Promise<{ res: Response; text: string }> {
  const ctrl = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
      reject(new ApiUnreachableError("timeout"));
    }, boundMs);
  });
  expired.catch(() => {
    /* observed through the race below */
  });
  const lost = (): Error => {
    if (pageLeaving) return new ApiRequestCancelledError();
    return new ApiUnreachableError(timedOut ? "timeout" : "network");
  };
  try {
    let res: Response;
    try {
      res = await Promise.race([fetch(url, { ...init, signal: ctrl.signal }), expired]);
    } catch {
      throw lost();
    }
    let text: string;
    try {
      text = await Promise.race([res.text(), expired]);
    } catch {
      throw lost();
    }
    return { res, text };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Turn a bounded exchange into a value or one of the four error classes
 * (contract §3.2). Shared by requestApi and apiFetch.
 */
export function interpretResponse<T>(res: Response, text: string): T {
  const ct = res.headers.get("content-type") || "";
  let data: unknown;
  let parsed = false;
  if (text.trim() !== "") {
    try {
      data = JSON.parse(text);
      parsed = true;
    } catch {
      /* not JSON */
    }
  }
  if (!res.ok) {
    if (res.status >= 500 && (!ct.includes("application/json") || !parsed)) throw new ApiGatewayError(res.status);
    throw new ApiHttpError(res.status, parsed ? data : undefined);
  }
  if (res.status === 204) return undefined as T;
  // A 2xx that is not JSON (e.g. the SPA index.html) did not come from the API.
  if (!ct.includes("application/json") || !parsed) throw new ApiUnreachableError("non-json", res.status);
  return data as T;
}

export async function requestApi<T>(method: string, path: string, body?: unknown, query?: Record<string, string | undefined>, boundMs: number = CLIENT_REQUEST_BOUND_MS): Promise<T> {
  const url = new URL(API_BASE + path, window.location.origin);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v != null && v !== "") url.searchParams.set(k, v);
    }
  }
  const { res, text } = await boundedExchange(
    url.toString(),
    {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "include",
    },
    boundMs,
  );
  return interpretResponse<T>(res, text);
}



type BackendPersonalCalendar = {
  id: string | number;
  provider?: string;
  type?: PersonalCalendarType;
  name?: string;
  label?: string;
  url?: string;
  enabled?: boolean;
  last_synced_at?: string;
};

function normalizePersonalCalendar(raw: BackendPersonalCalendar): PersonalCalendar {
  const type = (raw.type ?? raw.provider ?? "webcal") as PersonalCalendarType;
  const label = raw.label ?? raw.name ?? "Personal";
  return {
    id: String(raw.id),
    label,
    type,
    url: raw.url,
    enabled: raw.enabled ?? true,
    last_synced_at: raw.last_synced_at,
  };
}

/** Default number of audit entries requested (matches GET /api/audit?limit=50). */
export const DEFAULT_AUDIT_LIMIT = 50;

/**
 * Render an audit `details` payload as safe, readable plain text.
 * Structured details are JSON-stringified — never injected as HTML.
 */
export function formatAuditDetails(details: unknown): string {
  if (details == null) return "";
  if (typeof details === "string") return details;
  if (typeof details === "number" || typeof details === "boolean") return String(details);
  try {
    return JSON.stringify(details);
  } catch {
    return "";
  }
}

const PROVIDER_NAME: Record<string, string> = { google: "Google Calendar", outlook: "Outlook", zoom: "Zoom" };

/**
 * PAC-67: what the user is told after disconnecting Outlook or Zoom. A
 * revocation the provider did not confirm is never shown as a plain success
 * (spec D-2, AC-15); for Outlook, Microsoft offers no revocation Paceday can
 * call, so the user is told where to remove the grant (AC-17).
 */
export function disconnectNotice(result: ProviderDisconnectResult): { kind: "success" | "info"; message: string } {
  const name = PROVIDER_NAME[result.provider] ?? result.provider;
  switch (result.revocation) {
    case "unconfirmed":
      return {
        kind: "info",
        message: `Disconnected ${name} here, but ${name} did not confirm it removed Paceday's access. To be sure, remove Paceday from the apps connected to your ${name} account.`,
      };
    case "not_offered":
      return {
        kind: "info",
        message: `Disconnected ${name}. To remove Paceday's access completely, remove Paceday from the apps on your Microsoft account.`,
      };
    case "nothing_stored":
      return { kind: "success", message: `${name} was not connected` };
    default:
      return { kind: "success", message: `Disconnected ${name}` };
  }
}

/**
 * PAC-67: the activity log's three connection kinds, worded from their
 * server-chosen details. Every other kind, and details that are not the
 * documented JSON, are shown as they are.
 */
export function describeAuditEntry(action: string, details: string): { title: string; detail: string } {
  const raw = { title: action, detail: details };
  if (action !== "connection_lost" && action !== "provider_disconnected" && action !== "revocation_unconfirmed") return raw;
  let parsed: { provider?: unknown; revocation?: unknown };
  try {
    parsed = JSON.parse(details) as typeof parsed;
  } catch {
    return raw;
  }
  const name = typeof parsed?.provider === "string" ? PROVIDER_NAME[parsed.provider] : undefined;
  if (!name) return raw;
  if (action === "connection_lost") {
    return { title: `${name} connection lost`, detail: "Paceday could no longer use this connection. Reconnect it to keep using it." };
  }
  if (action === "revocation_unconfirmed") {
    return { title: `${name} revocation not confirmed`, detail: `Remove Paceday from the apps connected to your ${name} account.` };
  }
  const detail =
    parsed.revocation === "confirmed"
      ? `${name} confirmed that Paceday's access was removed.`
      : parsed.revocation === "unconfirmed"
        ? `${name} did not confirm that Paceday's access was removed.`
        : parsed.revocation === "not_offered"
          ? "Paceday's access can be removed from the apps on your Microsoft account."
          : "";
  return { title: `${name} disconnected`, detail };
}

/** Normalize the audit list response; tolerates missing/odd fields and envelopes. */
export function normalizeAuditEntries(raw: unknown): AuditEntry[] {
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { entries?: unknown[] } | null)?.entries)
      ? (raw as { entries: unknown[] }).entries
      : Array.isArray((raw as { items?: unknown[] } | null)?.items)
        ? (raw as { items: unknown[] }).items
        : [];
  return list.map((item, i) => {
    const e = (item ?? {}) as { id?: unknown; action?: unknown; details?: unknown; created_at?: unknown };
    const idNum = Number(e.id);
    return {
      id: Number.isFinite(idNum) ? idNum : i,
      action: typeof e.action === "string" && e.action ? e.action : "unknown",
      details: formatAuditDetails(e.details),
      created_at: typeof e.created_at === "string" ? e.created_at : "",
    } satisfies AuditEntry;
  });
}


// ---------- Settings adapter ----------

export const WEEKDAY_KEYS: WeekdayKey[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidHHMM(value: unknown): value is string {
  return typeof value === "string" && HHMM_RE.test(value);
}

function normalizeInterval(raw: unknown): DayInterval | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const start = isValidHHMM(r.start) ? r.start : undefined;
  const end = isValidHHMM(r.end) ? r.end : undefined;
  if (!start || !end) return undefined;
  return { enabled: r.enabled !== false, start, end };
}

function normalizeDayMap(raw: unknown): Partial<Record<WeekdayKey, DayInterval>> {
  const out: Partial<Record<WeekdayKey, DayInterval>> = {};
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;
  for (const key of WEEKDAY_KEYS) {
    const interval = normalizeInterval(r[key]);
    if (interval) out[key] = interval;
  }
  return out;
}

/**
 * Accepts the backend camelCase `workingHours` payload (or an already
 * snake_cased one) and returns undefined when the backend does not send it yet.
 */
export function normalizeWorkingHours(raw: unknown): WorkingHours | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const fallback = normalizeInterval(r.default);
  const days = normalizeDayMap(r.days);
  if (!fallback && Object.keys(days).length === 0) return undefined;
  const mode: WorkingHoursMode = r.mode === "by_day" ? "by_day" : "all_days";
  return {
    mode,
    default: fallback ?? { enabled: true, start: "09:00", end: "18:00" },
    days,
  };
}

export function normalizeLunchBreaks(raw: unknown): LunchBreaks | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const days = normalizeDayMap(raw);
  return Object.keys(days).length > 0 ? days : undefined;
}

/**
 * Frontend snake_case field ↔ backend camelCase property, for every scalar
 * setting that has a counterpart in the contract's `Settings` schema. The
 * backend sends and accepts camelCase only; a snake_case key in a PUT body is
 * ignored by its JSON decoder, so an unmapped field is silently not saved.
 */
const SETTINGS_FIELDS: ReadonlyArray<readonly [keyof Settings, string]> = [
  ["work_start", "workStart"],
  ["work_end", "workEnd"],
  ["focus_min_block_minutes", "focusMinBlockMinutes"],
  ["focus_max_block_minutes", "focusMaxBlockMinutes"],
  ["focus_daily_target_minutes", "focusDailyTargetMinutes"],
  ["focus_label", "focusLabel"],
  ["focus_color", "focusColor"],
  ["lunch_start", "lunchStart"],
  ["lunch_end", "lunchEnd"],
  ["protect_lunch", "protectLunch"],
  ["buffer_before_minutes", "bufferBeforeMinutes"],
  ["buffer_after_minutes", "bufferAfterMinutes"],
  ["compression_enabled", "compressionEnabled"],
  ["auto_schedule_enabled", "autoScheduleEnabled"],
  ["auto_schedule_cron", "autoScheduleCron"],
  ["llm_provider", "llmProvider"],
  ["llm_model", "llmModel"],
  ["llm_api_key", "llmApiKey"],
  ["llm_api_key_set", "llmApiKeySet"],
  ["llm_api_keys_set", "llmApiKeysSet"],
  ["llm_unbound_api_key_set", "llmUnboundApiKeySet"],
  ["llm_unbound_api_key", "llmUnboundApiKey"],
  ["ai_status", "aiStatus"],
  ["llm_base_url", "llmBaseUrl"],
  ["calendar_provider", "calendarProvider"],
  ["webcal_url", "webcalUrl"],
  ["aws_region", "awsRegion"],
  ["bedrock_model", "bedrockModel"],
  ["azure_endpoint", "azureEndpoint"],
  ["azure_deployment", "azureDeployment"],
  ["azure_api_version", "azureApiVersion"],
  ["time_format", "timeFormat"],
  ["vertex_model", "vertexModel"],
];

/**
 * The backend's conferencingProvider names the default meeting provider with
 * its own values (API-039): `meet` is the app's `google_meet`. `custom` has no
 * backend value and is never the default.
 */
const CONFERENCING_FROM_BACKEND: Record<string, ConferenceProvider> = {
  meet: "google_meet",
  zoom: "zoom",
  teams: "teams",
};
const CONFERENCING_TO_BACKEND: Partial<Record<ConferenceProvider, string>> = {
  google_meet: "meet",
  zoom: "zoom",
  teams: "teams",
};

/** Normalize a GET/PUT /api/settings response (snake_case + camelCase fields). */
export function normalizeSettings(raw: unknown): Settings {
  const r = (raw ?? {}) as Record<string, unknown> & Settings;
  const working = normalizeWorkingHours(r.workingHours ?? r.working_hours);
  const lunch = normalizeLunchBreaks(r.lunchBreaks ?? r.lunch_breaks);
  const bag: Record<string, unknown> = { ...r };
  delete bag.workingHours;
  delete bag.lunchBreaks;
  delete bag.focus_max_per_week;
  for (const [snake, camel] of SETTINGS_FIELDS) {
    if (camel in bag) {
      bag[snake] = bag[camel];
      delete bag[camel];
    }
  }
  const out = bag as unknown as Settings;

  const maxMeetings = r.outOfHoursMeetingsPerWeek ?? r.out_of_hours_meetings_per_week;
  if (typeof maxMeetings === "number" && Number.isFinite(maxMeetings) && maxMeetings >= 0) {
    out.out_of_hours_meetings_per_week = maxMeetings;
  }
  const conferencing = CONFERENCING_FROM_BACKEND[String(r.conferencingProvider ?? "")];
  delete (out as unknown as Record<string, unknown>).conferencingProvider;
  if (conferencing) out.default_conference_provider = conferencing;
  const autoDecline = r.autoDeclineOutsideWorkingHours ?? r.auto_decline_outside_working_hours;
  if (typeof autoDecline === "boolean") out.auto_decline_outside_working_hours = autoDecline;
  if (working) out.working_hours = working;
  else delete out.working_hours;
  if (lunch) out.lunch_breaks = lunch;
  else delete out.lunch_breaks;
  return out;
}

/**
 * The whole settings document in the backend's camelCase. Properties the
 * frontend does not model (e.g. recap settings) pass through untouched.
 * `settingsPatchBody` turns it into the PATCH body.
 */
export function settingsRequestBody(s: Settings): Record<string, unknown> {
  const body: Record<string, unknown> = { ...s };
  for (const [snake, camel] of SETTINGS_FIELDS) {
    if (snake in body) {
      body[camel] = body[snake];
      delete body[snake];
    }
  }
  delete body.working_hours;
  delete body.lunch_breaks;
  delete body.focus_max_per_week;
  delete body.out_of_hours_meetings_per_week;
  delete body.auto_decline_outside_working_hours;
  delete body.default_conference_provider;
  const conferencing = s.default_conference_provider && CONFERENCING_TO_BACKEND[s.default_conference_provider];
  if (conferencing) body.conferencingProvider = conferencing;
  if (s.working_hours) body.workingHours = s.working_hours;
  // No per-day overrides is `{}`: the server replaces lunchBreaks whole, so
  // this is how the last override is removed (PAC-24).
  body.lunchBreaks = s.lunch_breaks ?? {};
  body.outOfHoursMeetingsPerWeek = s.out_of_hours_meetings_per_week ?? 0;
  body.autoDeclineOutsideWorkingHours = s.auto_decline_outside_working_hours ?? false;
  return body;
}


/**
 * Read-only members of the settings document: accepted and ignored on write,
 * so never sent (contract Settings, NEW-llm-bring-your-own adds three).
 */
const SETTINGS_READ_ONLY = new Set(["llmApiKeySet", "llmApiKeysSet", "llmUnboundApiKeySet", "aiStatus", "updatedAt"]);

/** Properties PATCH /api/settings accepts (SettingsUpdate), minus the read-only ones. */
const SETTINGS_PATCH_KEYS = new Set(Object.keys(SettingsUpdate.shape).filter((k) => !SETTINGS_READ_ONLY.has(k)));

/**
 * Build the PATCH /api/settings body (PAC-24): only contract properties, and
 * only those whose value differs from `previous` (the settings as last read).
 * The provider key is never read back, so it is sent only when the user typed
 * one or cleared it (`llm_api_key` set, possibly to "").
 */
export function settingsPatchBody(s: Settings, previous?: Settings): Record<string, unknown> {
  const next = settingsRequestBody(s);
  const prev = previous ? settingsRequestBody(previous) : undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(next)) {
    if (!SETTINGS_PATCH_KEYS.has(key) || value === undefined) continue;
    if (prev && JSON.stringify(prev[key]) === JSON.stringify(value)) continue;
    out[key] = value;
  }
  return out;
}

/**
 * The probe body: provider, model and an unsaved key only (PAC-24). The probe
 * tests the form as it stands, unsaved: a key the user typed is sent, and a
 * saved key the user removed ("Remove saved key", `llm_api_key` = "") is sent
 * as an empty key, so the server answers "needs a key" instead of testing the
 * stored key (contract challenge rev. 2, non-blocking 6). An untouched key
 * field (`undefined`) sends nothing, so the stored key bound to the provider
 * is tested.
 *
 * PAC-87 (factory decision, contract §4, PAC87-AC-14): a member in row 9 (own
 * or removed provider stored, organisation forbids personal keys, confirmed)
 * sends `{}`, so the probe tests the organisation's AI their requests
 * actually use. Naming their own provider would only be refused as "personal
 * keys are not allowed", and a model or key would be refused with `{}` too.
 */
export function llmTestBody(s: Settings): Record<string, string> {
  if (runsOnOrganizationAIInsteadOfOwnChoice(s)) return {};
  const provider = String(s.llm_provider ?? "");
  // PAC-73 Part 2: a model or key is never combined with the organisation's
  // configuration (the server refuses it), so "organization", off and a
  // removed provider send the choice alone.
  if (!isKeyProvider(provider)) return { llmProvider: provider };
  const body: Record<string, string> = { llmProvider: provider, llmModel: s.llm_model ?? "" };
  if (s.llm_api_key) body.llmApiKey = s.llm_api_key;
  else if (s.llm_api_key === "" && isKeyProvider(provider)) body.llmApiKey = "";
  return body;
}

// ---------- Public API ----------

/**
 * GET /api/events may return attendees as plain strings or as attendee
 * objects. Ownership logic expects strings, so coerce safely and keep the
 * richer objects in attendee_details for views that need them.
 */
type RawAttendee = string | { email?: string; name?: string; displayName?: string; organizer?: boolean; rsvp?: string } | null | undefined;

export function normalizeAttendees(raw: unknown): {
  attendees?: string[];
  attendee_details?: Attendee[];
} {
  if (!Array.isArray(raw)) return {};
  const attendees: string[] = [];
  const details: Attendee[] = [];
  for (const item of raw as RawAttendee[]) {
    if (typeof item === "string") {
      const value = item.trim();
      if (value) attendees.push(value);
      continue;
    }
    if (item && typeof item === "object") {
      const email = typeof item.email === "string" ? item.email.trim() : "";
      const name =
        (typeof item.name === "string" && item.name) ||
        (typeof item.displayName === "string" && item.displayName) ||
        undefined;
      const label = email || name;
      if (!label) continue; // malformed attendee → skip, never fabricate
      attendees.push(label);
      details.push({
        email: email || label,
        name,
        organizer: item.organizer === true ? true : undefined,
        rsvp: item.rsvp as Attendee["rsvp"],
      });
    }
  }
  return {
    attendees,
    attendee_details: details.length ? details : undefined,
  };
}

export function normalizeEvents(raw: unknown): CalendarEvent[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Array<CalendarEvent & { attendees?: unknown }>).map((ev) => {
    const { attendees, attendee_details } = normalizeAttendees(ev?.attendees);
    return {
      ...ev,
      ...(attendees ? { attendees } : {}),
      attendee_details: ev?.attendee_details?.length ? ev.attendee_details : attendee_details,
    } as CalendarEvent;
  });
}

export const api = {
  /**
   * Health — the background probe (PAC-83 D-2). Bounded by
   * HEALTH_PROBE_BOUND_MS; its result only drives the "can't reach Paceday"
   * banner and never changes what data calls return.
   *  - 2xx JSON → reachable.
   *  - an HTTP error answer (JSON body) → reachable but unhealthy: thrown.
   *  - no answer, network failure, non-JSON or gateway answer → unreachable.
   */
  health: async (): Promise<{ status: string; version: string; reachable: boolean }> => {
    try {
      const r = await requestApi<{ status: string; version: string }>("GET", "/health", undefined, undefined, HEALTH_PROBE_BOUND_MS);
      return { ...r, reachable: true };
    } catch (e) {
      if (isAnswerLost(e)) return { status: "unreachable", version: "", reachable: false };
      throw e;
    }
  },

  /**
   * Free/busy probe (T-39 / T-40).
   *
   * Tells the UI which participants we can read calendar data for.
   * Mock heuristic — covers the demo + offline cases:
   *   - email matches the current org domain → status=paceday_user (provider=paceday)
   *   - known directory (co.com, acme.com, paceday.com) → known + google
   *   - microsoft.com / outlook.com / hotmail.com / live.com → known + outlook
   *   - personal mail (gmail.com, yahoo.com, proton.me, ...) → unknown
   * The real backend overrides all of this when reachable.
   */
  freebusy: (input: { emails: string[]; start_time: string; end_time: string }) =>
    demoOrReal<FreeBusyResponse>("api.freebusy", [input], () => requestApi<FreeBusyResponse>("POST", "/freebusy", input)),

  authStatus: () =>
    demoOrReal("api.authStatus", [], () => requestApi<AuthStatus>("GET", "/auth/status")),

  integrationAvailability: () =>
    demoOrReal<IntegrationAvailability>("api.integrationAvailability", [], () => requestApi<IntegrationAvailability>("GET", "/integrations/availability")),

  /**
   * PAC-71: start a calendar connect for the signed-in user. POST
   * /api/auth/google/connect or /api/auth/microsoft/connect (no body) answers
   * 200 ConnectStartResponse; the caller sends the window to `authorize_url`.
   * A connect is never a GET start: those are sign-in only (spec §3, AC-32).
   * Every failure is thrown, never replaced with demo data (PAC-83).
   */
  startConnect: (provider: ConnectProvider = "google") =>
    demoOrReal("api.startConnect", [provider], () => startConnect(provider)),
  /**
   * PAC-71: save the work calendar, and only it, before a connect from a
   * control that changes it (spec §3: "by the user's explicit choice in that
   * control before the connect starts"). The connect itself never sets it.
   * PATCH /api/settings with `{ calendarProvider }`. A failure is thrown,
   * never replaced with demo data (PAC-83), so the caller does not connect.
   */
  saveWorkCalendar: (provider: ConnectProvider): Promise<Settings> =>
    demoOrReal("api.saveWorkCalendar", [provider], async () =>
      normalizeSettings(await requestApi<unknown>("PATCH", "/settings", { calendarProvider: provider })),
    ),

  authDisconnect: () =>
    demoOrReal("api.authDisconnect", [], () => requestApi<void>("DELETE", "/auth/disconnect")),

  // Settings
  getSettings: () =>
    demoOrReal("api.getSettings", [], async () => normalizeSettings(await requestApi<unknown>("GET", "/settings"))),

  updateSettings: (s: Settings, previous?: Settings) =>
    demoOrReal("api.updateSettings", [s, previous], async () => normalizeSettings(await requestApi<unknown>("PATCH", "/settings", settingsPatchBody(s, previous)))),

  // Calendar
  getEvents: (start: string, end: string) =>
    demoOrReal("api.getEvents", [start, end], async () =>
        normalizeEvents(
          await requestApi<CalendarEvent[]>("GET", "/calendar/events", undefined, { start, end }),
        )),

  // Focus
  runFocus: (week?: string) =>
    demoOrReal("api.runFocus", [week], () => requestApi<FocusRunResult>("POST", "/focus/run", { week })),

  getFocusBlocks: (week: string) =>
    demoOrReal("api.getFocusBlocks", [week], () => requestApi<FocusBlock[]>("GET", "/focus/blocks", undefined, { week })),

  clearFocusBlocks: (week: string) =>
    demoOrReal("api.clearFocusBlocks", [week], () => requestApi<{ deleted: number }>("DELETE", "/focus/blocks", undefined, { week })),

  // Schedule
  scheduleSuggest: (body: {
    duration_minutes: number;
    attendees: string[];
    range_start: string;
    range_end: string;
    title: string;
  }) =>
    demoOrReal("api.scheduleSuggest", [body], () => requestApi<{ slots: SuggestedSlot[] }>("POST", "/schedule/suggest", body)),

  scheduleCreate: (body: {
    title: string;
    start: string;
    end: string;
    attendees: string[];
    description?: string;
  }) =>
    demoOrReal("api.scheduleCreate", [body], () => requestApi<CalendarEventDTO>("POST", "/schedule/create", body)),

  compressionPreview: (body: { date?: string; week?: string }) =>
    demoOrReal("api.compressionPreview", [body], () => requestApi<CompressionResult[]>("POST", "/schedule/compress", body)),

  compressionApply: (body: { proposals: MoveProposal[] }) =>
    demoOrReal("api.compressionApply", [body], () =>
        requestApi<CompressionApplyResponse>("POST", "/schedule/compress/apply", {
          proposals: body.proposals.map(toApplyProposal),
        })),

  // NLP
  nlpParse: (text: string) =>
    demoOrReal("api.nlpParse", [text], () => requestApi<ParseResult>("POST", "/nlp/parse", { text })),

  nlpConfirm: (parse_result: ParseResult, selected_slot_index: number) =>
    demoOrReal("api.nlpConfirm", [parse_result, selected_slot_index], () => requestApi<CalendarEventDTO>("POST", "/nlp/confirm", { parse_result, selected_slot_index })),

  // Audit
  getAudit: (limit = DEFAULT_AUDIT_LIMIT) =>
    demoOrReal("api.getAudit", [limit], async () => {
        const raw = await requestApi<unknown>("GET", "/audit", undefined, { limit: String(limit) });
        return normalizeAuditEntries(raw);
      }),

  // Personal calendars
  listPersonalCalendars: () =>
    demoOrReal("api.listPersonalCalendars", [], async () => {
        const raw = await requestApi<BackendPersonalCalendar[]>("GET", "/personal-calendars");
        return (raw ?? []).map(normalizePersonalCalendar);
      }),

  addPersonalCalendar: (body: { type: PersonalCalendarType; label: string; url?: string }) =>
    demoOrReal("api.addPersonalCalendar", [body], () =>
        requestApi<BackendPersonalCalendar>(
          "POST",
          "/personal-calendars",
          { provider: body.type, name: body.label, url: body.url, enabled: true },
        ).then(normalizePersonalCalendar)),

  updatePersonalCalendar: (id: string, patch: Partial<Pick<PersonalCalendar, "enabled" | "label">>) =>
    demoOrReal("api.updatePersonalCalendar", [id, patch], () =>
        requestApi<BackendPersonalCalendar>("PATCH", `/personal-calendars/${id}`, {
          ...(patch.label === undefined ? {} : { name: patch.label }),
          ...(patch.enabled === undefined ? {} : { enabled: patch.enabled }),
        }).then(normalizePersonalCalendar)),

  deletePersonalCalendar: (id: string) =>
    demoOrReal("api.deletePersonalCalendar", [id], () => requestApi<void>("DELETE", `/personal-calendars/${id}`)),

  syncPersonalCalendar: (id: string) =>
    demoOrReal("api.syncPersonalCalendar", [id], () => requestApi<BackendPersonalCalendar>("POST", `/personal-calendars/${id}/sync`).then(normalizePersonalCalendar)),

  // LLM
  llmTest: (s: Settings) =>
    demoOrReal("api.llmTest", [s], async () => {
        const res = await requestApi<{ ok: boolean; response: string; provider: string; configuration?: "own" | "organization" }>(
          "POST",
          "/llm/test",
          llmTestBody(s),
        );
        const whose = res.configuration === "organization" ? "your organisation's " : "";
        return { ok: res.ok, message: `Reached ${whose}${res.provider || "the provider"}: ${res.response}` };
      }),

  // ----- Events: edit / delete -----
  updateEvent: (
    id: string,
    patch: Partial<Pick<CalendarEvent, "title" | "start" | "end" | "description" | "location" | "room_resource_email" | "attendees" | "attendee_details">>,
    sendUpdates: "all" | "none" = "none",
  ) =>
    demoOrReal("api.updateEvent", [id, patch, sendUpdates], () =>
        requestApi<CalendarEventDTO>("PATCH", `/events/${id}`, { ...patch, send_updates: sendUpdates })),

  deleteEvent: (id: string, sendUpdates: "all" | "none" = "none") =>
    demoOrReal("api.deleteEvent", [id, sendUpdates], () => requestApi<void>("DELETE", `/events/${id}`, undefined, { send_updates: sendUpdates })),

  // ----- Rooms -----
  searchRooms: (q: string, start?: string, end?: string) =>
    demoOrReal("api.searchRooms", [q, start, end], () => requestApi<Room[]>("GET", "/rooms", undefined, { q, start, end })),

  // ----- Attendees -----
  suggestAttendees: (q: string) =>
    demoOrReal("api.suggestAttendees", [q], () => requestApi<Attendee[]>("GET", "/attendees/suggest", undefined, { q })),

  // ----- Conferencing -----
  addConference: (eventId: string, body: { provider: ConferenceProvider; url?: string }) =>
    demoOrReal("api.addConference", [eventId, body], () =>
        requestApi<ConferenceLink>(
          "POST",
          `/events/${eventId}/conference`,
          conferenceRequestBody(body),
        )),

  removeConference: (eventId: string) =>
    demoOrReal("api.removeConference", [eventId], () => requestApi<void>("DELETE", `/events/${eventId}/conference`)),

  conferenceProviders: () =>
    demoOrReal("api.conferenceProviders", [], async () =>
        normalizeConferenceProviders(
          await requestApi<unknown>("GET", "/conference/providers"),
        )),

  zoomConnectUrl: () => `${API_BASE}/auth/zoom`,

  zoomDisconnect: () =>
    demoOrReal("api.zoomDisconnect", [], async () => ProviderDisconnectResultSchema.parse(await requestApi<unknown>("POST", "/conference/zoom/disconnect"))),

  microsoftDisconnect: () =>
    demoOrReal("api.microsoftDisconnect", [], async () => ProviderDisconnectResultSchema.parse(await requestApi<unknown>("POST", "/auth/microsoft/disconnect"))),
} satisfies ApiPort;

// ---------- Conferencing helpers (exported for tests) ----------

const CONFERENCE_PROVIDERS: ConferenceProvider[] = ["google_meet", "zoom", "teams", "custom"];

/** Only `custom` links carry a client-supplied URL; other providers are server-generated. */
export function conferenceRequestBody(body: { provider: ConferenceProvider; url?: string }) {
  if (body.provider !== "custom") return { provider: body.provider };
  return { provider: body.provider, url: body.url?.trim() };
}

/** Accepts the documented array shape and tolerates unknown providers/aliases. */
export function normalizeConferenceProviders(raw: unknown): ConferenceProviderStatus[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: ConferenceProviderStatus[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const key = String(r.provider ?? "")
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
    const provider = (
      key === "meet" || key === "googlemeet" ? "google_meet" : key === "microsoft_teams" ? "teams" : key
    ) as ConferenceProvider;
    if (!CONFERENCE_PROVIDERS.includes(provider)) continue;
    out.push({
      provider,
      connected: r.connected === true,
      email: typeof r.email === "string" ? r.email : undefined,
      enabled: typeof r.enabled === "boolean" ? r.enabled : undefined,
      auto_with: (r.auto_with as ConferenceProviderStatus["auto_with"]) ?? undefined,
    });
  }
  return out;
}

/** A custom conference URL must be an absolute http(s) URL. */
export function isValidConferenceUrl(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
