// Revision bookkeeping for live sync (contract section 8.3). Pure, no React.
//
// decideEvent(localRev, evt, ownClientId) -> 'patch' | 'ignore' | 'refetch'
//   evt.refetch is true                      -> 'refetch'   (the server says "reload", e.g. after sync-sessions)
//   evt.client_id === ownClientId (not null) -> 'ignore'    (our own echo: the HTTP response already carried the change)
//   evt.rev <= localRev                      -> 'ignore'    (stale or already applied)
//   evt.prev_rev === localRev                -> 'patch'     (the very next revision: merge the sessions, set rev)
//   anything else                            -> 'refetch'   (a gap: we missed at least one revision)
// The same function judges an HTTP ops response (pass refetch:false, client_id:null): 'patch' = merge it,
// 'ignore' = the cache is already newer (or nothing changed), 'refetch' = we are behind, reload.

export interface RevEvent {
  rev: number;
  prev_rev: number;
  refetch: boolean;
  client_id: string | null;
}

export type RevDecision = "patch" | "ignore" | "refetch";

export function decideEvent(localRev: number, evt: RevEvent, ownClientId: string | null | undefined): RevDecision {
  if (evt.refetch) return "refetch";
  if (ownClientId && evt.client_id && evt.client_id === ownClientId) return "ignore";
  if (evt.rev <= localRev) return "ignore";
  if (evt.prev_rev === localRev) return "patch";
  return "refetch";
}

// ---------------------------------------------------------------------------------------------------------------
// chooseSnapshot(cached, fresh): never let a slow, older snapshot response replace a newer cache.
//   A snapshot request can be answered after socket patches / ops responses have already moved the cache forward
//   (or after a newer snapshot). If fresh.rev < cached.rev the response is OLDER: keep the cached data and report
//   `stale: true` so the caller schedules one more refetch. Equal or newer responses win (same rev = same data).
// ---------------------------------------------------------------------------------------------------------------
export function chooseSnapshot<T extends { rev: number }>(
  cached: T | undefined | null,
  fresh: T,
): { data: T; stale: boolean } {
  if (cached && typeof cached.rev === "number" && fresh.rev < cached.rev) return { data: cached, stale: true };
  return { data: fresh, stale: false };
}

// ---------------------------------------------------------------------------------------------------------------
// shouldReloadAfterRollback: after a failed ops request we restored only the sessions it touched. That is only
// trustworthy when nothing else moved meanwhile, so reload the snapshot once everything settles when
//   - other ops were in flight (overlapped): their optimistic state / "before" picture interleave with ours;
//   - the cached rev changed since onMutate (a socket patch or another response landed): the "before" picture of
//     the touched sessions may be older than what the server now holds;
//   - the error code says our picture of the version is wrong (not a draft any more, session gone, lock state stale).
// CLASH and PLACEMENT_INVALID alone are routine rejections: the rollback is right and no GET is needed.
// ---------------------------------------------------------------------------------------------------------------
export const RELOAD_AFTER_CODES: ReadonlySet<string> = new Set(["NOT_DRAFT", "NOT_FOUND", "SESSION_LOCKED"]);

export function shouldReloadAfterRollback(args: {
  overlapped: boolean;
  revAtMutate: number | null | undefined;
  revNow: number | null | undefined;
  code: string | null | undefined;
}): boolean {
  if (args.overlapped) return true;
  if ((args.revAtMutate ?? null) !== (args.revNow ?? null)) return true;
  return !!args.code && RELOAD_AFTER_CODES.has(args.code);
}
