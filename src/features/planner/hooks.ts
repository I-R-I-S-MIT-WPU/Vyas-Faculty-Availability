import { useCallback, useEffect, useRef, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { plannerApi } from "./api";
import { describeApiError } from "./lib/errors";
import { isActive as isRunActive, pollDelay, progressSignature } from "./lib/generation";
import { createTrailingScheduler } from "./lib/trailingScheduler";
import { applyChanged } from "./lib/patch";
import { opsErrorMessage } from "./lib/opsErrors";
import { chooseSnapshot, decideEvent, shouldReloadAfterRollback } from "./lib/revSync";
import { applyOpsToSessions, touchedSessionIds } from "./lib/sessionFilters";
import type {
  AddTermRoomsInput,
  BatchInput,
  BatchPatch,
  DivisionInput,
  DivisionPatch,
  FacultyInput,
  FacultyPatch,
  GenerateRequest,
  GenerationRun,
  ImportEntity,
  OfferingFacultyInput,
  OfferingInput,
  OfferingPatch,
  OpsResponse,
  PlannerOp,
  PlannerSession,
  RulesPatchBody,
  Snapshot,
  SubjectInput,
  SubjectPatch,
  TermInput,
  TermPatch,
} from "./types";

// ---------------------------------------------------------------------------
// Query keys. Everything starts with 'planner'. Term-scoped data lives under
// ['planner', 'term', termId, ...] so one prefix invalidates it all.
// ---------------------------------------------------------------------------
export const plannerKeys = {
  all: ["planner"] as const,
  terms: () => ["planner", "terms"] as const, // the list
  anyTerm: () => ["planner", "term"] as const, // prefix of every term-scoped key
  term: (termId: string) => ["planner", "term", termId] as const,
  termDetail: (termId: string) => ["planner", "term", termId, "detail"] as const,
  subjects: (termId: string) => ["planner", "term", termId, "subjects"] as const,
  divisions: (termId: string) => ["planner", "term", termId, "divisions"] as const,
  offerings: (termId: string, divisionId?: string) =>
    ["planner", "term", termId, "offerings", divisionId ?? "all"] as const,
  termRooms: (termId: string) => ["planner", "term", termId, "rooms"] as const,
  readiness: (termId: string) => ["planner", "term", termId, "readiness"] as const,
  /** Global faculty; the key carries the term only because assigned_in_term depends on it. */
  facultyAll: () => ["planner", "faculty"] as const,
  faculty: (termId?: string) => ["planner", "faculty", termId ?? "all"] as const,
  availableRooms: () => ["planner", "available-rooms"] as const,
  importTemplates: () => ["planner", "import-templates"] as const,
  anyVersion: () => ["planner", "version"] as const, // prefix of every version-scoped key (sessions summary, session lists)
  version: (versionId: string) => ["planner", "version", versionId] as const,
  /** The editor's single source of truth: rev + all data + sessions. Kept live by socket patches and optimistic ops. */
  snapshot: (versionId: string) => ["planner", "version", versionId, "snapshot"] as const,
  sessionsSummary: (versionId: string) => ["planner", "version", versionId, "summary"] as const,
  sessions: (versionId: string, divisionId?: string) =>
    ["planner", "version", versionId, "sessions", divisionId ?? "all"] as const,
  // ---- Phase 3 (contract section 9)
  /** Rule config of a term (23 rows, with their specs). */
  rules: (termId: string) => ["planner", "term", termId, "rules"] as const,
  diagnostics: (versionId: string) => ["planner", "version", versionId, "diagnostics"] as const,
  /** The runs of a version (newest first) plus the active one. Polled while a run is queued or running. */
  generation: (versionId: string) => ["planner", "version", versionId, "generation"] as const,
  /** Keyed by session AND the snapshot rev, so every edit gives a fresh query instead of showing stale slots. */
  candidates: (versionId: string, sessionId: string, rev: number | null) =>
    ["planner", "version", versionId, "candidates", sessionId, rev ?? "none"] as const,
  suggestions: (versionId: string, sessionId: string, rev: number | null, limit?: number) =>
    ["planner", "version", versionId, "suggestions", sessionId, rev ?? "none", limit ?? "default"] as const,
};

/** Version-scoped keys that depend on the rule config (diagnostics, and the scores of candidates/suggestions). */
const RULE_DEPENDENT = new Set(["diagnostics", "candidates", "suggestions"]);
const invalidateRuleDependents = (qc: QueryClient) =>
  qc.invalidateQueries({
    predicate: (q) => q.queryKey[0] === "planner" && q.queryKey[1] === "version" && RULE_DEPENDENT.has(String(q.queryKey[3])),
  });

/** Term data only (no sessions): for changes that cannot alter which sessions a term requires (room pool, timing settings). */
const termDataScope = (termId: string): QueryKey[] => [plannerKeys.term(termId), plannerKeys.terms(), plannerKeys.facultyAll()];

/**
 * Everything a change inside a term can make stale: its own data, the term list counts, faculty counts,
 * and the draft version's sessions summary / session lists (offerings, weekly counts, divisions, batches and
 * faculty assignments change how many sessions are required). The version prefix is cheap: invalidating marks
 * matching queries stale, and react-query only refetches the ones that are mounted (active) right now.
 */
const termScope = (termId: string): QueryKey[] => [...termDataScope(termId), plannerKeys.anyVersion()];

/** A bad term id answers 404; retrying it only keeps the skeleton on screen for seconds. */
const retryUnless404 = (failureCount: number, err: unknown): boolean =>
  (err as { status?: number } | null)?.status !== 404 && failureCount < 2;

// ---------------------------------------------------------------------------
// Mutation helper. Every mutation below is built from this, so they all:
//  - invalidate the keys you return from `invalidate` (and wait for the refetch, so
//    `isPending` stays true until the list on screen is fresh),
//  - toast a readable message on error (opt out with `silent` when the form shows it inline),
//  - optionally toast a success message.
// Per-call `mutate(vars, { onSuccess, onError })` still works for closing dialogs etc.
// ---------------------------------------------------------------------------
export interface MutationExtras<TData, TVars> {
  /** Don't toast errors: the caller renders them itself (field errors, LOCKED_BY_PLACEMENTS banner...). */
  silent?: boolean;
  errorTitle?: string;
  successMessage?: string | ((data: TData, vars: TVars) => string);
  /** Default true: the mutation resolves after the invalidated queries refetched. False resolves as soon as the request does. */
  awaitInvalidation?: boolean;
}

function usePlannerMutation<TData, TVars = void>(
  mutationFn: (vars: TVars) => Promise<TData>,
  invalidate: (data: TData, vars: TVars) => QueryKey[],
  extras: MutationExtras<TData, TVars> = {},
) {
  const qc = useQueryClient();
  return useMutation<TData, unknown, TVars>({
    mutationFn,
    onSuccess: async (data, vars) => {
      const refreshed = Promise.all(invalidate(data, vars).map((queryKey) => qc.invalidateQueries({ queryKey })));
      if (extras.awaitInvalidation === false) void refreshed.catch(() => undefined);
      else await refreshed;
      const msg = typeof extras.successMessage === "function" ? extras.successMessage(data, vars) : extras.successMessage;
      if (msg) toast({ title: msg });
    },
    onError: (err) => {
      if (extras.silent) return;
      toast({ title: extras.errorTitle ?? "Something went wrong", description: describeApiError(err), variant: "destructive" });
    },
  });
}

// ---------------------------------------------------------------------------
// Terms
// ---------------------------------------------------------------------------
export const useTerms = () => useQuery({ queryKey: plannerKeys.terms(), queryFn: plannerApi.listTerms });

export const useTerm = (termId: string | undefined) =>
  useQuery({
    queryKey: plannerKeys.termDetail(termId ?? ""),
    queryFn: () => plannerApi.getTerm(termId!),
    enabled: !!termId,
    retry: retryUnless404,
  });

export const useCreateTerm = (extras?: MutationExtras<Awaited<ReturnType<typeof plannerApi.createTerm>>, TermInput>) =>
  usePlannerMutation((input: TermInput) => plannerApi.createTerm(input), () => [plannerKeys.terms()], {
    errorTitle: "Could not create term",
    ...extras,
  });

/** Changing timing fields when sessions are placed fails with code LOCKED_BY_PLACEMENTS; pass silent to show your own banner. */
export const useUpdateTerm = (termId: string, extras?: MutationExtras<unknown, TermPatch>) =>
  usePlannerMutation((patch: TermPatch) => plannerApi.updateTerm(termId, patch), () => termDataScope(termId), {
    errorTitle: "Could not save settings",
    ...extras,
  });

export const useDeleteTerm = (extras?: MutationExtras<void, string>) =>
  usePlannerMutation((termId: string) => plannerApi.deleteTerm(termId), () => [plannerKeys.all], {
    errorTitle: "Could not delete term",
    ...extras,
  });

// ---------------------------------------------------------------------------
// Global lookups
// ---------------------------------------------------------------------------
export const useAvailableRooms = () =>
  useQuery({ queryKey: plannerKeys.availableRooms(), queryFn: plannerApi.availableRooms, staleTime: 5 * 60_000 });

export const useImportTemplates = () =>
  useQuery({ queryKey: plannerKeys.importTemplates(), queryFn: plannerApi.importTemplates, staleTime: Infinity });

// ---------------------------------------------------------------------------
// Faculty (global). Faculty edits can change readiness in any term, hence the wide invalidation.
// ---------------------------------------------------------------------------
const facultyScope = (): QueryKey[] => [plannerKeys.facultyAll(), plannerKeys.anyTerm()];

export const useFaculty = (termId?: string) =>
  useQuery({ queryKey: plannerKeys.faculty(termId), queryFn: () => plannerApi.listFaculty(termId) });

export const useCreateFaculty = (extras?: MutationExtras<unknown, FacultyInput>) =>
  usePlannerMutation((input: FacultyInput) => plannerApi.createFaculty(input), facultyScope, {
    errorTitle: "Could not add faculty",
    ...extras,
  });

export const useUpdateFaculty = (extras?: MutationExtras<unknown, { id: string; patch: FacultyPatch }>) =>
  usePlannerMutation(({ id, patch }: { id: string; patch: FacultyPatch }) => plannerApi.updateFaculty(id, patch), facultyScope, {
    errorTitle: "Could not save faculty",
    ...extras,
  });

export const useDeleteFaculty = (extras?: MutationExtras<void, string>) =>
  usePlannerMutation((id: string) => plannerApi.deleteFaculty(id), facultyScope, {
    errorTitle: "Could not delete faculty",
    ...extras,
  });

// ---------------------------------------------------------------------------
// Subjects
// ---------------------------------------------------------------------------
export const useSubjects = (termId: string) =>
  useQuery({ queryKey: plannerKeys.subjects(termId), queryFn: () => plannerApi.listSubjects(termId), enabled: !!termId, retry: retryUnless404 });

export const useCreateSubject = (termId: string, extras?: MutationExtras<unknown, SubjectInput>) =>
  usePlannerMutation((input: SubjectInput) => plannerApi.createSubject(termId, input), () => termScope(termId), {
    errorTitle: "Could not add subject",
    ...extras,
  });

export const useUpdateSubject = (termId: string, extras?: MutationExtras<unknown, { id: string; patch: SubjectPatch }>) =>
  usePlannerMutation(
    ({ id, patch }: { id: string; patch: SubjectPatch }) => plannerApi.updateSubject(termId, id, patch),
    () => termScope(termId),
    { errorTitle: "Could not save subject", ...extras },
  );

export const useDeleteSubject = (termId: string, extras?: MutationExtras<void, string>) =>
  usePlannerMutation((id: string) => plannerApi.deleteSubject(termId, id), () => termScope(termId), {
    errorTitle: "Could not delete subject",
    ...extras,
  });

// ---------------------------------------------------------------------------
// Divisions and batches
// ---------------------------------------------------------------------------
export const useDivisions = (termId: string) =>
  useQuery({ queryKey: plannerKeys.divisions(termId), queryFn: () => plannerApi.listDivisions(termId), enabled: !!termId, retry: retryUnless404 });

export const useCreateDivision = (termId: string, extras?: MutationExtras<unknown, DivisionInput>) =>
  usePlannerMutation((input: DivisionInput) => plannerApi.createDivision(termId, input), () => termScope(termId), {
    errorTitle: "Could not add division",
    ...extras,
  });

export const useUpdateDivision = (termId: string, extras?: MutationExtras<unknown, { id: string; patch: DivisionPatch }>) =>
  usePlannerMutation(
    ({ id, patch }: { id: string; patch: DivisionPatch }) => plannerApi.updateDivision(termId, id, patch),
    () => termScope(termId),
    { errorTitle: "Could not save division", ...extras },
  );

export const useDeleteDivision = (termId: string, extras?: MutationExtras<void, string>) =>
  usePlannerMutation((id: string) => plannerApi.deleteDivision(termId, id), () => termScope(termId), {
    errorTitle: "Could not delete division",
    ...extras,
  });

export const useCreateBatch = (termId: string, extras?: MutationExtras<unknown, { divisionId: string; input: BatchInput }>) =>
  usePlannerMutation(
    ({ divisionId, input }: { divisionId: string; input: BatchInput }) => plannerApi.createBatch(termId, divisionId, input),
    () => termScope(termId),
    { errorTitle: "Could not add batch", ...extras },
  );

export const useUpdateBatch = (
  termId: string,
  extras?: MutationExtras<unknown, { divisionId: string; batchId: string; patch: BatchPatch }>,
) =>
  usePlannerMutation(
    ({ divisionId, batchId, patch }: { divisionId: string; batchId: string; patch: BatchPatch }) =>
      plannerApi.updateBatch(termId, divisionId, batchId, patch),
    () => termScope(termId),
    { errorTitle: "Could not save batch", ...extras },
  );

export const useDeleteBatch = (termId: string, extras?: MutationExtras<void, { divisionId: string; batchId: string }>) =>
  usePlannerMutation(
    ({ divisionId, batchId }: { divisionId: string; batchId: string }) => plannerApi.deleteBatch(termId, divisionId, batchId),
    () => termScope(termId),
    { errorTitle: "Could not delete batch", ...extras },
  );

// ---------------------------------------------------------------------------
// Offerings
// ---------------------------------------------------------------------------
export const useOfferings = (termId: string, divisionId?: string) =>
  useQuery({
    queryKey: plannerKeys.offerings(termId, divisionId),
    queryFn: () => plannerApi.listOfferings(termId, divisionId),
    enabled: !!termId,
    retry: retryUnless404,
  });

export const useCreateOffering = (termId: string, extras?: MutationExtras<unknown, OfferingInput>) =>
  usePlannerMutation((input: OfferingInput) => plannerApi.createOffering(termId, input), () => termScope(termId), {
    errorTitle: "Could not add offering",
    ...extras,
  });

export const useUpdateOffering = (termId: string, extras?: MutationExtras<unknown, { id: string; patch: OfferingPatch }>) =>
  usePlannerMutation(
    ({ id, patch }: { id: string; patch: OfferingPatch }) => plannerApi.updateOffering(termId, id, patch),
    () => termScope(termId),
    { errorTitle: "Could not save offering", ...extras },
  );

export const useSetOfferingFaculty = (
  termId: string,
  extras?: MutationExtras<unknown, { id: string; faculty: OfferingFacultyInput[] }>,
) =>
  usePlannerMutation(
    ({ id, faculty }: { id: string; faculty: OfferingFacultyInput[] }) => plannerApi.setOfferingFaculty(termId, id, faculty),
    () => termScope(termId),
    { errorTitle: "Could not save faculty assignment", ...extras },
  );

export const useDeleteOffering = (termId: string, extras?: MutationExtras<void, string>) =>
  usePlannerMutation((id: string) => plannerApi.deleteOffering(termId, id), () => termScope(termId), {
    errorTitle: "Could not delete offering",
    ...extras,
  });

// ---------------------------------------------------------------------------
// Room pool
// ---------------------------------------------------------------------------
export const useTermRooms = (termId: string) =>
  useQuery({ queryKey: plannerKeys.termRooms(termId), queryFn: () => plannerApi.listTermRooms(termId), enabled: !!termId, retry: retryUnless404 });

export const useAddTermRooms = (termId: string, extras?: MutationExtras<unknown, AddTermRoomsInput>) =>
  usePlannerMutation((input: AddTermRoomsInput) => plannerApi.addTermRooms(termId, input), () => termDataScope(termId), {
    errorTitle: "Could not add rooms",
    ...extras,
  });

export const useUpdateTermRoom = (termId: string, extras?: MutationExtras<unknown, { id: string; is_lab: boolean }>) =>
  usePlannerMutation(
    ({ id, is_lab }: { id: string; is_lab: boolean }) => plannerApi.updateTermRoom(termId, id, { is_lab }),
    () => termDataScope(termId),
    { errorTitle: "Could not update room", ...extras },
  );

export const useRemoveTermRoom = (termId: string, extras?: MutationExtras<void, string>) =>
  usePlannerMutation((id: string) => plannerApi.removeTermRoom(termId, id), () => termDataScope(termId), {
    errorTitle: "Could not remove room",
    ...extras,
  });

// ---------------------------------------------------------------------------
// Import. A dry run changes nothing, so it invalidates nothing. Set `silent` and read
// the thrown ApiError yourself (code IMPORT_HAS_ERRORS on a real run with bad rows).
// ---------------------------------------------------------------------------
export interface ImportVars {
  entity: ImportEntity;
  rows: Record<string, unknown>[];
  dryRun: boolean;
}

export const useImportRows = (termId: string, extras?: MutationExtras<unknown, ImportVars>) =>
  usePlannerMutation(
    ({ entity, rows, dryRun }: ImportVars) => plannerApi.importRows(termId, entity, rows, dryRun),
    (_data, vars) => (vars.dryRun ? [] : termScope(termId)),
    { errorTitle: "Import failed", ...extras },
  );

// ---------------------------------------------------------------------------
// Sessions and readiness
// ---------------------------------------------------------------------------
export const useSessionsSummary = (versionId: string | null | undefined) =>
  useQuery({
    queryKey: plannerKeys.sessionsSummary(versionId ?? ""),
    queryFn: () => plannerApi.sessionsSummary(versionId!),
    enabled: !!versionId,
    retry: retryUnless404,
  });

export const useSessions = (versionId: string | null | undefined, divisionId?: string) =>
  useQuery({
    queryKey: plannerKeys.sessions(versionId ?? "", divisionId),
    queryFn: () => plannerApi.listSessions(versionId!, divisionId),
    enabled: !!versionId,
  });

export const useSyncSessions = (extras?: MutationExtras<unknown, string>) =>
  usePlannerMutation((versionId: string) => plannerApi.syncSessions(versionId), (_d, versionId) => [plannerKeys.version(versionId), plannerKeys.terms()], {
    errorTitle: "Could not generate sessions",
    ...extras,
  });

export const useReadiness = (termId: string) =>
  useQuery({ queryKey: plannerKeys.readiness(termId), queryFn: () => plannerApi.readiness(termId), enabled: !!termId, retry: retryUnless404 });

// ---------------------------------------------------------------------------
// Editor (Phase 2). One snapshot query, one dedicated ops mutation.
// ---------------------------------------------------------------------------

/**
 * The editor snapshot. It is kept current by useEditorSocket patches and by useApplyOps, so it is never
 * considered stale by time (no focus/reconnect refetch that would overwrite optimistic state); it refetches
 * on mount, on a rev gap and on socket reconnect.
 *
 * A response can arrive after socket patches / ops responses already moved the cache forward. The queryFn compares
 * the response's rev with the cache's rev at response time (chooseSnapshot): an OLDER response is discarded (the
 * cached data is returned, so the cache never goes back in time) and one more refetch is scheduled.
 */
export const useSnapshot = (versionId: string | null | undefined) => {
  const qc = useQueryClient();
  return useQuery({
    queryKey: plannerKeys.snapshot(versionId ?? ""),
    queryFn: async () => {
      const key = plannerKeys.snapshot(versionId!);
      const fresh = await plannerApi.snapshot(versionId!);
      const { data, stale } = chooseSnapshot(qc.getQueryData<Snapshot>(key), fresh);
      if (stale) {
        // Not inside this fetch: invalidating a query that is still fetching would cancel it.
        setTimeout(() => void qc.invalidateQueries({ queryKey: key }), 0);
      }
      return data;
    },
    enabled: !!versionId,
    retry: retryUnless404,
    staleTime: Infinity,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
};

export interface ApplyOpsVars {
  ops: PlannerOp[];
}

/** The last rejected edit, for an inline alert and the session panel. */
export interface OpsRejection {
  message: string;
  code: string | null;
  /** The session the failing op was about (from details.op_index), when known. */
  session_id: string | null;
  at: number;
}

interface ApplyOpsContext {
  /** The touched sessions as they were before the optimistic patch. Rollback restores only these. */
  previous: PlannerSession[];
  /** The cache's rev when this edit was applied; a different rev at error time means a patch landed meanwhile. */
  revAtMutate: number | null;
  /** Other edits were already in flight when this one started. */
  overlapped: boolean;
}

const errorCode = (err: unknown): string | null => {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : null;
};

const opIndexOf = (err: unknown): number | null => {
  const details = (err as { details?: unknown } | null)?.details;
  const idx = details && typeof details === "object" ? (details as { op_index?: unknown }).op_index : undefined;
  return typeof idx === "number" ? idx : null;
};

/**
 * Apply editor ops: optimistic patch of snapshot.sessions, one HTTP request (POST .../ops), then
 *  - success: merge the server's changed sessions and set `rev` (judged by decideEvent, the same rule as socket
 *    events); a rev gap reloads the snapshot; the sessions-summary and readiness queries are marked stale;
 *  - error: restore the touched sessions, toast the server's sentence and keep it as `lastRejection`.
 * Requests are serialized per version (promise chain) so revisions apply in order even when the user drops
 * several cards quickly; each call still gets its own optimistic patch immediately.
 */
export function useApplyOps(versionId: string, clientId: string) {
  const qc = useQueryClient();
  const key = plannerKeys.snapshot(versionId);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const inflight = useRef(0);
  const needsReload = useRef(false);
  const [pending, setPending] = useState(0);
  const [lastRejection, setLastRejection] = useState<OpsRejection | null>(null);

  const mutation = useMutation<OpsResponse, unknown, ApplyOpsVars, ApplyOpsContext>({
    mutationFn: ({ ops }) => {
      const run = chain.current.then(() => plannerApi.applyOps(versionId, { client_id: clientId, ops }));
      chain.current = run.catch(() => undefined);
      return run;
    },

    onMutate: async ({ ops }) => {
      // Count first (synchronously): a second edit that starts while we await below must see us in flight.
      const overlapped = inflight.current > 0;
      inflight.current += 1;
      setPending(inflight.current);
      setLastRejection(null);
      // A snapshot fetch landing after our optimistic patch would wipe it out.
      await qc.cancelQueries({ queryKey: key });
      const before = qc.getQueryData<Snapshot>(key);
      const ids = new Set(touchedSessionIds(ops));
      const previous = before ? before.sessions.filter((s) => ids.has(s.id)) : [];
      if (before) {
        qc.setQueryData<Snapshot>(key, (s) =>
          s ? { ...s, sessions: applyOpsToSessions(s.sessions, ops, s.faculty) } : s,
        );
      }
      return { previous, revAtMutate: before?.rev ?? null, overlapped };
    },

    onSuccess: (data) => {
      const snap = qc.getQueryData<Snapshot>(key);
      if (snap) {
        const decision = decideEvent(
          snap.rev,
          { rev: data.rev, prev_rev: data.prev_rev, refetch: false, client_id: null },
          clientId,
        );
        if (decision === "patch") {
          qc.setQueryData<Snapshot>(key, (s) =>
            s ? { ...s, rev: data.rev, sessions: applyChanged(s.sessions, data.sessions, { append: true }) } : s,
          );
        } else if (decision === "refetch") {
          // Someone else's revision slipped in before ours and we have not seen it: show ours, then reload the truth.
          qc.setQueryData<Snapshot>(key, (s) =>
            s ? { ...s, sessions: applyChanged(s.sessions, data.sessions, { append: true }) } : s,
          );
          void qc.invalidateQueries({ queryKey: key });
        }
        // 'ignore': nothing changed on the server, or the cache is already newer than this response.
      }
      if (data.rev !== data.prev_rev) {
        void qc.invalidateQueries({ queryKey: plannerKeys.sessionsSummary(versionId) });
        refreshDiagnosticsSoon(qc, versionId);
        const termId = snap?.version.term_id;
        if (termId) void qc.invalidateQueries({ queryKey: plannerKeys.readiness(termId) });
      }
    },

    onError: (err, { ops }, ctx) => {
      // Roll back only the sessions this request touched, so other in-flight optimistic edits survive.
      if (ctx?.previous.length) {
        qc.setQueryData<Snapshot>(key, (s) => (s ? { ...s, sessions: applyChanged(s.sessions, ctx.previous) } : s));
      }
      const code = errorCode(err);
      const idx = opIndexOf(err);
      const session_id = (idx != null ? ops[idx]?.session_id : ops.length === 1 ? ops[0].session_id : null) ?? null;
      const message = opsErrorMessage(err, describeApiError(err));
      setLastRejection({ message, code, session_id, at: Date.now() });
      toast({ title: "That change was not applied", description: message, variant: "destructive" });
      // The rollback is only trustworthy when nothing else moved meanwhile: reload once everything settles if other
      // edits overlapped (this one started while another was in flight, or another started while it was), a socket
      // patch / response changed the rev since onMutate, or the code says our picture is wrong.
      const revNow = qc.getQueryData<Snapshot>(key)?.rev ?? null;
      if (
        shouldReloadAfterRollback({
          overlapped: !!ctx?.overlapped || inflight.current > 1,
          revAtMutate: ctx ? ctx.revAtMutate : revNow,
          revNow,
          code,
        })
      ) {
        needsReload.current = true;
      }
    },

    onSettled: () => {
      inflight.current = Math.max(0, inflight.current - 1);
      setPending(inflight.current);
      if (inflight.current === 0) {
        // cancelQueries in onMutate can kill a gap refetch the socket had just started; the query is then
        // invalidated but idle, and (staleTime Infinity) nothing else would ever load it. Reload it now.
        const st = qc.getQueryState(key);
        const abandoned = !!st?.isInvalidated && st.fetchStatus === "idle";
        if (needsReload.current || abandoned) {
          needsReload.current = false;
          void qc.invalidateQueries({ queryKey: key });
        }
      }
    },
  });

  const { mutate } = mutation;
  const apply = useCallback((ops: PlannerOp[]) => mutate({ ops }), [mutate]);
  const reject = useCallback(
    (message: string, session_id: string | null = null) =>
      setLastRejection({ message, code: "PLACEMENT_INVALID", session_id, at: Date.now() }),
    [],
  );
  const dismissRejection = useCallback(() => setLastRejection(null), []);

  return { apply, pending, lastRejection, reject, dismissRejection };
}

// ---------------------------------------------------------------------------
// Rules (Phase 3, contract 9.7). Changing a rule changes diagnostics and the scores of candidates/suggestions in every
// version of the term, so those version-scoped keys are invalidated by a predicate (their key has the version id in it).
// ---------------------------------------------------------------------------
export const useRules = (termId: string | null | undefined) =>
  useQuery({
    queryKey: plannerKeys.rules(termId ?? ""),
    queryFn: () => plannerApi.rules(termId!),
    enabled: !!termId,
    retry: retryUnless404,
  });

/** All-or-nothing; a bad patch is a 400 VALIDATION_ERROR with fieldErrors keyed `rules.<i>.<field>` (pass silent to render them inline). */
export const usePatchRules = (termId: string, extras?: MutationExtras<unknown, RulesPatchBody>) => {
  const qc = useQueryClient();
  return usePlannerMutation(
    (body: RulesPatchBody) => plannerApi.patchRules(termId, body),
    () => {
      void invalidateRuleDependents(qc);
      return [plannerKeys.rules(termId)];
    },
    { errorTitle: "Could not save rules", ...extras },
  );
};

export const useResetRules = (termId: string, extras?: MutationExtras<unknown, void>) => {
  const qc = useQueryClient();
  return usePlannerMutation(
    () => plannerApi.resetRules(termId),
    () => {
      void invalidateRuleDependents(qc);
      return [plannerKeys.rules(termId)];
    },
    { errorTitle: "Could not reset rules", ...extras },
  );
};

// ---------------------------------------------------------------------------
// Diagnostics, candidates, suggestions (Phase 3, contract 9.3 and 9.4). All read-only.
// ---------------------------------------------------------------------------
export interface EnabledOption {
  enabled?: boolean;
}

const DIAGNOSTICS_REFRESH_MS = 300;
const diagnosticsScheduler = createTrailingScheduler(DIAGNOSTICS_REFRESH_MS);

/**
 * Mark the version's diagnostics stale, but coalesce a burst (several edits, socket patches, the board's behind-check) into ONE
 * refetch 300 ms after the last call, so the issues are fresh after the last edit without a request per edit.
 */
export function refreshDiagnosticsSoon(qc: QueryClient, versionId: string): void {
  diagnosticsScheduler.schedule(versionId, () => void qc.invalidateQueries({ queryKey: plannerKeys.diagnostics(versionId) }));
}

/**
 * Issues of the version. Cheap to recompute server-side, so the staleTime is short; the previous result stays on screen
 * while a new one loads (no flicker after an edit). useApplyOps, the socket patch path and the rules mutations invalidate it.
 */
export const useDiagnostics = (versionId: string | null | undefined, options: EnabledOption = {}) =>
  useQuery({
    queryKey: plannerKeys.diagnostics(versionId ?? ""),
    queryFn: async () => {
      const { success: _success, ...body } = await plannerApi.diagnostics(versionId!);
      return body;
    },
    enabled: !!versionId && (options.enabled ?? true),
    retry: retryUnless404,
    staleTime: 5_000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });

export interface SlotQueryOptions extends EnabledOption {
  versionId: string | null | undefined;
  /** The snapshot's rev: part of the key, so the query refreshes after every edit. */
  rev: number | null | undefined;
}

/** Keeps the previous answer only while it is for the same session (a different session's slots would be wrong). */
const keepSameSession = <T,>(prev: T | undefined, prevQuery: { queryKey: QueryKey } | undefined, sessionId: string | null | undefined) =>
  prevQuery && prevQuery.queryKey[4] === sessionId ? prev : undefined;

/** Every slot where the session can go (passes the hard checks). Absent slot = blocked. Pair with lib/candidates.ts. */
export const useCandidates = (sessionId: string | null | undefined, options: SlotQueryOptions) =>
  useQuery({
    queryKey: plannerKeys.candidates(options.versionId ?? "", sessionId ?? "", options.rev ?? null),
    queryFn: async ({ signal }) => {
      const { success: _success, ...body } = await plannerApi.candidates(sessionId!, signal);
      return body;
    },
    enabled: !!sessionId && !!options.versionId && (options.enabled ?? true),
    retry: retryUnless404,
    staleTime: 30_000,
    gcTime: 60_000,
    placeholderData: (prev, prevQuery) => keepSameSession(prev, prevQuery, sessionId),
    refetchOnWindowFocus: false,
  });

/** The best `limit` (default 5) slots with a reason and ready-to-send ops; `none_reason` explains an empty list. */
export const useSuggestions = (sessionId: string | null | undefined, options: SlotQueryOptions & { limit?: number }) =>
  useQuery({
    queryKey: plannerKeys.suggestions(options.versionId ?? "", sessionId ?? "", options.rev ?? null, options.limit),
    queryFn: async ({ signal }) => {
      const { success: _success, ...body } = await plannerApi.suggestions(sessionId!, options.limit, signal);
      return body;
    },
    enabled: !!sessionId && !!options.versionId && (options.enabled ?? true),
    retry: retryUnless404,
    staleTime: 30_000,
    gcTime: 60_000,
    placeholderData: (prev, prevQuery) => keepSameSession(prev, prevQuery, sessionId),
    refetchOnWindowFocus: false,
  });

// ---------------------------------------------------------------------------
// Generation (Phase 3, contract 9.6). A run is a background job: start it, then poll the runs list.
// ---------------------------------------------------------------------------

/** What a run that wrote (or may have written) placements can make stale. Uses the run's own ids, so no snapshot is needed. */
const runScope = (run: GenerationRun): QueryKey[] => [
  plannerKeys.generation(run.version_id),
  plannerKeys.snapshot(run.version_id),
  plannerKeys.sessionsSummary(run.version_id),
  plannerKeys.diagnostics(run.version_id),
  plannerKeys.readiness(run.term_id),
  plannerKeys.terms(), // placed counts on the term list
];

/**
 * The version's runs (newest first, max 10) and the active one. Polls every second while any run is queued or
 * running, and stops when none is. When a run stops being active the snapshot, diagnostics, summary and readiness are
 * refreshed once (the commit wrote placements). Pass `enabled: false` to pause it.
 */
export const useGenerationRuns = (
  versionId: string | null | undefined,
  options: EnabledOption & {
    /** Default true. False for a read-only observer (e.g. the editor's "generation active" flag) so only one hook refreshes. */
    refreshOnFinish?: boolean;
  } = {},
) => {
  const qc = useQueryClient();
  // When the active run last changed (status/stage/percent): after a minute of nothing the poll slows to 5 s.
  const lastChange = useRef<{ sig: string | null; at: number }>({ sig: null, at: Date.now() });
  const query = useQuery({
    queryKey: plannerKeys.generation(versionId ?? ""),
    queryFn: async () => {
      const { success: _success, ...body } = await plannerApi.generation(versionId!);
      return body;
    },
    enabled: !!versionId && (options.enabled ?? true),
    retry: retryUnless404,
    refetchInterval: (q) => {
      const d = q.state.data;
      const current = d?.active ?? d?.runs.find(isRunActive) ?? null;
      if (!current) {
        lastChange.current = { sig: null, at: Date.now() };
        return false;
      }
      const sig = progressSignature(current);
      if (lastChange.current.sig !== sig) lastChange.current = { sig, at: Date.now() };
      return pollDelay(lastChange.current.at, Date.now());
    },
  });

  const data = query.data;
  const active = !!data && (!!data.active || data.runs.some(isRunActive));
  const wasActive = useRef(false);
  useEffect(() => {
    if (wasActive.current && !active && data && (options.refreshOnFinish ?? true)) {
      const run = data.runs[0];
      if (run) for (const queryKey of runScope(run).slice(1)) void qc.invalidateQueries({ queryKey });
    }
    wasActive.current = active;
  }, [active, data, qc, options.refreshOnFinish]);

  return query;
};

/** Starts a run (202). Errors: GENERATION_RUNNING, NOT_READY, CONFIRM_REQUIRED (regenerate_unlocked without confirm). */
export const useGenerate = (versionId: string, extras?: MutationExtras<GenerationRun, GenerateRequest | void>) =>
  usePlannerMutation(
    (body: GenerateRequest | void) => plannerApi.generate(versionId, (body ?? {}) as GenerateRequest),
    (run) => runScope(run),
    // The heavy refetches (snapshot, diagnostics, readiness) run in the background: the run id is known as soon as the POST answers.
    { errorTitle: "Could not start generation", awaitInvalidation: false, ...extras },
  );

/** Cancel a queued/running run. Chunks already committed stay (and are undoable). */
export const useCancelRun = (extras?: MutationExtras<GenerationRun, string>) =>
  usePlannerMutation((runId: string) => plannerApi.cancelRun(runId), (run) => runScope(run), {
    errorTitle: "Could not cancel the run",
    ...extras,
  });

/** Undo the latest succeeded run of a draft. Errors: NOT_UNDOABLE, RUN_NOT_FOUND. */
export const useUndoRun = (extras?: MutationExtras<Awaited<ReturnType<typeof plannerApi.undoRun>>, string>) =>
  usePlannerMutation((runId: string) => plannerApi.undoRun(runId), (res) => runScope(res.run), {
    errorTitle: "Could not undo the run",
    ...extras,
  });
