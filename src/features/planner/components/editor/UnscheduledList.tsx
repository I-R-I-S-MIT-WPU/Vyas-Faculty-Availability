// The selected division's unplaced sessions, grouped by subject with a "N left" count.
//
//   UnscheduledList({ sessions, selectedId, onSelect, disabled? })
//     sessions   the division's sessions (any state; only unplaced ones are listed)
//     onSelect   (id) => void, click / Enter / Space. Select first, then click an empty grid cell to place (no drag needed).
//   Each item is draggable (id `list:<sessionId>`); keyboard drag starts with the M key. A lab subject's batches are
//   separate items. The `data-item-id` attribute lets the board move focus back to an item after an unplace.

import { forwardRef, type KeyboardEvent } from "react";
import { useDraggable } from "@dnd-kit/core";
import { BookOpen, CheckCircle2, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlannerSession } from "../../types";
import { groupUnplacedBySubject } from "../../lib/patch";

const WHOLE_BATCH_NAME = "ALL";
const KIND_WORD = { theory: "Lecture", lab: "Lab" } as const;

const listDragId = (sessionId: string) => `list:${sessionId}`;

interface ItemProps {
  session: PlannerSession;
  selected: boolean;
  disabled: boolean;
  onSelect: (id: string) => void;
}

function UnscheduledItem({ session, selected, disabled, onSelect }: ItemProps) {
  const { attributes, listeners: dndListeners, setNodeRef, isDragging } = useDraggable({
    id: listDragId(session.id),
    data: { sessionId: session.id, origin: "list" },
    disabled,
  });
  const Icon = session.kind === "lab" ? FlaskConical : BookOpen;
  const faculty = session.faculty.map((f) => f.short_code).join(", ");
  const batch = session.batch_name !== WHOLE_BATCH_NAME ? session.batch_name : null;
  const label = [
    `${session.subject_code} ${KIND_WORD[session.kind]}`,
    batch ? `batch ${batch}` : null,
    `${session.duration_min} minutes`,
    faculty ? `faculty ${faculty}` : null,
    "not placed",
  ]
    .filter(Boolean)
    .join(", ");

  // A read-only version is not draggable: no dnd handlers or attributes at all (same as DraggableCard).
  const listeners = disabled ? undefined : dndListeners;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    listeners?.onKeyDown?.(e as never); // dnd-kit keyboard drag (M key)
    if (e.defaultPrevented) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(session.id);
    }
  };

  // dnd-kit's aria-pressed would shadow the selection state, so it is dropped.
  const { "aria-pressed": _ignored, ...dndAttributes } = attributes as typeof attributes & { "aria-pressed"?: unknown };
  void _ignored;

  return (
    <div
      ref={setNodeRef}
      {...(disabled ? {} : dndAttributes)}
      {...listeners}
      data-item-id={session.id}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={selected}
      title={disabled ? "Read-only version" : `${label}. Drag onto the grid, or select it and click an empty slot.`}
      onClick={() => onSelect(session.id)}
      onKeyDown={onKeyDown}
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-left text-sm",
        disabled ? "cursor-not-allowed opacity-70" : "cursor-grab touch-none active:cursor-grabbing",
        "hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected && "border-primary bg-accent ring-2 ring-primary",
        isDragging && "opacity-40",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium">{KIND_WORD[session.kind]}</span>
        {batch && <span> {"·"} {batch}</span>}
        {faculty && <span className="text-muted-foreground"> {"·"} {faculty}</span>}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">{session.duration_min}m</span>
    </div>
  );
}

export interface UnscheduledListProps {
  sessions: PlannerSession[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  disabled?: boolean;
}

export const UnscheduledList = forwardRef<HTMLDivElement, UnscheduledListProps>(function UnscheduledList(
  { sessions, selectedId, onSelect, disabled = false },
  ref,
) {
  const groups = groupUnplacedBySubject(sessions);

  return (
    <section ref={ref} aria-label="Unscheduled sessions" className="space-y-2">
      <h3 className="text-sm font-semibold">Unscheduled</h3>
      {groups.length === 0 ? (
        <p className="flex items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          All sessions placed
        </p>
      ) : (
        <ul className="space-y-3">
          {groups.map((g) => (
            <li key={g.subject_code} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 px-0.5">
                <span className="min-w-0 truncate text-xs font-semibold" title={g.subject_name}>
                  {g.subject_code}
                  <span className="font-normal text-muted-foreground"> {g.subject_name}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{g.remaining} left</span>
              </div>
              <ul className="space-y-1">
                {g.items.map((s) => (
                  <li key={s.id}>
                    <UnscheduledItem session={s} selected={s.id === selectedId} disabled={disabled} onSelect={onSelect} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
});
