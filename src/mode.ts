import type { CheckResult } from "./types.js";
import type { SimulatedStatus } from "./simulation/TimelineSimulator.js";
import type { CommandRuntimeOptions } from "./runtimeOptions.js";

export type RuntimeMode =
  | { kind: "real" }
  | {
      kind: "simulation";
      type: "timeline" | "fixed";
      sequence: readonly SimulatedStatus[];
    };

export interface ModeConfiguration {
  appointmentMode?: string;
  simulateStatus?: SimulatedStatus;
  simulationSequence: readonly SimulatedStatus[];
}

export interface ModeCheckHandlers {
  real(): Promise<CheckResult>;
  simulated(status: SimulatedStatus): Promise<CheckResult>;
}

export interface ModeBannerConfiguration {
  checkIntervalMinutes: number;
  simulationIntervalSeconds: number;
  simulationRepeat: boolean;
  simulationPauseBeforeClose: boolean;
  simulationKeepBrowserOpenMs: number;
}

export function resolveRuntimeMode(configuration: ModeConfiguration): RuntimeMode {
  const requested = configuration.appointmentMode?.trim().toLowerCase();
  if (!requested) {
    throw new Error("APPOINTMENT_MODE is required: real, simulate-fixed, or simulate-timeline");
  }
  if (requested === "real") {
    return { kind: "real" };
  }
  if (requested === "simulate-fixed") {
    if (!configuration.simulateStatus) {
      throw new Error("APPOINTMENT_MODE=simulate-fixed requires SIMULATE_STATUS=AVAILABLE or NOT_AVAILABLE");
    }
    return { kind: "simulation", type: "fixed", sequence: [configuration.simulateStatus] };
  }
  if (requested === "simulate-timeline") {
    if (configuration.simulationSequence.length === 0) {
      throw new Error("APPOINTMENT_MODE=simulate-timeline requires SIMULATION_SEQUENCE");
    }
    return { kind: "simulation", type: "timeline", sequence: configuration.simulationSequence };
  }
  throw new Error("APPOINTMENT_MODE must be real, simulate-fixed, or simulate-timeline");
}

export async function runModeCheck(
  mode: RuntimeMode,
  simulatedStatus: SimulatedStatus | undefined,
  handlers: ModeCheckHandlers
): Promise<CheckResult> {
  if (mode.kind === "real") return handlers.real();
  if (!simulatedStatus) throw new Error("Simulation mode did not provide a status");
  return handlers.simulated(simulatedStatus);
}

export function printModeBanner(
  mode: RuntimeMode,
  targetUrl: string,
  configuration: ModeBannerConfiguration,
  runtime: CommandRuntimeOptions
): void {
  console.log("========================================");
  if (mode.kind === "real") {
    console.log("MODE: REAL WEBSITE");
    console.log(`Run type: ${runtime.runType}`);
    if (runtime.runType === "monitor") {
      console.log(`Check interval: ${configuration.checkIntervalMinutes} minute(s)`);
    } else {
      console.log(`Browser: ${runtime.browser}`);
      if (runtime.debugMode !== "off") console.log(`Debug mode: ${runtime.debugMode}`);
      if (runtime.debugMode === "slow") console.log(`Keep browser open: ${runtime.keepBrowserOpenMs} ms`);
      console.log(`Debug screenshots: ${runtime.debugScreenshots ? "enabled" : "disabled"}`);
    }
  } else {
    console.log("MODE: SIMULATION");
    console.log(`Type: ${mode.type}`);
    console.log(`Run type: ${runtime.runType}`);
    console.log(`Sequence: ${mode.sequence.join(" -> ")}`);
    if (runtime.browser === "visible") console.log("Browser: visible");
    if (mode.type === "timeline") {
      console.log(`Simulation interval: ${configuration.simulationIntervalSeconds} second(s)`);
      console.log(`Repeat: ${configuration.simulationRepeat}`);
      console.log(`Pause before close: ${configuration.simulationPauseBeforeClose}`);
      console.log(`Keep browser open: ${runtime.keepBrowserOpenMs} ms`);
    } else {
      console.log(`Keep browser open: ${runtime.keepBrowserOpenMs} ms`);
    }
  }
  console.log("========================================");
}
