import { describe, expect, it } from "vitest";
import { resolveCommandRuntimeOptions } from "../src/runtimeOptions.js";

const base = {
  action: "check",
  mode: "real" as const,
  headless: false,
  debugSlowMode: false,
  debugScreenshots: true,
  debugKeepBrowserOpenMs: 15_000,
  simulationKeepBrowserOpenMs: 30_000
};

describe("command runtime options", () => {
  it("resolves standard debug as visible, normal speed, with artifacts and no delay", () => {
    expect(resolveCommandRuntimeOptions(base)).toEqual({
      runType: "one-time check",
      browser: "visible",
      debugMode: "standard",
      debugScreenshots: true,
      keepBrowserOpenMs: 0
    });
  });

  it("resolves slow debug with its configured keep-open duration", () => {
    expect(resolveCommandRuntimeOptions({ ...base, debugSlowMode: true })).toEqual({
      runType: "one-time check",
      browser: "visible",
      debugMode: "slow",
      debugScreenshots: true,
      keepBrowserOpenMs: 15_000
    });
  });

  it("resolves monitor separately from one-time commands", () => {
    expect(resolveCommandRuntimeOptions({
      ...base,
      action: "monitor",
      headless: true,
      debugScreenshots: false
    })).toMatchObject({ runType: "monitor", browser: "headless", debugMode: "off" });
  });
});
