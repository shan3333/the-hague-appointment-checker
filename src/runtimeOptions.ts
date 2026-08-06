import { resolveKeepBrowserOpenMs } from "./browserLifecycle.js";

export type RuntimeModeName = "real" | "simulate-fixed" | "simulate-timeline";

export interface RuntimeOptionConfiguration {
  action: string;
  mode: RuntimeModeName;
  headless: boolean;
  debugSlowMode: boolean;
  debugScreenshots: boolean;
  debugKeepBrowserOpenMs: number;
  simulationKeepBrowserOpenMs: number;
}

export interface CommandRuntimeOptions {
  runType: "one-time check" | "monitor";
  browser: "headless" | "visible";
  debugMode: "off" | "standard" | "slow";
  debugScreenshots: boolean;
  keepBrowserOpenMs: number;
}

export function resolveCommandRuntimeOptions(
  configuration: RuntimeOptionConfiguration
): CommandRuntimeOptions {
  const debugMode = configuration.debugSlowMode
    ? "slow"
    : configuration.debugScreenshots
      ? "standard"
      : "off";
  return {
    runType: configuration.action === "monitor" ? "monitor" : "one-time check",
    browser: configuration.debugSlowMode || !configuration.headless ? "visible" : "headless",
    debugMode,
    debugScreenshots: configuration.debugScreenshots,
    keepBrowserOpenMs: resolveKeepBrowserOpenMs(configuration)
  };
}
