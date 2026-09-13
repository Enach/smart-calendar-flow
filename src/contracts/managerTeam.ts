import { z } from "zod";

export const cadenceSchema = z.enum(["weekly", "biweekly", "monthly", "custom", "none"]);

export const memberWeekSchema = z.object({
  focus_minutes: z.number().int(),
  meeting_minutes: z.number().int(),
  free_minutes: z.number().int(),
  data_available: z.boolean(),
}).strict();

export const managerMemberSchema = z.object({
  email: z.string().email(),
  display_name: z.string(),
  source: z.enum(["auto", "manual", "formal"]),
  cadence: cadenceSchema,
  cadence_custom_days: z.number().int().min(1).max(365).nullable(),
  last_one_on_one_at: z.string().datetime().nullable(),
  is_paceday_user: z.boolean(),
  this_week: memberWeekSchema,
  last_week: memberWeekSchema,
  focus_trend_pct: z.number().finite(),
}).strict();

export const managerRosterSchema = z.object({
  team_id: z.string().uuid(),
  members: z.array(managerMemberSchema),
}).strict();

export const scanCandidateSchema = z.object({
  email: z.string().email(),
  display_name: z.string(),
  already_assigned: z.boolean(),
}).strict();

export const scanPreviewSchema = z.object({
  team_id: z.string().uuid(),
  scanned_at: z.string().datetime(),
  detected: z.number().int().nonnegative(),
  eligible: z.number().int().nonnegative(),
  assigned: z.literal(0),
  skipped: z.number().int().nonnegative(),
  candidates: z.array(scanCandidateSchema),
}).strict();

export const scanConfirmationSchema = z.object({
  team_id: z.string().uuid(),
  assigned: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
}).strict();

export type ManagerMemberWire = z.infer<typeof managerMemberSchema>;
export type ManagerRosterWire = z.infer<typeof managerRosterSchema>;
export type ScanPreview = z.infer<typeof scanPreviewSchema>;
export type ScanConfirmation = z.infer<typeof scanConfirmationSchema>;
