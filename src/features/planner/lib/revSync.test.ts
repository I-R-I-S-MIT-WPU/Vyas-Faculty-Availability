import { describe, expect, it } from "vitest";
import { chooseSnapshot, decideEvent, shouldReloadAfterRollback, type RevEvent } from "./revSync";

const evt = (over: Partial<RevEvent> = {}): RevEvent => ({ rev: 6, prev_rev: 5, refetch: false, client_id: "other", ...over });

describe("decideEvent", () => {
  it("patches the very next revision", () => {
    expect(decideEvent(5, evt(), "me")).toBe("patch");
    expect(decideEvent(0, evt({ rev: 1, prev_rev: 0 }), "me")).toBe("patch");
  });

  it("ignores stale events (rev <= local)", () => {
    expect(decideEvent(6, evt(), "me")).toBe("ignore");
    expect(decideEvent(9, evt(), "me")).toBe("ignore");
  });

  it("refetches on a gap (missed at least one revision)", () => {
    expect(decideEvent(3, evt(), "me")).toBe("refetch");
    expect(decideEvent(4, evt({ rev: 9, prev_rev: 8 }), "me")).toBe("refetch");
  });

  it("refetches when the event says so, even when it looks like the next revision or is stale", () => {
    expect(decideEvent(5, evt({ refetch: true, sessions: null } as Partial<RevEvent>), "me")).toBe("refetch");
    expect(decideEvent(9, evt({ refetch: true }), "me")).toBe("refetch");
  });

  it("ignores our own echo", () => {
    expect(decideEvent(5, evt({ client_id: "me" }), "me")).toBe("ignore");
    // even when the echo would otherwise be a gap: the HTTP response handles our own change
    expect(decideEvent(2, evt({ client_id: "me" }), "me")).toBe("ignore");
  });

  it("does not treat null client ids as our own", () => {
    expect(decideEvent(5, evt({ client_id: null }), "me")).toBe("patch");
    expect(decideEvent(5, evt({ client_id: null }), null)).toBe("patch");
    expect(decideEvent(5, evt({ client_id: null }), undefined)).toBe("patch");
    expect(decideEvent(5, evt({ client_id: "x" }), "")).toBe("patch");
  });

  it("ignores no-change events (rev == prev_rev == local)", () => {
    expect(decideEvent(5, evt({ rev: 5, prev_rev: 5 }), "me")).toBe("ignore");
  });

  it("judges an HTTP ops response the same way (refetch:false, client_id:null)", () => {
    const resp = (rev: number, prev_rev: number): RevEvent => ({ rev, prev_rev, refetch: false, client_id: null });
    expect(decideEvent(5, resp(6, 5), "me")).toBe("patch"); // normal
    expect(decideEvent(5, resp(5, 5), "me")).toBe("ignore"); // nothing changed
    expect(decideEvent(4, resp(6, 5), "me")).toBe("refetch"); // someone else's change slipped in before ours
    expect(decideEvent(7, resp(6, 5), "me")).toBe("ignore"); // a refetch already brought the cache past it
  });
});

describe("chooseSnapshot", () => {
  const snap = (rev: number, tag = "x") => ({ rev, tag });

  it("takes the response when there is no cache", () => {
    const fresh = snap(3);
    expect(chooseSnapshot(undefined, fresh)).toEqual({ data: fresh, stale: false });
    expect(chooseSnapshot(null, fresh).data).toBe(fresh);
  });

  it("takes a newer response", () => {
    const fresh = snap(7);
    expect(chooseSnapshot(snap(5), fresh)).toEqual({ data: fresh, stale: false });
  });

  it("takes an equal-rev response (same data, authoritative)", () => {
    const fresh = snap(5, "fresh");
    expect(chooseSnapshot(snap(5, "cached"), fresh).data).toBe(fresh);
  });

  it("keeps the cache and flags a refetch when the response is older", () => {
    const cached = snap(9, "cached");
    const out = chooseSnapshot(cached, snap(4, "old"));
    expect(out.data).toBe(cached);
    expect(out.stale).toBe(true);
  });
});

describe("shouldReloadAfterRollback", () => {
  const base = { overlapped: false, revAtMutate: 5, revNow: 5, code: "CLASH" as string | null };

  it("does not reload for a routine rejection with nothing else going on", () => {
    expect(shouldReloadAfterRollback(base)).toBe(false);
    expect(shouldReloadAfterRollback({ ...base, code: "PLACEMENT_INVALID" })).toBe(false);
    expect(shouldReloadAfterRollback({ ...base, code: null })).toBe(false);
  });

  it("reloads when other ops overlapped", () => {
    expect(shouldReloadAfterRollback({ ...base, overlapped: true })).toBe(true);
  });

  it("reloads when the cache rev changed since onMutate (a socket patch landed)", () => {
    expect(shouldReloadAfterRollback({ ...base, revNow: 6 })).toBe(true);
    expect(shouldReloadAfterRollback({ ...base, revNow: null })).toBe(true);
    expect(shouldReloadAfterRollback({ ...base, revAtMutate: null, revNow: 5 })).toBe(true);
  });

  it("treats an unknown rev on both sides as unchanged", () => {
    expect(shouldReloadAfterRollback({ ...base, revAtMutate: null, revNow: undefined })).toBe(false);
  });

  it("reloads after codes that mean our picture is wrong", () => {
    for (const code of ["NOT_DRAFT", "NOT_FOUND", "SESSION_LOCKED"]) {
      expect(shouldReloadAfterRollback({ ...base, code })).toBe(true);
    }
  });
});
