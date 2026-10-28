// @ts-nocheck
import type * as __TypedOpenapi from "./schemas.types.js";

  import { z } from "zod";

// <Schemas>
export type AINotConfigured = __TypedOpenapi.Schemas.AINotConfigured;
export const AINotConfigured = z.strictObject({ reason: z.enum(["off", "needs_key", "organization_unconfirmed", "nothing_configured", "provider_removed_organization_available", "provider_removed", "personal_keys_forbidden"]), provider: z.enum(["openai", "anthropic", "azure_openai", "bedrock", "vertex"]).optional(), enablers: z.array(z.enum(["user", "organization_admin"])).min(1).refine((arr) => new Set(arr).size === arr.length, { message: "uniqueItems" }), message: z.string().min(1) });

export type AIStatus = __TypedOpenapi.Schemas.AIStatus;
export const AIStatus = z.strictObject({ configured: z.boolean(), provider: z.enum(["openai", "anthropic", "azure_openai", "bedrock", "vertex"]).optional(), configuration: z.enum(["own", "organization"]).optional(), inOrganization: z.boolean(), notConfigured: AINotConfigured.optional() });

export type AddEventConferenceRequest = __TypedOpenapi.Schemas.AddEventConferenceRequest;
export const AddEventConferenceRequest = z.strictObject({ provider: z.enum(["google_meet", "zoom", "teams", "custom"]), url: z.url().optional() });

export type Cadence = __TypedOpenapi.Schemas.Cadence;
export const Cadence = z.enum(["weekly", "biweekly", "monthly", "custom", "none"]);

export type AddManagerMemberRequest = __TypedOpenapi.Schemas.AddManagerMemberRequest;
export const AddManagerMemberRequest = z.object({ email: z.email(), display_name: z.string().optional(), cadence: Cadence.optional(), cadence_custom_days: z.number().int().min(1).max(365).nullable().optional() }).catchall(z.unknown());

export type AnalyticsBreakdownEntry = __TypedOpenapi.Schemas.AnalyticsBreakdownEntry;
export const AnalyticsBreakdownEntry = z.strictObject({ category: z.enum(["meeting", "focus", "habit", "personal", "free"]), minutes: z.number().int(), percentage: z.number(), color: z.string() });

export type AnalyticsMeeting = __TypedOpenapi.Schemas.AnalyticsMeeting;
export const AnalyticsMeeting = z.strictObject({ title: z.string(), duration_minutes: z.number().int(), attendee_count: z.number().int().min(1), start_time: z.iso.datetime() });

export type AnalyticsRecomputeAck = __TypedOpenapi.Schemas.AnalyticsRecomputeAck;
export const AnalyticsRecomputeAck = z.strictObject({ status: z.literal("recompute accepted") });

export type MeetingTitle = __TypedOpenapi.Schemas.MeetingTitle;
export const MeetingTitle = z.strictObject({ title: z.string(), duration_minutes: z.number().int() });

export type AnalyticsWeekRow = __TypedOpenapi.Schemas.AnalyticsWeekRow;
export const AnalyticsWeekRow = z.strictObject({ id: z.uuid(), user_id: z.uuid(), week_start: z.iso.date(), total_working_minutes: z.number().int(), meeting_minutes: z.number().int(), focus_minutes: z.number().int(), habit_minutes: z.number().int(), buffer_minutes: z.number().int(), personal_minutes: z.number().int(), free_minutes: z.number().int(), meeting_count: z.number().int(), focus_block_count: z.number().int(), habit_completion_rate: z.number().min(0).max(100), largest_focus_block_minutes: z.number().int(), top_meeting_titles: z.array(MeetingTitle).max(5), focus_score: z.number().int().min(0).max(100), estimated_meeting_cost_minutes: z.number().int(), computed_at: z.iso.datetime() });

export type AnalyticsWeekWithBreakdown = __TypedOpenapi.Schemas.AnalyticsWeekWithBreakdown;
export const AnalyticsWeekWithBreakdown = z.strictObject({ id: z.uuid(), user_id: z.uuid(), week_start: z.iso.date(), total_working_minutes: z.number().int(), meeting_minutes: z.number().int(), focus_minutes: z.number().int(), habit_minutes: z.number().int(), buffer_minutes: z.number().int(), personal_minutes: z.number().int(), free_minutes: z.number().int(), meeting_count: z.number().int(), focus_block_count: z.number().int(), habit_completion_rate: z.number().min(0).max(100), largest_focus_block_minutes: z.number().int(), top_meeting_titles: z.array(MeetingTitle).max(5), focus_score: z.number().int().min(0).max(100), estimated_meeting_cost_minutes: z.number().int(), computed_at: z.iso.datetime(), breakdown: z.array(AnalyticsBreakdownEntry).min(5).max(5) });

export type AttendeeSuggestion = __TypedOpenapi.Schemas.AttendeeSuggestion;
export const AttendeeSuggestion = z.strictObject({ email: z.email(), name: z.string() });

export type AuditEntry = __TypedOpenapi.Schemas.AuditEntry;
export const AuditEntry = z.strictObject({ id: z.number().int(), action: z.enum(["focus_created", "focus_cleared", "meeting_scheduled", "meeting_moved", "meeting_created", "nlp_parsed", "nlp_confirmed", "connection_lost", "provider_disconnected", "revocation_unconfirmed"]), details: z.string(), created_at: z.iso.datetime() });

export type AuthStatusResponse = __TypedOpenapi.Schemas.AuthStatusResponse;
export const AuthStatusResponse = z.strictObject({ connected: z.boolean(), provider: z.enum(["google", "outlook", "webcal"]), email: z.string() });

export type BookingError = __TypedOpenapi.Schemas.BookingError;
export const BookingError = z.strictObject({ error: z.string() });

export type BookingRateLimitError = __TypedOpenapi.Schemas.BookingRateLimitError;
export const BookingRateLimitError = z.strictObject({ error: z.literal("rate limit exceeded") });

export type CadenceGap = __TypedOpenapi.Schemas.CadenceGap;
export const CadenceGap = z.strictObject({ member_email: z.email(), display_name: z.string(), cadence: Cadence, last_one_on_one_at: z.iso.datetime().nullable(), next_expected_by: z.iso.datetime(), days_overdue: z.number().int().min(0) });

export type CadenceGapList = __TypedOpenapi.Schemas.CadenceGapList;
export const CadenceGapList = z.strictObject({ gaps: z.array(CadenceGap) });

export type CalendarDisconnectUnsupported = __TypedOpenapi.Schemas.CalendarDisconnectUnsupported;
export const CalendarDisconnectUnsupported = z.strictObject({ error: z.literal("disconnecting this kind of calendar is not available yet"), provider: z.enum(["outlook", "webcal"]) });

export type CalendarEventAttendee = __TypedOpenapi.Schemas.CalendarEventAttendee;
export const CalendarEventAttendee = z.strictObject({ email: z.email(), name: z.string().optional(), rsvp: z.enum(["accepted", "declined", "tentative", "pending"]).optional(), organizer: z.boolean().optional() });

export type CalendarEventConference = __TypedOpenapi.Schemas.CalendarEventConference;
export const CalendarEventConference = z.strictObject({ provider: z.string(), url: z.url(), label: z.string().optional() });

export type CalendarEvent = __TypedOpenapi.Schemas.CalendarEvent;
export const CalendarEvent = z.strictObject({ id: z.string(), title: z.string(), start: z.string(), end: z.string(), color: z.enum(["#7986CB", "#33B679", "#8E24AA", "#E67C73", "#F6BF26", "#F4511E", "#039BE5", "#3F51B5", "#0B8043", "#D50000", "#616161"]).optional(), attendees: z.array(z.email()).optional(), attendee_details: z.array(CalendarEventAttendee).optional(), is_personal_block: z.boolean().optional(), description: z.string().optional(), location: z.string().optional(), conference: CalendarEventConference.optional() });

export type CalendarNotConnectedError = __TypedOpenapi.Schemas.CalendarNotConnectedError;
export const CalendarNotConnectedError = z.strictObject({ error: z.literal("calendar not connected") });

export type CalendarRoom = __TypedOpenapi.Schemas.CalendarRoom;
export const CalendarRoom = z.strictObject({ id: z.string(), name: z.string() });

export type CompressionApplyProposal = __TypedOpenapi.Schemas.CompressionApplyProposal;
export const CompressionApplyProposal = z.object({ event_id: z.string(), proposed_start: z.iso.datetime(), proposed_end: z.iso.datetime() }).partial().catchall(z.unknown());

export type CompressionApplyRequest = __TypedOpenapi.Schemas.CompressionApplyRequest;
export const CompressionApplyRequest = z.object({ proposals: z.array(CompressionApplyProposal) }).partial().catchall(z.unknown());

export type CompressionApplyResult = __TypedOpenapi.Schemas.CompressionApplyResult;
export const CompressionApplyResult = z.strictObject({ applied: z.array(z.string()), failed: z.array(z.string()) });

export type CompressionRequest = __TypedOpenapi.Schemas.CompressionRequest;
export const CompressionRequest = z.object({ date: z.iso.date(), week: z.iso.date() }).partial().catchall(z.unknown());

export type MoveProposal = __TypedOpenapi.Schemas.MoveProposal;
export const MoveProposal = z.strictObject({ eventId: z.string(), eventTitle: z.string(), currentStart: z.iso.datetime(), currentEnd: z.iso.datetime(), proposedStart: z.iso.datetime(), proposedEnd: z.iso.datetime(), reason: z.string(), focusGainMinutes: z.number().int() });

export type CompressionResult = __TypedOpenapi.Schemas.CompressionResult;
export const CompressionResult = z.strictObject({ date: z.string(), proposals: z.array(MoveProposal), totalFocusGainMinutes: z.number().int() });

export type ConferenceMeetingDetails = __TypedOpenapi.Schemas.ConferenceMeetingDetails;
export const ConferenceMeetingDetails = z.strictObject({ provider: z.enum(["meet", "zoom", "teams"]), joinUrl: z.string(), meetingId: z.string().optional(), password: z.string().optional() });

export type ConferenceProviderStatus = __TypedOpenapi.Schemas.ConferenceProviderStatus;
export const ConferenceProviderStatus = z.strictObject({ provider: z.enum(["google_meet", "zoom", "teams", "custom"]), connected: z.boolean(), email: z.string().optional(), enabled: z.boolean().optional(), auto_with: z.enum(["google", "outlook"]).optional() });

export type ConnectStartResponse = __TypedOpenapi.Schemas.ConnectStartResponse;
export const ConnectStartResponse = z.strictObject({ authorize_url: z.url() });

export type CreateConferenceRequest = __TypedOpenapi.Schemas.CreateConferenceRequest;
export const CreateConferenceRequest = z.strictObject({ title: z.string().min(1).regex(new RegExp("\\S")), start: z.iso.datetime(), end: z.iso.datetime() });

export type CreatePublicBookingRequest = __TypedOpenapi.Schemas.CreatePublicBookingRequest;
export const CreatePublicBookingRequest = z.strictObject({ name: z.string().min(1), email: z.string().min(1), start: z.iso.datetime(), end: z.iso.datetime().optional(), notes: z.string().optional(), duration: z.number().int().nullable().optional(), duration_minutes: z.number().int().nullable().optional() });

export type CreateSchedulingLinkRequest = __TypedOpenapi.Schemas.CreateSchedulingLinkRequest;
export const CreateSchedulingLinkRequest = z.strictObject({ title: z.string(), slug: z.string(), duration_options: z.array(z.number().int().min(1)), durations: z.array(z.number().int().min(1)), days_of_week: z.array(z.number().int().min(0).max(6)), days: z.array(z.string()), window_start_time: z.string(), window_start: z.string(), window_end_time: z.string(), window_end: z.string(), buffer_before: z.number().int().min(0).default(0), buffer_after: z.number().int().min(0).default(0), min_notice_minutes: z.number().int().min(0).default(0), usage_type: z.enum(["reusable", "recurring", "single_use"]).default("reusable"), max_uses: z.number().int().min(1).nullable(), co_host_emails: z.array(z.email()) }).partial();

export type OrgSummary = __TypedOpenapi.Schemas.OrgSummary;
export const OrgSummary = z.strictObject({ id: z.uuid(), name: z.string(), domain: z.string(), createdAt: z.iso.datetime() });

export type CurrentUserResponse = __TypedOpenapi.Schemas.CurrentUserResponse;
export const CurrentUserResponse = z.strictObject({ id: z.uuid(), email: z.email(), name: z.string(), avatarUrl: z.string(), provider: z.enum(["google", "microsoft", "sso"]), addressStanding: z.enum(["domain_confirmed", "unconfirmed"]), org: OrgSummary.optional(), createdAt: z.iso.datetime() });

export type DailyRecapPatch = __TypedOpenapi.Schemas.DailyRecapPatch;
export const DailyRecapPatch = z.strictObject({ enabled: z.boolean(), send_time: z.string().regex(new RegExp("^([01][0-9]|2[0-3]):[0-5][0-9]$")), send_to: z.enum(["dm", "channel"]), channel_id: z.string(), include_briefs: z.boolean(), include_focus_blocks: z.boolean(), include_habits: z.boolean() }).partial();

export type SlackBlock = __TypedOpenapi.Schemas.SlackBlock;
export const SlackBlock = z.object({ type: z.enum(["header", "context", "section", "divider"]) }).partial().catchall(z.unknown());

export type DailyRecapPreview = __TypedOpenapi.Schemas.DailyRecapPreview;
export const DailyRecapPreview = z.strictObject({ blocks: z.array(SlackBlock) });

export type DailyRecapSettings = __TypedOpenapi.Schemas.DailyRecapSettings;
export const DailyRecapSettings = z.strictObject({ enabled: z.boolean(), send_time: z.string().regex(new RegExp("^([01][0-9]|2[0-3]):[0-5][0-9]$")), send_to: z.enum(["dm", "channel"]), channel_id: z.string(), include_briefs: z.boolean(), include_focus_blocks: z.boolean(), include_habits: z.boolean() });

export type DailyRecapTestResult = __TypedOpenapi.Schemas.DailyRecapTestResult;
export const DailyRecapTestResult = z.strictObject({ ok: z.boolean(), slack_message_ts: z.string() });

export type DaySchedule = __TypedOpenapi.Schemas.DaySchedule;
export const DaySchedule = z.strictObject({ enabled: z.boolean(), start: z.string().regex(new RegExp("^(([01][0-9]|2[0-3]):[0-5][0-9])?$")), end: z.string().regex(new RegExp("^(([01][0-9]|2[0-3]):[0-5][0-9])?$")) });

export type ErrorResponse = __TypedOpenapi.Schemas.ErrorResponse;
export const ErrorResponse = z.strictObject({ error: z.string() });

export type EventConferenceLink = __TypedOpenapi.Schemas.EventConferenceLink;
export const EventConferenceLink = z.strictObject({ provider: z.string(), url: z.url(), label: z.string().optional() });

export type EventPatchRequest = __TypedOpenapi.Schemas.EventPatchRequest;
export const EventPatchRequest = z.strictObject({ title: z.string().nullable(), description: z.string().nullable(), location: z.string().nullable(), start: z.string().regex(new RegExp("^[0-9]{4}-[0-9]{2}-[0-9]{2}(T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2}))?$")).nullable(), end: z.string().regex(new RegExp("^[0-9]{4}-[0-9]{2}-[0-9]{2}(T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2}))?$")).nullable(), attendees: z.array(z.email()).nullable(), send_updates: z.enum(["all", "none"]).nullable(), room_resource_email: z.string().regex(new RegExp("^$|^[^@\\s]+@resource\\.calendar\\.google\\.com$")).nullable(), attendee_details: z.array(z.record(z.string(), z.unknown())).nullable() }).partial();

export type FocusBlockRecord = __TypedOpenapi.Schemas.FocusBlockRecord;
export const FocusBlockRecord = z.strictObject({ id: z.number().int(), google_event_id: z.string(), start_time: z.iso.datetime(), end_time: z.iso.datetime(), date: z.iso.date(), created_at: z.iso.datetime() });

export type FocusClearResult = __TypedOpenapi.Schemas.FocusClearResult;
export const FocusClearResult = z.strictObject({ deleted: z.number().int() });

export type FocusRunBlock = __TypedOpenapi.Schemas.FocusRunBlock;
export const FocusRunBlock = z.strictObject({ google_event_id: z.string(), start_time: z.iso.datetime(), end_time: z.iso.datetime(), date: z.iso.date() });

export type FocusRunRequest = __TypedOpenapi.Schemas.FocusRunRequest;
export const FocusRunRequest = z.object({ week: z.iso.date() }).partial().catchall(z.unknown());

export type FocusRunResult = __TypedOpenapi.Schemas.FocusRunResult;
export const FocusRunResult = z.strictObject({ weekStart: z.iso.datetime(), createdBlocks: z.array(FocusRunBlock), skippedDays: z.array(z.iso.date()), totalMinutes: z.number().int(), errors: z.array(z.string()) });

export type RawGoogleBusyWindow = __TypedOpenapi.Schemas.RawGoogleBusyWindow;
export const RawGoogleBusyWindow = z.strictObject({ start: z.iso.datetime(), end: z.iso.datetime() });

export type FreeBusyLegacyResult = __TypedOpenapi.Schemas.FreeBusyLegacyResult;
export const FreeBusyLegacyResult = z.strictObject({ email: z.email(), coverage: z.enum(["known", "unknown"]), busy: z.array(RawGoogleBusyWindow) });

export type FreeBusyWindow = __TypedOpenapi.Schemas.FreeBusyWindow;
export const FreeBusyWindow = z.strictObject({ start: z.iso.datetime(), end: z.iso.datetime() });

export type FreeBusyParticipant = __TypedOpenapi.Schemas.FreeBusyParticipant;
export const FreeBusyParticipant = z.strictObject({ email: z.email(), status: z.enum(["known", "unknown"]), busy: z.array(FreeBusyWindow) });

export type FreeBusyQueryRequest = __TypedOpenapi.Schemas.FreeBusyQueryRequest;
export const FreeBusyQueryRequest = z.strictObject({ emails: z.array(z.email()).min(1).max(20), start_time: z.iso.datetime(), end_time: z.iso.datetime() });

export type FreeBusyQueryResponse = __TypedOpenapi.Schemas.FreeBusyQueryResponse;
export const FreeBusyQueryResponse = z.strictObject({ start_time: z.iso.datetime(), end_time: z.iso.datetime(), participants: z.array(FreeBusyParticipant), busy: z.record(z.string(), z.array(FreeBusyWindow)), results: z.array(FreeBusyLegacyResult) });

export type Habit = __TypedOpenapi.Schemas.Habit;
export const Habit = z.strictObject({ id: z.uuid(), user_id: z.uuid(), title: z.string().max(200), duration_minutes: z.number().int().min(1).max(1440), days_of_week: z.array(z.number().int().min(1).max(7)).min(1).max(7).refine((arr) => new Set(arr).size === arr.length, { message: "uniqueItems" }), window_start: z.string().regex(new RegExp("^([01][0-9]|2[0-3]):[0-5][0-9]$")), window_end: z.string().regex(new RegExp("^([01][0-9]|2[0-3]):[0-5][0-9]$")), priority: z.number().int().min(0).max(100), color: z.string(), active: z.boolean(), created_at: z.iso.datetime() });

export type HabitCreateRequest = __TypedOpenapi.Schemas.HabitCreateRequest;
export const HabitCreateRequest = z.strictObject({ title: z.string().max(200), duration_minutes: z.number().int().min(1).max(1440), days_of_week: z.array(z.number().int().min(1).max(7)).min(1).max(7).refine((arr) => new Set(arr).size === arr.length, { message: "uniqueItems" }).optional(), window_start: z.string().regex(new RegExp("^([01][0-9]|2[0-3]):[0-5][0-9]$")).default("09:00"), window_end: z.string().regex(new RegExp("^([01][0-9]|2[0-3]):[0-5][0-9]$")).default("17:00"), priority: z.number().int().min(1).max(100).default(50), color: z.string().default("#5B7FFF") });

export type HabitOccurrence = __TypedOpenapi.Schemas.HabitOccurrence;
export const HabitOccurrence = z.strictObject({ id: z.uuid(), habit_id: z.uuid(), scheduled_date: z.iso.datetime(), start_time: z.iso.datetime(), end_time: z.iso.datetime(), status: z.enum(["scheduled", "completed", "displaced", "missed"]), calendar_event_id: z.string(), created_at: z.iso.datetime() });

export type HabitOccurrenceStatusUpdate = __TypedOpenapi.Schemas.HabitOccurrenceStatusUpdate;
export const HabitOccurrenceStatusUpdate = z.strictObject({ status: z.enum(["completed", "scheduled"]) });

export type HabitTemplate = __TypedOpenapi.Schemas.HabitTemplate;
export const HabitTemplate = z.strictObject({ title: z.string(), duration_minutes: z.number().int(), days_of_week: z.array(z.number().int().min(1).max(7)), window_start: z.string().regex(new RegExp("^[0-9]{2}:[0-9]{2}$")), window_end: z.string().regex(new RegExp("^[0-9]{2}:[0-9]{2}$")), priority: z.number().int(), color: z.string() });

export type HabitUpdateRequest = __TypedOpenapi.Schemas.HabitUpdateRequest;
export const HabitUpdateRequest = z.strictObject({ title: z.string().max(200), duration_minutes: z.number().int().min(1).max(1440), days_of_week: z.array(z.number().int().min(1).max(7)).min(1).max(7).refine((arr) => new Set(arr).size === arr.length, { message: "uniqueItems" }), window_start: z.string().regex(new RegExp("^([01][0-9]|2[0-3]):[0-5][0-9]$")), window_end: z.string().regex(new RegExp("^([01][0-9]|2[0-3]):[0-5][0-9]$")), priority: z.number().int().min(0).max(100), color: z.string(), active: z.boolean() }).partial();

export type HabitsReoptimizeAck = __TypedOpenapi.Schemas.HabitsReoptimizeAck;
export const HabitsReoptimizeAck = z.strictObject({ status: z.literal("reoptimization started") });

export type HealthResponse = __TypedOpenapi.Schemas.HealthResponse;
export const HealthResponse = z.strictObject({ status: z.literal("ok"), version: z.literal("0.1.0") });

export type IntegrationAvailabilityStatus = __TypedOpenapi.Schemas.IntegrationAvailabilityStatus;
export const IntegrationAvailabilityStatus = z.strictObject({ available: z.boolean(), reason: z.enum(["configured", "missing_credentials", "invalid_redirect_uri", "built_in"]).optional() });

export type IntegrationAvailabilityResponse = __TypedOpenapi.Schemas.IntegrationAvailabilityResponse;
export const IntegrationAvailabilityResponse = z.strictObject({ google: IntegrationAvailabilityStatus, microsoft: IntegrationAvailabilityStatus, zoom: IntegrationAvailabilityStatus, slack: IntegrationAvailabilityStatus, notion: IntegrationAvailabilityStatus, webcal: IntegrationAvailabilityStatus });

export type IntegrationStatus = __TypedOpenapi.Schemas.IntegrationStatus;
export const IntegrationStatus = z.strictObject({ connected: z.boolean(), workspace_name: z.string().optional() });

export type InviteEmailRequest = __TypedOpenapi.Schemas.InviteEmailRequest;
export const InviteEmailRequest = z.object({ email: z.email() }).catchall(z.unknown());

export type InviteSchedulingLinkHostRequest = __TypedOpenapi.Schemas.InviteSchedulingLinkHostRequest;
export const InviteSchedulingLinkHostRequest = z.strictObject({ email: z.email() });

export type LLMApiKeysSet = __TypedOpenapi.Schemas.LLMApiKeysSet;
export const LLMApiKeysSet = z.strictObject({ openai: z.boolean(), anthropic: z.boolean(), azure_openai: z.boolean(), bedrock: z.boolean(), vertex: z.boolean() });

export type LLMDestinationRefusal = __TypedOpenapi.Schemas.LLMDestinationRefusal;
export const LLMDestinationRefusal = z.strictObject({ error: z.string().min(1), reason: z.enum(["provider_not_enabled", "destination_not_approved", "destination_not_set"]), property: z.enum(["azureEndpoint", "awsRegion", "llmBaseUrl"]).optional(), configuration: z.literal("organization").optional() });

export type LLMNotConfiguredResponse = __TypedOpenapi.Schemas.LLMNotConfiguredResponse;
export const LLMNotConfiguredResponse = z.strictObject({ error: z.string().min(1), notConfigured: AINotConfigured });

export type LLMTestRequest = __TypedOpenapi.Schemas.LLMTestRequest;
export const LLMTestRequest = z.strictObject({ llmProvider: z.enum(["", "organization", "unsupported", "openai", "anthropic", "azure_openai", "bedrock", "vertex"]), llmModel: z.string(), llmApiKey: z.string() }).partial();

export type LLMTestResult = __TypedOpenapi.Schemas.LLMTestResult;
export const LLMTestResult = z.strictObject({ ok: z.boolean(), response: z.string(), provider: z.enum(["openai", "anthropic", "azure_openai", "bedrock", "vertex"]), configuration: z.enum(["own", "organization"]) });

export type LunchBreakSchedule = __TypedOpenapi.Schemas.LunchBreakSchedule;
export const LunchBreakSchedule = z.record(z.string(), DaySchedule);

export type ManagerAnalyticsWeek = __TypedOpenapi.Schemas.ManagerAnalyticsWeek;
export const ManagerAnalyticsWeek = z.strictObject({ week_start: z.iso.date(), focus_minutes: z.number().int(), meeting_minutes: z.number().int(), free_minutes: z.number().int(), data_available: z.boolean() });

export type ManagerAnalyticsMember = __TypedOpenapi.Schemas.ManagerAnalyticsMember;
export const ManagerAnalyticsMember = z.strictObject({ email: z.email(), display_name: z.string(), is_paceday_user: z.boolean(), data_available: z.boolean(), weeks: z.array(ManagerAnalyticsWeek).min(12).max(12) });

export type ManagerAnalytics = __TypedOpenapi.Schemas.ManagerAnalytics;
export const ManagerAnalytics = z.strictObject({ members: z.array(ManagerAnalyticsMember) });

export type ManagerMemberSource = __TypedOpenapi.Schemas.ManagerMemberSource;
export const ManagerMemberSource = z.enum(["auto", "manual", "formal"]);

export type ManagerProfileSummary = __TypedOpenapi.Schemas.ManagerProfileSummary;
export const ManagerProfileSummary = z.strictObject({ is_manager: z.boolean(), detected_at: z.iso.datetime().nullable(), team_member_count: z.number().int() });

export type ManagerProfileUpdate = __TypedOpenapi.Schemas.ManagerProfileUpdate;
export const ManagerProfileUpdate = z.object({ is_manager: z.boolean() }).catchall(z.unknown());

export type MemberWeekStats = __TypedOpenapi.Schemas.MemberWeekStats;
export const MemberWeekStats = z.strictObject({ focus_minutes: z.number().int(), meeting_minutes: z.number().int(), free_minutes: z.number().int(), data_available: z.boolean() });

export type ManagerRosterMember = __TypedOpenapi.Schemas.ManagerRosterMember;
export const ManagerRosterMember = z.strictObject({ email: z.email(), display_name: z.string(), source: ManagerMemberSource, cadence: Cadence, cadence_custom_days: z.number().int().min(1).max(365).nullable(), last_one_on_one_at: z.iso.datetime().nullable(), is_paceday_user: z.boolean(), this_week: MemberWeekStats, last_week: MemberWeekStats, focus_trend_pct: z.number().min(-200).max(200) });

export type ManagerRoster = __TypedOpenapi.Schemas.ManagerRoster;
export const ManagerRoster = z.strictObject({ team_id: z.uuid(), members: z.array(ManagerRosterMember) });

export type ManagerTeamMemberGoStruct = __TypedOpenapi.Schemas.ManagerTeamMemberGoStruct;
export const ManagerTeamMemberGoStruct = z.strictObject({ id: z.uuid(), manager_user_id: z.uuid(), member_email: z.email(), member_user_id: z.uuid().nullable(), display_name: z.string(), source: ManagerMemberSource, cadence: Cadence, cadence_custom_days: z.number().int().min(1).max(365).nullable(), last_one_on_one_at: z.iso.datetime().nullable(), created_at: z.iso.datetime(), updated_at: z.iso.datetime() });

export type SlackMessage = __TypedOpenapi.Schemas.SlackMessage;
export const SlackMessage = z.strictObject({ channel_name: z.string(), author_name: z.string(), text: z.string(), timestamp: z.string(), permalink: z.string() });

export type NotionPage = __TypedOpenapi.Schemas.NotionPage;
export const NotionPage = z.strictObject({ title: z.string(), url: z.string(), last_edited_time: z.iso.datetime(), parent_name: z.string() });

export type MeetingBriefSources = __TypedOpenapi.Schemas.MeetingBriefSources;
export const MeetingBriefSources = z.strictObject({ slack: z.array(SlackMessage), notion: z.array(NotionPage) });

export type MeetingBriefResponse = __TypedOpenapi.Schemas.MeetingBriefResponse;
export const MeetingBriefResponse = z.strictObject({ status: z.enum(["pending", "ready", "failed"]), generated_at: z.iso.datetime().optional(), brief_text: z.string().optional(), sources: MeetingBriefSources });

export type MemberAnalyticsSummary = __TypedOpenapi.Schemas.MemberAnalyticsSummary;
export const MemberAnalyticsSummary = z.strictObject({ user_id: z.uuid(), name: z.string(), meeting_minutes: z.number().int(), focus_minutes: z.number().int(), focus_score: z.number().int() });

export type MiddlewareUnauthorized = __TypedOpenapi.Schemas.MiddlewareUnauthorized;
export const MiddlewareUnauthorized = z.string();

export type SuggestedSlot = __TypedOpenapi.Schemas.SuggestedSlot;
export const SuggestedSlot = z.strictObject({ start: z.iso.datetime(), end: z.iso.datetime(), score: z.number().int(), reasons: z.array(z.string()).nullable() });

export type ParticipantInfo = __TypedOpenapi.Schemas.ParticipantInfo;
export const ParticipantInfo = z.strictObject({ email: z.email(), timezone: z.string(), workStart: z.string(), workEnd: z.string() });

export type NLPParseResult = __TypedOpenapi.Schemas.NLPParseResult;
export const NLPParseResult = z.strictObject({ intent: z.string(), title: z.string().optional(), duration_minutes: z.number().int().optional(), attendees: z.array(z.string()).optional(), range_start: z.iso.datetime().optional(), range_end: z.iso.datetime().optional(), preferred_times: z.array(z.string()).optional(), avoid_times: z.array(z.string()).optional(), constraints: z.string().optional(), timezone_notes: z.string().optional(), error: z.string().optional(), not_configured: AINotConfigured.optional(), suggested_slots: z.array(SuggestedSlot).optional(), participant_infos: z.array(ParticipantInfo).optional() });

export type NLPConfirmRequest = __TypedOpenapi.Schemas.NLPConfirmRequest;
export const NLPConfirmRequest = z.object({ parse_result: NLPParseResult, selected_slot_index: z.number().int().min(0) }).catchall(z.unknown());

export type NLPParseRequest = __TypedOpenapi.Schemas.NLPParseRequest;
export const NLPParseRequest = z.object({ text: z.string().min(1) }).catchall(z.unknown());

export type NoMeetingZone = __TypedOpenapi.Schemas.NoMeetingZone;
export const NoMeetingZone = z.strictObject({ id: z.uuid(), teamId: z.uuid(), dayOfWeek: z.number().int().min(1).max(7), startTime: z.string(), endTime: z.string(), label: z.string(), createdAt: z.iso.datetime() });

export type NoMeetingZoneRequest = __TypedOpenapi.Schemas.NoMeetingZoneRequest;
export const NoMeetingZoneRequest = z.object({ dayOfWeek: z.number().int().min(1).max(7), startTime: z.string().regex(new RegExp("^([01][0-9]|2[0-3]):[0-5][0-9]$")), endTime: z.string().regex(new RegExp("^([01][0-9]|2[0-3]):[0-5][0-9]$")), label: z.string().optional() }).catchall(z.unknown());

export type Org = __TypedOpenapi.Schemas.Org;
export const Org = z.strictObject({ id: z.uuid(), name: z.string(), domain: z.string(), createdAt: z.iso.datetime() });

export type OrgMember = __TypedOpenapi.Schemas.OrgMember;
export const OrgMember = z.strictObject({ id: z.uuid(), email: z.email(), name: z.string(), avatarUrl: z.string(), provider: z.string(), org: Org.optional(), createdAt: z.iso.datetime() });

export type OrganizationAIConfiguration = __TypedOpenapi.Schemas.OrganizationAIConfiguration;
export const OrganizationAIConfiguration = z.strictObject({ configured: z.boolean(), provider: z.enum(["openai", "anthropic", "azure_openai", "bedrock", "vertex"]).optional(), model: z.string().optional(), baseUrl: z.string().optional(), azureEndpoint: z.string().optional(), azureDeployment: z.string().optional(), azureApiVersion: z.string().optional(), awsRegion: z.string().optional(), keySet: z.boolean(), personalKeysAllowed: z.boolean(), configurationVersion: z.number().int().min(0), updatedAt: z.iso.datetime().optional(), changeableBy: z.literal("organization_admin") });

export type OrganizationAIConfigurationUpdate = __TypedOpenapi.Schemas.OrganizationAIConfigurationUpdate;
export const OrganizationAIConfigurationUpdate = z.strictObject({ configurationVersion: z.number().int().min(0), provider: z.enum(["", "openai", "anthropic", "azure_openai", "bedrock", "vertex"]).optional(), model: z.string().optional(), apiKey: z.string().optional(), baseUrl: z.string().optional(), azureEndpoint: z.string().optional(), azureDeployment: z.string().optional(), azureApiVersion: z.string().optional(), awsRegion: z.string().optional(), personalKeysAllowed: z.boolean().optional() }).refine((obj) => Object.keys(obj).length >= 2, { message: "minProperties" });

export type OrganizationAIConsentConflict = __TypedOpenapi.Schemas.OrganizationAIConsentConflict;
export const OrganizationAIConsentConflict = z.strictObject({ error: z.string().min(1), reason: z.enum(["organization_not_configured", "configuration_changed"]), organization: OrganizationAIConfiguration });

export type OrganizationAIConsentRequest = __TypedOpenapi.Schemas.OrganizationAIConsentRequest;
export const OrganizationAIConsentRequest = z.strictObject({ configurationVersion: z.number().int().min(1) });

export type SsoWriteMembershipRequired = __TypedOpenapi.Schemas.SsoWriteMembershipRequired;
export const SsoWriteMembershipRequired = z.strictObject({ error: z.enum(["org membership required", "org not found"]) });

export type SsoStepupUrl = __TypedOpenapi.Schemas.SsoStepupUrl;
export const SsoStepupUrl = z.literal("/api/admin/sso/stepup");

export type SsoStepupScopes = __TypedOpenapi.Schemas.SsoStepupScopes;
export const SsoStepupScopes = z.strictObject({ google: z.array(z.string().min(1)).min(1).refine((arr) => new Set(arr).size === arr.length, { message: "uniqueItems" }), microsoft: z.array(z.string().min(1)).min(1).refine((arr) => new Set(arr).size === arr.length, { message: "uniqueItems" }) }).partial();

export type SsoWithoutStepup = __TypedOpenapi.Schemas.SsoWithoutStepup;
export const SsoWithoutStepup = z.array(z.string().min(1)).min(1).refine((arr) => new Set(arr).size === arr.length, { message: "uniqueItems" });

export type OrganizationAIWriteStepupRequired = __TypedOpenapi.Schemas.OrganizationAIWriteStepupRequired;
export const OrganizationAIWriteStepupRequired = z.strictObject({ error: z.literal("organization_ai_write_requires_admin_stepup"), stepup_url: SsoStepupUrl, stepup_purpose: z.literal("llm_org_key_write"), stepup_scopes: SsoStepupScopes, without_stepup: SsoWithoutStepup });

export type OrganizationAIWriteFreshLoginRequired = __TypedOpenapi.Schemas.OrganizationAIWriteFreshLoginRequired;
export const OrganizationAIWriteFreshLoginRequired = z.strictObject({ error: z.literal("organization_ai_write_requires_fresh_login") });

export type OrganizationAIWriteForbiddenResponse = __TypedOpenapi.Schemas.OrganizationAIWriteForbiddenResponse;
export const OrganizationAIWriteForbiddenResponse = z.union([SsoWriteMembershipRequired, OrganizationAIWriteStepupRequired, OrganizationAIWriteFreshLoginRequired]).refine((data) => [SsoWriteMembershipRequired.safeParse(data).success, OrganizationAIWriteStepupRequired.safeParse(data).success, OrganizationAIWriteFreshLoginRequired.safeParse(data).success].filter(Boolean).length === 1, { message: "oneOf" });

export type PatchManagerMemberRequest = __TypedOpenapi.Schemas.PatchManagerMemberRequest;
export const PatchManagerMemberRequest = z.object({ display_name: z.string().nullable(), cadence: Cadence, cadence_custom_days: z.number().int().min(1).max(365).nullable() }).partial().catchall(z.unknown());

export type PersonalCalendar = __TypedOpenapi.Schemas.PersonalCalendar;
export const PersonalCalendar = z.strictObject({ id: z.string(), label: z.string(), type: z.string(), url: z.string().optional(), enabled: z.boolean(), last_synced_at: z.iso.datetime().optional() });

export type PersonalCalendarCreateRequest = __TypedOpenapi.Schemas.PersonalCalendarCreateRequest;
export const PersonalCalendarCreateRequest = z.strictObject({ provider: z.string(), name: z.string().optional(), url: z.string().optional(), enabled: z.boolean().default(false) });

export type PersonalCalendarPatchRequest = __TypedOpenapi.Schemas.PersonalCalendarPatchRequest;
export const PersonalCalendarPatchRequest = z.strictObject({ name: z.string().nullable(), url: z.string().nullable(), enabled: z.boolean().nullable() }).partial();

export type PersonalCalendarPreviewEvent = __TypedOpenapi.Schemas.PersonalCalendarPreviewEvent;
export const PersonalCalendarPreviewEvent = z.strictObject({ id: z.string(), title: z.string(), start: z.iso.datetime(), end: z.iso.datetime() });

export type PlainTextError = __TypedOpenapi.Schemas.PlainTextError;
export const PlainTextError = z.string();

export type PrefillUrlResponse = __TypedOpenapi.Schemas.PrefillUrlResponse;
export const PrefillUrlResponse = z.strictObject({ prefill_url: z.string() });

export type ProviderDisconnectResult = __TypedOpenapi.Schemas.ProviderDisconnectResult;
export const ProviderDisconnectResult = z.strictObject({ provider: z.enum(["outlook", "zoom"]), revocation: z.enum(["confirmed", "unconfirmed", "not_offered", "nothing_stored"]) });

export type PublicHost = __TypedOpenapi.Schemas.PublicHost;
export const PublicHost = z.strictObject({ email: z.email(), name: z.string().optional(), avatar_url: z.string().optional() });

export type PublicBookingConfirmation = __TypedOpenapi.Schemas.PublicBookingConfirmation;
export const PublicBookingConfirmation = z.strictObject({ id: z.uuid(), link_slug: z.string(), title: z.string(), start: z.iso.datetime(), end: z.iso.datetime(), duration_minutes: z.number().int(), hosts: z.array(PublicHost), booker_name: z.string(), booker_email: z.string(), notes: z.string().optional() });

export type PublicBookingSlot = __TypedOpenapi.Schemas.PublicBookingSlot;
export const PublicBookingSlot = z.strictObject({ start: z.iso.datetime(), end: z.iso.datetime() });

export type PublicLinkCoverage = __TypedOpenapi.Schemas.PublicLinkCoverage;
export const PublicLinkCoverage = z.strictObject({ total: z.number().int(), checked: z.number().int() });

export type PublicLinkInfo = __TypedOpenapi.Schemas.PublicLinkInfo;
export const PublicLinkInfo = z.strictObject({ slug: z.string(), title: z.string(), durations: z.array(z.number().int()), hosts: z.array(PublicHost), min_notice_minutes: z.number().int(), usage_type: z.enum(["reusable", "recurring", "single_use"]), coverage: PublicLinkCoverage });

export type PublicSlotsResponse = __TypedOpenapi.Schemas.PublicSlotsResponse;
export const PublicSlotsResponse = z.strictObject({ slots: z.array(PublicBookingSlot), available_dates: z.array(z.iso.date()) });

export type RawGoogleFreeBusyMap = __TypedOpenapi.Schemas.RawGoogleFreeBusyMap;
export const RawGoogleFreeBusyMap = z.record(z.string(), z.array(RawGoogleBusyWindow));

export type ScanCandidate = __TypedOpenapi.Schemas.ScanCandidate;
export const ScanCandidate = z.strictObject({ email: z.email(), display_name: z.string(), already_assigned: z.boolean() });

export type ScanConfirmRequest = __TypedOpenapi.Schemas.ScanConfirmRequest;
export const ScanConfirmRequest = z.strictObject({ emails: z.array(z.email()) });

export type ScanConfirmation = __TypedOpenapi.Schemas.ScanConfirmation;
export const ScanConfirmation = z.strictObject({ team_id: z.uuid(), assigned: z.number().int().min(0), skipped: z.number().int().min(0), total: z.number().int().min(0) });

export type ScanPreview = __TypedOpenapi.Schemas.ScanPreview;
export const ScanPreview = z.strictObject({ team_id: z.uuid(), scanned_at: z.iso.datetime(), detected: z.number().int().min(0), eligible: z.number().int().min(0), assigned: z.literal(0), skipped: z.number().int().min(0), candidates: z.array(ScanCandidate) });

export type ScheduleCreateRequest = __TypedOpenapi.Schemas.ScheduleCreateRequest;
export const ScheduleCreateRequest = z.object({ title: z.string().optional(), start: z.iso.datetime(), end: z.iso.datetime(), attendees: z.array(z.email()).optional(), description: z.string().optional(), location: z.string().optional() }).catchall(z.unknown());

export type ScheduleOneOnOneRequest = __TypedOpenapi.Schemas.ScheduleOneOnOneRequest;
export const ScheduleOneOnOneRequest = z.object({ suggested_date: z.iso.date() }).partial().catchall(z.unknown());

export type ScheduleSuggestRequest = __TypedOpenapi.Schemas.ScheduleSuggestRequest;
export const ScheduleSuggestRequest = z.object({ duration_minutes: z.number().int().optional(), attendees: z.array(z.email()).optional(), range_start: z.iso.datetime(), range_end: z.iso.datetime(), title: z.string().optional() }).catchall(z.unknown());

export type ScheduleSuggestions = __TypedOpenapi.Schemas.ScheduleSuggestions;
export const ScheduleSuggestions = z.strictObject({ slots: z.array(SuggestedSlot) });

export type SchedulingErrorResponse = __TypedOpenapi.Schemas.SchedulingErrorResponse;
export const SchedulingErrorResponse = z.strictObject({ error: z.string() });

export type SchedulingLinkHost = __TypedOpenapi.Schemas.SchedulingLinkHost;
export const SchedulingLinkHost = z.strictObject({ user_id: z.uuid(), email: z.email(), name: z.string().optional(), avatar_url: z.string().optional(), is_owner: z.boolean(), status: z.enum(["pending", "accepted", "declined"]) });

export type SchedulingLink = __TypedOpenapi.Schemas.SchedulingLink;
export const SchedulingLink = z.strictObject({ id: z.uuid(), owner_id: z.uuid(), title: z.string(), slug: z.string(), durations: z.array(z.number().int()), days: z.array(z.enum(["sun", "mon", "tue", "wed", "thu", "fri", "sat"])), window_start: z.string(), window_end: z.string(), buffer_before: z.number().int().min(0), buffer_after: z.number().int().min(0), min_notice_minutes: z.number().int().min(0), usage_type: z.enum(["reusable", "recurring", "single_use"]), max_uses: z.number().int().optional(), uses_count: z.number().int(), active: z.boolean(), hosts: z.array(SchedulingLinkHost), created_at: z.iso.datetime(), is_owner: z.boolean(), my_status: z.enum(["pending", "accepted", "declined"]).optional() });

export type SchedulingLinkBookingRecord = __TypedOpenapi.Schemas.SchedulingLinkBookingRecord;
export const SchedulingLinkBookingRecord = z.strictObject({ id: z.uuid(), link_id: z.uuid(), booker_name: z.string(), booker_email: z.string(), start_time: z.iso.datetime(), end_time: z.iso.datetime(), status: z.string(), notes: z.string(), created_at: z.iso.datetime() });

export type SchedulingLinkHostInvite = __TypedOpenapi.Schemas.SchedulingLinkHostInvite;
export const SchedulingLinkHostInvite = z.strictObject({ link_id: z.uuid(), link_title: z.string(), owner_name: z.string(), owner_email: z.email(), invited_at: z.iso.datetime() });

export type SchedulingLinkHostRecord = __TypedOpenapi.Schemas.SchedulingLinkHostRecord;
export const SchedulingLinkHostRecord = z.strictObject({ id: z.uuid(), link_id: z.uuid(), user_id: z.uuid(), status: z.enum(["pending", "accepted", "declined"]), invited_at: z.iso.datetime(), responded_at: z.iso.datetime().optional() });

export type SchedulingLinkInviteResponse = __TypedOpenapi.Schemas.SchedulingLinkInviteResponse;
export const SchedulingLinkInviteResponse = z.strictObject({ status: z.enum(["accepted", "declined"]) });

export type SchedulingLinkListResponse = __TypedOpenapi.Schemas.SchedulingLinkListResponse;
export const SchedulingLinkListResponse = z.strictObject({ owned: z.array(SchedulingLink), shared: z.array(SchedulingLink) });

export type WorkingHoursSchedule = __TypedOpenapi.Schemas.WorkingHoursSchedule;
export const WorkingHoursSchedule = z.strictObject({ mode: z.enum(["", "all_days", "by_day"]), default: DaySchedule, days: z.record(z.string(), DaySchedule) });

export type Settings = __TypedOpenapi.Schemas.Settings;
export const Settings = z.strictObject({ workStart: z.string().regex(new RegExp("^(([01][0-9]|2[0-3]):[0-5][0-9])?$")), workEnd: z.string().regex(new RegExp("^(([01][0-9]|2[0-3]):[0-5][0-9])?$")), timezone: z.string(), focusMinBlockMinutes: z.number().int().min(0), focusMaxBlockMinutes: z.number().int().min(0), focusDailyTargetMinutes: z.number().int().min(0), outOfHoursMeetingsPerWeek: z.number().int().min(0), autoDeclineOutsideWorkingHours: z.boolean(), focusLabel: z.string(), focusColor: z.string(), lunchStart: z.string().regex(new RegExp("^(([01][0-9]|2[0-3]):[0-5][0-9])?$")), lunchEnd: z.string().regex(new RegExp("^(([01][0-9]|2[0-3]):[0-5][0-9])?$")), protectLunch: z.boolean(), bufferBeforeMinutes: z.number().int().min(0), bufferAfterMinutes: z.number().int().min(0), bufferEnabled: z.boolean(), bufferMinMeetingMinutes: z.number().int().min(0), bufferSkipBackToBack: z.boolean(), workingHours: WorkingHoursSchedule, lunchBreaks: LunchBreakSchedule, compressionEnabled: z.boolean(), autoScheduleEnabled: z.boolean(), autoScheduleCron: z.string(), llmProvider: z.enum(["", "organization", "unsupported", "openai", "anthropic", "azure_openai", "bedrock", "vertex"]), llmModel: z.string(), llmApiKeySet: z.boolean(), llmApiKeysSet: LLMApiKeysSet, llmUnboundApiKeySet: z.boolean(), aiStatus: AIStatus, llmBaseUrl: z.string(), awsRegion: z.string(), bedrockModel: z.string(), azureEndpoint: z.string(), azureDeployment: z.string(), azureApiVersion: z.string(), vertexModel: z.string(), calendarProvider: z.enum(["google", "outlook", "webcal"]), webcalUrl: z.string(), calendarEmail: z.string(), conferencingProvider: z.enum(["meet", "zoom", "teams"]), recapEnabled: z.boolean(), recapSendTime: z.string().regex(new RegExp("^([01][0-9]|2[0-3]):[0-5][0-9]$")), recapSendTo: z.enum(["dm", "channel"]), recapChannelId: z.string(), recapIncludeBriefs: z.boolean(), recapIncludeFocus: z.boolean(), recapIncludeHabits: z.boolean(), timeFormat: z.enum(["12h", "24h"]), updatedAt: z.iso.datetime() });

export type SettingsUpdate = __TypedOpenapi.Schemas.SettingsUpdate;
export const SettingsUpdate = z.strictObject({ workStart: z.string().regex(new RegExp("^(([01][0-9]|2[0-3]):[0-5][0-9])?$")), workEnd: z.string().regex(new RegExp("^(([01][0-9]|2[0-3]):[0-5][0-9])?$")), timezone: z.string(), focusMinBlockMinutes: z.number().int().min(0), focusMaxBlockMinutes: z.number().int().min(0), focusDailyTargetMinutes: z.number().int().min(0), outOfHoursMeetingsPerWeek: z.number().int().min(0), autoDeclineOutsideWorkingHours: z.boolean(), focusLabel: z.string(), focusColor: z.string(), lunchStart: z.string().regex(new RegExp("^(([01][0-9]|2[0-3]):[0-5][0-9])?$")), lunchEnd: z.string().regex(new RegExp("^(([01][0-9]|2[0-3]):[0-5][0-9])?$")), protectLunch: z.boolean(), bufferBeforeMinutes: z.number().int().min(0), bufferAfterMinutes: z.number().int().min(0), bufferEnabled: z.boolean(), bufferMinMeetingMinutes: z.number().int().min(0), bufferSkipBackToBack: z.boolean(), workingHours: WorkingHoursSchedule, lunchBreaks: LunchBreakSchedule, compressionEnabled: z.boolean(), autoScheduleEnabled: z.boolean(), autoScheduleCron: z.string(), llmProvider: z.enum(["", "organization", "unsupported", "openai", "anthropic", "azure_openai", "bedrock", "vertex"]), llmModel: z.string(), llmApiKeySet: z.boolean(), llmApiKeysSet: LLMApiKeysSet, llmUnboundApiKeySet: z.boolean(), aiStatus: AIStatus, llmBaseUrl: z.string(), awsRegion: z.string(), bedrockModel: z.string(), azureEndpoint: z.string(), azureDeployment: z.string(), azureApiVersion: z.string(), vertexModel: z.string(), calendarProvider: z.enum(["google", "outlook", "webcal"]), webcalUrl: z.string(), calendarEmail: z.string(), conferencingProvider: z.enum(["meet", "zoom", "teams"]), recapEnabled: z.boolean(), recapSendTime: z.string().regex(new RegExp("^([01][0-9]|2[0-3]):[0-5][0-9]$")), recapSendTo: z.enum(["dm", "channel"]), recapChannelId: z.string(), recapIncludeBriefs: z.boolean(), recapIncludeFocus: z.boolean(), recapIncludeHabits: z.boolean(), timeFormat: z.enum(["12h", "24h"]), updatedAt: z.iso.datetime(), llmApiKey: z.string(), llmUnboundApiKey: z.literal("") }).partial();

export type SsoDetectRequest = __TypedOpenapi.Schemas.SsoDetectRequest;
export const SsoDetectRequest = z.object({ email: z.string() }).catchall(z.unknown());

export type SsoDetectResponse = __TypedOpenapi.Schemas.SsoDetectResponse;
export const SsoDetectResponse = z.strictObject({ type: z.enum(["google", "microsoft", "sso", "generic"]), provider_name: z.string().optional(), redirect_url: z.string().optional() });

export type SsoProviderState = __TypedOpenapi.Schemas.SsoProviderState;
export const SsoProviderState = z.enum(["active", "suspended"]);

export type SsoProvider = __TypedOpenapi.Schemas.SsoProvider;
export const SsoProvider = z.strictObject({ id: z.uuid(), domain: z.string(), provider_name: z.string(), provider_type: z.enum(["oidc", "saml"]), state: SsoProviderState, oidc_issuer: z.string(), oidc_client_id: z.string(), has_oidc_client_secret: z.boolean(), saml_entry_point: z.string(), saml_issuer: z.string(), has_saml_cert: z.boolean(), created_at: z.iso.datetime(), updated_at: z.iso.datetime() });

export type SsoProviderCreateRequest = __TypedOpenapi.Schemas.SsoProviderCreateRequest;
export const SsoProviderCreateRequest = z.strictObject({ domain: z.string().min(1), provider_name: z.string().min(1), provider_type: z.literal("oidc"), oidc_issuer: z.string().min(1), oidc_client_id: z.string().min(1), oidc_client_secret: z.string().min(1).optional() });

export type SsoProviderList = __TypedOpenapi.Schemas.SsoProviderList;
export const SsoProviderList = z.strictObject({ providers: z.array(SsoProvider) });

export type SsoProviderStateRequest = __TypedOpenapi.Schemas.SsoProviderStateRequest;
export const SsoProviderStateRequest = z.strictObject({ state: SsoProviderState });

export type SsoStepupOptions = __TypedOpenapi.Schemas.SsoStepupOptions;
export const SsoStepupOptions = z.strictObject({ stepup_url: SsoStepupUrl, stepup_scopes: SsoStepupScopes, without_stepup: SsoWithoutStepup });

export type SsoStepupProvider = __TypedOpenapi.Schemas.SsoStepupProvider;
export const SsoStepupProvider = z.enum(["google", "microsoft"]);

export type SsoStepupPurpose = __TypedOpenapi.Schemas.SsoStepupPurpose;
export const SsoStepupPurpose = z.enum(["sso_write", "llm_org_key_write"]);

export type SsoWriteDomainMismatch = __TypedOpenapi.Schemas.SsoWriteDomainMismatch;
export const SsoWriteDomainMismatch = z.strictObject({ error: z.literal("provider_domain_mismatch") });

export type SsoWriteStepupRequired = __TypedOpenapi.Schemas.SsoWriteStepupRequired;
export const SsoWriteStepupRequired = z.strictObject({ error: z.literal("sso_write_requires_admin_stepup"), stepup_scopes: SsoStepupScopes, without_stepup: SsoWithoutStepup, stepup_url: SsoStepupUrl });

export type SsoWriteFreshLoginRequired = __TypedOpenapi.Schemas.SsoWriteFreshLoginRequired;
export const SsoWriteFreshLoginRequired = z.strictObject({ error: z.literal("sso_write_requires_fresh_login") });

export type SsoWriteForbiddenResponse = __TypedOpenapi.Schemas.SsoWriteForbiddenResponse;
export const SsoWriteForbiddenResponse = z.union([SsoWriteMembershipRequired, SsoWriteDomainMismatch, SsoWriteStepupRequired, SsoWriteFreshLoginRequired]).refine((data) => [SsoWriteMembershipRequired.safeParse(data).success, SsoWriteDomainMismatch.safeParse(data).success, SsoWriteStepupRequired.safeParse(data).success, SsoWriteFreshLoginRequired.safeParse(data).success].filter(Boolean).length === 1, { message: "oneOf" });

export type Team = __TypedOpenapi.Schemas.Team;
export const Team = z.strictObject({ id: z.uuid(), orgId: z.uuid().optional(), name: z.string(), createdBy: z.uuid(), createdAt: z.iso.datetime() });

export type TeamAnalytics = __TypedOpenapi.Schemas.TeamAnalytics;
export const TeamAnalytics = z.strictObject({ avg_meeting_minutes: z.number().int(), avg_focus_minutes: z.number().int(), member_breakdown: z.array(MemberAnalyticsSummary) });

export type TeamMember = __TypedOpenapi.Schemas.TeamMember;
export const TeamMember = z.strictObject({ teamId: z.uuid(), userId: z.uuid(), role: z.enum(["owner", "member"]), joinedAt: z.iso.datetime(), name: z.string().optional(), email: z.email().optional() });

export type TeamDetail = __TypedOpenapi.Schemas.TeamDetail;
export const TeamDetail = z.strictObject({ team: Team, members: z.array(TeamMember) });

export type TeamInvite = __TypedOpenapi.Schemas.TeamInvite;
export const TeamInvite = z.strictObject({ id: z.uuid(), teamId: z.uuid(), inviteeEmail: z.email(), invitedBy: z.uuid(), token: z.string(), status: z.enum(["pending", "accepted", "declined", "expired"]), createdAt: z.iso.datetime(), expiresAt: z.iso.datetime() });

export type TeamInvitePreview = __TypedOpenapi.Schemas.TeamInvitePreview;
export const TeamInvitePreview = z.strictObject({ teamName: z.string(), inviterName: z.string(), email: z.email(), team_id: z.uuid(), expires_at: z.iso.datetime(), inviter_email: z.email().nullable() });

export type TeamNameRequest = __TypedOpenapi.Schemas.TeamNameRequest;
export const TeamNameRequest = z.object({ name: z.string().min(1) }).catchall(z.unknown());

export type TeamSlot = __TypedOpenapi.Schemas.TeamSlot;
export const TeamSlot = z.strictObject({ start: z.iso.datetime(), end: z.iso.datetime(), quality_score: z.number().int().min(0).max(100) });

export type TeamSlotList = __TypedOpenapi.Schemas.TeamSlotList;
export const TeamSlotList = z.strictObject({ slots: z.array(TeamSlot) });

export type UpdateSchedulingLinkRequest = __TypedOpenapi.Schemas.UpdateSchedulingLinkRequest;
export const UpdateSchedulingLinkRequest = z.strictObject({ title: z.string().nullable(), slug: z.string().nullable(), duration_options: z.array(z.number().int()), durations: z.array(z.number().int()), days_of_week: z.array(z.number().int().min(0).max(6)), days: z.array(z.string()), window_start_time: z.string().nullable(), window_start: z.string().nullable(), window_end_time: z.string().nullable(), window_end: z.string().nullable(), buffer_before: z.number().int().min(0).nullable(), buffer_after: z.number().int().min(0).nullable(), min_notice_minutes: z.number().int().min(0).nullable(), usage_type: z.enum(["reusable", "recurring", "single_use"]).nullable(), max_uses: z.number().int().nullable(), active: z.boolean().nullable(), co_host_emails: z.array(z.email()) }).partial();

export type UserProfileGoStruct = __TypedOpenapi.Schemas.UserProfileGoStruct;
export const UserProfileGoStruct = z.strictObject({ user_id: z.uuid(), is_manager: z.boolean(), detected_at: z.iso.datetime().nullable(), analytics_shared_with_manager: z.boolean(), updated_at: z.iso.datetime() });

// </Schemas>

  
  
  