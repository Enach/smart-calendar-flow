import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Calendar as CalendarIcon,
  Sparkles,
  Shield,
  Wand2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/paceday-logo.png";
import { AuthDialog } from "@/components/auth/AuthDialog";
import { useAuth } from "@/contexts/AuthContext";

/* ---------- shared bits ---------- */

const Container = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`mx-auto w-full max-w-6xl px-6 lg:px-10 ${className}`}>{children}</div>
);

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
    <span className="h-px w-6 bg-border" />
    {children}
  </span>
);

/* ---------- nav ---------- */

const Nav = ({ onOpenAuth }: { onOpenAuth: (mode: "signin" | "signup") => void }) => {
  const { user, isDemo, logout } = useAuth();
  const navigate = useNavigate();

  const goApp = () => navigate("/app");
  const onExitDemo = async () => {
    await logout();
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur">
      <Container className="flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <PacedayMark />
          <span className="font-serif text-xl text-foreground">Paceday</span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <a href="#problem" className="transition-colors hover:text-foreground">The problem</a>
          <a href="#solution" className="transition-colors hover:text-foreground">How it works</a>
          <a href="#preview" className="transition-colors hover:text-foreground">Product</a>
          <a href="#benefits" className="transition-colors hover:text-foreground">Benefits</a>
        </nav>
        <div className="flex items-center gap-2">
          {isDemo ? (
            <>
              <button
                type="button"
                onClick={goApp}
                className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline"
              >
                Open app
              </button>
              <Button
                onClick={onExitDemo}
                size="sm"
                variant="outline"
                className="rounded-full border-border bg-card px-4 text-sm text-foreground hover:bg-muted"
              >
                Exit demo
              </Button>
            </>
          ) : user ? (
            <Button
              onClick={goApp}
              size="sm"
              className="rounded-full bg-primary px-4 text-primary-foreground hover:bg-primary/90"
            >
              Open app
            </Button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onOpenAuth("signin")}
                className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline"
              >
                Sign in
              </button>
              <Button
                onClick={() => onOpenAuth("signup")}
                size="sm"
                className="rounded-full bg-primary px-4 text-primary-foreground hover:bg-primary/90"
              >
                Get your time back
              </Button>
            </>
          )}
        </div>
      </Container>
    </header>
  );
};

/* ---------- minimal "blocks" mark (no Tetris vibes) ---------- */

const PacedayMark = () => (
  <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" className="text-foreground">
    <rect x="0.5" y="0.5" width="6" height="6" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
    <rect x="8" y="8" width="6" height="6" rx="1" fill="currentColor" />
    <rect x="15.5" y="0.5" width="6" height="6" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
    <rect x="0.5" y="15.5" width="6" height="6" rx="1" fill="currentColor" />
    <rect x="15.5" y="15.5" width="6" height="6" rx="1" fill="hsl(var(--primary))" />
  </svg>
);

/* ---------- hero ---------- */

const Hero = ({ onOpenAuth }: { onOpenAuth: (mode: "signin" | "signup") => void }) => (
  <section className="relative overflow-hidden border-b border-border/70">
    <div className="bg-grid-soft pointer-events-none absolute inset-0 opacity-[0.35]" />
    <Container className="relative grid gap-16 py-24 lg:grid-cols-12 lg:py-32">
      <div className="lg:col-span-6">
        <Eyebrow>An AI calendar, quietly designed</Eyebrow>
        <h1 className="mt-6 font-serif text-5xl leading-[1.05] tracking-tight text-foreground md:text-6xl lg:text-[64px]">
          The simplest way<br />
          to own your day.
        </h1>
        <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground">
          Paceday protects your focus, trims meetings, and organizes your day automatically.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Button
            onClick={() => onOpenAuth("signup")}
            size="lg"
            className="h-12 rounded-full bg-primary px-6 text-base text-primary-foreground hover:bg-primary/90"
          >
            Get your time back
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
          <a href="#preview" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            See how it works
          </a>
        </div>
        <div className="mt-12 flex items-center gap-6 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            Works with Google & Outlook
          </span>
          <span className="hidden h-3 w-px bg-border sm:block" />
          <span className="hidden sm:inline">No setup required</span>
        </div>
      </div>

      <div className="lg:col-span-6">
        <CalendarTransform />
      </div>
    </Container>
  </section>
);

/* ---------- the visual: messy → structured ---------- */

const CalendarTransform = () => (
  <div className="grid gap-5 md:grid-cols-2">
    <CalendarMock variant="messy" label="Before" />
    <CalendarMock variant="organized" label="After" />
  </div>
);

const HOURS = ["9", "10", "11", "12", "1", "2", "3", "4", "5"];

type Block = { day: number; start: number; span: number; kind: "focus" | "meeting" | "conflict" };

const MESSY: Block[] = [
  { day: 0, start: 0, span: 1, kind: "meeting" },
  { day: 0, start: 2, span: 1, kind: "meeting" },
  { day: 0, start: 4, span: 1, kind: "conflict" },
  { day: 0, start: 6, span: 1, kind: "meeting" },
  { day: 1, start: 1, span: 1, kind: "meeting" },
  { day: 1, start: 3, span: 1, kind: "conflict" },
  { day: 1, start: 5, span: 1, kind: "meeting" },
  { day: 2, start: 0, span: 1, kind: "meeting" },
  { day: 2, start: 2, span: 1, kind: "meeting" },
  { day: 2, start: 4, span: 1, kind: "meeting" },
  { day: 2, start: 6, span: 1, kind: "meeting" },
];

const ORGANIZED: Block[] = [
  { day: 0, start: 0, span: 3, kind: "focus" },
  { day: 0, start: 4, span: 1, kind: "meeting" },
  { day: 0, start: 5, span: 1, kind: "meeting" },
  { day: 1, start: 0, span: 2, kind: "meeting" },
  { day: 1, start: 3, span: 4, kind: "focus" },
  { day: 2, start: 0, span: 1, kind: "meeting" },
  { day: 2, start: 2, span: 4, kind: "focus" },
];

const KIND_STYLE: Record<Block["kind"], string> = {
  focus: "bg-primary/15 border-primary/40 text-primary",
  meeting: "bg-warning/20 border-warning/50 text-foreground",
  conflict: "bg-destructive/15 border-destructive/50 text-destructive",
};

const KIND_LABEL: Record<Block["kind"], string> = {
  focus: "Focus",
  meeting: "Meeting",
  conflict: "Conflict",
};

const CalendarMock = ({ variant, label }: { variant: "messy" | "organized"; label: string }) => {
  const blocks = variant === "messy" ? MESSY : ORGANIZED;
  const days = ["Mon", "Tue", "Wed"];
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-[0_1px_0_hsl(var(--border))]">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        {variant === "organized" ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-success">
            <CheckCircle2 className="h-3.5 w-3.5" /> Organized
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-destructive">
            <AlertCircle className="h-3.5 w-3.5" /> Fragmented
          </span>
        )}
      </div>
      <div className="grid grid-cols-[28px_repeat(3,1fr)] gap-1">
        <div />
        {days.map((d) => (
          <div key={d} className="pb-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {d}
          </div>
        ))}

        {HOURS.map((h, rowIdx) => (
          <Row key={h} hour={h} rowIdx={rowIdx} blocks={blocks} totalRows={HOURS.length} />
        ))}
      </div>
    </div>
  );
};

const Row = ({ hour, rowIdx, blocks }: { hour: string; rowIdx: number; blocks: Block[]; totalRows: number }) => {
  const cells = [0, 1, 2].map((day) => {
    const block = blocks.find((b) => b.day === day && b.start === rowIdx);
    const covered = blocks.some((b) => b.day === day && rowIdx > b.start && rowIdx < b.start + b.span);
    if (covered) return null;
    if (!block) {
      return <div key={day} className="h-7 rounded-[5px] border border-dashed border-border/60" />;
    }
    return (
      <div
        key={day}
        style={{ gridRow: `span ${block.span}` }}
        className={`flex flex-col justify-between rounded-[6px] border px-2 py-1.5 text-[10px] font-medium ${KIND_STYLE[block.kind]}`}
      >
        <span className="truncate">{KIND_LABEL[block.kind]}</span>
      </div>
    );
  });

  return (
    <>
      <div className="pr-1 pt-1 text-right text-[9px] font-medium text-muted-foreground/70">{hour}</div>
      {cells.map((c, i) =>
        c === null ? <div key={i} /> : <div key={i}>{c}</div>
      )}
    </>
  );
};

/* ---------- problem ---------- */

const Problem = () => (
  <section id="problem" className="border-b border-border/70 py-24">
    <Container className="grid gap-16 lg:grid-cols-12">
      <div className="lg:col-span-5">
        <Eyebrow>The problem</Eyebrow>
        <h2 className="mt-5 font-serif text-4xl leading-tight text-foreground md:text-[44px]">
          Most calendars don't&nbsp;help.<br />They just record the&nbsp;chaos.
        </h2>
      </div>
      <div className="lg:col-span-7">
        <ul className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
          {[
            { t: "Fragmented focus", d: "Twenty 15-minute gaps. Zero time to think." },
            { t: "Back-to-back days", d: "No breaks, no buffers, no space to prepare." },
            { t: "Meetings that drift", d: "Sixty minutes for what should take thirty." },
            { t: "Constant conflicts", d: "You spend more time rescheduling than meeting." },
          ].map((it) => (
            <li key={it.t} className="bg-card p-6">
              <div className="font-serif text-lg text-foreground">{it.t}</div>
              <div className="mt-1.5 text-sm text-muted-foreground">{it.d}</div>
            </li>
          ))}
        </ul>
      </div>
    </Container>
  </section>
);

/* ---------- solution ---------- */

const Solution = () => (
  <section id="solution" className="border-b border-border/70 bg-card py-24">
    <Container>
      <div className="max-w-2xl">
        <Eyebrow>How it works</Eyebrow>
        <h2 className="mt-5 font-serif text-4xl leading-tight text-foreground md:text-[44px]">
          A quiet system that arranges your day.
        </h2>
        <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
          Paceday studies how your week actually flows, then rebuilds it around the work that matters.
          No manual blocking. No fiddling. Just a structured day, ready when you wake up.
        </p>
      </div>

      <ol className="mt-16 grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-3">
        {[
          {
            n: "01",
            t: "Connect your calendar",
            d: "Sync Google or Outlook in two clicks. Nothing else to set up.",
          },
          {
            n: "02",
            t: "Paceday learns the rhythm",
            d: "It maps focus windows, recurring meetings, and the gaps between them.",
          },
          {
            n: "03",
            t: "Your day is rebuilt",
            d: "Meetings compress, focus blocks lock in, conflicts resolve before you notice.",
          },
        ].map((s) => (
          <li key={s.n} className="bg-card p-8">
            <div className="font-serif text-sm text-muted-foreground">{s.n}</div>
            <div className="mt-3 font-serif text-xl text-foreground">{s.t}</div>
            <div className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.d}</div>
          </li>
        ))}
      </ol>
    </Container>
  </section>
);

/* ---------- product preview ---------- */

const Preview = () => (
  <section id="preview" className="border-b border-border/70 py-24">
    <Container>
      <div className="mx-auto max-w-2xl text-center">
        <Eyebrow>Product</Eyebrow>
        <h2 className="mt-5 font-serif text-4xl leading-tight text-foreground md:text-[44px]">
          A calendar that organizes itself.
        </h2>
        <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
          Watch a fragmented week resolve into clear, deliberate blocks of time.
        </p>
      </div>

      <div className="mt-16 overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border bg-background/60 px-5 py-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarIcon className="h-4 w-4" />
            This week
          </div>
          <div className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <Legend swatch="bg-primary" label="Focus" />
            <Legend swatch="bg-warning" label="Meeting" />
            <Legend swatch="bg-destructive" label="Conflict" />
          </div>
        </div>

        <div className="grid grid-cols-[60px_repeat(5,1fr)] gap-px bg-border">
          <div className="bg-card" />
          {["Mon 14", "Tue 15", "Wed 16", "Thu 17", "Fri 18"].map((d, i) => (
            <div key={d} className="bg-card px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span className={i === 2 ? "text-primary" : ""}>{d}</span>
            </div>
          ))}

          {WeekHours.map((h) => (
            <PreviewRow key={h} hour={h} />
          ))}
        </div>
      </div>
    </Container>
  </section>
);

const Legend = ({ swatch, label }: { swatch: string; label: string }) => (
  <span className="inline-flex items-center gap-1.5">
    <span className={`h-2 w-2 rounded-sm ${swatch}`} />
    {label}
  </span>
);

const WeekHours = ["09", "10", "11", "12", "13", "14", "15", "16", "17"];

// Pre-baked structured week — all blocks live as overlay div within their day column
const WEEK_EVENTS: { day: number; start: number; span: number; title: string; kind: "focus" | "meeting" | "conflict" }[] = [
  { day: 0, start: 0, span: 3, title: "Deep work", kind: "focus" },
  { day: 0, start: 4, span: 1, title: "Standup", kind: "meeting" },
  { day: 0, start: 6, span: 1, title: "1:1 — Anna", kind: "meeting" },
  { day: 1, start: 0, span: 1, title: "Standup", kind: "meeting" },
  { day: 1, start: 2, span: 4, title: "Deep work", kind: "focus" },
  { day: 1, start: 7, span: 1, title: "Review", kind: "meeting" },
  { day: 2, start: 1, span: 2, title: "Design crit", kind: "meeting" },
  { day: 2, start: 4, span: 4, title: "Deep work", kind: "focus" },
  { day: 3, start: 0, span: 2, title: "Deep work", kind: "focus" },
  { day: 3, start: 3, span: 1, title: "Standup", kind: "meeting" },
  { day: 3, start: 5, span: 1, title: "Conflict", kind: "conflict" },
  { day: 3, start: 7, span: 1, title: "1:1 — Lee", kind: "meeting" },
  { day: 4, start: 0, span: 4, title: "Deep work", kind: "focus" },
  { day: 4, start: 5, span: 2, title: "Planning", kind: "meeting" },
];

const KIND_CHIP: Record<"focus" | "meeting" | "conflict", string> = {
  focus: "bg-primary/12 border-l-primary text-primary",
  meeting: "bg-warning/15 border-l-warning text-foreground",
  conflict: "bg-destructive/15 border-l-destructive text-destructive",
};

const PreviewRow = ({ hour }: { hour: string }) => {
  const rowIdx = WeekHours.indexOf(hour);
  return (
    <>
      <div className="bg-card pr-2 pt-2 text-right text-[10px] font-medium text-muted-foreground/70">{hour}:00</div>
      {[0, 1, 2, 3, 4].map((day) => {
        const block = WEEK_EVENTS.find((b) => b.day === day && b.start === rowIdx);
        const covered = WEEK_EVENTS.some((b) => b.day === day && rowIdx > b.start && rowIdx < b.start + b.span);
        return (
          <div key={day} className="relative h-12 bg-card">
            {block && (
              <div
                style={{ height: `calc(${block.span * 3}rem - 2px)` }}
                className={`absolute inset-x-1 top-0 z-10 rounded-md border-l-[3px] px-2 py-1.5 text-[11px] font-medium ${KIND_CHIP[block.kind]}`}
              >
                <div className="truncate">{block.title}</div>
              </div>
            )}
            {covered && <div className="absolute inset-0" />}
          </div>
        );
      })}
    </>
  );
};

/* ---------- benefits ---------- */

const Benefits = () => (
  <section id="benefits" className="border-b border-border/70 bg-card py-24">
    <Container>
      <div className="max-w-2xl">
        <Eyebrow>Benefits</Eyebrow>
        <h2 className="mt-5 font-serif text-4xl leading-tight text-foreground md:text-[44px]">
          Less calendar. More work that matters.
        </h2>
      </div>

      <div className="mt-16 grid gap-6 md:grid-cols-3">
        <BenefitCard
          icon={<Shield className="h-5 w-5" />}
          accent="text-primary"
          title="Focus, protected"
          body="Long, uninterrupted blocks for the work only you can do. Paceday defends them automatically."
        />
        <BenefitCard
          icon={<Wand2 className="h-5 w-5" />}
          accent="text-ai"
          title="Automation, quietly"
          body="Meetings move. Buffers appear. Conflicts resolve. You don't lift a finger."
        />
        <BenefitCard
          icon={<Sparkles className="h-5 w-5" />}
          accent="text-foreground"
          title="Simplicity, by design"
          body="One calm view of the day ahead. No dashboards, no settings to babysit."
        />
      </div>
    </Container>
  </section>
);

const BenefitCard = ({
  icon, accent, title, body,
}: { icon: React.ReactNode; accent: string; title: string; body: string }) => (
  <div className="rounded-xl border border-border bg-background p-7">
    <div className={`inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card ${accent}`}>
      {icon}
    </div>
    <div className="mt-5 font-serif text-xl text-foreground">{title}</div>
    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
  </div>
);

/* ---------- final CTA ---------- */

const FinalCTA = ({ onOpenAuth }: { onOpenAuth: (mode: "signin" | "signup") => void }) => (
  <section id="cta" className="py-28">
    <Container>
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-12 text-center md:p-20">
        <div className="bg-grid-soft pointer-events-none absolute inset-0 opacity-30" />
        <div className="relative">
          <Eyebrow>Start today</Eyebrow>
          <h2 className="mx-auto mt-6 max-w-3xl font-serif text-4xl leading-tight text-foreground md:text-5xl">
            Get your time back.
          </h2>
          <p className="mx-auto mt-5 max-w-lg text-lg text-muted-foreground">
            Connect your calendar in under a minute. Paceday handles the rest.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Button
              onClick={() => onOpenAuth("signup")}
              size="lg"
              className="h-12 rounded-full bg-primary px-7 text-base text-primary-foreground hover:bg-primary/90"
            >
              Get your time back
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground">No credit card required.</span>
          </div>
        </div>
      </div>
    </Container>
  </section>
);

/* ---------- footer ---------- */

const Footer = () => (
  <footer className="border-t border-border/70 py-10">
    <Container className="flex flex-col items-center justify-between gap-4 text-sm text-muted-foreground sm:flex-row">
      <div className="flex items-center gap-2">
        <PacedayMark />
        <span className="font-serif text-base text-foreground">Paceday</span>
      </div>
      <div className="text-xs">© {new Date().getFullYear()} Paceday. Designed for a calmer day.</div>
    </Container>
  </footer>
);

/* ---------- page ---------- */

interface IndexProps {
  initialAuth?: "signin" | "signup";
}

const Index = ({ initialAuth }: IndexProps = {}) => {
  void logo;
  const [authOpen, setAuthOpen] = useState<boolean>(!!initialAuth);
  const [authMode, setAuthMode] = useState<"signin" | "signup">(initialAuth ?? "signin");

  const openAuth = (mode: "signin" | "signup") => {
    setAuthMode(mode);
    setAuthOpen(true);
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Nav onOpenAuth={openAuth} />
      <Hero onOpenAuth={openAuth} />
      <Problem />
      <Solution />
      <Preview />
      <Benefits />
      <FinalCTA onOpenAuth={openAuth} />
      <Footer />
      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} mode={authMode} />
    </main>
  );
};

export default Index;
