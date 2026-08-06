import { describe, expect, it, vi } from "vitest";
import { closeBrowserCleanly, resolveKeepBrowserOpenMs } from "../src/browserLifecycle.js";

const base = {
  action: "check",
  mode: "simulate-fixed" as const,
  headless: false,
  debugSlowMode: false,
  debugKeepBrowserOpenMs: 15_000,
  simulationKeepBrowserOpenMs: 30_000
};

describe("fixed simulation browser lifecycle", () => {
  it("uses zero delay in headless mode", () => {
    expect(resolveKeepBrowserOpenMs({ ...base, headless: true })).toBe(0);
  });

  it("uses the configured delay for a headed fixed check", () => {
    expect(resolveKeepBrowserOpenMs(base)).toBe(30_000);
  });

  it("keeps an explicitly configured zero duration", () => {
    expect(resolveKeepBrowserOpenMs({ ...base, simulationKeepBrowserOpenMs: 0 })).toBe(0);
  });

  it("does not repeat fixed mode", () => {
    expect(resolveKeepBrowserOpenMs({ ...base, action: "monitor" })).toBe(0);
  });

  it("closes only after the delay completes", async () => {
    let finishDelay: (() => void) | undefined;
    const sleep = vi.fn(() => new Promise<void>(resolve => { finishDelay = resolve; }));
    const close = vi.fn().mockResolvedValue(undefined);
    const cleanup = closeBrowserCleanly({ close }, { keepOpenMs: 30_000 }, { sleep });

    await vi.waitFor(() => expect(sleep).toHaveBeenCalledWith(30_000));
    expect(close).not.toHaveBeenCalled();
    finishDelay?.();
    await cleanup;
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("closes immediately when the duration is zero", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    await closeBrowserCleanly({ close }, { keepOpenMs: 0 }, { sleep });
    expect(sleep).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("closes before propagating an interruption", async () => {
    const events: string[] = [];
    let interrupt: ((signal: "SIGINT" | "SIGTERM") => void) | undefined;
    const cleanup = closeBrowserCleanly(
      { close: vi.fn(async () => { events.push("close"); }) },
      { keepOpenMs: 30_000 },
      {
        sleep: () => new Promise(() => undefined),
        onInterrupt: handler => { interrupt = handler; return () => events.push("remove-listeners"); },
        terminateAfterCleanup: signal => events.push(`terminate-${signal}`)
      }
    );
    interrupt?.("SIGINT");
    await cleanup;
    expect(events).toEqual(["remove-listeners", "close", "terminate-SIGINT"]);
  });

  it("still closes when the delay fails", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    await expect(closeBrowserCleanly(
      { close },
      { keepOpenMs: 10 },
      { sleep: vi.fn().mockRejectedValue(new Error("delay interrupted")) }
    )).rejects.toThrow("delay interrupted");
    expect(close).toHaveBeenCalledTimes(1);
  });
});
