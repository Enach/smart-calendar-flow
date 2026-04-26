import { Link } from "react-router-dom";
import type { ReactNode } from "react";

/* ---------- shared brand mark ---------- */

export function PacedayMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 22 22" className={className} aria-hidden="true">
      <rect x="0.5" y="0.5" width="6" height="6" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="8" y="8" width="6" height="6" rx="1" fill="currentColor" />
      <rect x="15.5" y="0.5" width="6" height="6" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="0.5" y="15.5" width="6" height="6" rx="1" fill="currentColor" />
      <rect x="15.5" y="15.5" width="6" height="6" rx="1" fill="hsl(var(--primary))" />
    </svg>
  );
}

interface AuthLayoutProps {
  eyebrow: string;
  title: ReactNode;
  subtitle: string;
  children: ReactNode;
  /** Footer line shown beneath the card, e.g. "Already have an account?" */
  footer: ReactNode;
}

/**
 * Two-column layout:
 *  - left: form card on soft brand background
 *  - right: editorial panel with quiet calendar artwork
 */
export function AuthLayout({ eyebrow, title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <main className="relative grid min-h-screen grid-cols-1 bg-background text-foreground lg:grid-cols-[1.05fr_0.95fr]">
      {/* ---- left: form ---- */}
      <section className="flex flex-col px-6 py-8 sm:px-10 lg:px-14">
        <Link to="/" className="inline-flex items-center gap-2.5 text-foreground">
          <PacedayMark className="h-6 w-6 text-foreground" />
          <span className="font-serif text-lg leading-none tracking-tight">Paceday</span>
        </Link>

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-[420px] py-12">
            <span className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <span className="h-px w-6 bg-border" />
              {eyebrow}
            </span>
            <h1 className="mt-5 font-serif text-4xl leading-[1.1] tracking-tight text-foreground">
              {title}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>

            <div className="mt-8">{children}</div>

            <div className="mt-8 text-center text-sm text-muted-foreground">{footer}</div>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground/80">
          © {new Date().getFullYear()} Paceday. Designed for a calmer day.
        </p>
      </section>

      {/* ---- right: editorial visual ---- */}
      <aside className="relative hidden border-l border-border bg-card lg:block">
        <div className="bg-grid-soft pointer-events-none absolute inset-0 opacity-[0.35]" />
        <div className="relative flex h-full flex-col justify-between px-12 py-14">
          <div className="max-w-md">
            <span className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <span className="h-px w-6 bg-border" />
              An AI calendar, quietly designed
            </span>
            <p className="mt-6 font-serif text-3xl leading-[1.2] text-foreground">
              “The first calendar that actually gives me my mornings back.”
            </p>
            <p className="mt-4 text-sm text-muted-foreground">— A Paceday user, every Monday.</p>
          </div>

          <QuietWeekArtwork />
        </div>
      </aside>
    </main>
  );
}

/* ---------- artwork: a calm, structured week ---------- */

const ART_BLOCKS: { day: number; start: number; span: number; kind: "focus" | "meeting" }[] = [
  { day: 0, start: 0, span: 3, kind: "focus" },
  { day: 0, start: 4, span: 1, kind: "meeting" },
  { day: 1, start: 0, span: 1, kind: "meeting" },
  { day: 1, start: 2, span: 4, kind: "focus" },
  { day: 2, start: 1, span: 2, kind: "meeting" },
  { day: 2, start: 4, span: 3, kind: "focus" },
  { day: 3, start: 0, span: 4, kind: "focus" },
  { day: 3, start: 5, span: 1, kind: "meeting" },
  { day: 4, start: 0, span: 1, kind: "meeting" },
  { day: 4, start: 2, span: 4, kind: "focus" },
];

const ART_HOURS = ["09", "10", "11", "12", "01", "02", "03", "04"];

function QuietWeekArtwork() {
  return (
    <div className="rounded-xl border border-border bg-background/60 p-5">
      <div className="mb-3 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>This week</span>
        <span className="inline-flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-primary" /> Focus
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-warning" /> Meeting
          </span>
        </span>
      </div>
      <div className="grid grid-cols-[28px_repeat(5,1fr)] gap-1">
        <div />
        {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => (
          <div key={d} className="pb-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {d}
          </div>
        ))}
        {ART_HOURS.map((h, rowIdx) => (
          <ArtRow key={h} hour={h} rowIdx={rowIdx} />
        ))}
      </div>
    </div>
  );
}

function ArtRow({ hour, rowIdx }: { hour: string; rowIdx: number }) {
  return (
    <>
      <div className="pr-1 pt-1 text-right text-[9px] font-medium text-muted-foreground/70">{hour}</div>
      {[0, 1, 2, 3, 4].map((day) => {
        const block = ART_BLOCKS.find((b) => b.day === day && b.start === rowIdx);
        const covered = ART_BLOCKS.some((b) => b.day === day && rowIdx > b.start && rowIdx < b.start + b.span);
        if (covered) return <div key={day} />;
        if (!block) return <div key={day} className="h-7 rounded-[5px] border border-dashed border-border/60" />;
        const cls =
          block.kind === "focus"
            ? "bg-primary/15 border-primary/40 text-primary"
            : "bg-warning/20 border-warning/50 text-foreground";
        return (
          <div
            key={day}
            style={{ gridRow: `span ${block.span}` }}
            className={`rounded-[6px] border px-2 py-1.5 text-[10px] font-medium ${cls}`}
          >
            {block.kind === "focus" ? "Focus" : "Meeting"}
          </div>
        );
      })}
    </>
  );
}
