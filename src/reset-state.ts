import { pathToFileURL } from "node:url";
import { config } from "./config.js";
import { FileTimelineStateStore } from "./simulation/TimelineSimulator.js";
import { emptyCustomersState, saveCustomersState } from "./customers/CustomerState.js";

export type ResetMode = "safe" | "simulation" | "test";

export interface DisposableStatePaths {
  simulationStatePath: string;
  simulationCustomerStatePath: string;
  testNotificationStatePath: string;
}

export async function resetSimulationState(paths: DisposableStatePaths): Promise<void> {
  await new FileTimelineStateStore(paths.simulationStatePath).reset();
  await saveCustomersState(paths.simulationCustomerStatePath, emptyCustomersState);
}

export async function resetTestNotificationState(paths: DisposableStatePaths): Promise<void> {
  await saveCustomersState(paths.testNotificationStatePath, emptyCustomersState);
}

export async function resetDisposableState(mode: ResetMode, paths: DisposableStatePaths): Promise<string> {
  if (mode === "simulation") {
    await resetSimulationState(paths);
    return "Simulation state reset.";
  }
  if (mode === "test") {
    await resetTestNotificationState(paths);
    return "Test-notification state reset.";
  }
  await resetSimulationState(paths);
  await resetTestNotificationState(paths);
  return "Simulation and test-notification state reset.";
}

export function parseResetMode(value: string | undefined): ResetMode {
  const mode = value ?? "safe";
  if (mode === "safe" || mode === "simulation" || mode === "test") return mode;
  throw new Error(`Unknown reset mode "${mode}". Expected: safe, simulation, or test`);
}

export async function runResetState(argument = process.argv[2]): Promise<void> {
  console.log(await resetDisposableState(parseResetMode(argument), config));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runResetState();
