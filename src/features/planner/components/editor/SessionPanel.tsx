// Right-hand panel for the selected session: details plus the edits that are not drag and drop.
//
//   SessionPanel({ session, faculty, rooms, readOnlyReason, rejection, onOps, onDismissRejection, onClose })
//     onOps(ops)        sends ops through useApplyOps (optimistic, rolled back with a message if the server refuses)
//     readOnlyReason    non-null when the version is not a draft: every control is disabled and the reason is shown
//   Optional (Phase 3): versionId + rev show the 'Suggested slots' list (SuggestionsList) under the details; applying = an edit is in
//   flight (disables 'Place here' / 'Move here'); onPreviewSlot(slot|null) previews a hovered suggestion on the grid.
// A locked session cannot be unplaced, re-roomed or re-staffed; the panel says so next to the disabled controls.

import { useMemo, useState, type ReactNode } from "react";
import { BookOpen, FlaskConical, Lock, LockOpen, Users, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { OpsRejection } from "../../hooks";
import type { PreviewSlot } from "../../lib/shadingOverlay";
import { SuggestionsList } from "./SuggestionsList";
import { isPlaced } from "../../lib/patch";
import { WEEKDAY_NAMES, minToTime } from "../../lib/time";
import type { PlannerOp, PlannerSession, SnapshotFaculty, TermRoom } from "../../types";

const KIND_WORD = { theory: "Lecture", lab: "Lab" } as const;
const WHOLE_BATCH_NAME = "ALL";

export interface SessionPanelProps {
  session: PlannerSession | null;
  faculty: SnapshotFaculty[];
  rooms: TermRoom[];
  readOnlyReason: string | null;
  rejection: OpsRejection | null;
  onOps: (ops: PlannerOp[]) => void;
  onDismissRejection: () => void;
  onClose: () => void;
  versionId?: string;
  rev?: number;
  applying?: boolean;
  /** False: the suggestions list makes no request (version not a draft, generation running). Default true. */
  suggestionsEnabled?: boolean;
  onPreviewSlot?: (slot: PreviewSlot | null) => void;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

/**
 * Faculty chips plus a picker popover.
 *
 * - The component is keyed by session id only (see the call site): a socket change to this session's faculty
 *   must not remount it, which would close the popover and discard the admin's unsaved ticks. `selected` is
 *   (re)initialised when the popover opens, so the live `session.faculty` only feeds the chips and the diff.
 * - `faculty` is the snapshot's list, which holds ACTIVE planner faculty only. A session can still carry someone
 *   who is no longer in it (deactivated after the assignment): they are shown as read-only "inactive" chips and
 *   listed in the popover as unticked rows ("Inactive - tick to keep"). Choice: they are NOT sent in set_faculty
 *   unless the admin ticks them, so applying a change never silently re-submits a deactivated person (the server
 *   may refuse that) and the admin sees exactly what the new set will be.
 */
function FacultyEditor({
  session,
  faculty,
  disabled,
  onApply,
}: {
  session: PlannerSession;
  faculty: SnapshotFaculty[];
  disabled: boolean;
  onApply: (ids: string[]) => void;
}) {
  const current = session.faculty.map((f) => f.faculty_id);
  const activeIds = useMemo(() => new Set(faculty.map((f) => f.id)), [faculty]);
  const inactive = session.faculty.filter((f) => !activeIds.has(f.faculty_id));
  const [open, setOpen] = useState(false);
  // On open: the session's active faculty. Inactive ones start unticked (kept only when the admin ticks them).
  const [selected, setSelected] = useState<string[]>(() => current.filter((id) => activeIds.has(id)));
  const [query, setQuery] = useState("");

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? faculty.filter((f) => `${f.short_code} ${f.full_name}`.toLowerCase().includes(q)) : [...faculty];
    return list.sort((a, b) => a.short_code.localeCompare(b.short_code, "en", { numeric: true }));
  }, [faculty, query]);

  const changed = selected.length !== current.length || selected.some((id) => !current.includes(id));
  const toggle = (id: string) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {session.faculty.length === 0 && <span className="text-muted-foreground">None assigned</span>}
        {session.faculty.map((f) => (
          <span
            key={f.faculty_id}
            className={cn("rounded-full border px-2 py-0.5 text-xs", !activeIds.has(f.faculty_id) && "border-dashed text-muted-foreground")}
            title={activeIds.has(f.faculty_id) ? f.full_name : `${f.full_name} (inactive)`}
          >
            {f.short_code}
            {!activeIds.has(f.faculty_id) && " (inactive)"}
          </span>
        ))}
      </div>
      {inactive.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Inactive faculty stay on this session until you change the faculty. Changing it removes them unless you tick them again.
        </p>
      )}
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            setSelected(current.filter((id) => activeIds.has(id)));
            setQuery("");
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" disabled={disabled} aria-label="Change faculty for this session">
            <Users className="mr-2 h-4 w-4" aria-hidden="true" />
            Change faculty
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 space-y-2 p-3" align="start">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search faculty"
            aria-label="Search faculty"
          />
          <ul className="max-h-56 space-y-1 overflow-y-auto" aria-label="Faculty">
            {inactive.map((f) => (
              <li key={f.faculty_id}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-accent">
                  <Checkbox checked={selected.includes(f.faculty_id)} onCheckedChange={() => toggle(f.faculty_id)} />
                  <span className="font-medium">{f.short_code}</span>
                  <span className="min-w-0 truncate text-muted-foreground">{f.full_name} (inactive, tick to keep)</span>
                </label>
              </li>
            ))}
            {options.map((f) => (
              <li key={f.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-accent">
                  <Checkbox checked={selected.includes(f.id)} onCheckedChange={() => toggle(f.id)} />
                  <span className="font-medium">{f.short_code}</span>
                  <span className="min-w-0 truncate text-muted-foreground">{f.full_name}</span>
                </label>
              </li>
            ))}
            {options.length === 0 && <li className="px-1 py-2 text-sm text-muted-foreground">No faculty match.</li>}
          </ul>
          {selected.length === 0 && <p className="text-xs text-destructive">Pick at least one person.</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!changed || selected.length === 0}
              onClick={() => {
                onApply(selected);
                setOpen(false);
              }}
            >
              Apply
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function SessionPanel({
  session,
  faculty,
  rooms,
  readOnlyReason,
  rejection,
  onOps,
  onDismissRejection,
  onClose,
  versionId,
  rev,
  applying = false,
  suggestionsEnabled = true,
  onPreviewSlot,
}: SessionPanelProps) {
  if (!session) {
    return (
      <section aria-label="Session details" className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        Select a session on the grid or in the Unscheduled list to see its details. Then click an empty slot to place or move it.
      </section>
    );
  }

  const placed = isPlaced(session);
  const Icon = session.kind === "lab" ? FlaskConical : BookOpen;
  const readOnly = readOnlyReason != null;
  const lockedBlock = session.locked;
  const batch = session.batch_name !== WHOLE_BATCH_NAME ? session.batch_name : "Whole division";
  const rejectionHere = rejection && rejection.session_id === session.id ? rejection : null;
  const roomKnown = !session.room_id || rooms.some((r) => r.room_id === session.room_id);

  return (
    <section aria-label="Session details" className="space-y-4 rounded-md border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{session.subject_code}</span>
          </h3>
          <p className="text-sm text-muted-foreground">{session.subject_name}</p>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close session details (Escape)">
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      {/* The board shows the same messages as a live alert; these copies are not announced a second time. */}
      {readOnly && (
        <Alert role={undefined}>
          <AlertDescription>{readOnlyReason}</AlertDescription>
        </Alert>
      )}

      {rejectionHere && (
        <Alert variant="destructive" role={undefined}>
          <AlertDescription className="flex items-start justify-between gap-2">
            <span>{rejectionHere.message}</span>
            <button type="button" className="shrink-0 underline" onClick={onDismissRejection}>
              Dismiss
            </button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Kind">{KIND_WORD[session.kind]}</Field>
        <Field label="Batch">{batch}</Field>
        <Field label="Duration">{session.duration_min} min</Field>
        <Field label="Part">#{session.seq}</Field>
      </div>

      <Field label="When">
        {placed ? (
          <span>
            {WEEKDAY_NAMES[session.weekday!]} {minToTime(session.start_min!)}–{minToTime(session.end_min!)}
          </span>
        ) : (
          <span className="text-muted-foreground">Not placed</span>
        )}
      </Field>

      <Field label="Room">
        {placed ? (
          <Select
            value={session.room_id ?? ""}
            onValueChange={(roomId) => roomId && roomId !== session.room_id && onOps([{ op: "set_room", session_id: session.id, room_id: roomId }])}
            disabled={readOnly || lockedBlock}
          >
            <SelectTrigger aria-label="Room for this session">
              <SelectValue placeholder="No room" />
            </SelectTrigger>
            <SelectContent>
              {!roomKnown && session.room_id && <SelectItem value={session.room_id}>Room outside the pool</SelectItem>}
              {rooms.map((r) => (
                <SelectItem key={r.room_id} value={r.room_id}>
                  {r.name} {"·"} {r.building_name}
                  {r.is_lab ? " (lab)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-muted-foreground">Chosen automatically when the session is placed</span>
        )}
      </Field>

      <Field label="Faculty">
        <FacultyEditor
          key={session.id}
          session={session}
          faculty={faculty}
          disabled={readOnly || lockedBlock}
          onApply={(ids) => onOps([{ op: "set_faculty", session_id: session.id, faculty_ids: ids }])}
        />
      </Field>

      {versionId != null && rev != null && (
        <SuggestionsList
          key={session.id}
          session={session}
          versionId={versionId}
          rev={rev}
          enabled={suggestionsEnabled}
          disabled={readOnly || lockedBlock || applying}
          disabledReason={readOnly ? readOnlyReason : lockedBlock ? "This session is locked. Unlock it to place or move it." : null}
          onApply={onOps}
          onPreview={onPreviewSlot}
        />
      )}

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={readOnly}
          onClick={() => onOps([{ op: session.locked ? "unlock" : "lock", session_id: session.id }])}
        >
          {session.locked ? <LockOpen className="mr-2 h-4 w-4" aria-hidden="true" /> : <Lock className="mr-2 h-4 w-4" aria-hidden="true" />}
          {session.locked ? "Unlock" : "Lock"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={readOnly || lockedBlock || !placed}
          onClick={() => onOps([{ op: "unplace", session_id: session.id }])}
        >
          Unplace
        </Button>
      </div>
      {lockedBlock && !readOnly && (
        <p className="text-xs text-muted-foreground">
          This session is locked. Unlock it to move, unplace or change its room or faculty.
        </p>
      )}
      {placed && !lockedBlock && !readOnly && (
        <p className="text-xs text-muted-foreground">Delete or Backspace on the card also unplaces it.</p>
      )}
    </section>
  );
}
