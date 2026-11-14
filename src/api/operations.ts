/**
 * PAC-83 (contract §3.5): every operation that sends a request to Paceday,
 * grouped as the AC-7 test walks them. The test (src/api/noInventedData.test.ts)
 * iterates these objects — the list is derived, not hand-kept — and a second
 * check scans the API modules' exports: an exported function or api member
 * that is neither registered here nor listed in NOT_OPERATIONS fails it.
 */
import {
  api,
  chooseOrganizationAIChoice,
  confirmOrganizationAI,
  fetchOrganizationAI,
  fetchSsoStepupOptions,
  patchOrganizationAI,
} from "./client";
import { schedulingLinksApi } from "./schedulingLinks";
import { teamInvitesApi, teamsApi } from "./teams";
import { managerApi } from "./manager";

export const API_OPERATIONS = {
  api,
  schedulingLinksApi,
  teamInvitesApi,
  // The top level of teamsApi / managerApi is a local store (no request);
  // the server calls are under `.remote`.
  teams: teamsApi.remote,
  manager: managerApi.remote,
  standalone: { fetchSsoStepupOptions, fetchOrganizationAI, patchOrganizationAI, chooseOrganizationAIChoice, confirmOrganizationAI },
} as const;

const PURE = "pure helper, no request";
const STORE = "local store, no request";
const URL_BUILDER = "builds a URL, no request";

/**
 * Exported functions and api members that make no request of their own,
 * keyed "<module>.<name>" (module exports) or "<object>.<name>" (members).
 */
export const NOT_OPERATIONS: Record<string, string> = {
  // client.ts
  "client.isApiHttpError": PURE,
  "client.isApiUnreachableError": PURE,
  "client.isGatewayError": PURE,
  "client.isAnswerLost": PURE,
  "client.isBudgetExpired": PURE,
  "client.isRequestTooLarge": PURE,
  "client.canDisconnectCalendar": PURE,
  "client.isCalendarDisconnectUnsupported": PURE,
  "client.roomListFailure": PURE,
  "client.ssoStepupRequired": PURE,
  "client.ssoStepupStartUrl": URL_BUILDER,
  "client.classifyApiFailure": PURE,
  "client.apiFailureMessage": PURE,
  "client.apiErrorMessage": PURE,
  "client.boundedExchange": "the transport every operation shares (AC-3 tests it through requestApi and apiFetch)",
  "client.interpretResponse": "the transport every operation shares (AC-3 tests it through requestApi and apiFetch)",
  "client.requestApi": "the transport every operation shares (AC-3 tests it directly)",
  "client.formatAuditDetails": PURE,
  "client.disconnectNotice": PURE,
  "client.describeAuditEntry": PURE,
  "client.normalizeAuditEntries": PURE,
  "client.isValidHHMM": PURE,
  "client.normalizeWorkingHours": PURE,
  "client.normalizeLunchBreaks": PURE,
  "client.normalizeSettings": PURE,
  "client.settingsRequestBody": PURE,
  "client.settingsPatchBody": PURE,
  "client.llmTestBody": PURE,
  "client.normalizeAttendees": PURE,
  "client.normalizeEvents": PURE,
  "client.conferenceRequestBody": PURE,
  "client.normalizeConferenceProviders": PURE,
  "client.isValidConferenceUrl": PURE,
  "client.connectStartPath": URL_BUILDER,
  "api.zoomConnectUrl": URL_BUILDER,
  "api.health": "the background probe: excluded from AC-7, covered by AC-8 (it has no caller data to invent)",
  // schedulingLinks.ts
  "schedulingLinks.validateLinkForm": PURE,
  "schedulingLinks.publicBookingUrl": URL_BUILDER,
  "schedulingLinks.publicBookingDisplayUrl": URL_BUILDER,
  "schedulingLinks.newBookingAttemptKey": "PAC-82: makes a booking attempt's Idempotency-Key, no request",
  // teams.ts
  "teams.normalizeInvite": PURE,
  "teams.validateTeamName": PURE,
  "teams.validateTeamEmail": PURE,
  "teams.validateZoneInput": PURE,
  "teams.validateAvailabilityQuery": PURE,
  "teams.unwrapTeamList": PURE,
  "teams.unwrapTeam": PURE,
  "teams.fmtTime": PURE,
  "teamsApi.currentUserEmail": STORE,
  "teamsApi.setCurrentUserEmail": STORE,
  "teamsApi.list": STORE,
  "teamsApi.get": STORE,
  "teamsApi.activeTeamId": STORE,
  "teamsApi.setActiveTeam": STORE,
  "teamsApi.createTeam": STORE,
  "teamsApi.renameTeam": STORE,
  "teamsApi.deleteTeam": STORE,
  "teamsApi.inviteMember": STORE,
  "teamsApi.acceptInvite": STORE,
  "teamsApi.removeMember": STORE,
  "teamsApi.addZone": STORE,
  "teamsApi.updateZone": STORE,
  "teamsApi.removeZone": STORE,
  "teamsApi.resetAll": STORE,
  // manager.ts
  "manager.cadenceDays": PURE,
  "manager.cadenceLabel": PURE,
  "manager.computeDaysOverdue": PURE,
  "manager.validateMemberInput": PURE,
  "manager.validateCadencePatch": PURE,
  "manager.normalizeRemoteMember": PURE,
  "manager.requireTeamId": PURE,
  "manager.normalizeGaps": PURE,
  "manager.normalizeAnalytics": PURE,
  "managerApi.getProfile": STORE,
  "managerApi.setProfile": STORE,
  "managerApi.listTeam": STORE,
  "managerApi.addMember": STORE,
  "managerApi.updateMember": STORE,
  "managerApi.removeMember": STORE,
  "managerApi.lastScanAt": STORE,
  "managerApi.gaps": STORE,
  "managerApi.schedulePrefillUrl": STORE,
  "managerApi.resetAll": STORE,
};
