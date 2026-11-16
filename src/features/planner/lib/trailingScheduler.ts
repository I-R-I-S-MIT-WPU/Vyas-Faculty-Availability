// Trailing-edge scheduler keyed by string: every call for a key restarts that key's timer, and only the last call's function
// runs, `delayMs` after the last call. Used to coalesce the diagnostics refetch after a burst of edits / socket patches (the
// issues must end up fresh after the LAST edit, but a refetch per edit is wasted work). No React.
//
// Exports:
//   createTrailingScheduler(delayMs)  -> { schedule(key, fn), cancel(key), pending(key) }

export interface TrailingScheduler {
  /** Run `fn` after `delayMs` of quiet for `key`; a later call for the same key replaces it. */
  schedule(key: string, fn: () => void): void;
  cancel(key: string): void;
  pending(key: string): boolean;
}

export function createTrailingScheduler(delayMs: number): TrailingScheduler {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  return {
    schedule(key, fn) {
      const existing = timers.get(key);
      if (existing !== undefined) clearTimeout(existing);
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          fn();
        }, delayMs),
      );
    },
    cancel(key) {
      const existing = timers.get(key);
      if (existing !== undefined) clearTimeout(existing);
      timers.delete(key);
    },
    pending: (key) => timers.has(key),
  };
}
