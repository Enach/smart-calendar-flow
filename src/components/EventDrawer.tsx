import { useEffect, useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { EventDetailView } from "@/components/EventDetailView";
import { EventEditForm } from "@/components/EventEditForm";
import type { CalendarEvent } from "@/api/types";

interface EventDrawerProps {
  event: CalendarEvent;
  events: CalendarEvent[];
  workStart: string;
  workEnd: string;
  onClose: () => void;
}

export function EventDrawer({ event, events, workStart, workEnd, onClose }: EventDrawerProps) {
  const [mode, setMode] = useState<"detail" | "edit">("detail");

  // Always reset to detail when a different event is opened
  useEffect(() => {
    setMode("detail");
  }, [event.id]);

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        {mode === "detail" ? (
          <EventDetailView
            event={event}
            events={events}
            workStart={workStart}
            workEnd={workEnd}
            onEdit={() => setMode("edit")}
            onClose={onClose}
          />
        ) : (
          <EventEditForm event={event} onBack={() => setMode("detail")} onClose={onClose} />
        )}
      </SheetContent>
    </Sheet>
  );
}
