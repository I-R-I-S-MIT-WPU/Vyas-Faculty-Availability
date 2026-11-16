import { useCallback, useEffect, useRef, useState } from "react";
import { ToastAction } from "@/components/ui/toast";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { plannerKeys, useCancelRun, useGenerate, useGenerationRuns, useUndoRun } from "../../hooks";
import { describeApiError, isApiError } from "../../lib/errors";
import { finishedToast, generationErrorText, undoCounts, undoToast } from "../../lib/generateFlow";
import { isActive, isStalled, latestRun, progressSignature, undoTarget } from "../../lib/generation";
import type { GenerateRequest, GenerationRun, GenerationRunsResponse, UndoRunResponse } from "../../types";

export interface GenerateFlowOptions {
  /** Where the flow is shown: changes what a NOT_READY message points at. Default "setup". */
  where?: "setup" | "editor";
  /**
   * Use toasts for start errors and for the result of a run this hook started (with an Undo action).
   * The card shows these inline, so it leaves this off; the editor's compact button turns it on.
   */
  notify?: boolean;
  /** False for a version that is not a draft: nothing can be undone there. Default true. */
  isDraft?: boolean;
}

/**
 * True when the active run has not changed (status, stage, percent) for 2 minutes on this client's clock. Re-checked every
 * 5 s while a run is active; the state only flips when the answer changes, so it causes no renders in between.
 */
function useStalled(active: GenerationRun | null): boolean {
  const [stalled, setStalled] = useState(false);
  const sig = active ? progressSignature(active) : null;
  useEffect(() => {
    setStalled(false);
    if (!sig) return;
    const since = Date.now(); // the signature just changed: this is the last change
    const id = setInterval(() => setStalled(isStalled(since, Date.now())), 5000);
    return () => clearInterval(id);
  }, [sig]);
  return stalled;
}

/**
 * Shared logic of the Generate card and the editor's Generate button: starts a run, follows it (the runs query polls
 * while one is active), cancels, undoes. All errors are turned into sentences here.
 */
export function useGenerateFlow(versionId: string, options: GenerateFlowOptions = {}) {
  const where = options.where ?? "setup";
  const notify = options.notify ?? false;
  const qc = useQueryClient();
  const runs = useGenerationRuns(versionId);
  const generate = useGenerate(versionId, { silent: true });
  const cancel = useCancelRun();
  const undo = useUndoRun({ silent: true });
  const [error, setError] = useState<string | null>(null);
  const watched = useRef<string | null>(null);

  const list = runs.data?.runs ?? [];
  const active = runs.data?.active ?? list.find(isActive) ?? null;
  /** The newest run that is no longer active: what the summary shows. */
  const latestFinished = latestRun(list.filter((r) => !isActive(r)));
  /** The run an "Undo last generation" button would undo (server rule, see lib/generation canUndo). */
  const undoable = undoTarget(list, { isDraft: options.isDraft });
  const stalled = useStalled(active);

  const { mutateAsync: undoAsync } = undo;
  const undoRun = useCallback(
    async (run: GenerationRun): Promise<UndoRunResponse | null> => {
      try {
        const res = await undoAsync(run.id);
        const { changed, refused } = undoCounts(res);
        toast(undoToast(res.restored, changed, refused));
        return res;
      } catch (err) {
        toast({ title: "Could not undo the run", description: describeApiError(err), variant: "destructive" });
        return null;
      }
    },
    [undoAsync],
  );
  // The toast's Undo button can outlive the render that created it: always call the latest function.
  const undoRef = useRef(undoRun);
  undoRef.current = undoRun;

  const { mutateAsync: generateAsync } = generate;
  const { refetch } = runs;
  const start = useCallback(
    async (request: GenerateRequest): Promise<GenerationRun | null> => {
      setError(null);
      try {
        // Resolves as soon as the POST answers (the heavy refetches run in the background), so the id is watched before
        // a quick run can finish.
        const run = await generateAsync(request);
        watched.current = run.id;
        // Show it as active right away unless the refetch already brought it (it then reconciles): no flash of an idle button, no double start.
        qc.setQueryData<GenerationRunsResponse>(plannerKeys.generation(versionId), (old) =>
          old?.runs.some((r) => r.id === run.id) ? old : { runs: [run, ...(old?.runs ?? [])], active: run },
        );
        return run;
      } catch (err) {
        const code = isApiError(err) ? err.code : undefined;
        const message = generationErrorText(code, describeApiError(err), where);
        setError(message);
        if (notify) toast({ title: "Could not start generation", description: message, variant: "destructive" });
        // Someone else's run is in progress: pick it up so its progress shows.
        if (code === "GENERATION_RUNNING") void refetch();
        return null;
      }
    },
    [generateAsync, notify, qc, refetch, versionId, where],
  );

  // Tell the admin how a run they started ended (only while a notifying host is mounted).
  useEffect(() => {
    const id = watched.current;
    if (!id || !notify) return;
    const run = list.find((r) => r.id === id);
    if (!run || isActive(run)) return;
    watched.current = null;
    const t = finishedToast(run);
    toast({
      title: t.title,
      description: t.description,
      variant: t.destructive ? "destructive" : undefined,
      action: t.undoable ? (
        <ToastAction altText="Undo this generation" onClick={() => void undoRef.current(run)}>
          Undo
        </ToastAction>
      ) : undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs.data, notify]);

  const { mutate: cancelMutate } = cancel;
  const cancelActive = useCallback(() => {
    if (active) cancelMutate(active.id);
  }, [active, cancelMutate]);

  return {
    runs,
    list,
    active,
    latestFinished,
    undoable,
    start,
    /** True only while the start request itself is in flight (not while the lists refresh afterwards). */
    starting: generate.isPending,
    /** The active run has shown no progress for 2 minutes: offer Cancel prominently. */
    stalled,
    error,
    clearError: () => setError(null),
    cancelActive,
    cancelling: cancel.isPending,
    undoRun,
    undoing: undo.isPending,
    /** A run is queued/running, or one is being started. */
    busy: !!active || generate.isPending,
  };
}
