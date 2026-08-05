import { describe, expect, it, vi } from "vitest";
import { resolveRuntimeMode, runModeCheck } from "../src/mode.js";
import type { CheckResult } from "../src/types.js";

const realResult: CheckResult = { status: "NOT_AVAILABLE", reason: "real" };
const simulatedResult: CheckResult = { status: "AVAILABLE", reason: "simulated" };

describe("runtime mode isolation", () => {
  it("simulation mode never calls the real checker", async () => {
    const real = vi.fn().mockResolvedValue(realResult);
    const simulated = vi.fn().mockResolvedValue(simulatedResult);
    const mode = resolveRuntimeMode({
      appointmentMode: "simulate-timeline",
      simulationSequence: ["NOT_AVAILABLE", "AVAILABLE"]
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
      simulateStatus: "AVAILABLE",
      simulationSequence: ["AVAILABLE"]
    });

    await expect(runModeCheck(mode, undefined, { real, simulated })).resolves.toBe(realResult);
    expect(real).toHaveBeenCalledTimes(1);
    expect(simulated).not.toHaveBeenCalled();
  });

  it("requires a fixed status in simulate-fixed mode", () => {
    expect(() => resolveRuntimeMode({
      appointmentMode: "simulate-fixed",
      simulationSequence: []
    })).toThrow(/requires SIMULATE_STATUS/);
  });

  it("requires a sequence in simulate-timeline mode", () => {
    expect(() => resolveRuntimeMode({
      appointmentMode: "simulate-timeline",
      simulationSequence: []
    })).toThrow(/requires SIMULATION_SEQUENCE/);
  });

  it("requires an authoritative mode", () => {
    expect(() => resolveRuntimeMode({ simulationSequence: [] })).toThrow(/APPOINTMENT_MODE is required/);
  });
});
