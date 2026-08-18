import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Save, Zap, RefreshCw, ScrollText, User, Users } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { MockBanner } from "@/components/MockBanner";
import { WorkCalendarConnection } from "@/components/WorkCalendarConnection";
import { PersonalCalendarsSection } from "@/components/PersonalCalendarsSection";
import { ConferencingSection } from "@/components/ConferencingSection";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { toast } from "@/hooks/useToast";
import { api, apiErrorMessage } from "@/api/client";
import { managerApi } from "@/api/manager";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { LLMProvider, Settings } from "@/api/types";
import { LunchBreaksEditor, WorkingHoursEditor } from "@/components/settings/WorkingHoursEditor";
import {
  SCHEDULING_TEMPLATES,
  defaultWorkingHours,
  emptyLunchBreaks,
  matchTemplate,
  templatePatch,
  validateLunchBreaks,
  validateWorkingHours,
  type SchedulingTemplateId,
} from "@/lib/schedulingPresets";


const TIMEZONES = [
  "UTC",
  "Europe/Paris",
  "Europe/London",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Australia/Sydney",
  "Pacific/Auckland",
];

const LLM_PROVIDERS: Array<{ value: LLMProvider; label: string }> = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "ollama", label: "Ollama (local)" },
  { value: "bedrock", label: "AWS Bedrock (Claude)" },
  { value: "azure_openai", label: "Azure OpenAI (ChatGPT)" },
];

const BEDROCK_MODELS = [
  "claude-opus-4-5",
  "claude-sonnet-4-5",
  "claude-haiku-4-5-20251001",
];

function fmtHM(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="mb-4">
        <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-foreground">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

const inputCls =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground transition placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked ? "bg-primary" : "bg-muted"}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${
            checked ? "left-[18px]" : "left-0.5"
          }`}
        />
      </button>
      {label && <span className="text-sm text-foreground">{label}</span>}
    </label>
  );
}

export default function SettingsPage() {
  const { data, isLoading } = useSettings();
  const update = useUpdateSettings();
  const [draft, setDraft] = useState<Settings | null>(null);

  useEffect(() => {
    if (data && !draft) {
      // The server response is the source of truth. workingHours is only seeded
      // from the global work_start/work_end pair when the payload omitted it,
      // and it is then persisted through PUT /api/settings like any other field.
      setDraft({
        ...data,
        working_hours: data.working_hours ?? defaultWorkingHours(data.work_start, data.work_end),
      });
    }
  }, [data, draft]);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => {
    setDraft((d) => (d ? { ...d, [k]: v } : d));
  };
  const patchDraft = (patch: Partial<Settings>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };

  const [llmTesting, setLlmTesting] = useState(false);
  const testLlm = async () => {
    if (!draft) return;
    setLlmTesting(true);
    try {
      const res = await api.llmTest(draft);
      if (res.ok) {
        toast.success(res.message || "Connection OK");
      } else {
        toast.error(res.message || "Test failed");
      }
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setLlmTesting(false);
    }
  };

  const supportsPerDay = !!data?.working_hours;
  const template: SchedulingTemplateId = draft ? matchTemplate(draft) : "custom";
  const applyTemplate = (id: SchedulingTemplateId) => {
    setDraft((d) => {
      if (!d) return d;
      const patch = templatePatch(id, d);
      return patch ? { ...d, ...patch } : d;
    });
  };
  const lunchOverride = !!draft?.lunch_breaks;
  const workingHoursError = draft?.working_hours ? validateWorkingHours(draft.working_hours) : null;
  const lunchError = draft?.lunch_breaks ? validateLunchBreaks(draft.lunch_breaks) : null;

  const save = async () => {
    if (!draft) return;
    const invalid = workingHoursError ?? lunchError;
    if (invalid) {
      toast.error(invalid);
      return;
    }
    try {
      // The draft is intentionally kept as-is on failure so nothing is lost.
      const saved = await update.mutateAsync(draft);
      setDraft({ ...saved });
      toast.success("Settings saved");
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  };


  if (isLoading || !draft) {
    return (
      <div className="min-h-screen bg-muted/30">
        <Navbar />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <MockBanner />
      <Navbar />
      <main className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
        <div className="mb-2 flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
            <p className="mt-1 text-sm text-muted-foreground">Configure how Paceday manages your calendar.</p>
          </div>
          <button
            onClick={save}
            disabled={update.isPending}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:opacity-50"
          >
            {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save changes
          </button>
        </div>

        <ProfileSection />

        <Section title="Activity" description="Every action Paceday took on your calendar.">
          <Link
            to="/settings/audit"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
          >
            <ScrollText className="h-4 w-4 text-muted-foreground" />
            Open audit log
          </Link>
        </Section>

        <Section
          title="Scheduling template"
          description="Pick a starting point, then fine-tune below. Nothing is saved until you press Save changes."
        >
          <div className="grid gap-2 sm:grid-cols-3">
            {SCHEDULING_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => applyTemplate(t.id)}
                className={
                  "rounded-xl border p-3 text-left transition " +
                  (template === t.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/40")
                }
              >
                <span className="block text-sm font-medium text-foreground">{t.label}</span>
                <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">
                  {t.description}
                </span>
              </button>
            ))}
          </div>
        </Section>

        <Section title="Working Hours" description="When you're available for meetings.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Start">
              <input
                type="time"
                value={draft.work_start}
                onChange={(e) => set("work_start", e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="End">
              <input
                type="time"
                value={draft.work_end}
                onChange={(e) => set("work_end", e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Timezone">
              <select
                value={draft.timezone}
                onChange={(e) => set("timezone", e.target.value)}
                className={inputCls}
              >
                {TIMEZONES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="mt-5 border-t border-border pt-4">
            <p className="mb-3 text-xs font-medium text-foreground">Day-by-day hours</p>
            <WorkingHoursEditor
              value={draft.working_hours ?? defaultWorkingHours(draft.work_start, draft.work_end)}
              onChange={(next) => set("working_hours", next)}
            />
          </div>
        </Section>


        <Section title="Focus Time" description="Auto-scheduled deep work blocks.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Min block (minutes)">
              <input
                type="number"
                min={15}
                step={15}
                value={draft.focus_min_block_minutes}
                onChange={(e) => set("focus_min_block_minutes", Number(e.target.value))}
                className={inputCls}
              />
            </Field>
            <Field label="Max block (minutes)">
              <input
                type="number"
                min={15}
                step={15}
                value={draft.focus_max_block_minutes}
                onChange={(e) => set("focus_max_block_minutes", Number(e.target.value))}
                className={inputCls}
              />
            </Field>
            <Field label="Daily target (minutes)" hint={fmtHM(draft.focus_daily_target_minutes)}>
              <input
                type="number"
                min={0}
                step={15}
                value={draft.focus_daily_target_minutes}
                onChange={(e) => set("focus_daily_target_minutes", Number(e.target.value))}
                className={inputCls}
              />
            </Field>
            <Field label="Label">
              <input
                type="text"
                value={draft.focus_label}
                onChange={(e) => set("focus_label", e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Color">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={draft.focus_color}
                  onChange={(e) => set("focus_color", e.target.value)}
                  className="h-10 w-12 cursor-pointer rounded-lg border border-input bg-background"
                />
                <input
                  type="text"
                  value={draft.focus_color}
                  onChange={(e) => set("focus_color", e.target.value)}
                  className={inputCls}
                />
              </div>
            </Field>
            <div className="sm:col-span-2">
              <Toggle
                checked={draft.auto_schedule_enabled}
                onChange={(v) => set("auto_schedule_enabled", v)}
                label="Auto-schedule focus time"
              />
            </div>
            {draft.auto_schedule_enabled && (
              <div className="sm:col-span-2">
                <Field
                  label="Cron schedule"
                  hint="e.g. 0 7 * * 1-5 = weekdays at 7am"
                >
                  <input
                    type="text"
                    value={draft.auto_schedule_cron}
                    onChange={(e) => set("auto_schedule_cron", e.target.value)}
                    className={inputCls}
                  />
                </Field>
              </div>
            )}
          </div>
        </Section>

        <Section title="Lunch Break">
          <div className="space-y-4">
            <Toggle
              checked={draft.protect_lunch}
              onChange={(v) => set("protect_lunch", v)}
              label="Protect lunch break"
            />
            {draft.protect_lunch && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Start">
                  <input
                    type="time"
                    value={draft.lunch_start}
                    onChange={(e) => set("lunch_start", e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="End">
                  <input
                    type="time"
                    value={draft.lunch_end}
                    onChange={(e) => set("lunch_end", e.target.value)}
                    className={inputCls}
                  />
                </Field>
              </div>
            )}

            {draft.protect_lunch && (
              <div className="border-t border-border pt-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => set("lunch_breaks", undefined)}
                    className={
                      "rounded-lg border px-3 py-1.5 text-xs font-medium transition " +
                      (!lunchOverride
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground")
                    }
                  >
                    Use the template lunch
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      set("lunch_breaks", draft.lunch_breaks ?? emptyLunchBreaks(draft.lunch_start, draft.lunch_end))
                    }
                    className={
                      "rounded-lg border px-3 py-1.5 text-xs font-medium transition " +
                      (lunchOverride
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground")
                    }
                  >
                    Override by day
                  </button>
                </div>
                {lunchOverride && draft.lunch_breaks && (
                  <div className="mt-4">
                    <LunchBreaksEditor
                      value={draft.lunch_breaks}
                      onChange={(next) => set("lunch_breaks", next)}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </Section>


        <Section title="Meeting Buffers" description="Add breathing room between meetings.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Buffer before (minutes)">
              <input
                type="number"
                min={0}
                step={5}
                value={draft.buffer_before_minutes}
                onChange={(e) => set("buffer_before_minutes", Number(e.target.value))}
                className={inputCls}
              />
            </Field>
            <Field label="Buffer after (minutes)">
              <input
                type="number"
                min={0}
                step={5}
                value={draft.buffer_after_minutes}
                onChange={(e) => set("buffer_after_minutes", Number(e.target.value))}
                className={inputCls}
              />
            </Field>
          </div>
        </Section>

        <Section title="Meeting Compression">
          <Toggle
            checked={draft.compression_enabled}
            onChange={(v) => set("compression_enabled", v)}
            label="Enable meeting compression"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            When enabled, suggests rearranging your internal meetings to create larger Focus Time blocks.
          </p>
        </Section>

        <Section
          title="Calendar Connection"
          description="Choose which work calendar Paceday reads and writes to."
        >
          <div className="space-y-4">
            <WorkCalendarConnection settings={draft} onPatch={patchDraft} />
            <Field label="Calendar ID">
              <input
                type="text"
                value={draft.calendar_id ?? "primary"}
                onChange={(e) => set("calendar_id", e.target.value)}
                className={inputCls}
                placeholder="primary"
              />
            </Field>
          </div>
        </Section>

        <Section
          title="Personal Calendars"
          description="Block out your personal time so the scheduler never books over it."
        >
          <PersonalCalendarsSection />
        </Section>

        <Section
          title="Conferencing"
          description="Choose where meeting links come from when you add one to an event."
        >
          <ConferencingSection settings={draft} onPatch={patchDraft} />
        </Section>

        <Section title="AI / NLP" description="The model used to interpret natural-language scheduling commands.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Provider">
              <select
                value={draft.llm_provider}
                onChange={(e) => set("llm_provider", e.target.value)}
                className={inputCls}
              >
                {LLM_PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>

            {draft.llm_provider === "bedrock" ? (
              <Field label="Model">
                <select
                  value={draft.llm_model}
                  onChange={(e) => set("llm_model", e.target.value)}
                  className={inputCls}
                >
                  {BEDROCK_MODELS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field label="Model">
                <input
                  type="text"
                  value={draft.llm_model}
                  onChange={(e) => set("llm_model", e.target.value)}
                  className={inputCls}
                  placeholder={
                    draft.llm_provider === "ollama"
                      ? "llama3"
                      : draft.llm_provider === "azure_openai"
                        ? "gpt-4o"
                        : "gpt-4o-mini"
                  }
                />
              </Field>
            )}

            {/* Bedrock-specific */}
            {draft.llm_provider === "bedrock" && (
              <>
                <Field label="AWS Region">
                  <input
                    type="text"
                    value={draft.aws_region ?? ""}
                    onChange={(e) => set("aws_region", e.target.value)}
                    className={inputCls}
                    placeholder="us-east-1"
                  />
                </Field>
                <Field label="AWS Profile" hint="Optional — leave empty to use the default credential chain.">
                  <input
                    type="text"
                    value={draft.aws_profile ?? ""}
                    onChange={(e) => set("aws_profile", e.target.value)}
                    className={inputCls}
                    placeholder="default"
                  />
                </Field>
              </>
            )}

            {/* Azure-specific */}
            {draft.llm_provider === "azure_openai" && (
              <>
                <Field label="Azure Endpoint">
                  <input
                    type="text"
                    value={draft.azure_endpoint ?? ""}
                    onChange={(e) => set("azure_endpoint", e.target.value)}
                    className={inputCls}
                    placeholder="https://your-resource.openai.azure.com"
                  />
                </Field>
                <Field label="Deployment">
                  <input
                    type="text"
                    value={draft.azure_deployment ?? ""}
                    onChange={(e) => set("azure_deployment", e.target.value)}
                    className={inputCls}
                    placeholder="gpt-4o"
                  />
                </Field>
                <Field label="API Version">
                  <input
                    type="text"
                    value={draft.azure_api_version ?? "2024-02-01"}
                    onChange={(e) => set("azure_api_version", e.target.value)}
                    className={inputCls}
                    placeholder="2024-02-01"
                  />
                </Field>
              </>
            )}

            {/* Ollama-specific */}
            {draft.llm_provider === "ollama" && (
              <Field label="Base URL">
                <input
                  type="text"
                  value={draft.llm_base_url ?? ""}
                  onChange={(e) => set("llm_base_url", e.target.value)}
                  className={inputCls}
                  placeholder="http://localhost:11434"
                />
              </Field>
            )}

            {/* Legacy API key for openai/anthropic */}
            {(draft.llm_provider === "openai" || draft.llm_provider === "anthropic") && (
              <Field label="API key">
                <input
                  type="password"
                  value={draft.llm_api_key ?? ""}
                  onChange={(e) => set("llm_api_key", e.target.value)}
                  className={inputCls}
                  placeholder="••••••••"
                />
              </Field>
            )}
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={testLlm}
              disabled={llmTesting}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted disabled:opacity-50"
            >
              {llmTesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
              Test connection
            </button>
            <p className="text-[11px] text-muted-foreground">
              Sends a small probe to the selected provider using the values above.
            </p>
          </div>
        </Section>
      </main>
    </div>
  );
}

// ============================================================
// Profile section (manager / IC role) — added for T-43.
// ============================================================

function ProfileSection() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(() => managerApi.getProfile());
  const [confirmSwitch, setConfirmSwitch] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanLabel, setScanLabel] = useState<string | null>(null);
  const lastScan = managerApi.lastScanAt();

  const setRole = (manager: boolean) => {
    if (profile.is_manager && !manager) {
      // Switching from Manager → IC requires confirmation
      setConfirmSwitch(true);
      return;
    }
    if (!profile.is_manager && manager) {
      const next = managerApi.setProfile({
        is_manager: true,
        onboarding_profile_selected: true,
      });
      void managerApi.remote.setProfile({ is_manager: true, onboarding_profile_selected: true });
      setProfile(next);
      toast.success("Manager mode enabled. Detecting your team from calendar…");
      managerApi
        .detect()
        .then((r) => {
          if (r.added > 0) {
            toast.success(`${r.added} team member${r.added === 1 ? "" : "s"} detected from your 1:1s. View in My Team.`);
          }
        })
        .catch(() => undefined);
    }
  };

  const confirmSwitchToIC = () => {
    const next = managerApi.setProfile({ is_manager: false });
    void managerApi.remote.setProfile({ is_manager: false });
    setProfile(next);
    setConfirmSwitch(false);
    toast.success("Switched to Individual contributor.");
  };

  const rescan = async () => {
    setScanning(true);
    setScanLabel(null);
    try {
      const r = await managerApi.remote.detect();
      setScanLabel(r.added > 0 ? `${r.added} new member${r.added === 1 ? "" : "s"} found` : "No new members found");
    } finally {
      setScanning(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="mb-4">
        <h2 className="text-base font-semibold tracking-tight text-foreground">Your profile</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          We tailor Paceday to how you use your calendar.
        </p>
      </div>

      <label className="mb-2 block text-xs font-medium text-foreground">Role</label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setRole(false)}
          className={
            "inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold transition " +
            (!profile.is_manager
              ? "border-transparent bg-[#5B7FFF] text-white"
              : "border-border bg-background text-foreground hover:bg-muted")
          }
        >
          <User className="h-3.5 w-3.5" />
          Individual contributor
        </button>
        <button
          type="button"
          onClick={() => setRole(true)}
          className={
            "inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold transition " +
            (profile.is_manager
              ? "border-transparent bg-[#9B7AE0] text-white"
              : "border-border bg-background text-foreground hover:bg-muted")
          }
        >
          <Users className="h-3.5 w-3.5" />
          Manager
        </button>
      </div>

      {profile.is_manager && (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={rescan}
            disabled={scanning}
            className="inline-flex items-center gap-1.5 text-[#5B7FFF] hover:underline disabled:opacity-60"
          >
            {scanning ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Re-scan calendar for team members
          </button>
          {scanLabel && <span className="text-foreground">· {scanLabel}</span>}
          {lastScan && !scanLabel && (
            <span>· Last scanned: {new Date(lastScan).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
          )}
          <span className="ml-auto">
            <button
              type="button"
              onClick={() => navigate("/app/team")}
              className="text-[#5B7FFF] hover:underline"
            >
              Open My Team →
            </button>
          </span>
        </div>
      )}

      <AlertDialog open={confirmSwitch} onOpenChange={setConfirmSwitch}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch to Individual contributor?</AlertDialogTitle>
            <AlertDialogDescription>
              Your team list and 1:1 cadences will be kept but the My Team sidebar item will be hidden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmSwitchToIC}
              className="bg-[#5B7FFF] text-white hover:bg-[#5B7FFF]/90"
            >
              Switch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
