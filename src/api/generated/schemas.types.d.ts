
  export namespace Schemas {
    // <Schemas>
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
   * `minutes / total_working_minutes * 100`, or 0 when total is 0. Not rounded. Note buffer_minutes is excluded from the breakdown, so the five percentages need not sum to 100.
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
 * Raw `storage.AnalyticsWeek` as returned by GET /api/analytics/trends. Same field
 * set as AnalyticsWeekWithBreakdown minus `breakdown`, and with `week_start`
 * serialised as a full RFC3339 timestamp because the Go field is a `time.Time`.
 */
export type AnalyticsWeekRow = {
  id: string;
  user_id: string;
  /**
   * Midnight UTC of the Monday, e.g. "2026-03-02T00:00:00Z" — NOT the "2026-03-02" shape used by /api/analytics/week.
   */
  week_start: string;
  total_working_minutes: number;
  meeting_minutes: number;
  focus_minutes: number;
  habit_minutes: number;
  buffer_minutes: number;
  personal_minutes: number;
  free_minutes: number;
  meeting_count: number;
  focus_block_count: number;
  /**
   * 0..1 fraction.
   */
  habit_completion_rate: number;
  largest_focus_block_minutes: number;
  /**
   * May serialise as `null` rather than `[]`: it is populated by a failure-swallowing `json.Unmarshal` of the JSONB column into a nil slice.
   */
  top_meeting_titles: (Array<MeetingTitle> | null);
  focus_score: number;
  estimated_meeting_cost_minutes: number;
  computed_at: string;
}
/**
 * Response of GET /api/analytics/week. Built by `weekWithBreakdown` as a
 * `map[string]any`, so it deliberately differs from AnalyticsWeekRow: `week_start`
 * is a plain date string and `breakdown` is added.
 */
export type AnalyticsWeekWithBreakdown = {
  id: string;
  user_id: string;
  /**
   * The Monday of the week, formatted "2006-01-02". DIFFERENT from the trends endpoint, which emits a full timestamp.
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
   * Never populated by `compute` — the engine leaves it at 0 in every write path.
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
   * completed / (scheduled + completed) occurrences in the week, as a 0..1 FRACTION (not a percentage). 0 when there are none.
   */
  habit_completion_rate: number;
  largest_focus_block_minutes: number;
  top_meeting_titles: Array<MeetingTitle>;
  /**
   * `focus*100/(focus+meeting)` clamped to ≤100; 50 when both are 0.
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
 * storage.AuditEntry. One recorded action, always about the calling user's own calendar — the subject is the scoping predicate and is deliberately NOT echoed back as a field, because it is the same value on every entry of every response (see contracts/features/PAC-23.md §2, rejected alternative A).
 */
export type AuditEntry = {
  /**
   * `audit_log.id`, declared `SERIAL` at backend/storage/migrations/001_initial.up.sql:45 — a 32-bit signed sequence. `storage.AuditEntry.ID` is a Go `int64` (backend/storage/audit_log.go:9), but that widening is a Go type choice, not a range the table can reach, so `int64` here would over-declare the server. `int32` is declared instead because the sole consumer coerces with `Number(e.id)` (smart-calendar-flow/src/api/client.ts:432) and uses the result as a React list key (src/pages/Audit.tsx:94): every `int32` is exactly representable as a JS number, so the coercion is lossless and keys stay distinct. Values above 2^53 would collide into one key and drop rows — the table cannot produce them, and this declaration is what keeps that true for a generated client.
   */
  id: number;
  /**
   * What was recorded. Underscore-separated, lower-case; there is no dotted key convention on this endpoint and never was.
   * 
   * This is the complete set the server can emit, enumerated from every `storage.WriteAuditLog` call site in `backend/` (the action argument is a string literal at all seven, and `storage.WriteAuditLog`, backend/storage/focus_blocks.go:61-63, holds the only INSERT against the table): `focus_created` (backend/engine/focus_time.go:106), `focus_cleared` (backend/engine/focus_time_cleaner.go:39), `meeting_scheduled` (backend/engine/smart_schedule.go:323), `meeting_moved` (backend/engine/compression.go:178), `meeting_created` (backend/api/handlers_schedule.go:188), `nlp_parsed` (backend/nlp/parser.go:221), `nlp_confirmed` (backend/api/handlers_nlp.go:67).
   * 
   * The enum is closed on purpose. `audit_log.action` is an unconstrained `TEXT` column, so the set is held by this contract rather than by the database: adding an eighth action is a contract change, and a writer added without one makes the contract test fail, which is the intended alarm. Spec AC-14 requires that this set never shrinks.
   * 
   * Because the body of the 200 is an array of this schema, a value outside this enum makes the WHOLE response non-conforming, not just the one row — one operator `INSERT`, one writer added without a contract change, or one restored backup, and a validating consumer rejects six good rows along with the odd one. That is the intended alarm in a test and the wrong behaviour in a UI, so the expected handling is stated rather than left to each consumer: **render the row, substituting a placeholder such as `unknown` for the unrecognised value, rather than discarding the response.**
   * 
   * No consumer implements that today, and the correction matters because an earlier revision of this paragraph claimed one did. The shipped client's normaliser is `action: typeof e.action === "string" && e.action ? e.action : "unknown"` (smart-calendar-flow/src/api/client.ts:435). It substitutes `unknown` only for an action that is MISSING, NON-STRING or EMPTY; an unrecognised non-empty string — `focus.run`, `weird_action` — passes through verbatim. The row still renders, but for a different reason: that client's `AuditEntry` is hand-written with `action: string` (smart-calendar-flow/src/api/types.ts:221), so nothing validates against this enum at all. A stage-4 frontend implementer must not read this paragraph as describing work already done. Factory §4 mandates a generated zod `schemas.ts` in that repo; it does not exist yet, and when it does it will not be so forgiving, which is the case this paragraph is for.
   * 
   * It names WHAT happened, not WHO did it. Every entry's subject is the calling user (see the operation description); no entry carries an actor, and no value in this enum distinguishes an action a person took from one the scheduler took on their behalf.
   */
  action: ("focus_created" | "focus_cleared" | "meeting_scheduled" | "meeting_moved" | "meeting_created" | "nlp_parsed" | "nlp_confirmed");
  /**
   * Scanned from the DB into a Go `string`, so on the wire this is ALWAYS a JSON string — even when the text inside it happens to be JSON. A generator should emit `string`, and that is correct and complete for the transport.
   * 
   * Whether the text inside parses as JSON depends on which `action` produced it, so the useful statement is per-writer rather than a blanket warning. ALWAYS VALID JSON: `focus_created` and `focus_cleared` marshal a struct with `encoding/json` (backend/engine/focus_time.go:101-106, backend/engine/focus_time_cleaner.go:33-39); `nlp_parsed` uses `fmt.Sprintf` with `%q`, which escapes (backend/nlp/parser.go:221). NOT GUARANTEED: `meeting_scheduled`, `meeting_created`, `meeting_moved` and `nlp_confirmed` are built by concatenating values into a JSON literal with no escaping (backend/engine/smart_schedule.go:323, backend/api/handlers_schedule.go:188, backend/engine/compression.go:178, backend/api/handlers_nlp.go:67).
   * 
   * The interpolated value differs by site and so does the severity. At smart_schedule.go:323 and handlers_schedule.go:188 it is a meeting title from the request body, so a title containing `"`, `\` or a newline yields malformed JSON. At compression.go:178 there is no title: the values are a client-supplied `event_id`, copied unvalidated from the request body (backend/api/handlers_schedule.go:80-93), and an RFC3339 timestamp — so a caller can write JSON STRUCTURE, not merely a stray quote, into its own row. At handlers_nlp.go:67 the value is a Google-issued event id, which in practice contains no JSON metacharacter; the construction is the same defect, the input simply is not attacker-controlled.
   * 
   * Consequence for a consumer: parse the four safe actions if you want to; for the other four, treat the value as opaque text, as the shipped client does (`formatAuditDetails`, smart-calendar-flow/src/api/client.ts:410-419, never calls JSON.parse). PAC-23 does not fix the concatenation — it is docs/specs/PAC-23.md OQ-6, and the spec challenge argues for splitting the escaping defect out of it. When that lands, the NOT GUARANTEED list empties and this description loses two paragraphs.
   */
  details: string;
  created_at: string;
}
/**
 * Assembled from map[string]interface{} literals in authHandlers.status —
 * all three keys are always emitted (no omitempty).
 */
export type AuthStatusResponse = {
  connected: boolean;
  /**
   * Settings.calendar_provider, defaulting to "google" when blank. The
   * error/fallback paths also report "google", so "google" does not prove
   * Google was configured.
   */
  provider: ("google" | "outlook" | "webcal");
  /**
   * For outlook/webcal this is the caller's own settings.calendar_email
   * verbatim. For google it is fetched live from the Google userinfo
   * endpoint and is the empty string when that call fails.
   * Before PAC-24 the outlook/webcal value came from the shared settings
   * row and was therefore some other user's address (API-009).
   */
  email: string;
}
/**
 * Shared error envelope written by api.writeError (handlers_settings.go:206): Content-Type application/json, body `{"error": "<message>"}`. The two exceptions in this domain are the requireAuth 401 and the Zoom OAuth callback, both of which use http.Error and therefore send text/plain.
 */
export type BookingError = {
  /**
   * Human-readable message. Several 500s concatenate the underlying Go error text.
   */
  error: string;
}
/**
 * engine.CadenceGap.
 */
export type CadenceGap = {
  member_email: string;
  display_name: string;
  cadence: Cadence;
  last_one_on_one_at: (string | null);
  /**
   * last_one_on_one_at (or now, when never met) plus the cadence interval. Monthly uses calendar-month arithmetic; the rest use day addition.
   */
  next_expected_by: string;
  /**
   * 0 when the next 1:1 is still upcoming within the 7-day warning window; positive when already past due. Never negative — upcoming-ness is not encoded here.
   */
  days_overdue: number;
}
export type CadenceGapList = { gaps: Array<CadenceGap> }
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
 * api.calendarEventDTO — the flattened event shape returned by GET /api/calendar/events.
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
   * Declared on the DTO with `omitempty` but NEVER SET by toCalendarEventDTO, so it is always omitted from responses from this endpoint.
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
  applied: (Array<string> | null);
  /**
   * Mixed contents: handler-side entries read `"<event_id>: invalid time format"`, engine-side entries are appended verbatim by Compressor.Apply.
   */
  failed: (Array<string> | null);
}
/**
 * Both fields optional; `week` takes precedence over `date` when non-empty.
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
  proposals: (Array<MoveProposal> | null);
  totalFocusGainMinutes: number;
}
/**
 * backend/conference/provider.go Details. camelCase json tags, unlike every other response in this domain.
 */
export type ConferenceMeetingDetails = {
  /**
   * Provider-supplied label.
   */
  provider: string;
  joinUrl: string;
  /**
   * Omitted when empty.
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
   * Always present. `custom` is hardcoded to true.
   */
  connected: boolean;
  /**
   * Set only for google_meet (the configured calendar email); omitted when empty.
   */
  email?: string;
  /**
   * json `enabled,omitempty` on a bool, so `false` is OMITTED entirely - the key only ever appears as `true`, and only for teams. Absence must be read as false.
   */
  enabled?: boolean;
  /**
   * "google" for google_meet, "outlook" for teams. Omitted for zoom and custom.
   */
  auto_with?: ("google" | "outlook");
}
/**
 * POST /api/conference/create. No handler-side validation; every field silently defaults to the Go zero value when absent.
 */
export type CreateConferenceRequest = Partial<{
  title: string;
  /**
   * Decoded into time.Time. Absent means the zero time, which is forwarded to the provider.
   */
  start: string;
  end: string;
}>
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
   * May be the empty string (Microsoft and SSO logins always upsert "").
   * Not omitempty, so the key is always present.
   */
  avatarUrl: string;
  /**
   * Login provider recorded at upsert time.
   * x-uncertain applies — see property-level note.
   */
  provider: string;
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
export type DailyRecapPreview = { blocks: (Array<SlackBlock> | null) }
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
 * Body of PATCH /api/events/{id}. Every field is optional; only non-null fields are applied. Unknown keys are silently ignored by encoding/json.
 */
export type EventPatchRequest = Partial<{
  /**
   * Maps to Google `summary`. Null or absent leaves it unchanged.
   */
  title: (string | null);
  description: (string | null);
  location: (string | null);
  /**
   * Decoded as Go time.Time (RFC3339) and re-emitted as UTC RFC3339 in `start.dateTime`. Setting this on an all-day event converts it to a timed event.
   */
  start: (string | null);
  /**
   * Same handling as `start`.
   */
  end: (string | null);
  /**
   * FULL REPLACEMENT of the attendee list with email-only entries. Sending `[]` clears all attendees, including room resources.
   */
  attendees: (Array<string> | null);
}>
/**
 * storage.FocusBlock (backend/storage/models.go). No json tags either, so the wire field names are the Go field names.
 */
export type FocusBlockRecord = { ID: number, GoogleEventID: string, StartTime: string, EndTime: string, Date: string, CreatedAt: string }
/**
 * Literal `map[string]int{"deleted": n}`.
 */
export type FocusClearResult = { deleted: number }
/**
 * engine.FocusBlock. This struct has NO json tags, so the encoder emits exported Go field names verbatim. It is a DIFFERENT shape from FocusBlockRecord (storage.FocusBlock) returned by GET /api/focus/blocks.
 */
export type FocusRunBlock = {
  GoogleEventID: string;
  Start: string;
  End: string;
  /**
   * `YYYY-MM-DD`.
   */
  Date: string;
}
/**
 * Optional. A malformed body is silently treated as `{}`.
 */
export type FocusRunRequest = (Partial<{
  /**
   * `YYYY-MM-DD`. Empty or absent -> current week (`time.Now()`). Not snapped to Monday by the handler.
   */
  week: string;
}> & Record<string, unknown>)
/**
 * engine.FocusRunResult (backend/engine/focus_time.go). camelCase.
 */
export type FocusRunResult = {
  /**
   * RFC3339 (Go time.Time).
   */
  weekStart: string;
  /**
   * `null` when the engine created nothing.
   */
  createdBlocks: (Array<FocusRunBlock> | null);
  /**
   * x-uncertain at field level - the format of each entry is not pinned by a struct tag; it is whatever the engine appends.
   */
  skippedDays: (Array<string> | null);
  totalMinutes: number;
  errors: (Array<string> | null);
}
/**
 * calendar.TimeSlot serialized WITHOUT json tags, hence capitalized Go field names. A Google timestamp that fails to parse becomes the Go zero time `0001-01-01T00:00:00Z` because the parse error is discarded.
 */
export type RawGoogleBusyWindow = { Start: string, End: string }
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
 * The same free/busy data is returned three ways for compatibility: `participants` (canonical), `busy` (map form) and `results` (legacy, and with different key casing). All three are always present.
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
   * Legacy view. Uses `coverage` instead of `status`, and its busy windows are engine/calendar.TimeSlot values with CAPITALIZED `Start`/`End` keys.
   */
  results: Array<FreeBusyLegacyResult>;
}
/**
 * calendar/v3.EventDateTime. This repo only ever sets `dateTime`.
 */
export type GoogleEventDateTime = (Partial<{ dateTime: string, date: string, timeZone: string }> & Record<string, unknown>)
/**
 * calendar/v3.EventAttendee. This repo only ever sets `email`.
 */
export type GoogleEventAttendee = (Partial<{ email: string, displayName: string, organizer: boolean, responseStatus: string, optional: boolean }> & Record<string, unknown>)
/**
 * The raw `google.golang.org/api/calendar/v3.Event` returned by the calendar client and re-encoded as-is. Only the members this repo sets or reads are listed; the real payload carries the full Google Calendar event resource and omits empty fields (the generated struct uses `omitempty` almost everywhere).
 */
export type GoogleCalendarEvent = (Partial<{ id: string, summary: string, description: string, location: string, status: string, htmlLink: string, hangoutLink: string, start: GoogleEventDateTime, end: GoogleEventDateTime, attendees: Array<GoogleEventAttendee> }> & Record<string, unknown>)
/**
 * The raw google.golang.org/api/calendar/v3.Event returned unmodified by PATCH /api/events/{id}. Its keys are Google's own camelCase API names (`summary`, `start.dateTime`, `htmlLink`, `hangoutLink`, `attendees[].responseStatus`, …), not the CalendarEvent shape. Only the most load-bearing fields are listed; the object carries the full Google event payload.
 */
export type GoogleCalendarEventRaw = (Partial<{
  id: string;
  summary: string;
  description: string;
  location: string;
  htmlLink: string;
  hangoutLink: string;
  /**
   * Google EventDateTime — has `dateTime`, `date` and/or `timeZone`.
   */
  start: Record<string, unknown>;
  end: Record<string, unknown>;
  attendees: Array<Record<string, unknown>>;
}> & Record<string, unknown>)
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
 * Optional body for POST /api/llm/test. Added by PAC-24 to close API-037.
 * **This schema is a closed list of three properties and that is the whole point of it.** Not one of them can contribute to the URL the server requests, so no submitted value can direct a stored or ambient credential anywhere. The endpoint properties a probe might plausibly want to override - `llmBaseUrl`, `ollamaBaseUrl`, `azureEndpoint`, `azureDeployment`, `azureApiVersion`, `awsRegion`, `awsProfile`, `bedrockModel`, `gcpProject`, `gcpLocation`, `vertexModel` - are DELIBERATELY ABSENT and are a 400 via `additionalProperties: false`. The operation description carries the full argument, including why an all-or-nothing body (endpoint plus credential together) does not close the channel on the three ambient-credential providers.
 * An absent body, or `{}`, probes the caller's stored configuration - the pre-PAC-24 behaviour. `{"llmApiKey": "sk-..."}` probes an unsaved key against the caller's stored endpoint, which is the case the settings UI needs because a stored key can no longer be read back to re-submit.
 * This is deliberately NOT `SettingsUpdate`. Sharing that schema would re-admit every endpoint property by inheritance, which is precisely the defect this shape exists to prevent, and would make a probe read like a write. The three property names match the corresponding SettingsFields ones so a client can build this from the document it already holds.
 * `llmApiKey` here is `writeOnly` for the same reason it is on SettingsFields: it is accepted and is never echoed, including in the 400 and 502 bodies (spec AC-14). Nothing submitted here is persisted.
 */
export type LLMTestRequest = Partial<{
  /**
   * Which provider branch of `nlp.NewLLMClientFromSettings` to probe. Selects the client; it does not select a host. On `openai` and `anthropic` the host is the caller's stored `llmBaseUrl` (or the vendor default when that is empty); on the other four it is built entirely from the caller's stored endpoint properties. Spec AC-15.
   */
  llmProvider: ("" | "openai" | "anthropic" | "ollama" | "bedrock" | "azure_openai" | "vertex");
  /**
   * Consulted only by the `openai` and `anthropic` branches (`backend/nlp/llm_factory.go:25,34`), where it is a field of the JSON request body. It never appears in a URL. `bedrockModel`, `azureDeployment` and `vertexModel` - which DO appear in URLs - are not accepted here.
   */
  llmModel: string;
  /**
   * An unsaved key to probe. Used only as the `Authorization` header value sent to the caller's stored endpoint (`backend/nlp/parser.go:43`). Ignored by the four branches that take no key. Never persisted and never echoed (spec AC-14).
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
   * Echo of the `llmProvider` that was actually probed - the submitted one when a body was sent, the caller's stored one otherwise; empty string when unset. It is what tells a client which configuration the result is about. It never carries the key.
   */
  provider: ("" | "openai" | "anthropic" | "ollama" | "bedrock" | "azure_openai" | "vertex");
}
/**
 * storage.LunchBreakSchedule - a bare map keyed by lowercase weekday name. Normalised to `{}` (never null) on read (`backend/storage/settings.go:103-105`). A per-day entry overrides the legacy global `lunchStart`/`lunchEnd`/`protectLunch` trio, including disabling lunch for that day. Replaced whole by a PATCH that mentions it; `lunchBreaks: {}` clears every per-day override (spec AC-9).
 * `propertyNames` is added by PAC-24 for the same reason as on `WorkingHoursSchedule.days`: the validator lowercases the key before checking (`backend/api/handlers_settings.go:154`) but `LunchWindow` looks it up already-lowercased (`backend/storage/settings.go:138`), so a `"Monday"` key validates, stores, and never matches.
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
 * engine.MemberWeekStats. When data_available is false the three minute counters are all 0 — callers must branch on data_available rather than treating 0 as measured.
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
 * storage.ManagerTeamMember marshalled with no json tags — Go field names verbatim. Returned by addManagerTeamMember (201) and patchManagerTeamMember (200).
 */
export type ManagerTeamMemberGoStruct = {
  /**
   * On the 201 add response this is the zero UUID "00000000-0000-0000-0000-000000000000" because the struct is echoed back without re-reading the row.
   */
  ID: string;
  ManagerUserID: string;
  MemberEmail: string;
  /**
   * Set when the email matches a Paceday user; null for external members.
   */
  MemberUserID: (string | null);
  DisplayName: string;
  Source: ManagerMemberSource;
  Cadence: Cadence;
  CadenceCustomDays: (number | null);
  LastOneOnOneAt: (string | null);
  /**
   * Zero value "0001-01-01T00:00:00Z" on the 201 add response.
   */
  CreatedAt: string;
  /**
   * Zero value "0001-01-01T00:00:00Z" on the 201 add response.
   */
  UpdatedAt: string;
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
 * A JSON literal delivered with a text/plain Content-Type, because the handler sets application/json and http.Error then overwrites the header. Every producer of this exact body in backend/api/ is an `http.Error` with the literal `{"error":"unauthorized"}`: the three in `requireAuth` (backend/api/middleware.go:38, :44 and :50 — one per rejection reason), `orgHandlers.members` (backend/api/handlers_org.go:21), and `meHandlers.me` (backend/api/handlers_me.go:19, reached at `GET /api/auth/me`). The falsifying command, excluding the generated package, is `grep -rn error.:.unauthorized --include=*.go backend/api/`. The third is listed for completeness only: `getCurrentUser` declares its 401 against `PlainTextError`, not this schema, and lives in paths/auth.yaml, which PAC-23 does not own and does not touch.
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
 * nlp.ParseResult. snake_case - the only snake_case RESPONSE body in this domain. Every field except `intent` carries `omitempty`, so absent members are normal.
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
   * Go `time.Time` with omitempty - which does NOT omit the zero time, so a missing value may still serialise as `0001-01-01T00:00:00Z`.
   */
  range_start?: string;
  /**
   * Same zero-time caveat as range_start.
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
   * Set (with intent `unknown`) when the LLM call fails or returns invalid JSON - still HTTP 200.
   */
  error?: string;
  suggested_slots?: Array<SuggestedSlot>;
  participant_infos?: Array<ParticipantInfo>;
}
export type NLPConfirmRequest = ({
  parse_result: NLPParseResult;
  /**
   * Index into `parse_result.suggested_slots`. Only the upper bound is checked; see the operation's x-uncertain note about negatives.
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
 * calendar.GenericEvent serialized WITHOUT json tags — capitalized Go field names. All four keys are always present.
 */
export type PersonalCalendarPreviewEvent = { ID: string, Title: string, Start: string, End: string }
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
 * How many accepted hosts had a loadable calendar token when the page was rendered. `total` counts accepted hosts whose user record resolved; `checked` counts those with a usable OAuth token. Always present, even as {0,0}.
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
   * At most 3 entries; `null` when no candidate survived.
   */
  slots: (Array<SuggestedSlot> | null);
}
/**
 * The JSON error shape produced by api.writeError (handlers_settings.go:206). Emitted with `Content-Type: application/json`. Handlers that use the Go stdlib `http.Error` instead return text/plain and do NOT use this shape; each response above says which applies. The 401 from requireAuth is a hybrid: the body text is `{"error":"unauthorized"}` but it is written through http.Error, which overwrites the Content-Type to `text/plain; charset=utf-8`.
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
 * Echo of the status that was written. The only body accept/decline ever returns.
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
   * Compared case-insensitively after trimming during validation (`backend/api/handlers_settings.go:128`), but the persisted value is whatever was sent.
   * `''` is in the enum because the server accepts it (`:129`, `mode != "" && mode != "all_days" && mode != "by_day"`) and because the contract must describe what is, not what should be (factory §7). Revision 1 of this contract omitted `''` while the description two lines below said it was accepted - a schema disagreeing with its own prose. It is accepted on write ONLY when `days` is empty; otherwise it is the existing 400 `workingHours.mode is required when day-specific hours are provided` (`:132-134`). That conditional is cross-property and OpenAPI cannot express it, so it stays a documented 400 rather than becoming a schema narrowing - narrowing here would be a NEW rejection, and spec §6 requires both tests in `backend/api/handlers_settings_schedule_test.go` to keep passing unchanged.
   * A GET never returns `''`, because normalisation rewrites it.
   */
  mode: ("" | "all_days" | "by_day");
  default: DaySchedule;
  /**
   * Keys are lowercase English weekday names, and PAC-24 makes that a schema constraint rather than a warning. `validateSchedulePreferences` lowercases before checking (`backend/api/handlers_settings.go:145`, `validScheduleWeekdays[strings.ToLower(day)]`), so `"Monday"` passes validation and is stored - but `WorkWindow` looks the day up as `strings.ToLower(day.Weekday().String())` (`backend/storage/settings.go:117`), so the entry can never match and the user's Monday hours are silently inert forever. Under the whole-object replace this is worse than it was: the write that installs the dead key also deletes the live key it replaced. `propertyNames` makes the dead key a 400 instead of a document that says so. In `by_day` mode a missing weekday means "not working".
   */
  days: Record<string, DaySchedule>;
}
/**
 * The property set shared by the GET response (`Settings`) and the PATCH / PATCH body (`SettingsUpdate`). Property names come straight from the json tags on storage.Settings - camelCase throughout. `ID`, `MicrosoftTokens` and `ZoomTokens` are `json:"-"` and never appear on the wire.
 * Two properties are asymmetric and are marked as such rather than being split into two schemas, so that a document read from GET can be submitted back unchanged (which is what the shipped frontend does): `llmApiKey` is `writeOnly` - accepted on write, never returned; and `llmApiKeySet` and `updatedAt` are `readOnly` - returned, accepted and ignored on write. Everything else is symmetric.
 * No property other than `llmApiKey` carries omitempty, so the GET response always contains all of them.
 */
export type SettingsFields = Partial<{
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
   * Empty string is explicitly allowed by validLLMProviders.
   */
  llmProvider: ("" | "openai" | "anthropic" | "ollama" | "bedrock" | "azure_openai" | "vertex");
  /**
   * Provider default applied at call time when empty: `gpt-4o-mini` (openai), `claude-haiku-4-5-20251001` (anthropic).
   */
  llmModel: string;
  /**
   * WRITE-ONLY. Accepted on write; never present in any response from any operation (spec AC-11). Required for openai and anthropic.
   * Under the merge semantics this needs no special case: omit it and the stored key is unchanged; send `""` and it is cleared; send a value and it is replaced (spec AC-13). There is no way to read it back, by design - someone who loses their key re-enters it. Do not add a reveal affordance later.
   * Before PAC-24 it was returned in cleartext from a row shared by every authenticated account (API-002 + API-003), and wiped by any write that omitted it (API-004). Every key configured before this ships must be treated as compromised and rotated - closing the read path does not un-expose it (spec §5, OQ-5).
   */
  llmApiKey: string;
  /**
   * `true` exactly when the stored key is non-empty. This is the only thing a reader learns about the key, and it is what lets a client distinguish "not configured" from "configured" without disclosing anything (spec AC-12).
   * `readOnly`, so a client that submits back a document it just read may include it; it is accepted and ignored (spec AC-10). It is NOT the way to clear a key - send `llmApiKey: ""` for that.
   */
  llmApiKeySet: boolean;
  /**
   * Also the legacy fallback for the ollama base URL.
   */
  llmBaseUrl: string;
  awsRegion: string;
  awsProfile: string;
  bedrockModel: string;
  azureEndpoint: string;
  azureDeployment: string;
  azureApiVersion: string;
  gcpProject: string;
  gcpLocation: string;
  vertexModel: string;
  /**
   * Falls back to llmBaseUrl, then `http://localhost:11434`.
   */
  ollamaBaseUrl: string;
  /**
   * Falls back to llmModel, then `llama3.2`.
   */
  ollamaModel: string;
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
   * Server-managed (NOW() on every write). May be present in a request body - a client submitting back a document it just read will include it - and is ignored (spec AC-10).
   */
  updatedAt: string;
}>
export type Settings = SettingsFields
export type SettingsUpdate = SettingsFields
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
   * "generic" for consumer/unparseable domains, "sso" when a provider row
   * exists for the domain, "microsoft" from a live tenant probe against
   * login.microsoftonline.com (2s timeout, 1h cache), else "google".
   */
  type: ("google" | "microsoft" | "sso" | "generic");
  /**
   * Display name of the SSO provider. Omitted unless type == "sso".
   */
  provider_name?: string;
  /**
   * Relative path `/api/auth/sso/<domain>`. Omitted unless type == "sso".
   */
  redirect_url?: string;
}
/**
 * Anonymous struct in ssoHandlers.createSSOProvider.
 */
export type SsoProviderCreateRequest = {
  /**
   * Must match the caller's org domain or the request is 403'd.
   */
  domain: string;
  provider_name: string;
  /**
   * "saml" is accepted and stored, but /api/auth/sso/{domain} rejects it
   * with 501 — a SAML row can be created that can never be used to log in.
   */
  provider_type: ("oidc" | "saml");
  oidc_issuer?: string;
  oidc_client_id?: string;
  oidc_client_secret?: string;
  saml_entry_point?: string;
  saml_issuer?: string;
  saml_cert?: string;
}
/**
 * storage.SSOProvider (backend/storage/sso_providers.go) marshalled directly.
 * The struct has NO json tags, so encoding/json emits the exact Go field
 * names below — PascalCase, and including the client secret and SAML cert.
 */
export type SsoProviderResponse = {
  ID: string;
  Domain: string;
  ProviderName: string;
  ProviderType: ("oidc" | "saml");
  Enabled: boolean;
  OIDCIssuer: string;
  OIDCClientID: string;
  /**
   * Returned in plaintext to any org member by both POST and GET /api/admin/sso. Documented because it is what the code does, not because it is intended.
   */
  OIDCClientSecret: string;
  SAMLEntryPoint: string;
  SAMLIssuer: string;
  SAMLCert: string;
  CreatedAt: string;
  UpdatedAt: string;
}
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
   * JSON null (not []) when the team has no members — the slice is appended to without pre-initialisation and has no omitempty.
   */
  member_breakdown: (Array<MemberAnalyticsSummary> | null);
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
   * JSON null (not []) when the team has no members or the query failed.
   */
  members: (Array<TeamMember> | null);
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
 * A deliberately narrow projection — NOT a TeamInvite. Built as a map[string]string, so every value is a plain string and a missing team or inviter yields "" rather than null.
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
   * Destructive when present: every non-owner host row is deleted first, then these emails are added as `pending`. Unknown emails are skipped silently.
   */
  co_host_emails: Array<string>;
}>
/**
 * storage.UserProfile marshalled with no json tags — Go field names verbatim. Do not rename these keys in the spec; they are literally what the server sends.
 */
export type UserProfileGoStruct = {
  UserID: string;
  IsManager: boolean;
  DetectedAt: (string | null);
  /**
   * Member-side consent flag, defaulting to true. No endpoint in this domain sets it.
   */
  AnalyticsSharedWithManager: boolean;
  /**
   * The value read BEFORE the upsert, not the newly written now().
   */
  UpdatedAt: string;
}

    // </Schemas>
    }
  
  export namespace Endpoints {
  // <Endpoints>
  
  /**
 * Upsert keyed on domain. The caller must belong to an org and the supplied
 * domain must match that org's domain (domain.DomainMatchesOrg).
 * `enabled` is always forced to true — there is no way to disable a provider
 * through this API.
 */
export type post_CreateSsoProvider = {
      method: "POST",
      path: "/api/admin/sso",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        
        
        
        body:  Schemas.SsoProviderCreateRequest,
          }
      responses: {201: Schemas.SsoProviderResponse,
400: Schemas.ErrorResponse,
401: Schemas.PlainTextError,
403: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
export type get_ListSsoProviders = {
      method: "GET",
      path: "/api/admin/sso",
      requestFormat: "json",
      responseFormat: "json",
      parameters: never,
      responses: {200: Array<Schemas.SsoProviderResponse>,
401: Schemas.PlainTextError,
403: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Deletes by domain after checking the domain belongs to the caller's org.
 * Deleting a domain that has no provider row still returns 204 — the
 * storage layer does not check rows-affected.
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
403: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Live Google Calendar read for the Monday-anchored week containing `date`.
 * Only events with `start.dateTime` set (all-day events skipped) and at least one
 * attendee are included; events matching a focus block or a habit occurrence's
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
401: Schemas.ErrorResponse,
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
 * Items are the RAW `storage.AnalyticsWeek` struct, which differs from
 * /api/analytics/week: `week_start` is a full RFC3339 timestamp here, and there is
 * no `breakdown` field.
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
 * The response is a hand-built map, not the raw `storage.AnalyticsWeek` struct, so
 * its `week_start` is a plain date and it carries an extra `breakdown` array.
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
404: Schemas.ErrorResponse,
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
401: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Returns the calling user's own `audit_log` rows, ordered by `created_at DESC, id DESC`. The query is scoped by the authenticated user id that `requireAuth` puts in the request context under `auth.UserIDKey` (backend/api/middleware.go) and that handlers read back with `userIDFromCtx` or `auth.UserIDFromContext`; there is no parameter that widens it, and no caller can address another user's entries.
 * 
 * A NOTE ON CITATIONS, because two revisions of this contract have now been rejected for stale ones. Every `file:line` below was re-derived against the tree at revision 4 **after** regenerating the bundle and `backend/api/gen/paceday.gen.go`. Three kinds of reference are deliberately NOT given as line numbers: anything in `backend/api/gen/paceday.gen.go` is cited by Go **symbol**, because this very description is emitted into that file as a doc comment and so editing it moves every line it could cite; anything in `docs/factory/PAC-23-plan.md` is cited by **section**, because that document is edited by other features; and anything in the `Makefile` is cited by **target**. Where a claim is cheap to check by command, the command is given instead of a citation.
 * 
 * Entries recorded before the PAC-23 migration have no subject and are therefore returned to **nobody**. They are retained rather than deleted — they cannot be attributed, and inferring an audit record's subject after the fact is not acceptable (spec §3.3). How "no subject" is represented in storage is the migration's business: a conforming server returns an entry only to its subject, and an entry with no subject has none. This description deliberately no longer spells that predicate `user_id IS NULL`, because the identification "no subject ⟺ pre-migration" is exact under only one of two delete actions that docs/factory/PAC-23-plan.md §7 item 1 leaves open — `ON DELETE CASCADE`, as drafted in that plan's §2 up-migration step 1 (`ALTER TABLE audit_log ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE`), keeps it exact, while `ON DELETE SET NULL` would give a deleted user's rows the same marker and make the sentence false. The contract must not be the artifact that goes stale when a plan question resolves. The observable effect is the same either way: on the release of PAC-23 every user's log appears to start empty and refills as they use the product.
 * 
 * This log is a **per-user activity feed**, not a security audit trail: it has no authentication or configuration events, no client address, and no actor distinct from the subject, and it is readable only by its subject. See docs/specs/PAC-23.md §3.5 — do not build anything on it that needs a third party to be able to review it.
 * 
 * The subject of an entry is whose calendar it happened to, which is not necessarily who caused it. Every entry this operation can return today has actor = subject, and that is true for a narrow reason worth stating: the one path where they differ writes no entry at all. `POST /api/book/{slug}` is registered outside the `requireAuth` group (backend/api/routes.go:27 — `:26` is the `GET .../slots` route, not this one) and reaches `calClient.CreateEvent` at backend/engine/booking.go:267, so an unauthenticated third party puts a real event on a host's calendar and nothing is recorded. If booking is ever recorded — PAC-23 does not add it — the subject is the host, which is already in scope as `h.UserID` at booking.go:250-269; the booker is not a user of this system and gets no identity here, because a fabricated actor in a record whose purpose is attribution is worse than an absent one (spec §3.2). The feed would then say that a meeting appeared on your calendar and would still be unable to say who put it there. Do not read the absence of an actor field as a claim that the subject acted.
 * 
 * The scoping guarantees who may READ a row, not that the row's contents originated with the reader. `details` carries free text supplied by whoever made the request, at four of the seven writers: a meeting title from the request body at backend/engine/smart_schedule.go:323 and backend/api/handlers_schedule.go:188, a typed prompt at backend/nlp/parser.go:221, and a client-supplied `event_id` copied unvalidated from the request body at backend/engine/compression.go:178 — the fourth is the one the `details` schema below calls the worst of them, because the value can carry JSON structure rather than merely a stray quote. So a writer whose actor is not the subject would place a third party's words in the subject's feed. No writer does that today — all seven have actor = subject — but this contract is the artifact that makes subject ≠ actor a legal shape, so it states the rule rather than leaving the direction unguarded: a writer whose actor is not the subject must not put text supplied by the actor in `details`; where that is unavoidable the entry needs the redacted projection spec §3.5 describes, not this operation. Spec AC-3 forbids only the mirror image, another user's text reaching a non-subject.
 * 
 * There is no pagination — no `offset`, no cursor, no `before`. Entries older than the most recent `limit` (at most 500) cannot be retrieved through this API at all, and because this operation is the only reader of the table in the whole codebase (one SELECT, backend/storage/audit_log.go:19; one INSERT, backend/storage/focus_blocks.go:61-63; no view, no join, no second reader) they cannot be retrieved any other way either.
 * 
 * WHICH SERVER ANSWERS THIS, because the `limit` description below depends on it: the hand-written `auditHandler` (backend/api/handlers_audit.go:12-23), registered directly on chi at backend/api/routes.go:179. `backend/api/gen/paceday.gen.go` — generated from this bundle, committed, and drift-checked by the `openapi-check` make target — also contains a complete server surface for this operation (`ServerInterface.ListAuditEntries`, `ListAuditEntriesParams`, `ServerInterfaceWrapper.ListAuditEntries` binding `limit`, a `/api/audit` route inside `HandlerWithOptions` (which `HandlerFromMux` delegates to), and `ListAuditEntries200JSONResponse` / `401TextResponse` / `500JSONResponse`), and **none of it is mounted**. One command falsifies that claim rather than leaving a reader to trust it: `grep -rn "HandlerFromMux\|gen\.ServerInterface\|gen\.Strict\|api/gen" --include=*.go backend/ | grep -v "^backend/api/gen/"` — it returns nothing today. `contracts/openapi/MIGRATION.md` records this operation as `handwritten`, and its `notes` cell carries the precondition for moving it; PAC-23 does not move it (contracts/features/PAC-23.md §6). Where the two servers would answer the same request differently, the `limit` description says so explicitly, and it is the only place in this contract where they do.
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
500: Schemas.PlainTextError,
},
      responseHeaders: {302: { Location: string, "Set-Cookie": string },
},
    }
/**
 * Verifies `sso_state` (both the random half and the embedded domain),
 * re-discovers the OIDC client, exchanges the code, upserts the user with
 * provider="sso", and issues the JWT cookie.
 * Inconsistent error encoding: the 404 uses the JSON helper while every
 * other failure in this handler uses http.Error (text/plain).
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
404: Schemas.ErrorResponse,
500: Schemas.PlainTextError,
},
      responseHeaders: {302: { Location: string, "Set-Cookie": string },
},
    }
/**
 * Rate limited to 20 requests per minute per client IP (sliding window,
 * in-process map keyed by X-Real-IP / first X-Forwarded-For / RemoteAddr).
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
 * Deletes the current user's OAuth token row and expires the `auth_token`
 * cookie — i.e. this also logs the user out, which the name does not suggest.
 */
export type delete_DisconnectCalendar = {
      method: "DELETE",
      path: "/api/auth/disconnect",
      requestFormat: "json",
      responseFormat: "json",
      parameters: never,
      responses: {204: unknown,
401: Schemas.PlainTextError,
500: Schemas.PlainTextError,
},
      responseHeaders: {204: { "Set-Cookie": string },
},
    }
/**
 * Sets an httpOnly `oauth_state` cookie (MaxAge 300, SameSite=Lax) and
 * redirects to Google's consent screen. Never returns a body.
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
 * out with an already-expired token returns 401 rather than succeeding.
 */
export type post_Logout = {
      method: "POST",
      path: "/api/auth/logout",
      requestFormat: "json",
      responseFormat: "json",
      parameters: never,
      responses: {200: unknown,
401: Schemas.PlainTextError,
},
      responseHeaders: {200: { "Set-Cookie": string },
},
    }
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
 * Validates `ms_oauth_state`, exchanges the code, saves the Microsoft token
 * on the GLOBAL settings row, best-effort fetches the Graph profile and
 * upserts the user, then redirects.
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
500: Schemas.PlainTextError,
503: Schemas.ErrorResponse,
},
      responseHeaders: {302: { Location: string, "Set-Cookie": string },
},
    }
/**
 * Looks up the SSO provider row for `{domain}`, builds the OIDC redirect
 * URL as `os.Getenv("APP_URL") + "/api/auth/callback/oidc/" + domain`, sets
 * an `sso_state` cookie of the form `<state>|<domain>`, and redirects.
 */
export type get_StartSsoLogin = {
      method: "GET",
      path: "/api/auth/sso/{domain}",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
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
 * Sets a 300-second HttpOnly `zoom_oauth_state` cookie (SameSite=Lax, Path=/) and 302-redirects to Zoom's authorize endpoint. Not a JSON endpoint.
 */
export type get_StartZoomOAuth = {
      method: "GET",
      path: "/api/auth/zoom",
      requestFormat: "json",
      responseFormat: "json",
      parameters: never,
      responses: {302: unknown,
503: Schemas.BookingError,
},
      responseHeaders: {302: { Location: string, "Set-Cookie": string },
},
    }
/**
 * Compares `state` against the `zoom_oauth_state` cookie, clears that cookie, exchanges `code` for tokens, persists them, then 302-redirects to the app root. Error bodies here use `http.Error`, i.e. `text/plain; charset=utf-8` plain text, NOT the shared JSON error envelope.
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
500: string,
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
500: Schemas.BookingError,
},
      
    }
/**
 * Two distinct modes. With `date`: `slots` is populated and `available_dates` is always the empty array. Without `date`: the handler probes the next 60 calendar days from `time.Now()` and returns those day strings in `available_dates`, with `slots` always the empty array. Both keys are always present in both modes.
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
500: Schemas.BookingError,
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
401: Schemas.PlainTextError,
500: Schemas.PlainTextError,
},
      
    }
/**
 * Thin passthrough over calendar.CalendarClient.GetFreeBusy. NOTE: the response is `map[string][]calendar.TimeSlot` and calendar.TimeSlot (backend/calendar/freebusy.go:10) has NO json struct tags, so the window keys serialize as Go field names — `Start` / `End`, capitalized. This is NOT the same shape as POST /api/freebusy. No frontend code calls this endpoint.
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
401: Schemas.PlainTextError,
500: Schemas.PlainTextError,
},
      
    }
/**
 * Provider comes from stored settings (`ConferencingProvider`), not from the request. No field validation at all: a missing `title`, `start` or `end` decodes to the Go zero value and is forwarded to the provider as-is. Not referenced anywhere in the frontend.
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
 * Order is fixed: google_meet (only when Google OAuth env is configured), zoom (only when Zoom env is configured), teams (only when Microsoft env is configured), then `custom`, which is always last and always `connected: true`. Length is therefore 1..4.
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
 * Takes no request body. Tokens are server-wide, not per user.
 */
export type post_DisconnectZoom = {
      method: "POST",
      path: "/api/conference/zoom/disconnect",
      requestFormat: "json",
      responseFormat: "json",
      parameters: never,
      responses: {204: unknown,
401: "{\"error\":\"unauthorized\"}\n",
500: Schemas.BookingError,
},
      
    }
/**
 * Fetches the event, applies only the non-null fields from the body, and writes it back with calendar.CalendarClient.UpdateEvent. Every field is a Go pointer, so an ABSENT key and an explicit `null` are indistinguishable and both mean "leave unchanged". `start` / `end` are decoded as time.Time and re-emitted as UTC RFC3339 `dateTime` — patching either one CONVERTS AN ALL-DAY EVENT INTO A TIMED EVENT. Supplying `attendees` REPLACES the whole attendee list with email-only entries, discarding display names and RSVP status, and also discards any room resource attendee that the previous list contained.
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
      responses: {200: Schemas.GoogleCalendarEventRaw,
400: Schemas.ErrorResponse,
401: Schemas.ErrorResponse,
404: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Deletes the event from the user's primary calendar. The handler reads no query parameters — in particular the `send_updates` parameter the frontend sends is ignored.
 */
export type delete_DeleteEvent = {
      method: "DELETE",
      path: "/api/events/{id}",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        path:  { id: string },
        
        
        
          }
      responses: {204: unknown,
401: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Four branches. (1) The event already has a conference: returns 200 with the EXISTING link when the stored provider matches, or when `provider` is `custom`; otherwise 409. (2) `custom`: stores the supplied `url` in the event's private extended properties. (3) `google_meet`: asks Google to mint a Meet link. (4) anything else (`zoom`, `teams`): creates a meeting through the provider factory and stores the join URL in extended properties.
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
401: Schemas.BookingError,
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
401: Schemas.BookingError,
404: Schemas.BookingError,
500: Schemas.BookingError,
},
      
    }
/**
 * Returns rows from the `focus_blocks` table where `date >= week AND date < week+7days`, ordered by start_time. NOTE: `storage.FocusBlock` carries no json struct tags, so the encoder emits Go field names (`ID`, `GoogleEventID`, `StartTime`, `EndTime`, `Date`, `CreatedAt`) - not snake_case and not camelCase.
 */
export type get_ListFocusBlocks = {
      method: "GET",
      path: "/api/focus/blocks",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            query?:  Partial<{ week: string }>,
        
        
        
        
          }
      responses: {200: (Array<Schemas.FocusBlockRecord> | null),
400: Schemas.SchedulingErrorResponse,
500: string,
},
      
    }
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
500: string,
},
      
    }
/**
 * Creates focus blocks for the target week. The request body is decoded best-effort: if the body is absent or is malformed JSON the handler silently falls back to `week = ""` (i.e. the current week) and returns 200 - it does NOT return 400 for malformed JSON. A 400 is only produced when `week` decodes to a non-empty string that fails `time.Parse("2006-01-02", ...)`.
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
500: string,
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
500: Schemas.PlainTextError,
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
500: string,
502: string,
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
503: string,
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
500: string,
502: string,
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
503: string,
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
 * Probes a provider configuration by issuing a fixed completion (system "You are a helpful assistant.", user "Say hello").
 * PAC-24 resolves API-037. **THE DESTINATION IS NEVER SUPPLIED BY THE CALLER.** Every value that contributes to the URL this server requests — `llmBaseUrl`, `ollamaBaseUrl`, `azureEndpoint`, `azureDeployment`, `azureApiVersion`, `awsRegion`, `awsProfile`, `bedrockModel`, `gcpProject`, `gcpLocation`, `vertexModel` — is read from the CALLER'S OWN stored settings and from nowhere else. The request body may carry only `llmProvider`, `llmModel` and `llmApiKey`, none of which reaches a URL (`backend/nlp/llm_factory.go:13-58`: `llmModel` is consulted only by the `openai` and `anthropic` branches, where it is a JSON body field, and `llmApiKey` only as an `Authorization` header value).
 * This is a security property of the contract, not a convenience, and the invariant is: **a credential the caller did not supply is never sent to a destination the caller did supply — because the caller cannot supply a destination at all.** An earlier draft of this contract let a body override each endpoint property individually with per-property fallback to the stored values. That let `{"llmProvider":"openai","llmBaseUrl":"https://attacker.example"}` pair a caller-chosen host with the stored key: `nlp.NewLLMClientFromSettings` builds `OpenAIClient{APIKey: s.LLMAPIKey, BaseURL: s.LLMBaseURL}` (`backend/nlp/llm_factory.go:29`) and `OpenAIClient.Complete` POSTs to `base + "/v1/chat/completions"` with `Authorization: Bearer <key>` (`backend/nlp/parser.go:31,43`), so the stored key would leave the deployment and the 200/502 would confirm delivery. An all-or-nothing body (supply the endpoint AND the key together) does not close it either: on the `azure_openai`, `bedrock` and `vertex` branches the credential is AMBIENT and cannot be submitted — `AzureOpenAIClient.Complete` mints a token with `azidentity.NewDefaultAzureCredential` and sends it as `Authorization: Bearer <token>` to `c.Endpoint` (`backend/nlp/llm_azure_openai.go:28-50`) — so any submitted endpoint is necessarily paired with a credential the caller did not supply. Refusing submitted destinations outright is the only shape that holds for all six providers.
 * What the body IS for: verifying a key that has not been saved, now that a stored key can never be read back (see `SettingsFields.llmApiKey`), and naming which provider the result is about (spec AC-15). An absent body, or `{}`, probes the caller's stored configuration entirely — the pre-PAC-24 behaviour.
 * Before PAC-24 the handler never read r.Body at all and always probed the SINGLETON settings row, so this operation reported on the deployment's saved configuration rather than on the caller's (API-002, API-037).
 * No response on any status carries the submitted or the stored `llmApiKey`. The provider's own error text is still echoed on 502 — that is API-054 / T8 and is NOT resolved here; the narrower guarantee PAC-24 adds is that the key itself never appears (spec AC-14).
 * NOT resolved here, and recorded rather than silently fixed (factory §7): a caller can still steer this probe indirectly by first writing `llmBaseUrl` or `azureEndpoint` into their OWN settings via `PATCH /api/settings` and then probing. That path exists today via the pre-PAC-24 `PUT /api/settings` plus this operation, PAC-24 neither opens nor closes it (the write is now `PATCH`), and on the ambient-credential providers it reaches a deployment-wide cloud identity rather than the caller's own key. It needs its own issue (allow-listing or scheme/host restriction on the endpoint properties); see `contracts/features/PAC-24.md` §2.
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
500: (Schemas.SchedulingErrorResponse | string),
502: Schemas.SchedulingErrorResponse,
},
      
    }
/**
 * Returns exactly 12 week buckets per member (months=3 is hard-coded and numWeeks = months*4), ordered NEWEST FIRST: weeks[0].week_start == the resolved `week`, each subsequent entry is 7 days earlier. A member with no data still gets 12 buckets of zeroes with data_available=false. `members` is always an array, never null.
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
500: string,
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
403: Schemas.ErrorResponse,
500: string,
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
500: string,
},
      
    }
/**
 * The engine always computes gaps over the manager's GLOBAL roster; when `team_id` is supplied the handler post-filters that list to emails present in the team-scoped roster (case-insensitive). Members with cadence="none" never appear. A member with a recorded 1:1 occurrence in the next 14 days is suppressed. Sorted by days_overdue descending. `gaps` is always an array, never null.
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
500: string,
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
500: string,
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
500: string,
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
500: string,
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
500: string,
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
      responses: {200: (Schemas.ManagerTeamMemberGoStruct | null),
400: Schemas.ErrorResponse,
403: Schemas.ErrorResponse,
404: string,
422: Schemas.ErrorResponse,
500: string,
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
500: string,
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
500: string,
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
500: string,
},
      
    }
/**
 * The whole ParseResult from /api/nlp/parse is echoed back. Only `title`, `attendees`, `constraints` (mapped to the event Description) and `suggested_slots[selected_slot_index]` are used; `duration_minutes`, `range_start`, `range_end`, `preferred_times` and `avoid_times` are ignored here. On success an audit row `nlp_confirmed` is written and the raw Google Calendar event is returned.
 */
export type post_ConfirmNaturalLanguage = {
      method: "POST",
      path: "/api/nlp/confirm",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        
        
        
        body:  Schemas.NLPConfirmRequest,
          }
      responses: {200: Schemas.GoogleCalendarEvent,
400: Schemas.SchedulingErrorResponse,
500: string,
},
      
    }
/**
 * A malformed body and an empty `text` are collapsed into the same 400 (`missing text field`). Note that LLM-level failures inside the parser do NOT surface as 5xx: the parser returns `{"intent":"unknown","error":"..."}` with HTTP 200. A 500 only occurs when Parse() itself returns a non-nil error.
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
500: string,
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
500: Schemas.MiddlewareUnauthorized,
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
 * Runs engine.PersonalBlocker.Sync, stamps `last_synced_at = NOW()`, then re-reads and returns the calendar. Takes no request body.
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
401: Schemas.MiddlewareUnauthorized,
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
401: Schemas.ErrorResponse,
500: Schemas.ErrorResponse,
},
      
    }
/**
 * Body decode errors are swallowed (`_ = json.NewDecoder(...).Decode(&body)`), so malformed JSON behaves like an empty body and yields 200 for today. If `week` is set it wins over `date`: the handler snaps the parsed date to Monday (startOfWeek) and iterates Mon..Fri, appending one CompressionResult per day and SILENTLY SKIPPING days whose engine call errors - so week mode never returns 500, and can return `null` if all five days error. If `week` is empty, `date` (or today) produces a single-element array and an engine error becomes a 500.
 */
export type post_PreviewCompression = {
      method: "POST",
      path: "/api/schedule/compress",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        
        
        
        body:  Schemas.CompressionRequest,
          }
      responses: {200: (Array<Schemas.CompressionResult> | null),
400: Schemas.SchedulingErrorResponse,
500: string,
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
500: string,
},
      
    }
/**
 * `start` and `end` must both parse as RFC3339. The handler builds an `engine.ScheduleRequest` WITHOUT `duration_minutes` (the slot carries the times) and calls SmartScheduler.CreateMeeting, which refuses out-of-hours creation once the weekly allowance is spent - that refusal surfaces as a 500 with the text `out-of-hours meeting allowance reached`, not a 4xx. On success an audit row `meeting_created` is written. The response body is the raw Google Calendar API `calendar/v3.Event` struct as returned by the calendar client - it is NOT normalised into the app's own event shape.
 */
export type post_CreateScheduledMeeting = {
      method: "POST",
      path: "/api/schedule/create",
      requestFormat: "json",
      responseFormat: "json",
      parameters: {
            
        
        
        
        body:  Schemas.ScheduleCreateRequest,
          }
      responses: {200: Schemas.GoogleCalendarEvent,
400: Schemas.SchedulingErrorResponse,
500: string,
},
      
    }
/**
 * `range_start` and `range_end` are both mandatory and must parse as RFC3339; either one failing yields a single 400. `duration_minutes`, `attendees` and `title` are optional as far as the handler is concerned (no validation) - `duration_minutes: 0` produces zero-length candidate slots rather than an error. The engine walks candidate starts in 30-minute steps (engine/smart_schedule.go: `t = t.Add(30 * time.Minute)`) and returns at most 3 slots, each at least 1h apart (pickTopUnique(candidates, 3, time.Hour)).
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
500: string,
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
 * `{id}` is the SCHEDULING LINK id, not the invite/host-row id -- the handler runs `UPDATE scheduling_link_hosts SET status=... WHERE link_id=$1 AND user_id=$2`. This matches the `link_id` field of the invite list payload. The UPDATE affecting zero rows is NOT an error: a caller with no invite for that link still gets 200.
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
500: Schemas.BookingError,
},
      
    }
/**
 * Same handler as accept, with status `declined`. `{id}` is the scheduling-link id.
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
 * No ownership or membership check: any authenticated user who knows the UUID receives the full link including every host's email, name and avatar. `is_owner` is computed against the caller and `my_status` is only emitted when the caller is one of the hosts.
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
 * Every field is optional; absent fields keep their stored value. The whole merged record is re-validated, so a patch can fail 422 on a field it did not touch. When `co_host_emails` is present (even `[]`) ALL non-owner hosts are deleted first, then the listed emails are re-added as `pending` -- accepted co-hosts are silently reset to pending.
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
 * routes.go:166 binds the SAME `slh.acceptInvite` handler already bound at `/host-invites/{id}/accept` (routes.go:159). Because both handlers key on the link id, the two paths are exactly equivalent -- this is a second spelling of the same operation, not a different resource. The frontend only uses the `/host-invites/...` form.
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
 * Equivalent to POST /api/scheduling-links/host-invites/{id}/decline (same handler, same key).
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
500: Schemas.BookingError,
},
      
    }
/**
 * The invitee must already have an account; the email is lowercased and trimmed. Upsert on (link_id, user_id), so re-inviting an accepted host resets them to `pending`. Response is the raw `storage.LinkHost` row, not the host DTO used inside SchedulingLink.
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
      responses: {201: Schemas.SchedulingLinkHostRecord,
400: Schemas.BookingError,
401: "{\"error\":\"unauthorized\"}\n",
403: Schemas.BookingError,
404: Schemas.BookingError,
500: Schemas.BookingError,
},
      
    }
/**
 * Deletes the caller's `scheduling_link_hosts` row. Deleting zero rows is not an error, so a non-host caller also gets 204. The owner is rejected with 400.
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
 * Before PAC-24 this read `WHERE id = 1` - a row shared by every authenticated caller, which after migration 018's backfill is the earliest-created user's own row - and returned `llmApiKey` in cleartext (API-002, API-003).
 */
export type get_GetSettings = {
      method: "GET",
      path: "/api/settings",
      requestFormat: "json",
      responseFormat: "json",
      parameters: never,
      responses: {200: Schemas.Settings,
500: string,
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
 * * **`llmApiKeySet` and `updatedAt`** are `readOnly`. They may be present -
 *   a client that submits back a document it just read will include them -
 *   and are ignored (spec AC-10).
 * 
 * The response is a fresh read of the caller's row, so it reflects normalisation (e.g. `workingHours` defaulting) rather than the submitted body, and it does not contain `llmApiKey`.
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
500: string,
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
500: string,
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
500: string,
},
      
    }
/**
 * Builds the Slack Block Kit payload for the authenticated user at `time.Now()` and returns it. No request body is read. Nothing is sent to Slack and no Slack connection is required.
 * Before PAC-24 the day's content was the caller's but the recap configuration driving it (timezone, which sections to include) came from the singleton row, so a preview could omit sections the caller had enabled (API-002). Both now come from the caller's row.
 */
export type post_PreviewDailyRecap = {
      method: "POST",
      path: "/api/settings/daily-recap/preview",
      requestFormat: "json",
      responseFormat: "json",
      parameters: never,
      responses: {200: Schemas.DailyRecapPreview,
500: string,
},
      
    }
/**
 * Requires a stored `slack` workspace connection for the authenticated user. Destination comes from the CALLER'S OWN stored settings (`recapSendTo`, `recapChannelId`), not from the request - no request body is read. The Slack call is bounded by a 10s context timeout.
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
500: string,
502: string,
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
500: string,
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
500: string,
},
      
    }
/**
 * Despite the "(public)" comment on the handler, this route is registered inside the requireAuth group and therefore requires a valid JWT. Calls ExpireOldInvites first, so an invite past expires_at is reported as 410 "invite is expired" rather than 200. The response deliberately omits team_id, token and expires_at.
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
500: string,
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
500: string,
},
      
    }
/**
 * Membership required. `members` is the raw result of ListTeamMembers with its error discarded, ordered by joined_at ASC, and is JSON `null` (not []) whenever the list is empty or the query failed.
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
500: string,
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
      responses: {200: (Schemas.Team | null),
400: Schemas.ErrorResponse,
403: Schemas.ErrorResponse,
500: string,
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
500: string,
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
500: string,
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
500: string,
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
500: string,
},
      
    }
/**
 * Self-removal skips the ownership check entirely, so a team owner can remove themselves and leave the team ownerless. There is no last-owner guard here — the owner-protection rule lives only on DELETE /api/manager/team/members/{email}.
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
500: string,
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
500: string,
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
500: string,
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
500: string,
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
500: string,
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
patch: {
           "/api/events/{id}": Endpoints.patch_PatchEvent,
"/api/habits/{id}": Endpoints.patch_UpdateHabit,
"/api/habits/{id}/occurrences/{occurrenceId}": Endpoints.patch_UpdateHabitOccurrenceStatus,
"/api/manager/team/members/{email}": Endpoints.patch_PatchManagerTeamMember,
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
export type PatchEndpoints = EndpointByMethod["patch"]
    // </EndpointByMethod.Shorthands>
    