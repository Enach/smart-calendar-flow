import { useEffect, useId, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import { Loader2 } from "lucide-react";

import { api } from "@/api/client";
import type { Attendee } from "@/api/types";

interface ContactEmailAutocompleteProps {
  value: string;
  onValueChange: (value: string) => void;
  onContactResolved: (contact: Attendee) => void;
  inputClassName: string;
  /**
   * Addresses never offered as suggestions (case-insensitive) — e.g. people
   * who are already members or already have a pending invite.
   */
  exclude?: readonly string[];
  /** Enter pressed while no suggestion is highlighted. */
  onSubmit?: () => void;
  autoFocus?: boolean;
  /** Accessible name of the input. */
  label?: string;
}

export function ContactEmailAutocomplete({
  value,
  onValueChange,
  onContactResolved,
  inputClassName,
  exclude,
  onSubmit,
  autoFocus,
  label = "Email",
}: ContactEmailAutocompleteProps) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Attendee[]>([]);
  const [searchFailed, setSearchFailed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const excludeKey = (exclude ?? []).map((e) => e.trim().toLowerCase()).join("\n");
  const excluded = useMemo(() => new Set(excludeKey ? excludeKey.split("\n") : []), [excludeKey]);
  const suggestions = useMemo(
    () => results.filter((contact) => !excluded.has(contact.email.trim().toLowerCase())),
    [results, excluded],
  );

  useEffect(() => {
    const query = value.trim();
    setActiveIndex(-1);
    if (query.length < 2) {
      setResults([]);
      setSearchFailed(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setSearchFailed(false);
      try {
        const contacts = await api.suggestAttendees(query);
        if (cancelled) return;
        setResults(contacts);
        const exact = contacts.find(
          (contact) => contact.email.toLowerCase() === query.toLowerCase(),
        );
        if (exact) onContactResolved(exact);
      } catch {
        if (!cancelled) {
          setResults([]);
          setSearchFailed(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [onContactResolved, value]);

  const listOpen = open && suggestions.length > 0;

  const selectContact = (contact: Attendee) => {
    onValueChange(contact.email);
    onContactResolved(contact);
    setResults([]);
    setActiveIndex(-1);
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      if (suggestions.length === 0) return;
      event.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      if (suggestions.length === 0) return;
      event.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (event.key === "Enter") {
      if (listOpen && activeIndex >= 0 && activeIndex < suggestions.length) {
        event.preventDefault();
        selectContact(suggestions[activeIndex]);
      } else if (onSubmit) {
        event.preventDefault();
        onSubmit();
      }
    } else if (event.key === "Escape" && listOpen) {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  const optionId = (index: number) => `${listboxId}-option-${index}`;

  return (
    <div className="relative">
      <input
        type="email"
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={listOpen}
        aria-controls={listboxId}
        aria-activedescendant={listOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        value={value}
        onChange={(event) => {
          onValueChange(event.target.value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        className={inputClassName}
        placeholder="Search name or email…"
        autoComplete="off"
        autoFocus={autoFocus}
      />

      {loading && (
        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}

      {listOpen && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Calendar contacts"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-card py-1 shadow-lg"
        >
          {suggestions.map((contact, index) => (
            <li
              key={contact.email}
              id={optionId(index)}
              role="option"
              aria-selected={index === activeIndex}
            >
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectContact(contact)}
                className={
                  "w-full px-3 py-2 text-left hover:bg-muted/60" + (index === activeIndex ? " bg-muted/60" : "")
                }
              >
                <span className="block truncate text-sm font-medium text-foreground">
                  {contact.name || contact.email.split("@")[0]}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{contact.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Always mounted, so screen readers announce the failure when it appears. */}
      <p role="status" aria-live="polite" className={searchFailed ? "mt-1 text-xs font-normal text-[#B91C1C]" : "sr-only"}>
        {searchFailed ? "Couldn't search your calendar contacts. You can still type the full email address." : ""}
      </p>
    </div>
  );
}
