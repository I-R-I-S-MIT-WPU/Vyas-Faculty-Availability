// Pure helpers over generation runs (contract 9.6) for the generate card and the editor. No React.
//
// Exports:
//   isActive(run)                         queued or running (the polling condition)
//   STAGE_ORDER / stageLabel(stage)       plain-English stage names
//   modeLabel(mode)
//   progressPercent(run)                  0..100 integer (100 for a succeeded run)
//   progressText(run)                     one line: "Placing lab sessions (32%)", "Placed 118 of 130 sessions", ...
//   UNPLACED_LABELS / unplacedReasonLabel(code)
//   summariseUnplaced(unplaced)           [{code,label,count,items}] grouped by reason code, biggest group first
//   latestRun(runs)                       the newest run (by created_at; list order breaks ties)
//   undoTarget(runs, opts?) / canUndo(run, runs, opts?)   the server rule: newest non-undone run that committed placements (after_rev), no active run, version a draft
//   committedChanges(run)                 after_rev != null
//   isStalled / pollDelay / progressSignature / STALLED_HINT   stalled-run hint (2 min) and polling back-off (5 s after 60 s)

import type { GenerationMode, GenerationRun, GenerationStage, UnplacedCode, UnplacedItem } from "../types";

export const isActive = (run: Pick<GenerationRun, "status">): boolean => run.status === "queued" || run.status === "running";

export const STAGE_ORDER: GenerationStage[] = ["queued", "loading", "labs", "theory", "repair", "committing", "done"];

const STAGE_LABELS: Record<GenerationStage, string> = {
  queued: "Waiting to start",
  loading: "Loading the timetable data",
  labs: "Placing lab sessions",
  theory: "Placing theory sessions",
  repair: "Improving the result",
  committing: "Saving the timetable",
  done: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};

export function stageLabel(stage: GenerationStage | string): string {
  return STAGE_LABELS[stage as GenerationStage] ?? "Working";
}

const MODE_LABELS: Record<GenerationMode, string> = {
  fill_unplaced: "Fill unplaced sessions",
  regenerate_unlocked: "Regenerate all unlocked sessions",
};

export function modeLabel(mode: GenerationMode | string): string {
  return MODE_LABELS[mode as GenerationMode] ?? String(mode);
}

export function progressPercent(run: Pick<GenerationRun, "status" | "progress_percent">): number {
  if (run.status === "succeeded") return 100;
  const p = Number(run.progress_percent);
  return Number.isFinite(p) ? Math.max(0, Math.min(100, Math.round(p))) : 0;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function progressText(run: GenerationRun): string {
  switch (run.status) {
    case "queued":
      return "Waiting to start";
    case "running":
      return `${stageLabel(run.stage)} (${progressPercent(run)}%)`;
    case "succeeded": {
      const st = run.stats;
      if (!st) return "Finished";
      const base = `Placed ${st.placed} of ${plural(st.requested, "session")}`;
      return st.unplaced > 0 ? `${base}, ${st.unplaced} could not be placed` : `${base}`;
    }
    case "cancelled":
      return "Cancelled";
    case "failed":
      return run.error_message ? `Failed: ${run.error_message}` : "Failed";
    default:
      return stageLabel(run.stage);
  }
}

export const UNPLACED_LABELS: Record<UnplacedCode, string> = {
  FACULTY_BUSY: "Teacher not free",
  DIVISION_BUSY: "Class already busy",
  NO_ROOM: "No suitable room free",
  POLICY_RULES: "Blocked by a rule",
  LOCKED: "Session is locked",
  SERVER_REFUSED: "Refused when saving",
  TRY_LIMIT: "Gave up after many tries",
};

export function unplacedReasonLabel(code: UnplacedCode | string): string {
  return UNPLACED_LABELS[code as UnplacedCode] ?? "Other reason";
}

export interface UnplacedGroup {
  code: UnplacedCode | string;
  label: string;
  count: number;
  items: UnplacedItem[];
}

/** Group by reason code, biggest group first (ties: the code order of UNPLACED_LABELS, unknown codes last). */
export function summariseUnplaced(unplaced: UnplacedItem[] | null | undefined): UnplacedGroup[] {
  const groups = new Map<string, UnplacedGroup>();
  for (const item of unplaced ?? []) {
    const g = groups.get(item.code);
    if (g) {
      g.count += 1;
      g.items.push(item);
    } else {
      groups.set(item.code, { code: item.code, label: unplacedReasonLabel(item.code), count: 1, items: [item] });
    }
  }
  const order = Object.keys(UNPLACED_LABELS);
  const rank = (code: string) => {
    const i = order.indexOf(code);
    return i === -1 ? order.length : i;
  };
  return [...groups.values()].sort((a, b) => b.count - a.count || rank(a.code as string) - rank(b.code as string));
}

const time = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
};

/** The newest run. Falls back to list order (newest first, as the API sends it) when created_at ties. */
export function latestRun(runs: GenerationRun[]): GenerationRun | null {
  let best: GenerationRun | null = null;
  for (const r of runs) if (!best || time(r.created_at) > time(best.created_at)) best = r;
  return best;
}

/** True when the run changed the timetable (some chunk was committed): then it can be undone, whatever its final status. */
export const committedChanges = (run: Pick<GenerationRun, "after_rev">): boolean => run.after_rev !== null && run.after_rev !== undefined;

/** Server order: newest created_at first; the lower id wins a tie (ORDER BY created_at DESC, id). */
const isNewer = (a: GenerationRun, b: GenerationRun): boolean => {
  const ta = time(a.created_at);
  const tb = time(b.created_at);
  return ta > tb || (ta === tb && a.id < b.id);
};

/**
 * The run an "Undo" would target. Mirrors the server (undoRun / NOT_UNDOABLE): the NEWEST run of the version that is not
 * undone, not queued/running and has committed placements (after_rev set). Failed and cancelled runs count when they
 * committed some chunks; no-op runs (after_rev null) are ignored. None while any run is active or when the version is not
 * a draft (`isDraft` defaults to true: pass false for a published version). The server stays the authority (it also
 * checks that the run really holds placements) and answers 409 if it disagrees.
 */
export function undoTarget(runs: GenerationRun[], opts: { isDraft?: boolean } = {}): GenerationRun | null {
  if (opts.isDraft === false) return null;
  if (runs.some(isActive)) return null;
  let best: GenerationRun | null = null;
  for (const r of runs) {
    if (r.undone_at || !committedChanges(r)) continue;
    if (!best || isNewer(r, best)) best = r;
  }
  return best;
}

/** Whether the Undo button should be offered for `run`: it must be the undo target (see undoTarget). */
export function canUndo(run: GenerationRun, runs: GenerationRun[], opts: { isDraft?: boolean } = {}): boolean {
  return undoTarget(runs, opts)?.id === run.id;
}

// ---- stalled-run hint and polling back-off (the server can restart and leave a run 'running' for up to 15 minutes)

export const STALL_AFTER_MS = 2 * 60_000;
export const POLL_FAST_MS = 1000;
export const POLL_SLOW_MS = 5000;
export const POLL_BACKOFF_AFTER_MS = 60_000;

/** What counts as progress: any change of this string means the run moved. */
export const progressSignature = (run: Pick<GenerationRun, "id" | "status" | "stage" | "progress_percent">): string =>
  `${run.id}|${run.status}|${run.stage}|${run.progress_percent}`;

/** True when nothing about an active run changed for 2 minutes (client clock). */
export const isStalled = (lastChangeAt: number, now: number): boolean => now - lastChangeAt >= STALL_AFTER_MS;

/** Poll every second, every 5 s once the run has not changed for a minute. */
export const pollDelay = (lastChangeAt: number, now: number): number => (now - lastChangeAt > POLL_BACKOFF_AFTER_MS ? POLL_SLOW_MS : POLL_FAST_MS);

export const STALLED_HINT = "This run looks stalled (the server may have restarted). You can cancel it.";
