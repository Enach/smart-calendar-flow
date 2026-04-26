import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import { useQueryClient } from "@tanstack/react-query";

import { Navbar } from "@/components/Navbar";
import { NLPBar } from "@/components/NLPBar";
import { NLPConfirmModal } from "@/components/NLPConfirmModal";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { TodayAgenda } from "@/components/TodayAgenda";
import { FocusStats } from "@/components/FocusStats";
import { QuickActions } from "@/components/QuickActions";
import { EventDrawer } from "@/components/EventDrawer";
import { MockBanner } from "@/components/MockBanner";
import { LoadingOverlay } from "@/components/ui/spinner";
import { InlineError } from "@/components/ui/inline-error";

import { useSettings } from "@/hooks/useSettings";
import { useCalendarEvents } from "@/hooks/useCalendarEvents";
import { api } from "@/api/client";
import { toast } from "@/hooks/useToast";
import type { CalendarEvent, ParseResult } from "@/api/types";

type CalView = "timeGridDay" | "timeGridWeek" | "dayGridMonth";
const VIEW_STORAGE_KEY = "calendar.view";

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}
function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}
function dateOnly(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function loadInitialView(): CalView {
  if (typeof window === "undefined") return "timeGridWeek";
  const v = window.localStorage.getItem(VIEW_STORAGE_KEY);
  if (v === "timeGridDay" || v === "timeGridWeek" || v === "dayGridMonth") return v;
  return "timeGridWeek";
}

export default function Dashboard() {
  const calRef = useRef<FullCalendar | null>(null);
  const qc = useQueryClient();

  const [view, setView] = useState<CalView>(() => loadInitialView());
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [titleLabel, setTitleLabel] = useState<string>("");
  const [rangeStart, setRangeStart] = useState<Date>(() => startOfWeek(new Date()));
  const [rangeEnd, setRangeEnd] = useState<Date>(() => {
    const d = startOfWeek(new Date());
    d.setDate(d.getDate() + 7);
    return d;
  });

  const weekISO = useMemo(() => dateOnly(startOfWeek(currentDate)), [currentDate]);

  const { data: settings } = useSettings();
  const {
    data: eventsRaw,
    isLoading: eventsLoading,
    isFetching: eventsFetching,
    isError: eventsError,
    refetch: refetchEvents,
  } = useCalendarEvents(rangeStart.toISOString(), rangeEnd.toISOString());
  const events = Array.isArray(eventsRaw) ? eventsRaw : [];

  const [nlpInitial, setNlpInitial] = useState<string>("");
  const [nlpLoading, setNlpLoading] = useState(false);
  const [nlpError, setNlpError] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [popoverEvent, setPopoverEvent] = useState<CalendarEvent | null>(null);

  // Persist view selection
  useEffect(() => {
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, view);
    } catch {
      /* ignore */
    }
  }, [view]);

  const changeView = useCallback((next: CalView) => {
    setView(next);
    calRef.current?.getApi().changeView(next);
  }, []);

  // Keyboard shortcuts: d / w / m
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) return;
      }
      if (e.key === "d") changeView("timeGridDay");
      else if (e.key === "w") changeView("timeGridWeek");
      else if (e.key === "m") changeView("dayGridMonth");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [changeView]);

  const handleNLP = useCallback(async (text: string) => {
    setNlpLoading(true);
    setNlpError(null);
    try {
      const res = await api.nlpParse(text);
      if (res.intent === "schedule_meeting") {
        if (!res.suggested_slots?.length) {
          setNlpError("No available slots found for that request.");
        } else {
          setParseResult(res);
        }
      } else if (res.intent === "schedule_focus") {
        toast.success("Scheduling focus time…");
        await api.runFocus(weekISO);
        qc.invalidateQueries({ queryKey: ["events"] });
        qc.invalidateQueries({ queryKey: ["focusBlocks"] });
        toast.success("Focus time scheduled");
      } else {
        setNlpError(res.error || "Sorry, I couldn't understand that request.");
      }
    } catch {
      setNlpError("Network error. Please try again.");
    } finally {
      setNlpLoading(false);
    }
  }, [qc, weekISO]);

  const handleConfirm = useCallback(async (slotIndex: number) => {
    if (!parseResult) return;
    setConfirming(true);
    try {
      const ev = await api.nlpConfirm(parseResult, slotIndex);
      toast.success(`Scheduled "${ev.title}"`);
      setParseResult(null);
      setNlpInitial("");
      qc.invalidateQueries({ queryKey: ["events"] });
    } catch {
      toast.error("Failed to schedule meeting");
    } finally {
      setConfirming(false);
    }
  }, [parseResult, qc]);

  // Drag-to-reschedule + resize-to-extend handlers
  const handleEventChange = useCallback(
    async (
      info: {
        event: { id: string; title: string; start: Date | null; end: Date | null };
        revert: () => void;
      },
      kind: "drop" | "resize",
    ) => {
      const { event, revert } = info;
      if (!event.start || !event.end) {
        revert();
        return;
      }
      const start = event.start.toISOString();
      const end = event.end.toISOString();
      try {
        await api.updateEvent(event.id, { start, end }, "none");
        qc.invalidateQueries({ queryKey: ["events"] });
        qc.invalidateQueries({ queryKey: ["focusBlocks"] });
        toast.success(
          kind === "drop"
            ? `Moved "${event.title}"`
            : `Resized "${event.title}"`,
        );
      } catch {
        revert();
        toast.error(kind === "drop" ? "Failed to move event" : "Failed to resize event");
      }
    },
    [qc],
  );

  const fcEvents = useMemo(
    () =>
      events.map((e) => {
        const isFocus =
          e.is_focus_block ||
          (settings && e.title.toLowerCase().includes((settings.focus_label || "focus").toLowerCase()));
        const isPersonal = !!e.is_personal_block || /personal time/i.test(e.title);
        const color = isFocus
          ? settings?.focus_color || e.color || "#7C3AED"
          : isPersonal
            ? "#6B7280"
            : e.color || "#3B82F6";
        const displayTitle = isFocus
          ? `🎯 ${e.title.replace(/^🎯\s*/, "")}`
          : isPersonal
            ? `🏠 ${e.title.replace(/^🏠\s*/, "")}`
            : e.title;
        // Soften the fill so the colored accent bar pops while keeping the chip readable
        const bg = `${color}26`; // ~15% alpha
        return {
          id: e.id,
          title: displayTitle,
          start: e.start,
          end: e.end,
          backgroundColor: bg,
          borderColor: color,
          textColor: color,
          editable: !isFocus && !isPersonal,
          extendedProps: { raw: e, isFocus, isPersonal, accent: color },
        };
      }),
    [events, settings],
  );

  // Navigation helpers wired to FullCalendar's API so they work in any view
  const goPrev = () => calRef.current?.getApi().prev();
  const goNext = () => calRef.current?.getApi().next();
  const goToday = () => calRef.current?.getApi().today();

  return (
    <div className="min-h-screen bg-muted/30">
      <MockBanner />
      <Navbar
        weekLabel={titleLabel}
        onPrevWeek={goPrev}
        onNextWeek={goNext}
        onToday={goToday}
      />

      <main className="mx-auto w-full max-w-[1600px] space-y-4 p-4 sm:p-6">
        <NLPBar
          initialValue={nlpInitial}
          loading={nlpLoading}
          error={nlpError}
          onSubmit={handleNLP}
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
          {/* Calendar */}
          <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            {/* Calendar toolbar */}
            <div className="flex items-center justify-between gap-3 border-b border-border bg-card/60 px-4 py-3">
              <p className="text-sm font-semibold text-foreground">{titleLabel || "Calendar"}</p>
              <div
                role="group"
                aria-label="Calendar view"
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-background p-1"
              >
                {([
                  { key: "timeGridDay", label: "Day", hint: "d" },
                  { key: "timeGridWeek", label: "Week", hint: "w" },
                  { key: "dayGridMonth", label: "Month", hint: "m" },
                ] as { key: CalView; label: string; hint: string }[]).map((opt) => {
                  const active = view === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => changeView(opt.key)}
                      aria-pressed={active}
                      title={`${opt.label} (${opt.hint})`}
                      className={
                        "rounded-md px-3 py-1 text-xs font-medium transition " +
                        (active
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground")
                      }
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="relative p-3 sm:p-4">
            <LoadingOverlay
              show={eventsLoading || (eventsFetching && events.length === 0)}
              label="Loading events…"
            />
            <FullCalendar
              ref={calRef}
              plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
              initialView={view}
              initialDate={currentDate}
              headerToolbar={false}
              firstDay={1}
              allDaySlot={false}
              nowIndicator
              slotDuration="00:30:00"
              slotMinTime="07:00:00"
              slotMaxTime="21:00:00"
              expandRows
              height="auto"
              contentHeight={680}
              views={{
                timeGridDay: {
                  titleFormat: { weekday: "long", month: "long", day: "numeric", year: "numeric" },
                },
                timeGridWeek: {},
                dayGridMonth: {
                  dayMaxEvents: 3,
                  moreLinkClick: "day",
                },
              }}
              businessHours={
                settings
                  ? {
                      daysOfWeek: [1, 2, 3, 4, 5],
                      startTime: settings.work_start,
                      endTime: settings.work_end,
                    }
                  : undefined
              }
              events={fcEvents}
              editable
              eventStartEditable
              eventDurationEditable
              eventResizableFromStart
              dragRevertDuration={150}
              snapDuration="00:15:00"
              eventDrop={(arg) => handleEventChange(arg, "drop")}
              eventResize={(arg) => handleEventChange(arg, "resize")}
              selectable
              select={(arg) => {
                const day = arg.start.toLocaleDateString(undefined, { weekday: "long" });
                const time = arg.start.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
                setNlpInitial(`Schedule a 30 min meeting on ${day} at ${time}`);
                arg.view.calendar.unselect();
              }}
              eventClick={(arg) => {
                const raw = arg.event.extendedProps.raw as CalendarEvent | undefined;
                if (raw) setPopoverEvent(raw);
              }}
              datesSet={(arg) => {
                setRangeStart(arg.start);
                setRangeEnd(arg.end);
                setCurrentDate(arg.view.currentStart);
                setTitleLabel(arg.view.title);
                const t = arg.view.type as CalView;
                if (t === "timeGridDay" || t === "timeGridWeek" || t === "dayGridMonth") {
                  if (t !== view) setView(t);
                }
              }}
            />
            </div>
          </section>

          {/* Sidebar */}
          <aside className="space-y-4">
            <ConnectionStatus />
            <TodayAgenda events={events} loading={eventsLoading} />
            {settings && (
              <FocusStats
                weekISO={weekISO}
                dailyTargetMinutes={settings.focus_daily_target_minutes}
                focusColor={settings.focus_color}
              />
            )}
            <QuickActions weekISO={weekISO} />
          </aside>
        </div>
      </main>

      {parseResult && (
        <NLPConfirmModal
          parseResult={parseResult}
          loading={confirming}
          onClose={() => setParseResult(null)}
          onConfirm={handleConfirm}
        />
      )}
      {popoverEvent && (
        <EventDrawer
          event={popoverEvent}
          events={events}
          workStart={settings?.work_start ?? "09:00"}
          workEnd={settings?.work_end ?? "18:00"}
          onClose={() => setPopoverEvent(null)}
        />
      )}
    </div>
  );
}
