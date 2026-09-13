import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { api } from "@/api/client";
import type { Attendee } from "@/api/types";

interface ContactEmailAutocompleteProps {
  value: string;
  onValueChange: (value: string) => void;
  onContactResolved: (contact: Attendee) => void;
  inputClassName: string;
}

export function ContactEmailAutocomplete({
  value,
  onValueChange,
  onContactResolved,
  inputClassName,
}: ContactEmailAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Attendee[]>([]);
  const [searchFailed, setSearchFailed] = useState(false);

  useEffect(() => {
    const query = value.trim();
    if (query.length < 2) {
      setSuggestions([]);
      setSearchFailed(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setSearchFailed(false);
      try {
        const contacts = await api.suggestAttendees(query);
        if (cancelled) return;
        setSuggestions(contacts);
        const exact = contacts.find(
          (contact) => contact.email.toLowerCase() === query.toLowerCase(),
        );
        if (exact) onContactResolved(exact);
      } catch {
        if (!cancelled) {
          setSuggestions([]);
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

  const selectContact = (contact: Attendee) => {
    onValueChange(contact.email);
    onContactResolved(contact);
    setSuggestions([]);
    setOpen(false);
  };

  return (
    <div className="relative">
      <input
        type="email"
        role="combobox"
        aria-label="Email"
        aria-autocomplete="list"
        aria-expanded={open && suggestions.length > 0}
        aria-controls="add-person-contact-suggestions"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        className={inputClassName}
        placeholder="Search name or email…"
        autoComplete="off"
      />

      {loading && (
        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}

      {open && suggestions.length > 0 && (
        <ul
          id="add-person-contact-suggestions"
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-card py-1 shadow-lg"
        >
          {suggestions.map((contact) => (
            <li key={contact.email} role="option" aria-selected={false}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectContact(contact)}
                className="w-full px-3 py-2 text-left hover:bg-muted/60"
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

      {open && searchFailed && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Calendar contacts could not be searched. You can still enter an email manually.
        </p>
      )}
    </div>
  );
}
