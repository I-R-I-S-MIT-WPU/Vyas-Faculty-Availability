// Display-only card for one planner session (no data fetching, no drag and drop logic).
//
// Exports:
//   SessionCard (forwardRef<HTMLDivElement>)  props: SessionCardProps
//     session      PlannerSession to show
//     height?      pixel height the card will be given; picks a density (<36 one line, <64 medium, else full). Default: full
//     roomName?    resolved room name (the card never looks rooms up itself)
//     selected?    draws the selection ring and sets aria-pressed
//     showBatch?   show the batch name; default = batch is not the whole-division batch ("ALL")
//     onSelect?    called with the session id on click / Enter / Space
//     severity?    worst diagnostics issue on this session ('blocking' | 'hard' | 'soft' | null): shows a small marker icon (warning
//                  triangle for blocking/hard, info for soft) with an aria-label, repeated in the card's own aria-label
//     issueCount?  number of issues the session is part of (default 1 when severity is set); only used for the marker's label
//     highlighted? ring for the issue the user picked in the diagnostics panel (amber, distinct from the primary selection ring)
//     ...rest      any div props (className, style, data-*, dnd-kit `attributes` + `listeners`, onKeyDown...) are forwarded;
//                  a passed onKeyDown runs first and Enter/Space selection is skipped if it called preventDefault.
//   The card does not position itself: give it `className="absolute"` plus top/left/width/height in `style`, or let it fill a box.
//   Kind (Lecture / Lab) and state (Locked) are always shown with an icon AND a word or aria-label, never colour alone.

import { forwardRef, type HTMLAttributes, type KeyboardEvent } from "react";
import { AlertTriangle, BookOpen, FlaskConical, Info, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlannerSession, RuleSeverity } from "../../types";
import { issueWord } from "../../lib/editorHighlights";
import { minToTime, WEEKDAY_NAMES } from "../../lib/time";

const WHOLE_BATCH_NAME = "ALL";

const KIND_STYLE = {
  theory: "border-status-mine-border bg-status-mine text-status-mine-foreground",
  lab: "border-status-others-border bg-status-others text-status-others-foreground",
} as const;

const KIND_WORD = { theory: "Lecture", lab: "Lab" } as const;

export interface SessionCardProps extends Omit<HTMLAttributes<HTMLDivElement>, "children" | "onSelect"> {
  session: PlannerSession;
  height?: number;
  roomName?: string;
  selected?: boolean;
  showBatch?: boolean;
  onSelect?: (id: string) => void;
  severity?: RuleSeverity | null;
  issueCount?: number;
  highlighted?: boolean;
}

function markerLabel(severity: RuleSeverity, count: number): string {
  return `${count} ${issueWord(severity, count)}`;
}

function summary(
  session: PlannerSession,
  roomName: string | undefined,
  showBatch: boolean,
  marker: string | null,
  highlighted: boolean,
): string {
  const parts = [`${session.subject_code}, ${session.subject_name}`, KIND_WORD[session.kind]];
  if (showBatch) parts.push(`batch ${session.batch_name}`);
  if (session.weekday != null && session.start_min != null && session.end_min != null) {
    parts.push(`${WEEKDAY_NAMES[session.weekday]} ${minToTime(session.start_min)} to ${minToTime(session.end_min)}`);
  } else {
    parts.push("not placed");
  }
  if (roomName) parts.push(`room ${roomName}`);
  if (session.faculty.length) parts.push(`faculty ${session.faculty.map((f) => f.short_code).join(", ")}`);
  if (session.locked) parts.push("locked");
  if (marker) parts.push(marker);
  if (highlighted) parts.push("highlighted by the selected issue");
  return parts.join(", ");
}

export const SessionCard = forwardRef<HTMLDivElement, SessionCardProps>(function SessionCard(
  { session, height, roomName, selected, showBatch, onSelect, severity, issueCount, highlighted, className, onKeyDown, onClick, ...rest },
  ref,
) {
  const batchShown = showBatch ?? session.batch_name !== WHOLE_BATCH_NAME;
  const KindIcon = session.kind === "lab" ? FlaskConical : BookOpen;
  const density = height == null || height >= 64 ? "full" : height >= 36 ? "medium" : "minimal";
  const placed = session.weekday != null && session.start_min != null && session.end_min != null;
  const time = placed ? `${minToTime(session.start_min!)}–${minToTime(session.end_min!)}` : null;
  const faculty = session.faculty.map((f) => f.short_code).join(", ");
  const marker = severity ? markerLabel(severity, Math.max(1, issueCount ?? 1)) : null;
  const MarkerIcon = severity === "soft" ? Info : AlertTriangle;
  const label = summary(session, roomName, batchShown, marker, !!highlighted);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
      e.preventDefault();
      onSelect?.(session.id);
    }
  };

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={!!selected}
      title={label}
      data-session-id={session.id}
      data-highlighted={highlighted ? "true" : undefined}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented) onSelect?.(session.id);
      }}
      onKeyDown={handleKeyDown}
      className={cn(
        "flex min-w-0 flex-col gap-0.5 overflow-hidden rounded-md border px-1.5 py-1 text-left text-xs leading-tight shadow-sm",
        "cursor-pointer select-none transition-shadow hover:shadow-md",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        KIND_STYLE[session.kind],
        session.locked && "border-2",
        highlighted && "ring-2 ring-amber-500 ring-offset-1 ring-offset-background",
        selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
        className,
      )}
      {...rest}
    >
      <div className="flex min-w-0 items-center gap-1">
        <KindIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate font-semibold">{session.subject_code}</span>
        {severity && marker && (
          <span
            role="img"
            aria-label={marker}
            title={marker}
            className={cn(
              "shrink-0 rounded-full border p-px",
              severity === "soft"
                ? "border-status-lunch-border bg-status-lunch text-status-lunch-foreground"
                : "border-status-danger-border bg-status-danger text-status-danger-foreground",
            )}
          >
            <MarkerIcon className="h-3 w-3" aria-hidden="true" />
          </span>
        )}
        {session.locked && (
          <span role="img" aria-label="Locked" title="Locked" className="shrink-0">
            <Lock className="h-3 w-3" aria-hidden="true" />
          </span>
        )}
      </div>

      {density !== "minimal" && (
        <span className="truncate font-medium">
          {KIND_WORD[session.kind]}
          {batchShown && <span> {"·"} {session.batch_name}</span>}
        </span>
      )}

      {time && <span className="truncate opacity-90">{time}</span>}

      {density === "full" && (
        <>
          {faculty && <span className="truncate opacity-90">{faculty}</span>}
          {roomName && <span className="truncate opacity-90">{roomName}</span>}
        </>
      )}
    </div>
  );
});
