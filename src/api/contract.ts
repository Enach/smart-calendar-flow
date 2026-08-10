import type {
  Attendee,
  AuditEntry,
  AuthStatus,
  CalendarEvent,
  CalendarProvider,
  ConferenceLink,
  ConferenceProvider,
  ConferenceProviderStatus,
  CompressionResult,
  FocusBlock,
  FocusRunResult,
  FreeBusyResponse,
  LLMTestResult,
  MoveProposal,
  ParseResult,
  PersonalCalendar,
  PersonalCalendarType,
  Room,
  Settings,
  SuggestedSlot,
} from "./types";

export interface ScheduleSuggestRequest {
  duration_minutes: number;
  attendees: string[];
  range_start: string;
  range_end: string;
  title: string;
}

export interface ScheduleCreateRequest {
  title: string;
  start: string;
  end: string;
  attendees: string[];
  description?: string;
}

export interface CompressionApplyResponse {
  applied: string[];
  failed: string[];
}

/**
 * Stable frontend port for the complete backend-facing API surface.
 *
 * The concrete client may expose additional local-only helpers, but every
 * network-backed method must remain assignable to this interface.
 */
export interface ApiPort {
  health(): Promise<{ status: string; version: string; reachable: boolean }>;
  freebusy(input: { emails: string[]; start_time: string; end_time: string }): Promise<FreeBusyResponse>;

  authStatus(): Promise<AuthStatus>;
  authConnectUrl(provider?: CalendarProvider): string;
  authDisconnect(): Promise<void>;

  getSettings(): Promise<Settings>;
  updateSettings(settings: Settings): Promise<Settings>;

  getEvents(start: string, end: string): Promise<CalendarEvent[]>;

  runFocus(week?: string): Promise<FocusRunResult>;
  getFocusBlocks(week: string): Promise<FocusBlock[]>;
  clearFocusBlocks(week: string): Promise<{ deleted: number }>;

  scheduleSuggest(body: ScheduleSuggestRequest): Promise<{ slots: SuggestedSlot[] }>;
  scheduleCreate(body: ScheduleCreateRequest): Promise<CalendarEvent>;
  compressionPreview(body: { date?: string; week?: string }): Promise<CompressionResult[]>;
  compressionApply(body: { proposals: MoveProposal[] }): Promise<CompressionApplyResponse>;

  nlpParse(text: string): Promise<ParseResult>;
  nlpConfirm(parseResult: ParseResult, selectedSlotIndex: number): Promise<CalendarEvent>;

  getAudit(): Promise<AuditEntry[]>;

  listPersonalCalendars(): Promise<PersonalCalendar[]>;
  addPersonalCalendar(body: { type: PersonalCalendarType; label: string; url?: string }): Promise<PersonalCalendar>;
  updatePersonalCalendar(id: string, patch: Partial<Pick<PersonalCalendar, "enabled" | "label">>): Promise<PersonalCalendar>;
  deletePersonalCalendar(id: string): Promise<void>;
  syncPersonalCalendar(id: string): Promise<PersonalCalendar>;

  llmTest(settings: Settings): Promise<LLMTestResult>;

  updateEvent(
    id: string,
    patch: Partial<Pick<CalendarEvent, "title" | "start" | "end" | "description" | "location" | "room_resource_email" | "attendees" | "attendee_details">>,
    sendUpdates?: "all" | "none",
  ): Promise<CalendarEvent>;
  deleteEvent(id: string, sendUpdates?: "all" | "none"): Promise<void>;

  searchRooms(q: string, start?: string, end?: string): Promise<Room[]>;
  suggestAttendees(q: string): Promise<Attendee[]>;

  addConference(eventId: string, body: { provider: ConferenceProvider; url?: string }): Promise<ConferenceLink>;
  removeConference(eventId: string): Promise<void>;
  conferenceProviders(): Promise<ConferenceProviderStatus[]>;
  zoomConnectUrl(): string;
  zoomDisconnect(): Promise<void>;
}
