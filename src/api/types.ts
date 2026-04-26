export type CalendarProvider = "google" | "outlook" | "webcal";
export type PersonalCalendarType = "google" | "outlook" | "webcal";
export type LLMProvider =
  | "openai"
  | "anthropic"
  | "ollama"
  | "bedrock"
  | "azure_openai";

export type ConferenceProvider = "google_meet" | "zoom" | "teams" | "custom";

export interface Settings {
  work_start: string;
  work_end: string;
  timezone: string;
  focus_min_block_minutes: number;
  focus_max_block_minutes: number;
  focus_daily_target_minutes: number;
  focus_max_per_week?: number;
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
  llm_api_key?: string;
  llm_base_url?: string;
  calendar_id?: string;
  // Work calendar provider
  calendar_provider?: CalendarProvider;
  webcal_url?: string;
  // LLM: AWS Bedrock
  aws_region?: string;
  aws_profile?: string;
  // LLM: Azure OpenAI
  azure_endpoint?: string;
  azure_deployment?: string;
  azure_api_version?: string;
  // Conferencing
  default_conference_provider?: ConferenceProvider;
  teams_enabled?: boolean;
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

export interface FocusBlock {
  id: number;
  google_event_id: string;
  start_time: string;
  end_time: string;
  date: string;
}

export interface FocusRunResult {
  week_start: string;
  created_blocks: FocusBlock[];
  skipped_days: string[];
  total_minutes: number;
  errors: string[];
}

export interface SuggestedSlot {
  start: string;
  end: string;
  score: number;
  reasons: string[];
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
  suggested_slots?: SuggestedSlot[];
}

export interface MoveProposal {
  event_id: string;
  event_title: string;
  current_start: string;
  current_end: string;
  proposed_start: string;
  proposed_end: string;
  reason: string;
  focus_gain_minutes: number;
}

export interface CompressionResult {
  date: string;
  proposals: MoveProposal[];
  estimated_focus_gain_minutes: number;
}

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
