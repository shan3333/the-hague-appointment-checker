import { describe, expect, it, vi } from "vitest";
import { printModeBanner, resolveRuntimeMode, runModeCheck } from "../src/mode.js";
import type { CheckResult } from "../src/types.js";

const realResult: CheckResult = { status: "NOT_AVAILABLE", reason: "real" };
const simulatedResult: CheckResult = { status: "AVAILABLE", reason: "simulated" };

describe("runtime mode isolation", () => {
  it("simulation mode never calls the real checker", async () => {
    const real = vi.fn().mockResolvedValue(realResult);
    const simulated = vi.fn().mockResolvedValue(simulatedResult);
    const mode = resolveRuntimeMode({
      appointmentMode: "simulate-timeline"
    });

    await expect(runModeCheck(mode, "AVAILABLE", { real, simulated })).resolves.toBe(simulatedResult);
    expect(real).not.toHaveBeenCalled();
    expect(simulated).toHaveBeenCalledWith("AVAILABLE");
  });

  it("real mode ignores simulation settings and never uses a simulated status", async () => {
    const real = vi.fn().mockResolvedValue(realResult);
    const simulated = vi.fn().mockResolvedValue(simulatedResult);
    const mode = resolveRuntimeMode({
      appointmentMode: "real",
      simulateStatus: "AVAILABLE"
    });

    await expect(runModeCheck(mode, undefined, { real, simulated })).resolves.toBe(realResult);
    expect(real).toHaveBeenCalledTimes(1);
    expect(simulated).not.toHaveBeenCalled();
  });

  it("requires a fixed status in simulate-fixed mode", () => {
    expect(() => resolveRuntimeMode({
      appointmentMode: "simulate-fixed"
    })).toThrow(/requires SIMULATE_STATUS/);
  });

  it("uses scenario-backed timeline mode without an env sequence", () => {
    expect(resolveRuntimeMode({ appointmentMode: "simulate-timeline" })).toEqual({
      kind: "simulation", type: "timeline"
    });
  });

  it("requires an authoritative mode", () => {
    expect(() => resolveRuntimeMode({})).toThrow(/APPOINTMENT_MODE is required/);
  });

  it("fixed simulation runs exactly once per invocation", async () => {
    const real = vi.fn().mockResolvedValue(realResult);
    const simulated = vi.fn().mockResolvedValue(simulatedResult);
    const mode = resolveRuntimeMode({
      appointmentMode: "simulate-fixed",
      simulateStatus: "AVAILABLE"
    });
    expect(mode.kind).toBe("simulation");
    await runModeCheck(mode, "AVAILABLE", { real, simulated });
    expect(simulated).toHaveBeenCalledTimes(1);
    expect(simulated).toHaveBeenCalledWith("AVAILABLE");
  });

  it("omits the check interval for one-time debug banners", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    printModeBanner({ kind: "real" }, "https://example.test", {
      checkIntervalMinutes: 5,
      simulationIntervalSeconds: 5,
      simulationRepeat: true,
      simulationPauseBeforeClose: false,
      simulationKeepBrowserOpenMs: 30_000
    }, {
      runType: "one-time check",
      browser: "visible",
      debugMode: "slow",
      debugScreenshots: true,
      keepBrowserOpenMs: 15_000
    });
    const output = log.mock.calls.flat().join("\n");
    expect(output).toContain("Debug mode: slow");
    expect(output).toContain("Keep browser open: 15000 ms");
    expect(output).not.toContain("Check interval");
    log.mockRestore();
  });

  it("shows the check interval only for real monitors", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    printModeBanner({ kind: "real" }, "https://example.test", {
      checkIntervalMinutes: 5,
      simulationIntervalSeconds: 5,
      simulationRepeat: true,
      simulationPauseBeforeClose: false,
      simulationKeepBrowserOpenMs: 30_000
    }, {
      runType: "monitor",
      browser: "headless",
      debugMode: "off",
      debugScreenshots: false,
      keepBrowserOpenMs: 0
    });
    expect(log.mock.calls.flat().join("\n")).toContain("Check interval: 5 minute(s)");
    log.mockRestore();
  });
});
