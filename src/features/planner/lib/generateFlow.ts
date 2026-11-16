// Pure helpers for the "Generate timetable" card and the editor's compact Generate button (contract 9.6). No React.
//
// Exports:
//   SEEDS_MIN / SEEDS_MAX / SEEDS_DEFAULT      1 / 5 / 3
//   clampSeeds(raw)                            integer 1..5 (default 3 for anything that is not a number)
//   needsConfirm(mode)                         true for regenerate_unlocked
//   buildGenerateRequest(opts)                 GenerateRequest: empty division list = all divisions (omitted), confirm only for regenerate
//   regenerateWarning                          the warning text shown under the regenerate mode
//   QUICK_ACTIONS / quickActions(id, name)     the compact button's menu entries with their request
//   generationErrorText(code, fallback, where) one sentence per start-of-run error code
//   formatDuration(ms)                         "850 ms", "3.2 s", "1 min 5 s"
//   divisionLabel(d) / scopeSummary(ids, divs) "Sem 3 - A"; "All divisions" / "2 divisions" / "Sem 3 - A"
//   toggleId(ids, id)                          add/remove an id (no duplicates)
//   runSummary(run)                            the numbers of a finished run, ready to render
//   finishedToast(run)                         toast title/description for a run that just finished
//   cancelNote(stage)                          what cancelling does at the current stage
//   undoToast(restored, changed, refused?)     toast text after an undo
//   unplacedPreview(items, limit)              first `limit` items and how many are hidden

import type { GenerateRequest, GenerationMode, GenerationRun, UndoRunResponse, UnplacedItem } from "../types";
import { committedChanges } from "./generation";

export const SEEDS_MIN = 1;
export const SEEDS_MAX = 5;
export const SEEDS_DEFAULT = 3;

export function clampSeeds(raw: unknown): number {
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return SEEDS_DEFAULT;
  return Math.max(SEEDS_MIN, Math.min(SEEDS_MAX, Math.round(n)));
}

export const needsConfirm = (mode: GenerationMode): boolean => mode === "regenerate_unlocked";

export const regenerateWarning =
  "This clears every unlocked placed session in scope and plans them again. Locked sessions stay. You can undo the last generation.";

export function buildGenerateRequest(opts: {
  mode: GenerationMode;
  divisionIds?: string[] | null;
  seeds?: number | string | null;
  /** True once the admin confirmed a regenerate. Ignored (never sent) for fill_unplaced. */
  confirmed?: boolean;
}): GenerateRequest {
  const body: GenerateRequest = { mode: opts.mode, seeds: clampSeeds(opts.seeds) };
  const ids = [...new Set(opts.divisionIds ?? [])];
  if (ids.length > 0) body.division_ids = ids;
  if (needsConfirm(opts.mode) && opts.confirmed) body.confirm = true;
  return body;
}

export type QuickActionId = "fill_division" | "fill_all" | "regenerate_division";

export interface QuickAction {
  id: QuickActionId;
  label: string;
  hint: string;
  request: { mode: GenerationMode; divisionIds: string[] };
  /** Show the AlertDialog before sending (regenerate). */
  confirm: boolean;
}

/** The compact button's menu. Without a division only "Fill unplaced in all divisions" makes sense. */
export function quickActions(divisionId: string | null | undefined, divisionName?: string): QuickAction[] {
  const actions: QuickAction[] = [];
  const name = divisionName?.trim() ? divisionName.trim() : "";
  if (divisionId) {
    actions.push({
      id: "fill_division",
      label: name ? `Fill unplaced in ${name}` : "Fill unplaced in this division",
      hint: "Places only the sessions that are not on the grid yet.",
      request: { mode: "fill_unplaced", divisionIds: [divisionId] },
      confirm: false,
    });
  }
  actions.push({
    id: "fill_all",
    label: "Fill unplaced in all divisions",
    hint: "Places only the sessions that are not on the grid yet.",
    request: { mode: "fill_unplaced", divisionIds: [] },
    confirm: false,
  });
  if (divisionId) {
    actions.push({
      id: "regenerate_division",
      label: name ? `Regenerate ${name} (unlocked)` : "Regenerate this division (unlocked)",
      hint: "Clears this division's unlocked sessions and plans them again.",
      request: { mode: "regenerate_unlocked", divisionIds: [divisionId] },
      confirm: true,
    });
  }
  return actions;
}

/** One readable sentence for a failed start. `where` changes what NOT_READY points at. */
export function generationErrorText(code: string | undefined, fallback: string, where: "setup" | "editor" = "setup"): string {
  switch (code) {
    case "NOT_READY":
      return where === "setup"
        ? "The setup is not ready yet. Fix the errors in the readiness report above, then generate again."
        : "The setup is not ready yet. Open Term setup, fix the errors in its readiness report, then generate again.";
    case "GENERATION_RUNNING":
      return "A generation is already running for this timetable. Wait for it to finish, or cancel it first.";
    case "CONFIRM_REQUIRED":
      return "Regenerating needs your confirmation. Confirm in the dialog and try again.";
    case "NOT_DRAFT":
      return "Only the draft timetable can be generated into. This version is no longer a draft.";
    default:
      return fallback || "Could not start the generation.";
  }
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return "-";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)} s`;
  const m = Math.floor(s / 60);
  const rest = Math.round(s - m * 60);
  return rest === 0 ? `${m} min` : `${m} min ${rest} s`;
}

export interface DivisionLike {
  id: string;
  semester: number;
  name: string;
}

export const divisionLabel = (d: Pick<DivisionLike, "semester" | "name">): string => `Sem ${d.semester} - ${d.name}`;

export function scopeSummary(ids: string[], divisions: DivisionLike[]): string {
  if (ids.length === 0) return "All divisions";
  if (ids.length === 1) {
    const d = divisions.find((x) => x.id === ids[0]);
    return d ? divisionLabel(d) : "1 division";
  }
  return `${ids.length} divisions`;
}

export const toggleId = (ids: string[], id: string): string[] => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);

export interface RunSummary {
  requested: number;
  placed: number;
  unplaced: number;
  duration: string;
  seedsTried: number;
  bestSeed: number | null;
  lab: { placed: number; total: number };
  theory: { placed: number; total: number };
  repairMoves: number;
}

/** Null while the run has no numbers yet (queued, early running). */
export function runSummary(run: Pick<GenerationRun, "stats">): RunSummary | null {
  const st = run.stats;
  if (!st) return null;
  return {
    requested: st.requested,
    placed: st.placed,
    unplaced: st.unplaced,
    duration: formatDuration(st.duration_ms),
    seedsTried: st.seeds_tried,
    bestSeed: st.best_seed ?? null,
    lab: st.by_kind?.lab ?? { placed: 0, total: 0 },
    theory: st.by_kind?.theory ?? { placed: 0, total: 0 },
    repairMoves: st.repair_moves ?? 0,
  };
}

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

export interface ToastText {
  title: string;
  description?: string;
  destructive?: boolean;
  /** Offer an Undo action (only for a run that changed the timetable). */
  undoable?: boolean;
}

/** Shown for a cancelled/failed run that had already committed some chunks. */
export const PARTLY_SAVED = "Part of the plan was already saved; you can undo it";

/** What cancelling does right now. The saving step commits chunk by chunk, so cancelling there keeps the saved chunks. */
export function cancelNote(stage: string | null | undefined): string {
  return stage === "committing"
    ? "Cancelling now keeps what was already saved; you can undo it afterwards."
    : "Cancelling before the saving step changes nothing.";
}

/** What to tell the admin when a run they started has just finished. */
export function finishedToast(run: GenerationRun): ToastText {
  const s = runSummary(run);
  switch (run.status) {
    case "succeeded": {
      if (!s) return { title: "Timetable generated", undoable: committedChanges(run) };
      const unplaced = s.unplaced > 0 ? `, ${s.unplaced} could not be placed` : "";
      return {
        title: s.unplaced > 0 ? "Timetable generated, some sessions left" : "Timetable generated",
        description: `Placed ${s.placed} of ${plural(s.requested, "session")}${unplaced} (${s.duration}).`,
        undoable: committedChanges(run),
      };
    }
    case "cancelled":
      return committedChanges(run)
        ? { title: "Generation cancelled", description: PARTLY_SAVED, undoable: true }
        : { title: "Generation cancelled", description: "Nothing was changed." };
    case "failed":
      return committedChanges(run)
        ? { title: "Generation failed", description: `${run.error_message || "The run stopped early."} ${PARTLY_SAVED}.`, destructive: true, undoable: true }
        : { title: "Generation failed", description: run.error_message || "Nothing was changed.", destructive: true };
    default:
      return { title: "Generation finished" };
  }
}

/**
 * `changed` = sessions left as they are because they changed since the run; `refused` = sessions the server could not put
 * back (separate reason). The API lists refused sessions in skipped_session_ids too: use undoCounts() to split them.
 */
export function undoToast(restored: number, changed: number, refused = 0): { title: string; description?: string } {
  const title = `Generation undone: ${plural(restored, "session")} restored`;
  const parts: string[] = [];
  if (changed > 0) parts.push(`${plural(changed, "session")} you changed since were left as they are.`);
  if (refused > 0) parts.push(`${plural(refused, "session")} could not be restored.`);
  return parts.length > 0 ? { title, description: parts.join(" ") } : { title };
}

/** Split an undo response into the two numbers undoToast shows (refused sessions are also in skipped_session_ids). */
export function undoCounts(res: Pick<UndoRunResponse, "skipped_session_ids" | "refused">): { changed: number; refused: number } {
  const refused = res.refused?.length ?? 0;
  return { changed: Math.max(0, (res.skipped_session_ids?.length ?? 0) - refused), refused };
}

export function unplacedPreview(items: UnplacedItem[], limit: number): { shown: UnplacedItem[]; hidden: number } {
  const shown = items.slice(0, Math.max(0, limit));
  return { shown, hidden: items.length - shown.length };
}
