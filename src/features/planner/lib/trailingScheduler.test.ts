import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTrailingScheduler } from "./trailingScheduler";

describe("createTrailingScheduler", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("runs only the last call of a burst, after the quiet period", () => {
    const s = createTrailingScheduler(300);
    const first = vi.fn();
    const last = vi.fn();
    s.schedule("v1", first);
    vi.advanceTimersByTime(200);
    s.schedule("v1", last); // restarts the timer
    vi.advanceTimersByTime(200);
    expect(last).not.toHaveBeenCalled();
    expect(s.pending("v1")).toBe(true);
    vi.advanceTimersByTime(100);
    expect(first).not.toHaveBeenCalled();
    expect(last).toHaveBeenCalledTimes(1);
    expect(s.pending("v1")).toBe(false);
  });

  it("keeps keys independent and can cancel", () => {
    const s = createTrailingScheduler(300);
    const a = vi.fn();
    const b = vi.fn();
    s.schedule("a", a);
    s.schedule("b", b);
    s.cancel("a");
    vi.advanceTimersByTime(300);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("can be scheduled again after it ran", () => {
    const s = createTrailingScheduler(100);
    const fn = vi.fn();
    s.schedule("k", fn);
    vi.advanceTimersByTime(100);
    s.schedule("k", fn);
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
