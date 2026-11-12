/**
 * PAC-88: the booking page's "Time zone" combobox (ARIA 1.2 combobox with a
 * listbox popup: open, type to filter, arrows, Enter, Escape), plus the two
 * one-step shortcuts "Use my time zone (…)" and back to the host's zone.
 *
 * It only reports a choice; the page owns the displayed zone, keeps it in
 * page state only (owner OQ-2: never stored) and announces the change.
 * Test ids are a contract with the e2e suite (contract PAC-88 section 3.5).
 */
import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { cn } from "@/lib/utils";
import { canFormatZone, zoneMatches, zoneOffsetLabel, zoneOptions } from "@/lib/timeZone";

export const TZ_SWITCH_UNAVAILABLE = "Time zone switching is unavailable right now.";

export interface TimeZoneSwitcherProps {
  /** The zone the page shows times in. */
  value: string;
  /** The link's zone; listed first with UTC. */
  linkZone?: string;
  /** Where "back to the host's time zone" goes (the page's default zone). */
  hostZone: string;
  /** The browser's zone, when known: offered as "Use my time zone" if it differs. */
  browserZone?: string;
  /** Link-zone mode (contract section 5): focusable, aria-disabled, explained. */
  disabled?: boolean;
  onChange: (zone: string) => void;
  /** The zones to list (defaults to every zone this browser supports). */
  zones?: string[];
  /** The instant whose offsets the options show (default: now). */
  now?: Date;
}

export function TimeZoneSwitcher({
  value,
  linkZone,
  hostZone,
  browserZone,
  disabled = false,
  onChange,
  zones,
  now,
}: TimeZoneSwitcherProps) {
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listId = `${baseId}-list`;
  const hintId = `${baseId}-hint`;
  const optionId = (i: number) => `${baseId}-opt-${i}`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [typed, setTyped] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const all = useMemo(() => zoneOptions(linkZone, zones), [linkZone, zones]);
  const filtered = useMemo(() => (typed ? all.filter((z) => zoneMatches(z, query)) : all), [all, typed, query]);
  // Options show the offsets in force when the list is opened ("current").
  const [at, setAt] = useState<Date>(() => now ?? new Date());

  function openList() {
    if (disabled) return;
    setAt(now ?? new Date());
    const i = all.indexOf(value);
    setQuery(value);
    setTyped(false);
    setActive(i >= 0 ? i : 0);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setTyped(false);
    setQuery("");
  }

  function choose(zone: string) {
    close();
    if (zone !== value) onChange(zone);
  }

  function moveTo(i: number) {
    if (filtered.length === 0) return;
    const next = Math.max(0, Math.min(filtered.length - 1, i));
    setActive(next);
    const el = listRef.current?.ownerDocument.getElementById(optionId(next));
    el?.scrollIntoView?.({ block: "nearest" });
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) openList();
        else moveTo(active + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (!open) openList();
        else moveTo(active - 1);
        break;
      case "Home":
        if (open) {
          e.preventDefault();
          moveTo(0);
        }
        break;
      case "End":
        if (open) {
          e.preventDefault();
          moveTo(filtered.length - 1);
        }
        break;
      case "Enter":
        if (open) {
          e.preventDefault();
          const zone = filtered[active];
          if (zone) choose(zone);
        }
        break;
      case "Escape":
        if (open) {
          e.preventDefault();
          close();
        }
        break;
      default:
        break;
    }
  }

  const showUseMine = !disabled && !!browserZone && browserZone !== value && canFormatZone(browserZone);
  const showBackToHost = !disabled && value !== hostZone;
  const activeId = open && filtered[active] ? optionId(active) : undefined;

  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Time zone
      </label>
      <div className="relative">
        <input
          id={inputId}
          data-testid="booking-tz-switcher"
          type="text"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={activeId}
          aria-disabled={disabled ? "true" : undefined}
          aria-describedby={disabled ? hintId : undefined}
          readOnly={disabled}
          value={open ? query : value}
          onChange={(e) => {
            if (disabled) return;
            setQuery(e.target.value);
            setTyped(true);
            setActive(0);
            setOpen(true);
          }}
          onClick={() => (open ? close() : openList())}
          onKeyDown={onKeyDown}
          onBlur={close}
          className={cn(
            "min-h-[44px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            disabled && "cursor-not-allowed text-muted-foreground",
          )}
        />
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          aria-label="Time zones"
          hidden={!open}
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-popover py-1 shadow-md"
        >
          {open &&
            filtered.map((zone, i) => {
              const offset = zoneOffsetLabel(at, zone);
              return (
                <li
                  key={zone}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === active}
                  aria-label={`${zone} (${offset})`}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(zone)}
                  className={cn(
                    "flex min-h-[44px] cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm text-foreground",
                    i === active && "bg-primary-muted",
                  )}
                >
                  <span className="truncate">{zone}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{offset}</span>
                </li>
              );
            })}
          {open && filtered.length === 0 && (
            <li role="presentation" className="px-3 py-2 text-sm text-muted-foreground">
              No time zone matches “{query}”.
            </li>
          )}
        </ul>
      </div>
      {disabled && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {TZ_SWITCH_UNAVAILABLE}
        </p>
      )}
      {(showUseMine || showBackToHost) && (
        <div className="flex flex-col items-start gap-1">
          {showUseMine && (
            <button
              type="button"
              data-testid="booking-tz-use-mine"
              onClick={() => onChange(browserZone!)}
              className="min-h-[44px] text-left text-sm font-medium text-primary hover:underline"
            >
              Use my time zone ({browserZone})
            </button>
          )}
          {showBackToHost && (
            <button
              type="button"
              data-testid="booking-tz-back-to-host"
              onClick={() => onChange(hostZone)}
              className="min-h-[44px] text-left text-sm font-medium text-primary hover:underline"
            >
              Back to the host's time zone ({hostZone})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
