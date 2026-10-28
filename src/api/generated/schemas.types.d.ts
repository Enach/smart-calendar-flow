
  export namespace Schemas {
    // <Schemas>
  /**
 * NEW-llm-bring-your-own. Why AI is not configured for a caller, and who
 * can change that. One row of the table in
 * `docs/specs/NEW-llm-bring-your-own-part2.md` §3.1 (Part 2; rows 1-8
 * are the parent spec's, rows 9-11 are new), decided from the caller's
 * stored choice and their organisation's configuration at the moment of
 * the request. Rows are evaluated IN THE ORDER LISTED (9-11 right after
 * 1). "Complete": the organisation's configuration is `configured`
 * (OrganizationAIConfiguration). "Forbids": its `personalKeysAllowed` is
 * false. "Confirmed": the caller's stored confirmation
 * (confirmOrganizationAI) names exactly the `configurationVersion` the
 * request reads, the two read as one consistent state; a patchSettings
 * that stores `""` or a provider deletes it (spec revision 1).
 * 
 * | Row | Stored choice | Condition | `reason` | `enablers` |
 * |---|---|---|---|---|
 * | 1 | `""` (off) | - | `off` | user |
 * | 9 | (reserved) | never answered under spec P2-D2's current default (OQ-P2-2) | - | - |
 * | 10 | a provider, or `unsupported` | forbids; complete | `personal_keys_forbidden` | user |
 * | 11 | a provider, or `unsupported` | forbids; not complete | `personal_keys_forbidden` | organization_admin |
 * | 2 | a provider | a key bound to it | (configured: own) | - |
 * | 3 | a provider | no key bound to it | `needs_key` (+ `provider`) | user |
 * | 4 | `organization` | complete; confirmed | (configured: organisation) | - |
 * | 5 | `organization` | complete; not confirmed | `organization_unconfirmed` | user |
 * | 6 | `organization` | no organisation, or not complete | `nothing_configured` | user, plus organization_admin in an organisation; organization_admin only when it forbids |
 * | 7 | `unsupported` (Ollama) | complete | `provider_removed_organization_available` | user |
 * | 8 | `unsupported` (Ollama) | otherwise | `provider_removed` | user, plus organization_admin in an organisation |
 * 
 * The same caller state gives the same `reason` and `enablers` on parse,
 * brief refresh, the probe naming nothing, and the settings read (spec
 * P2-AC-29). Row 1 wins over everything: "off" is never overridden by
 * the organisation (parent D-9, P2-AC-16). While the organisation
 * forbids personal keys, no personal key, stored or submitted, is ever
 * sent (owner O-12), and nobody is moved onto the organisation's
 * configuration (spec P2-D2, current default, pending the owner): a
 * caller on their own or a removed provider answers row 10 or 11 and
 * nothing is sent until they choose `organization` (patchSettings) and
 * confirm. The caller's stored choice and keys are not rewritten, so
 * allowing personal keys again puts the caller back in row 2 or 3.
 * `organization_unconfirmed` means the caller can turn AI on in one step
 * by confirming (owner O-13; nothing is sent before);
 * `personal_keys_forbidden` with `enablers: [user]` (row 10) means the
 * caller can turn AI on by choosing "Use my organisation's AI", which
 * shows the O-13 notice and confirms. Only rows 2 and 4 send anything. A stored `bedrock`,
 * `azure_openai` or `vertex` choice is a supported provider: with no key
 * bound it is `needs_key`, never a removed-provider reason (spec D-17).
 * 
 * A probe can also give `personal_keys_forbidden` with `enablers:
 * [organization_admin]` when it names a provider or carries a key while
 * the organisation forbids personal keys (see testLLMConnection).
 * Carries no key, and nothing about any key beyond the facts above.
 * Before Part 2 only `off`, `needs_key`, `nothing_configured` and
 * `provider_removed` occurred, always with `enablers: [user]`.
 */
export type AINotConfigured = {
  reason: ("off" | "needs_key" | "organization_unconfirmed" | "nothing_configured" | "provider_removed_organization_available" | "provider_removed" | "personal_keys_forbidden");
  /**
   * Present exactly when `reason` is `needs_key`; the provider that needs a key.
   */
  provider?: ("openai" | "anthropic" | "azure_openai" | "bedrock" | "vertex");
  /**
   * Who can turn AI on for this caller, by the table above: `user` (the caller, in Settings or by confirming) and/or `organization_admin` (an administrator of the caller's organisation, who can change its configuration with PAC-50's proof). `organization_admin` appears only for a caller who belongs to an organisation. It is the ONLY value in row 11, in row 6 when the organisation forbids personal keys, and in a probe refused for naming a personal provider or key while forbidden. Never names a person. (Before Part 2 it was `[user]` in every answer.)
   */
  enablers: Array<("user" | "organization_admin")>;
  /**
   * A sentence for the user saying why the configuration decided on cannot be used and who can fix it. When that configuration is the caller's saved choice (parse, brief refresh, the settings read, and a probe that names no other choice and carries no `llmApiKey`) it says that AI features are off. When a probe named a different choice or carried `llmApiKey`, it describes only the probed choice ("Anthropic needs an API key") and never says AI features are off, which may be false for the caller (see `testLLMConnection`). For `organization_unconfirmed` it says that the caller's text and meeting details would be sent to their organisation's AI provider account, which its administrators can access outside Paceday, and that nothing is sent until they confirm in Paceday (owner O-13). For `personal_keys_forbidden` with `enablers: [user]` (row 10) it says the organisation does not allow personal keys, that the caller's own provider and key are kept but not used, and to choose "Use my organisation's AI" in Settings (spec P2-AC-18). No message, in any row, contains the words "read", "reads" or "see" (spec P2-AC-26). Wording is not contractual beyond that, and it never carries a key.
   */
  message: string;
}
/**
 * NEW-llm-bring-your-own. Read-only summary on the settings document of whether AI works for the caller right now, by the same table as `AINotConfigured` (spec AC-8). Exactly one of `provider` and `notConfigured` is present: `provider` (with `configuration`) exactly when `configured` is true, `notConfigured` exactly when `configured` is false (rows 1, 3, 5-8, 10, 11), so a client always has the reason and the enablers to render the notice of spec AC-21. Also the 200 of confirmOrganizationAI (Part 2). It does not check the destination: a configured caller whose stored destination is refused is `configured: true` and gets the 422 / refusal sentence when a request is attempted.
 */
export type AIStatus = {
  /**
   * True exactly in rows 2 and 4 (row 9 is reserved).
   */
  configured: boolean;
  /**
   * Present exactly when `configured` is true; the provider requests go to.
   */
  provider?: ("openai" | "anthropic" | "azure_openai" | "bedrock" | "vertex");
  /**
   * NEW-llm-bring-your-own Part 2. Present exactly when `configured` is true: `own` in row 2 (the caller's provider, key and destination), `organization` in row 4 (the organisation's at the confirmed version, and nothing of the caller's, parent D-18).
   */
  configuration?: ("own" | "organization");
  /**
   * Whether the caller belongs to an organisation. Lets a client offer "use my organisation's AI" only to a member (spec AC-21; Part 2). Says nothing else about the organisation.
   */
  inOrganization: boolean;
  notConfigured?: AINotConfigured;
}
/**
 * POST /api/events/{id}/conference.
 */
export type AddEventConferenceRequest = {
  /**
   * Lowercased and trimmed. `custom` and `google_meet` are handled inline; `zoom` and `teams` go through the provider factory; anything else is a 400 from the factory.
   */
  provider: ("google_meet" | "zoom" | "teams" | "custom");
  /**
   * Required (non-empty after trimming) when provider is `custom`, ignored for every other provider. Never validated as a URL by the backend.
   */
  url?: string;
}
/**
 * 1:1 cadence. "none" disables gap detection for that member.
 */
export type Cadence = ("weekly" | "biweekly" | "monthly" | "custom" | "none")
export type AddManagerMemberRequest = ({
  /**
   * Lowercased and trimmed, then validated with net/mail.ParseAddress; the parsed address must equal the normalized input, so display-name forms like "A <a@b.com>" are rejected.
   */
  email: string;
  /**
   * Trimmed. When blank, defaults to the local part of the email.
   */
  display_name?: string;
  cadence?: Cadence;
  /**
   * Required iff cadence == "custom"; must be absent/null otherwise.
   */
  cadence_custom_days?: (number | null);
} & Record<string, unknown>)
/**
 * api.breakdownEntry. Exactly 5 entries in a fixed order, with fixed colors:
 * meeting #FF6B6B, focus #5B7FFF, habit #9B7AE0, personal #E9B949, free #B0BEC5.
 */
export type AnalyticsBreakdownEntry = {
  category: ("meeting" | "focus" | "habit" | "personal" | "free");
  minutes: number;
  /**
   * A percentage where 100 means the whole of `total_working_minutes` (PAC-42: the same scale as `habit_completion_rate` and `focus_score` in the same response): `minutes / total_working_minutes * 100`, or 0 when total is 0. Not rounded. No maximum is declared because the value is not bounded by 100: the total counts Monday–Friday working windows only, while meeting and personal minutes count every timed event in the seven days at any hour. buffer_minutes is excluded from the breakdown, so the five percentages need not sum to 100.
   */
  percentage: number;
  color: string;
}
/**
 * One entry of GET /api/analytics/meetings. Built as an ad-hoc `map[string]any` in
 * `AnalyticsEngine.WeekMeetings`; these four keys are always present.
 */
export type AnalyticsMeeting = {
  /**
   * The calendar event summary. Empty string for an untitled event.
   */
  title: string;
  duration_minutes: number;
  attendee_count: number;
  /**
   * RFC3339, in the offset the calendar returned.
   */
  start_time: string;
}
export type AnalyticsRecomputeAck = { status: "recompute accepted" }
/**
 * storage.MeetingTitle — one entry of `top_meeting_titles` (top 5 by duration).
 */
export type MeetingTitle = { title: string, duration_minutes: number }
/**
 * One item of GET /api/analytics/trends. Same fields as AnalyticsWeekWithBreakdown,
 * in the same formats and on the same scales, minus `breakdown` (PAC-42).
 */
export type AnalyticsWeekRow = {
  id: string;
  user_id: string;
  /**
   * The calendar date of the Monday the week starts on, `YYYY-MM-DD` (e.g. "2025-01-06"), with no time of day and no zone: the stored DATE value. Same format as AnalyticsWeekWithBreakdown.week_start, so the two are equal strings for the same week (PAC-42, API-055; this was an RFC3339 timestamp before). Never the zero date "0001-01-01" (PAC-42 fixes the read path that produced it).
   */
  week_start: string;
  total_working_minutes: number;
  meeting_minutes: number;
  focus_minutes: number;
  habit_minutes: number;
  /**
   * Always 0 for engine-computed weeks (open defect API-057); see AnalyticsWeekWithBreakdown.buffer_minutes.
   */
  buffer_minutes: number;
  personal_minutes: number;
  free_minutes: number;
  meeting_count: number;
  focus_block_count: number;
  /**
   * A percentage where 100 means every counted habit occurrence was completed (PAC-42, API-058; reported unscaled before PAC-42): `completed / (scheduled + completed) * 100`, 0 when there are none, not rounded. Equal to the single-week value for the same stored week. Rows stored before PAC-42 are reported on this scale too: storage keeps the unscaled ratio for every week and the multiplication by 100 is applied on read (spec D-3).
   */
  habit_completion_rate: number;
  largest_focus_block_minutes: number;
  /**
   * `[]` when the week has no titles, including when the JSONB column holds `null` or fails to unmarshal (PAC-28).
   */
  top_meeting_titles: Array<MeetingTitle>;
  /**
   * A percentage where 100 means all focus and meeting time was focus; same computation and range as AnalyticsWeekWithBreakdown.focus_score.
   */
  focus_score: number;
  estimated_meeting_cost_minutes: number;
  computed_at: string;
}
/**
 * Response of GET /api/analytics/week. The same fields as AnalyticsWeekRow, in the
 * same formats and on the same scales, plus `breakdown` (PAC-42).
 */
export type AnalyticsWeekWithBreakdown = {
  id: string;
  user_id: string;
  /**
   * The calendar date of the Monday the week starts on, `YYYY-MM-DD` (e.g. "2025-01-06"), with no time of day and no zone: the stored DATE value. Same format as AnalyticsWeekRow.week_start, so the two are equal strings for the same week (PAC-42, API-055). Never the zero date "0001-01-01" (PAC-42 fixes the read path that produced it).
   */
  week_start: string;
  /**
   * Sum of the configured work windows Mon–Fri. Falls back to 2400 (480×5) when it computes to ≤0 and the working-hours mode is not "by_day".
   */
  total_working_minutes: number;
  meeting_minutes: number;
  focus_minutes: number;
  habit_minutes: number;
  /**
   * Always 0 for engine-computed weeks: AnalyticsEngine.compute never sets it, so every write path stores 0. This is open defect API-057 (docs/factory/api-audit.md), not intended behaviour; computing it is out of PAC-42's scope (spec D-5, pending owner confirmation, OQ-8). The column round-trips through storage, so a row written by other means would report its stored value.
   */
  buffer_minutes: number;
  /**
   * Calendar events with zero attendees.
   */
  personal_minutes: number;
  /**
   * total_working − meeting − focus − habit − personal, floored at 0.
   */
  free_minutes: number;
  meeting_count: number;
  focus_block_count: number;
  /**
   * A percentage where 100 means every counted habit occurrence was completed (PAC-42, API-058: the same scale as `focus_score` and `breakdown[].percentage` in this response): `completed / (scheduled + completed) * 100` over the week's occurrences. 0 when there are none. Not rounded. Storage keeps the unscaled ratio; the multiplication by 100 is applied when the response is built (spec D-3).
   */
  habit_completion_rate: number;
  largest_focus_block_minutes: number;
  top_meeting_titles: Array<MeetingTitle>;
  /**
   * A percentage where 100 means all focus and meeting time was focus: `focus*100/(focus+meeting)` (integer division) clamped to ≤100; 50 when both are 0.
   */
  focus_score: number;
  /**
   * Sum over meetings of duration × attendee count (person-minutes).
   */
  estimated_meeting_cost_minutes: number;
  computed_at: string;
  breakdown: Array<AnalyticsBreakdownEntry>;
}
/**
 * calendar.AttendeeSuggestion. Both keys are always emitted (no omitempty); `name` is "" when Google supplied no display name.
 */
export type AttendeeSuggestion = {
  /**
   * Original casing from the Google event, not the lowercased dedupe key.
   */
  email: string;
  name: string;
}
/**
 * storage.AuditEntry. One recorded action, always about the calling user's own calendar or, since PAC-67, one of the calling user's own provider connections (Outlook, Zoom, Google; the three connection kinds of `action`) — the subject is the scoping predicate and is deliberately NOT echoed back as a field, because it is the same value on every entry of every response (see contracts/features/PAC-23.md §2, rejected alternative A).
 */
export type AuditEntry = {
  /**
   * `audit_log.id`, declared `SERIAL` at backend/storage/migrations/001_initial.up.sql:45 — a 32-bit signed sequence. `storage.AuditEntry.ID` is a Go `int64` (backend/storage/audit_log.go:18), but that widening is a Go type choice, not a range the table can reach, so `int64` here would over-declare the server. `int32` is declared instead because the sole consumer coerces with `Number(e.id)` (smart-calendar-flow/src/api/client.ts:448, inside `normalizeAuditEntries`) and uses the result as a React list key (src/pages/Audit.tsx:95): every `int32` is exactly representable as a JS number, so the coercion is lossless and keys stay distinct. Values above 2^53 would collide into one key and drop rows — the table cannot produce them, and this declaration is what keeps that true for a generated client.
   */
  id: number;
  /**
   * What was recorded. Underscore-separated, lower-case; there is no dotted key convention on this endpoint and never was.
   * 
   * This is the complete set the server can emit, enumerated from every `storage.WriteAuditLog` call site in `backend/` (the action argument is a string literal at all seven, and `storage.WriteAuditLog`, in backend/storage/focus_blocks.go, holds the only INSERT against the table): `focus_created` (`FocusTimeEngine.RunForUser`, backend/engine/focus_time.go), `focus_cleared` (`FocusTimeEngine.ClearWeek`, backend/engine/focus_time_cleaner.go), `meeting_scheduled` (`SmartScheduler.CreateMeeting`, backend/engine/smart_schedule.go), `meeting_moved` (`CompressionEngine.Apply`, backend/engine/compression.go), `meeting_created` (`scheduleHandlers.createMeeting`, backend/api/handlers_schedule.go), `nlp_parsed` (`NLPService.Parse`, backend/nlp/parser.go), `nlp_confirmed` (`nlpHandlers.confirm`, backend/api/handlers_nlp.go). Cited by enclosing function rather than line because this text is emitted into generated files in both repos; the falsifying command is `grep -rn 'WriteAuditLog(' --include='*.go' backend/ | grep -v _test.go`, which returns the definition and exactly these seven call sites. PAC-67 adds three kinds, none of which redefines the seven above: they are written by the credential lifecycle, not by a scheduling feature, and their writers are named by the PAC-67 plan: `connection_lost` (the provider permanently refused renewing the subject's credential; one per loss, see the operation description), `provider_disconnected` (the subject disconnected Outlook or Zoom), and `revocation_unconfirmed` (a revocation sent to the provider on that disconnect was not confirmed, or could not be attempted; Zoom only). After PAC-67 the falsifying command above must return these writers as well. No test checks this enum against the writers today (none exists in backend/api or backend/storage; contract challenge, non-blocking); the PAC-67 backend stage ADDS one covering all ten (manifest CONTRACT-6).
   * 
   * The enum is closed on purpose. `audit_log.action` is an unconstrained `TEXT` column, so the set is held by this contract rather than by the database: adding an eighth action is a contract change, and once the PAC-67 enum test exists a writer added without one makes it fail, which is the intended alarm. Spec AC-14 requires that this set never shrinks.
   * 
   * Because the body of the 200 is an array of this schema, a value outside this enum makes the WHOLE response non-conforming, not just the one row — one operator `INSERT`, one writer added without a contract change, or one restored backup, and a validating consumer rejects six good rows along with the odd one. That is the intended alarm in a test and the wrong behaviour in a UI, so the expected handling is stated rather than left to each consumer: **render the row, substituting a placeholder such as `unknown` for the unrecognised value, rather than discarding the response.**
   * 
   * No consumer implements that today, and the correction matters because an earlier revision of this paragraph claimed one did. The shipped client's normaliser is `action: typeof e.action === "string" && e.action ? e.action : "unknown"` (smart-calendar-flow/src/api/client.ts:451, inside `normalizeAuditEntries`). It substitutes `unknown` only for an action that is MISSING, NON-STRING or EMPTY; an unrecognised non-empty string — `focus.run`, `weird_action` — passes through verbatim. The row still renders, but for a different reason: that client's `AuditEntry` is hand-written with `action: string` (smart-calendar-flow/src/api/types.ts:224, in the interface at `:222-227`), so nothing validates against this enum at all. A stage-4 frontend implementer must not read this paragraph as describing work already done. The generated zod schema factory §4 mandates exists — `src/api/generated/schemas.ts` exports `AuditEntry = z.strictObject(…)` with `action: z.enum([…])` over exactly these seven values, committed since smart-calendar-flow #87 (2026-10-10) and regenerated after every contract merge — and is not applied to the audit path: the only import from `generated/schemas` in that repo is `SettingsUpdate` (`src/api/client.ts:2`). The day it is applied to `getAudit`, an out-of-enum value is a thrown validation error and the whole response is lost, which is the case this paragraph is for.
   * 
   * It names WHAT happened, not WHO did it. Every entry's subject is the calling user (see the operation description); no entry carries an actor, and no value in this enum distinguishes an action a person took from one the scheduler took on their behalf.
   */
  action: ("focus_created" | "focus_cleared" | "meeting_scheduled" | "meeting_moved" | "meeting_created" | "nlp_parsed" | "nlp_confirmed" | "connection_lost" | "provider_disconnected" | "revocation_unconfirmed");
  /**
   * Scanned from the DB into a Go `string`, so on the wire this is ALWAYS a JSON string — even when the text inside it happens to be JSON. A generator should emit `string`, and that is correct and complete for the transport.
   * 
   * Whether the text inside parses as JSON depends on which `action` produced it, so the useful statement is per-writer rather than a blanket warning. ALWAYS VALID JSON: `focus_created` and `focus_cleared` marshal a map with `encoding/json` (`FocusTimeEngine.RunForUser` in backend/engine/focus_time.go, `FocusTimeEngine.ClearWeek` in backend/engine/focus_time_cleaner.go); `nlp_parsed` uses `fmt.Sprintf` with `%q`, which escapes (`NLPService.Parse`, backend/nlp/parser.go); and the three PAC-67 connection kinds, which marshal a struct with `encoding/json` and hold only server-chosen values: `connection_lost` is `{"provider":"outlook"|"zoom"|"google"}`, `provider_disconnected` is `{"provider":"outlook"|"zoom","revocation": "confirmed"|"unconfirmed"|"not_offered"}` (the `revocation` vocabulary of `ProviderDisconnectResult`), and `revocation_unconfirmed` is `{"provider":"zoom"}`. No token material and no actor-supplied text ever appears in them. NOT GUARANTEED: `meeting_scheduled`, `meeting_created`, `meeting_moved` and `nlp_confirmed` are built by concatenating values into a JSON literal with no escaping (`SmartScheduler.CreateMeeting` in backend/engine/smart_schedule.go, `scheduleHandlers.createMeeting` in backend/api/handlers_schedule.go, `CompressionEngine.Apply` in backend/engine/compression.go, `nlpHandlers.confirm` in backend/api/handlers_nlp.go). Sites are cited by enclosing function, not line, for the reason given in the operation description; `grep -rn 'WriteAuditLog(' --include='*.go' backend/` shows all seven argument expressions on one line each.
   * 
   * The interpolated value differs by site and so does the severity. In `SmartScheduler.CreateMeeting` and `scheduleHandlers.createMeeting` it is a meeting title from the request body, so a title containing `"`, `\` or a newline yields malformed JSON. In `CompressionEngine.Apply` there is no title: the values are a client-supplied `event_id`, copied unvalidated from the request body (`scheduleHandlers.applyCompress`, backend/api/handlers_schedule.go:80-93 — the timestamps are parsed, the id is not touched), and an RFC3339 timestamp — so a caller can write JSON STRUCTURE, not merely a stray quote, into its own row. In `nlpHandlers.confirm` the value is a Google-issued event id, which in practice contains no JSON metacharacter; the construction is the same defect, the input simply is not attacker-controlled.
   * 
   * Consequence for a consumer: parse the four safe actions if you want to; for the other four, treat the value as opaque text, as the shipped client does (`formatAuditDetails`, smart-calendar-flow/src/api/client.ts:426-435, never calls JSON.parse). PAC-23 does not fix the concatenation — it is docs/specs/PAC-23.md OQ-6, and the spec challenge argues for splitting the escaping defect out of it. When that lands, the NOT GUARANTEED list empties and this description loses two paragraphs.
   */
  details: string;
  created_at: string;
}
/**
 * Assembled from map[string]interface{} literals in authHandlers.status —
 * all three keys are always emitted (no omitempty).
 */
export type AuthStatusResponse = {
  /**
   * Whether the caller's calendar connection for `provider` is usable
   * (PAC-67): stored, and not recorded as lost after a permanent
   * refusal of its renewal. See `getAuthStatus`.
   */
  connected: boolean;
  /**
   * Settings.calendar_provider, defaulting to "google" when blank. The
   * error/fallback paths also report "google", so "google" does not prove
   * Google was configured.
   */
  provider: ("google" | "outlook" | "webcal");
  /**
   * For outlook/webcal this is the caller's own settings.calendar_email
   * verbatim. For google it is the caller's own account email: the Google
   * token is stored by the sign-in callback against the user it upserted by
   * that same Google email, so they are the same account. No outbound call
   * is made (PAC-65; before it, this was fetched live from Google's
   * userinfo endpoint with the caller's access token on every request).
   * Before PAC-24 the outlook/webcal value came from the shared settings
   * row and was therefore some other user's address (API-009).
   */
  email: string;
}
/**
 * Shared error envelope written by api.writeError (handlers_settings.go:388): Content-Type application/json, body `{"error": "<message>"}`. The one exception in this domain is the requireAuth 401 (text/plain). Every 5xx, including the Zoom OAuth callback's, is this envelope (PAC-21).
 */
export type BookingError = {
  /**
   * Human-readable, server-chosen message. Never the text of a Go, driver or provider error (PAC-21): those go to the server log and Sentry only.
   */
  error: string;
}
/**
 * The `BookingError` envelope with its one possible message pinned, so a client can tell a rate-limit refusal from every other error by status and body alone (NEW-booking-rate-limit). Written by api.writeError.
 */
export type BookingRateLimitError = { error: "rate limit exceeded" }
/**
 * engine.CadenceGap.
 */
export type CadenceGap = {
  member_email: string;
  display_name: string;
  cadence: Cadence;
  last_one_on_one_at: (string | null);
  /**
   * last_one_on_one_at plus the cadence interval; now when the member was never met. Monthly uses calendar-month arithmetic; the rest use day addition.
   */
  next_expected_by: string;
  /**
   * 0 when the next 1:1 is still upcoming within the 7-day warning window; positive when already past due. Never negative — upcoming-ness is not encoded here.
   */
  days_overdue: number;
}
export type CadenceGapList = { gaps: Array<CadenceGap> }
/**
 * Body of `disconnectCalendar`'s 409 (PAC-35, spec D-8): the caller's
 * calendar is not Google, disconnect for that kind of calendar is not
 * implemented, and nothing was deleted. `error` keeps the shared
 * `{error}` member so a client that only shows `data.error` still shows a
 * true sentence.
 */
export type CalendarDisconnectUnsupported = {
  error: "disconnecting this kind of calendar is not available yet";
  /**
   * The caller's calendar provider, as `getAuthStatus` reports it.
   */
  provider: ("outlook" | "webcal");
}
/**
 * api.attendeeDTO.
 */
export type CalendarEventAttendee = {
  email: string;
  /**
   * Google `displayName`. Omitted when empty.
   */
  name?: string;
  /**
   * Mapped from Google `responseStatus`. Anything other than accepted/declined/tentative — including Google's `needsAction` and an empty value — collapses to `pending`. Because `pending` is a non-empty string it is always emitted despite the omitempty tag.
   */
  rsvp?: ("accepted" | "declined" | "tentative" | "pending");
  /**
   * Omitted when false.
   */
  organizer?: boolean;
}
/**
 * api.conferenceDTO. Populated from `hangoutLink` first; otherwise from the conferenceData entry point or the Paceday-private extended properties.
 */
export type CalendarEventConference = {
  /**
   * `google_meet` when derived from a Google hangout link or conference entry point, otherwise whatever string was stored in the event's private extended properties by the conferencing handlers (e.g. `zoom`, `custom`). Not constrained by an enum in Go.
   */
  provider: string;
  url: string;
  /**
   * "Google Meet" for hangout links, otherwise the provider string uppercased (e.g. "ZOOM", "CUSTOM"). Omitted when empty.
   */
  label?: string;
}
/**
 * api.calendarEventDTO, built by toCalendarEventDTO — the flattened event shape returned by GET /api/calendar/events (one per array element) and, since PAC-29, as the whole 200 body of PATCH /api/events/{id}, POST /api/schedule/create and POST /api/nlp/confirm. One converter, so the four operations cannot disagree about the same event.
 */
export type CalendarEvent = {
  /**
   * Google Calendar event id. Always present as a key; may be "".
   */
  id: string;
  /**
   * Google `summary`. Always present as a key; may be "".
   */
  title: string;
  /**
   * Either an RFC3339 date-time (timed event, Google `start.dateTime`, preserving the event's original UTC offset) OR a bare `YYYY-MM-DD` date (all-day event, Google `start.date`). Callers must handle both. Empty string when Google returned no start at all.
   */
  start: string;
  /**
   * Same dual format as `start`. For all-day events this is the exclusive end date.
   */
  end: string;
  /**
   * Hex colour mapped from Google's numeric `colorId` via a fixed 11-entry table. Omitted when the event has no colorId or an unrecognised one.
   */
  color?: ("#7986CB" | "#33B679" | "#8E24AA" | "#E67C73" | "#F6BF26" | "#F4511E" | "#039BE5" | "#3F51B5" | "#0B8043" | "#D50000" | "#616161");
  /**
   * Attendee emails with room resources (`*@resource.calendar.google.com`) removed. Omitted entirely when the event has no non-resource attendees.
   */
  attendees?: Array<string>;
  /**
   * Parallel to `attendees`, same ordering and same filtering. Omitted when empty.
   */
  attendee_details?: Array<CalendarEventAttendee>;
  /**
   * Declared on the DTO with `omitempty` but NEVER SET by toCalendarEventDTO, so it is always omitted from every response that carries this schema (the events list and, since PAC-29, PATCH /api/events/{id}, POST /api/schedule/create and POST /api/nlp/confirm).
   */
  is_personal_block?: boolean;
  /**
   * Omitted when empty.
   */
  description?: string;
  /**
   * Omitted when empty.
   */
  location?: string;
  conference?: CalendarEventConference;
}
/**
 * The JSON error envelope for "this user has no calendar connected". The message is a single fixed value so a client can branch on it.
 */
export type CalendarNotConnectedError = { error: "calendar not connected" }
/**
 * calendar.Room — only two fields exist server-side.
 */
export type CalendarRoom = {
  /**
   * The Google resource calendar id, which is also the room's bookable email address (contains `resource.calendar.google.com`).
   */
  id: string;
  /**
   * The calendar list entry's `summary`.
   */
  name: string;
}
/**
 * The anonymous struct in api.applyRequest. snake_case, and only these three fields are read - unknown members are ignored by encoding/json.
 */
export type CompressionApplyProposal = (Partial<{
  event_id: string;
  /**
   * RFC3339. Unparseable -> the proposal lands in `failed`, no error.
   */
  proposed_start: string;
  proposed_end: string;
}> & Record<string, unknown>)
export type CompressionApplyRequest = (Partial<{ proposals: Array<CompressionApplyProposal> }> & Record<string, unknown>)
/**
 * Literal map with keys `applied` and `failed`.
 */
export type CompressionApplyResult = {
  /**
   * Event ids the engine moved.
   */
  applied: Array<string>;
  /**
   * Mixed contents: handler-side entries read `"<event_id>: invalid time format"`, engine-side entries are appended verbatim by Compressor.Apply.
   */
  failed: Array<string>;
}
/**
 * Both fields optional; `week` takes precedence over `date` when non-empty. The whole body is optional too: absent, empty or `null` is treated as `{}`. Any other body that does not decode into this object is a 400 `invalid JSON` (PAC-36, API-035; the decode error was discarded before).
 */
export type CompressionRequest = (Partial<{
  /**
   * `YYYY-MM-DD`. Used only when `week` is empty. Default: today.
   */
  date: string;
  /**
   * `YYYY-MM-DD`. Snapped back to that week's Monday by startOfWeek(), then Mon..Fri (5 days) are evaluated.
   */
  week: string;
}> & Record<string, unknown>)
/**
 * engine.MoveProposal - the RESPONSE shape (camelCase).
 */
export type MoveProposal = { eventId: string, eventTitle: string, currentStart: string, currentEnd: string, proposedStart: string, proposedEnd: string, reason: string, focusGainMinutes: number }
/**
 * engine.CompressionResult. camelCase.
 */
export type CompressionResult = {
  /**
   * `YYYY-MM-DD` as produced by the engine.
   */
  date: string;
  proposals: Array<MoveProposal>;
  totalFocusGainMinutes: number;
}
/**
 * backend/conference/provider.go Details. camelCase json tags, unlike every other response in this domain.
 */
export type ConferenceMeetingDetails = {
  /**
   * A literal set by the concrete provider (U-12, resolved by PAC-67 from backend/conference: `MeetProvider.CreateMeeting` writes "meet", `ZoomProvider.CreateMeeting` "zoom", `TeamsProvider.CreateMeeting` "teams"; `grep -n 'Provider:' backend/conference/*.go` shows the three). Note "meet", not "google_meet": this is not the `ConferenceProviderStatus.provider` vocabulary.
   */
  provider: ("meet" | "zoom" | "teams");
  /**
   * Always present (no omitempty). The join URL for zoom and teams. For meet it is the EMPTY STRING: `MeetProvider` creates nothing (a Meet link is minted by Google Calendar on event creation), so the standalone create with a `meet` conferencing provider answers `{"provider":"meet","joinUrl":""}`. Because of that the earlier `format: uri` was not true of every response and is removed (U-12, factory section 7.2).
   */
  joinUrl: string;
  /**
   * Omitted when empty (always omitted for meet).
   */
  meetingId?: string;
  /**
   * Omitted when empty.
   */
  password?: string;
}
/**
 * backend/api/handlers_conferencing.go conferenceProviderStatus.
 */
export type ConferenceProviderStatus = {
  provider: ("google_meet" | "zoom" | "teams" | "custom");
  /**
   * Always present. `custom` is hardcoded to true. Since PAC-67 the other rows mean USABLE (see `listConferenceProviders`), with these predicates over the caller's own credentials: `google_meet`, a Google token row is stored AND no loss of it is recorded; `zoom`, a stored Zoom credential decodes AND holds a refresh token AND no loss of it is recorded; `teams`, a stored Microsoft credential decodes AND holds a refresh token AND no loss of it is recorded, the same predicate as `getAuthStatus` for an Outlook calendar provider. Before PAC-67 `zoom` was true for any non-blank stored value (including one that does not decode) and `teams` for any stored Microsoft credential, with or without a refresh token, which could report a credential that can never be renewed as connected (contract challenge finding 5).
   */
  connected: boolean;
  /**
   * Set only for google_meet (the configured calendar email); omitted when empty.
   */
  email?: string;
  /**
   * json `enabled,omitempty` on a bool, so `false` is OMITTED entirely - the key only ever appears as `true`, and only for teams. Absence must be read as false. Since PAC-67 it follows teams' `connected` exactly (same predicate): a lost, disconnected or never-renewable (no refresh token) Microsoft credential omits it, so no field of the row reports Teams usable (spec PAC-67 section 4 preamble).
   */
  enabled?: boolean;
  /**
   * "google" for google_meet, "outlook" for teams. Omitted for zoom and custom.
   */
  auto_with?: ("google" | "outlook");
}
/**
 * POST /api/conference/create. Since PAC-67 (API-052) all three fields are required and validated before any provider is called; a body that fails is the 400 "invalid body". Before PAC-67 every field silently defaulted to the Go zero value when absent and was forwarded to the provider.
 */
export type CreateConferenceRequest = {
  /**
   * Must contain at least one character that is not whitespace in the ECMA-262 `\s` sense. `pattern` states exactly the test the server applies (see `createConferenceLink`), so a blank title such as "   " cannot be expressed by a client that validates against this schema.
   */
  title: string;
  /**
   * `0001-01-01T00:00:00Z` (Go's zero time) is refused with the 400 "invalid body", like an absent `start`: the server cannot tell the two apart.
   */
  start: string;
  /**
   * Must be strictly after `start`.
   */
  end: string;
}
/**
 * Anonymous request body of POST /api/book/{slug}. `name`, `email` and `start` are required by the handler; `end`, `duration` and `duration_minutes` are three overlapping ways to express the length.
 */
export type CreatePublicBookingRequest = {
  /**
   * Trimmed; must be non-empty after trimming.
   */
  name: string;
  /**
   * Trimmed; must be non-empty after trimming. Never validated as an email address.
   */
  email: string;
  /**
   * RFC3339. Must be at least `min_notice_minutes` in the future, else 422.
   */
  start: string;
  /**
   * RFC3339, optional. When present it wins: the resulting length must equal `duration`/`duration_minutes` if either was also sent, else 400. When absent, end = start + resolved duration.
   */
  end?: string;
  /**
   * Free text; no length limit enforced.
   */
  notes?: string;
  /**
   * Minutes. Takes precedence over `duration_minutes` when both are sent. This is the field the frontend actually populates.
   */
  duration?: (number | null);
  /**
   * Minutes. Overridden by `duration` when both are present. When neither is sent and `end` is absent, the length falls back to durations[0] (else 30). The resolved value must be in the link's duration set, else 400.
   */
  duration_minutes?: (number | null);
}
/**
 * backend/api/handlers_scheduling_links.go schedulingLinkInput. Several fields have two accepted spellings; the canonical one wins when both are sent. Nothing is required at the JSON level, but validation rejects an empty title.
 */
export type CreateSchedulingLinkRequest = Partial<{
  /**
   * Trimmed. Required in effect - an empty title is a 422.
   */
  title: string;
  /**
   * Normalised to lowercase alphanumerics and dashes. When it normalises to the empty string a slug is generated from the owner's name plus the first duration.
   */
  slug: string;
  /**
   * Canonical spelling. Wins over `durations`. Defaults to [30] when both are absent (a present-but-empty array is a 422).
   */
  duration_options: Array<number>;
  /**
   * Alias for duration_options, used only when duration_options is absent.
   */
  durations: Array<number>;
  /**
   * Canonical spelling, 0=Sunday..6=Saturday. Wins over `days`. Defaults to [1,2,3,4,5] when both are absent.
   */
  days_of_week: Array<number>;
  /**
   * Alias for days_of_week, used only when days_of_week is absent. Accepts "mon"/"monday"/"1" etc, case-insensitive; unrecognised entries are silently dropped, which can turn a non-empty list into a 422 "at least one day".
   */
  days: Array<string>;
  /**
   * Canonical spelling. "HH:MM" or "HH:MM:SS". Defaults to "09:00".
   */
  window_start_time: string;
  /**
   * Alias, used only when window_start_time is empty.
   */
  window_start: string;
  /**
   * Canonical spelling. "HH:MM" or "HH:MM:SS". Defaults to "17:00".
   */
  window_end_time: string;
  /**
   * Alias, used only when window_end_time is empty.
   */
  window_end: string;
  buffer_before: number;
  buffer_after: number;
  min_notice_minutes: number;
  /**
   * Lowercased and trimmed before validation; an empty string becomes `reusable`.
   */
  usage_type: ("reusable" | "recurring" | "single_use");
  /**
   * Required and must be positive when usage_type is `recurring`. Ignored (forced to null) otherwise.
   */
  max_uses: (number | null);
  /**
   * Emails are lowercased and trimmed, then resolved to existing accounts and added as `pending` hosts. Addresses with no account are skipped silently - the response gives no indication that an invite was dropped.
   */
  co_host_emails: Array<string>;
}>
/**
 * storage.Org (backend/storage/orgs.go).
 */
export type OrgSummary = { id: string, name: string, domain: string, createdAt: string }
/**
 * storage.User (backend/storage/users.go) serialized directly.
 */
export type CurrentUserResponse = {
  id: string;
  email: string;
  name: string;
  /**
   * The user's picture URL. In the current-user read (`getCurrentUser`)
   * this is the only name for it; clients read it as `avatarUrl`, not
   * `avatar` (PAC-35, API-065: the web app read it as `avatar`, or not at
   * all). Scheduling-link and booking hosts carry the same stored value
   * as `avatar_url` (`SchedulingLinkHost`, `PublicHost`), unchanged by
   * PAC-35. May be the empty string. Every sign-in overwrites it: Google
   * writes the Google picture, Microsoft and SSO always write "" (so a
   * Microsoft or SSO sign-in clears a picture an earlier Google sign-in
   * stored). Not omitempty, so the key is always present.
   */
  avatarUrl: string;
  /**
   * The provider of the user's FIRST sign-in: set when the row is
   * inserted and never updated (UpsertUser's ON CONFLICT does not touch
   * `provider`), so a user who first signed in with Google and later
   * with Microsoft still reads "google".
   * Closed by PAC-35 (U-13): `users.provider` has no CHECK constraint
   * (migration 006, `TEXT NOT NULL DEFAULT 'google'`), but its only
   * writer is storage.UpsertUser, and every call site in the history
   * of the repository passes one of these three literals
   * (handlers_auth.go "google", handlers_microsoft_auth.go "microsoft",
   * handlers_sso.go "sso"; tests and the e2e seed write "google").
   * A CHECK constraint is not added (spec PAC-35 section 7: no
   * migration).
   */
  provider: ("google" | "microsoft" | "sso");
  org?: OrgSummary;
  createdAt: string;
}
/**
 * api.recapSettingsBody. A property absent means "leave unchanged"; a property present is applied.
 * PAC-24 makes two changes to what this document permits, both to align it with PATCH /api/settings. `null` is no longer accepted anywhere: the Go fields are pointers, so `null` used to be indistinguishable from an omission, which meant a client that meant to clear something and a client with a serialisation bug got the same silent success. And an unknown property is now rejected rather than ignored, which is how a caller learns it has misspelt one of these seven snake_case names.
 */
export type DailyRecapPatch = Partial<{
  enabled: boolean;
  /**
   * `HH:MM`. PAC-24 validates it; before that an unparseable value reached the Postgres TIME cast during the save and surfaced as a 500 `db error`.
   */
  send_time: string;
  /**
   * Anything else -> 400 (text/plain).
   */
  send_to: ("dm" | "channel");
  channel_id: string;
  include_briefs: boolean;
  include_focus_blocks: boolean;
  include_habits: boolean;
}>
/**
 * engine.slackBlock is `map[string]interface{}` - an untyped Slack Block Kit object. Nested values are themselves slackBlocks or arrays of them.
 * Resolves U-20 by reading engine/daily_recap.go end to end. Every top-level block this API can emit is built by DailyRecapService.BuildMessage (`:150-236`), buildSummaryBlock (`:238-262`) or buildMeetingBlocks, and the complete set of top-level `type` values is `header`, `context`, `section`, `divider`. The only nested text object types are `plain_text` and `mrkdwn`.
 * `additionalProperties` stays `true`: the member set of a block varies by type (`text`, `elements`, `emoji`), the Go type is a bare map, and pinning the members would be a stricter claim than the code supports. The `type` enum is the part that was actually determinable, and it is the part a client switches on. PAC-24 changes none of this behaviour - only what the contract says about it.
 */
export type SlackBlock = (Partial<{ type: ("header" | "context" | "section" | "divider") }> & Record<string, unknown>)
/**
 * Literal `{"blocks": [...]}`.
 */
export type DailyRecapPreview = { blocks: Array<SlackBlock> }
/**
 * Hand-built map in dailyRecapHandlers.getSettings. snake_case, and the key names do not mirror the camelCase Settings keys one-to-one.
 */
export type DailyRecapSettings = {
  /**
   * settings.recapEnabled
   */
  enabled: boolean;
  /**
   * settings.recapSendTime, `HH:MM`. PAC-24 pins the rendered form; it was `HH:MM:SS` here too (U-19).
   */
  send_time: string;
  /**
   * settings.recapSendTo
   */
  send_to: ("dm" | "channel");
  /**
   * settings.recapChannelId
   */
  channel_id: string;
  /**
   * settings.recapIncludeBriefs
   */
  include_briefs: boolean;
  /**
   * settings.recapIncludeFocus (name differs)
   */
  include_focus_blocks: boolean;
  /**
   * settings.recapIncludeHabits
   */
  include_habits: boolean;
}
/**
 * Literal `{"ok": true, "slack_message_ts": "..."}`.
 */
export type DailyRecapTestResult = {
  /**
   * Always literal `true` on the 200 path.
   */
  ok: boolean;
  /**
   * Slack message timestamp returned by chat.postMessage.
   */
  slack_message_ts: string;
}
/**
 * storage.DaySchedule. No omitempty - all three always serialise.
 */
export type DaySchedule = {
  enabled: boolean;
  /**
   * `HH:MM`, validated with a shape check AND `time.Parse("15:04")`, so `25:00` is rejected. Empty string allowed when `enabled` is false. PAC-24 corrected the pattern: the previous `^[0-9]{2}:[0-9]{2}$` both admitted `99:99` (which the server rejects) and forbade the empty string (which the server accepts and which GET returns for a disabled day) - it was wrong in both directions.
   */
  start: string;
  end: string;
}
/**
 * The shared JSON error envelope, written by writeError()
 * (backend/api/handlers_settings.go:206). Content-Type: application/json.
 * `error` is a server-chosen message, never the text of a Go, driver or
 * provider error; every 5xx in this document uses this envelope (PAC-21).
 */
export type ErrorResponse = { error: string }
/**
 * backend/api/handlers_conferencing.go conferenceLinkResponse.
 */
export type EventConferenceLink = {
  /**
   * The requested provider, EXCEPT on the already-has-a-conference echo branch, where it is the provider already stored on the event (which can differ from the requested one when `custom` was requested).
   */
  provider: string;
  url: string;
  /**
   * Omitted when empty. "Custom link" for custom, "Google Meet" for google_meet, the uppercased provider name (e.g. "ZOOM", "TEAMS") for factory providers, and the bare stored provider string on the echo branch.
   */
  label?: string;
}
/**
 * Body of PATCH /api/events/{id}. Every field is optional; null or absent leaves the corresponding part of the event unchanged. Since PAC-29 the schema declares every key the web client sends (`send_updates`, `room_resource_email`, `attendee_details`, API-018). The server's decoder still ignores undeclared keys; the contract forbids them so a generated client cannot send a key that would be a silent no-op.
 */
export type EventPatchRequest = Partial<{
  /**
   * Maps to Google `summary`. Null or absent leaves it unchanged.
   */
  title: (string | null);
  description: (string | null);
  location: (string | null);
  /**
   * Either an RFC3339 date-time, written as Google `start.dateTime` in UTC (the event becomes or stays timed), or a bare `YYYY-MM-DD` date, written as Google `start.date` (the event becomes or stays all-day). The same dual format as CalendarEvent.start, so a client can write back what it read. PAC-29, API-043: before PAC-29 only a date-time was accepted and an all-day event was always converted to a timed one. After applying the patch, start and end must be of the same kind or the request is a 400.
   */
  start: (string | null);
  /**
   * Same handling as `start`. For a bare date this is Google's exclusive end date, as in CalendarEvent.end.
   */
  end: (string | null);
  /**
   * Replaces the event's NON-ROOM attendees with this list (emails compared case-insensitively, duplicates collapsed). An email already on the event keeps its existing Google attendee entry (display name, RSVP, organizer, optional); a new email is added as an email-only entry. Room resource attendees already on the event (`resource: true` or `*@resource.calendar.google.com`) are always kept, so writing back the list GET /api/calendar/events returned (which omits rooms) does not drop the room. `[]` removes every non-room attendee. The two room rules differ on purpose: the DTO hides only the `*@resource.calendar.google.com` suffix, so a `resource: true` attendee without that suffix is shown as an ordinary guest, yet PATCH still keeps it if the client leaves it out. The difference can only keep an attendee, never drop one. PAC-29, API-044: before PAC-29 this replaced the whole list with email-only entries, dropping names, RSVPs and the room.
   */
  attendees: (Array<string> | null);
  /**
   * Passed to Google's update call as `sendUpdates`: `all` emails the guests about the change, `none` does not. Null or absent means `none`, which is what every PATCH did before PAC-29. Any other value is a 400 and nothing is written. PAC-29, API-018.
   */
  send_updates: (("all" | "none") | null);
  /**
   * A Google room resource calendar address (as returned by GET /api/rooms). When non-empty and not already an attendee, the room is added as a resource attendee. Rooms already on the event are kept: this endpoint never removes a room (PAC-29 decision D-6). Null, absent or `""` leaves the rooms unchanged. A non-empty value that is not a `*@resource.calendar.google.com` address is a 400. PAC-29, API-018.
   */
  room_resource_email: (string | null);
  /**
   * Accepted and ignored by the server. Declared because the web client sends it alongside `attendees` on every edit (API-018). Who attends comes from `attendees`; existing attendees keep their names and RSVPs from Google (see `attendees`); a client never sets another person's RSVP. PAC-29 decision D-7.
   */
  attendee_details: (Array<Record<string, unknown>> | null);
}>
/**
 * storage.FocusBlock (backend/storage/models.go), with explicit snake_case json tags (PAC-26, API-014). The keys match the `focus_blocks` columns and the web app's FocusBlock type. Before PAC-26 the struct had no tags and the keys were `ID`, `GoogleEventID`, `StartTime`, `EndTime`, `Date`, `CreatedAt`.
 */
export type FocusBlockRecord = { id: number, google_event_id: string, start_time: string, end_time: string, date: string, created_at: string }
/**
 * Literal `map[string]int{"deleted": n}`.
 */
export type FocusClearResult = { deleted: number }
/**
 * engine.FocusBlock, with explicit snake_case json tags (PAC-26, API-014). The keys it shares with FocusBlockRecord (storage.FocusBlock, returned by GET /api/focus/blocks) are spelled the same: the Go fields `Start`/`End` are tagged `start_time`/`end_time` so that one block shape can be read from both operations. It has no `id` and no `created_at`: the engine reports what it created before any row id is known to the response. Before PAC-26 the struct had no tags and the keys were `GoogleEventID`, `Start`, `End`, `Date`.
 */
export type FocusRunBlock = {
  google_event_id: string;
  start_time: string;
  end_time: string;
  /**
   * `YYYY-MM-DD`.
   */
  date: string;
}
/**
 * Optional. Absent, empty or `null` is treated as `{}`. Any other body that does not decode into this object is a 400 `invalid JSON` (PAC-36, API-035; it was silently treated as `{}` before).
 */
export type FocusRunRequest = (Partial<{
  /**
   * `YYYY-MM-DD`. Empty or absent -> current week (`time.Now()`). Not snapped to Monday by the handler.
   */
  week: string;
}> & Record<string, unknown>)
/**
 * engine.FocusRunResult (backend/engine/focus_time.go). camelCase wrapper; the blocks inside `createdBlocks` are snake_case (FocusRunBlock, PAC-26). The wrapper casing is unchanged by PAC-26: the web app's snake_case FocusRunResult type is aligned to it by PAC-32 (API-015), which needs no contract change.
 */
export type FocusRunResult = {
  /**
   * RFC3339 (Go time.Time).
   */
  weekStart: string;
  /**
   * `[]` when the engine created nothing.
   */
  createdBlocks: Array<FocusRunBlock>;
  /**
   * `YYYY-MM-DD` of each weekday the engine skipped (daily target already met, or the day is disabled in the working window). Both append sites in engine/focus_time.go append the same `day.Format("2006-01-02")` string (U-23, resolved by reading the code for PAC-26).
   */
  skippedDays: Array<string>;
  totalMinutes: number;
  errors: Array<string>;
}
/**
 * calendar.TimeSlot, with explicit json tags `start` / `end` since PAC-26 (API-028, API-029). Same keys as FreeBusyWindow; kept as its own schema because it is a different Go type with a different failure mode: a Google timestamp that fails to parse becomes the Go zero time `0001-01-01T00:00:00Z` because the parse error is discarded. Before PAC-26 the struct had no tags and the keys were `Start` / `End`.
 */
export type RawGoogleBusyWindow = { start: string, end: string }
/**
 * engine.ParticipantBusy, as emitted under the `results` key.
 */
export type FreeBusyLegacyResult = { email: string, coverage: ("known" | "unknown"), busy: Array<RawGoogleBusyWindow> }
/**
 * api.freeBusyWindowDTO — the lowercase-keyed busy window.
 */
export type FreeBusyWindow = { start: string, end: string }
/**
 * api.freeBusyParticipantDTO.
 */
export type FreeBusyParticipant = {
  /**
   * Lowercased and trimmed form of the requested address.
   */
  email: string;
  /**
   * `known` when the provider returned data for this address; `unknown` when the domain is a known consumer domain, when no calendar credentials are stored, or when the provider call failed or timed out.
   */
  status: ("known" | "unknown");
  /**
   * Always present; `[]` when the participant is free or status is unknown.
   */
  busy: Array<FreeBusyWindow>;
}
/**
 * Body of POST /api/freebusy.
 */
export type FreeBusyQueryRequest = {
  /**
   * 1 to 20 addresses. Empty or absent -> 400 `emails is required`; more than 20 -> 400 `max 20 emails per request`. Each entry is trimmed and lowercased before lookup. No format validation is performed.
   */
  emails: Array<string>;
  /**
   * RFC3339. Must parse or the request is rejected with 400.
   */
  start_time: string;
  /**
   * RFC3339. Must parse or the request is rejected with 400. The handler does NOT check that end_time is after start_time.
   */
  end_time: string;
}
/**
 * The same free/busy data is returned three ways for compatibility: `participants` (canonical), `busy` (map form) and `results` (legacy). All three are always present. Since PAC-26 (API-028) every busy window in all three uses the same `{"start","end"}` keys; before it, `results[].busy[]` alone was `{"Start","End"}`.
 */
export type FreeBusyQueryResponse = {
  /**
   * Echo of the parsed request start, marshalled from Go time.Time.
   */
  start_time: string;
  end_time: string;
  /**
   * One entry per requested email, in the order personal-domain/cached entries were resolved.
   */
  participants: Array<FreeBusyParticipant>;
  /**
   * Busy windows keyed by the lowercased email. Same data as `participants[].busy`. Always an object; a participant with no busy time maps to `[]`.
   */
  busy: Record<string, Array<FreeBusyWindow>>;
  /**
   * Legacy view. Uses `coverage` instead of `status`. Its busy windows are calendar.TimeSlot values, `{"start","end"}` since PAC-26 (API-028).
   */
  results: Array<FreeBusyLegacyResult>;
}
/**
 * storage.Habit. Every field is emitted — no `omitempty` anywhere on this struct.
 */
export type Habit = {
  id: string;
  user_id: string;
  title: string;
  duration_minutes: number;
  /**
   * Monday=1 … Sunday=7. Non-empty, unique, ascending only by convention (insertion order is preserved by the DB array).
   */
  days_of_week: Array<number>;
  /**
   * Local clock time, exactly `HH:MM` (5 chars, zero-padded).
   */
  window_start: string;
  /**
   * Local clock time, exactly `HH:MM`. Strictly greater than `window_start`.
   */
  window_end: string;
  /**
   * Higher wins when habits compete for the same slot. Scheduling order is `priority DESC, created_at ASC`.
   */
  priority: number;
  /**
   * Hex color. NOT validated by the backend — any string is accepted and stored.
   * Only "#5B7FFF", "#E9B949" and "#9B7AE0" map to a dedicated Google Calendar
   * color id; everything else falls back to graphite.
   */
  color: string;
  /**
   * Set false by DELETE. Never settable at creation; settable via PATCH.
   */
  active: boolean;
  created_at: string;
}
/**
 * Anonymous request struct in handlers_habits.go `create`. Unknown keys are ignored
 * (the decoder does not call DisallowUnknownFields). `active` cannot be set here.
 */
export type HabitCreateRequest = {
  /**
   * Trimmed server-side. Must be non-empty and ≤200 runes after trimming.
   */
  title: string;
  /**
   * Required in practice — the Go zero value 0 fails validation.
   */
  duration_minutes: number;
  /**
   * Monday=1 … Sunday=7. Absent or `null` defaults to [1,2,3,4,5]. An explicitly
   * empty array `[]` is NOT defaulted and fails validation.
   */
  days_of_week?: Array<number>;
  /**
   * Defaults to "09:00" when absent or blank after trimming.
   */
  window_start?: string;
  /**
   * Defaults to "17:00" when absent or blank after trimming. Must be strictly after `window_start`.
   */
  window_end?: string;
  /**
   * Defaults to 50. WARNING: the handler tests `if body.Priority == 0`, so an
   * explicit `"priority": 0` is indistinguishable from omission and also becomes 50.
   * Priority 0 can only be reached via PATCH.
   */
  priority?: number;
  /**
   * Defaults to "#5B7FFF" when absent or empty. Not validated.
   */
  color?: string;
}
/**
 * storage.HabitOccurrence — one materialised instance of a habit on a date.
 */
export type HabitOccurrence = {
  id: string;
  habit_id: string;
  /**
   * The DB column is a DATE, but the Go field is `time.Time`, so it serialises as a
   * full RFC3339 timestamp at midnight UTC (e.g. "2026-03-04T00:00:00Z"), NOT as
   * "2026-03-04". Parsed from the DB with a failure-swallowing `time.Parse`, so a
   * malformed stored value would surface as the zero time "0001-01-01T00:00:00Z".
   */
  scheduled_date: string;
  start_time: string;
  end_time: string;
  /**
   * Written by the engine as well as by the API. "scheduled" (placed), "completed"
   * (user-confirmed; survives reoptimization), "displaced" (its slot was taken and
   * rescheduling is being attempted), "missed" (no slot fit in the window).
   * Only "scheduled" and "completed" are settable via the API.
   */
  status: ("scheduled" | "completed" | "displaced" | "missed");
  /**
   * Google Calendar event id for the mirrored event. Empty string when no calendar is connected or event creation failed. Never null.
   */
  calendar_event_id: string;
  created_at: string;
}
export type HabitOccurrenceStatusUpdate = {
  /**
   * Trimmed and lowercased before validation, so mixed case is accepted.
   */
  status: ("completed" | "scheduled");
}
/**
 * A built-in starter template (engine.HabitTemplate). Has no id and is not user-scoped.
 */
export type HabitTemplate = { title: string, duration_minutes: number, days_of_week: Array<number>, window_start: string, window_end: string, priority: number, color: string }
/**
 * Anonymous request struct in handlers_habits.go `update`. All fields are Go
 * pointers (or a nil-able slice), so absent/`null` means "leave unchanged".
 * The merged result is validated as a whole.
 */
export type HabitUpdateRequest = Partial<{
  title: string;
  duration_minutes: number;
  /**
   * `null` or absent leaves the stored value; `[]` replaces it and then fails validation.
   */
  days_of_week: Array<number>;
  window_start: string;
  window_end: string;
  /**
   * Unlike create, an explicit 0 is honoured.
   */
  priority: number;
  color: string;
  /**
   * The only way to reactivate a habit that DELETE deactivated.
   */
  active: boolean;
}>
export type HabitsReoptimizeAck = { status: "reoptimization started" }
export type HealthResponse = { status: "ok", version: "0.1.0" }
export type IntegrationAvailabilityStatus = {
  available: boolean;
  /**
   * `reason,omitempty` — in practice one of the four values is always set
   * by the current code paths, so the key is never actually omitted.
   */
  reason?: ("configured" | "missing_credentials" | "invalid_redirect_uri" | "built_in");
}
/**
 * map[string]integrationAvailability from
 * integrationAvailabilitySnapshot(); the six keys below are always present.
 */
export type IntegrationAvailabilityResponse = { google: IntegrationAvailabilityStatus, microsoft: IntegrationAvailabilityStatus, zoom: IntegrationAvailabilityStatus, slack: IntegrationAvailabilityStatus, notion: IntegrationAvailabilityStatus, webcal: IntegrationAvailabilityStatus }
/**
 * Shared shape for GET /api/integrations/slack/status and .../notion/status.
 * Built as a `map[string]interface{}`, so `workspace_name` is absent (not null)
 * when not connected.
 */
export type IntegrationStatus = {
  connected: boolean;
  /**
   * Present only when `connected` is true. May be an empty string if the provider returned no workspace name at connect time.
   */
  workspace_name?: string;
}
export type InviteEmailRequest = ({
  /**
   * Lowercased, trimmed and validated with net/mail.ParseAddress.
   */
  email: string;
} & Record<string, unknown>)
export type InviteSchedulingLinkHostRequest = {
  /**
   * Must be non-empty after trimming and must match an existing account (lowercased before lookup).
   */
  email: string;
}
/**
 * NEW-llm-bring-your-own (spec D-5). For each key-based provider, whether a key bound to it is on file for the caller. The only thing a reader learns about the keys; the keys themselves are never returned.
 */
export type LLMApiKeysSet = { openai: boolean, anthropic: boolean, azure_openai: boolean, bedrock: boolean, vertex: boolean }
/**
 * PAC-66 and PAC-66-B. Body of the 422 from POST /api/llm/test: the probe would have sent the caller's key to a destination not approved for that provider, so no request was sent. A superset of `SchedulingErrorResponse` (`error` is the same member, so a client that reads only `error` renders it unchanged). Never carries a key.
 */
export type LLMDestinationRefusal = {
  /**
   * A human-readable sentence saying what was refused and why.
   */
  error: string;
  /**
   * `provider_not_enabled`: the operator approved no destination for this provider. It wins over the other two. Given for `azure_openai` and `bedrock` with nothing approved, and for `vertex` whenever `aiplatform.googleapis.com` is not approved (Vertex has no other destination). Never given for `openai` or `anthropic`, whose public hosts are always approved. `destination_not_approved`: the effective destination is not approved for this provider. This includes an `http` scheme or a non-default port; a host approved only for a DIFFERENT provider; an empty Bedrock region whose built-in `us-east-1` host is not approved; and a `llmBaseUrl` that is not exactly an approved origin followed by exactly that entry's path prefix (a path, prefix mismatch, query, fragment, userinfo or whitespace), including a value once approved only for Ollama (spec D-14). `destination_not_set`: the destination cannot be built because the stored value is empty and the provider has no default; only an empty `azureEndpoint`.
   */
  reason: ("provider_not_enabled" | "destination_not_approved" | "destination_not_set");
  /**
   * The stored setting the refused destination was built from. Present whenever `reason` is not `provider_not_enabled`. When `configuration` is `organization`, it names the organisation's stored value (`llmBaseUrl` stands for the organisation's `baseUrl`). `gcpLocation`, `awsProfile` and `ollamaBaseUrl` are gone with the settings they named (NEW-llm-bring-your-own).
   */
  property?: ("azureEndpoint" | "awsRegion" | "llmBaseUrl");
  configuration?: "organization";
}
/**
 * NEW-llm-bring-your-own. Body of the 409 from POST /api/llm/test and POST /api/meetings/{event_id}/brief/refresh: AI is not configured for the caller, and nothing was sent. A superset of the JSON error shape (`error` is the same member as in `SchedulingErrorResponse` and `ErrorResponse`), so a client that reads only `error` shows the sentence.
 */
export type LLMNotConfiguredResponse = {
  /**
   * Equal to `notConfigured.message`.
   */
  error: string;
  notConfigured: AINotConfigured;
}
/**
 * Body for POST /api/llm/test. Added by PAC-24 to close API-037.
 * **This schema is a closed list of three properties and that is the whole point of it.** Not one of them can contribute to the URL the server requests, so no submitted value can direct a stored key anywhere. The destination properties a probe might plausibly want to override - `llmBaseUrl`, `azureEndpoint`, `azureDeployment`, `azureApiVersion`, `awsRegion`, `bedrockModel`, `vertexModel` - are DELIBERATELY ABSENT and are a 400 via `additionalProperties: false`. The operation description carries the argument.
 * Required. `{}` probes the caller's saved choice; an absent body is a 400. `{"llmProvider": "anthropic", "llmApiKey": "..."}` probes an unsaved key for a provider against the caller's own stored destination for it, which is the case the settings UI needs because a stored key can never be read back to re-submit.
 * This is deliberately NOT `SettingsUpdate`: sharing that schema would re-admit every destination property by inheritance and make a probe read like a write. The three property names match the corresponding SettingsUpdate ones so a client can build this from the document it already holds: every `llmProvider` value a settings read can return (`Settings.llmProvider`, including `unsupported`) is accepted here, and `unsupported` is accepted only in the one state in which a read returns it.
 * `llmApiKey` here is `writeOnly` for the same reason it is on SettingsUpdate: it is accepted and is never echoed, in any status. Nothing submitted here is persisted.
 */
export type LLMTestRequest = Partial<{
  /**
   * The choice to probe (NEW-llm-bring-your-own, spec D-19); absent means the caller's saved choice. A provider name selects that provider, the caller's own stored destination values for it, and the submitted key or else the key bound to it; never a key bound to another provider (and, while the caller's organisation forbids personal keys, the 409 `personal_keys_forbidden`). `""` is the 409 `off`. `organization` is decided as a follower's request (rows 4-6; in row 4 it tests the organisation's configuration at the confirmed version). Only the five provider values "name a provider" (testLLMConnection, Part 2). `unsupported` is accepted only when the caller's saved choice reads as `unsupported` and is then decided as the saved choice (the row 7/8 409, a submitted key sent nowhere); otherwise it is a 400. `ollama` is not in the set (400). The same set as `Settings.llmProvider`. The approved-destination check follows this value when present, not the saved provider (PAC-66 AC-18, PAC-66-B AC-B11). Nothing submitted here is stored.
   */
  llmProvider: ("" | "organization" | "unsupported" | "openai" | "anthropic" | "azure_openai" | "bedrock" | "vertex");
  /**
   * Used only when the probed provider is `openai` or `anthropic`, as a field of the JSON request body; `""` means the provider default. It never appears in a URL. `azureDeployment`, `bedrockModel` and `vertexModel`, which DO appear in URLs, are not accepted here. Ignored, and never sent, for any other choice.
   */
  llmModel: string;
  /**
   * An unsaved key to probe with, for the provider the probe uses. Sent only in that provider's key header (see the operation) and only to a destination approved for that provider. `""` means "no key": the 409 `needs_key`, and the stored key is NOT used instead. Never combined with an organisation configuration, never persisted, never echoed.
   */
  llmApiKey: string;
}>
/**
 * Literal map: `{"ok": true, "response": ..., "provider": ...}`.
 */
export type LLMTestResult = {
  /**
   * Always literal `true` on the 200 path.
   */
  ok: boolean;
  /**
   * The provider's completion text for the fixed "Say hello" prompt.
   */
  response: string;
  /**
   * The provider that was actually probed: the one named in the body, else the caller's saved one. Never empty since NEW-llm-bring-your-own (a probe with no provider is the 409). It is what tells a client which configuration the result is about. It never carries the key.
   */
  provider: ("openai" | "anthropic" | "azure_openai" | "bedrock" | "vertex");
  /**
   * NEW-llm-bring-your-own Part 2. `organization` when the probe tested the organisation's configuration (row 4), `own` otherwise.
   */
  configuration: ("own" | "organization");
}
/**
 * storage.LunchBreakSchedule - a bare map keyed by lowercase weekday name. Normalised to `{}` (never null) on read (`backend/storage/settings.go:103-105`). A per-day entry overrides the legacy global `lunchStart`/`lunchEnd`/`protectLunch` trio, including disabling lunch for that day. Replaced whole by a PATCH that mentions it; `lunchBreaks: {}` clears every per-day override (spec AC-9).
 * Keys are enforced EXACTLY by the handler (revision 3; generators drop `propertyNames`), and migration 024 removes stored keys that are not one of the seven lowercase names, or whose `start`/`end` are neither empty nor a clock. Before PAC-24 the validator lower-cased the key, so a `"Monday"` key was stored and never matched `LunchWindow`'s lookup.
 */
export type LunchBreakSchedule = Record<string, DaySchedule>
export type ManagerAnalyticsWeek = {
  /**
   * YYYY-MM-DD, the Monday of this bucket.
   */
  week_start: string;
  focus_minutes: number;
  meeting_minutes: number;
  free_minutes: number;
  /**
   * False when the member's week could not be measured (see degraded-analytics invariant).
   */
  data_available: boolean;
}
export type ManagerAnalyticsMember = {
  email: string;
  display_name: string;
  /**
   * True iff the member's member_user_id resolved to a Paceday user row; the same value ManagerRosterMember.is_paceday_user carries for this member (PAC-34).
   */
  is_paceday_user: boolean;
  /**
   * True iff at least one entry of `weeks` has data_available=true (PAC-34). Derived from the buckets of this response, never read or cached separately, so it cannot disagree with them. False means no bucket is measured (degraded FreeBusy, no analytics_weeks rows, consent withheld, or the PAC-60 visibility gate): the member's minutes must be shown as "no data", not as zeroes. True does NOT mean every bucket is measured; each bucket's own data_available still decides how that bucket is drawn.
   */
  data_available: boolean;
  /**
   * Exactly 12 buckets, newest first.
   */
  weeks: Array<ManagerAnalyticsWeek>;
}
export type ManagerAnalytics = { members: Array<ManagerAnalyticsMember> }
/**
 * "auto" = created by calendar detection, "manual" = created by an explicit add, "formal" = SYNTHETIC, returned only by getManagerRoster for a formal team_members row that has no manager assignment yet. "formal" is never persisted (the manager_team_members CHECK constraint permits only auto/manual).
 */
export type ManagerMemberSource = ("auto" | "manual" | "formal")
export type ManagerProfileSummary = {
  is_manager: boolean;
  /**
   * RFC3339 UTC timestamp of the last successful detection, or null.
   */
  detected_at: (string | null);
  /**
   * COUNT(*) over manager_team_members for this manager — the GLOBAL roster size, not the size of any one team. The query's error is discarded, so a failed count is reported as 0.
   */
  team_member_count: number;
}
/**
 * Unknown fields are ignored (the decoder does not call DisallowUnknownFields here). A missing is_manager decodes to false and will clear the flag.
 */
export type ManagerProfileUpdate = ({ is_manager: boolean } & Record<string, unknown>)
/**
 * engine.MemberWeekStats. When data_available is false the three minute counters are all 0 — callers must branch on data_available rather than treating 0 as measured. For a Paceday member, data_available is also false unless the caller owns a team the member belongs to (PAC-60); see getManagerAnalytics.
 */
export type MemberWeekStats = {
  /**
   * Always 0 for an external (non-Paceday) member; FreeBusy yields no focus signal.
   */
  focus_minutes: number;
  meeting_minutes: number;
  /**
   * For an external member, 2400 (5 days x 8h) minus busy minutes, floored at 0. For a Paceday member, the stored analytics_weeks value.
   */
  free_minutes: number;
  data_available: boolean;
}
export type ManagerRosterMember = {
  email: string;
  display_name: string;
  source: ManagerMemberSource;
  cadence: Cadence;
  cadence_custom_days: (number | null);
  last_one_on_one_at: (string | null);
  /**
   * True iff member_user_id resolved to a Paceday user row.
   */
  is_paceday_user: boolean;
  this_week: MemberWeekStats;
  last_week: MemberWeekStats;
  /**
   * engine.TrendPct(this_week.focus, last_week.focus). Clamped to [-200, 200], rounded to one decimal. Returns exactly 200 when prior is 0 and current is non-zero, and 0 when both are 0. Never NaN or Inf.
   */
  focus_trend_pct: number;
}
export type ManagerRoster = {
  /**
   * Echo of the requested team_id. The frontend treats a mismatch as a stale response and discards it.
   */
  team_id: string;
  members: Array<ManagerRosterMember>;
}
/**
 * storage.ManagerTeamMember with explicit snake_case json tags (PAC-26, API-030); the keys match the manager_team_members columns. Returned by addManagerTeamMember (201) and patchManagerTeamMember (200), both read back from storage after the write. The schema name is kept from before PAC-26, when the struct had no tags and the keys were the Go field names (`ID`, `ManagerUserID`, `MemberEmail`, ...). Note the key is `member_email` here but `email` on ManagerRosterMember: this is the stored row, the roster is a view.
 */
export type ManagerTeamMemberGoStruct = {
  /**
   * The stored row id. Since PAC-26 (API-031) never the zero UUID on the 201 add response.
   */
  id: string;
  manager_user_id: string;
  member_email: string;
  /**
   * Set when the email matches a Paceday user; null for external members.
   */
  member_user_id: (string | null);
  display_name: string;
  source: ManagerMemberSource;
  cadence: Cadence;
  cadence_custom_days: (number | null);
  last_one_on_one_at: (string | null);
  /**
   * Stored value; since PAC-26 (API-031) never "0001-01-01T00:00:00Z".
   */
  created_at: string;
  /**
   * Stored value; since PAC-26 (API-031) never "0001-01-01T00:00:00Z".
   */
  updated_at: string;
}
/**
 * storage.SlackMessage — one Slack search hit backing a brief.
 */
export type SlackMessage = {
  channel_name: string;
  author_name: string;
  /**
   * Excerpt, truncated server-side to roughly 200 characters.
   */
  text: string;
  /**
   * Slack's `ts` value (a string, e.g. "1712345678.123456") — NOT an RFC3339 date-time.
   */
  timestamp: string;
  permalink: string;
}
/**
 * storage.NotionPage — one Notion search hit backing a brief.
 */
export type NotionPage = {
  title: string;
  url: string;
  /**
   * Notion's `last_edited_time` string. NOTE the Go field is named `LastEditedAt` but the json tag is `last_edited_time` — the tag wins.
   */
  last_edited_time: string;
  parent_name: string;
}
/**
 * Always present on a brief response. Both arrays are normalised from nil to `[]`, so neither is ever null.
 */
export type MeetingBriefSources = { slack: Array<SlackMessage>, notion: Array<NotionPage> }
/**
 * api.briefResponse. Note this is NOT the `storage.MeetingBrief` struct (which has
 * no json tags at all and is never serialised) — id, user_id and calendar_event_id
 * are not exposed.
 */
export type MeetingBriefResponse = {
  /**
   * "pending" — no stored brief, or generation is in flight;
   * "ready" — brief_text and sources are usable;
   * "failed" — generation ran and errored. A failed brief is still returned with HTTP 200.
   */
  status: ("pending" | "ready" | "failed");
  /**
   * RFC3339. `omitempty`, and omitted only in the "no stored brief" path of GET.
   * When a stored brief exists this is always present — even a zero timestamp
   * formats to the non-empty "0001-01-01T00:00:00Z".
   */
  generated_at?: string;
  /**
   * `omitempty` — absent when no LLM is configured in settings, when generation failed, or in the synthetic pending response.
   */
  brief_text?: string;
  sources: MeetingBriefSources;
}
/**
 * engine.MemberAnalyticsSummary.
 */
export type MemberAnalyticsSummary = {
  user_id: string;
  /**
   * The user's display name, which may be "" (COALESCE default). No email is included, which is why the frontend has to match breakdown rows by name or positional index.
   */
  name: string;
  meeting_minutes: number;
  focus_minutes: number;
  focus_score: number;
}
/**
 * A JSON literal delivered with a text/plain Content-Type, because the handler sets application/json and http.Error then overwrites the header. Every producer of this exact body in backend/api/ is an `http.Error` with the literal `{"error":"unauthorized"}`: the three in `requireAuth` (backend/api/middleware.go — one per rejection reason: no token, a token that fails `auth.ValidateToken`, a `UserID` claim that is not a UUID; cited by function because this description is emitted into generated files in both repos), `orgHandlers.members` (backend/api/handlers_org.go:21), and `meHandlers.me` (backend/api/handlers_me.go:19, reached at `GET /api/auth/me`). The falsifying command, excluding the generated package, is `grep -rn error.:.unauthorized --include=*.go backend/api/`, which returns exactly those five lines. The third is listed for completeness only: `getCurrentUser` declares its 401 against `PlainTextError`, not this schema, and lives in paths/auth.yaml, which PAC-23 does not own and does not touch.
 * 
 * Precisely, because PAC-23 AC-12 requires this response to be unchanged: as net/http's `http.Error` produces it the header is `text/plain; charset=utf-8`, `X-Content-Type-Options: nosniff` is set, and the message is written with `Fprintln`, so the body is 25 bytes — the example below, trailing newline included. The two headers are stated here because the sibling `PlainTextError` states them and "exactly as today" includes them.
 * 
 * The trailing newline is part of the VALUE a generated handler must supply. oapi-codegen's per-operation `…401TextResponse` types set `Content-Type: text/plain` with no charset, do not set `nosniff`, and write the value verbatim without appending anything (see `ListAuditEntries401TextResponse` in backend/api/gen/paceday.gen.go; cited by symbol because this description is emitted into that file). A handler adopting the generated interface must therefore include the `\n` in the string and set both headers itself, or its 401 is not byte-identical to the middleware's.
 */
export type MiddlewareUnauthorized = string
/**
 * engine.SuggestedSlot.
 */
export type SuggestedSlot = {
  start: string;
  end: string;
  /**
   * Integer score from scoreCandidate + adjustScoreForPreferences. No documented range or normalisation.
   */
  score: number;
  reasons: (Array<string> | null);
}
/**
 * calendar.ParticipantInfo (backend/calendar/participants.go).
 */
export type ParticipantInfo = {
  email: string;
  /**
   * Empty string = unknown.
   */
  timezone: string;
  /**
   * `HH:MM` or empty.
   */
  workStart: string;
  /**
   * `HH:MM` or empty.
   */
  workEnd: string;
}
/**
 * nlp.ParseResult. snake_case - the only snake_case RESPONSE body in this domain. Every field except `intent` is omitted when empty, so absent members are normal; since NEW-llm-bring-your-own that includes the time range (API-080).
 */
export type NLPParseResult = {
  /**
   * Values observed in the code and prompts: `schedule_meeting`, `schedule_focus`, `unknown`. The field is a plain string with no server-side validation, and the value ultimately comes from the LLM, so other values are possible.
   */
  intent: string;
  title?: string;
  duration_minutes?: number;
  attendees?: Array<string>;
  /**
   * Start of the time range the request named. ABSENT when the result has no range (an "AI not configured" answer, or an `unknown` intent with no range); never `0001-01-01T00:00:00Z`. Resolves API-080 (NEW-llm-bring-your-own, spec AC-35, D-20): before, the field was a Go `time.Time` with `omitempty`, which does not omit the zero time. Present together with `range_end` or not at all.
   */
  range_start?: string;
  /**
   * End of the range; absent exactly when `range_start` is (API-080).
   */
  range_end?: string;
  /**
   * Free-form windows, e.g. `"10:00-12:00"`.
   */
  preferred_times?: Array<string>;
  avoid_times?: Array<string>;
  /**
   * Reused as the event Description by /api/nlp/confirm.
   */
  constraints?: string;
  timezone_notes?: string;
  /**
   * Set (with intent `unknown`) when the LLM call fails or returns invalid JSON, when the destination is refused, and when AI is not configured (then equal to `not_configured.message`) - still HTTP 200.
   */
  error?: string;
  not_configured?: AINotConfigured;
  suggested_slots?: Array<SuggestedSlot>;
  participant_infos?: Array<ParticipantInfo>;
}
export type NLPConfirmRequest = ({
  parse_result: NLPParseResult;
  /**
   * Index into `parse_result.suggested_slots`. A negative value or one >= the slot count is a 400 `invalid selected_slot_index`.
   */
  selected_slot_index: number;
} & Record<string, unknown>)
export type NLPParseRequest = ({
  /**
   * Empty string -> 400 `missing text field`.
   */
  text: string;
} & Record<string, unknown>)
/**
 * storage.NoMeetingZone after the handler's storage->wire weekday conversion.
 */
export type NoMeetingZone = {
  id: string;
  teamId: string;
  /**
   * Monday=1 .. Sunday=7 on the wire (0 in the database).
   */
  dayOfWeek: number;
  /**
   * Rendered by the Postgres driver from a TIME column.
   */
  startTime: string;
  endTime: string;
  label: string;
  createdAt: string;
}
export type NoMeetingZoneRequest = ({
  /**
   * Monday=1 .. Sunday=7. 0 is rejected, so this field is effectively required.
   */
  dayOfWeek: number;
  /**
   * HH:MM, 24-hour, parsed with Go layout "15:04". Trimmed before use.
   */
  startTime: string;
  /**
   * HH:MM. Must be strictly after startTime.
   */
  endTime: string;
  /**
   * Trimmed. Optional; the column defaults to an empty string.
   */
  label?: string;
} & Record<string, unknown>)
/**
 * storage.Org. Present in the User struct with `omitempty`, but storage.GetOrgMembers never hydrates it, so it never appears on GET /api/org/members responses.
 */
export type Org = { id: string, name: string, domain: string, createdAt: string }
/**
 * storage.User as returned by GET /api/org/members.
 */
export type OrgMember = {
  id: string;
  email: string;
  name: string;
  /**
   * camelCase, unlike most other fields in this domain. May be "".
   */
  avatarUrl: string;
  /**
   * The identity/calendar provider the user signed in with, e.g. `google` or `microsoft`. Not constrained by an enum in Go.
   */
  provider: string;
  org?: Org;
  createdAt: string;
}
/**
 * NEW-llm-bring-your-own Part 2 (spec §3.2, parent D-7). The
 * organisation's AI configuration as every member reads it, identical
 * for every member (getOrganizationAI, and the 200 of
 * patchOrganizationAI). NEVER carries the key: `keySet` is the only fact
 * about it.
 * 
 * `configured` is true exactly when the configuration is complete: a
 * `provider`, a key for it, and for `azure_openai` a non-empty
 * `azureEndpoint` and `azureDeployment` (every other value has a
 * default: `model` the provider's default model, `baseUrl` the vendor's
 * public host, `azureApiVersion` the default API version, `awsRegion`
 * `us-east-1`). Only a complete configuration can be used (row 4 of the
 * table on AINotConfigured) or confirmed (confirmOrganizationAI).
 * 
 * Destination properties appear only for the provider they apply to:
 * `baseUrl` for `openai` and `anthropic`; `azureEndpoint`,
 * `azureDeployment` and `azureApiVersion` for `azure_openai`;
 * `awsRegion` for `bedrock`; none for `vertex`. `model` is the model for
 * `openai`, `anthropic`, `bedrock` and `vertex` (absent for
 * `azure_openai`, whose deployment names it). An empty string means the
 * default. All are absent when `provider` is absent.
 */
export type OrganizationAIConfiguration = {
  configured: boolean;
  /**
   * Present exactly when a provider is set.
   */
  provider?: ("openai" | "anthropic" | "azure_openai" | "bedrock" | "vertex");
  model?: string;
  /**
   * `openai` / `anthropic` only. `""` is the vendor's public host.
   */
  baseUrl?: string;
  azureEndpoint?: string;
  azureDeployment?: string;
  azureApiVersion?: string;
  awsRegion?: string;
  /**
   * Whether a key bound to `provider` is stored. Never the key.
   */
  keySet: boolean;
  /**
   * Owner O-12. `true` (the default) means a member's own provider and key take precedence for that member (rows 2-3). `false` means no member's personal key is sent: a member on their own or a removed provider has no AI (rows 10-11) until they choose "Use my organisation's AI" and confirm (spec P2-D2, current default, pending the owner); followers are unaffected (rows 4-6).
   */
  personalKeysAllowed: boolean;
  /**
   * `0` when no configuration was ever set. Advances by one on every change of `provider` (including the removal, `provider: ""`), every write of `apiKey` (keys are never compared), and every change of a destination property (spec P2-D4), never otherwise. Never reused within an organisation: removal keeps the count, so a configuration set after a removal never has a version an earlier configuration had (contract revision 3, spec P2-D17, P2-AC-42). A version fixes `provider`, the key and the destination properties; `model` and `personalKeysAllowed` are not part of it, and a request in row 4 sends the model read together with the version. A member's confirmation is for one version (confirmOrganizationAI); an administrator's change names the version it was made from (patchOrganizationAI).
   */
  configurationVersion: number;
  /**
   * When the configuration last changed. Absent when it never was set.
   */
  updatedAt?: string;
  changeableBy: "organization_admin";
}
/**
 * NEW-llm-bring-your-own Part 2. Body of patchOrganizationAI. MERGE:
 * an absent property is unchanged; a present one is set to exactly that
 * value; `null` is a 400. `configurationVersion` (required, contract
 * revision 2) names the version the change was made from, plus at
 * least one property to change.
 * 
 * * `provider` set to a provider DIFFERENT from the stored one replaces
 *   the whole configuration: `apiKey` (non-empty) is required, and every
 *   property not in the body takes its default (`""`), except
 *   `personalKeysAllowed`, which is kept unless the body names it
 *   (contract revision 3.1, spec revision 2.1). A key is never
 *   carried from one provider to another (spec P2-D7).
 * * `provider: ""` removes the whole configuration, key included. No
 *   other property may be sent with it (400), so the removal is
 *   unambiguous (`configurationVersion` excepted); the stored
 *   `personalKeysAllowed` is kept, and so is the version count: the
 *   removal advances `configurationVersion` and the next setup names
 *   that version (never reused, contract revision 3).
 * * `apiKey: ""` removes only the key (the configuration is then not
 *   complete; followers answer `nothing_configured`, P2-AC-13). A
 *   non-empty `apiKey` replaces the key for the provider after this
 *   write; with no provider stored or sent it is a 400. Because
 *   `configurationVersion` must be current, a key typed against one
 *   provider is never stored under another provider that a concurrent
 *   change installed (challenge B-1).
 * * `model` and every destination property with no provider stored
 *   or sent is a 400 (`<property> requires a provider`).
 * * A destination property that does not apply to the provider after
 *   this write is a 400 (`<property> does not apply to <provider>`),
 *   not ignored; so is `model` with `azure_openai`.
 * * `personalKeysAllowed` may be changed whether or not the
 *   configuration is complete (spec P2-D3).
 */
export type OrganizationAIConfigurationUpdate = {
  /**
   * Contract revision 2 (challenge B-1). The `configurationVersion` of the configuration the administrator was shown (getOrganizationAI; `0` for an organisation that never set one). Required: an absent value is the 400, never read as `0` (contract revision 3). Not equal to the current version: the 409, checked early (step 2a) and decided by the atomic conditional write (step 4); a conflict never consumes the proof.
   */
  configurationVersion: number;
  provider?: ("" | "openai" | "anthropic" | "azure_openai" | "bedrock" | "vertex");
  model?: string;
  /**
   * Never returned, by any operation, in any status (PAC-24, owner O-7).
   */
  apiKey?: string;
  baseUrl?: string;
  /**
   * Contract revision 3 (spec P2-D18): for the organisation, `https://<host>` with at most one trailing `/` and no path, query, fragment or userinfo, because every member reads it; otherwise the 400 (shape). The host must be approved as for a user's (PAC-66).
   */
  azureEndpoint?: string;
  azureDeployment?: string;
  azureApiVersion?: string;
  awsRegion?: string;
  personalKeysAllowed?: boolean;
}
/**
 * 409 of confirmOrganizationAI and (contract revision 2) of patchOrganizationAI: nothing recorded or stored, no grant consumed. A superset of the JSON error shape. patchOrganizationAI gives only `configuration_changed`.
 */
export type OrganizationAIConsentConflict = { error: string, reason: ("organization_not_configured" | "configuration_changed"), organization: OrganizationAIConfiguration }
/**
 * Body of confirmOrganizationAI.
 */
export type OrganizationAIConsentRequest = {
  /**
   * The `configurationVersion` of the configuration the user was shown and confirmed.
   */
  configurationVersion: number;
}
/**
 * The caller has no org (or its org row is gone). Checked before
 * anything else, including break-glass. No `stepup_url`: there is no org
 * to step up for. Also the 403 of getSsoStepupOptions and of
 * startSsoAdminStepup (the latter always with `org membership
 * required`), and (NEW-llm-bring-your-own Part 2) of getOrganizationAI,
 * patchOrganizationAI and confirmOrganizationAI.
 */
export type SsoWriteMembershipRequired = { error: ("org membership required" | "org not found") }
export type SsoStepupUrl = "/api/admin/sso/stepup"
/**
 * The scopes the SSO admin step-up requests from each provider on top of
 * the identity scopes (`openid`, `email`, `profile`, and Microsoft's
 * `User.Read`, which sign-in already requests). Requested only by
 * startSsoAdminStepup, never at sign-in; the tokens are discarded after
 * the check. Carried by SsoWriteStepupRequired and SsoStepupOptions.
 * 
 * Normative rule: each list is exactly what startSsoAdminStepup
 * requests from that provider beyond the identity scopes, so a client
 * shows it as given and does not hard-code it. A provider's key is
 * present if and only if that provider's step-up is configured on this
 * deployment, that is, startSsoAdminStepup would not answer 503 for it
 * (spec §9 D-2 and D-9: no OAuth client for the provider, or `APP_URL`
 * unset). A deployment with only Google configured sends only `google`;
 * an empty object means no step-up can be started on this deployment.
 * An unconfigured provider is an absent key, never an empty list.
 * 
 * Today's values, informative only (the exact Microsoft list is spec
 * OQ-2's open technical sub-question and may narrow): Google, the
 * read-only Directory user scope
 * (`https://www.googleapis.com/auth/admin.directory.user.readonly`);
 * Microsoft, organisation and directory-role read scopes
 * (`Organization.Read.All`, `RoleManagement.Read.Directory`, which a
 * tenant administrator may have to consent to).
 */
export type SsoStepupScopes = Partial<{ google: Array<string>, microsoft: Array<string> }>
/**
 * What the caller cannot do without the SSO admin step-up, for the
 * client to explain before it navigates. Carried by
 * SsoWriteStepupRequired and SsoStepupOptions. An open list of codes:
 * the item schema is a non-empty string, not an enum, so a value added
 * later (for example by PAC-68 if it reuses this step-up) does not make
 * the body fail validation in a client generated from this revision. A
 * client explains the codes it knows and ignores any other. The only
 * value the server sends today is `sso_configuration_writes`: no SSO
 * configuration write (create, replace or delete); only a deployment
 * operator on the break-glass list can write without it. Nothing else
 * the user already has is lost. Suspend and resume
 * (setSsoProviderState) are not served under PAC-50; they become SSO
 * configuration writes covered by this code when PAC-22's follow-up
 * serves them, and a client must not offer them before then (PAC-50
 * contract revision 8.1, N6).
 * 
 * NEW-llm-bring-your-own Part 2 adds a second value, sent only for the
 * `llm_org_key_write` purpose (OrganizationAIWriteStepupRequired, and
 * getSsoStepupOptions with `?purpose=llm_org_key_write`):
 * `organization_ai_configuration_writes`, no change to the
 * organisation's AI provider, model, key, destination or personal-keys
 * setting except by a break-glass operator. Each response carries the
 * one code of its purpose.
 */
export type SsoWithoutStepup = Array<string>
/**
 * A member with no live `llm_org_key_write` grant who is not a
 * break-glass address. As PAC-50's SsoWriteStepupRequired: the step-up
 * is optional; before navigating, the client explains `without_stepup`
 * and `stepup_scopes` and lets the user decline. If the user goes
 * ahead, the client asks which provider administers the organisation
 * (only keys of `stepup_scopes`) and navigates the browser to
 * `stepup_url` with `?provider=<p>&purpose=<stepup_purpose>`. The
 * landing page then carries `&purpose=llm_org_key_write`. A live
 * `sso_write` grant the caller may hold was not consumed.
 */
export type OrganizationAIWriteStepupRequired = { error: "organization_ai_write_requires_admin_stepup", stepup_url: SsoStepupUrl, stepup_purpose: "llm_org_key_write", stepup_scopes: SsoStepupScopes, without_stepup: SsoWithoutStepup }
/**
 * The caller's email is on the break-glass list but the session JWT was
 * issued 10 minutes ago or more, or more than one minute in the future
 * (PAC-50 AC-14a), or the same session already made one
 * organisation-AI change (spec P2-D13, contract revision 2). The client
 * sends the user through sign-in again; an `llm_org_key_write` grant
 * also satisfies the gate.
 */
export type OrganizationAIWriteFreshLoginRequired = { error: "organization_ai_write_requires_fresh_login" }
/**
 * The 403 of patchOrganizationAI (NEW-llm-bring-your-own Part 2), the
 * shapes of PAC-50's SsoWriteForbiddenResponse for this purpose.
 * Exactly one variant applies, told apart by `error`; all keep the
 * shared `{error}` envelope.
 */
export type OrganizationAIWriteForbiddenResponse = (SsoWriteMembershipRequired | OrganizationAIWriteStepupRequired | OrganizationAIWriteFreshLoginRequired)
/**
 * All fields optional. Present-but-null is indistinguishable from absent for cadence_custom_days (both decode to a nil *int and preserve the stored value).
 */
export type PatchManagerMemberRequest = (Partial<{ display_name: (string | null), cadence: Cadence, cadence_custom_days: (number | null) }> & Record<string, unknown>)
/**
 * api.personalCalendarDTO.
 */
export type PersonalCalendar = {
  /**
   * The int64 database id rendered as a decimal STRING. Path parameters for this resource are integers, so clients must convert.
   */
  id: string;
  /**
   * Renamed from the storage column `name`.
   */
  label: string;
  /**
   * Renamed from the storage column `provider`. Stored as a free-form string — the backend enforces only that it is non-empty on create, so values outside google/outlook/webcal are accepted and echoed back.
   */
  type: string;
  /**
   * Subscription URL (webcal/ICS). Omitted when empty.
   */
  url?: string;
  enabled: boolean;
  /**
   * UTC RFC3339. Omitted entirely (not null) when the calendar has never been synced.
   */
  last_synced_at?: string;
}
/**
 * Body of POST /api/personal-calendars. Note these are storage-side names, not DTO names.
 */
export type PersonalCalendarCreateRequest = {
  /**
   * Required and must be non-empty, otherwise 400 `provider required`. Any non-empty string is accepted; there is no allow-list.
   */
  provider: string;
  /**
   * Defaults to the literal "Personal" when empty or absent.
   */
  name?: string;
  /**
   * Optional; stored as "" when absent.
   */
  url?: string;
  /**
   * Not a pointer in Go, so an ABSENT key becomes `false` — the calendar is created disabled. Clients that want it active must send `true` explicitly.
   */
  enabled?: boolean;
}
/**
 * Body of PATCH /api/personal-calendars/{id}. Pointer fields with SQL COALESCE, so null and absent both mean "unchanged". `provider` is not patchable.
 */
export type PersonalCalendarPatchRequest = Partial<{ name: (string | null), url: (string | null), enabled: (boolean | null) }>
/**
 * calendar.GenericEvent, with explicit json tags since PAC-26 (API-029). All four keys are always present (no omitempty). Before PAC-26 the struct had no tags and the keys were `ID`, `Title`, `Start`, `End`.
 */
export type PersonalCalendarPreviewEvent = { id: string, title: string, start: string, end: string }
/**
 * Several handlers (and requireAuth) use Go's http.Error instead of
 * writeError. http.Error forces `Content-Type: text/plain; charset=utf-8`
 * and appends a newline, so these responses are NOT JSON documents even
 * when the message text happens to be JSON-shaped
 * (e.g. `{"error":"unauthorized"}` from requireAuth and handlers_me.go).
 */
export type PlainTextError = string
export type PrefillUrlResponse = {
  /**
   * Relative URL beginning with "/app?".
   */
  prefill_url: string;
}
/**
 * Body of the 200 of `disconnectMicrosoft` and `disconnectZoom` (PAC-67,
 * spec AC-13 to AC-17, D-2). Says which provider was disconnected and
 * what became of the grant at the provider. The local credential is gone
 * whatever `revocation` says: a revocation that could not be confirmed
 * never blocks local removal (spec D-2). Carries no token material.
 */
export type ProviderDisconnectResult = {
  /**
   * `outlook` from `disconnectMicrosoft`, `zoom` from `disconnectZoom`.
   */
  provider: ("outlook" | "zoom");
  /**
   * - `confirmed`: the provider answered success to the revocation
   *   request (Zoom only).
   * - `unconfirmed`: a credential was removed and its revocation is
   *   not confirmed (Zoom only): either a revocation was attempted and
   *   the provider refused it, answered an error, or could not be
   *   reached; or no revocation could be attempted, because the stored
   *   credential does not decode or its expired access token could not
   *   be renewed (see `disconnectZoom`). The client must tell the user
   *   that revocation at the provider could not be confirmed (spec
   *   AC-15, D-2) and must not show a plain success.
   * - `not_offered`: the provider offers no revocation of this one
   *   grant that Paceday may call, so none was attempted (Outlook
   *   always, spec AC-17, D-5). The client tells the user the grant
   *   can be removed from their account at the provider.
   * - `nothing_stored`: the caller held no credential for this
   *   provider; nothing was removed or sent, and no activity entry
   *   was written.
   */
  revocation: ("confirmed" | "unconfirmed" | "not_offered" | "nothing_stored");
}
/**
 * A host shown on the public booking page. Only accepted hosts appear.
 */
export type PublicHost = {
  email: string;
  /**
   * Omitted when the user record has no name (json `name,omitempty`).
   */
  name?: string;
  /**
   * Omitted when empty (json `avatar_url,omitempty`).
   */
  avatar_url?: string;
}
/**
 * backend/api/handlers_booking.go bookingConfirmationDTO, returned by POST /api/book/{slug} with 201.
 */
export type PublicBookingConfirmation = {
  id: string;
  link_slug: string;
  /**
   * The link's title, not a per-booking title.
   */
  title: string;
  /**
   * UTC, formatted with time.RFC3339 (second precision, always a `Z` offset).
   */
  start: string;
  /**
   * UTC, formatted with time.RFC3339.
   */
  end: string;
  /**
   * Computed as end-start, truncated to whole minutes.
   */
  duration_minutes: number;
  /**
   * Accepted hosts. Always an array, never null.
   */
  hosts: Array<PublicHost>;
  booker_name: string;
  booker_email: string;
  /**
   * Omitted when empty (json `notes,omitempty`).
   */
  notes?: string;
}
/**
 * engine.AvailableSlot. Times are Go time.Time marshalled as RFC3339 with nanoseconds.
 */
export type PublicBookingSlot = { start: string, end: string }
/**
 * How many accepted hosts had a STORED Google calendar token when the page was rendered. `total` counts accepted hosts whose user record resolved; `checked` counts those among them for whom a Google token row loads, whether or not that token still works. Nothing is renewed or tested to compute it. A host whose Google credential is dead, including one whose loss Paceday has recorded (PAC-67), still counts as checked, while the slots are computed without that host's calendar; a host with no Google token row at all (for example one on Outlook) is not counted as checked. This is deliberate: counting only usable tokens would tell every visitor with the link that a host's connection is dead (spec PAC-67 D-14, AC-28). Before PAC-67 this description said "a usable OAuth token", which was not what the server counted (factory section 7.2). Always present, even as {0,0}.
 */
export type PublicLinkCoverage = { total: number, checked: number }
/**
 * backend/api/handlers_booking.go publicLinkDTO.
 */
export type PublicLinkInfo = {
  slug: string;
  title: string;
  /**
   * Allowed meeting lengths in minutes, straight from the link's duration_options column.
   */
  durations: Array<number>;
  /**
   * Accepted hosts only. Always an array, never null.
   */
  hosts: Array<PublicHost>;
  min_notice_minutes: number;
  /**
   * Defaults to `reusable` when the stored value is empty.
   */
  usage_type: ("reusable" | "recurring" | "single_use");
  coverage: PublicLinkCoverage;
}
/**
 * Both keys are always present. Exactly one is populated depending on whether the `date` query parameter was supplied.
 */
export type PublicSlotsResponse = {
  /**
   * Populated only when `date` was given; otherwise the empty array.
   */
  slots: Array<PublicBookingSlot>;
  /**
   * Populated only when `date` was omitted; YYYY-MM-DD strings for days within the next 60 that have at least one bookable slot. Otherwise the empty array.
   */
  available_dates: Array<string>;
}
/**
 * Response of GET /api/calendar/freebusy: `map[string][]calendar.TimeSlot` keyed by the calendar id Google echoed back (normally the attendee email).
 */
export type RawGoogleFreeBusyMap = Record<string, Array<RawGoogleBusyWindow>>
export type ScanCandidate = {
  email: string;
  /**
   * Taken from the calendar attendee's displayName; can be the empty string when the provider supplied none.
   */
  display_name: string;
  /**
   * True when this email already has an assignment on the selected team.
   */
  already_assigned: boolean;
}
export type ScanConfirmRequest = {
  /**
   * Required and non-null; an empty array is legal. Each entry is lowercased, trimmed and validated. Decoded with DisallowUnknownFields.
   */
  emails: Array<string>;
}
export type ScanConfirmation = {
  team_id: string;
  /**
   * Assignments newly created by THIS call.
   */
  assigned: number;
  /**
   * Counts blank entries, duplicates within this request, emails with no global manager_team_members identity, and emails already assigned to this team.
   */
  skipped: number;
  /**
   * Total assignments for this manager+team after the transaction commits.
   */
  total: number;
}
export type ScanPreview = {
  team_id: string;
  /**
   * RFC3339 UTC, set by the engine at the start of the scan.
   */
  scanned_at: string;
  /**
   * Total candidates returned by the scan (== candidates.length).
   */
  detected: number;
  /**
   * Candidates not already assigned to this team.
   */
  eligible: number;
  assigned: 0;
  /**
   * detected - eligible, i.e. candidates already assigned to this team.
   */
  skipped: number;
  /**
   * Always an array (the engine initialises it to an empty slice). Sorted by email ascending.
   */
  candidates: Array<ScanCandidate>;
}
/**
 * Anonymous struct in scheduleHandlers.createMeeting. snake_case.
 */
export type ScheduleCreateRequest = ({
  /**
   * Becomes the Google event Summary. Not required by the handler.
   */
  title?: string;
  /**
   * RFC3339. Parse failure -> 400.
   */
  start: string;
  /**
   * RFC3339. Parse failure -> 400.
   */
  end: string;
  attendees?: Array<string>;
  description?: string;
  location?: string;
} & Record<string, unknown>)
export type ScheduleOneOnOneRequest = (Partial<{
  /**
   * YYYY-MM-DD. Optional; when present it is appended to the prefill URL as `date`. An empty string is treated as absent.
   */
  suggested_date: string;
}> & Record<string, unknown>)
/**
 * Anonymous struct in scheduleHandlers.suggestMeeting. snake_case.
 */
export type ScheduleSuggestRequest = ({
  /**
   * Not validated by the handler; 0 is accepted.
   */
  duration_minutes?: number;
  attendees?: Array<string>;
  /**
   * RFC3339. Required in practice - a parse failure is a 400.
   */
  range_start: string;
  /**
   * RFC3339. Required in practice.
   */
  range_end: string;
  title?: string;
} & Record<string, unknown>)
/**
 * engine.ScheduleSuggestions.
 */
export type ScheduleSuggestions = {
  /**
   * At most 3 entries; `[]` when no candidate survived.
   */
  slots: Array<SuggestedSlot>;
}
/**
 * The JSON error shape produced by api.writeError (handlers_settings.go:206). Emitted with `Content-Type: application/json`. Every 5xx in this domain uses it, with a fixed server-chosen message (PAC-21). Handlers that use the Go stdlib `http.Error` for a 4xx return text/plain and do NOT use this shape; each response above says which applies. The 401 from requireAuth is a hybrid: the body text is `{"error":"unauthorized"}` but it is written through http.Error, which overwrites the Content-Type to `text/plain; charset=utf-8`.
 */
export type SchedulingErrorResponse = { error: string }
/**
 * backend/api/handlers_scheduling_links.go schedulingHostDTO - the host shape embedded in SchedulingLink. Distinct from SchedulingLinkHostRecord, which is the raw DB row returned by POST /{id}/hosts.
 */
export type SchedulingLinkHost = {
  /**
   * Declared `user_id,omitempty` but always populated from a uuid.UUID, so in practice always present.
   */
  user_id: string;
  /**
   * Empty string when the user record could not be loaded.
   */
  email: string;
  /**
   * Omitted when empty.
   */
  name?: string;
  /**
   * Omitted when empty.
   */
  avatar_url?: string;
  is_owner: boolean;
  /**
   * Not constrained by the DB layer; these are the only three values the handlers write.
   */
  status: ("pending" | "accepted" | "declined");
}
/**
 * backend/api/handlers_scheduling_links.go schedulingLinkDTO. Note the DTO field names deliberately differ from the storage json tags (`durations` vs `duration_options`, `days` vs `days_of_week`, `owner_id` vs `owner_user_id`, `window_start` vs `window_start_time`).
 */
export type SchedulingLink = {
  id: string;
  owner_id: string;
  title: string;
  /**
   * Lowercase alphanumerics separated by single dashes (normalizeSlug).
   */
  slug: string;
  durations: Array<number>;
  /**
   * Weekday abbreviations mapped from the stored 0-6 integers, Sunday = "sun".
   */
  days: Array<("sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat")>;
  /**
   * Read back from the Postgres TIME column, so it comes out as "HH:MM:SS" even though the handler normalises the input to "HH:MM" before writing (confirmed by handlers_scheduling_links_test.go:91 expecting "10:00:00").
   */
  window_start: string;
  window_end: string;
  buffer_before: number;
  buffer_after: number;
  min_notice_minutes: number;
  usage_type: ("reusable" | "recurring" | "single_use");
  /**
   * Present only for `recurring` links. Forced to null (and therefore omitted, json `max_uses,omitempty`) for reusable and single_use.
   */
  max_uses?: number;
  /**
   * Count of non-cancelled bookings, computed by subquery at read time.
   */
  uses_count: number;
  active: boolean;
  /**
   * Every host regardless of status, ordered by invited_at. Always an array, never null.
   */
  hosts: Array<SchedulingLinkHost>;
  /**
   * UTC, Go layout "2006-01-02T15:04:05.000Z07:00" (millisecond precision).
   */
  created_at: string;
  /**
   * True when owner_id equals the authenticated caller.
   */
  is_owner: boolean;
  /**
   * The caller's own host status. Omitted (json `my_status,omitempty`) when the caller is not among the link's hosts.
   */
  my_status?: ("pending" | "accepted" | "declined");
}
/**
 * Raw backend/storage/scheduling_links.go Booking row, returned by GET /api/scheduling-links/{id}/bookings. Field names differ from PublicBookingConfirmation.
 */
export type SchedulingLinkBookingRecord = {
  id: string;
  link_id: string;
  booker_name: string;
  booker_email: string;
  start_time: string;
  end_time: string;
  /**
   * DB default is `confirmed`; `cancelled` rows are excluded from uses_count and from conflict checks.
   */
  status: string;
  /**
   * No omitempty - always present, possibly the empty string.
   */
  notes: string;
  created_at: string;
}
/**
 * backend/api/handlers_scheduling_links.go hostInviteDTO.
 */
export type SchedulingLinkHostInvite = {
  /**
   * The value to pass as `{id}` when accepting or declining.
   */
  link_id: string;
  link_title: string;
  /**
   * May be the empty string if the owner record has no name.
   */
  owner_name: string;
  owner_email: string;
  /**
   * UTC, Go layout "2006-01-02T15:04:05.000Z07:00".
   */
  invited_at: string;
}
/**
 * Raw backend/storage/scheduling_links.go LinkHost row, returned by POST /api/scheduling-links/{id}/hosts. Not the same shape as the `hosts[]` entries inside SchedulingLink.
 */
export type SchedulingLinkHostRecord = {
  /**
   * Host-row id. Note that accept/decline key on link_id, so this id is never used as a path parameter.
   */
  id: string;
  link_id: string;
  user_id: string;
  status: ("pending" | "accepted" | "declined");
  /**
   * Raw time.Time marshalling (RFC3339 with nanoseconds and the DB offset), not the DTO millisecond format.
   */
  invited_at: string;
  /**
   * Omitted while null (json `responded_at,omitempty`). Set by accept/decline.
   */
  responded_at?: string;
}
/**
 * Echo of the status that was written. The only 200 body accept/decline returns.
 */
export type SchedulingLinkInviteResponse = { status: ("accepted" | "declined") }
/**
 * GET /api/scheduling-links. Both arrays are always present, never null.
 */
export type SchedulingLinkListResponse = {
  owned: Array<SchedulingLink>;
  /**
   * Links where the caller is an accepted co-host but not the owner.
   */
  shared: Array<SchedulingLink>;
}
/**
 * storage.WorkingHoursSchedule. Replaced WHOLE by a PATCH that mentions it; there is no deep merge (spec AC-9).
 * **Normalised on read** by `Settings.normalizeSchedules` (`backend/storage/settings.go:92-106`), which `loadScheduleFields` calls on every read path (`:495`): an empty `mode` becomes `{mode: all_days, default: {enabled: true, start: workStart or 09:00, end: workEnd or 18:00}, days: {}}`; an `all_days` document whose `default` is entirely empty (`enabled:false, start:"", end:""`) has that default replaced the same way (`:95-99`); and a nil `days` map becomes `{}`.
 * **So `{"mode":"all_days","default":{"enabled":false,"start":"","end":""}, "days":{}}` is NOT a document GET can return** - the `:95-99` branch rewrites it before it reaches the wire. That matters because it is the one document the shipped consumer cannot render: `normalizeInterval` rejects an empty `start`/`end` and returns `undefined` (`smart-calendar-flow/src/api/client.ts:477-488`), `normalizeWorkingHours` then returns `undefined` because `default` is undefined and `days` is empty (`:505-517`), and `normalizeSettings` reaches `delete out.working_hours` (`:543`) - the per-day section disappears with no error and no empty state, which is the silent blank spec AC-20 exists to end.
 * The `by_day` arm of the same shape IS reachable, because `:95-99` guards on `mode == "all_days"`: `{"mode":"by_day", …, "days":{}}` normalises to itself and produces the identical `undefined` in the consumer. PAC-24 closes it at the point of entry rather than describing it - a `by_day` document must carry at least one weekday (400: `workingHours.days must contain at least one weekday when mode is by_day`). `by_day` with no days also means "this user never works", which no consumer intends and which `WorkWindow` already renders as `enabled:false` for every day (`:117-121`).
 */
export type WorkingHoursSchedule = {
  /**
   * Compared EXACTLY by the handler (revision 3): `"BY_DAY"` and `" all_days"` are a 400. Before PAC-24 the validator lower-cased and trimmed, then persisted whatever was sent. Migration 024 turns a stored mode that equals `by_day` ignoring case (and NOT trimmed: `" by_day"` never matched) into `by_day`, and any other non-empty value into `all_days` - exactly how `WorkWindow` treated them (it only special-cases `by_day`, case-insensitively). It also clears an enabled entry that would fail validation in the half the stored mode ignored before the upgrade (`days` under `all_days`, `default` under `by_day`), which `WorkWindow` never read. It does not touch the half in use, nor a `default` derived on read for a mode-`""` row: a write of `workingHours` must make those valid (see `SettingsUpdate`).
   * `''` is in the enum because the server accepts it (`:129`, `mode != "" && mode != "all_days" && mode != "by_day"`) and because the contract must describe what is, not what should be (factory §7). Revision 1 of this contract omitted `''` while the description two lines below said it was accepted - a schema disagreeing with its own prose. It is accepted on write ONLY when `days` is empty; otherwise it is the existing 400 `workingHours.mode is required when day-specific hours are provided` (`:132-134`). That conditional is cross-property and OpenAPI cannot express it, so it stays a documented 400 rather than becoming a schema narrowing - narrowing here would be a NEW rejection, and spec §6 requires both tests in `backend/api/handlers_settings_schedule_test.go` to keep passing unchanged.
   * A GET never returns `''`, because normalisation rewrites it.
   */
  mode: ("" | "all_days" | "by_day");
  default: DaySchedule;
  /**
   * Keys are lowercase English weekday names, and PAC-24 makes that a constraint THE HANDLER ENFORCES (revision 3): `propertyNames` below documents it, but no generator carries `propertyNames` into a validator, so the server's exact-match check is the enforcement point (contract challenge r2, finding 4). Migration 024 removes stored keys that are not exactly one of the seven names - they never matched `WorkWindow`'s lookup, so removing them changes no behaviour; it also removes entries whose `start`/`end` are neither empty nor a clock. Keys and entries are checked WHATEVER THE MODE (revision 4): a `days` map stored under `all_days` is still returned by GET. Before PAC-24 the validator lower-cased keys and only looked at `days` in `by_day` mode, so `"Monday"` was stored and never matched. In `by_day` mode a missing weekday means "not working".
   */
  days: Record<string, DaySchedule>;
}
/**
 * The settings document for ONE user, returned by GET and by PATCH. Every property is always present. It has NO `llmApiKey` property at all: the key is write-only and is never returned (spec AC-11); `llmApiKeySet` reports whether one is on file. Property names come straight from the json tags on storage.Settings, camelCase throughout. `ID`, `MicrosoftTokens` and `ZoomTokens` are `json:"-"` and never appear.
 * PAC-24 revision 3 makes this a concrete schema rather than an `allOf` over a shared field set with `readOnly`/`writeOnly` markers: all three generators (oapi-codegen, openapi-typescript, typed-openapi) dropped those markers and generated a response type carrying `llmApiKey`, and typed-openapi also dropped the `required` list (contract challenge, revision 2, finding 1). The property map is shared with `SettingsUpdate` through a YAML anchor, so the two cannot drift; every `Settings` document is a valid `SettingsUpdate` body.
 * Every value this schema forbids has been normalised away in storage by migration 024 (see `SettingsUpdate` and contracts/features/PAC-24.md, Revisions 3 and 4), so a GET always satisfies it.
 */
export type Settings = {
  /**
   * `HH:MM`, OR THE EMPTY STRING. DB default `09:00`. PAC-24 tightened the shape from `^[0-9]{2}:[0-9]{2}$`, which admitted `99:99` (the server's own check was the same loose regexp, so `99:99` was stored), and at the same time widened it to admit `""`, which the server both accepts and returns.
   * `""` is not a modelling slip, it is the state the data is in. `validateSettings` skips the format check exactly when the value is empty (`backend/api/handlers_settings.go:75`, `if val != "" && !timePattern.MatchString(val)`), and every row zeroed by API-004 - the defect this feature exists to repair - already holds `""` in this column, because the pre-PAC-24 full replace persisted each omitted property as its Go zero value. A strict `HH:MM` pattern would make day-one GETs fail the contract they were generated from, and the generated zod schema would reject the body before any UI saw it. It is also what makes spec AC-7 satisfiable: `{"workStart": ""}` is the documented way to clear this setting, and under the merge rule a present property is stored exactly as given.
   * Consumers already treat `""` as meaningful rather than as damage: `WorkWindow` falls back to `09:00`/`18:00` when the effective start or end is empty (`backend/storage/settings.go:124-127`). The same widening, for the same reason, was already applied to `DaySchedule.start`/`end`. Contrast `recapSendTime`, which is NOT widened - see its own description.
   */
  workStart: string;
  /**
   * `HH:MM` or `""`, as `workStart`. DB default `18:00`. PAC-24 adds the cross-property check that workEnd > workStart, which OpenAPI cannot express; it is a 400 (`workEnd must be after workStart`). That check applies only when BOTH values are non-empty, which is the existing handler behaviour and keeps `""` a clear rather than a 400. Before PAC-24 an inverted working day was accepted and produced a zero-length day at use (API-082).
   */
  workEnd: string;
  /**
   * IANA name, e.g. `Europe/Paris`. DB default `UTC`. PAC-24 validates it with time.LoadLocation and returns 400 `timezone is not a known IANA location`. Before PAC-24 any string was accepted and every engine silently fell back to UTC, so a typo moved a user's whole schedule with no error anywhere (API-082).
   */
  timezone: string;
  /**
   * Rejected when < 0. DB default 25.
   */
  focusMinBlockMinutes: number;
  /**
   * Rejected when < 0. DB default 120. PAC-24 adds the cross-property check focusMinBlockMinutes <= focusMaxBlockMinutes, which OpenAPI cannot express; it is a 400 (API-082).
   */
  focusMaxBlockMinutes: number;
  /**
   * Rejected when < 0. DB default 240.
   */
  focusDailyTargetMinutes: number;
  /**
   * Weekly allowance of meetings outside working hours. 0 disables out-of-hours scheduling entirely (canScheduleOutOfHours returns false when <= 0).
   */
  outOfHoursMeetingsPerWeek: number;
  autoDeclineOutsideWorkingHours: boolean;
  /**
   * DB default `Focus Time`.
   */
  focusLabel: string;
  /**
   * Hex colour string. Not validated. DB default `#4F46E5`.
   */
  focusColor: string;
  /**
   * `HH:MM` or `""`. DB default `12:00`. Legacy global; overridden per-day by lunchBreaks. `""` here is the strongest case of the four: it is not merely tolerated but LOAD-BEARING. `LunchWindow` returns `enabled: false` precisely when `lunchStart` or `lunchEnd` is empty (`backend/storage/settings.go:141-142`), so `""` is how "this user has no protected lunch" is represented. Forbidding it in the schema would make an existing, meaningful state unrepresentable.
   */
  lunchStart: string;
  /**
   * `HH:MM` or `""`, as `lunchStart`. DB default `13:00`. PAC-24 adds the cross-property check lunchEnd > lunchStart as a 400 (API-082), applied only when both values are non-empty.
   */
  lunchEnd: string;
  /**
   * DB default true.
   */
  protectLunch: boolean;
  /**
   * Rejected when < 0. DB default 5.
   */
  bufferBeforeMinutes: number;
  /**
   * Rejected when < 0. DB default 5.
   */
  bufferAfterMinutes: number;
  bufferEnabled: boolean;
  /**
   * PAC-24 adds the `>= 0` check its two siblings already had; before that a negative value was accepted here alone (API-082).
   */
  bufferMinMeetingMinutes: number;
  bufferSkipBackToBack: boolean;
  workingHours: WorkingHoursSchedule;
  lunchBreaks: LunchBreakSchedule;
  compressionEnabled: boolean;
  autoScheduleEnabled: boolean;
  /**
   * 5-field cron (minute hour dom month dow), parsed with robfig/cron v3 using exactly those five fields. Empty string skips validation. DB default `0 8 * * *`.
   */
  autoScheduleCron: string;
  /**
   * The caller's AI choice (NEW-llm-bring-your-own, spec §3; the table is on `AINotConfigured`). `""`: AI off by the caller's own choice (row 1). A row stored as `""` before this change stays off and never follows the organisation (spec AC-17, D-9). `organization`: use my organisation's AI (rows 4-6). The stored default for an account created after Part 1 (owner decision O-5). Part 2: requests then use the organisation's configuration once it is complete and the caller has confirmed it (confirmOrganizationAI). Accepted on write whether or not the caller belongs to an organisation (for a caller with none it is row 6 with `enablers: [user]`). `openai`, `anthropic`, `azure_openai`, `bedrock`, `vertex`: the caller's own key-based provider (rows 2-3; rows 10-11 while the caller's organisation forbids personal keys, Part 2). Writing `""` or a provider deletes the caller's organisation confirmation (Part 2, spec P2-AC-36). A row stored on `bedrock`, `azure_openai` or `vertex` before this change keeps that choice and its stored destination values, and needs a key (spec AC-8, AC-40). `unsupported`: a READ value only in effect. The stored choice is a provider Paceday no longer supports (`ollama`; rows 7-8). The stored value is not rewritten (spec D-10), so a rollback restores it. A write carrying `unsupported` is accepted only when the caller's row already reads as `unsupported` (the document read and written back unchanged, spec AC-9); otherwise it is a 400. `ollama` is never returned and is a 400 on write (spec AC-6, AC-7).
   */
  llmProvider: ("" | "organization" | "unsupported" | "openai" | "anthropic" | "azure_openai" | "bedrock" | "vertex");
  /**
   * Model for `openai` and `anthropic`. Provider default applied at call time when empty: `gpt-4o-mini` (openai), `claude-haiku-4-5-20251001` (anthropic). Not used by `azure_openai` (`azureDeployment`), `bedrock` (`bedrockModel`) or `vertex` (`vertexModel`).
   */
  llmModel: string;
  /**
   * `true` exactly when a key bound to the CURRENT `llmProvider` is on file; always `false` when `llmProvider` is `""`, `organization` or `unsupported` (NEW-llm-bring-your-own, spec D-5). Before that change it meant "the single key slot is non-empty". It never says anything about an organisation's key.
   * `readOnly`, so a client that submits back a document it just read may include it; it is accepted and ignored (PAC-24 AC-10). It is NOT the way to clear a key - send `llmApiKey: ""` for that.
   */
  llmApiKeySet: boolean;
  llmApiKeysSet: LLMApiKeysSet;
  /**
   * Read-only (NEW-llm-bring-your-own, spec AC-16). `true` when a key stored before this change is on file that is bound to no provider: the account's provider at the upgrade was not `openai` or `anthropic`. Such a key is never sent anywhere and is never deleted implicitly (spec D-5): not by the upgrade and not by a write of `llmApiKey`. Only the explicit write-only `llmUnboundApiKey: ""` removes it (see `patchSettings`). Accepted and ignored on write.
   */
  llmUnboundApiKeySet: boolean;
  aiStatus: AIStatus;
  /**
   * Destination of the `openai` or `anthropic` provider; `""` means the vendor's public host (`https://api.openai.com`, `https://api.anthropic.com`). Read by no other provider (NEW-llm-bring-your-own: the Ollama fallback is gone). A request is sent to it only when it is exactly an origin approved for the provider in use followed by exactly that approval's path prefix, if it has one (owner decision O-10), with at most one trailing `/` (see `testLLMConnection`). A write changing it to a non-empty value must be approved, in that sense, for `openai` or `anthropic` (400 otherwise). A value stored earlier that is approved for neither (for example an origin written through the web's former Ollama field, spec D-14) is kept and returned, sent nowhere, can be written back unchanged and can always be cleared with `""` (spec AC-39). No `pattern`, for the reason given on `awsRegion`.
   */
  llmBaseUrl: string;
  /**
   * Bedrock region. Empty means the built-in `us-east-1`. The request goes to `bedrock-runtime.<awsRegion>.amazonaws.com`, only if that host is approved in `PACEDAY_LLM_APPROVED_HOSTS_BEDROCK`. No AWS configuration of the deployment is read (NEW-llm-bring-your-own, spec D-3). A write changing it to a non-empty value must be a valid region name (one host label; PAC-66). Deliberately no `pattern`: this map is shared with `Settings`, and rows stored before PAC-66 are kept as they are (PAC-66 spec D-3), so a pattern would make the response schema false for them.
   */
  awsRegion: string;
  /**
   * The Bedrock model ID requests use (NEW-llm-bring-your-own, spec D-16). This is the property the server has always read for Bedrock; the web app's Bedrock picker writes it from this change on (before, it wrote `llmModel`, which never reached the server, and that earlier pick is not copied). DB default `anthropic.claude-sonnet-4-5-20251001-v1:0`.
   */
  bedrockModel: string;
  /**
   * Azure OpenAI resource endpoint, e.g. `https://my-resource.openai.azure.com`. PAC-66: a write changing it to a non-empty value must be an `https` URL whose host is approved in `PACEDAY_LLM_APPROVED_HOSTS_AZURE_OPENAI` (400 otherwise). `""` is always accepted and means "not set", which is refused when a request would be sent. The path is not constrained (see `contracts/features/PAC-66.md` §7). No `format` or `pattern`, for the reason given on `awsRegion`.
   */
  azureEndpoint: string;
  /**
   * The Azure OpenAI deployment name requests use.
   */
  azureDeployment: string;
  /**
   * The `api-version` query value of Azure OpenAI requests.
   */
  azureApiVersion: string;
  /**
   * The Vertex AI model requests use, in express mode (NEW-llm-bring-your-own, spec D-4). DB default `gemini-2.0-flash-001`. `awsProfile`, `gcpProject`, `gcpLocation`, `ollamaBaseUrl` and `ollamaModel` are removed from this document: they only meant something in the removed modes. Their stored values are left untouched, are no longer read, and come back on a rollback (spec D-10); writing one is a 400 `unknown property: <name>`.
   */
  vertexModel: string;
  /**
   * DB default `google`. Which calendar the product reads and writes for THIS user.
   * Resolves U-18. The authoritative set was settled by reading the three consumers that switch on this value - calendar.NewProvider (`backend/calendar/client_factory.go:16,22,27`), the auth-status handler (`backend/api/handlers_auth.go:97,105,111`) and the free/busy service (`backend/engine/freebusy_service.go:122`). All three accept exactly `outlook` and `webcal` and treat every other value, including a typo, as Google. PAC-24 enforces the set; before it, an unknown value was stored and silently behaved as `google`.
   * Before PAC-24 this was a property of the singleton row, so one user connecting Outlook switched the whole deployment (`backend/auth/microsoft_oauth.go:57` writes `calendar_provider = 'outlook' WHERE id = 1`).
   */
  calendarProvider: ("google" | "outlook" | "webcal");
  webcalUrl: string;
  /**
   * The address of THIS user's connected calendar. Before PAC-24 the auth-status handler served the singleton row's value to everyone (API-009).
   */
  calendarEmail: string;
  /**
   * Read with `COALESCE(conferencing_provider,'meet')`; conference.NewProvider switches on `zoom`, `teams`, and treats everything else as `meet`. So the wire values are `meet` / `zoom` / `teams`, not the frontend's `google_meet` / `zoom` / `teams` / `custom`. PAC-24 enforces the set for the same reason as calendarProvider: an unknown value was stored and silently behaved as `meet`.
   */
  conferencingProvider: ("meet" | "zoom" | "teams");
  recapEnabled: boolean;
  /**
   * `HH:MM`, in the same form on read and on write. **STRICT: unlike the four legacy clock properties above, `""` is NOT admitted here, in either direction.** The three reasons are specific to this column and do not generalise:
   * (a) There is no empty state to represent. The column is `TIME NOT NULL DEFAULT '08:00'` (`015_daily_recap.up.sql:3`), and the write path passes every value through `recapSendTimeOrDefault` (`backend/storage/settings.go:356-361`), which turns `""` into `08:00`. So no row can hold an empty send time and no GET can return one - the `COALESCE(...,'')` at `:224` and `:439` is defensive and unreachable. This is the difference from `workStart`/`lunchStart`, where `""` both exists in the data and carries meaning.
   * (b) Admitting `""` would make this contract lie about its own merge rule. `PATCH /api/settings` states that a property present is set to exactly the value given; `""` here would instead be silently rewritten to `08:00`. A client asking to clear a value and being told `200` while the server stored something it did not ask for is the exact silent-success failure mode this contract refuses for `null`.
   * (c) PAC-24 therefore removes the substitution: `""` is a 400 (`recapSendTime must be in HH:MM format`), which is the same message spec AC-17 already requires for a malformed value and which AC-16 requires instead of an internal failure.
   * **This requires a narrow amendment to spec AC-7**, which as written says an empty value of a setting's type always clears it. AC-7 must exempt `recapSendTime` on the ground that it has no empty state. The contract author may not edit the spec; the amendment is named in `contracts/features/PAC-24.md` §"Revision 2" and must be made before stage 3.
   * Resolves U-19, and resolves it by CHANGING the server rather than by documenting what it did. The column is Postgres `TIME` (`015_daily_recap.up.sql:3`) and was read as `recap_send_time::TEXT`, which renders `HH:MM:SS` (`08:00:00`, with a fractional part when one was stored) - contradicting the struct comment that claims `HH:MM` and contradicting the write format, so no client could round-trip this value. PAC-24 renders the column to `HH:MM` on read and rejects anything else on write. Note: the marker was originally to be settled by observing a live response; it is settled here by fixing the asymmetry instead, which makes the observation unnecessary. Spec AC-16 is the integration test that proves the rendered form.
   */
  recapSendTime: string;
  /**
   * DB CHECK constraint enforces this. PAC-24 validates it on the settings write too; before that only the daily-recap PATCH did, so a bad value sent to PUT /api/settings reached the DB CHECK and surfaced as a 500 (API-081).
   */
  recapSendTo: ("dm" | "channel");
  recapChannelId: string;
  /**
   * DB default true.
   */
  recapIncludeBriefs: boolean;
  /**
   * DB default true. Exposed as `include_focus_blocks` by the daily-recap endpoints.
   */
  recapIncludeFocus: boolean;
  /**
   * DB default true.
   */
  recapIncludeHabits: boolean;
  /**
   * How the signed-in web app shows times of day to this user (PAC-55): `12h` ("2:30 PM", the default, exactly as before PAC-55) or `24h` ("14:30", two-digit hour, no AM/PM). DB default `12h`; a user who never chose reads `12h`. There is no "unset": `""` and any other STRING are a 400 `timeFormat must be 12h or 24h`; a non-string (`24`, `true`, `["24h"]`) fails decoding first and is a 400 `invalid JSON: timeFormat has the wrong type`; `null` is a 400 like every property of this body. Display only: the server formats nothing with it, and the public booking page ignores it (always 12-hour, PAC-55 §5).
   */
  timeFormat: ("12h" | "24h");
  /**
   * Server-managed (NOW() on every write). May be present in a request body - a client submitting back a document it just read will include it - and is ignored (spec AC-10).
   */
  updatedAt: string;
}
/**
 * PATCH /api/settings body - the only settings write. Nothing is required: a property absent means "leave it as it is", and `{}` is a valid no-op request. A property present is applied exactly as given - `""`, `0` and `false` are values, not absences, except where a property's enum or pattern excludes `""` (`recapSendTime`, `recapSendTo`, `calendarProvider`, `conferencingProvider`, `timeFormat`), where `""` is a 400 like any other value outside the set (spec AC-7 as amended 2026-10-12).
 * The same properties as `Settings` (one YAML anchor) plus the write-only `llmApiKey` and `llmUnboundApiKey`. `llmApiKeySet`, `llmApiKeysSet`, `llmUnboundApiKeySet`, `aiStatus` and `updatedAt` are accepted and ignored, so a document read from GET can be submitted back unchanged (spec AC-10; NEW-llm-bring-your-own AC-9).
 * No property is nullable: `null` is a 400 `<property> must not be null` and an unknown property - including a snake_case spelling of a real one - is a 400 `unknown property: <name>` (spec AC-8). These are enforced by the handler, not by a generated validator.
 * Validation applies to the properties whose value the body CHANGES. A property sent with the value already stored is not re-validated, so a GET document submitted back unchanged is always accepted - including a legacy combination a newer cross-property rule would reject (an end before a start, a focus minimum above the maximum) - and a stored value never locks the user out of saving something else (challenge r2, finding 2).
 * `workingHours` is ONE property and is replaced whole, so a write that changes it must make the whole document valid: both its `default` and its `days`, whatever the mode. That includes a `default` the client derived from legacy values - for a row whose mode was `""` the server derives it from `workStart`/`workEnd` on read - so a client switching such a row to `by_day` must send a valid `default` (revision 6).
 * `workingHours` and `lunchBreaks` are replaced whole when present, not deep-merged (spec AC-9).
 * Before PAC-24 this was the body of `PUT /api/settings`, a replace: every omitted property was persisted as its Go zero value (API-004). That operation is removed because the two repositories deploy together (spec PAC-24, Decisions 2026-10-12, OQ-3).
 */
export type SettingsUpdate = Partial<{
  /**
   * `HH:MM`, OR THE EMPTY STRING. DB default `09:00`. PAC-24 tightened the shape from `^[0-9]{2}:[0-9]{2}$`, which admitted `99:99` (the server's own check was the same loose regexp, so `99:99` was stored), and at the same time widened it to admit `""`, which the server both accepts and returns.
   * `""` is not a modelling slip, it is the state the data is in. `validateSettings` skips the format check exactly when the value is empty (`backend/api/handlers_settings.go:75`, `if val != "" && !timePattern.MatchString(val)`), and every row zeroed by API-004 - the defect this feature exists to repair - already holds `""` in this column, because the pre-PAC-24 full replace persisted each omitted property as its Go zero value. A strict `HH:MM` pattern would make day-one GETs fail the contract they were generated from, and the generated zod schema would reject the body before any UI saw it. It is also what makes spec AC-7 satisfiable: `{"workStart": ""}` is the documented way to clear this setting, and under the merge rule a present property is stored exactly as given.
   * Consumers already treat `""` as meaningful rather than as damage: `WorkWindow` falls back to `09:00`/`18:00` when the effective start or end is empty (`backend/storage/settings.go:124-127`). The same widening, for the same reason, was already applied to `DaySchedule.start`/`end`. Contrast `recapSendTime`, which is NOT widened - see its own description.
   */
  workStart: string;
  /**
   * `HH:MM` or `""`, as `workStart`. DB default `18:00`. PAC-24 adds the cross-property check that workEnd > workStart, which OpenAPI cannot express; it is a 400 (`workEnd must be after workStart`). That check applies only when BOTH values are non-empty, which is the existing handler behaviour and keeps `""` a clear rather than a 400. Before PAC-24 an inverted working day was accepted and produced a zero-length day at use (API-082).
   */
  workEnd: string;
  /**
   * IANA name, e.g. `Europe/Paris`. DB default `UTC`. PAC-24 validates it with time.LoadLocation and returns 400 `timezone is not a known IANA location`. Before PAC-24 any string was accepted and every engine silently fell back to UTC, so a typo moved a user's whole schedule with no error anywhere (API-082).
   */
  timezone: string;
  /**
   * Rejected when < 0. DB default 25.
   */
  focusMinBlockMinutes: number;
  /**
   * Rejected when < 0. DB default 120. PAC-24 adds the cross-property check focusMinBlockMinutes <= focusMaxBlockMinutes, which OpenAPI cannot express; it is a 400 (API-082).
   */
  focusMaxBlockMinutes: number;
  /**
   * Rejected when < 0. DB default 240.
   */
  focusDailyTargetMinutes: number;
  /**
   * Weekly allowance of meetings outside working hours. 0 disables out-of-hours scheduling entirely (canScheduleOutOfHours returns false when <= 0).
   */
  outOfHoursMeetingsPerWeek: number;
  autoDeclineOutsideWorkingHours: boolean;
  /**
   * DB default `Focus Time`.
   */
  focusLabel: string;
  /**
   * Hex colour string. Not validated. DB default `#4F46E5`.
   */
  focusColor: string;
  /**
   * `HH:MM` or `""`. DB default `12:00`. Legacy global; overridden per-day by lunchBreaks. `""` here is the strongest case of the four: it is not merely tolerated but LOAD-BEARING. `LunchWindow` returns `enabled: false` precisely when `lunchStart` or `lunchEnd` is empty (`backend/storage/settings.go:141-142`), so `""` is how "this user has no protected lunch" is represented. Forbidding it in the schema would make an existing, meaningful state unrepresentable.
   */
  lunchStart: string;
  /**
   * `HH:MM` or `""`, as `lunchStart`. DB default `13:00`. PAC-24 adds the cross-property check lunchEnd > lunchStart as a 400 (API-082), applied only when both values are non-empty.
   */
  lunchEnd: string;
  /**
   * DB default true.
   */
  protectLunch: boolean;
  /**
   * Rejected when < 0. DB default 5.
   */
  bufferBeforeMinutes: number;
  /**
   * Rejected when < 0. DB default 5.
   */
  bufferAfterMinutes: number;
  bufferEnabled: boolean;
  /**
   * PAC-24 adds the `>= 0` check its two siblings already had; before that a negative value was accepted here alone (API-082).
   */
  bufferMinMeetingMinutes: number;
  bufferSkipBackToBack: boolean;
  workingHours: WorkingHoursSchedule;
  lunchBreaks: LunchBreakSchedule;
  compressionEnabled: boolean;
  autoScheduleEnabled: boolean;
  /**
   * 5-field cron (minute hour dom month dow), parsed with robfig/cron v3 using exactly those five fields. Empty string skips validation. DB default `0 8 * * *`.
   */
  autoScheduleCron: string;
  /**
   * The caller's AI choice (NEW-llm-bring-your-own, spec §3; the table is on `AINotConfigured`). `""`: AI off by the caller's own choice (row 1). A row stored as `""` before this change stays off and never follows the organisation (spec AC-17, D-9). `organization`: use my organisation's AI (rows 4-6). The stored default for an account created after Part 1 (owner decision O-5). Part 2: requests then use the organisation's configuration once it is complete and the caller has confirmed it (confirmOrganizationAI). Accepted on write whether or not the caller belongs to an organisation (for a caller with none it is row 6 with `enablers: [user]`). `openai`, `anthropic`, `azure_openai`, `bedrock`, `vertex`: the caller's own key-based provider (rows 2-3; rows 10-11 while the caller's organisation forbids personal keys, Part 2). Writing `""` or a provider deletes the caller's organisation confirmation (Part 2, spec P2-AC-36). A row stored on `bedrock`, `azure_openai` or `vertex` before this change keeps that choice and its stored destination values, and needs a key (spec AC-8, AC-40). `unsupported`: a READ value only in effect. The stored choice is a provider Paceday no longer supports (`ollama`; rows 7-8). The stored value is not rewritten (spec D-10), so a rollback restores it. A write carrying `unsupported` is accepted only when the caller's row already reads as `unsupported` (the document read and written back unchanged, spec AC-9); otherwise it is a 400. `ollama` is never returned and is a 400 on write (spec AC-6, AC-7).
   */
  llmProvider: ("" | "organization" | "unsupported" | "openai" | "anthropic" | "azure_openai" | "bedrock" | "vertex");
  /**
   * Model for `openai` and `anthropic`. Provider default applied at call time when empty: `gpt-4o-mini` (openai), `claude-haiku-4-5-20251001` (anthropic). Not used by `azure_openai` (`azureDeployment`), `bedrock` (`bedrockModel`) or `vertex` (`vertexModel`).
   */
  llmModel: string;
  /**
   * `true` exactly when a key bound to the CURRENT `llmProvider` is on file; always `false` when `llmProvider` is `""`, `organization` or `unsupported` (NEW-llm-bring-your-own, spec D-5). Before that change it meant "the single key slot is non-empty". It never says anything about an organisation's key.
   * `readOnly`, so a client that submits back a document it just read may include it; it is accepted and ignored (PAC-24 AC-10). It is NOT the way to clear a key - send `llmApiKey: ""` for that.
   */
  llmApiKeySet: boolean;
  llmApiKeysSet: LLMApiKeysSet;
  /**
   * Read-only (NEW-llm-bring-your-own, spec AC-16). `true` when a key stored before this change is on file that is bound to no provider: the account's provider at the upgrade was not `openai` or `anthropic`. Such a key is never sent anywhere and is never deleted implicitly (spec D-5): not by the upgrade and not by a write of `llmApiKey`. Only the explicit write-only `llmUnboundApiKey: ""` removes it (see `patchSettings`). Accepted and ignored on write.
   */
  llmUnboundApiKeySet: boolean;
  aiStatus: AIStatus;
  /**
   * Destination of the `openai` or `anthropic` provider; `""` means the vendor's public host (`https://api.openai.com`, `https://api.anthropic.com`). Read by no other provider (NEW-llm-bring-your-own: the Ollama fallback is gone). A request is sent to it only when it is exactly an origin approved for the provider in use followed by exactly that approval's path prefix, if it has one (owner decision O-10), with at most one trailing `/` (see `testLLMConnection`). A write changing it to a non-empty value must be approved, in that sense, for `openai` or `anthropic` (400 otherwise). A value stored earlier that is approved for neither (for example an origin written through the web's former Ollama field, spec D-14) is kept and returned, sent nowhere, can be written back unchanged and can always be cleared with `""` (spec AC-39). No `pattern`, for the reason given on `awsRegion`.
   */
  llmBaseUrl: string;
  /**
   * Bedrock region. Empty means the built-in `us-east-1`. The request goes to `bedrock-runtime.<awsRegion>.amazonaws.com`, only if that host is approved in `PACEDAY_LLM_APPROVED_HOSTS_BEDROCK`. No AWS configuration of the deployment is read (NEW-llm-bring-your-own, spec D-3). A write changing it to a non-empty value must be a valid region name (one host label; PAC-66). Deliberately no `pattern`: this map is shared with `Settings`, and rows stored before PAC-66 are kept as they are (PAC-66 spec D-3), so a pattern would make the response schema false for them.
   */
  awsRegion: string;
  /**
   * The Bedrock model ID requests use (NEW-llm-bring-your-own, spec D-16). This is the property the server has always read for Bedrock; the web app's Bedrock picker writes it from this change on (before, it wrote `llmModel`, which never reached the server, and that earlier pick is not copied). DB default `anthropic.claude-sonnet-4-5-20251001-v1:0`.
   */
  bedrockModel: string;
  /**
   * Azure OpenAI resource endpoint, e.g. `https://my-resource.openai.azure.com`. PAC-66: a write changing it to a non-empty value must be an `https` URL whose host is approved in `PACEDAY_LLM_APPROVED_HOSTS_AZURE_OPENAI` (400 otherwise). `""` is always accepted and means "not set", which is refused when a request would be sent. The path is not constrained (see `contracts/features/PAC-66.md` §7). No `format` or `pattern`, for the reason given on `awsRegion`.
   */
  azureEndpoint: string;
  /**
   * The Azure OpenAI deployment name requests use.
   */
  azureDeployment: string;
  /**
   * The `api-version` query value of Azure OpenAI requests.
   */
  azureApiVersion: string;
  /**
   * The Vertex AI model requests use, in express mode (NEW-llm-bring-your-own, spec D-4). DB default `gemini-2.0-flash-001`. `awsProfile`, `gcpProject`, `gcpLocation`, `ollamaBaseUrl` and `ollamaModel` are removed from this document: they only meant something in the removed modes. Their stored values are left untouched, are no longer read, and come back on a rollback (spec D-10); writing one is a 400 `unknown property: <name>`.
   */
  vertexModel: string;
  /**
   * DB default `google`. Which calendar the product reads and writes for THIS user.
   * Resolves U-18. The authoritative set was settled by reading the three consumers that switch on this value - calendar.NewProvider (`backend/calendar/client_factory.go:16,22,27`), the auth-status handler (`backend/api/handlers_auth.go:97,105,111`) and the free/busy service (`backend/engine/freebusy_service.go:122`). All three accept exactly `outlook` and `webcal` and treat every other value, including a typo, as Google. PAC-24 enforces the set; before it, an unknown value was stored and silently behaved as `google`.
   * Before PAC-24 this was a property of the singleton row, so one user connecting Outlook switched the whole deployment (`backend/auth/microsoft_oauth.go:57` writes `calendar_provider = 'outlook' WHERE id = 1`).
   */
  calendarProvider: ("google" | "outlook" | "webcal");
  webcalUrl: string;
  /**
   * The address of THIS user's connected calendar. Before PAC-24 the auth-status handler served the singleton row's value to everyone (API-009).
   */
  calendarEmail: string;
  /**
   * Read with `COALESCE(conferencing_provider,'meet')`; conference.NewProvider switches on `zoom`, `teams`, and treats everything else as `meet`. So the wire values are `meet` / `zoom` / `teams`, not the frontend's `google_meet` / `zoom` / `teams` / `custom`. PAC-24 enforces the set for the same reason as calendarProvider: an unknown value was stored and silently behaved as `meet`.
   */
  conferencingProvider: ("meet" | "zoom" | "teams");
  recapEnabled: boolean;
  /**
   * `HH:MM`, in the same form on read and on write. **STRICT: unlike the four legacy clock properties above, `""` is NOT admitted here, in either direction.** The three reasons are specific to this column and do not generalise:
   * (a) There is no empty state to represent. The column is `TIME NOT NULL DEFAULT '08:00'` (`015_daily_recap.up.sql:3`), and the write path passes every value through `recapSendTimeOrDefault` (`backend/storage/settings.go:356-361`), which turns `""` into `08:00`. So no row can hold an empty send time and no GET can return one - the `COALESCE(...,'')` at `:224` and `:439` is defensive and unreachable. This is the difference from `workStart`/`lunchStart`, where `""` both exists in the data and carries meaning.
   * (b) Admitting `""` would make this contract lie about its own merge rule. `PATCH /api/settings` states that a property present is set to exactly the value given; `""` here would instead be silently rewritten to `08:00`. A client asking to clear a value and being told `200` while the server stored something it did not ask for is the exact silent-success failure mode this contract refuses for `null`.
   * (c) PAC-24 therefore removes the substitution: `""` is a 400 (`recapSendTime must be in HH:MM format`), which is the same message spec AC-17 already requires for a malformed value and which AC-16 requires instead of an internal failure.
   * **This requires a narrow amendment to spec AC-7**, which as written says an empty value of a setting's type always clears it. AC-7 must exempt `recapSendTime` on the ground that it has no empty state. The contract author may not edit the spec; the amendment is named in `contracts/features/PAC-24.md` §"Revision 2" and must be made before stage 3.
   * Resolves U-19, and resolves it by CHANGING the server rather than by documenting what it did. The column is Postgres `TIME` (`015_daily_recap.up.sql:3`) and was read as `recap_send_time::TEXT`, which renders `HH:MM:SS` (`08:00:00`, with a fractional part when one was stored) - contradicting the struct comment that claims `HH:MM` and contradicting the write format, so no client could round-trip this value. PAC-24 renders the column to `HH:MM` on read and rejects anything else on write. Note: the marker was originally to be settled by observing a live response; it is settled here by fixing the asymmetry instead, which makes the observation unnecessary. Spec AC-16 is the integration test that proves the rendered form.
   */
  recapSendTime: string;
  /**
   * DB CHECK constraint enforces this. PAC-24 validates it on the settings write too; before that only the daily-recap PATCH did, so a bad value sent to PUT /api/settings reached the DB CHECK and surfaced as a 500 (API-081).
   */
  recapSendTo: ("dm" | "channel");
  recapChannelId: string;
  /**
   * DB default true.
   */
  recapIncludeBriefs: boolean;
  /**
   * DB default true. Exposed as `include_focus_blocks` by the daily-recap endpoints.
   */
  recapIncludeFocus: boolean;
  /**
   * DB default true.
   */
  recapIncludeHabits: boolean;
  /**
   * How the signed-in web app shows times of day to this user (PAC-55): `12h` ("2:30 PM", the default, exactly as before PAC-55) or `24h` ("14:30", two-digit hour, no AM/PM). DB default `12h`; a user who never chose reads `12h`. There is no "unset": `""` and any other STRING are a 400 `timeFormat must be 12h or 24h`; a non-string (`24`, `true`, `["24h"]`) fails decoding first and is a 400 `invalid JSON: timeFormat has the wrong type`; `null` is a 400 like every property of this body. Display only: the server formats nothing with it, and the public booking page ignores it (always 12-hour, PAC-55 §5).
   */
  timeFormat: ("12h" | "24h");
  /**
   * Server-managed (NOW() on every write). May be present in a request body - a client submitting back a document it just read will include it - and is ignored (spec AC-10).
   */
  updatedAt: string;
  /**
   * WRITE-ONLY. Accepted on write; never present in any response from any operation (spec AC-11). NEW-llm-bring-your-own: bound to the provider the row has after the write (see `patchSettings`); every one of the five providers needs one, and a non-empty value is a 400 when that provider is `""`, `organization` or `unsupported`. It never touches a key bound to no provider (`llmUnboundApiKeySet`); only `llmUnboundApiKey: ""` removes that one.
   * Under the merge semantics this needs no special case: omit it and the stored key is unchanged; send `""` and it is cleared; send a value and it is replaced (spec AC-13). There is no way to read it back, by design - someone who loses their key re-enters it. Do not add a reveal affordance later.
   * Before PAC-24 it was returned in cleartext from a row shared by every authenticated account (API-002 + API-003), and wiped by any write that omitted it (API-004). Every key configured before this ships must be treated as compromised and rotated - closing the read path does not un-expose it (spec §5, OQ-5).
   */
  llmApiKey: string;
  llmUnboundApiKey: "";
}>
/**
 * Anonymous struct in ssoHandlers.detect.
 */
export type SsoDetectRequest = ({
  /**
   * Rejected with 400 when empty; not otherwise validated server-side.
   */
  email: string;
} & Record<string, unknown>)
/**
 * auth.DetectResult (backend/auth/sso_detect.go).
 */
export type SsoDetectResponse = {
  /**
   * "generic" for consumer/unparseable domains, "sso" when an active
   * provider row exists for the domain (a row suspended through
   * setSsoProviderState is ignored, PAC-22), "microsoft" from a live tenant probe against
   * login.microsoftonline.com (2s timeout, 1h cache), else "google".
   */
  type: ("google" | "microsoft" | "sso" | "generic");
  /**
   * Display name of the SSO provider. Omitted unless type == "sso".
   */
  provider_name?: string;
  /**
   * Relative path `/api/auth/sso/<domain>` (the email's domain,
   * lowercased and trimmed, not URL-escaped). Omitted unless
   * type == "sso". It is a path on the API's origin, not the web app's:
   * a client resolves it against its API base URL, which may be a
   * different origin (PAC-35 AC-7). The client appends
   * `?login_hint=<email>` itself (see `startSsoLogin`); the detection
   * answer does not carry the email. This is the only field a client
   * needs to reach SSO; there is no `domain` field (API-010).
   */
  redirect_url?: string;
}
/**
 * Whether sign-in uses this configuration (PAC-22, spec §3.3, §3.5).
 * `active`: detection answers `sso` for the domain and startSsoLogin
 * redirects to the provider. `suspended`: sign-in behaves as if no SSO
 * were configured; the configuration is kept. Stored as the existing
 * `enabled` column (true is `active`), so no migration.
 */
export type SsoProviderState = ("active" | "suspended")
/**
 * An organisation's SSO configuration as it may leave the server (PAC-22,
 * resolves U-22, closes the disclosure half of API-001). Returned by
 * createSsoProvider, listSsoProviders and setSsoProviderState. It is a
 * projection written for the wire with explicit snake_case keys, not the
 * storage row: the client secret and the signing certificate are never
 * part of it under any name, for any caller. In their place are two
 * booleans that say only whether each secret is on file; each depends on
 * its own secret and on nothing else (PAC-22 spec §3.1, AC-3, AC-4).
 * 
 * Rows stored before PAC-22 serialise with this same shape: a SAML row
 * reports `provider_type: saml` and its non-secret SAML values, and an
 * OIDC row with empty values reports them as `""` (PAC-22 spec AC-5). No
 * row writable since PAC-22 has a SAML value, so for those the SAML
 * properties are `""` and `has_saml_cert` is false.
 */
export type SsoProvider = {
  id: string;
  /**
   * Lower-case for every row written since PAC-50, whose migration
   * (`030_sso_admin_stepup`, PAC-50 spec §9 D-7) lower-cases the rows
   * stored before it and makes the domain unique case-insensitively.
   */
  domain: string;
  provider_name: string;
  /**
   * `saml` only for rows stored before PAC-22; createSsoProvider no
   * longer accepts it. startSsoLogin still answers 501 for such a row.
   */
  provider_type: ("oidc" | "saml");
  state: SsoProviderState;
  /**
   * `""` only for a row stored before PAC-22.
   */
  oidc_issuer: string;
  /**
   * `""` only for a row stored before PAC-22.
   */
  oidc_client_id: string;
  /**
   * True when a non-empty client secret is on file, false otherwise.
   * The secret itself is never returned (PAC-22 spec AC-3). It depends
   * on the stored secret and nothing else (AC-4). False only for a row
   * stored before PAC-22: every write since either supplies a non-empty
   * secret or keeps a non-empty one. A row of type `saml` stored
   * before PAC-22 can read true here (the write path stored a client
   * secret whatever the type); a replace of such a row that leaves the
   * secret out is still refused, because a secret is kept only from an
   * `oidc` row (PAC-22 spec §3.2, AC-25).
   */
  has_oidc_client_secret: boolean;
  /**
   * Non-secret SAML sign-in address of a row stored before PAC-22; `""` otherwise.
   */
  saml_entry_point: string;
  /**
   * Non-secret SAML issuer of a row stored before PAC-22; `""` otherwise.
   */
  saml_issuer: string;
  /**
   * True when a non-empty SAML signing certificate is on file, false
   * otherwise. The certificate itself is never returned. Only a row
   * stored before PAC-22 can be true (PAC-22 spec §3.1, D-8).
   */
  has_saml_cert: boolean;
  created_at: string;
  /**
   * Time of the last configuration write (createSsoProvider).
   * setSsoProviderState does not change it.
   */
  updated_at: string;
}
/**
 * Body of createSsoProvider. Since PAC-22 (resolves U-21, API-060) it
 * describes an OIDC configuration and nothing else: every property but
 * the client secret is required and non-empty, and the SAML properties
 * are gone (PAC-22 spec D-1, D-2, D-8). The server enforces each of these
 * with the 400 messages listed on createSsoProvider, in the order given
 * there, including a named refusal of `saml_entry_point`, `saml_issuer`
 * and `saml_cert` when present. Since PAC-50 any other property outside
 * this schema is refused with 400 `unknown property: <name>`, so
 * `additionalProperties: false` is what the server does (before PAC-50
 * such a property was ignored). U-21 redetermined at PAC-50 contract
 * revision 8 from `main`'s createSsoProvider decoder (PAC-22): nothing
 * is validated beyond what this schema states and createSsoProvider's
 * 400 list names. A replace supplies every value a reader can see again;
 * the client secret alone may be left out of a replace, which keeps the
 * stored one under the conditions stated on createSsoProvider (PAC-22
 * spec §3.2, D-12, D-13, D-14). Whether SSO is active is not part of
 * this body (PAC-22 spec §3.3); see setSsoProviderState.
 */
export type SsoProviderCreateRequest = {
  /**
   * Must equal the caller's org domain, exact and case-insensitive,
   * else 403 `provider_domain_mismatch` (PAC-50); a subdomain or a
   * foreign domain does not match, and surrounding whitespace is not
   * trimmed (`" acme.com "` is a 403). Stored lower-cased.
   */
  domain: string;
  /**
   * Display name, returned as `provider_name` and shown by detectAuthProvider.
   */
  provider_name: string;
  provider_type: "oidc";
  /**
   * OIDC issuer used for discovery at sign-in. Stored as given.
   */
  oidc_issuer: string;
  oidc_client_id: string;
  /**
   * Write-only. No response of any operation returns it, or anything
   * derived from it; SsoProvider reports only whether one is on file
   * (`has_oidc_client_secret`).
   * - Supplied: a non-empty string that replaces the stored secret
   *   (PAC-22 spec D-12, AC-23). `""` and `null` are refused with 400
   *   `oidc_client_secret must not be empty` (AC-26): no write clears
   *   the secret.
   * - Absent: required on a create; on a replace, the stored secret
   *   is kept when the stored configuration is `oidc`, holds a
   *   non-empty secret, and has exactly the submitted `oidc_issuer`
   *   and `oidc_client_id`, all decided at the moment the write is
   *   stored; otherwise 400 (PAC-22 spec D-13, D-14, AC-22, AC-24,
   *   AC-25, AC-27).
   */
  oidc_client_secret?: string;
}
/**
 * listSsoProviders response (PAC-22). A named container rather than a
 * bare array so that a property added beside `providers` later does not
 * change the response's type for every consumer (PAC-22 spec §3.7). Most
 * list responses in this contract are bare arrays; this one is
 * deliberately not, and must not be "corrected" towards them.
 */
export type SsoProviderList = {
  /**
   * Ordered by `created_at`, oldest first. Empty when the org has none.
   * At most one item today: a configuration is listed when its domain
   * equals the org's domain exactly, and both `sso_providers.domain`
   * and `organizations.domain` are unique. The array is kept so that
   * the type does not change if an org can ever hold more than one.
   */
  providers: Array<SsoProvider>;
}
/**
 * Body of setSsoProviderState: the state wanted, never a toggle, and
 * nothing else (PAC-22 spec AC-12). Any other property, including any
 * configuration value, is refused with 400 `unknown property: <name>`,
 * and `state` given twice is refused with 400 `duplicate property:
 * state`. A body that is not a JSON object (`[]`, `"active"`, `true`,
 * `null`) is refused with 400 `invalid JSON`.
 */
export type SsoProviderStateRequest = { state: SsoProviderState }
/**
 * getSsoStepupOptions response (PAC-50 contract revision 8, spec §9
 * D-13, AC-25): what the optional SSO admin step-up would request and
 * what is lost without it, for a client with no refused write in hand.
 * The three properties are the step-up 403's (SsoWriteStepupRequired),
 * built from the same components, under the same rules; there is no
 * `error`, because nothing was refused.
 */
export type SsoStepupOptions = { stepup_url: SsoStepupUrl, stepup_scopes: SsoStepupScopes, without_stepup: SsoWithoutStepup }
/**
 * Identity provider an SSO admin step-up runs against (PAC-50).
 */
export type SsoStepupProvider = ("google" | "microsoft")
/**
 * The write an admin step-up grant authorises (PAC-50 §4.8 `purpose`;
 * NEW-llm-bring-your-own Part 2, spec P2-D1). `sso_write`: one SSO
 * configuration write (PAC-50). `llm_org_key_write`: one change of the
 * caller's organisation's AI configuration (patchOrganizationAI). A
 * grant is consumed only by a write of its own purpose (PAC-50 AC-27).
 */
export type SsoStepupPurpose = ("sso_write" | "llm_org_key_write")
/**
 * The provider domain (create body `domain`, or the `{domain}` segment
 * of the DELETE and of setSsoProviderState) is not exactly the caller's
 * org domain, compared case-insensitively and untrimmed: a subdomain
 * (`sub.acme.com`), a foreign domain (`other.com`) or a padded value
 * (`" acme.com "`). A 403 by owner decision (2026-10-27, RFC 9110
 * §15.5.4), not a 400. Checked after membership and the body's 400s,
 * before authorization: nothing is written and a live step-up grant is
 * not consumed.
 */
export type SsoWriteDomainMismatch = { error: "provider_domain_mismatch" }
/**
 * An org member with no live step-up grant for (caller, caller's org)
 * who is not a break-glass admin. The step-up is optional (owner
 * decision 2026-10-27, PAC-68 OQ-2 / PAC-50 OQ-2): before navigating
 * anywhere, the client explains `without_stepup` and `stepup_scopes`
 * and lets the user decline, in which case nothing is navigated and the
 * app keeps working. If the user goes ahead, the client asks which
 * provider administers their organisation, offering only the keys of
 * `stepup_scopes`, appends `?provider=google` or `?provider=microsoft`
 * to `stepup_url` and navigates the browser there. When
 * `stepup_scopes` is empty no step-up can be started on this
 * deployment, and the client offers none. The three values are the
 * ones getSsoStepupOptions returns (same components, same rules).
 */
export type SsoWriteStepupRequired = { error: "sso_write_requires_admin_stepup", stepup_scopes: SsoStepupScopes, without_stepup: SsoWithoutStepup, stepup_url: SsoStepupUrl }
/**
 * The caller's email is on the deployment's break-glass list but the
 * session JWT was issued 10 minutes ago or more, or carries an issue
 * time more than one minute in the future (beyond that clock-skew
 * allowance a token is not fresh). The client sends the user through
 * sign-in again; a step-up grant also satisfies the gate.
 */
export type SsoWriteFreshLoginRequired = { error: "sso_write_requires_fresh_login" }
/**
 * The 403 of the three SSO configuration writes (PAC-50):
 * createSsoProvider, deleteSsoProvider and setSsoProviderState (the
 * last since PAC-50 contract revision 8, which merged PAC-22). Exactly
 * one variant applies, told apart by `error`; `stepup_url` is present
 * on, and only on, `sso_write_requires_admin_stepup`. All four keep the
 * shared `{error}` envelope, so a client that reads only `error` still
 * shows a specific message (the web client renders a 403 without
 * `error` as a generic "no permission" text).
 */
export type SsoWriteForbiddenResponse = (SsoWriteMembershipRequired | SsoWriteDomainMismatch | SsoWriteStepupRequired | SsoWriteFreshLoginRequired)
/**
 * storage.Team. Note the camelCase json tags — unlike the manager domain's snake_case.
 */
export type Team = {
  id: string;
  /**
   * Omitted entirely when the team has no organization (omitempty on a *uuid.UUID).
   */
  orgId?: string;
  name: string;
  createdBy: string;
  createdAt: string;
}
/**
 * engine.TeamAnalytics.
 */
export type TeamAnalytics = {
  /**
   * Integer division by member count (or by 1 for an empty team).
   */
  avg_meeting_minutes: number;
  avg_focus_minutes: number;
  /**
   * `[]` when the team has no members.
   */
  member_breakdown: Array<MemberAnalyticsSummary>;
}
/**
 * storage.TeamMember, as returned inside TeamDetail.
 */
export type TeamMember = {
  teamId: string;
  userId: string;
  role: ("owner" | "member");
  joinedAt: string;
  /**
   * Joined from users.name via COALESCE(...,''), and tagged omitempty — so a user with no name causes the key to be OMITTED, not sent as "".
   */
  name?: string;
  /**
   * Joined from users.email, also omitempty.
   */
  email?: string;
}
export type TeamDetail = {
  team: Team;
  /**
   * `[]` when the team has no members or the query failed.
   */
  members: Array<TeamMember>;
}
/**
 * storage.TeamInvite, returned in full (token included) by inviteTeamMember.
 */
export type TeamInvite = {
  id: string;
  teamId: string;
  inviteeEmail: string;
  invitedBy: string;
  /**
   * A freshly generated UUID string used as the invite link path segment.
   */
  token: string;
  status: ("pending" | "accepted" | "declined" | "expired");
  createdAt: string;
  /**
   * createdAt + 7 days (computed in Go, not by the database).
   */
  expiresAt: string;
}
/**
 * A narrow projection of a pending invite, NOT a TeamInvite (no id, token, status, invitedBy or createdAt). The three original keys are camelCase and stay so for existing readers; the three keys added by PAC-34 are snake_case, the spelling the PAC-34 acceptance criteria name and the web normalizer reads (see contracts/features/PAC-34.md section 3 for the rejected alternatives). team_id and expires_at come from the invite row itself, so they are always present. The team and inviter rows are read separately and a failed read is not an error: teamName and inviterName become "" and inviter_email becomes null.
 */
export type TeamInvitePreview = {
  /**
   * Empty string when the team row could not be read.
   */
  teamName: string;
  /**
   * The inviter's DISPLAY NAME, not their email. Empty string when the user row could not be read.
   */
  inviterName: string;
  /**
   * The invitee email the invite was issued to.
   */
  email: string;
  /**
   * team_invites.team_id of this invite (PAC-34). Never empty.
   */
  team_id: string;
  /**
   * team_invites.expires_at, RFC 3339 (PAC-34): createdAt + 7 days, computed in Go when the invite was created. A 200 is returned only while the invite is pending and ExpireOldInvites runs first, so a client normally sees a future instant; a client must still treat a past value as expired rather than assume otherwise.
   */
  expires_at: string;
  /**
   * The inviter's account email, users.email of team_invites.invited_by (PAC-34). null, never "", when the inviter's user row could not be read. invited_by is NOT NULL with ON DELETE CASCADE, so a deleted inviter removes the invite (404), and null only arises from a failed read.
   */
  inviter_email: (string | null);
}
export type TeamNameRequest = ({
  /**
   * Trimmed before storage. No maximum length is enforced by the backend.
   */
  name: string;
} & Record<string, unknown>)
/**
 * engine.TeamSlot.
 */
export type TeamSlot = {
  start: string;
  end: string;
  /**
   * 100 - (members_with_disrupted_focus / total_members) * 100, integer division.
   */
  quality_score: number;
}
export type TeamSlotList = { slots: Array<TeamSlot> }
/**
 * backend/api/handlers_scheduling_links.go schedulingLinkPatch. Scalars are Go pointers, so an absent key leaves the stored value alone; slices are plain slices, so an absent key and an explicit `null` are indistinguishable and both mean "leave unchanged", while `[]` means "clear" (and then usually fails 422).
 */
export type UpdateSchedulingLinkRequest = Partial<{
  title: (string | null);
  /**
   * Normalised. If it normalises to empty the request is a 422 "slug cannot be empty".
   */
  slug: (string | null);
  duration_options: Array<number>;
  /**
   * Applied AFTER duration_options, so when both are sent `durations` wins - the opposite precedence from create.
   */
  durations: Array<number>;
  days_of_week: Array<number>;
  /**
   * Applied after days_of_week, so `days` wins when both are sent - again the opposite of create.
   */
  days: Array<string>;
  window_start_time: (string | null);
  /**
   * Alias, applied only when window_start_time is absent.
   */
  window_start: (string | null);
  window_end_time: (string | null);
  /**
   * Alias, applied only when window_end_time is absent.
   */
  window_end: (string | null);
  buffer_before: (number | null);
  buffer_after: (number | null);
  min_notice_minutes: (number | null);
  usage_type: (("reusable" | "recurring" | "single_use") | null);
  /**
   * An explicit null is indistinguishable from an absent key (both leave the stored value), so max_uses cannot be cleared by PATCH except by switching usage_type away from `recurring`.
   */
  max_uses: (number | null);
  /**
   * Setting false is the same soft-deactivation that DELETE performs.
   */
  active: (boolean | null);
  /**
   * When present, the complete co-host list: unlisted non-owner hosts are removed, new ones are added as `pending`, existing ones keep their status (PAC-61). Unknown emails are skipped silently.
   */
  co_host_emails: Array<string>;
}>
/**
 * storage.UserProfile with explicit snake_case json tags (PAC-26, API-030); the keys match the user_profiles columns. The schema name is kept from before PAC-26, when the struct had no tags and the keys were the Go field names (`UserID`, `IsManager`, `DetectedAt`, `AnalyticsSharedWithManager`, `UpdatedAt`).
 */
export type UserProfileGoStruct = {
  user_id: string;
  is_manager: boolean;
  detected_at: (string | null);
  /**
   * Member-side consent flag, defaulting to true. No endpoint in this domain sets it.
   */
  analytics_shared_with_manager: boolean;
  /**
   * The value read BEFORE the upsert, not the newly written now().
   */
  updated_at: string;
}

    // </Schemas>
    }
  
  export namespace Endpoints {
  // <Endpoints>
  
  /**
 * Upsert keyed on domain: a second POST for the same domain replaces the
 * configuration (there is no PATCH/PUT). It is a replace for every value
 * a reader can see (PAC-22 spec §3.2): `provider_name`, `provider_type`,
 * `oidc_issuer` and `oidc_client_id` are supplied on every write and
 * stored as supplied.
 * 
 * The client secret is the one exception (PAC-22 spec D-12, D-13, D-14):
 * - `oidc_client_secret` supplied (a non-empty string): it replaces the
 *   stored secret.
 * - `oidc_client_secret` left out (the property absent): the stored
 *   secret is kept, unchanged, but only when all of these hold at the
 *   moment the write is stored: a configuration exists for the domain,
 *   it is of provider type `oidc`, its stored client secret is
 *   non-empty, and the submitted `oidc_issuer` and `oidc_client_id` are
 *   byte-for-byte equal to the stored ones (no case folding, no
 *   trailing-slash or whitespace normalisation). Otherwise the write is
 *   refused (400, step 4) and nothing changes. This binds a kept secret
 *   to the place it is sent at sign-in: the issuer decides the token
 *   endpoint the secret goes to (PAC-22 spec §2.2, D-13).
 * - `oidc_client_secret` given as `""` or `null`: refused (400, step
 *   2f). No write clears the client secret; removing the configuration
 *   (deleteSsoProvider) is the way to remove it.
 * A create (no configuration for the domain) has nothing to keep, so it
 * must supply the secret.
 * 
 * Every write passes this gate, in this order, before the provider
 * store is written; the first step that fails decides the response.
 * The gate is PAC-50's (spec docs/specs/PAC-50.md §4.2); steps 2 and 4
 * are PAC-22's request checks 1-5 and 6, placed in it (PAC-50 contract
 * revision 8).
 * 
 * 1. Membership: the caller must belong to an org, and the org is always
 *    the caller's own; nothing in the body chooses it. Otherwise 403
 *    `org membership required`, or `org not found` when the org row is
 *    gone. Decided before the body is read, so before every 400, and
 *    before the break-glass check, so a break-glass email with no org
 *    gets this same 403. It carries no `stepup_url`.
 * 2. Body, each refusal a 400 that stores nothing and consumes no grant.
 *    In this order:
 *    a. The body is a JSON object, and each declared property present
 *       is `null` or a value of its declared type (`invalid JSON`).
 *       `null` is not a type error: it counts as empty, so it is
 *       decided by step d or f like a missing or `""` value
 *       (`"domain":null` gives `domain, provider_name and
 *       provider_type are required`; `"oidc_client_secret":null`
 *       gives `oidc_client_secret must not be empty`), as `main`'s
 *       PAC-22 decoder does (PAC-50 contract revision 8.1, N1).
 *    b. None of `saml_entry_point`, `saml_issuer`, `saml_cert` is
 *       present, whatever its value (including `""` and `null`). The
 *       first present, in that order, is named: `saml_entry_point is
 *       not supported`, `saml_issuer is not supported`, `saml_cert is
 *       not supported` (PAC-22 spec D-8, AC-18). Such a value is
 *       refused, never stored and never silently dropped.
 *    c. No other property outside the schema (PAC-50, spec §4.2 step 3,
 *       AC-16a): the first undeclared property, in byte order of the
 *       property names, is refused with `unknown property: <name>`, the
 *       PAC-24 settings convention. Property names are case-sensitive,
 *       so `OIDC_CLIENT_SECRET` or `org_id` is an undeclared property.
 *       (Before PAC-50 an undeclared property was ignored, although the
 *       schema said `additionalProperties: false`.)
 *    d. `domain`, `provider_name` and `provider_type` are non-empty
 *       (`domain, provider_name and provider_type are required`).
 *    e. `provider_type` is `oidc`. `saml` is refused with
 *       `provider_type 'saml' is not supported` (PAC-22 spec D-1, AC-8):
 *       the product cannot complete a SAML sign-in. Any other value is
 *       refused with `provider_type must be 'oidc'`.
 *    f. `oidc_issuer` and `oidc_client_id` are each present and
 *       non-empty, in that order: `oidc_issuer is required`,
 *       `oidc_client_id is required` (PAC-22 spec D-2, AC-7). Missing,
 *       `null` and `""` are the same refusal. Then, when
 *       `oidc_client_secret` is present, it is a non-empty string: `""`
 *       and `null` are refused with `oidc_client_secret must not be
 *       empty` (PAC-22 spec D-12, AC-26). Values are stored as given (not
 *       trimmed).
 * 3. Domain: `domain` must equal the caller's org domain, exact and
 *    case-insensitive. Otherwise 403 `provider_domain_mismatch` (owner
 *    decision 2026-10-27, RFC 9110 §15.5.4: the request is understood
 *    and the caller is not permitted to configure that domain). A
 *    subdomain does NOT match: with org `acme.com`, `sub.acme.com` is a
 *    403, and so is a foreign domain such as `other.com`. Nothing is
 *    trimmed: `" acme.com "` is a 403 too. Nothing is written and a live
 *    grant is NOT consumed. (Before PAC-50 this was the suffix rule
 *    domain.DomainMatchesOrg, which accepted any subdomain, with the
 *    403 `can only configure SSO for your own domain`; ex-PAC-46.)
 * 4. Kept secret (PAC-22 check 6), only when `oidc_client_secret` is
 *    absent, against the row this write would be stored under: the row
 *    under the lower-cased `domain` (PAC-50 stores domains lower-cased
 *    and its migration lower-cases older rows, so `ACME.com` is checked
 *    against the `acme.com` row). After step 3 the domain is the
 *    caller's org domain, so the row read is always the caller's own
 *    organisation's. 400 `oidc_client_secret is required` when there is
 *    no configuration, or it is not of type `oidc`, or its stored client
 *    secret is empty (PAC-22 spec AC-7, AC-25); 400 `oidc_client_secret
 *    is required when oidc_issuer or oidc_client_id changes` when the
 *    submitted issuer or client id differs from the stored one (PAC-22
 *    spec D-13, AC-24). Like every refusal above, decided before
 *    authorization: it consumes no grant.
 * 5. Authorization, one of:
 *    a. a live admin step-up grant for (caller, caller's org) whose
 *       purpose is SSO configuration writes (`sso_write`), obtained
 *       through GET /api/admin/sso/stepup less than 10 minutes earlier.
 *       The request carries nothing that names it: the server selects
 *       the caller's newest live `sso_write` grant and consumes it in
 *       the same statement, so one grant authorizes exactly one write,
 *       and two concurrent writes on one grant yield one success and
 *       one 403. A grant issued for another purpose (a later feature
 *       that reuses this admin proof, such as the organisation AI key)
 *       is never consumed by an SSO write, and an `sso_write` grant is
 *       never consumed by a write of another purpose (PAC-50 contract
 *       revision 8.1, N5; spec §4.8).
 *       Every 400 and 403 above happens before this step and leaves
 *       the grant live; a failure after it (the store-time 400 of step
 *       6, the 500 below) leaves it consumed.
 *    b. break-glass: the caller's session email is listed in the
 *       deployment's `PACEDAY_ADMIN_EMAILS` (exact, lower-cased) AND the
 *       session JWT was issued less than 10 minutes ago and not more
 *       than one minute in the future (a token stamped further ahead is
 *       not fresh). Listed without such a session gives 403
 *       `sso_write_requires_fresh_login`.
 *    (a) is tried first: a break-glass caller who also holds a live
 *    grant consumes that grant on the write.
 *    Neither gives 403 `sso_write_requires_admin_stepup` with
 *    `stepup_url`, `stepup_scopes` and `without_stepup`. A 403 rather
 *    than a 401: the session is valid, the privilege is not there.
 *    Every 403 leaves the provider table unchanged.
 * 6. Store: the domain is stored lower-cased, so `ACME.com` replaces the
 *    existing `acme.com` row rather than adding a second one.
 *    Interleaved writes (PAC-22 spec D-14, AC-27, AC-28): another write
 *    to the same domain can be stored between this request's checks and
 *    its store, so what a replace keeps is decided again, atomically
 *    with the store, against the configuration as it is at that moment
 *    and under the same key as step 4. When the secret is left out, the
 *    store keeps the stored secret only if the conditions of step 4
 *    still hold; if they do not (the issuer or client id now differs,
 *    there is no secret to keep, the configuration was removed or is no
 *    longer `oidc`), the request is refused with the 400 step 4 would
 *    give against that state and nothing it carried is stored. The
 *    grant consumed in step 5a stays consumed (PAC-50 spec §4.2 step
 *    5a: the consume is the last step before the write; §9 D-14). A
 *    stored configuration never pairs one write's issuer or client id
 *    with a secret kept from a configuration that had a different issuer
 *    or client id, and never holds an empty secret written by this
 *    operation. The active state is never written by a replace: the
 *    configuration keeps the state stored at the moment the replace is
 *    stored, so a setSsoProviderState transition stored while the
 *    replace was in flight is never undone (PAC-22 AC-28).
 *    Each stored write is recorded server-side for operators (PAC-50
 *    spec §4.6, `op` `create` or `update`, `via` `stepup` or
 *    `breakglass`); a refused or failed store records nothing. No
 *    operation exposes that record.
 * 
 * Active state (PAC-22 spec §3.3, D-3, resolves API-066). This operation
 * never changes whether SSO is active: a new configuration is created
 * active, and a replaced configuration keeps the state stored at the
 * moment the replace is stored. Only setSsoProviderState changes it.
 * (Before PAC-22 every write forced `enabled` to true.)
 * 
 * Configurations stored before PAC-22 (a SAML row, an OIDC row with an
 * empty issuer, client id or secret) are not rewritten or deleted by
 * these checks. They stay readable through listSsoProviders and can be
 * suspended, resumed and deleted.
 */
export type post_CreateSsoProvider = {
      method: "POST",
      path: "/api/admin/sso",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        
        
        
        body:  Schemas.SsoProviderCreateRequest,
          }
      responses: {201: Schemas.SsoProvider,
400: Schemas.ErrorResponse,
401: Schemas.PlainTextError,
403: Schemas.SsoWriteForbiddenResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Any member of the org may call it (unchanged by PAC-22; restricting
 * who may read is out of PAC-22's scope, spec §5). Since PAC-22 the
 * response is an SsoProviderList: a named container, not a bare array
 * (spec §3.7), whose items never carry the client secret or a signing
 * certificate under any name, nor anything derived from either, whoever
 * the caller is (API-001 disclosure half, spec AC-1): no property of
 * the response carries either stored secret, or anything derived from
 * either, under any name. The byte-level form of that guarantee (neither
 * stored value occurs in the body or the headers, raw or JSON-escaped,
 * in any letter case) holds for a secret that does not itself occur in
 * the response's non-secret values, as spec AC-1 arranges with long,
 * test-unique values; a secret such as `okta` or `true` can coincide
 * with a provider name, an issuer or a fixed token, and that is not a
 * disclosure. Suspended configurations are listed,
 * with `state: suspended`; so are configurations stored before PAC-22
 * that could not be written today (a SAML row, an incomplete OIDC row).
 * A configuration is listed when its domain equals the org's domain
 * exactly (the join is on `organizations.domain`).
 */
export type get_ListSsoProviders = {
      method: "GET",
      path: "/api/admin/sso",
      requestFormat: "json",
      responseFormat: "json",
      parameters: never,
      responses: {200: Schemas.SsoProviderList,
401: Schemas.PlainTextError,
403: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Added by PAC-50 (spec §4.3). Behind the session; the org is the
 * caller's, never a parameter. Sets a purpose-bound state cookie and
 * redirects the browser to the chosen identity provider for a fresh
 * sign-in whose result is checked for administrator status over the
 * caller's org domain (Google: `hd` equals the org domain and the
 * Directory reports `isAdmin` or `isDelegatedAdmin`; Microsoft: the
 * tenant has the org domain verified and the user holds a qualifying
 * Entra role). The outcome comes back through
 * GET /api/admin/sso/stepup/callback.
 * 
 * This is the `stepup_url` of SsoWriteStepupRequired and of
 * SsoStepupOptions: the client appends `?provider=google` or
 * `?provider=microsoft` after asking the user which account administers
 * their organisation (offering only the providers that are keys of
 * `stepup_scopes`, the ones configured on this deployment), then
 * navigates the browser there (a top-level navigation, not a fetch),
 * resolving the path against its configured API base's origin, not the
 * page's. A client with no refused write in hand (the web app's
 * Settings, spec AC-25) obtains those values from getSsoStepupOptions.
 * 
 * **Purpose (NEW-llm-bring-your-own Part 2, spec
 * `docs/specs/NEW-llm-bring-your-own-part2.md` §3.3, P2-D1).** The
 * optional `purpose` names the write the resulting grant may authorise:
 * `sso_write` (the default when absent: PAC-50's flow, byte-identical)
 * or `llm_org_key_write` (one change of the organisation's AI
 * configuration, patchOrganizationAI). The purpose is bound into the
 * signed state cookie and the callback issues the grant with it; a
 * grant is only ever consumed by a write of its own purpose (PAC-50
 * AC-27, spec P2-AC-2). The checks the callback makes and the scopes
 * requested do not depend on the purpose. A client that received
 * OrganizationAIWriteStepupRequired navigates to `stepup_url` with
 * `?provider=<p>&purpose=<stepup_purpose>`; a client that omits
 * `purpose` obtains an SSO grant, which the organisation-AI change
 * refuses without consuming it.
 * 
 * Checks run in this order; the first that fails decides the response,
 * and none of them sets the state cookie: `provider` (400), `purpose`
 * (400), membership (403), the provider configured on this deployment
 * (503), the state value generated (500). So an orgless caller with
 * `?provider=okta` gets the 400, and an orgless caller naming an
 * unconfigured provider gets the 403.
 * 
 * The step-up is optional and separate from sign-in (owner decision
 * 2026-10-27, PAC-68 OQ-2 / PAC-50 OQ-2). Sign-in (startGoogleOAuth,
 * startMicrosoftOAuth, the OIDC SSO start) never requests these scopes
 * nor any scope needing admin consent; only this round-trip does. The
 * broader scopes are listed in `stepup_scopes` and what is lost without
 * the step-up in `without_stepup` (SsoWriteStepupRequired,
 * SsoStepupOptions), so a client can explain both before it navigates
 * here. Declining costs nothing else: the app keeps working, and the
 * step-up can be started again at any time by navigating to
 * `stepup_url`, from Settings (spec §9 D-13) or at the next SSO write,
 * which answers SsoWriteStepupRequired again while there is no live
 * grant. A grant is single-use and expires after 10 minutes, so the
 * step-up is meant to be started for a write the user is about to make.
 * The resulting tokens are discarded after the check; nothing is written
 * to the user's settings or token store, and the calendar consent is not
 * widened. Google adds the read-only directory-user scope; Microsoft adds
 * delegated directory-role and organisation read scopes (whether
 * `User.Read` suffices for the organisation's verified domains is spec
 * OQ-2's technical sub-question, open for the plan; it does not change
 * this interface).
 */
export type get_StartSsoAdminStepup = {
      method: "GET",
      path: "/api/admin/sso/stepup",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            query:  { provider: Schemas.SsoStepupProvider, purpose?: Schemas.SsoStepupPurpose },
        
        
        
        
          }
      responses: {302: unknown,
400: (Schemas.ErrorResponse | Schemas.PlainTextError),
401: Schemas.PlainTextError,
403: Schemas.SsoWriteMembershipRequired,
500: Schemas.ErrorResponse,
503: Schemas.ErrorResponse,
},
      responseHeaders: {302: { Location: string, "Set-Cookie": string },
},
    }
/**
 * Added by PAC-50 (spec §4.3). The identity provider's redirect target.
 * Behind the session: the browser's top-level navigation back from the
 * provider carries the SameSite=Lax `auth_token` cookie. Without a
 * session the answer is 401 and nothing is issued or recorded.
 * 
 * With a session, every outcome is a 302 to the web app's settings page,
 * `<FRONTEND_URL>/settings`, with the outcome in the query string (see
 * the 302's Location). Checks run in this order
 * and the first failure decides the `reason`:
 * 
 * 0. The `sso_stepup_state` cookie is present, unexpired, untampered,
 *    matches `state`, and is bound to the session's user and current
 *    org; else `state_mismatch`.
 * 1. The authorization code is exchanged and the ID token verified
 *    (signature, audience, issuer, expiry). A provider `error`, a
 *    missing `code` or any failure here gives `token_invalid`.
 * 2. Google: `hd` present (`no_hd`) and equal to the org domain
 *    (`hd_mismatch`). Microsoft: the organisation answer's id equals
 *    the token's `tid` and its verified domains contain the org domain
 *    (`tid_mismatch`; a failed organisation lookup is also
 *    `tid_mismatch`); an org already pinned to a different tenant gives
 *    `tid_changed` and the pin stays. On success the org's tenant is
 *    pinned (idempotent).
 * 3. The token's email (Microsoft: `preferred_username`/`email`) equals
 *    the session email; else `email_mismatch`. A Google token whose
 *    `email_verified` is not true is also `email_mismatch`.
 * 4. Administrator: Google Directory `isAdmin` or `isDelegatedAdmin`;
 *    Microsoft `wids` (or, when absent, the directory-role lookup)
 *    containing a qualifying role template id (spec §4.4). Anything
 *    else, including a lookup error, gives `not_admin`.
 * 5. A grant for (caller, caller's org, provider) is issued with the
 *    purpose bound in the state (`sso_write` unless the start named
 *    `llm_org_key_write`; NEW-llm-bring-your-own Part 2), valid for 10
 *    minutes and good for one write of that purpose (spec §4.8; a write
 *    of another purpose cannot spend it, PAC-50 AC-27). A state signed
 *    before NEW-llm-bring-your-own Part 2 was deployed carries no
 *    purpose; it is read as `sso_write` (contract revision 2), so a
 *    step-up in flight across the deploy completes as PAC-50's.
 * 
 * "Byte-identical to PAC-50" for an absent or `sso_write` purpose
 * (NEW-llm-bring-your-own Part 2) covers what a client can observe: the
 * 302 and its Location, the 400 bodies, the options read and the
 * landing Location. It does not cover the signed state cookie's value,
 * which now also binds the purpose and is opaque to clients.
 * 
 * Every outcome with a session, granted or denied, is recorded
 * server-side for operators (spec §4.6) and clears the state cookie.
 * No outcome touches the session, the user's settings or token store.
 * The mapping of a provider `error`, a missing `code`, a failed
 * organisation lookup and an unverified Google email onto the enum is
 * assumed by the factory at stage 2, pending owner confirmation (spec
 * "Decisions", D-3).
 * 
 * The web app's Settings page reads the outcome from this query
 * (`stepup`, and `reason` on a denial) and states it (spec AC-25); a
 * step-up started from a refused write elsewhere also lands there.
 */
export type get_SsoAdminStepupCallback = {
      method: "GET",
      path: "/api/admin/sso/stepup/callback",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            query?:  Partial<{ state: string, code: string, error: string }>,
        
        
        
        
          }
      responses: {302: unknown,
401: (Schemas.PlainTextError | Schemas.ErrorResponse),
500: Schemas.ErrorResponse,
},
      responseHeaders: {302: { Location: string, "Set-Cookie": string },
},
    }
/**
 * Added by PAC-50 contract revision 8 (spec §9 D-13, AC-25; owner
 * decision 2026-10-27: the step-up can be started again from Settings).
 * Behind the session; the org is the caller's, never a parameter. It
 * gives a signed-in org member the `stepup_url`, `stepup_scopes` and
 * `without_stepup` that the step-up 403 (SsoWriteStepupRequired)
 * carries, so a page with no SSO write to make (the web app's Settings)
 * can explain the optional step-up and offer it before any navigation.
 * 
 * The values follow the 403's rules and are built from the same
 * components (SsoStepupUrl, SsoStepupScopes, SsoWithoutStepup). On one
 * deployment, this response's `stepup_scopes` and `without_stepup` are
 * equal to the step-up 403's: a provider is a key of `stepup_scopes` if
 * and only if startSsoAdminStepup would not answer 503 for it (spec §9
 * D-2, D-9), each list is exactly what that start requests beyond the
 * identity scopes, and an empty object means no step-up can be started
 * on this deployment.
 * 
 * Read-only. It consults and consumes no grant, sets and clears no
 * cookie, writes nothing and records nothing (no SSO event). Its answer
 * does not depend on whether the caller holds a live grant or is on the
 * break-glass list: it says what the step-up would request, not whether
 * this caller needs it, and a break-glass operator gets the same 200.
 * The `sso_stepup_state` cookie's Path (`/api/admin/sso/stepup`) covers
 * this path, so a browser in the middle of a step-up sends it here;
 * this operation ignores it.
 * 
 * **Purpose (NEW-llm-bring-your-own Part 2, spec P2-AC-30).** The
 * optional `purpose` says which write the client is about to offer the
 * step-up for. `stepup_url` and `stepup_scopes` do not depend on it;
 * `without_stepup` does: `[sso_configuration_writes]` for `sso_write`
 * (the default when absent, byte-identical to PAC-50) and
 * `[organization_ai_configuration_writes]` for `llm_org_key_write`. The
 * client navigates to `stepup_url` with `?provider=<p>` and, for
 * `llm_org_key_write`, `&purpose=llm_org_key_write`.
 * 
 * Checks: `purpose` (400), membership (403), then 200. Calling it costs
 * nothing, so a client may call it whenever it renders the entry point.
 */
export type get_GetSsoStepupOptions = {
      method: "GET",
      path: "/api/admin/sso/stepup/options",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            query?:  Partial<{ purpose: Schemas.SsoStepupPurpose }>,
        
        
        
        
          }
      responses: {200: Schemas.SsoStepupOptions,
400: Schemas.ErrorResponse,
401: Schemas.PlainTextError,
403: Schemas.SsoWriteMembershipRequired,
},
      
    }
/**
 * Same gate as createSsoProvider, in the same order (spec §4.2), with no
 * body to check: membership (403 `org membership required` / `org not
 * found`), then the `{domain}` segment, lower-cased and not trimmed, must
 * equal the caller's org domain exactly (403 `provider_domain_mismatch`,
 * owner decision 2026-10-27; a subdomain does not match, nor does a
 * foreign domain, nor `%20acme.com`; no grant is consumed), then
 * authorization (a live step-up grant, consumed, or break-glass with a
 * fresh session; otherwise 403 `sso_write_requires_admin_stepup` with
 * `stepup_url`, `stepup_scopes` and `without_stepup`, or
 * `sso_write_requires_fresh_login`).
 * The segment is a target, never an authorization: it chooses which row,
 * and only ever within the caller's own org domain.
 * 
 * The row deleted is the lower-cased domain, so `DELETE
 * /api/admin/sso/ACME.com` removes the `acme.com` row, whatever its
 * state: a suspended configuration (PAC-22) is deleted like an active
 * one. Since PAC-50 a delete that removes no row is a 404 and is not
 * recorded (API-067 fixed; before PAC-50 it answered 204 having deleted
 * nothing). The grant is consumed before the delete runs, so a 404 has
 * used it (spec §9 D-5). A delete that removes a row is recorded for
 * operators (spec §4.6, `op` `delete`).
 * 
 * `DELETE /api/admin/sso/stepup` is this operation with `{domain}` =
 * `stepup` (the step-up paths define only GET): it gets the same gate,
 * so an org member gets 403 `provider_domain_mismatch` and nothing is
 * consumed.
 */
export type delete_DeleteSsoProvider = {
      method: "DELETE",
      path: "/api/admin/sso/{domain}",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        path:  { domain: string },
        
        
        
          }
      responses: {204: unknown,
401: Schemas.PlainTextError,
403: Schemas.SsoWriteForbiddenResponse,
404: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Added by PAC-22 (spec §3.3, §3.5, §3.6; resolves API-066). The only
 * operation that changes whether SSO is active, and it changes nothing
 * else. The request names its target (`{domain}`, as deleteSsoProvider
 * does) and the state it wants; it never toggles. It carries no
 * configuration value and no secret, so suspending and resuming never
 * need the client secret (PAC-22 spec AC-10, AC-12).
 * 
 * While a configuration is suspended, sign-in behaves as if no SSO were
 * configured for its domain: detectAuthProvider does not answer `sso`
 * and startSsoLogin answers 404. The configuration itself is kept and
 * stays listed. **Suspension stops new sign-ins; it does not end
 * sessions** already issued through the provider (PAC-22 spec §3.5).
 * 
 * **An SSO configuration write, behind PAC-50's gate** (PAC-22 spec D-5,
 * D-6; PAC-50 contract revision 8). The caller must be permitted to
 * change SSO configuration under exactly the rule that authorizes
 * createSsoProvider and deleteSsoProvider (a live admin step-up grant,
 * consumed, or break-glass with a fresh session), never membership
 * alone, and every refusal of that rule is a SsoWriteForbiddenResponse.
 * **Not served before PAC-50 is on `main`** (PAC-22 D-16): no route
 * answers this operation until PAC-50's gate exists, so no SSO write is
 * ever served ungated. Serving it is PAC-22's follow-up on top of
 * PAC-50; what follows is how it behaves once served.
 * 
 * Checks run in this order; the first that fails decides the response:
 * 
 * 1. Membership: the caller belongs to an org, else 403
 *    `org membership required` (or `org not found`), as at step 1 of
 *    createSsoProvider.
 * 2. Body: a JSON object, else `invalid JSON`. A body that is not
 *    JSON, and a body that is valid JSON but not an object (`[]`,
 *    `"active"`, `true`, `1`, `null`), all get `invalid JSON`; then the
 *    object's properties in body order:
 *    the first property other than `state` is refused
 *    (`unknown property: <name>`), so no configuration value can ride
 *    along, and a second `state` is refused (`duplicate property:
 *    state`), so a body never asks for two states and no decoder's
 *    "last one wins" decides a kill switch; then `state` is `active` or
 *    `suspended` (`state must be 'active' or 'suspended'`, for a missing
 *    or `null` state too).
 * 3. Domain: `{domain}`, lower-cased and not trimmed, must equal the
 *    caller's org domain exactly, case-insensitively, else 403
 *    `provider_domain_mismatch` (SsoWriteDomainMismatch), as on the
 *    other two SSO writes (owner decision 2026-10-27; PAC-22 spec D-15,
 *    PAC-50 spec §9 D-10). A subdomain of the org domain, another org's
 *    domain and a padded segment (`%20acme.com`) are all refused (PAC-22
 *    spec AC-21).
 * 4. Authorization: step 5 of createSsoProvider (a live step-up grant,
 *    consumed, tried first; or break-glass with a fresh session), else
 *    403 `sso_write_requires_admin_stepup` (with `stepup_url`,
 *    `stepup_scopes` and `without_stepup`) or
 *    `sso_write_requires_fresh_login`. Steps 1-3 are decided from the
 *    request alone and leave the grant unspent.
 * 5. Lookup of the configuration for the lower-cased domain, whatever
 *    its state: none gives 404 `sso provider not found`; nothing is
 *    created and nothing is recorded, and the grant is spent
 *    (PAC-22 spec D-9, AC-19; as deleteSsoProvider's 404, PAC-50 spec
 *    §9 D-5).
 * 6. If the configuration is already in the requested state, nothing
 *    changes and the answer is 200 with the configuration as stored
 *    (PAC-22 spec AC-20). Otherwise only the active state is written: no
 *    configuration value is read from the request or written, so a
 *    replace stored while this request is in flight keeps its values
 *    and this request keeps its state (PAC-22 spec AC-28).
 *    `updated_at` is not changed by this operation in either case: it
 *    records the last configuration write (createSsoProvider).
 * 7. Recording: every transition that found its configuration,
 *    including one that changed nothing, is recorded where PAC-50
 *    records configuration writes (PAC-50 spec §4.6), as
 *    `sso_provider_written` with `op` `suspend` (state `suspended`) or
 *    `resume` (state `active`) and `via` `stepup` or `breakglass`,
 *    naming the organisation, the acting user and the provider (PAC-22
 *    spec D-10, AC-16). No operation exposes that record.
 *    The state write and its record are one transaction, as PAC-50's
 *    configuration writes are: either both happen or neither does.
 * 
 * Steps 5 to 7 see one and the same row: the state write and its
 * record apply to the row the lookup found, and to nothing else. A
 * configuration removed (deleteSsoProvider) after
 * this request's lookup and before its write is stored is answered
 * exactly as one that was never there: 404 `sso provider not found`,
 * nothing written, nothing recorded, the grant spent (PAC-22 spec
 * D-9: never success for a configuration that does not exist). A
 * removal stored after this request's write is an ordinary later
 * removal.
 * 
 * This operation acts on configurations stored before PAC-22 that
 * createSsoProvider would refuse today (a SAML row, an incomplete OIDC
 * row) exactly as on any other (PAC-22 spec AC-8).
 * 
 * `PUT /api/admin/sso/stepup/state` (PAC-50 defines only GET under
 * `/api/admin/sso/stepup`) is this operation with `{domain}` =
 * `stepup`, which is never an org domain: 403 `provider_domain_mismatch`.
 */
export type put_SetSsoProviderState = {
      method: "PUT",
      path: "/api/admin/sso/{domain}/state",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        path:  { domain: string },
        
        
        body:  Schemas.SsoProviderStateRequest,
          }
      responses: {200: Schemas.SsoProvider,
400: Schemas.ErrorResponse,
401: Schemas.PlainTextError,
403: Schemas.SsoWriteForbiddenResponse,
404: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Live Google Calendar read for the Monday-anchored week containing `date`.
 * Only events with `start.dateTime` set (all-day events skipped) and at least one
 * attendee are included; events matching one of the user's focus blocks or a habit occurrence's
 * calendar_event_id are excluded. Sorted by `duration_minutes` descending.
 * A nil slice is normalised to `[]`.
 */
export type get_ListAnalyticsMeetings = {
      method: "GET",
      path: "/api/analytics/meetings",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            query?:  Partial<{ date: string }>,
        
        
        
        
          }
      responses: {200: Array<Schemas.AnalyticsMeeting>,
401: (Schemas.CalendarNotConnectedError | Schemas.MiddlewareUnauthorized),
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Spawns `AnalyticsEngine.ForceCompute` for the week containing `time.Now()` on a
 * detached context and returns immediately. The request body is never read, and no
 * parameters select the week. Errors from the background job are swallowed.
 */
export type post_RecomputeAnalytics = {
      method: "POST",
      path: "/api/analytics/recompute",
      requestFormat: "json",
      responseFormat: "json",
      parameters: never,
      responses: {202: Schemas.AnalyticsRecomputeAck,
401: Schemas.ErrorResponse,
},
      
    }
/**
 * Reads previously persisted rows only — it never computes. Ordered
 * `week_start DESC` (newest first). A nil slice is normalised to `[]`.
 * Each item has the same fields as the GET /api/analytics/week response, in the
 * same formats and on the same scales, minus `breakdown` (PAC-42): `week_start` is
 * the calendar date of the week's Monday (`YYYY-MM-DD`), and `habit_completion_rate`
 * and `focus_score` are percentages where 100 means the whole. The `breakdown`
 * array exists only on /api/analytics/week (API-055 second half, out of PAC-42's
 * scope).
 */
export type get_ListAnalyticsTrends = {
      method: "GET",
      path: "/api/analytics/trends",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            query?:  Partial<{ weeks: number }>,
        
        
        
        
          }
      responses: {200: Array<Schemas.AnalyticsWeekRow>,
401: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * The week is the Monday-anchored week containing `date`. A cached row is returned
 * when it was computed within the last 24h, otherwise the week is recomputed and
 * upserted synchronously (this call may hit the Google Calendar API).
 * The response carries the same fields as a GET /api/analytics/trends row, in the
 * same formats and on the same scales, plus a `breakdown` array (PAC-42):
 * `week_start` is the calendar date of the week's Monday (`YYYY-MM-DD`), equal
 * byte for byte to the trend row for the same week, and every proportion in the
 * response (`habit_completion_rate`, `focus_score`, each `breakdown[].percentage`)
 * is a percentage where 100 means the whole.
 */
export type get_GetAnalyticsWeek = {
      method: "GET",
      path: "/api/analytics/week",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            query?:  Partial<{ date: string }>,
        
        
        
        
          }
      responses: {200: Schemas.AnalyticsWeekWithBreakdown,
401: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Scans the user's primary calendar over a FIXED 30-day lookback ending now (the window is not configurable via query parameters), de-duplicates attendees by lowercased email, sorts ascending by the original-cased email, and returns at most 20 entries. Unlike GET /api/calendar/events, room resource attendees are NOT filtered out here.
 */
export type get_SuggestAttendees = {
      method: "GET",
      path: "/api/attendees/suggest",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            query?:  Partial<{ q: string }>,
        
        
        
        
          }
      responses: {200: Array<Schemas.AttendeeSuggestion>,
401: (Schemas.CalendarNotConnectedError | Schemas.MiddlewareUnauthorized),
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Returns the calling user's own `audit_log` rows, ordered by `created_at DESC, id DESC`. The query is scoped by the authenticated user id that `requireAuth` puts in the request context under `auth.UserIDKey` (backend/api/middleware.go) and that handlers read back with `userIDFromCtx` or `auth.UserIDFromContext`; there is no parameter that widens it, and no caller can address another user's entries.
 * 
 * SERVER BEHAVIOUR SINCE PAC-23 (finding API-005, fixed): `auditHandler` (backend/api/handlers_audit.go:13-32) reads the caller from the request context and passes it to `storage.ListAuditLog`, whose query is `SELECT id, action, details, created_at FROM audit_log WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2` (backend/storage/audit_log.go:34); migration `026_audit_log_user_id` added the `user_id` column, and `storage.WriteAuditLog` (backend/storage/focus_blocks.go) records the subject at all seven call sites. Before PAC-23 the query had no predicate, the table had no user column, and every authenticated caller received every user's rows. Falsify with `grep -n "WHERE user_id" backend/storage/audit_log.go` and `grep -l audit_log backend/storage/migrations/*` (`001_initial` and `026_audit_log_user_id`).
 * 
 * A NOTE ON CITATIONS, because three revisions of this contract have now been rejected for stale ones. Every `file:line` below was re-derived against the tree at revision 5 (2026-10-22) **after** regenerating the bundle, `backend/api/gen/paceday.gen.go` and the web repo's `src/api/generated/{types.ts,schemas.ts,schemas.types.d.ts}`. This description is emitted verbatim as a doc comment into `paceday.gen.go` and into `types.ts`, and the schema descriptions below into those two and `schemas.types.d.ts` as well, so a line number written here is copied into generated files in both repos that other features regenerate after every contract merge. Four kinds of reference are therefore deliberately NOT given as line numbers: anything in `backend/api/gen/paceday.gen.go` or in the web repo's `src/api/generated/` is cited by **symbol**, because editing this text moves every line it could cite; the seven `storage.WriteAuditLog` call sites and the three `requireAuth` rejections are cited by **file and enclosing function** with the falsifying `grep` beside them, because eleven merges between revisions 4 and 5 moved every one of their line numbers while leaving the functions in place; anything in `docs/factory/PAC-23-plan.md` is cited by **section**, because that document is edited by other features; and anything in either `Makefile` is cited by **target**. A bare `file:line` remains only where no symbol encloses the claim (a column in a migration, one line of a short handler, a constant in the web client). Where a claim is cheap to check by command, the command is given instead of or beside the citation.
 * 
 * Entries recorded before the PAC-23 migration have no subject and are therefore returned to **nobody**. They are retained rather than deleted — they cannot be attributed, and inferring an audit record's subject after the fact is not acceptable (spec §3.3). How "no subject" is represented in storage is the migration's business: a conforming server returns an entry only to its subject, and an entry with no subject has none. This description deliberately no longer spells that predicate `user_id IS NULL`, because the identification "no subject ⟺ pre-migration" is exact under only one of two delete actions that docs/factory/PAC-23-plan.md §7 item 1 leaves open — `ON DELETE CASCADE`, as drafted in that plan's §2 up-migration step 1 (`ALTER TABLE audit_log ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE`), keeps it exact, while `ON DELETE SET NULL` would give a deleted user's rows the same marker and make the sentence false. The contract must not be the artifact that goes stale when a plan question resolves. The observable effect is the same either way: on the release of PAC-23 every user's log appears to start empty and refills as they use the product.
 * 
 * This log is a **per-user activity feed**, not a security audit trail: it has no authentication events, no client address, and no actor field, and it is readable only by its subject. Since PAC-67 it records the subject's own provider connections being lost or disconnected (CONNECTION ENTRIES below), so the subject can see why a connection reads not connected; that does not make it an audit trail. See docs/specs/PAC-23.md §3.5 — do not build anything on it that needs a third party to be able to review it.
 * 
 * The subject of an entry is whose calendar (or, since PAC-67, whose provider connection) it happened to, which is not necessarily who caused it. Every entry written by the seven PAC-23 writers has actor = subject, and that is true for a narrow reason worth stating: the one path where they differ writes no such entry at all. PAC-67 adds the first entries whose actor can differ from the subject; see CONNECTION ENTRIES below. `POST /api/book/{slug}` is registered outside the `requireAuth` group (backend/api/routes.go:27 — `:26` is the `GET .../slots` route, not this one) and reaches `calClient.CreateEvent` inside `BookingEngine.ConfirmBooking` (backend/engine/booking.go:269), so an unauthenticated third party puts a real event on a host's calendar and nothing is recorded. If booking is ever recorded — PAC-23 does not add it — the subject is the host, which is already in scope as `h.UserID` throughout that function's per-host loop (booking.go:244-271, from `GetUserByID` to `SaveBookingEvent`); the booker is not a user of this system and gets no identity here, because a fabricated actor in a record whose purpose is attribution is worse than an absent one (spec §3.2). The feed would then say that a meeting appeared on your calendar and would still be unable to say who put it there. Do not read the absence of an actor field as a claim that the subject acted.
 * 
 * The scoping guarantees who may READ a row, not that the row's contents originated with the reader. `details` carries free text supplied by whoever made the request, at four of the seven writers: a meeting title from the request body in `SmartScheduler.CreateMeeting` (backend/engine/smart_schedule.go) and `scheduleHandlers.createMeeting` (backend/api/handlers_schedule.go), a typed prompt in `NLPService.Parse` (backend/nlp/parser.go), and a client-supplied `event_id` copied unvalidated from the request body in `CompressionEngine.Apply` (backend/engine/compression.go) — the fourth is the one the `details` schema below calls the worst of them, because the value can carry JSON structure rather than merely a stray quote. So a writer whose actor is not the subject would place a third party's words in the subject's feed. No writer does that today — all seven have actor = subject — but this contract is the artifact that makes subject ≠ actor a legal shape, so it states the rule rather than leaving the direction unguarded: a writer whose actor is not the subject must not put text supplied by the actor in `details`; where that is unavoidable the entry needs the redacted projection spec §3.5 describes, not this operation. Spec AC-3 forbids only the mirror image, another user's text reaching a non-subject.
 * 
 * CONNECTION ENTRIES (PAC-67, spec PAC-67 AC-8, AC-9, AC-15, AC-16, AC-22 to AC-29, D-12, D-13). Three kinds record the lifecycle of the subject's own Outlook, Zoom and Google credentials: `connection_lost`, `provider_disconnected` and `revocation_unconfirmed` (see `action`). Their subject is always the credential's OWNER. A `connection_lost` entry is written whenever a renewal of the owner's credential is permanently refused, on ANY path that renews it (spec D-13), including paths where the actor is not the owner: a teammate's `GET /api/teams/{id}/availability` reading the owner's Google calendar, an unauthenticated visitor on `GET /api/book/{slug}/slots` or `POST /api/book/{slug}`, and scheduled jobs acting for the owner. The entry goes to the owner's log only; the requester's log is never written, and nothing in these entries identifies the requester or visitor. They obey the rule in the previous paragraph by construction: `details` holds only server-chosen enum values (the provider and, for a disconnect, the revocation outcome), never text supplied by the actor, and never token material. Each LOSS writes exactly one `connection_lost` entry: a loss starts at the first permanent refusal of a credential that was usable and ends when the owner reconnects or disconnects that provider, so further refusals within one loss, and concurrent refusals within one backend process, add no entry, while a loss of a later, reconnected credential adds a new one (spec AC-9, AC-24, AC-25; across several backend processes is spec OQ-9). A temporary failure (timeout, network, provider 5xx) never writes one. Disconnects write `provider_disconnected`, plus `revocation_unconfirmed` when the revocation is not confirmed; the per-case counts are on `disconnectMicrosoft` and `disconnectZoom`.
 * 
 * Like every kind in this log, these entries are written BEST-EFFORT (`storage.WriteAuditLog`, backend/storage/focus_blocks.go: a failed insert is written to the server log and never fails the caller). Each is written after the outcome it records is known, so a failed insert cannot change a response: a disconnect still answers its 200, and a loss is still recorded and still reported on the status surfaces, which do not read this log. The counts above are therefore what is WRITTEN when the insert succeeds; an entry whose insert failed is not retried, and its loss or disconnect then has no entry (contract challenge finding 2). The response of a disconnect, and the status surfaces for a loss, are the authoritative record.
 * 
 * There is no pagination — no `offset`, no cursor, no `before`. Entries older than the most recent `limit` (at most 500) cannot be retrieved through this API at all, and because this operation is the only reader of the table in the whole codebase (one SELECT, in `storage.ListAuditLog`, backend/storage/audit_log.go; one INSERT, in `storage.WriteAuditLog`, backend/storage/focus_blocks.go; no view, no join, no second reader) they cannot be retrieved any other way either.
 * 
 * WHICH SERVER ANSWERS THIS, because the `limit` description below depends on it: the hand-written `auditHandler` (backend/api/handlers_audit.go:13-32), registered directly on chi at backend/api/routes.go:180 (`grep -n audit backend/api/routes.go` finds that one line). `backend/api/gen/paceday.gen.go` — generated from this bundle, committed, and drift-checked by the `openapi-check` make target — also contains a complete server surface for this operation (`ServerInterface.ListAuditEntries`, `ListAuditEntriesParams`, `ServerInterfaceWrapper.ListAuditEntries` binding `limit`, a `/api/audit` route inside `HandlerWithOptions` (which `HandlerFromMux` delegates to), and `ListAuditEntries200JSONResponse` / `401TextResponse` / `500JSONResponse`), and **none of it is mounted**. One command falsifies that claim rather than leaving a reader to trust it: `grep -rn "HandlerFromMux\|gen\.ServerInterface\|gen\.Strict\|api/gen" --include=*.go backend/ | grep -v "^backend/api/gen/"` — it returns nothing today. `contracts/openapi/MIGRATION.md` records this operation as `handwritten`, and its `notes` cell carries the precondition for moving it; PAC-23 does not move it (contracts/features/PAC-23.md §6). Where the two servers would answer the same request differently, the `limit` description says so explicitly, and it is the only place in this contract where they do.
 */
export type get_ListAuditEntries = {
      method: "GET",
      path: "/api/audit",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            query?:  Partial<{ limit: number }>,
        
        
        
        
          }
      responses: {200: Array<Schemas.AuditEntry>,
401: Schemas.MiddlewareUnauthorized,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Validates the `oauth_state` cookie against the `state` query param,
 * exchanges the code, upserts the user, stores the OAuth token, associates
 * the org, issues the `auth_token` JWT cookie, then redirects to
 * `<FRONTEND_URL>/auth/callback`.
 * Since PAC-35 (API-011) the redirect to `/auth/callback` happens only when
 * the session cookie was actually set. If the session cannot be issued
 * (empty signing secret, or token generation fails) the user is sent to
 * the sign-in failure state instead; see the `302` response.
 * 
 * Since PAC-67 a successful Google sign-in is also the Google RECONNECT
 * (spec PAC-67 AC-12, AC-24): storing the new token ends any recorded
 * loss of the Google connection for the user it resolves to, so
 * `getAuthStatus` (Google calendar provider) and the `google_meet` row of
 * `listConferenceProviders` report connected again, and a later loss of
 * the new credential is a new loss with its own `connection_lost`
 * activity entry. The user is still resolved by the Google account's
 * email, exactly as before (spec PAC-67 OQ-10: sign-in matching is not
 * changed). No response of this operation changes.
 */
export type get_GoogleOAuthCallback = {
      method: "GET",
      path: "/api/auth/callback",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            query:  { state: string, code: string },
        
        
        
        
          }
      responses: {302: unknown,
400: Schemas.PlainTextError,
500: Schemas.ErrorResponse,
},
      responseHeaders: {302: { Location: string, "Set-Cookie": string },
},
    }
/**
 * Verifies `sso_state` (both the random half and the embedded domain),
 * re-discovers the OIDC client, exchanges the code, checks that the
 * asserted email belongs to `{domain}` (PAC-45), upserts the user with
 * provider="sso", and issues the JWT cookie.
 * Since PAC-35 (API-011) the redirect to `/auth/callback?provider=sso`
 * happens only when the session cookie was actually set; otherwise the
 * user goes to the sign-in failure state (see `302`).
 * Inconsistent error encoding: the 404 and 500 use the JSON helpers while
 * the 400s and the 403 use http.Error (text/plain).
 */
export type get_SsoOidcCallback = {
      method: "GET",
      path: "/api/auth/callback/oidc/{domain}",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            query:  { state: string, code: string },
        path:  { domain: string },
        
        
        
          }
      responses: {302: unknown,
400: Schemas.PlainTextError,
403: Schemas.PlainTextError,
404: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      responseHeaders: {302: { Location: string, "Set-Cookie": string },
},
    }
/**
 * Rate limited to 20 requests per minute per client IP (fixed one-minute
 * window per key, in-process map; expired buckets are swept at most once a
 * minute). Since PAC-39 (#215, API-062) the key is the IP of the socket peer
 * (`RemoteAddr` without its port). `X-Forwarded-For` is never read. A
 * client-supplied `X-Real-IP` is ignored; `X-Real-IP` is used only when the
 * socket peer is inside the operator's `TRUSTED_PROXIES` allowlist (empty
 * by default, so no proxy is trusted) and holds a valid IP. Still open
 * (API-062): the map is per process, so the effective limit is
 * 20/min x replicas.
 */
export type post_DetectAuthProvider = {
      method: "POST",
      path: "/api/auth/detect",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        
        
        
        body:  Schemas.SsoDetectRequest,
          }
      responses: {200: Schemas.SsoDetectResponse,
400: Schemas.ErrorResponse,
429: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Never touches the session: no response of this operation sets or
 * expires the `auth_token` cookie (PAC-35, API-061; before PAC-35 the
 * 204 expired it and so logged the user out).
 * 
 * Branches on the caller's calendar provider exactly as `getAuthStatus`
 * does (`calendarProvider` from the caller's own settings row; blank or
 * any value other than `outlook` / `webcal` means Google; a caller with
 * no settings row yet gets the default row, provider `google`, exactly as
 * `getAuthStatus` creates it), so the server and the app classify every
 * user the same way (spec PAC-35 D-8):
 * - Google: deletes the caller's stored Google OAuth token row and answers
 *   204. As before, this also turns Google Meet to not connected for the
 *   caller (it depends on the same credential). A caller with no stored
 *   token gets 204 too.
 * - `outlook` or `webcal`: deletes NOTHING (the stored Google token, if
 *   the caller holds one, the Microsoft credential and the webcal link
 *   are all kept) and answers 409 `CalendarDisconnectUnsupported`.
 *   Disconnect for these calendars is not implemented HERE (spec PAC-35
 *   OQ-5). Since PAC-67 the Microsoft credential has its own operation,
 *   `disconnectMicrosoft` (`POST /api/auth/microsoft/disconnect`); this
 *   operation's 409 for `outlook` and `webcal` is unchanged by it (spec
 *   PAC-67 OQ-3).
 * - The settings row cannot be read (or created): deletes nothing and
 *   answers 500.
 *   The provider is never guessed as Google on this path, so a read
 *   failure cannot delete an Outlook or webcal user's Google token.
 *   (`getAuthStatus` still answers "google" on its own read failure;
 *   disconnect deliberately does not follow it there.)
 */
export type delete_DisconnectCalendar = {
      method: "DELETE",
      path: "/api/auth/disconnect",
      requestFormat: "json",
      responseFormat: "json",
      parameters: never,
      responses: {204: unknown,
401: Schemas.PlainTextError,
409: Schemas.CalendarDisconnectUnsupported,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Sets an httpOnly `oauth_state` cookie (MaxAge 300, SameSite=Lax) and
 * redirects to Google's consent screen. Never returns a body.
 * Since PAC-35 (API-064) a valid `login_hint` is forwarded to Google so the
 * account the user typed is preselected. Google still shows its consent
 * screen every time (`oauth2.ApprovalForce`); the hint chooses the
 * account, it does not skip the screen.
 */
export type get_StartGoogleOAuth = {
      method: "GET",
      path: "/api/auth/google",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            query?:  Partial<{ login_hint: string }>,
        
        
        
        
          }
      responses: {302: unknown,
},
      responseHeaders: {302: { Location: string, "Set-Cookie": string },
},
    }
/**
 * Expires the `auth_token` cookie. Note it is behind requireAuth, so logging
 * out with an already-expired token returns 401 rather than succeeding
 * (unchanged by PAC-35, spec section 5).
 */
export type post_Logout = {
      method: "POST",
      path: "/api/auth/logout",
      requestFormat: "json",
      responseFormat: "json",
      parameters: never,
      responses: {204: unknown,
401: Schemas.PlainTextError,
},
      responseHeaders: {204: { "Set-Cookie": string },
},
    }
/**
 * Since PAC-35 (API-065) the user's picture has one name in the
 * current-user read: `avatarUrl`, the name the server already sends.
 * Clients read it under that name; the server does not rename it.
 * Scheduling-link and booking hosts carry the same stored value as
 * `avatar_url` (`SchedulingLinkHost`, `PublicHost`), unchanged by PAC-35.
 */
export type get_GetCurrentUser = {
      method: "GET",
      path: "/api/auth/me",
      requestFormat: "json",
      responseFormat: "json",
      parameters: never,
      responses: {200: Schemas.CurrentUserResponse,
401: Schemas.PlainTextError,
404: Schemas.PlainTextError,
},
      
    }
/**
 * Sets an httpOnly `ms_oauth_state` cookie and redirects to Microsoft.
 * Configuration is read from env at request time (MICROSOFT_CLIENT_ID);
 * if the client id is blank the route 503s.
 * Since PAC-35 (API-064) a valid `login_hint` is forwarded to Microsoft.
 */
export type get_StartMicrosoftOAuth = {
      method: "GET",
      path: "/api/auth/microsoft",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            query?:  Partial<{ login_hint: string }>,
        
        
        
        
          }
      responses: {302: unknown,
503: Schemas.ErrorResponse,
},
      responseHeaders: {302: { Location: string, "Set-Cookie": string },
},
    }
/**
 * Validates `ms_oauth_state`, exchanges the code, fetches the Graph profile
 * and upserts the user, then saves the Microsoft token on THAT USER'S OWN
 * settings row (making Outlook their calendar provider), sets the session
 * cookie and redirects. Since PAC-24 the profile fetch is required, not
 * best-effort: without it there is no user to attach the credential to, so
 * nothing is saved. Before PAC-24 the token was saved on the single shared
 * settings row and the provider flipped for everyone.
 * Since PAC-35 (API-011, API-012) three failures after a successful code
 * exchange end on the app's sign-in failure state rather than on a JSON
 * error page on the API origin: the Graph profile could not be read (or
 * carried no email), the user could not be saved, or the session could
 * not be issued. See the `302` response.
 * 
 * Since PAC-67 this sign-in is also the Outlook RECONNECT, and what it
 * stores changes in two ways; no response, status or Location changes.
 * (1) When the code exchange returns an access token but NO refresh
 * token, the user's stored refresh token is kept, never overwritten with
 * an empty one, so a working connection is never erased by a reconnect
 * (spec PAC-67 AC-11). With no refresh token stored before either, the
 * result is a credential with no refresh token. It can never be renewed,
 * so it is reported not connected both by `getAuthStatus` (as today) and,
 * since PAC-67, by the `teams` row of `listConferenceProviders` (which
 * before PAC-67 reported it connected and enabled); once its access token
 * expires, Teams meeting creation with it answers the 400 "teams:
 * connection lost — reconnect at /api/auth/microsoft" without recording a
 * loss (contract challenge finding 5). (2) Storing the credential ends any recorded loss of
 * the Outlook connection for the user it resolves to (AC-12, AC-24), so
 * `getAuthStatus` (Outlook calendar provider) and the `teams` row of
 * `listConferenceProviders` report connected again. The credential is
 * still attached to the user matched by the Microsoft account's email,
 * and every sign-in still sets that user's calendar provider to
 * `outlook`, including a sign-in after `disconnectMicrosoft` (spec
 * PAC-67 D-4, OQ-5, OQ-10: unchanged on purpose).
 */
export type get_MicrosoftOAuthCallback = {
      method: "GET",
      path: "/api/auth/microsoft/callback",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            query:  { state: string, code: string },
        
        
        
        
          }
      responses: {302: unknown,
400: Schemas.PlainTextError,
500: Schemas.ErrorResponse,
503: Schemas.ErrorResponse,
},
      responseHeaders: {302: { Location: string, "Set-Cookie": string },
},
    }
/**
 * New in PAC-67 (spec AC-13, AC-16, AC-17, D-3, D-5, D-8). Protected by
 * requireAuth. Takes no request body (any body is ignored). Acts on the
 * CALLER only; no other user's credential, settings or activity log is
 * read or written.
 * 
 * Effects, in this order. Steps 1 and 2 are ONE atomic change: either
 * both happen or neither does (then the answer is the 500 below).
 * 1. The caller's stored Microsoft credential (access token, refresh
 *    token, expiry) is removed WHETHER OR NOT IT DECODES (a stored value
 *    that is not valid JSON, on which `LoadMicrosoftToken` fails, is
 *    removed like any other, answers `not_offered` and writes the entry
 *    of step 5; it is never a 500), and any recorded loss of it is
 *    cleared: a later Microsoft sign-in starts a fresh connection.
 * 2. When the caller's conferencing provider is `teams` it becomes
 *    `meet` (spec D-8); any other conferencing provider is unchanged.
 * 3. The caller's calendar provider is NOT changed (spec D-3): a caller
 *    on `outlook` stays on `outlook` and `getAuthStatus` reports
 *    `{connected: false, provider: "outlook"}` until they sign in with
 *    Microsoft again or choose another provider in settings.
 * 4. Nothing is sent to Microsoft. Microsoft offers no revocation of one
 *    application's grant for one user that Paceday can call with the
 *    user's own delegated token: deleting the delegated permission
 *    grant (`DELETE /oauth2PermissionGrants/{id}`) needs
 *    `DelegatedPermissionGrant.ReadWrite.All` and an administrator role
 *    for work or school accounts and is not supported for personal
 *    accounts, and the only per-user server call left
 *    (`revokeSignInSessions`) signs the user out of every application,
 *    which spec D-5 forbids (OQ-1, resolved in
 *    contracts/features/PAC-67.md §3). The answer therefore always
 *    carries `revocation: not_offered` when a credential was removed,
 *    and the client tells the user the grant can be removed from their
 *    Microsoft account (AC-17).
 * 5. One `provider_disconnected` activity entry is written for the
 *    caller, details `{"provider":"outlook","revocation":"not_offered"}`,
 *    after steps 1 and 2 have succeeded. The write is BEST-EFFORT, like
 *    every kind in the activity log (`storage.WriteAuditLog`): a failed
 *    insert is written to the server log and the 200 stands, because
 *    the credential is already removed; that disconnect then has no
 *    entry. No `revocation_unconfirmed` entry is written: nothing was
 *    attempted, so nothing failed (round-5 challenge NB-2).
 * 
 * A caller with no stored Microsoft credential gets 200 with
 * `revocation: nothing_stored`: step 2 still applies, nothing else
 * changes, and no activity entry is written.
 * 
 * After a 200 the `teams` row of `listConferenceProviders` reports
 * `connected: false` with `enabled` omitted.
 * 
 * Unlike `disconnectCalendar`, there is no 409: the operation applies to
 * every caller whatever their calendar provider, and it does not touch
 * the Google credential or the webcal link.
 */
export type post_DisconnectMicrosoft = {
      method: "POST",
      path: "/api/auth/microsoft/disconnect",
      requestFormat: "json",
      responseFormat: "json",
      parameters: never,
      responses: {200: Schemas.ProviderDisconnectResult,
401: Schemas.PlainTextError,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Looks up the SSO provider row for `{domain}`, builds the OIDC redirect
 * URL as `os.Getenv("APP_URL") + "/api/auth/callback/oidc/" + domain`, sets
 * an `sso_state` cookie of the form `<state>|<domain>`, and redirects.
 * This is the destination `detectAuthProvider` names in `redirect_url`;
 * the web app reaches it by resolving that path against the API origin and
 * appending `?login_hint=<typed email>` (PAC-35, API-010).
 * Since PAC-35 (API-064) a `login_hint` that passes the LoginHint rule AND
 * whose domain is exactly `{domain}` (case-insensitive, no subdomains, the
 * same test as the callback's PAC-45 check) is forwarded to the IdP. A hint
 * at another domain is dropped, so this route never sends one
 * organisation's IdP an address outside that organisation's domain.
 * Unchanged by PAC-35 (spec D-5): the 404, 500 and 501 answers below.
 * Since PAC-22 (API-060, spec D-1) createSsoProvider refuses SAML and
 * incomplete OIDC configurations, so the 501 below is reachable only for
 * rows stored before PAC-22; those rows are neither rewritten nor
 * deleted, and this route keeps refusing them exactly as before. The 500
 * (issuer discovery failed) stays reachable for any row whose discovery
 * fails: a row stored before PAC-22 with an empty issuer, and equally a
 * row written since whose issuer is unreachable or unusable
 * (createSsoProvider requires only a non-empty issuer, so `" "` is
 * accepted). Only an active row is looked up: a configuration
 * suspended through setSsoProviderState (PAC-22) answers the 404, as if
 * no SSO were configured.
 */
export type get_StartSsoLogin = {
      method: "GET",
      path: "/api/auth/sso/{domain}",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            query?:  Partial<{ login_hint: string }>,
        path:  { domain: string },
        
        
        
          }
      responses: {302: unknown,
404: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
501: Schemas.ErrorResponse,
},
      responseHeaders: {302: { Location: string, "Set-Cookie": string },
},
    }
/**
 * Protected by requireAuth (cookie `auth_token` or `Authorization: Bearer`).
 * Reports the CALLER'S own calendar connection: it branches on the caller's
 * `calendarProvider` and, on the outlook branch, reads the caller's own
 * stored Microsoft credential.
 * On an internal failure it does NOT error — it 200s with
 * {connected:false, provider:"google", email:""}.
 * 
 * Since PAC-67 `connected` means USABLE, not merely stored (spec PAC-67
 * §3, AC-8, AC-12, AC-13, AC-21). A credential whose renewal the provider
 * permanently refused (OAuth `invalid_grant` or equivalent) is kept
 * (spec D-1) but is recorded as lost, and while that loss is recorded
 * this operation reports `connected: false` for it. A temporary failure
 * (network, timeout, provider 5xx) is never recorded as a loss and never
 * turns this to false (AC-10). Per branch:
 * - `outlook`: true when the caller holds a stored Microsoft credential
 *   with a refresh token AND no loss of it is recorded; false after
 *   `disconnectMicrosoft` (the credential is gone) and after a loss.
 * - `google` (blank or any unrecognised provider): true when the caller
 *   holds a stored Google token row AND no loss of it is recorded.
 * - `webcal`: unchanged.
 * Only the caller's own credentials are consulted. A loss recorded while
 * the credential was being used for someone else (a teammate's team
 * availability request, a public booking page, a scheduled job) is the
 * OWNER's: it changes the owner's answer here, never the requester's
 * (spec D-12). The response shape is unchanged; no field is added.
 * 
 * PAC-24 resolves API-009. Before it, this branched on the SINGLETON
 * settings row's calendar_provider and returned that row's
 * `calendar_email`, and `auth.LoadMicrosoftToken` took no user id at all
 * (`backend/auth/microsoft_oauth.go:61`, `WHERE id = 1`) — so one user's
 * Outlook address and connection state were reported to everybody, and
 * only the google branch consulted the caller.
 * The response shape is unchanged; what changes is whose state it
 * describes. See `docs/specs/PAC-24.md` §2.5 for the wider problem the same
 * singleton created on the write side, which is in PAC-24's scope but is
 * not visible on this operation.
 */
export type get_GetAuthStatus = {
      method: "GET",
      path: "/api/auth/status",
      requestFormat: "json",
      responseFormat: "json",
      parameters: never,
      responses: {200: Schemas.AuthStatusResponse,
401: Schemas.PlainTextError,
},
      
    }
/**
 * Sets a 300-second HttpOnly `zoom_oauth_state` cookie (SameSite=Lax, Path=/) and 302-redirects to Zoom's authorize endpoint. Not a JSON endpoint. Requires a signed-in user since PAC-24: Zoom is connected to the caller's own settings, so there must be a caller (session cookie, which the browser sends on this top-level navigation).
 */
export type get_StartZoomOAuth = {
      method: "GET",
      path: "/api/auth/zoom",
      requestFormat: "json",
      responseFormat: "json",
      parameters: never,
      responses: {302: unknown,
401: "{\"error\":\"unauthorized\"}\n",
503: Schemas.BookingError,
},
      responseHeaders: {302: { Location: string, "Set-Cookie": string },
},
    }
/**
 * Compares `state` against the `zoom_oauth_state` cookie, clears that cookie, exchanges `code` for tokens, persists them on the CALLER'S OWN settings row (making Zoom the caller's conferencing provider, and nobody else's), then 302-redirects to the app root. Requires a signed-in user since PAC-24 (401 otherwise); before PAC-24 it wrote the single shared settings row. Error bodies here use `http.Error`, i.e. `text/plain; charset=utf-8` plain text, NOT the shared JSON error envelope.
 * 
 * Since PAC-67 (spec AC-3, AC-11, AC-12, AC-24) this is also the Zoom RECONNECT, and what it stores changes; no response, status or Location changes. The access token's expiry (from the exchange's `expires_in`) is stored with the tokens so the credential can be renewed when it expires. When the exchange returns no refresh token, the caller's stored refresh token is kept rather than overwritten with an empty one (AC-11). Storing the credential ends any recorded loss of the caller's Zoom connection, so the `zoom` row of `listConferenceProviders` reports connected again.
 */
export type get_HandleZoomOAuthCallback = {
      method: "GET",
      path: "/api/auth/zoom/callback",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            query?:  Partial<{ code: string, state: string }>,
        
        
        
        
          }
      responses: {302: unknown,
400: "invalid state\n",
401: "{\"error\":\"unauthorized\"}\n",
500: Schemas.BookingError,
},
      responseHeaders: {302: { Location: "/?connected=true&provider=zoom", "Set-Cookie": string },
},
    }
export type get_GetPublicLinkInfo = {
      method: "GET",
      path: "/api/book/{slug}",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        path:  { slug: string },
        
        
        
          }
      responses: {200: Schemas.PublicLinkInfo,
404: Schemas.BookingError,
410: Schemas.BookingError,
500: Schemas.BookingError,
},
      
    }
/**
 * Rate limited per client (NEW-booking-rate-limit). A client may make at most 20 requests to this operation per fixed 10-minute window; the window starts at the client's first counted request and is not extended by refused requests. The limit is checked and the request counted atomically, as the very first step of the handler: before the link lookup, before the body is read and before any validation, so every request counts whatever it would otherwise have answered (201, 400, 404, 409, 410, 422 or 500), and a refused request answers 429 even for an unknown slug and never writes a booking. Concurrent requests cannot exceed the limit. The count is per client across all links, not per link or per host, and is separate from the slot-listing budget of `getPublicBookingSlots`. A client is identified exactly as for `detectAuthProvider` (PAC-39): the socket peer address, or the `X-Real-IP` header only when the socket peer is inside `TRUSTED_PROXIES` (comma-separated IPs or CIDRs; empty or unset trusts nobody; an unparseable entry trusts less, never more). `X-Forwarded-For` is never read. A client is one exact IPv4 or IPv6 address, with no prefix grouping. Counts live in process memory: the limit is per backend process (20 per replica, as API-062's residue), and a restart clears them. Clients whose window has ended are forgotten by a sweep that runs on a request, at most once per window, so memory stays bounded. CORS preflight (`OPTIONS`) is answered by the CORS middleware and is not counted. Not checked (API-094, open): the requested time is never checked against the hosts' availability, the link's days or hours, or any upper date bound. The only time checks are the minimum notice (422) and overlap with this link's own non-cancelled bookings (409); any other start is accepted. The booking row is saved, then a calendar event (with the booker email as a guest) is attempted on each accepted host's calendar, best effort: a host whose user record or calendar client cannot be loaded is skipped and a failed event creation is ignored, so a 201 does not mean any host's calendar was written. Operation-level `security: []` is kept: this operation is public and is registered outside requireAuth; the rate limit is not authentication.
 */
export type post_CreatePublicBooking = {
      method: "POST",
      path: "/api/book/{slug}",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        path:  { slug: string },
        
        
        body:  Schemas.CreatePublicBookingRequest,
          }
      responses: {201: Schemas.PublicBookingConfirmation,
400: Schemas.BookingError,
404: Schemas.BookingError,
409: Schemas.BookingError,
410: Schemas.BookingError,
422: Schemas.BookingError,
429: Schemas.BookingRateLimitError,
500: Schemas.BookingError,
},
      responseHeaders: {429: { "Retry-After": number },
},
    }
/**
 * Two distinct modes. With `date`: `slots` is populated and `available_dates` is always the empty array. Without `date`: the handler probes the next 60 calendar days from `time.Now()` and returns those day strings in `available_dates`, with `slots` always the empty array. Both keys are always present in both modes. Rate limited per client (NEW-booking-rate-limit), separately from and more loosely than `createPublicBooking`: at most 120 requests per client per fixed 1-minute window, with or without `date`. The limit is checked and the request counted atomically as the handler's first step, before the link lookup and before the query is validated, so every request counts whatever it would otherwise have answered, and a refused request answers 429 even for an unknown slug. Booking requests do not consume this budget and slot requests do not consume the booking budget. Client identification, the per-process caveat, the sweep and the CORS preflight exemption are exactly as described on `createPublicBooking`; this limiter has its own counts and its own sweep.
 */
export type get_GetPublicBookingSlots = {
      method: "GET",
      path: "/api/book/{slug}/slots",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            query?:  Partial<{ date: string, duration: number }>,
        path:  { slug: string },
        
        
        
          }
      responses: {200: Schemas.PublicSlotsResponse,
400: Schemas.BookingError,
404: Schemas.BookingError,
410: Schemas.BookingError,
429: Schemas.BookingRateLimitError,
500: Schemas.BookingError,
},
      responseHeaders: {429: { "Retry-After": number },
},
    }
/**
 * Reads the authenticated user's primary Google calendar (calendar.CalendarClient.CalendarID, hardcoded to "primary" in backend/calendar/client.go) and flattens each event into the frontend-facing CalendarEvent shape. Room resource attendees (`*@resource.calendar.google.com`) are dropped from both `attendees` and `attendee_details`.
 */
export type get_ListCalendarEvents = {
      method: "GET",
      path: "/api/calendar/events",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            query:  { start: string, end: string },
        
        
        
        
          }
      responses: {200: Array<Schemas.CalendarEvent>,
400: Schemas.PlainTextError,
401: (Schemas.CalendarNotConnectedError | Schemas.MiddlewareUnauthorized),
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Thin passthrough over calendar.CalendarClient.GetFreeBusy. The response is `map[string][]calendar.TimeSlot`. calendar.TimeSlot (backend/calendar/freebusy.go) carries explicit json tags since PAC-26 (API-029), so each window is `{"start","end"}`, the same window shape as POST /api/freebusy. Before PAC-26 the struct had no tags and the keys were `Start` / `End`. The map wrapper is unchanged and is still NOT the POST /api/freebusy envelope. No frontend code calls this endpoint, but it is NOT dead: the MCP server's `clockwise_find_free_slots` tool (mcp/tools.go) calls it and relays the body to the model as text without parsing it, so the key casing change reaches the MCP client unchanged and breaks no code. U-03 stays resolved as "keep" (assumed by the factory for PAC-21, pending owner confirmation); PAC-26 changes only the window key casing, not the envelope.
 */
export type get_GetCalendarFreeBusy = {
      method: "GET",
      path: "/api/calendar/freebusy",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            query:  { start: string, end: string, attendees?: string },
        
        
        
        
          }
      responses: {200: Schemas.RawGoogleFreeBusyMap,
400: Schemas.PlainTextError,
401: (Schemas.CalendarNotConnectedError | Schemas.MiddlewareUnauthorized),
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Provider comes from the CALLER'S stored settings (`ConferencingProvider`), not from the request; the Teams credential is the caller's own (PAC-24; before it, both came from the single shared settings row).
 * 
 * Since PAC-67 (finding API-052, resolved here under factory section 7.1) the body is validated before any credential is read or any provider is called: `title` must be present and contain at least one character that is not whitespace, `start` and `end` must be present RFC 3339 date-times, and `end` must be after `start`. Anything else is the 400 "invalid body". "Whitespace" is exactly the set ECMA-262 `\s` matches (WhiteSpace and LineTerminator), so the server's test and the schema's `pattern: '\S'` on `CreateConferenceRequest.title` accept and refuse the same titles (contract challenge finding 1). Neither Go's `strings.TrimSpace` (`unicode.IsSpace`: adds U+0085, lacks U+FEFF) nor Go's `regexp` `\S` (ASCII only) is that set, so the server cannot use either as is. A `start` or `end` equal to `0001-01-01T00:00:00Z` cannot be told apart from an absent one and is refused as absent. Before PAC-67 a missing field decoded to the Go zero value and was forwarded to the provider (a blank title and the year 1).
 * 
 * Since PAC-67 (spec AC-3 to AC-5, AC-7 to AC-12) the Teams and Zoom credentials are renewed when the stored access token has expired, using the caller's own refresh token, and the renewed credential is stored for the caller only (a rotated refresh token replaces the stored one). A token that has not expired is used as is, with no renewal request. When the provider PERMANENTLY refuses the renewal (OAuth `invalid_grant` or equivalent) the request fails with the 400 "connection lost" sentence for that provider, the loss is recorded for the caller (the matching row of `listConferenceProviders` reports not connected, and the caller's activity log gets ONE `connection_lost` entry per loss however many requests hit it, written best-effort: see CONNECTION ENTRIES on `listAuditEntries`), and the stored credential is kept (spec D-1). A TEMPORARY renewal failure (timeout, network, provider 5xx) is the 500 below: it never says reconnect and records nothing (AC-10).
 * 
 * A Teams or Zoom credential whose access token has expired and that holds NO refresh token cannot be renewed: no renewal request is sent and the request fails with the same 400 "connection lost" sentence for that provider. Nothing is recorded and no activity entry is written, because such a credential is never reported connected (see `ConferenceProviderStatus.connected`), so there is no loss to start. A Zoom credential whose expiry is not stored (one stored before PAC-67) is treated as expired, so it is renewed before it is used.
 * 
 * API-091 (no frontend consumer) is resolved for this operation by keeping it: it is the standalone meeting-creation path spec PAC-67 AC-3, AC-5 and AC-8 test through, so those Go contract tests are its second opinion. Still not referenced anywhere in the frontend.
 */
export type post_CreateConferenceLink = {
      method: "POST",
      path: "/api/conference/create",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        
        
        
        body:  Schemas.CreateConferenceRequest,
          }
      responses: {200: Schemas.ConferenceMeetingDetails,
400: Schemas.BookingError,
401: "{\"error\":\"unauthorized\"}\n",
500: Schemas.BookingError,
},
      
    }
/**
 * Order is fixed: google_meet (only when Google OAuth env is configured), zoom (only when Zoom env is configured), teams (only when Microsoft env is configured), then `custom`, which is always last and always `connected: true`. Connection state and the Meet email describe the CALLER'S own settings and credentials (PAC-24). Length is therefore 1..4.
 * 
 * Since PAC-67 `connected` means USABLE, not merely stored (spec PAC-67 §3, AC-8, AC-12 to AC-14, AC-21, AC-23): a credential whose renewal the provider permanently refused is kept (spec D-1) but reported `connected: false` until the caller reconnects that provider; a temporary failure never changes it. The exact predicate of each row is on `ConferenceProviderStatus.connected`: a credential that can never be renewed (no refresh token) is not usable either and reads `connected: false`. This holds for every row whatever the caller's calendar provider: the `teams` row reports a lost Outlook credential even when the calendar provider is Google, and the `google_meet` row a lost Google credential even when it is Outlook (AC-21). A loss recorded while the credential was used for someone else (team availability, a public booking page, a scheduled job) changes the OWNER's rows only, never the requester's (spec D-12).
 * 
 * API-070 (resolved here under factory section 7.1, contract side): the variable length and the always-connected `custom` row were already documented above and are confirmed against `providers` in backend/api/handlers_conferencing.go; they are intended, not defects. What remains of the finding is a test that indexes the array by position and so passes only on a fully configured server; the PAC-67 backend stage looks rows up by `provider` instead (contracts/features/PAC-67.yaml resolvesFindings).
 */
export type get_ListConferenceProviders = {
      method: "GET",
      path: "/api/conference/providers",
      requestFormat: "json",
      responseFormat: "json",
      parameters: never,
      responses: {200: Array<Schemas.ConferenceProviderStatus>,
401: "{\"error\":\"unauthorized\"}\n",
500: Schemas.BookingError,
},
      
    }
/**
 * Takes no request body. Acts on the CALLER only; other users' credentials, settings and activity logs are untouched. Before PAC-24 the tokens were server-wide.
 * 
 * Since PAC-67 (spec AC-14 to AC-16, D-2, D-9), in this order: (1) LOCAL REMOVAL, one atomic change: the caller's stored Zoom credential is read into memory and then removed whether or not it decodes, any recorded loss of it is cleared, and the caller's conferencing provider becomes `meet` unconditionally (spec D-9, unchanged from before PAC-67). A failure up to and including this step is the 500 below, and then nothing has changed. (2) RENEWAL FOR REVOCATION, only when needed: when the removed access token is empty, has expired, or has no stored expiry (a credential stored before PAC-67), and a refresh token was stored, the server first renews it at Zoom's token endpoint with the removed refresh token, as a meeting creation would. The renewed access and refresh tokens are held in memory for this request only and are NEVER stored: the credential stays removed. When that renewal fails, refused permanently or temporarily, or when it is needed and no refresh token was stored, nothing is sent to the revocation endpoint and the answer is `revocation: unconfirmed`. That is not a loss: nothing is recorded and no `connection_lost` entry is written (the credential no longer exists). A disconnect while a loss is recorded is this case, since the refresh token was already refused. (3) REVOCATION: the unexpired or just-renewed access token is sent to Zoom's token revocation endpoint (`POST https://zoom.us/oauth/revoke`, client credentials in Basic auth, `token` = the access token). The answer is `revocation: confirmed` when Zoom answers success, and `revocation: unconfirmed` when Zoom refuses, answers an error, or cannot be reached. A stored credential that does not decode (non-blank `zoom_tokens` that is not valid JSON, the state behind the "zoom: stored credential is invalid" 400 of `createConferenceLink`) cannot be revoked at all: steps 2 and 3 send nothing and the answer is `revocation: unconfirmed`. The local removal stands in every case (spec D-2). No `connection_lost` entry is ever written by a disconnect. (4) ACTIVITY ENTRIES for the caller, written after the outcome is known: `confirmed` writes one `provider_disconnected` entry (details `{"provider":"zoom","revocation":"confirmed"}`); `unconfirmed`, including the undecodable and failed-renewal cases, writes two, one `provider_disconnected` (details `{"provider":"zoom","revocation":"unconfirmed"}`) and one `revocation_unconfirmed` (details `{"provider":"zoom"}`) (spec AC-15, AC-16; round-5 challenge NB-2). These writes are BEST-EFFORT, like every kind in the activity log (`storage.WriteAuditLog`): a failed insert is written to the server log and does not change the response, because the credential is already removed and the 200 is the only truthful answer. Such a disconnect has fewer entries than listed, possibly none; the 200 body is then the only record the user gets of the outcome. A caller with no stored Zoom credential (blank `zoom_tokens`) gets 200 with `revocation: nothing_stored`: the conferencing provider still becomes `meet`, nothing is sent to Zoom and no activity entry is written.
 * 
 * Before PAC-67 this answered 204 with no body and sent nothing to Zoom. The only consumer (smart-calendar-flow `zoomDisconnect`, typed `void`) resolves a 200 JSON body as it did the 204 and ignores it, so it keeps working; it owes the "revocation could not be confirmed" message (spec section 5).
 */
export type post_DisconnectZoom = {
      method: "POST",
      path: "/api/conference/zoom/disconnect",
      requestFormat: "json",
      responseFormat: "json",
      parameters: never,
      responses: {200: Schemas.ProviderDisconnectResult,
401: "{\"error\":\"unauthorized\"}\n",
500: Schemas.BookingError,
},
      
    }
/**
 * Fetches the event, applies the non-null fields of the body, and writes it back with calendar.CalendarClient.UpdateEvent. An ABSENT key and an explicit `null` are indistinguishable and both mean "leave unchanged". The field-by-field semantics are on EventPatchRequest. In short, since PAC-29: `send_updates` is passed to Google (absent means `none`, which is what every PATCH did before PAC-29); a bare `YYYY-MM-DD` `start` / `end` keeps the event all-day (API-043); `attendees` replaces the non-room guests but keeps each existing guest's Google entry (name, RSVP) and every room resource attendee (API-044); `room_resource_email` adds that room (API-018); `attendee_details` is declared, accepted and ignored (API-018). The 200 body is the event UpdateEvent returned, flattened by the same toCalendarEventDTO as GET /api/calendar/events: the CalendarEvent DTO (`title`, `start`, `end`, `attendees: string[]`, ...), never Google's own keys (`summary`, `start.dateTime`, `htmlLink`, `hangoutLink`) (API-017, U-04). Like the list, the DTO drops room resource attendees (`*@resource.calendar.google.com`) from `attendees` and `attendee_details`, so a room on the event is not visible in this body even though PATCH keeps it. Only a Google 404 or 410 from the initial GetEvent, or a GetEvent answer whose `status` is `cancelled` (Google returns recently deleted events that way), is a 404; any other GetEvent failure is a 500 (API-045). Error precedence (PAC-29): checks that need only the request come first (`invalid body`, `invalid send_updates`, `invalid room_resource_email`: 400), then the stored credential (401 / 500), then GetEvent (404 / 500), then the start/end kind check against the stored event (400); Google is written only after all of them pass. PAC-29: until PAC-29's implementation lands the server still encodes the raw google.golang.org/api/calendar/v3.Event, ignores `send_updates`, `room_resource_email` and `attendee_details`, decodes `start` / `end` as date-times only (a bare date is a 400 `invalid body`) and writes them as UTC `dateTime` (converting an all-day event to a timed one), replaces the whole attendee list with email-only entries (dropping names, RSVPs and the room), maps every GetEvent failure to 404, and writes to a cancelled event like any other. This operation describes the server after that PR, not before it.
 */
export type patch_PatchEvent = {
      method: "PATCH",
      path: "/api/events/{id}",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        path:  { id: string },
        
        
        body:  Schemas.EventPatchRequest,
          }
      responses: {200: Schemas.CalendarEvent,
400: Schemas.ErrorResponse,
401: (Schemas.CalendarNotConnectedError | Schemas.MiddlewareUnauthorized),
404: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Deletes the event from the user's primary calendar. Since PAC-29 the `send_updates` query parameter is passed to Google's delete call (API-042), and a Google 404 or 410 is a 404 like PATCH (API-045). PAC-29: until PAC-29's implementation lands the server reads no query parameter (so guests are never notified and an invalid `send_updates` is not rejected) and every delete failure, including a missing event, is a 500. This operation describes the server after that PR, not before it. Error precedence (PAC-29): an invalid `send_updates` is a 400 before the stored credential is read (401 / 500) and before any Google call.
 */
export type delete_DeleteEvent = {
      method: "DELETE",
      path: "/api/events/{id}",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            query?:  Partial<{ send_updates: ("all" | "none") }>,
        path:  { id: string },
        
        
        
          }
      responses: {204: unknown,
400: Schemas.ErrorResponse,
401: (Schemas.CalendarNotConnectedError | Schemas.MiddlewareUnauthorized),
404: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Uses the CALLER'S stored settings and credentials (PAC-24). Four branches. (1) The event already has a conference: returns 200 with the EXISTING link when the stored provider matches, or when `provider` is `custom`; otherwise 409. (2) `custom`: stores the supplied `url` in the event's private extended properties. (3) `google_meet`: asks Google to mint a Meet link. (4) anything else (`zoom`, `teams`): creates a meeting through the provider factory and stores the join URL in extended properties.
 * 
 * Since PAC-67 (spec AC-3, AC-8, AC-10, AC-12, AC-23, D-10) every credential this operation uses is renewed when expired and the renewal is stored for the caller. The event is read with the caller's GOOGLE credential before the Teams or Zoom credential is touched. When Google permanently refuses that renewal the answer is the existing 404 "event not found" (unchanged, spec D-7, D-10), the Google loss is recorded for the caller (the `google_meet` row and, for a Google calendar provider, `getAuthStatus` report not connected; one `connection_lost` entry naming `google`), and the Teams or Zoom credential is neither read, renewed nor reported. When the Teams or Zoom renewal is permanently refused the answer is the 400 "connection lost" sentence for that provider and that loss is recorded likewise. A temporary renewal failure records nothing: Google's gives the 404 as today, Teams' or Zoom's gives the 502 "upstream provider error". A Teams or Zoom credential whose access token has expired and that holds no refresh token gets the same 400 "connection lost" sentence with no renewal request, and records nothing (as on `createConferenceLink`).
 */
export type post_AddEventConference = {
      method: "POST",
      path: "/api/events/{id}/conference",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        path:  { id: string },
        
        
        body:  Schemas.AddEventConferenceRequest,
          }
      responses: {200: Schemas.EventConferenceLink,
400: Schemas.BookingError,
401: (Schemas.CalendarNotConnectedError | Schemas.MiddlewareUnauthorized),
404: Schemas.BookingError,
409: Schemas.BookingError,
500: Schemas.BookingError,
502: Schemas.BookingError,
},
      
    }
/**
 * Clears a Google Meet if present and strips the `paceday_conference_provider` / `paceday_conference_url` private extended properties. Idempotent: an event with no conference also returns 204 without writing anything.
 */
export type delete_RemoveEventConference = {
      method: "DELETE",
      path: "/api/events/{id}/conference",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        path:  { id: string },
        
        
        
          }
      responses: {204: unknown,
401: (Schemas.CalendarNotConnectedError | Schemas.MiddlewareUnauthorized),
404: Schemas.BookingError,
500: Schemas.BookingError,
},
      
    }
/**
 * Returns the caller's rows from the `focus_blocks` table (`user_id` = the authenticated user) where `date >= week AND date < week+7days`, ordered by start_time. Other users' blocks are never listed. Keys are snake_case (`id`, `google_event_id`, `start_time`, `end_time`, `date`, `created_at`) from explicit json tags on `storage.FocusBlock` (PAC-26, API-014). Before PAC-26 the struct had no tags and the encoder emitted the Go field names (`ID`, `GoogleEventID`, `StartTime`, ...), which the web app's FocusBlock type could not read.
 */
export type get_ListFocusBlocks = {
      method: "GET",
      path: "/api/focus/blocks",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            query?:  Partial<{ week: string }>,
        
        
        
        
          }
      responses: {200: Array<Schemas.FocusBlockRecord>,
400: Schemas.SchedulingErrorResponse,
500: Schemas.SchedulingErrorResponse,
},
      
    }
/**
 * Deletes the caller's focus blocks for the Monday-anchored week containing `week`, from the caller's calendar and from storage. Other users' blocks are not touched and not counted.
 */
export type delete_ClearFocusBlocks = {
      method: "DELETE",
      path: "/api/focus/blocks",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            query?:  Partial<{ week: string }>,
        
        
        
        
          }
      responses: {200: Schemas.FocusClearResult,
400: Schemas.SchedulingErrorResponse,
401: (Schemas.CalendarNotConnectedError | Schemas.MiddlewareUnauthorized),
500: Schemas.SchedulingErrorResponse,
},
      
    }
/**
 * Creates focus blocks for the target week. The body is optional: an absent or empty body (zero bytes or only whitespace) and the JSON literal `null` are treated as `{}`, i.e. the current week. Any other body that does not decode into FocusRunRequest is a 400 `invalid JSON`: a syntax error, a non-object top-level value (array, string, number, boolean), or a member of the wrong type such as `{"week":5}`. Before PAC-36 such a body was silently treated as `{}` and answered 200 for the current week (API-035). Only the first JSON value is read; bytes after it are not inspected, as on every sibling endpoint. A non-empty `week` that fails `time.Parse("2006-01-02", ...)` is a 400 `invalid week format, use YYYY-MM-DD`.
 */
export type post_RunFocus = {
      method: "POST",
      path: "/api/focus/run",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        
        
        
        body:  Schemas.FocusRunRequest,
          }
      responses: {200: Schemas.FocusRunResult,
400: Schemas.SchedulingErrorResponse,
401: (Schemas.CalendarNotConnectedError | Schemas.MiddlewareUnauthorized),
500: Schemas.SchedulingErrorResponse,
},
      
    }
/**
 * Backed by engine.FreeBusyService. Emails on known consumer domains (gmail.com, googlemail.com, outlook.com, hotmail.com, yahoo.com, icloud.com, live.com, msn.com, proton.me, protonmail.com) are never queried and come back with coverage/status "unknown" and an empty busy list. Emails are lowercased and trimmed before lookup. Results are cached for 15 minutes per (userID, email, UTC date of start). External lookups run under a 5s timeout; a timeout or provider failure degrades to "unknown" rather than an error. The response carries the same data three times for backwards compatibility.
 */
export type post_QueryFreeBusy = {
      method: "POST",
      path: "/api/freebusy",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        
        
        
        body:  Schemas.FreeBusyQueryRequest,
          }
      responses: {200: Schemas.FreeBusyQueryResponse,
400: Schemas.ErrorResponse,
401: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Returns every habit owned by the caller, active and inactive alike
 * (`storage.ListHabitsByUser` has no `active` filter), ordered by
 * `priority DESC, created_at ASC`. A nil slice is normalised to `[]`.
 */
export type get_ListHabits = {
      method: "GET",
      path: "/api/habits",
      requestFormat: "json",
      responseFormat: "json",
      parameters: never,
      responses: {200: Array<Schemas.Habit>,
401: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Server-side defaults are applied *before* validation:
 * `days_of_week` -> [1,2,3,4,5] when the key is absent or JSON `null`;
 * `window_start` -> "09:00" and `window_end` -> "17:00" when absent or blank after trimming;
 * `priority` -> 50 when absent or explicitly `0`;
 * `color` -> "#5B7FFF" when absent or empty.
 * `title` is trimmed. On success a background `ReoptimizeAll` is started.
 */
export type post_CreateHabit = {
      method: "POST",
      path: "/api/habits",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        
        
        
        body:  Schemas.HabitCreateRequest,
          }
      responses: {201: Schemas.Habit,
400: Schemas.ErrorResponse,
401: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Spawns `HabitsEngine.ReoptimizeAll` on a detached context (14-day horizon) and
 * returns immediately. The request body is never read. Errors from the background
 * job are swallowed and are not observable through this endpoint.
 */
export type post_ReoptimizeHabits = {
      method: "POST",
      path: "/api/habits/reoptimize",
      requestFormat: "json",
      responseFormat: "json",
      parameters: never,
      responses: {200: Schemas.HabitsReoptimizeAck,
401: Schemas.ErrorResponse,
},
      
    }
/**
 * Returns `engine.HabitTemplates` verbatim. Static, not user-scoped, never empty.
 * The handler writes no explicit status code, so Go's implicit 200 applies.
 */
export type get_ListHabitTemplates = {
      method: "GET",
      path: "/api/habits/templates",
      requestFormat: "json",
      responseFormat: "json",
      parameters: never,
      responses: {200: Array<Schemas.HabitTemplate>,
401: Schemas.ErrorResponse,
},
      
    }
/**
 * Every field is optional. Absent (or JSON `null`) fields keep the stored value —
 * the handler merges the body onto the existing row and then revalidates the whole
 * merged habit, so a partial update can still fail validation because of a
 * pre-existing stored value. Unlike POST, an explicit `priority: 0` is honoured
 * (0 is a legal priority here). On success a background `ReoptimizeAll` is started.
 * Ownership is checked before the body is decoded.
 */
export type patch_UpdateHabit = {
      method: "PATCH",
      path: "/api/habits/{id}",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        path:  { id: string },
        
        
        body:  Schemas.HabitUpdateRequest,
          }
      responses: {200: Schemas.Habit,
400: Schemas.ErrorResponse,
401: Schemas.ErrorResponse,
403: Schemas.ErrorResponse,
404: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Sets `active = false`. The row is never removed, and existing
 * habit_occurrences rows and any already-created calendar events are left in place.
 */
export type delete_DeactivateHabit = {
      method: "DELETE",
      path: "/api/habits/{id}",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        path:  { id: string },
        
        
        
          }
      responses: {204: unknown,
400: Schemas.ErrorResponse,
401: Schemas.ErrorResponse,
403: Schemas.ErrorResponse,
404: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * The range defaults to [today-1month, today+1month] computed from `time.Now().UTC()`
 * truncated to midnight. Both bounds are inclusive (`scheduled_date >= from AND <= to`).
 * Results are ordered by `scheduled_date ASC`. A nil slice is normalised to `[]`.
 */
export type get_ListHabitOccurrences = {
      method: "GET",
      path: "/api/habits/{id}/occurrences",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            query?:  Partial<{ from: string, to: string }>,
        path:  { id: string },
        
        
        
          }
      responses: {200: Array<Schemas.HabitOccurrence>,
400: Schemas.ErrorResponse,
401: Schemas.ErrorResponse,
403: Schemas.ErrorResponse,
404: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Only `status` is read. It is lowercased and trimmed before comparison, so
 * "Completed" and " completed " are accepted. Ownership is enforced inside the
 * SQL UPDATE (join on habits.user_id); a row belonging to another user is
 * indistinguishable from a missing row and yields 404, not 403.
 * The engine also writes "displaced" and "missed" statuses, but neither can be
 * set through this endpoint.
 */
export type patch_UpdateHabitOccurrenceStatus = {
      method: "PATCH",
      path: "/api/habits/{id}/occurrences/{occurrenceId}",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        path:  { id: string, occurrenceId: string },
        
        
        body:  Schemas.HabitOccurrenceStatusUpdate,
          }
      responses: {200: Schemas.HabitOccurrence,
400: Schemas.ErrorResponse,
401: Schemas.ErrorResponse,
404: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Static JSON. Never touches the database. Source: handlers_health.go —
 * the version string "0.1.0" is hardcoded in the handler.
 */
export type get_GetHealth = {
      method: "GET",
      path: "/api/health",
      requestFormat: "json",
      responseFormat: "json",
      parameters: never,
      responses: {200: Schemas.HealthResponse,
},
      
    }
/**
 * Public by design (routes.go comment) so the login screen can hide
 * providers the server cannot start. Derived purely from environment
 * variables; never returns credential values.
 */
export type get_GetIntegrationAvailability = {
      method: "GET",
      path: "/api/integrations/availability",
      requestFormat: "json",
      responseFormat: "json",
      parameters: never,
      responses: {200: Schemas.IntegrationAvailabilityResponse,
},
      
    }
/**
 * Idempotent. The storage error is discarded, so this is always 204.
 */
export type delete_DisconnectNotion = {
      method: "DELETE",
      path: "/api/integrations/notion",
      requestFormat: "json",
      responseFormat: "json",
      parameters: never,
      responses: {204: unknown,
401: Schemas.ErrorResponse,
},
      
    }
/**
 * Validates `state` against the `notion_oauth_state` cookie, exchanges `code` at
 * `https://api.notion.com/v1/oauth/token` (HTTP Basic with client id/secret),
 * upserts the connection and 302-redirects into the SPA.
 * The stored connection has no bot token and no scopes (Notion returns none here).
 */
export type get_NotionOauthCallback = {
      method: "GET",
      path: "/api/integrations/notion/callback",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            query:  { code?: string, state: string },
        
        
        
        
          }
      responses: {302: unknown,
400: string,
401: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
502: Schemas.ErrorResponse,
},
      responseHeaders: {302: { Location: string },
},
    }
/**
 * Sets an HttpOnly `notion_oauth_state` cookie (Path=/, Max-Age=300) and 302-redirects
 * to Notion. Browser navigation endpoint, no body. Unlike Slack, no `scope` is
 * requested — the query carries `response_type=code` and `owner=user`.
 */
export type get_ConnectNotion = {
      method: "GET",
      path: "/api/integrations/notion/connect",
      requestFormat: "json",
      responseFormat: "json",
      parameters: never,
      responses: {302: unknown,
401: Schemas.ErrorResponse,
503: Schemas.ErrorResponse,
},
      responseHeaders: {302: { Location: string, "Set-Cookie": string },
},
    }
/**
 * Always 200. Any storage error collapses into `{"connected": false}` with no `workspace_name` key.
 */
export type get_GetNotionStatus = {
      method: "GET",
      path: "/api/integrations/notion/status",
      requestFormat: "json",
      responseFormat: "json",
      parameters: never,
      responses: {200: Schemas.IntegrationStatus,
401: Schemas.ErrorResponse,
},
      
    }
/**
 * Deletes the `workspace_connections` row for (user, "slack"). The storage error is
 * explicitly discarded, so a failed delete is still reported as 204. Deleting a
 * connection that does not exist is also 204 — this endpoint is idempotent and
 * never reports 404.
 */
export type delete_DisconnectSlack = {
      method: "DELETE",
      path: "/api/integrations/slack",
      requestFormat: "json",
      responseFormat: "json",
      parameters: never,
      responses: {204: unknown,
401: Schemas.ErrorResponse,
},
      
    }
/**
 * Validates the `state` query value against the `slack_oauth_state` cookie, exchanges
 * `code` at `https://slack.com/api/oauth.v2.access`, upserts the workspace connection
 * and 302-redirects into the SPA. Never returns JSON on success.
 */
export type get_SlackOauthCallback = {
      method: "GET",
      path: "/api/integrations/slack/callback",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            query:  { code?: string, state: string },
        
        
        
        
          }
      responses: {302: unknown,
400: string,
401: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
502: Schemas.ErrorResponse,
},
      responseHeaders: {302: { Location: string },
},
    }
/**
 * Sets an HttpOnly `slack_oauth_state` cookie (Path=/, Max-Age=300) and 302-redirects
 * to Slack. This is a browser navigation endpoint, not a JSON API: it returns no body.
 * Requested scopes: `search:read,users:read,channels:read,chat:write`; user_scope `search:read`.
 * Note this route sits inside the authenticated group, so the browser must already
 * carry the `auth_token` cookie when it navigates here.
 */
export type get_ConnectSlack = {
      method: "GET",
      path: "/api/integrations/slack/connect",
      requestFormat: "json",
      responseFormat: "json",
      parameters: never,
      responses: {302: unknown,
401: Schemas.ErrorResponse,
503: Schemas.ErrorResponse,
},
      responseHeaders: {302: { Location: string, "Set-Cookie": string },
},
    }
/**
 * Always 200. Any storage error (including "no row") is collapsed into
 * `{"connected": false}` — the `workspace_name` key is then absent entirely.
 */
export type get_GetSlackStatus = {
      method: "GET",
      path: "/api/integrations/slack/status",
      requestFormat: "json",
      responseFormat: "json",
      parameters: never,
      responses: {200: Schemas.IntegrationStatus,
401: Schemas.ErrorResponse,
},
      
    }
/**
 * Probes one AI configuration by issuing a fixed completion (system "You are a helpful assistant.", user "Say hello").
 * **NEW-llm-bring-your-own: Paceday supplies no credential.** Every request this server makes to an AI provider carries a key that the caller (or, after Part 2 of the spec, their organisation) entered, and nothing else that authenticates. No environment variable, credential file, shared profile, metadata service or managed identity of the machine Paceday runs on is read for an AI request; in particular the AWS default credential chain, Azure DefaultAzureCredential and Google Application Default Credentials are not used, and `AWS_BEARER_TOKEN_BEDROCK` in the server's environment is ignored (spec O-1, O-2, O-3, AC-1, AC-2). Ollama is removed (spec O-4). The five providers and how each carries its key (spec D-2, D-3, D-4):
 * * `openai`: `Authorization: Bearer <key>`, POST
 *   `<destination>/v1/chat/completions`.
 * * `anthropic`: `x-api-key: <key>`, POST `<destination>/v1/messages`. * `azure_openai`: `api-key: <key>` and NO `Authorization` header, POST
 *   `<azureEndpoint>/openai/deployments/<azureDeployment>/chat/completions?api-version=<azureApiVersion>`
 *   (spec AC-3).
 * * `bedrock`: an Amazon Bedrock API key as `Authorization: Bearer <key>`,
 *   POST `https://bedrock-runtime.<awsRegion>.amazonaws.com/model/<bedrockModel>/converse`
 *   (`us-east-1` when `awsRegion` is empty). No SigV4 signature and no
 *   other AWS credential is sent or loaded (spec AC-4).
 * * `vertex`: a Vertex AI express-mode API key in the `x-goog-api-key`
 *   header, never in the URL, POST
 *   `https://aiplatform.googleapis.com/v1/publishers/google/models/<vertexModel>:generateContent`.
 *   No project or location is used (spec AC-5).
 * 
 * **Model IDs in the path.** `<bedrockModel>` and `<vertexModel>` are each sent as ONE path segment, percent-encoded with the path-segment rule of RFC 3986 §3.3 (Go `url.PathEscape`): `/`, `?`, `#`, `%`, `;`, `,`, space and every non-ASCII or control byte are encoded; letters, digits, `-`, `.`, `_`, `~`, `:`, `@` and the other sub-delimiters are sent literally. So the stored default `anthropic.claude-sonnet-4-5-20251001-v1:0` is requested as exactly `/model/anthropic.claude-sonnet-4-5-20251001-v1:0/converse` (the `:` is not encoded, as in the provider's own examples), and a value containing `/` (an inference-profile ARN) cannot add a path segment: its `/` is sent as `%2F`. For Vertex the `:` before `generateContent` is the method separator and is not part of the encoded model segment.
 * A key the provider rejects (an expired Bedrock short-term key, a key for another region, a revoked key) is a provider failure, the 502, not "AI not configured" (spec D-13).
 * **Which configuration is probed (spec D-19).** The body may name a choice in `llmProvider`:
 * * **A provider** (`openai`, `anthropic`, `azure_openai`, `bedrock`,
 *   `vertex`), saved or not: the probe uses that provider, the caller's
 *   OWN stored destination values for it, and the submitted `llmApiKey`
 *   when the body carries one, otherwise the key bound to THAT provider on
 *   the caller's account (`Settings.llmApiKeysSet`). A key bound to
 *   another provider, and a key bound to no provider
 *   (`llmUnboundApiKeySet`), is never used, so "Test connection" on an
 *   unsaved provider choice never carries the saved provider's key (spec
 *   AC-37). When there is no key (none bound and none submitted, or
 *   `llmApiKey: ""`) the answer is the 409 with reason `needs_key` naming
 *   that provider, and nothing is sent.
 * * **`""`** (AI off): the 409 `off`. Nothing is sent. * **`unsupported`**: accepted ONLY when the caller's saved choice reads
 *   as `unsupported` (a stored provider Paceday no longer supports,
 *   `ollama`), so a client that builds the probe body from the settings
 *   document it read (`Settings.llmProvider`) gets the same answer as
 *   `{}` and as the caller's parse: it is decided exactly as the absent
 *   case below, which for such a row is the 409 of row 7 or 8
 *   (`provider_removed`, or after Part 2
 *   `provider_removed_organization_available`). A submitted `llmModel` /
 *   `llmApiKey` is sent nowhere. When the saved choice does not read as
 *   `unsupported`, `unsupported` is a 400 (contract challenge
 *   2026-10-28, blocking 1).
 * * **`organization`**: decided as a request of a caller who follows
 *   their organisation (rows 4-6). In row 4 the probe tests the
 *   organisation's configuration exactly as the caller's requests use
 *   it: its provider, model, destination and key at the confirmed
 *   version, nothing of the caller's (spec D-18). A submitted
 *   `llmModel` or `llmApiKey` is never combined with an organisation
 *   configuration: in row 4 it is the 400 below; in rows 5 and 6 it is
 *   that row's 409; while personal keys are forbidden, a submitted
 *   `llmApiKey` is the 409 `personal_keys_forbidden` of step 1a. Nothing
 *   is sent in any of these cases (spec P2-AC-20, P2-AC-28).
 * * **Absent**: the caller's SAVED choice, decided exactly as their parse
 *   and brief refresh would decide it (spec §3 table, AC-40). When the
 *   saved choice is a provider, a submitted `llmModel` / `llmApiKey`
 *   replaces the stored model / bound key for this probe only. When it is
 *   not (`""`, `organization`, `unsupported`), the answer is that row's
 *   409, and a submitted key is sent nowhere.
 * 
 * **NEW-llm-bring-your-own Part 2 (spec `docs/specs/NEW-llm-bring-your-own-part2.md` §3.5, revision 1).** "Names a provider" means `llmProvider` is one of `openai`, `anthropic`, `azure_openai`, `bedrock`, `vertex`; `""`, `organization` and `unsupported` do not name a provider. Naming a provider always probes the caller's OWN configuration for it, even when it is the organisation's provider: naming a provider never selects the organisation's key (spec P2-D6; this replaces the parent spec's "names exactly the organisation's provider" clause). The organisation's configuration is probed only by `{}` (saved choice in row 4) or `{"llmProvider":"organization"}`, and then the 200's `configuration` is `organization`. While the caller's organisation forbids personal keys (owner O-12), a probe that names a provider or carries `llmApiKey` (whatever `llmProvider` is, including `organization` and `unsupported`) is the 409 `personal_keys_forbidden` with `enablers: [organization_admin]`, and nothing is sent (P2-AC-20). Otherwise a caller whose decided row is 5, 6, 7, 8, 10 or 11 gets that row's 409; in particular `{"llmProvider":"unsupported"}` with a saved `unsupported` choice in an organisation that forbids personal keys is row 10 (`[user]`) or 11 (`[organization_admin]`), decided as the saved choice. Row 9 is reserved and never answered.
 * **No key in provider error text (spec §3.1a, P2-AC-39; contract revision 3).** The 502's body is the fixed `upstream provider error` in every row, so no answer carries provider or gateway error text. The upstream error string goes only to the server log and Sentry, after every occurrence of every key sent with this request (in row 4 the confirmed version's key, even if replaced since) and of the caller's keys (stored and submitted) is replaced by `[redacted]` (exact strings; an encoded echo can reach those operator-only surfaces, spec §5).
 * **Order of decisions.** (1) The body's shape: the 400. (1a, Part 2) Personal keys forbidden and the body names a provider or carries `llmApiKey`: the 409. Step 1a wins over every later step, so a confirmed follower's `{"llmApiKey":"…"}` or `{"llmProvider":"organization","llmApiKey":"…"}` while forbidden is this 409, never the 400 of step 2a (spec §3.5, P2-AC-20; contract revision 3). (2) Which configuration, as above: when there is none, the 409 and nothing is sent; (2a, Part 2) when it is the organisation's (row 4) and the body carries `llmModel` (or, with personal keys allowed, `llmApiKey`), the 400. (3) The destination check: the 422 and nothing sent. (4) The request: the 200 or the 502. Step 2 precedes step 3, so a caller with no key whose stored destination would also be refused gets the 409 `needs_key`, not the 422: by the spec's table only a configured caller sends anything, so only a configured caller's destination is checked. This replaces PAC-70's "a refused destination with no key is a 422" (`contracts/features/NEW-llm-bring-your-own.md` §6); nothing is sent in either case.
 * **THE DESTINATION IS NEVER SUPPLIED BY THE CALLER (PAC-24, unchanged).** Every value that contributes to the URL - `llmBaseUrl`, `azureEndpoint`, `azureDeployment`, `azureApiVersion`, `awsRegion`, `bedrockModel`, `vertexModel` - is read from the CALLER'S OWN stored settings (in row 4, Part 2: from the organisation's stored configuration at the confirmed version, and nothing of the caller's) and from nowhere else. The body may carry only `llmProvider`, `llmModel` and `llmApiKey`, none of which reaches a URL (`llmModel` is a JSON body field of the `openai` and `anthropic` requests only). PAC-24 rejected per-property overrides because `{"llmProvider":"openai","llmBaseUrl":"https://attacker.example"}` would have paired a caller-chosen host with the stored key; that argument holds for every key-carrying provider, so the closed body stays. The body is REQUIRED: `{}` probes the saved choice, and an absent body is a 400.
 * **Approved destinations (PAC-66, PAC-66-B; carried, with the changes marked NEW).** A request is sent only to a destination the OPERATOR approved for the provider in use. No request property and no stored setting can add to the approved set, and a destination approved for one provider is never one for another.
 * * `openai` / `anthropic`: the effective destination is the stored
 *   `llmBaseUrl`, or the vendor's public host (`https://api.openai.com`,
 *   `https://api.anthropic.com`, always approved) when it is `""`. Extra
 *   destinations come from `PACEDAY_LLM_APPROVED_HOSTS_OPENAI` /
 *   `_ANTHROPIC`. Only `https` on the default port. NEW (owner decision
 *   O-10, spec AC-18): an operator entry may carry a path prefix
 *   (`https://gw.example/openai`) for an OpenAI-compatible gateway. A
 *   stored `llmBaseUrl` is approved when it is exactly an entry's origin
 *   followed by exactly that entry's prefix (an entry without a prefix
 *   approves the bare origin only), with at most one trailing `/`, and no
 *   query, fragment, userinfo or whitespace. The request then goes to the
 *   prefix followed by the chat operation
 *   (`https://gw.example/openai/v1/chat/completions`) and to no other
 *   path. The same host with a different, longer or missing prefix is not
 *   approved unless another entry for that provider approves it.
 * * `azure_openai`: the stored `azureEndpoint`'s host must be in
 *   `PACEDAY_LLM_APPROVED_HOSTS_AZURE_OPENAI`, `https`, default port; an
 *   empty endpoint is `destination_not_set`.
 * * `bedrock`: `bedrock-runtime.<awsRegion>.amazonaws.com` must be in
 *   `PACEDAY_LLM_APPROVED_HOSTS_BEDROCK`.
 * * `vertex`: NEW, `aiplatform.googleapis.com` must be in
 *   `PACEDAY_LLM_APPROVED_HOSTS_VERTEX`; otherwise `provider_not_enabled`.
 *   A regional `<location>-aiplatform.googleapis.com` entry approves
 *   nothing Paceday sends any more (express mode uses only the global
 *   host).
 * * NEW: a stored `llmBaseUrl` approved for no remaining provider (for
 *   example an origin once approved for Ollama and written through the
 *   web's former Ollama field) is kept, and an `openai` / `anthropic`
 *   request with it is refused before anything is sent, naming
 *   `llmBaseUrl` (spec D-14, AC-39). It is never replaced by the public
 *   host.
 * * `PACEDAY_LLM_APPROVED_ORIGINS_OLLAMA` approves nothing; a server
 *   started with it set logs once that it is no longer used (spec AC-19).
 * * A redirect is never followed, on any provider; the request that drew
 *   it counts as failed (the 502), and the key is in that first request
 *   only. The check is made on every send, not only on write.
 * 
 * No response on any status carries the submitted key or any stored key (PAC-24 AC-14), including the 409. Since PAC-21 the 502 body is the fixed `upstream provider error`; the detail goes to the server log only.
 */
export type post_TestLLMConnection = {
      method: "POST",
      path: "/api/llm/test",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        
        
        
        body:  Schemas.LLMTestRequest,
          }
      responses: {200: Schemas.LLMTestResult,
400: Schemas.SchedulingErrorResponse,
409: Schemas.LLMNotConfiguredResponse,
422: Schemas.LLMDestinationRefusal,
500: Schemas.SchedulingErrorResponse,
502: Schemas.SchedulingErrorResponse,
},
      
    }
/**
 * Returns exactly 12 week buckets per member (months=3 is hard-coded and numWeeks = months*4), ordered NEWEST FIRST: weeks[0].week_start == the resolved `week`, each subsequent entry is 7 days earlier. A member with no data still gets 12 buckets of zeroes with data_available=false. `members` is always an array, never null. Visibility (PAC-60): a member who is a Paceday user has measured minutes only when the caller owns at least one team that member belongs to; otherwise every bucket is zeroes with data_available=false, whatever the route or `team_id` that put the member on the caller's list. External (non-Paceday) members are unaffected (FreeBusy). PAC-34 (API-022): each member also carries is_paceday_user (same derivation as the roster's) and a member-level data_available that is true iff at least one of its 12 buckets has data_available=true. A client must render a bucket with data_available=false, and a member with data_available=false, as "no data", never as zero minutes. Neither field widens visibility: is_paceday_user is already on the roster for the same caller and members, and data_available is derived only from the buckets this response already returns.
 */
export type get_GetManagerAnalytics = {
      method: "GET",
      path: "/api/manager/analytics",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            query?:  Partial<{ team_id: string, week: string }>,
        
        
        
        
          }
      responses: {200: Schemas.ManagerAnalytics,
400: Schemas.ErrorResponse,
403: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * PREVIEW half of the preview-then-confirm flow. Runs DetectTeam (which does write the global manager_team_members identity rows and one_on_one_occurrences as a side effect of scanning the calendar) and then reports, per candidate, whether that email is ALREADY assigned to the selected team. `assigned` is hard-coded to 0: this endpoint never creates a manager_team_member_assignments row for any team. `team_id` is REQUIRED here and the caller must be the team OWNER.
 */
export type post_PreviewManagerDetection = {
      method: "POST",
      path: "/api/manager/detect",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            query:  { team_id: string },
        
        
        
        body:  Record<string, unknown>,
          }
      responses: {200: Schemas.ScanPreview,
400: Schemas.ErrorResponse,
401: (Schemas.CalendarNotConnectedError | Schemas.MiddlewareUnauthorized),
403: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * CONFIRM half of the preview-then-confirm flow. The only endpoint that creates manager_team_member_assignments rows from detection. Runs in a single transaction (storage.ConfirmManagerTeamMembers) and is idempotent: a second confirm of the same email counts as skipped, not assigned. Emails are lowercased/trimmed by the handler before storage sees them. The request decoder uses DisallowUnknownFields, so any field other than `emails` yields 400 "invalid JSON".
 */
export type post_ConfirmManagerDetection = {
      method: "POST",
      path: "/api/manager/detect/confirm",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            query:  { team_id: string },
        
        
        
        body:  Schemas.ScanConfirmRequest,
          }
      responses: {200: Schemas.ScanConfirmation,
400: Schemas.ErrorResponse,
403: Schemas.ErrorResponse,
422: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Gaps are computed over the roster in scope: the manager's global roster, or, when `team_id` is supplied, the team-scoped roster with that team's cadences. Members with cadence="none" never appear. A member never met is due now. A member with a recorded 1:1 occurrence in the next 14 days is suppressed. Sorted by days_overdue descending. `gaps` is always an array, never null.
 */
export type get_GetManagerCadenceGaps = {
      method: "GET",
      path: "/api/manager/gaps",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            query?:  Partial<{ team_id: string }>,
        
        
        
        
          }
      responses: {200: Schemas.CadenceGapList,
400: Schemas.ErrorResponse,
403: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Not team-scoped. `team_member_count` counts rows in manager_team_members for the caller (the global identity table), not assignments to any one formal team.
 */
export type get_GetManagerProfile = {
      method: "GET",
      path: "/api/manager/profile",
      requestFormat: "json",
      responseFormat: "json",
      parameters: never,
      responses: {200: Schemas.ManagerProfileSummary,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * When `is_manager` is true and the profile has no `detected_at` yet, the handler spawns a background goroutine running DetectTeam with a 30s timeout. That background run persists detected members into the GLOBAL manager_team_members table only; it never creates team assignments. The response is written before the goroutine completes.
 */
export type post_SetManagerProfile = {
      method: "POST",
      path: "/api/manager/profile",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        
        
        
        body:  Schemas.ManagerProfileUpdate,
          }
      responses: {200: Schemas.UserProfileGoStruct,
400: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * `team_id` is REQUIRED (unlike the member-mutation routes below), and membership — not ownership — suffices. The roster is the union of (a) manager assignments for this team and (b) formal team_members of this team that have no assignment yet, synthesised with source="formal" and cadence="none". The caller is always excluded from (b). Sorted case-insensitively by display_name. `members` is always an array, never null.
 */
export type get_GetManagerRoster = {
      method: "GET",
      path: "/api/manager/team",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            query:  { team_id: string, week?: string },
        
        
        
        
          }
      responses: {200: Schemas.ManagerRoster,
400: Schemas.ErrorResponse,
403: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * `team_id` is OPTIONAL here. Without it the member is written to the global manager_team_members table only. With it the write is transactional across manager_team_members plus manager_team_member_assignments, and the caller must be the team OWNER. Adding a member never creates a team_invites row (asserted by TestManagerTeam_AddMemberCreatesOnlySelectedTeamAssignment).
 */
export type post_AddManagerTeamMember = {
      method: "POST",
      path: "/api/manager/team/members",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            query?:  Partial<{ team_id: string }>,
        
        
        
        body:  Schemas.AddManagerMemberRequest,
          }
      responses: {201: Schemas.ManagerTeamMemberGoStruct,
400: Schemas.ErrorResponse,
403: Schemas.ErrorResponse,
422: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Without `team_id`: deletes the global manager_team_members row outright. With `team_id` (owner required): removes the formal team_members row if the email maps to a Paceday user, deletes the manager assignment for this team only, deletes pending team_invites for this email on this team, and LEAVES the global manager_team_members identity row and its 1:1 history intact. Every storage error on this path is swallowed, so a failed delete still returns 204.
 */
export type delete_RemoveManagerTeamMember = {
      method: "DELETE",
      path: "/api/manager/team/members/{email}",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            query?:  Partial<{ team_id: string }>,
        path:  { email: string },
        
        
        
          }
      responses: {204: unknown,
400: Schemas.ErrorResponse,
403: Schemas.ErrorResponse,
422: Schemas.ErrorResponse,
},
      
    }
/**
 * Omitted fields keep their current value. Supplying `cadence` as anything other than "custom" clears cadence_custom_days; omitting `cadence` preserves it (TestManagerPatchMember_PreservesOmittedCustomDays). A blank display_name falls back to the local part of the email. With `team_id`, only team-scoped preferences change (display_name_override, cadence, cadence_custom_days on the assignment row); the canonical global display name is never overwritten. Also, with `team_id`, a formal team member with no assignment yet is materialised into an assignment on first patch.
 */
export type patch_PatchManagerTeamMember = {
      method: "PATCH",
      path: "/api/manager/team/members/{email}",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            query?:  Partial<{ team_id: string }>,
        path:  { email: string },
        
        
        body:  Schemas.PatchManagerMemberRequest,
          }
      responses: {200: Schemas.ManagerTeamMemberGoStruct,
400: Schemas.ErrorResponse,
403: Schemas.ErrorResponse,
404: string,
422: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Creates nothing on any calendar. Returns a relative URL of the form `/app?attendees=<email>&duration=30&title=1%3A1+with+<display_name>` plus `&date=<suggested_date>` when supplied (query params are Go url.Values-encoded, so alphabetically ordered). An empty body is accepted (io.EOF is tolerated).
 */
export type post_ScheduleManagerOneOnOne = {
      method: "POST",
      path: "/api/manager/team/members/{email}/schedule",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            query?:  Partial<{ team_id: string }>,
        path:  { email: string },
        
        
        body:  Schemas.ScheduleOneOnOneRequest,
          }
      responses: {200: Schemas.PrefillUrlResponse,
400: Schemas.ErrorResponse,
403: Schemas.ErrorResponse,
404: string,
422: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Pure read — it never triggers generation. When no brief row exists the handler
 * returns 200 (not 404) with `{"status":"pending","sources":{"slack":[],"notion":[]}}`
 * and no `generated_at` / `brief_text`.
 */
export type get_GetMeetingBrief = {
      method: "GET",
      path: "/api/meetings/{event_id}/brief",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        path:  { event_id: string },
        
        
        
          }
      responses: {200: Schemas.MeetingBriefResponse,
400: string,
401: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Synchronous and slow — bounded by a 60s server-side context timeout. Calls
 * `MeetingBriefService.Generate(..., force=true)`, which searches Slack and Notion
 * and (when an LLM is configured in settings) writes `brief_text`.
 * The handler builds a stub `calendar.Event{Id: event_id}` rather than fetching the
 * real event, so the brief's search terms come from the stored/derived context only.
 * The request body is never read.
 * The returned `status` is "ready" on success and "failed" when the source fetch or
 * LLM step failed — a "failed" brief is still returned with HTTP 200.
 * 
 * **NEW-llm-bring-your-own: "AI not configured" changes nothing.** Before anything
 * else - before any brief is written and before Slack or Notion is searched - the
 * server decides which AI configuration the request runs on, by the table in
 * `docs/specs/NEW-llm-bring-your-own.md` §3 (summarised on `AINotConfigured`). When
 * the caller has none, the answer is the 409 below: no `pending` or `failed` brief
 * is written at any point, whatever was stored for the event (no brief, pending,
 * ready or failed) stays exactly as it was, so `getMeetingBrief` afterwards answers
 * exactly what it answered before, and no Slack, Notion or AI provider request is
 * made (spec AC-14, D-12). Before this change a `pending` brief was written first and
 * then replaced by a `failed` one, losing a ready brief.
 * 
 * A configured request uses only the caller's own key-based provider with the key
 * bound to it; no identity of the machine Paceday runs on and no deployment-level
 * key is used (spec O-2, O-3, AC-2). A destination refusal or a provider failure on
 * a configured caller is unchanged: 200, `status: "failed"`, stored.
 * 
 * **NEW-llm-bring-your-own Part 2 (spec `docs/specs/NEW-llm-bring-your-own-part2.md`
 * revision 1).** In row 4 the brief is generated with the organisation's configuration
 * at the version the caller confirmed (read with the confirmation as one consistent
 * state; otherwise row 5, the 409). In row 4 a provider or gateway failure stores and
 * returns a FIXED `brief_text`, `The organisation's AI provider returned an error.`,
 * which contains nothing the provider or gateway returned, so no form of the
 * organisation's key (verbatim, JSON-escaped, percent-encoded) can reach the caller
 * through the 200 or any later `getMeetingBrief` (spec §3.1a, P2-D16, P2-AC-39;
 * contract revision 3). The provider text goes only to the server log and Sentry,
 * with every occurrence of every key sent with this request (the confirmed version's
 * key, even if replaced since) and of the caller's keys replaced by `[redacted]`
 * (exact strings; an encoded echo can reach those operator-only surfaces, spec §5).
 * In row 2 (the caller's own key) a failed brief's text keeps Part 1's form,
 * `LLM error: <provider text>`, with the caller's own keys replaced by `[redacted]`
 * before it is stored, returned, logged or reported. In row 4 a destination refusal's
 * text names the organisation's AI destination and its administrator, never the
 * caller's own Settings (P2-AC-41).
 */
export type post_RefreshMeetingBrief = {
      method: "POST",
      path: "/api/meetings/{event_id}/brief/refresh",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        path:  { event_id: string },
        
        
        
          }
      responses: {200: Schemas.MeetingBriefResponse,
400: string,
401: Schemas.ErrorResponse,
409: Schemas.LLMNotConfiguredResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * The whole ParseResult from /api/nlp/parse is echoed back. Only `title`, `attendees`, `constraints` (mapped to the event Description) and `suggested_slots[selected_slot_index]` are used; `duration_minutes`, `range_start`, `range_end`, `preferred_times` and `avoid_times` are ignored here. On success an audit row `nlp_confirmed` is written and the created event is returned as the CalendarEvent DTO (toCalendarEventDTO, the same shape as GET /api/calendar/events), never Google's own keys. PAC-29 (API-017, U-14): until PAC-29's implementation lands the server still encodes the raw `calendar/v3.Event` here, so this response describes the server after that PR. A NEGATIVE `selected_slot_index` is a 400 `invalid selected_slot_index`, like an index past the end. Before PAC-21 was finished it passed the bounds check, indexed the slice out of range and panicked; the panic was re-raised by sentryMiddleware, so net/http aborted the response with no status and no body at all. That was U-06 / API-024, resolved here: a crash is not a contract to preserve, and the 400 is the response the handler already gives every other out-of-range index.
 */
export type post_ConfirmNaturalLanguage = {
      method: "POST",
      path: "/api/nlp/confirm",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        
        
        
        body:  Schemas.NLPConfirmRequest,
          }
      responses: {200: Schemas.CalendarEvent,
400: Schemas.SchedulingErrorResponse,
401: (Schemas.CalendarNotConnectedError | Schemas.MiddlewareUnauthorized),
500: Schemas.SchedulingErrorResponse,
},
      
    }
/**
 * A malformed body and an empty `text` are collapsed into the same 400 (`missing text field`). Note that LLM-level failures inside the parser do NOT surface as 5xx: the parser returns `{"intent":"unknown","error":"..."}` with HTTP 200. A 500 only occurs when Parse() itself returns a non-nil error.
 * **NEW-llm-bring-your-own: "AI not configured" is an answer, not an error.** Before anything is sent, the server decides which AI configuration the request runs on, by the table in `docs/specs/NEW-llm-bring-your-own.md` §3 (summarised on `AINotConfigured`). When the caller has none, the answer is 200 with `intent: "unknown"`, `error` a sentence saying that AI features are off, why and who can turn them on, and `not_configured` carrying the same facts for a client to act on without reading the sentence (spec AC-13). Nothing is sent to any host (spec AC-10, AC-11, AC-40). `not_configured` is present ONLY in that case, so its presence is how a client tells "AI not configured" apart from "the model did not understand you" (both are `intent: "unknown"`). A client that reads only `intent` and `error` (the web bar before this change, the MCP tool `clockwise_parse_command`) still shows a sentence.
 * A configured request uses only the caller's own key-based provider with the key bound to that provider (see `testLLMConnection` for the provider modes). No identity of the machine Paceday runs on (AWS default credential chain or shared profile, Azure DefaultAzureCredential, Google Application Default Credentials) and no deployment-level key is ever used (spec O-2, O-3, AC-1, AC-2).
 * A destination refusal on a configured caller (PAC-66, PAC-66-B) is unchanged: 200 `{"intent":"unknown","error":"<sentence>"}`, with no `not_configured`, and nothing sent.
 * **Part 2 (spec `docs/specs/NEW-llm-bring-your-own-part2.md`, revision 1).** In row 4 the request uses the caller's organisation's configuration and nothing of the caller's (parent D-18): exactly the values of the `configurationVersion` the caller's stored confirmation names. The configuration and the confirmation are read as one consistent state; when the stored configuration's version is not the confirmed one (an administrator changed it before or while the request was decided), the answer is row 5 and nothing is sent. No request sends values of another version or combines values of two versions (spec P2-AC-37). In row 5 the caller has not confirmed the organisation's current configuration: the not-configured 200, nothing sent until they confirm in Paceday (owner O-13; confirmOrganizationAI). In row 10 (personal keys forbidden, the caller on their own provider) nothing is sent until the caller chooses "Use my organisation's AI" (patchSettings `llmProvider: organization`) and confirms (spec P2-D2, current default). Row 9 is reserved and never answered (see AINotConfigured). In row 4 a destination refusal's sentence names the organisation's AI destination and its administrator, never the caller's own Settings (spec P2-AC-41). The MCP tool `clockwise_parse_command` receives the same body; no MCP tool confirms (spec P2-AC-33).
 * **No provider error text reaches the caller from the organisation's configuration (spec §3.1a, P2-D16, P2-AC-39; contract revision 3).** A provider or gateway failure of the parse is the 500 below with the fixed `internal error`, in every row (as before Part 2), so no answer carries provider or gateway error text. The provider text goes only to the server log and Sentry, and before it does every occurrence of every key sent with this request (the confirmed version's key in row 4, even if an administrator has replaced it since) and of the caller's own keys (stored and submitted) is replaced by `[redacted]`. That replacement is of exact strings: an encoded or partial echo of a key can still reach the server log or Sentry (operator-only; spec §5), never an answer.
 * API-080 is fixed here (spec AC-35, D-20): a result with no time range carries neither `range_start` nor `range_end`, never `0001-01-01T00:00:00Z`.
 */
export type post_ParseNaturalLanguage = {
      method: "POST",
      path: "/api/nlp/parse",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        
        
        
        body:  Schemas.NLPParseRequest,
          }
      responses: {200: Schemas.NLPParseResult,
400: Schemas.SchedulingErrorResponse,
500: Schemas.SchedulingErrorResponse,
},
      
    }
/**
 * Returns all `users` rows sharing the caller's `org_id`, ordered by `created_at` ascending. If the caller cannot be loaded, or has no `org_id`, the handler returns 200 with `[]` rather than an error.
 */
export type get_ListOrgMembers = {
      method: "GET",
      path: "/api/org/members",
      requestFormat: "json",
      responseFormat: "json",
      parameters: never,
      responses: {200: Array<Schemas.OrgMember>,
401: Schemas.MiddlewareUnauthorized,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * NEW-llm-bring-your-own Part 2 (spec `docs/specs/NEW-llm-bring-your-own-part2.md` §3.2, P2-AC-7). The organisation is the caller's, never a parameter, so no caller can name another organisation (P2-AC-8).
 * **Every member reads the same bytes.** The answer depends only on the organisation's stored configuration, never on the caller: not on whether the caller is an administrator (Paceday stores no admin role; PAC-50's proof exists only around a write), not on whether the caller holds a live grant, is on the break-glass list, has confirmed, or just made the last change (parent spec D-7, P2-AC-7). Per-caller state (whether the caller has confirmed the current version) is on the caller's settings read (`AIStatus`), not here.
 * The key is NEVER returned (owner O-7, PAC-24): `keySet` is the only thing a reader learns about it. An organisation that never set a configuration answers `configured: false`, `keySet: false`, `personalKeysAllowed: true`, `configurationVersion: 0` and no `provider`. An organisation whose configuration was removed (`provider: ""`) answers the same except that `configurationVersion` is the removal's version (never `0` again; versions are never reused within an organisation, contract revision 3, spec P2-D17) and `personalKeysAllowed` and `updatedAt` are as stored. A client keeps the `configurationVersion` it displayed: patchOrganizationAI and confirmOrganizationAI both name it.
 * Checks: membership (403), then 200. Read-only: nothing is consumed, written or recorded.
 */
export type get_GetOrganizationAI = {
      method: "GET",
      path: "/api/organization/ai",
      requestFormat: "json",
      responseFormat: "json",
      parameters: never,
      responses: {200: Schemas.OrganizationAIConfiguration,
401: Schemas.PlainTextError,
403: Schemas.SsoWriteMembershipRequired,
500: Schemas.SchedulingErrorResponse,
},
      
    }
/**
 * NEW-llm-bring-your-own Part 2 (spec §3.2, P2-AC-1 to P2-AC-6, P2-AC-17; owner O-11, O-12). MERGE against the caller's organisation's configuration, with the rules on OrganizationAIConfigurationUpdate. The answer is the re-read configuration, byte-identical to what any member's getOrganizationAI returns right after (P2-AC-7).
 * **Who may change it (owner O-11: PAC-50's admin proof, repeated per change).** Exactly PAC-50's write gate (`docs/specs/PAC-50.md` §4.2) with its own grant purpose:
 * 1. Membership: no organisation or its row gone is the 403
 *    SsoWriteMembershipRequired, before anything else (break-glass
 *    included).
 * 
 * 2. The body's shape: every 400 that can be decided from the body
 *    alone (the "shape" list on the 400), before anything stored is
 *    read and before any proof is looked at, so a refused body leaves
 *    a live grant unconsumed (P2-AC-4).
 * 
 * 2a. The version (contract revision 2, challenge B-1; spec P2-D15,
 *     P2-AC-40). `configurationVersion` must equal the stored
 *     configuration's current version (the one the admin was shown).
 *     Otherwise the 409 OrganizationAIConsentConflict with `reason:
 *     configuration_changed` and `organization` the current read;
 *     nothing is stored, nothing is recorded, and no proof is looked at
 *     or consumed, so a stale form costs no step-up. This is an early
 *     answer for the common case; step 4 repeats the comparison
 *     atomically, and step 4's is the one that decides.
 * 
 * 2b. The body against what is stored (contract revision 3, challenge
 *     revision 2 non-blocking 3): every 400 on the "state" list on the
 *     400, decided against the configuration at the version just
 *     checked. A stale form therefore gets the 409 of 2a, never a 400
 *     that only the newer configuration explains.
 * 
 * 3. Authorisation: the caller's newest
 *    live grant for (caller, caller's organisation) **whose purpose is
 *    `llm_org_key_write`** is consumed in one statement; a grant of any
 *    other purpose (`sso_write`) is never selected and stays live, and
 *    an SSO write never consumes an `llm_org_key_write` grant (PAC-50
 *    AC-27, P2-AC-2). Without such a grant: an address on the
 *    deployment's break-glass list (`PACEDAY_ADMIN_EMAILS`, compared
 *    case-insensitively) whose session JWT was issued less than 10
 *    minutes ago, and not more than one minute in the future, is
 *    authorised without a grant (PAC-50 AC-14a); the same address with
 *    an older session is the 403
 *    OrganizationAIWriteFreshLoginRequired; anyone else is the 403
 *    OrganizationAIWriteStepupRequired. One grant authorises one
 *    change, so a second change needs a new step-up (owner O-11).
 *    **One break-glass session authorises one change** (spec P2-D13,
 *    factory-assumed pending the owner; revision 2): a break-glass
 *    change is recorded with the session's issue time, and a further
 *    change by the same address with a session of the same issue time
 *    is the 403 OrganizationAIWriteFreshLoginRequired, even inside the
 *    10 minutes. The check that no change was recorded for (address,
 *    session issue time) and the recording of this one are one atomic
 *    step (at most one record per pair, enforced by storage), so two
 *    concurrent changes with one session cannot both pass (contract
 *    revision 3, challenge revision 2 non-blocking 2). Sessions carry
 *    no identifier besides `iat`, which has one-second resolution: two
 *    sign-ins by the same address within one second share an issue
 *    time and count as one session, so the second is refused. That
 *    fails safe. PAC-50's SSO write gate is unchanged (its break-glass
 *    rule still allows several SSO writes per fresh session).
 * 
 * 4. The write (contract revision 3, challenge revision 2 B-1'; spec
 *    P2-D15). Steps 3 and 4 run in ONE transaction: the grant
 *    consumption (or the break-glass record) and one atomic
 *    conditional write that stores the change only if the stored
 *    version still equals `configurationVersion`. The condition is
 *    the stored version alone, and an organisation with no stored
 *    configuration counts as version `0` (contract revision 3.1,
 *    challenge revision 3 NB-C): so the first setup names `0`, and a
 *    row that a `personalKeysAllowed`-only change left at version `0`
 *    does not make a concurrent first setup naming `0` a conflict,
 *    while of two first setups naming `0` exactly one is stored (the
 *    first advances the version). When the
 *    condition fails (another administrator's change was stored
 *    between step 2a and here), the transaction is rolled back and the
 *    answer is the 409 OrganizationAIConsentConflict
 *    `configuration_changed` with the current read: nothing stored,
 *    nothing recorded, the grant NOT consumed and a break-glass session
 *    NOT marked used. When storage fails, the transaction is rolled
 *    back the same way and the answer is the 500: the configuration is
 *    unchanged and the grant is still live (P2-AC-5, revision 3;
 *    revision 2 said the grant stayed consumed). So a grant is spent
 *    exactly when a change is stored. The operator record of a
 *    successful change is inserted in this same transaction (contract
 *    revision 3.1, challenge revision 3 NB-B), so a stored change is
 *    never left unrecorded and a rolled-back one is never recorded.
 * 
 * Being a team owner, or having made the last change, proves nothing. Every successful change is recorded for operators, in the write's transaction (who, when, `stepup` or `breakglass`, the names of the properties that changed; never the key; P2-AC-6). No API reads that record.
 * **What a change does to members** (spec §3.1): `configurationVersion` advances by one when the change alters `provider` (including `provider: ""`, the removal), writes `apiKey` (any present `apiKey`, including `""` and including a value equal to the stored key: the server never compares keys, so re-entering the same key re-asks members), or alters any destination property (`baseUrl`, `azureEndpoint`, `azureDeployment`, `azureApiVersion`, `awsRegion`), including removing them; members who follow the organisation must then confirm again before anything is sent to it (spec P2-D4, factory-assumed pending the owner, OQ-P2-1; P2-AC-23). A change of only `model` and/or `personalKeysAllowed` does not advance it, so such a change is never a conflict for another administrator's change and, for `model` and `personalKeysAllowed`, the later change wins. Forbidding personal keys moves nobody onto this configuration: members on their own provider answer row 10 or 11 until they choose `llmProvider: organization` and confirm (spec P2-D2, current default).
 * **A version is never reused within an organisation** (contract revision 3, spec P2-D17, P2-AC-42), including across `provider: ""` and a later setup: the removal empties the configuration and keeps its version count, so the next setup names the removal's version and gets the next one. A confirmation of a removed configuration therefore never matches a later configuration.
 * Approved destinations: the organisation's `baseUrl`, `azureEndpoint` and `awsRegion` are checked on write with exactly the rules of patchSettings for a user's (PAC-66, PAC-66-B, owner O-10 path prefixes), for the organisation's provider, and again on every send (`testLLMConnection`). Because every member reads them (spec P2-D18, contract revision 3), the organisation's addresses are also held to a stricter shape: `baseUrl` must be exactly an approved origin plus that entry's path prefix with no query, fragment or userinfo (the user rule, which leaves no room for a credential in the path); `azureEndpoint` must be `https://<host>` with at most one trailing `/` and no path, query, fragment or userinfo (stricter than a user's, whose path is not checked on write).
 */
export type patch_PatchOrganizationAI = {
      method: "PATCH",
      path: "/api/organization/ai",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        
        
        
        body:  Schemas.OrganizationAIConfigurationUpdate,
          }
      responses: {200: Schemas.OrganizationAIConfiguration,
400: Schemas.SchedulingErrorResponse,
401: Schemas.PlainTextError,
403: Schemas.OrganizationAIWriteForbiddenResponse,
409: Schemas.OrganizationAIConsentConflict,
500: Schemas.SchedulingErrorResponse,
},
      
    }
/**
 * NEW-llm-bring-your-own Part 2 (spec §3.4, P2-AC-22 to P2-AC-25; owner O-13: tell and ask once, nothing is sent before the user confirms). The caller confirms the organisation's configuration at `configurationVersion`, the version they were shown (from getOrganizationAI). Recorded for (caller, caller's organisation): a later confirmation of a newer version replaces it; confirming the current version again is accepted and changes nothing.
 * Before calling this, a client tells the user, naming the organisation's `provider`, that their text and meeting details (event titles, attendee emails, and the Slack and Notion excerpts used for briefs) are sent to their organisation's AI provider account, which its administrators can **access** outside Paceday (owner O-13: the wording says "access", never "read"). The client calls this only on the user's explicit confirmation. Choosing "Use my organisation's AI" in Settings shows the same notice and, on the user's confirm, confirms the version DISPLAYED (the client calls this with that version, then patchSettings with `llmProvider: organization`); if this answers 409, the client shows the current configuration's notice instead. This operation is the ONLY way a confirmation is recorded: patchSettings never records one, whatever its body (spec P2-D14, P2-AC-38), and a patchSettings that stores `""` or a provider DELETES the caller's confirmation (P2-AC-36).
 * The confirmation is what lets row 4 of the table on AINotConfigured send anything, and only for the version it names; it does not change the caller's stored choice. It confirms nobody else (P2-AC-25). No MCP tool calls it (spec P2-D9).
 * Checks: body (400), membership (403), then the organisation's current state (409), then 200. When the current configuration is not complete, the 409 is `organization_not_configured` whatever `configurationVersion` says (it wins over `configuration_changed`: there is nothing to confirm).
 */
export type post_ConfirmOrganizationAI = {
      method: "POST",
      path: "/api/organization/ai/consent",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        
        
        
        body:  Schemas.OrganizationAIConsentRequest,
          }
      responses: {200: Schemas.AIStatus,
400: Schemas.SchedulingErrorResponse,
401: Schemas.PlainTextError,
403: Schemas.SsoWriteMembershipRequired,
409: Schemas.OrganizationAIConsentConflict,
500: Schemas.SchedulingErrorResponse,
},
      
    }
/**
 * Rows from `personal_calendars` owned by the authenticated user, ordered by id ascending. Always an array, `[]` when empty.
 */
export type get_ListPersonalCalendars = {
      method: "GET",
      path: "/api/personal-calendars",
      requestFormat: "json",
      responseFormat: "json",
      parameters: never,
      responses: {200: Array<Schemas.PersonalCalendar>,
401: Schemas.MiddlewareUnauthorized,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Inserts a row owned by the authenticated user. `name` defaults to the literal string "Personal" when empty or absent. `enabled` has no default handling, so an omitted key becomes the Go zero value `false`. `credentials_json` is never settable through this endpoint and is never returned.
 */
export type post_CreatePersonalCalendar = {
      method: "POST",
      path: "/api/personal-calendars",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        
        
        
        body:  Schemas.PersonalCalendarCreateRequest,
          }
      responses: {201: Schemas.PersonalCalendar,
400: Schemas.ErrorResponse,
401: Schemas.MiddlewareUnauthorized,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Applies COALESCE semantics in SQL: a null or absent field leaves the column unchanged. `provider` cannot be changed. The UPDATE is scoped by `user_id`, so another user's calendar behaves exactly like a missing one.
 */
export type patch_UpdatePersonalCalendar = {
      method: "PATCH",
      path: "/api/personal-calendars/{id}",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        path:  { id: number },
        
        
        body:  Schemas.PersonalCalendarPatchRequest,
          }
      responses: {200: Schemas.PersonalCalendar,
400: Schemas.ErrorResponse,
401: Schemas.MiddlewareUnauthorized,
404: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Deletes the row scoped by `user_id`. Note this removes only the personal_calendars row; associated personal_blockers rows are not touched by this handler.
 */
export type delete_DeletePersonalCalendar = {
      method: "DELETE",
      path: "/api/personal-calendars/{id}",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        path:  { id: number },
        
        
        
          }
      responses: {204: unknown,
400: Schemas.ErrorResponse,
401: Schemas.MiddlewareUnauthorized,
404: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Reads events through engine.PersonalBlocker.Preview over a FIXED window of `time.Now().Truncate(24h)` to that value plus 14 days. The window is not configurable and Truncate operates on the Unix epoch, so the start is a UTC midnight regardless of the caller's timezone. Returns `[]` rather than null when the provider yields nothing.
 */
export type get_PreviewPersonalCalendar = {
      method: "GET",
      path: "/api/personal-calendars/{id}/preview",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        path:  { id: number },
        
        
        
          }
      responses: {200: Array<Schemas.PersonalCalendarPreviewEvent>,
400: Schemas.ErrorResponse,
401: Schemas.MiddlewareUnauthorized,
404: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Runs engine.PersonalBlocker.Sync, stamps `last_synced_at = NOW()`, then re-reads and returns the calendar. Takes no request body. The sync writes busy blocks into the user's work calendar, so it is calendar-dependent: a user with no stored Google credential gets the 401 CalendarNotConnected (PAC-21; before, a 500).
 */
export type post_SyncPersonalCalendar = {
      method: "POST",
      path: "/api/personal-calendars/{id}/sync",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        path:  { id: number },
        
        
        
          }
      responses: {200: Schemas.PersonalCalendar,
400: Schemas.ErrorResponse,
401: (Schemas.CalendarNotConnectedError | Schemas.MiddlewareUnauthorized),
404: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Enumerates the user's Google CalendarList and keeps entries whose id contains `resource.calendar.google.com`, optionally filtered by a case-insensitive substring match against the summary or the id. Returns `[]` rather than null when nothing matches.
 */
export type get_ListRooms = {
      method: "GET",
      path: "/api/rooms",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            query?:  Partial<{ q: string }>,
        
        
        
        
          }
      responses: {200: Array<Schemas.CalendarRoom>,
401: (Schemas.CalendarNotConnectedError | Schemas.MiddlewareUnauthorized),
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Read-only: computes proposals, moves nothing. The body is optional: an absent or empty body (zero bytes or only whitespace) and the JSON literal `null` are treated as `{}`, i.e. today. Any other body that does not decode into CompressionRequest is a 400 `invalid JSON` (a syntax error, a non-object top-level value, or a member of the wrong type). Before PAC-36 the decode error was discarded and such a body answered 200 for today (API-035). Only the first JSON value is read. If `week` is set it wins over `date`: the handler snaps the parsed date to Monday (startOfWeek) and computes Mon..Fri in order. A 200 in week mode carries exactly five CompressionResult entries, one per day, Monday first; a non-working day is an entry with no proposals, not a missing entry. If ANY day's computation fails, the whole request fails exactly as single-day mode fails (401 CalendarNotConnected or 500 `internal error`) and no per-day results are returned. Before PAC-36 week mode skipped every failing day and answered 200 with the survivors, `[]` if all five failed, which a client cannot tell apart from "nothing to compress" (API-034). If `week` is empty, `date` (or today) produces a single-element array and an engine error is the 500. A caller with no stored Google credential gets the 401 `calendar not connected` in BOTH modes, before any day is computed (PAC-21, API-054).
 */
export type post_PreviewCompression = {
      method: "POST",
      path: "/api/schedule/compress",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        
        
        
        body:  Schemas.CompressionRequest,
          }
      responses: {200: Array<Schemas.CompressionResult>,
400: Schemas.SchedulingErrorResponse,
401: (Schemas.CalendarNotConnectedError | Schemas.MiddlewareUnauthorized),
500: Schemas.SchedulingErrorResponse,
},
      
    }
/**
 * The request proposal objects are snake_case (`event_id`, `proposed_start`, `proposed_end`) even though the CompressionResult proposals returned by /api/schedule/compress are camelCase. Only these three fields are read; any other field on the posted object is ignored. A proposal whose start or end fails RFC3339 parsing is NOT an error: it is dropped and `"<event_id>: invalid time format"` is appended to `failed` (confirmed by TestApplyCompress_InvalidTime, which expects 200).
 */
export type post_ApplyCompression = {
      method: "POST",
      path: "/api/schedule/compress/apply",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        
        
        
        body:  Schemas.CompressionApplyRequest,
          }
      responses: {200: Schemas.CompressionApplyResult,
400: Schemas.SchedulingErrorResponse,
401: (Schemas.CalendarNotConnectedError | Schemas.MiddlewareUnauthorized),
500: Schemas.SchedulingErrorResponse,
},
      
    }
/**
 * `start` and `end` must both parse as RFC3339. The handler builds an `engine.ScheduleRequest` WITHOUT `duration_minutes` (the slot carries the times) and calls SmartScheduler.CreateMeeting, which refuses out-of-hours creation once the weekly allowance is spent - that refusal surfaces as a 500 with the text `out-of-hours meeting allowance reached`, not a 4xx. On success an audit row `meeting_created` is written. The response body is the created event flattened by toCalendarEventDTO: the CalendarEvent DTO, the same shape as one element of GET /api/calendar/events, never Google's own keys (`summary`, `start.dateTime`, `hangoutLink`). PAC-29 (API-017, U-14): until PAC-29's implementation lands the server still encodes the raw `calendar/v3.Event` here, so this response describes the server after that PR.
 */
export type post_CreateScheduledMeeting = {
      method: "POST",
      path: "/api/schedule/create",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        
        
        
        body:  Schemas.ScheduleCreateRequest,
          }
      responses: {200: Schemas.CalendarEvent,
400: Schemas.SchedulingErrorResponse,
401: (Schemas.CalendarNotConnectedError | Schemas.MiddlewareUnauthorized),
500: Schemas.SchedulingErrorResponse,
},
      
    }
/**
 * `range_start` and `range_end` are both mandatory and must parse as RFC3339; either one failing yields a single 400. `duration_minutes`, `attendees` and `title` are optional as far as the handler is concerned (no validation) - `duration_minutes: 0` produces zero-length candidate slots rather than an error. The engine walks candidate starts in 30-minute steps (engine/smart_schedule.go: `t = t.Add(30 * time.Minute)`) and returns at most 3 slots, each at least 1h apart (pickTopUnique(candidates, 3, time.Hour)). There is no 15-minute increment rule on this route: every step in engine/smart_schedule.go (lines 113, 121 and 135) is 30 minutes, so every suggested start is the start of a free interval (`range_start` or the end of a busy interval) plus a multiple of 30 minutes. The 15-minute stepping in engine/booking.go, engine/habits.go and engine/team_availability.go backs other domains. U-07 resolved by PAC-21 from the engine, to be pinned by TestSmartScheduler_Suggest_StepsThirtyMinutes (AC-6, written in the backend PR before the code); assumed by the factory, pending owner confirmation that no 15-minute rule was intended.
 */
export type post_SuggestMeetingSlots = {
      method: "POST",
      path: "/api/schedule/suggest",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        
        
        
        body:  Schemas.ScheduleSuggestRequest,
          }
      responses: {200: Schemas.ScheduleSuggestions,
400: Schemas.SchedulingErrorResponse,
401: (Schemas.CalendarNotConnectedError | Schemas.MiddlewareUnauthorized),
500: Schemas.SchedulingErrorResponse,
},
      
    }
/**
 * The caller is inserted as an `accepted` host. Each entry of `co_host_emails` is resolved by lowercased email; unknown emails are silently skipped (no error, no host row). An empty/omitted `slug` is auto-generated from the owner's name.
 */
export type post_CreateSchedulingLink = {
      method: "POST",
      path: "/api/scheduling-links",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        
        
        
        body:  Schemas.CreateSchedulingLinkRequest,
          }
      responses: {201: Schemas.SchedulingLink,
400: Schemas.BookingError,
401: "{\"error\":\"unauthorized\"}\n",
409: Schemas.BookingError,
422: Schemas.BookingError,
500: Schemas.BookingError,
},
      
    }
export type get_ListSchedulingLinks = {
      method: "GET",
      path: "/api/scheduling-links",
      requestFormat: "json",
      responseFormat: "json",
      parameters: never,
      responses: {200: Schemas.SchedulingLinkListResponse,
401: "{\"error\":\"unauthorized\"}\n",
500: Schemas.BookingError,
},
      
    }
/**
 * Invites whose link or owner can no longer be loaded are silently dropped from the list. Returns `[]` (never null) when there are none.
 */
export type get_ListSchedulingLinkHostInvites = {
      method: "GET",
      path: "/api/scheduling-links/host-invites",
      requestFormat: "json",
      responseFormat: "json",
      parameters: never,
      responses: {200: Array<Schemas.SchedulingLinkHostInvite>,
401: "{\"error\":\"unauthorized\"}\n",
500: Schemas.BookingError,
},
      
    }
/**
 * `{id}` is the SCHEDULING LINK id, not the invite/host-row id -- the handler runs `UPDATE scheduling_link_hosts SET status=... WHERE link_id=$1 AND user_id=$2`. This matches the `link_id` field of the invite list payload. The UPDATE must affect exactly the caller's row: when it affects zero rows (the caller has no host row on that link, or `{id}` is not a link id, e.g. the host-row `id` from `SchedulingLinkHostRecord`) the answer is 404 and nothing changes (PAC-30, API-020; before PAC-30 this was a 200 that changed nothing). Any existing host row matches, whatever its current status, so accepting twice is a 200 both times and a declined host may still accept. The owner's own row is a host row too, so the owner gets 200 (see PAC-30.md follow-ups). A deactivated link (`active=false`, see `deleteSchedulingLink`) keeps its host rows, so accept/decline on it match and return 200 (PAC-30 D-5); "no link has that id" in the 404 means no row at all, not an inactive one.
 */
export type post_AcceptSchedulingLinkHostInvite = {
      method: "POST",
      path: "/api/scheduling-links/host-invites/{id}/accept",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        path:  { id: string },
        
        
        
          }
      responses: {200: Schemas.SchedulingLinkInviteResponse,
400: Schemas.BookingError,
401: "{\"error\":\"unauthorized\"}\n",
404: Schemas.BookingError,
500: Schemas.BookingError,
},
      
    }
/**
 * Same handler as accept, with status `declined`. `{id}` is the scheduling-link id. Same 404 rule as accept: zero rows updated is a 404 and nothing changes (PAC-30, API-020). Any existing host row matches, whatever its status. A deactivated link (`active=false`, see `deleteSchedulingLink`) keeps its host rows, so accept/decline on it match and return 200 (PAC-30 D-5).
 */
export type post_DeclineSchedulingLinkHostInvite = {
      method: "POST",
      path: "/api/scheduling-links/host-invites/{id}/decline",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        path:  { id: string },
        
        
        
          }
      responses: {200: Schemas.SchedulingLinkInviteResponse,
400: Schemas.BookingError,
401: "{\"error\":\"unauthorized\"}\n",
404: Schemas.BookingError,
500: Schemas.BookingError,
},
      
    }
/**
 * routes.go:157-158 registers `slh.listHostInvites` at BOTH `/host-invites` and `/invites`. Byte-for-byte identical behaviour and response; neither is deprecated in code. The frontend only ever calls `/host-invites`.
 */
export type get_ListSchedulingLinkInvitesAlias = {
      method: "GET",
      path: "/api/scheduling-links/invites",
      requestFormat: "json",
      responseFormat: "json",
      parameters: never,
      responses: {200: Array<Schemas.SchedulingLinkHostInvite>,
401: "{\"error\":\"unauthorized\"}\n",
500: Schemas.BookingError,
},
      
    }
/**
 * Readable only by the link's owner and by co-hosts whose host row on the link is `accepted` (PAC-25, API-006). That is the same set of callers who receive the link from `GET /api/scheduling-links`, so this read discloses nothing the list does not. Every other authenticated caller (no host row, a `pending` or `declined` invitation, a co-host who left or was removed) receives the same `404 {"error":"not found"}` as for an id that matches no link, with no part of the link in the body, so the answer does not reveal whether a link exists. A refused read is never `403` (PAC-25 D-1; contrast the owner-only siblings PATCH, DELETE, `/bookings` and `/hosts`, which still answer `403` and are out of scope). Check order: `400` malformed id; then the link lookup; then the caller's own host-status lookup on that link; then `404` for no link or a caller who may not read it; then `200`. A storage error on either lookup answers `500` `{"error":"internal error"}`, never `404` (an outage is not reported as "not found") and never `200` (the reader check does not fail open). An allowed reader receives the full record including every host row (accepted, pending and declined) with each host's email, name and avatar; `is_owner` is computed against the caller and `my_status` is the caller's own host status. Building that record reads the roster (the link's host rows and each host's user record); a storage error on that read also answers `500` `{"error":"internal error"}`, never `200` with `hosts: []` or with a host's email missing (PAC-25 C-2). An accepted co-host therefore still sees pending and declined invitees' emails, as through the list (PAC-25 D-2).
 */
export type get_GetSchedulingLink = {
      method: "GET",
      path: "/api/scheduling-links/{id}",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        path:  { id: string },
        
        
        
          }
      responses: {200: Schemas.SchedulingLink,
400: Schemas.BookingError,
401: "{\"error\":\"unauthorized\"}\n",
404: Schemas.BookingError,
500: Schemas.BookingError,
},
      
    }
/**
 * Every field is optional; absent fields keep their stored value. The whole merged record is re-validated, so a patch can fail 422 on a field it did not touch. When `co_host_emails` is present (even `[]`) it sets the co-host list by difference (PAC-61): non-owner hosts whose email is not listed are removed, listed emails that are not yet hosts are added as `pending`, and listed hosts keep their status (accepted, pending or declined).
 */
export type patch_UpdateSchedulingLink = {
      method: "PATCH",
      path: "/api/scheduling-links/{id}",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        path:  { id: string },
        
        
        body:  Schemas.UpdateSchedulingLinkRequest,
          }
      responses: {200: Schemas.SchedulingLink,
400: Schemas.BookingError,
401: "{\"error\":\"unauthorized\"}\n",
403: Schemas.BookingError,
404: Schemas.BookingError,
409: Schemas.BookingError,
422: Schemas.BookingError,
500: Schemas.BookingError,
},
      
    }
/**
 * Soft delete -- `UPDATE scheduling_links SET active=false`. The row and its bookings survive; the public `/api/book/{slug}` lookup filters on `active=true` and will start returning 404, while `GET /api/scheduling-links/{id}` still returns the link.
 */
export type delete_DeleteSchedulingLink = {
      method: "DELETE",
      path: "/api/scheduling-links/{id}",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        path:  { id: string },
        
        
        
          }
      responses: {204: unknown,
400: Schemas.BookingError,
401: "{\"error\":\"unauthorized\"}\n",
403: Schemas.BookingError,
404: Schemas.BookingError,
500: Schemas.BookingError,
},
      
    }
/**
 * routes.go:166 binds the SAME `slh.acceptInvite` handler already bound at `/host-invites/{id}/accept` (routes.go:159). Because both handlers key on the link id, the two paths are exactly equivalent -- this is a second spelling of the same operation, not a different resource. The frontend only uses the `/host-invites/...` form. Same 404 rule: a caller with no host row on the link gets 404 and nothing changes (PAC-30, API-020). The duplicate spelling itself (API-069) is not resolved by PAC-30. A deactivated link (`active=false`, see `deleteSchedulingLink`) keeps its host rows, so accept/decline on it match and return 200 (PAC-30 D-5).
 */
export type post_AcceptSchedulingLinkInviteByLink = {
      method: "POST",
      path: "/api/scheduling-links/{id}/accept",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        path:  { id: string },
        
        
        
          }
      responses: {200: Schemas.SchedulingLinkInviteResponse,
400: Schemas.BookingError,
401: "{\"error\":\"unauthorized\"}\n",
404: Schemas.BookingError,
500: Schemas.BookingError,
},
      
    }
/**
 * Returns the raw `storage.Booking` rows, ordered by `start_time DESC`, never null. NOTE the field names differ from the public booking confirmation DTO (`start_time`/`end_time` here vs `start`/`end` there).
 */
export type get_ListSchedulingLinkBookings = {
      method: "GET",
      path: "/api/scheduling-links/{id}/bookings",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        path:  { id: string },
        
        
        
          }
      responses: {200: Array<Schemas.SchedulingLinkBookingRecord>,
400: Schemas.BookingError,
401: "{\"error\":\"unauthorized\"}\n",
403: Schemas.BookingError,
404: Schemas.BookingError,
500: Schemas.BookingError,
},
      
    }
/**
 * Equivalent to POST /api/scheduling-links/host-invites/{id}/decline (same handler, same key, same PAC-30 404 when the caller has no host row on the link). A deactivated link (`active=false`, see `deleteSchedulingLink`) keeps its host rows, so accept/decline on it match and return 200 (PAC-30 D-5).
 */
export type post_DeclineSchedulingLinkInviteByLink = {
      method: "POST",
      path: "/api/scheduling-links/{id}/decline",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        path:  { id: string },
        
        
        
          }
      responses: {200: Schemas.SchedulingLinkInviteResponse,
400: Schemas.BookingError,
401: "{\"error\":\"unauthorized\"}\n",
404: Schemas.BookingError,
500: Schemas.BookingError,
},
      
    }
/**
 * The invitee must already have an account; the email is lowercased and trimmed. A new invitee gets a `pending` row (201). Re-inviting someone who is already a host of the link changes nothing: their row is returned as is with 200, so an accepted or declined host keeps that status (PAC-61). Response is the raw `storage.LinkHost` row, not the host DTO used inside SchedulingLink.
 */
export type post_InviteSchedulingLinkHost = {
      method: "POST",
      path: "/api/scheduling-links/{id}/hosts",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        path:  { id: string },
        
        
        body:  Schemas.InviteSchedulingLinkHostRequest,
          }
      responses: {200: Schemas.SchedulingLinkHostRecord,
201: Schemas.SchedulingLinkHostRecord,
400: Schemas.BookingError,
401: "{\"error\":\"unauthorized\"}\n",
403: Schemas.BookingError,
404: Schemas.BookingError,
500: Schemas.BookingError,
},
      
    }
/**
 * Deletes the caller's `scheduling_link_hosts` row, whatever its status (pending, accepted or declined). Checked in this order: `{id}` not a UUID -> 400 "invalid id"; no link with that id -> 404; caller is the owner -> 400 "owner cannot leave link"; the DELETE removes zero rows (the caller has no host row on the link) -> 404 and nothing changes (PAC-30, API-020; before PAC-30 a non-host got 204).
 */
export type post_LeaveSchedulingLink = {
      method: "POST",
      path: "/api/scheduling-links/{id}/leave",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        path:  { id: string },
        
        
        
          }
      responses: {204: unknown,
400: Schemas.BookingError,
401: "{\"error\":\"unauthorized\"}\n",
404: Schemas.BookingError,
500: Schemas.BookingError,
},
      
    }
/**
 * Registered as `r.Route("/api/settings", ...)` + `r.Get("/", ...)`, so chi serves both `/api/settings` and `/api/settings/`.
 * Returns the settings of the AUTHENTICATED CALLER. When the caller has no settings row yet, one is created from the SQL defaults and returned, so this operation never 404s and a second read returns the same row rather than creating another (spec AC-2).
 * `llmApiKey` is never returned, by this or any other operation (`writeOnly: true`). `llmApiKeySet` reports whether a key is on file (spec AC-11, AC-12).
 * NEW-llm-bring-your-own: keys are bound to the provider they were entered for. `llmApiKeySet` reports the key of the selected provider, `llmApiKeysSet` every provider's, and `llmUnboundApiKeySet` a key stored before that change that is bound to no provider (spec D-5, AC-15, AC-16). `aiStatus` says whether AI works for the caller now and, when it does not, why and who can turn it on, by the spec's §3 table (AC-8). A row whose stored provider is `ollama` is returned with `llmProvider: "unsupported"` and `aiStatus.notConfigured.reason` `provider_removed`, and is valid against this schema; nothing stored is rewritten by the read. Reading never reveals any key, the caller's or an organisation's.
 * Before PAC-24 this read `WHERE id = 1` - a row shared by every authenticated caller, which after migration 018's backfill is the earliest-created user's own row - and returned `llmApiKey` in cleartext (API-002, API-003).
 */
export type get_GetSettings = {
      method: "GET",
      path: "/api/settings",
      requestFormat: "json",
      responseFormat: "json",
      parameters: never,
      responses: {200: Schemas.Settings,
500: Schemas.SchedulingErrorResponse,
},
      
    }
/**
 * MERGE, at the top level, against the CALLER'S OWN settings. This is the ONLY write operation for settings: PAC-24 removes `PUT /api/settings` rather than retaining it as a deprecated alias, for the reasons in the comment on this path and in `contracts/features/PAC-24.md` §3.
 * The rule is total and needs no knowledge of what is stored:
 * * **Property absent** -> unchanged. * **Property present** -> set to exactly that value. `""`, `0` and
 *   `false` are values, not absences: they clear, zero and disable. This is
 *   how a setting is cleared, including `llmApiKey` (spec AC-7, AC-13).
 * * **Property present and `null`** -> 400. No property of this body is
 *   nullable, so a null fails schema validation and nothing is stored
 *   (spec AC-8).
 * * **`workingHours` and `lunchBreaks`** are replaced WHOLE when present -
 *   there is no deep merge and no per-day merge, so a weekday omitted from
 *   a supplied map is REMOVED. `lunchBreaks: {}` clears every per-day lunch
 *   override (spec AC-9).
 * * **`llmApiKeySet`, `llmApiKeysSet`, `llmUnboundApiKeySet`, `aiStatus`
 *   and `updatedAt`** are `readOnly`. They may be present -
 *   a client that submits back a document it just read will include them -
 *   and are ignored (spec AC-10).
 * 
 * The response is a fresh read of the caller's row, so it reflects normalisation (e.g. `workingHours` defaulting) rather than the submitted body, and it does not contain `llmApiKey`.
 * **PAC-66 destination rules.** When a write CHANGES `azureEndpoint` or `awsRegion` to a non-empty value, that value is checked whichever provider is selected (spec AC-5, AC-7): `azureEndpoint` must be an `https` URL whose host is approved for `azure_openai`; `awsRegion` must be a valid AWS region name (one host label; the Bedrock host itself is checked when a request is sent). (`gcpLocation`, also checked here before, is removed by NEW-llm-bring-your-own.) A refused value is a 400 naming the property, and nothing in the body is stored. Three things are deliberately NOT refused here: `""` for either (a user can always clear a bad value, spec AC-15, D-3); a value equal to the one already stored (the changed-only rule above, PAC-24 AC-17, spec AC-9); and a write that changes only `llmProvider`, even onto a stored unapproved endpoint (spec AC-17). Each of those is refused when a request would be sent instead (see `testLLMConnection`). The server never rewrites or clears a stored value (spec D-3).
 * **PAC-66-B destination rules (as changed by NEW-llm-bring-your-own).** When a write CHANGES `llmBaseUrl` to a non-empty value, that value is checked whichever provider is selected: it must be exactly an origin approved for `openai` or `anthropic` (the vendors' public hosts count) followed by exactly that approval's path prefix when it has one (owner decision O-10, spec AC-18), with at most one trailing `/`; any other path, a query, fragment, userinfo or whitespace is refused. Being approved for one provider does not make it a destination for the other, which is checked when a request would be sent. A refused value is a 400 naming the property, and nothing in the body is stored. As for PAC-66, `""` is always accepted (a user can always clear a bad value; clearing means the vendor's public host), an unchanged value is not re-checked (so a value stored through the web's former Ollama field can be written back unchanged, spec D-14, AC-39), and a write that changes only `llmProvider` is not refused. `ollamaBaseUrl` no longer exists: writing it is a 400 `unknown property: ollamaBaseUrl`.
 * **NEW-llm-bring-your-own: the AI choice and its keys.**
 * * `llmProvider` is the caller's choice: `""` (AI off), `organization`
 *   (use my organisation's AI), or one of `openai`, `anthropic`,
 *   `azure_openai`, `bedrock`, `vertex`. `ollama` is a 400 and nothing is
 *   stored (spec AC-6). `unsupported` is accepted only when the caller's
 *   row already reads as `unsupported`, so a document read and written
 *   back unchanged succeeds and leaves the stored choice, the stored
 *   provider-specific values and the stored key exactly as they were
 *   (spec AC-9); any other write of `unsupported` is a 400.
 * * A key is bound to the provider it was entered for (spec D-5). A
 *   present `llmApiKey` applies to the caller's provider AFTER this write
 *   (the body's `llmProvider` when present, else the stored one): a
 *   non-empty value replaces that provider's key, `""` removes it. Keys
 *   bound to other providers are untouched, so changing `llmProvider`
 *   neither carries a key to the new provider nor loses the old one, and
 *   changing back makes the earlier key usable again (spec AC-15). When
 *   the provider after the write is not one of the five, a non-empty
 *   `llmApiKey` is a 400 and nothing is stored; `""` is accepted.
 * * A key stored before this change and bound to no provider
 *   (`llmUnboundApiKeySet`) is never deleted implicitly (spec D-5:
 *   "never sent, never deleted"; §3 "It is not deleted"; AC-16). A write
 *   carrying `llmApiKey`, with any value, touches only the key of the
 *   provider after the write and leaves the unbound key in storage. The
 *   unbound key is removed only by the explicit, write-only
 *   `llmUnboundApiKey: ""`; any other value of that property is a 400
 *   and nothing is stored. "Replace" in spec §3 is a key entered for the
 *   selected provider, optionally sent together with
 *   `llmUnboundApiKey: ""` in the same write when the user also asks to
 *   remove the old key.
 * * Choosing a provider with no key bound to it is accepted; AI is then
 *   not configured, `needs_key`, until a key is written (spec row 3).
 * * `llmApiKeysSet`, `llmUnboundApiKeySet` and `aiStatus` are read-only
 *   and, like `llmApiKeySet`, accepted and ignored on write.
 * * Nothing here reads, writes or reveals an organisation's
 *   configuration or key: that is getOrganizationAI and
 *   patchOrganizationAI (Part 2). Writing `llmProvider: organization`
 *   does not confirm the organisation's configuration, alone or inside
 *   a whole settings document (confirmOrganizationAI does; spec P2-D14,
 *   P2-AC-38). Writing `llmProvider` as `""` or as one of the five
 *   providers DELETES the caller's stored confirmation for their
 *   organisation, whether or not the stored choice changes, so a later
 *   return to `organization` asks again (spec §3.4, P2-AC-36); this is a
 *   side effect, never a refusal. While the caller's organisation
 *   forbids personal keys, choosing a provider and writing a key for it
 *   are accepted and stored, and that key is never sent (spec P2-D8,
 *   P2-AC-21).
 * 
 * Before PAC-24 there was no PATCH; the only write was a full-replace PUT that persisted every omitted field as its Go zero value (API-004).
 */
export type patch_PatchSettings = {
      method: "PATCH",
      path: "/api/settings",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        
        
        
        body:  Schemas.SettingsUpdate,
          }
      responses: {200: Schemas.Settings,
400: Schemas.SchedulingErrorResponse,
500: Schemas.SchedulingErrorResponse,
},
      
    }
/**
 * A snake_case projection of seven `recap*` fields of the CALLER'S OWN settings row - the same row GET /api/settings exposes in camelCase. The two representations are hand-maintained and can drift (`recapIncludeFocus` <-> `include_focus_blocks`).
 * Before PAC-24 this read the singleton row, so every user saw and edited one shared recap configuration (API-002).
 */
export type get_GetDailyRecapSettings = {
      method: "GET",
      path: "/api/settings/daily-recap",
      requestFormat: "json",
      responseFormat: "json",
      parameters: never,
      responses: {200: Schemas.DailyRecapSettings,
500: Schemas.SchedulingErrorResponse,
},
      
    }
/**
 * A partial update of the CALLER'S OWN recap settings. A property absent from the body is left unchanged; a property present is applied. No property is nullable, so an explicit `null` is a 400 - this matches PATCH /api/settings (spec AC-8) and is a change: the handler's pointer fields previously treated `null` as "leave unchanged", which made a typo indistinguishable from an omission.
 * Returns 204 with an EMPTY body on success - it does not echo the new state.
 * Before PAC-24 this patched the singleton row, and the underlying write was a full-row write that also rewrote every NON-recap column of that row from the values it had just read (API-002). It now writes only the recap columns of the caller's row.
 */
export type patch_PatchDailyRecapSettings = {
      method: "PATCH",
      path: "/api/settings/daily-recap",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        
        
        
        body:  Schemas.DailyRecapPatch,
          }
      responses: {204: unknown,
400: string,
500: Schemas.SchedulingErrorResponse,
},
      
    }
/**
 * Builds the Slack Block Kit payload for the authenticated user at the current time IN THE CALLER'S TIMEZONE (`settings.timezone`, UTC when it cannot be resolved) - the same rule the scheduled recap uses - and returns it; the header names that zone and every time in the recap is rendered in it. No request body is read. Nothing is sent to Slack and no Slack connection is required.
 * Before PAC-24 the day's content was the caller's but the recap configuration driving it (which sections to include) came from the singleton row, so a preview could omit sections the caller had enabled (API-002), and it was built in the server's zone. Both now come from the caller's row.
 */
export type post_PreviewDailyRecap = {
      method: "POST",
      path: "/api/settings/daily-recap/preview",
      requestFormat: "json",
      responseFormat: "json",
      parameters: never,
      responses: {200: Schemas.DailyRecapPreview,
500: Schemas.SchedulingErrorResponse,
},
      
    }
/**
 * Requires a stored `slack` workspace connection for the authenticated user. Destination comes from the CALLER'S OWN stored settings (`recapSendTo`, `recapChannelId`), not from the request - no request body is read. The message is built at the current time in the caller's timezone, as for the preview. The Slack call is bounded by a 10s context timeout.
 * Before PAC-24 the destination came from the singleton row, so a test send could be addressed to a channel another user had configured (API-002).
 */
export type post_SendDailyRecapTest = {
      method: "POST",
      path: "/api/settings/daily-recap/test",
      requestFormat: "json",
      responseFormat: "json",
      parameters: never,
      responses: {200: Schemas.DailyRecapTestResult,
400: string,
500: Schemas.SchedulingErrorResponse,
502: Schemas.SchedulingErrorResponse,
},
      
    }
/**
 * Registered via chi `r.Route("/api/teams")` + `r.Post("/")`, so both `/api/teams` and `/api/teams/` route here. The owner team_members row is inserted with its error discarded, so a failed AddTeamMember still returns 201 with an ownerless team.
 */
export type post_CreateTeam = {
      method: "POST",
      path: "/api/teams",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        
        
        
        body:  Schemas.TeamNameRequest,
          }
      responses: {201: Schemas.Team,
400: Schemas.ErrorResponse,
401: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Bare JSON array (no envelope), ordered by teams.created_at DESC. Always an array, never null.
 */
export type get_ListTeams = {
      method: "GET",
      path: "/api/teams",
      requestFormat: "json",
      responseFormat: "json",
      parameters: never,
      responses: {200: Array<Schemas.Team>,
401: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Registered inside the requireAuth group and therefore requires a valid JWT. The handler comment says "(public)", which is wrong (API-089); PAC-34 corrects the comment, not the routing. Calls ExpireOldInvites first, so an invite past expires_at is reported as 410 "invite is expired" rather than 200. PAC-34 (API-021): the 200 also carries team_id, expires_at and inviter_email, so the invite page can show who invited the caller and when the link expires. The audience is unchanged: any authenticated caller holding the token, as before (the invitee email is checked on accept, not on preview). The token is still not echoed; the caller already has it in the path.
 */
export type get_GetTeamInvite = {
      method: "GET",
      path: "/api/teams/invites/{token}",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        path:  { token: string },
        
        
        
          }
      responses: {200: Schemas.TeamInvitePreview,
404: Schemas.ErrorResponse,
410: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * The authenticated user's email must case-insensitively equal invitee_email. Membership is added with role "member" via an ON CONFLICT DO NOTHING insert, so accepting twice cannot demote an existing owner. Returns no body.
 */
export type post_AcceptTeamInvite = {
      method: "POST",
      path: "/api/teams/invites/{token}/accept",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        path:  { token: string },
        
        
        
          }
      responses: {204: unknown,
401: Schemas.ErrorResponse,
403: Schemas.ErrorResponse,
404: Schemas.ErrorResponse,
410: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Membership required. `members` is the raw result of ListTeamMembers with its error discarded, ordered by joined_at ASC, and is `[]` whenever the list is empty or the query failed (PAC-28).
 */
export type get_GetTeam = {
      method: "GET",
      path: "/api/teams/{id}",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        path:  { id: string },
        
        
        
          }
      responses: {200: Schemas.TeamDetail,
400: Schemas.ErrorResponse,
403: Schemas.ErrorResponse,
404: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
export type patch_RenameTeam = {
      method: "PATCH",
      path: "/api/teams/{id}",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        path:  { id: string },
        
        
        body:  Schemas.TeamNameRequest,
          }
      responses: {200: Schemas.Team,
400: Schemas.ErrorResponse,
403: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Cascades to team_members, team_invites, no_meeting_zones and manager_team_member_assignments via FK ON DELETE CASCADE.
 */
export type delete_DeleteTeam = {
      method: "DELETE",
      path: "/api/teams/{id}",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        path:  { id: string },
        
        
        
          }
      responses: {204: unknown,
400: Schemas.ErrorResponse,
403: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Membership required. Unlike GET /api/manager/analytics this reads the analytics_weeks table directly per team member, with no consent check and no FreeBusy fallback. Averages divide by the member count (or by 1 when the team is empty) using integer division.
 */
export type get_GetFormalTeamAnalytics = {
      method: "GET",
      path: "/api/teams/{id}/analytics",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            query?:  Partial<{ date: string }>,
        path:  { id: string },
        
        
        
          }
      responses: {200: Schemas.TeamAnalytics,
400: Schemas.ErrorResponse,
403: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Membership required. The engine searches a fixed 09:00-18:00 UTC window on `date`, steps the cursor in 15-minute increments, treats no-meeting zones and busy calendar events as hard blocks, and scores each slot 0-100 by how few members' focus blocks it disrupts. A member whose calendar token is missing or whose calendar call fails contributes no busy intervals and is silently treated as fully free. `slots` is always an array, never null.
 */
export type get_GetTeamAvailability = {
      method: "GET",
      path: "/api/teams/{id}/availability",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            query:  { date: string, duration?: number },
        path:  { id: string },
        
        
        
          }
      responses: {200: Schemas.TeamSlotList,
400: Schemas.ErrorResponse,
403: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
export type post_InviteTeamMember = {
      method: "POST",
      path: "/api/teams/{id}/members/invite",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        path:  { id: string },
        
        
        body:  Schemas.InviteEmailRequest,
          }
      responses: {201: Schemas.TeamInvite,
400: Schemas.ErrorResponse,
403: Schemas.ErrorResponse,
422: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * An owner of the team may remove anyone; any caller may remove themselves. A removal that would leave the team with zero owners is refused with 422 and changes nothing (PAC-25, API-023). Check order, fixed so that a non-owner cannot learn who the owner is from the answer: 400 malformed ids; then, when the caller is not the target, 403 unless the caller is an owner; then 422 if the target is an owner and no other owner of the team would remain; then the removal, 204. The guard counts owners ("would leave zero owners", PAC-25 D-4), it does not refuse every owner: in a team with two owners either may leave, and the second to try is refused. No interleaving of concurrent removals may leave the team with zero owners (PAC-25 D-6). A sole owner who is also the only member is refused too; deleting the team (DELETE /api/teams/{id}) stays the way to be rid of it (PAC-25 D-5). The manager-domain DELETE /api/manager/team/members/{email} keeps its own, role-based rule (it refuses removing any owner) with the same 422 wording (PAC-25 D-3).
 */
export type delete_RemoveTeamMember = {
      method: "DELETE",
      path: "/api/teams/{id}/members/{userId}",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        path:  { id: string, userId: string },
        
        
        
          }
      responses: {204: unknown,
400: Schemas.ErrorResponse,
403: Schemas.ErrorResponse,
422: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * The WIRE weekday convention is Monday=1 .. Sunday=7. Storage uses Go's Sunday=0 .. Saturday=6; the handler converts 7 -> 0 on write and 0 -> 7 on read (TestNoMeetingZone_ValidatesAndConvertsWeekdayAtBoundary asserts both halves).
 */
export type post_CreateNoMeetingZone = {
      method: "POST",
      path: "/api/teams/{id}/no-meeting-zones",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        path:  { id: string },
        
        
        body:  Schemas.NoMeetingZoneRequest,
          }
      responses: {201: Schemas.NoMeetingZone,
400: Schemas.ErrorResponse,
403: Schemas.ErrorResponse,
422: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Bare JSON array, always present (never null), ordered by the STORED day_of_week then start_time — which means Sunday sorts FIRST because it is stored as 0, even though it is emitted as dayOfWeek 7.
 */
export type get_ListNoMeetingZones = {
      method: "GET",
      path: "/api/teams/{id}/no-meeting-zones",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        path:  { id: string },
        
        
        
          }
      responses: {200: Array<Schemas.NoMeetingZone>,
400: Schemas.ErrorResponse,
403: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * PATCH by name, PUT by behaviour: every field is taken from the body with no merge against the stored row, so an omitted dayOfWeek becomes 0 and fails validation with 422. The update is scoped by BOTH zone id and team id, so a zone belonging to another team returns 404. Ownership is checked before the zoneId is even parsed.
 */
export type patch_UpdateNoMeetingZone = {
      method: "PATCH",
      path: "/api/teams/{id}/no-meeting-zones/{zoneId}",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        path:  { id: string, zoneId: string },
        
        
        body:  Schemas.NoMeetingZoneRequest,
          }
      responses: {200: Schemas.NoMeetingZone,
400: Schemas.ErrorResponse,
403: Schemas.ErrorResponse,
404: Schemas.ErrorResponse,
422: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
export type delete_DeleteNoMeetingZone = {
      method: "DELETE",
      path: "/api/teams/{id}/no-meeting-zones/{zoneId}",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        path:  { id: string, zoneId: string },
        
        
        
          }
      responses: {204: unknown,
400: Schemas.ErrorResponse,
403: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }

  // </Endpoints>
  }
  
  
     // <EndpointByMethod>
     export type EndpointByMethod = {
     post: {
           "/api/admin/sso": Endpoints.post_CreateSsoProvider,
"/api/analytics/recompute": Endpoints.post_RecomputeAnalytics,
"/api/auth/detect": Endpoints.post_DetectAuthProvider,
"/api/auth/logout": Endpoints.post_Logout,
"/api/auth/microsoft/disconnect": Endpoints.post_DisconnectMicrosoft,
"/api/book/{slug}": Endpoints.post_CreatePublicBooking,
"/api/conference/create": Endpoints.post_CreateConferenceLink,
"/api/conference/zoom/disconnect": Endpoints.post_DisconnectZoom,
"/api/events/{id}/conference": Endpoints.post_AddEventConference,
"/api/focus/run": Endpoints.post_RunFocus,
"/api/freebusy": Endpoints.post_QueryFreeBusy,
"/api/habits": Endpoints.post_CreateHabit,
"/api/habits/reoptimize": Endpoints.post_ReoptimizeHabits,
"/api/llm/test": Endpoints.post_TestLLMConnection,
"/api/manager/detect": Endpoints.post_PreviewManagerDetection,
"/api/manager/detect/confirm": Endpoints.post_ConfirmManagerDetection,
"/api/manager/profile": Endpoints.post_SetManagerProfile,
"/api/manager/team/members": Endpoints.post_AddManagerTeamMember,
"/api/manager/team/members/{email}/schedule": Endpoints.post_ScheduleManagerOneOnOne,
"/api/meetings/{event_id}/brief/refresh": Endpoints.post_RefreshMeetingBrief,
"/api/nlp/confirm": Endpoints.post_ConfirmNaturalLanguage,
"/api/nlp/parse": Endpoints.post_ParseNaturalLanguage,
"/api/organization/ai/consent": Endpoints.post_ConfirmOrganizationAI,
"/api/personal-calendars": Endpoints.post_CreatePersonalCalendar,
"/api/personal-calendars/{id}/sync": Endpoints.post_SyncPersonalCalendar,
"/api/schedule/compress": Endpoints.post_PreviewCompression,
"/api/schedule/compress/apply": Endpoints.post_ApplyCompression,
"/api/schedule/create": Endpoints.post_CreateScheduledMeeting,
"/api/schedule/suggest": Endpoints.post_SuggestMeetingSlots,
"/api/scheduling-links": Endpoints.post_CreateSchedulingLink,
"/api/scheduling-links/host-invites/{id}/accept": Endpoints.post_AcceptSchedulingLinkHostInvite,
"/api/scheduling-links/host-invites/{id}/decline": Endpoints.post_DeclineSchedulingLinkHostInvite,
"/api/scheduling-links/{id}/accept": Endpoints.post_AcceptSchedulingLinkInviteByLink,
"/api/scheduling-links/{id}/decline": Endpoints.post_DeclineSchedulingLinkInviteByLink,
"/api/scheduling-links/{id}/hosts": Endpoints.post_InviteSchedulingLinkHost,
"/api/scheduling-links/{id}/leave": Endpoints.post_LeaveSchedulingLink,
"/api/settings/daily-recap/preview": Endpoints.post_PreviewDailyRecap,
"/api/settings/daily-recap/test": Endpoints.post_SendDailyRecapTest,
"/api/teams": Endpoints.post_CreateTeam,
"/api/teams/invites/{token}/accept": Endpoints.post_AcceptTeamInvite,
"/api/teams/{id}/members/invite": Endpoints.post_InviteTeamMember,
"/api/teams/{id}/no-meeting-zones": Endpoints.post_CreateNoMeetingZone
         },
get: {
           "/api/admin/sso": Endpoints.get_ListSsoProviders,
"/api/admin/sso/stepup": Endpoints.get_StartSsoAdminStepup,
"/api/admin/sso/stepup/callback": Endpoints.get_SsoAdminStepupCallback,
"/api/admin/sso/stepup/options": Endpoints.get_GetSsoStepupOptions,
"/api/analytics/meetings": Endpoints.get_ListAnalyticsMeetings,
"/api/analytics/trends": Endpoints.get_ListAnalyticsTrends,
"/api/analytics/week": Endpoints.get_GetAnalyticsWeek,
"/api/attendees/suggest": Endpoints.get_SuggestAttendees,
"/api/audit": Endpoints.get_ListAuditEntries,
"/api/auth/callback": Endpoints.get_GoogleOAuthCallback,
"/api/auth/callback/oidc/{domain}": Endpoints.get_SsoOidcCallback,
"/api/auth/google": Endpoints.get_StartGoogleOAuth,
"/api/auth/me": Endpoints.get_GetCurrentUser,
"/api/auth/microsoft": Endpoints.get_StartMicrosoftOAuth,
"/api/auth/microsoft/callback": Endpoints.get_MicrosoftOAuthCallback,
"/api/auth/sso/{domain}": Endpoints.get_StartSsoLogin,
"/api/auth/status": Endpoints.get_GetAuthStatus,
"/api/auth/zoom": Endpoints.get_StartZoomOAuth,
"/api/auth/zoom/callback": Endpoints.get_HandleZoomOAuthCallback,
"/api/book/{slug}": Endpoints.get_GetPublicLinkInfo,
"/api/book/{slug}/slots": Endpoints.get_GetPublicBookingSlots,
"/api/calendar/events": Endpoints.get_ListCalendarEvents,
"/api/calendar/freebusy": Endpoints.get_GetCalendarFreeBusy,
"/api/conference/providers": Endpoints.get_ListConferenceProviders,
"/api/focus/blocks": Endpoints.get_ListFocusBlocks,
"/api/habits": Endpoints.get_ListHabits,
"/api/habits/templates": Endpoints.get_ListHabitTemplates,
"/api/habits/{id}/occurrences": Endpoints.get_ListHabitOccurrences,
"/api/health": Endpoints.get_GetHealth,
"/api/integrations/availability": Endpoints.get_GetIntegrationAvailability,
"/api/integrations/notion/callback": Endpoints.get_NotionOauthCallback,
"/api/integrations/notion/connect": Endpoints.get_ConnectNotion,
"/api/integrations/notion/status": Endpoints.get_GetNotionStatus,
"/api/integrations/slack/callback": Endpoints.get_SlackOauthCallback,
"/api/integrations/slack/connect": Endpoints.get_ConnectSlack,
"/api/integrations/slack/status": Endpoints.get_GetSlackStatus,
"/api/manager/analytics": Endpoints.get_GetManagerAnalytics,
"/api/manager/gaps": Endpoints.get_GetManagerCadenceGaps,
"/api/manager/profile": Endpoints.get_GetManagerProfile,
"/api/manager/team": Endpoints.get_GetManagerRoster,
"/api/meetings/{event_id}/brief": Endpoints.get_GetMeetingBrief,
"/api/org/members": Endpoints.get_ListOrgMembers,
"/api/organization/ai": Endpoints.get_GetOrganizationAI,
"/api/personal-calendars": Endpoints.get_ListPersonalCalendars,
"/api/personal-calendars/{id}/preview": Endpoints.get_PreviewPersonalCalendar,
"/api/rooms": Endpoints.get_ListRooms,
"/api/scheduling-links": Endpoints.get_ListSchedulingLinks,
"/api/scheduling-links/host-invites": Endpoints.get_ListSchedulingLinkHostInvites,
"/api/scheduling-links/invites": Endpoints.get_ListSchedulingLinkInvitesAlias,
"/api/scheduling-links/{id}": Endpoints.get_GetSchedulingLink,
"/api/scheduling-links/{id}/bookings": Endpoints.get_ListSchedulingLinkBookings,
"/api/settings": Endpoints.get_GetSettings,
"/api/settings/daily-recap": Endpoints.get_GetDailyRecapSettings,
"/api/teams": Endpoints.get_ListTeams,
"/api/teams/invites/{token}": Endpoints.get_GetTeamInvite,
"/api/teams/{id}": Endpoints.get_GetTeam,
"/api/teams/{id}/analytics": Endpoints.get_GetFormalTeamAnalytics,
"/api/teams/{id}/availability": Endpoints.get_GetTeamAvailability,
"/api/teams/{id}/no-meeting-zones": Endpoints.get_ListNoMeetingZones
         },
delete: {
           "/api/admin/sso/{domain}": Endpoints.delete_DeleteSsoProvider,
"/api/auth/disconnect": Endpoints.delete_DisconnectCalendar,
"/api/events/{id}": Endpoints.delete_DeleteEvent,
"/api/events/{id}/conference": Endpoints.delete_RemoveEventConference,
"/api/focus/blocks": Endpoints.delete_ClearFocusBlocks,
"/api/habits/{id}": Endpoints.delete_DeactivateHabit,
"/api/integrations/notion": Endpoints.delete_DisconnectNotion,
"/api/integrations/slack": Endpoints.delete_DisconnectSlack,
"/api/manager/team/members/{email}": Endpoints.delete_RemoveManagerTeamMember,
"/api/personal-calendars/{id}": Endpoints.delete_DeletePersonalCalendar,
"/api/scheduling-links/{id}": Endpoints.delete_DeleteSchedulingLink,
"/api/teams/{id}": Endpoints.delete_DeleteTeam,
"/api/teams/{id}/members/{userId}": Endpoints.delete_RemoveTeamMember,
"/api/teams/{id}/no-meeting-zones/{zoneId}": Endpoints.delete_DeleteNoMeetingZone
         },
put: {
           "/api/admin/sso/{domain}/state": Endpoints.put_SetSsoProviderState
         },
patch: {
           "/api/events/{id}": Endpoints.patch_PatchEvent,
"/api/habits/{id}": Endpoints.patch_UpdateHabit,
"/api/habits/{id}/occurrences/{occurrenceId}": Endpoints.patch_UpdateHabitOccurrenceStatus,
"/api/manager/team/members/{email}": Endpoints.patch_PatchManagerTeamMember,
"/api/organization/ai": Endpoints.patch_PatchOrganizationAI,
"/api/personal-calendars/{id}": Endpoints.patch_UpdatePersonalCalendar,
"/api/scheduling-links/{id}": Endpoints.patch_UpdateSchedulingLink,
"/api/settings": Endpoints.patch_PatchSettings,
"/api/settings/daily-recap": Endpoints.patch_PatchDailyRecapSettings,
"/api/teams/{id}": Endpoints.patch_RenameTeam,
"/api/teams/{id}/no-meeting-zones/{zoneId}": Endpoints.patch_UpdateNoMeetingZone
         }
     }
     
     // </EndpointByMethod>
     

    // <EndpointByMethod.Shorthands>
    export type PostEndpoints = EndpointByMethod["post"]
export type GetEndpoints = EndpointByMethod["get"]
export type DeleteEndpoints = EndpointByMethod["delete"]
export type PutEndpoints = EndpointByMethod["put"]
export type PatchEndpoints = EndpointByMethod["patch"]
    // </EndpointByMethod.Shorthands>
    