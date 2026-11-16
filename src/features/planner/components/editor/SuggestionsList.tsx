// "Suggested slots" for one session: the server's top 5 slots with a reason and ready-made ops.
//
//   SuggestionsList({ session, versionId, rev, enabled?, disabled, disabledReason?, onApply, onPreview })
//     session          the selected session (placed or not)
//     versionId, rev   the snapshot's version and revision: the query refreshes after every edit (hooks.useSuggestions)
//     enabled          false = do not fetch (version not a draft, or an edit-blocking state such as a running generation);
//                      cached data for this rev still shows. Default true.
//     disabled         true while an edit is in flight, the version is not a draft or the session is locked: the buttons are disabled
//                      (the reason is shown); the list itself still loads because suggestions are read-only
//     onApply(ops)     the board's useApplyOps `apply`: optimistic update, rollback and rejection toasts all work as for a drag
//     onPreview(slot)  hover or keyboard focus on a row previews that slot on the grid (a dashed ghost); null when it ends
// A row = weekday + time range + room + reason + 'Place here' (unplaced session) or 'Move here' (placed one). With no
// suggestions the server's none_reason is shown as an alert with its text and the slot counts.

import { useEffect, useRef } from "react";
import { AlertCircle, ArrowRightLeft, MapPin, Plus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSuggestions } from "../../hooks";
import { describeApiError } from "../../lib/errors";
import { isPlaced } from "../../lib/patch";
import type { PreviewSlot } from "../../lib/shadingOverlay";
import { WEEKDAY_NAMES, minToTime } from "../../lib/time";
import type { NoneReason, PlannerOp, PlannerSession, Suggestion } from "../../types";

export const SUGGESTION_LIMIT = 5;

export interface SuggestionsListProps {
  session: PlannerSession;
  versionId: string;
  rev: number;
  /** False: no request is made (see header). */
  enabled?: boolean;
  disabled?: boolean;
  disabledReason?: string | null;
  onApply: (ops: PlannerOp[]) => void;
  onPreview?: (slot: PreviewSlot | null) => void;
}

const slotText = (s: Suggestion) => `${WEEKDAY_NAMES[s.weekday]} ${minToTime(s.start_min)}–${minToTime(s.end_min)}`;

function NoneReasonAlert({ reason }: { reason: NoneReason }) {
  const { slots } = reason;
  return (
    <Alert role={undefined}>
      <AlertCircle className="h-4 w-4" aria-hidden="true" />
      <AlertDescription className="space-y-1">
        <p>{reason.text}</p>
        {reason.code !== "LOCKED" && (
          <p className="text-xs text-muted-foreground">
            {slots.total} slots checked, {slots.free} free. Blocked by teacher: {slots.faculty}, by class: {slots.batch}, by room: {slots.room}.
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}

export function SuggestionsList({ session, versionId, rev, enabled = true, disabled = false, disabledReason, onApply, onPreview }: SuggestionsListProps) {
  const query = useSuggestions(session.id, { versionId, rev, limit: SUGGESTION_LIMIT, enabled });
  const placed = isPlaced(session);
  const data = query.data;

  // A preview must never outlive its row (selection changed, list reloaded, panel closed).
  const previewRef = useRef(onPreview);
  previewRef.current = onPreview;
  useEffect(() => () => previewRef.current?.(null), [session.id, data]);

  const preview = (s: Suggestion | null) =>
    onPreview?.(s ? { weekday: s.weekday, start_min: s.start_min, duration_min: s.end_min - s.start_min } : null);

  const suggestions = (data?.suggestions ?? []).slice(0, SUGGESTION_LIMIT);

  return (
    <section aria-label="Suggested slots" className="space-y-2 border-t pt-3">
      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Suggested slots</h4>

      {query.isError && !data ? (
        <p className="text-sm text-destructive" role="alert">
          Suggestions could not be loaded. {describeApiError(query.error)}{" "}
          <button type="button" className="underline" onClick={() => void query.refetch()}>
            Retry
          </button>
        </p>
      ) : !data && !enabled ? (
        <p className="text-sm text-muted-foreground">{disabledReason || "Suggestions are only available while the draft can be edited."}</p>
      ) : !data ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading suggestions">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : suggestions.length === 0 ? (
        data.none_reason ? (
          <NoneReasonAlert reason={data.none_reason} />
        ) : (
          <p className="text-sm text-muted-foreground">No free slot found for this session.</p>
        )
      ) : (
        <>
          {disabled && disabledReason && <p className="text-xs text-muted-foreground">{disabledReason}</p>}
          <ul className="space-y-1.5" aria-busy={query.isFetching}>
            {suggestions.map((s, i) => (
              <li
                key={`${s.weekday}:${s.start_min}:${s.room_id}`}
                className="space-y-1 rounded-md border bg-background px-2 py-1.5 text-sm"
                onMouseEnter={() => preview(s)}
                onMouseLeave={() => preview(null)}
                onFocus={() => preview(s)}
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) preview(null);
                }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {i === 0 && <span className="mr-1 text-xs font-normal text-muted-foreground">Best:</span>}
                    {slotText(s)}
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" aria-hidden="true" />
                    {s.room_name}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{s.reason}</p>
                <Button
                  type="button"
                  size="sm"
                  variant={i === 0 ? "default" : "outline"}
                  className="h-7 px-2 text-xs"
                  // A list for another revision (or a kept previous answer) may hold slots that are taken by now.
                  disabled={disabled || query.isPlaceholderData || data.rev !== rev}
                  aria-label={`${placed ? "Move" : "Place"} ${session.subject_code} here: ${slotText(s)}, room ${s.room_name}`}
                  onClick={() => {
                    preview(null);
                    onApply(s.ops);
                  }}
                >
                  {placed ? <ArrowRightLeft className="mr-1 h-3 w-3" aria-hidden="true" /> : <Plus className="mr-1 h-3 w-3" aria-hidden="true" />}
                  {placed ? "Move here" : "Place here"}
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
