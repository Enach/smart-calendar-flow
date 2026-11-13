import type { ApiEffect } from "./client";

/**
 * PAC-83 (contract §3.3): the effect of every operation that sends a request
 * — the single source both the UI (`effectOf`) and the AC-7 test read. It is
 * chosen per operation, never derived from the HTTP method: several reads are
 * POSTs (freebusy, scheduleSuggest, compressionPreview, nlpParse, llmTest).
 * noInventedData.test.ts fails if an API_OPERATIONS entry has no effect here,
 * or if an effect names an operation that no longer exists.
 */
export const OPERATION_EFFECTS = {
  "api.freebusy": "read",
  "api.authStatus": "read",
  "api.integrationAvailability": "read",
  // PAC-71: the connect start writes nothing the user owns — it answers the
  // provider's authorize_url (and a pending state the next start replaces), so
  // a lost answer is safely retried: a read, although it is a POST.
  "api.startConnect": "read",
  // PAC-71: PATCH /api/settings with only calendarProvider.
  "api.saveWorkCalendar": "write",
  "api.authDisconnect": "write",
  "api.getSettings": "read",
  "api.updateSettings": "write",
  "api.getEvents": "read",
  "api.runFocus": "write",
  "api.getFocusBlocks": "read",
  "api.clearFocusBlocks": "write",
  "api.scheduleSuggest": "read",
  "api.scheduleCreate": "write",
  "api.compressionPreview": "read",
  "api.compressionApply": "write",
  "api.nlpParse": "read",
  "api.nlpConfirm": "write",
  "api.getAudit": "read",
  "api.listPersonalCalendars": "read",
  "api.addPersonalCalendar": "write",
  "api.updatePersonalCalendar": "write",
  "api.deletePersonalCalendar": "write",
  "api.syncPersonalCalendar": "write",
  "api.llmTest": "read",
  "api.updateEvent": "write",
  "api.deleteEvent": "write",
  "api.searchRooms": "read",
  "api.suggestAttendees": "read",
  "api.addConference": "write",
  "api.removeConference": "write",
  "api.conferenceProviders": "read",
  "api.zoomDisconnect": "write",
  "api.microsoftDisconnect": "write",
  "schedulingLinksApi.listLinks": "read",
  "schedulingLinksApi.listInvites": "read",
  "schedulingLinksApi.acceptInvite": "write",
  "schedulingLinksApi.declineInvite": "write",
  "schedulingLinksApi.createLink": "write",
  "schedulingLinksApi.updateLink": "write",
  "schedulingLinksApi.deleteLink": "write",
  "schedulingLinksApi.leaveLink": "write",
  "schedulingLinksApi.listBookings": "read",
  "schedulingLinksApi.listArchive": "read",
  "schedulingLinksApi.getArchivedLink": "read",
  "schedulingLinksApi.getPublicLink": "read",
  "schedulingLinksApi.getPublicSlots": "read",
  "schedulingLinksApi.bookSlot": "booking",
  "teamInvitesApi.get": "read",
  "teamInvitesApi.accept": "write",
  "teams.list": "read",
  "teams.get": "read",
  "teams.createTeam": "write",
  "teams.renameTeam": "write",
  "teams.deleteTeam": "write",
  "teams.inviteMember": "write",
  "teams.removeMember": "write",
  "teams.addZone": "write",
  "teams.updateZone": "write",
  "teams.removeZone": "write",
  "teams.findSlots": "read",
  "teams.teamAnalytics": "read",
  "manager.getProfile": "read",
  "manager.setProfile": "write",
  "manager.listTeam": "read",
  "manager.addMember": "write",
  "manager.updateMember": "write",
  "manager.removeMember": "write",
  // POST /api/manager/detect assigns nothing to the team, but the contract
  // (previewManagerDetection) says the scan writes the global identity rows and
  // 1:1 occurrences as a side effect — so its budget 503 does not prove nothing
  // was written: a write.
  "manager.detect": "write",
  "manager.confirmDetect": "write",
  "manager.gaps": "read",
  "manager.analytics": "read",
  "manager.schedulePrefillUrl": "write",
  "standalone.fetchSsoStepupOptions": "read",
  "standalone.fetchOrganizationAI": "read",
  "standalone.patchOrganizationAI": "write",
  "standalone.chooseOrganizationAIChoice": "write",
  "standalone.confirmOrganizationAI": "write",
} as const satisfies Record<string, ApiEffect>;

export type OperationKey = keyof typeof OPERATION_EFFECTS;

/** The effect of `op`, for apiErrorMessage / ApiErrorNotice at the call site. */
export function effectOf(op: OperationKey): ApiEffect {
  return OPERATION_EFFECTS[op];
}
