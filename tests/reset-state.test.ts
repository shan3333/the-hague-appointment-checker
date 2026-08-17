import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { resetDisposableState, type DisposableStatePaths } from "../src/reset-state.js";

describe("safe disposable state resets", () => {
  let paths: DisposableStatePaths;
  let realCustomerStatePath: string;
  let productionAppointmentStatePath: string;

  beforeEach(async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "appointment-reset-"));
    paths = {
      simulationStatePath: path.join(directory, "simulation-state.json"),
      simulationCustomerStatePath: path.join(directory, "simulation-customer-state.json"),
      testNotificationStatePath: path.join(directory, "test-notification-state.json")
    };
    realCustomerStatePath = path.join(directory, "customer-state.json");
    productionAppointmentStatePath = path.join(directory, "state.json");
    await writeFile(paths.simulationStatePath, JSON.stringify({ nextIndex: 4, totalChecks: 12 }));
    await writeFile(paths.simulationCustomerStatePath, JSON.stringify({ customers: { simulation: { status: "booked" } } }));
    await writeFile(paths.testNotificationStatePath, JSON.stringify({ customers: { test: { status: "booked" } } }));
    await writeFile(realCustomerStatePath, JSON.stringify({ customers: { real: { status: "booked", bookedAt: "preserve" } } }));
    await writeFile(productionAppointmentStatePath, JSON.stringify({ lastDefinitiveStatus: "AVAILABLE", lastCheckedAt: "preserve" }));
  });

  async function json(file: string): Promise<unknown> {
    return JSON.parse(await readFile(file, "utf8"));
  }

  it("default reset clears disposable state and preserves both production states", async () => {
    const realBefore = await readFile(realCustomerStatePath, "utf8");
    const appointmentBefore = await readFile(productionAppointmentStatePath, "utf8");
    expect(await resetDisposableState("safe", paths)).toBe("Simulation and test-notification state reset.");
    expect(await json(paths.simulationStatePath)).toEqual({ nextIndex: 0, totalChecks: 0 });
    expect(await json(paths.simulationCustomerStatePath)).toEqual({ customers: {} });
    expect(await json(paths.testNotificationStatePath)).toEqual({ customers: {} });
    expect(await readFile(realCustomerStatePath, "utf8")).toBe(realBefore);
    expect(await readFile(productionAppointmentStatePath, "utf8")).toBe(appointmentBefore);
  });

  it("simulation reset changes only simulation timeline and customer state", async () => {
    const testBefore = await readFile(paths.testNotificationStatePath, "utf8");
    const realBefore = await readFile(realCustomerStatePath, "utf8");
    const appointmentBefore = await readFile(productionAppointmentStatePath, "utf8");
    await resetDisposableState("simulation", paths);
    expect(await json(paths.simulationStatePath)).toEqual({ nextIndex: 0, totalChecks: 0 });
    expect(await json(paths.simulationCustomerStatePath)).toEqual({ customers: {} });
    expect(await readFile(paths.testNotificationStatePath, "utf8")).toBe(testBefore);
    expect(await readFile(realCustomerStatePath, "utf8")).toBe(realBefore);
    expect(await readFile(productionAppointmentStatePath, "utf8")).toBe(appointmentBefore);
  });

  it("test reset changes only test-notification state", async () => {
    const timelineBefore = await readFile(paths.simulationStatePath, "utf8");
    const simulationBefore = await readFile(paths.simulationCustomerStatePath, "utf8");
    const realBefore = await readFile(realCustomerStatePath, "utf8");
    const appointmentBefore = await readFile(productionAppointmentStatePath, "utf8");
    await resetDisposableState("test", paths);
    expect(await json(paths.testNotificationStatePath)).toEqual({ customers: {} });
    expect(await readFile(paths.simulationStatePath, "utf8")).toBe(timelineBefore);
    expect(await readFile(paths.simulationCustomerStatePath, "utf8")).toBe(simulationBefore);
    expect(await readFile(realCustomerStatePath, "utf8")).toBe(realBefore);
    expect(await readFile(productionAppointmentStatePath, "utf8")).toBe(appointmentBefore);
  });

  it("creates missing disposable state files safely", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "appointment-reset-missing-"));
    const missingPaths = {
      simulationStatePath: path.join(directory, "nested", "simulation-state.json"),
      simulationCustomerStatePath: path.join(directory, "nested", "simulation-customer-state.json"),
      testNotificationStatePath: path.join(directory, "nested", "test-notification-state.json")
    };
    await expect(resetDisposableState("safe", missingPaths)).resolves.toBe("Simulation and test-notification state reset.");
    expect(await json(missingPaths.simulationStatePath)).toEqual({ nextIndex: 0, totalChecks: 0 });
    expect(await json(missingPaths.simulationCustomerStatePath)).toEqual({ customers: {} });
    expect(await json(missingPaths.testNotificationStatePath)).toEqual({ customers: {} });
  });
});
