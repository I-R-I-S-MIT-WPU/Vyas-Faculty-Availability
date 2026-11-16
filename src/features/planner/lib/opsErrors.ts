// The sentence shown for a rejected ops request (toast, inline alert, session panel). Pure, no React.
//
//   opsErrorMessage(err, fallback)
//     CLASH with details.conflicts -> up to MAX_CLASH_SENTENCES distinct `conflicts[].text` sentences joined by a
//                                     space ("... (+2 more)" when there are more), so a faculty AND room clash
//                                     both reach the admin instead of only the first.
//     CLASH with details.reason 'ROOM_CAPACITY' -> the server's message verbatim (it already lists who is in the room).
//     CLASH without usable conflicts -> err.message.
//     any other code / not an error  -> `fallback` (the caller passes describeApiError(err)).
// `err` is read defensively (duck-typed: ApiError has message / code / details, details may even be a string).

import type { ClashDetails } from "../types";

export const MAX_CLASH_SENTENCES = 3;

const asClashDetails = (details: unknown): Partial<ClashDetails> | null =>
  details && typeof details === "object" ? (details as Partial<ClashDetails>) : null;

export function opsErrorMessage(err: unknown, fallback: string): string {
  const e = err as { message?: unknown; code?: unknown; details?: unknown } | null | undefined;
  if (e?.code !== "CLASH") return fallback;
  const message = typeof e.message === "string" && e.message.trim() ? e.message : fallback;

  const details = asClashDetails(e.details);
  if (details?.reason === "ROOM_CAPACITY") return message;

  const conflicts = Array.isArray(details?.conflicts) ? details!.conflicts! : [];
  const seen = new Set<string>();
  const sentences: string[] = [];
  for (const c of conflicts) {
    const text = typeof c?.text === "string" ? c.text.trim() : "";
    if (text && !seen.has(text)) {
      seen.add(text);
      sentences.push(text);
    }
  }
  if (sentences.length === 0) return message;
  const shown = sentences.slice(0, MAX_CLASH_SENTENCES).join(" ");
  const more = sentences.length - MAX_CLASH_SENTENCES;
  return more > 0 ? `${shown} (+${more} more)` : shown;
}
