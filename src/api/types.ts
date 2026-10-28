import type { components } from "./generated/types";

export type CalendarProvider = "google" | "outlook" | "webcal";

/** PAC-67: the 200 of disconnectMicrosoft and disconnectZoom (generated). */
export type ProviderDisconnectResult = components["schemas"]["ProviderDisconnectResult"];
export type PersonalCalendarType = "google" | "outlook" | "webcal";
/**
 * The AI choice as the server reads it (contract Settings.llmProvider): "" is
 * off, "organization" follows the organisation, "unsupported" is a stored
 * provider Paceday no longer supports, and the rest are the five key-based
 * providers (NEW-llm-bring-your-own). Taken from the generated types, never
 * hand-written (AC-33).
 */
export type LLMProvider = components["schemas"]["Settings"]["llmProvider"];
/** The five key-based providers (contract AIStatus.provider / LLMApiKeysSet). */
export type KeyProvider = NonNullable<components["schemas"]["AIStatus"]["provider"]>;
/** Why AI is not configured for the caller, and who can change that (generated). */
export type AINotConfigured = components["schemas"]["AINotConfigured"];
/** Whether AI works for the caller now (generated, read-only on the settings document). */
export type AIStatus = components["schemas"]["AIStatus"];
/** Per provider, whether a key bound to it is on file (generated). */
export type LLMApiKeysSet = components["schemas"]["LLMApiKeysSet"];
/** PAC-73 Part 2: the organisation's AI configuration as every member reads it (generated; never the key). */
export type OrganizationAIConfiguration = components["schemas"]["OrganizationAIConfiguration"];
/** PAC-73 Part 2: the body of patchOrganizationAI (generated). */
export type OrganizationAIConfigurationUpdate = components["schemas"]["OrganizationAIConfigurationUpdate"];
export type IntegrationProvider = "google" | "microsoft" | "zoom" | "slack" | "notion" | "webcal";

export interface IntegrationAvailabilityStatus {
  available: boolean;
  reason?: "configured" | "missing_credentials" | "invalid_redirect_uri" | "built_in" | string;
}

export type IntegrationAvailability = Record<IntegrationProvider, IntegrationAvailabilityStatus>;


export type ConferenceProvider = "google_meet" | "zoom" | "teams" | "custom";

export type WeekdayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

/** A single HH:MM interval that can be switched off for a given day. */
export interface DayInterval {
  enabled: boolean;
  start: string;
  end: string;
}

export type WorkingHoursMode = "all_days" | "by_day";

/** Backend contract: settings.workingHours */
export interface WorkingHours {
  mode: WorkingHoursMode;
  default: DayInterval;
  days: Partial<Record<WeekdayKey, DayInterval>>;
}

/** Backend contract: settings.lunchBreaks (may be omitted/empty). */
export type LunchBreaks = Partial<Record<WeekdayKey, DayInterval>>;

export interface Settings {

  work_start: string;
  work_end: string;
  timezone: string;
  focus_min_block_minutes: number;
  focus_max_block_minutes: number;
  focus_daily_target_minutes: number;
  out_of_hours_meetings_per_week?: number;
  auto_decline_outside_working_hours?: boolean;
  focus_label: string;
  focus_color: string;
  lunch_start: string;
  lunch_end: string;
  protect_lunch: boolean;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  compression_enabled: boolean;
  auto_schedule_enabled: boolean;
  auto_schedule_cron: string;
  llm_provider: LLMProvider | string;
  llm_model: string;
  /**
   * Write-only: never returned by the server; set only when the user types or
   * clears a key. The server binds it to the provider chosen after the write.
   */
  llm_api_key?: string;
  /** Whether a key bound to the saved provider is on file (backend: llmApiKeySet). */
  llm_api_key_set?: boolean;
  /** Per provider, whether a key bound to it is on file (backend: llmApiKeysSet, read-only). */
  llm_api_keys_set?: LLMApiKeysSet;
  /** A key saved before keys were bound to providers; never used (backend: llmUnboundApiKeySet). */
  llm_unbound_api_key_set?: boolean;
  /** Write-only: "" removes the unbound key (backend: llmUnboundApiKey). */
  llm_unbound_api_key?: "";
  /** Whether AI works for the caller now and, if not, why (backend: aiStatus, read-only). */
  ai_status?: AIStatus;
  /** Optional OpenAI/Anthropic gateway base URL (backend: llmBaseUrl). */
  llm_base_url?: string;
  calendar_id?: string;
  // Work calendar provider
  calendar_provider?: CalendarProvider;
  webcal_url?: string;
  // LLM: AWS Bedrock (Bedrock API key)
  aws_region?: string;
  bedrock_model?: string;
  // LLM: Azure OpenAI (API key)
  azure_endpoint?: string;
  azure_deployment?: string;
  azure_api_version?: string;
  // LLM: Google Vertex AI (express-mode API key)
  vertex_model?: string;
  // Conferencing
  /** Backend conferencingProvider (meet|zoom|teams), mapped to the app's names. */
  default_conference_provider?: ConferenceProvider;
  teams_enabled?: boolean;
  /** 12- or 24-hour clock for every time of day in the app (backend: timeFormat, PAC-55). */
  time_format?: "12h" | "24h";
  /** Per-day working hours (backend field: workingHours). Absent until the backend ships it. */
  working_hours?: WorkingHours;
  /** Per-day lunch overrides (backend field: lunchBreaks). Absent until the backend ships it. */
  lunch_breaks?: LunchBreaks;
}


export interface PersonalCalendar {
  id: string;
  label: string;
  type: PersonalCalendarType;
  email?: string;
  url?: string;
  enabled: boolean;
  last_synced_at?: string;
}

export interface LLMTestResult {
  ok: boolean;
  message: string;
  latency_ms?: number;
}

export type RsvpStatus = "accepted" | "declined" | "tentative" | "pending";

export interface Attendee {
  email: string;
  name?: string;
  avatar_url?: string;
  rsvp?: RsvpStatus;
  organizer?: boolean;
}

export interface ConferenceLink {
  provider: ConferenceProvider;
  url: string;
  label?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  color?: string;
  attendees?: string[];
  attendee_details?: Attendee[];
  is_focus_block?: boolean;
  is_personal_block?: boolean;
  description?: string;
  location?: string;
  room_resource_email?: string;
  conference?: ConferenceLink;
  /** Set when the event was created with free/busy verification (T-39). */
  coverage?: CoverageSummary;
}

export interface Room {
  id: string;
  name: string;
  email: string;
  building?: string;
  floor?: string;
  capacity?: number;
  available?: boolean;
}

export interface ConferenceProviderStatus {
  provider: ConferenceProvider;
  connected: boolean;
  email?: string;
  enabled?: boolean;
  // For Google Meet (auto with google calendar) / Teams (auto with outlook)
  auto_with?: CalendarProvider;
}

/**
 * Focus blocks and the focus-run result are the generated contract types
 * (PAC-32, API-014/API-015), never hand-written copies.
 * - FocusBlock: a stored row, GET /api/focus/blocks (snake_case, has `id`).
 * - FocusRunBlock: a block the engine just created, inside a run result
 *   (snake_case, no `id` or `created_at` yet).
 * - FocusRunResult: POST /api/focus/run (camelCase wrapper).
 */
export type FocusBlock = components["schemas"]["FocusBlockRecord"];
export type FocusRunBlock = components["schemas"]["FocusRunBlock"];
export type FocusRunResult = components["schemas"]["FocusRunResult"];

export interface SuggestedSlot {
  start: string;
  end: string;
  score: number;
  reasons: string[];
  /** Coverage of the attendees considered when ranking this slot (T-40). */
  coverage?: CoverageSummary;
}

export interface ParseResult {
  intent: "schedule_meeting" | "schedule_focus" | "unknown";
  title?: string;
  duration_minutes?: number;
  attendees?: string[];
  range_start?: string;
  range_end?: string;
  constraints?: string;
  error?: string;
  /** Present only when AI is not configured for the caller (NEW-llm-bring-your-own); nothing was sent. */
  not_configured?: AINotConfigured;
  suggested_slots?: SuggestedSlot[];
  /** Optional coverage summary applied to ALL suggested_slots (T-40). */
  coverage?: CoverageSummary;
}

/**
 * Compression is the generated contract (PAC-32, API-016). The preview
 * response is camelCase (MoveProposal, CompressionResult); the apply request
 * is snake_case (CompressionApplyProposal) and carries only the three fields
 * the server reads. The client converts one into the other.
 */
export type MoveProposal = components["schemas"]["MoveProposal"];
export type CompressionResult = components["schemas"]["CompressionResult"];
export type CompressionApplyProposal = components["schemas"]["CompressionApplyProposal"];

export interface AuditEntry {
  id: number;
  action: string;
  details: string;
  created_at: string;
}

export interface AuthStatus {
  connected: boolean;
  email: string;
  provider?: CalendarProvider;
}

export interface FreeBusyEntry {
  start: string;
  end: string;
}

export type FreeBusyMap = Record<string, FreeBusyEntry[]>;

// ---------- Free/busy coverage (T-39 / T-40) ----------

/**
 * How well we can see this participant's calendar:
 * - paceday_user: they have a Paceday account (we use their stored events)
 * - known:        external user but we successfully read their calendar
 *                 (e.g. shared Google Workspace freebusy)
 * - unknown:      we could not reach their calendar — slots may overlap
 */
export type CoverageStatus = "paceday_user" | "known" | "unknown";

/** Provider that surfaced the freebusy data (drives the small logo on the badge). */
export type CoverageProvider = "google" | "outlook" | "paceday";

export interface ParticipantCoverage {
  email: string;
  status: CoverageStatus;
  provider?: CoverageProvider;
}

export interface FreeBusyResponse {
  start_time: string;
  end_time: string;
  participants: ParticipantCoverage[];
  /** Per-participant busy windows. Keyed by lowercase email. */
  busy?: Record<string, FreeBusyEntry[]>;
}

/** Compact summary embedded on a CalendarEvent / suggestion / public link. */
export interface CoverageSummary {
  total: number;
  checked: number;
  /** True when the organizer has no calendar provider connected at all. */
  organizer_disconnected?: boolean;
}

// ---------- Scheduling links (T-28) ----------

export type CoHostStatus = "accepted" | "pending" | "declined";

export interface SchedulingHost {
  user_id?: string;
  email: string;
  name?: string;
  avatar_url?: string;
  is_owner: boolean;
  status: CoHostStatus;
}

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

/**
 * Usage type controls how many times a link can be booked.
 * - reusable:    unlimited bookings (default)
 * - recurring:   bookable up to `max_uses` times, then auto-disables
 * - single_use:  one booking only, then auto-disables
 */
export type LinkUsageType = "reusable" | "recurring" | "single_use";

export interface SchedulingLink {
  id: string;
  owner_id: string;
  title: string;
  slug: string;
  durations: number[];           // minutes, e.g. [15, 30, 60]
  days: Weekday[];               // available weekdays
  window_start: string;          // "HH:MM"
  window_end: string;            // "HH:MM"
  buffer_before: number;         // minutes
  buffer_after: number;          // minutes
  /** Minimum lead time (in minutes) before a booking can start. */
  min_notice_minutes: number;
  /** Usage policy — see LinkUsageType. */
  usage_type: LinkUsageType;
  /** Cap for recurring links. Ignored for reusable / single_use. */
  max_uses?: number;
  /** How many bookings have been made (consumed) so far. */
  uses_count: number;
  active: boolean;
  hosts: SchedulingHost[];       // owner first, then co-hosts
  created_at: string;
  /** True when the current user is the owner. */
  is_owner: boolean;
  /** Status of the current user vs this link (for "Shared with me"). */
  my_status?: CoHostStatus;
}

export interface CoHostInvite {
  link_id: string;
  link_title: string;
  owner_name: string;
  owner_email: string;
  invited_at: string;
}

export interface BookingSlot {
  start: string;          // ISO
  end: string;            // ISO
}

export interface PublicLinkInfo {
  slug: string;
  title: string;
  durations: number[];
  hosts: Array<Pick<SchedulingHost, "email" | "name" | "avatar_url">>;
  timezone_hint?: string;
  /** Echoed for the public page so it can show "We need X notice" if relevant. */
  min_notice_minutes?: number;
  usage_type?: LinkUsageType;
  /** Per-duration coverage of the hosts whose calendars we could read (T-40). */
  coverage?: CoverageSummary;
}

export interface BookingConfirmation {
  id: string;
  link_slug: string;
  title: string;
  start: string;
  end: string;
  duration_minutes: number;
  hosts: Array<Pick<SchedulingHost, "email" | "name" | "avatar_url">>;
  booker_name: string;
  booker_email: string;
  notes?: string;
}
