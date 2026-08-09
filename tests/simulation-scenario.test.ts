import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  loadSimulationScenario,
  parseSimulationScenario,
  ScenarioSimulator
} from "../src/simulation/SimulationScenario.js";
import type { TimelineState, TimelineStateStore } from "../src/simulation/TimelineSimulator.js";
import { evaluateCustomers } from "../src/customers/CustomerMonitor.js";
import type { CustomerConfig } from "../src/customers/CustomerConfig.js";

class MemoryStateStore implements TimelineStateStore {
  state: TimelineState = { nextIndex: 0, totalChecks: 0 };
  async load(): Promise<TimelineState> { return { ...this.state }; }
  async save(state: TimelineState): Promise<void> { this.state = { ...state }; }
  async reset(): Promise<void> { this.state = { nextIndex: 0, totalChecks: 0 }; }
}

const scenario = parseSimulationScenario({
  rounds: [
    { services: {
      brp_existing_bsn: [],
      brp_eu_eea_swiss_first_registration: ["2026-08-20", "2026-08-25"]
    } },
    { services: { brp_existing_bsn: ["2026-09-10"] } }
  ]
});

describe("scenario simulation", () => {
  it("serves multiple services from one round and derives status from dates", async () => {
    const simulator = new ScenarioSimulator(scenario, true, new MemoryStateStore());
    const round = await simulator.beginRound();
    expect(round.getAvailability("brp_existing_bsn")).toMatchObject({
      status: "NOT_AVAILABLE", appointmentDates: []
    });
    expect(round.getAvailability("brp_eu_eea_swiss_first_registration")).toMatchObject({
      status: "AVAILABLE", appointmentDates: ["2026-08-20", "2026-08-25"]
    });
  });

  it("lets multiple customers filter the same raw service result independently", async () => {
    const simulator = new ScenarioSimulator(scenario, true, new MemoryStateStore());
    const availability = (await simulator.beginRound())
      .getAvailability("brp_eu_eea_swiss_first_registration");
    const customers: CustomerConfig[] = [
      { id: "before", service: "brp_eu_eea_swiss_first_registration", chatId: "test-before", enabled: true,
        filter: { kind: "before", date: "2026-08-22" }, expiresAt: "2026-09-30" },
      { id: "between", service: "brp_eu_eea_swiss_first_registration", chatId: "test-between", enabled: true,
        filter: { kind: "between", startDate: "2026-08-24", endDate: "2026-08-30" }, expiresAt: "2026-09-30" }
    ];
    const deliveries: Array<{ id: string; date: unknown }> = [];
    await evaluateCustomers({
      customers,
      state: { customers: {} },
      status: availability.status,
      appointmentDates: availability.appointmentDates ?? [],
      now: new Date("2026-08-09T10:00:00Z"),
      timezone: "Europe/Amsterdam",
      isSimulation: true,
      sender: { send: async (notification, chatId) => {
        deliveries.push({ id: chatId, date: notification.metadata?.earliestMatchingDate });
      } },
      log: { info: () => undefined, error: () => undefined }
    });
    expect(deliveries).toEqual([
      { id: "test-before", date: "2026-08-20" },
      { id: "test-between", date: "2026-08-25" }
    ]);
  });

  it("does not advance per service and advances exactly once on round completion", async () => {
    const store = new MemoryStateStore();
    const simulator = new ScenarioSimulator(scenario, true, store);
    const round = await simulator.beginRound();
    round.getAvailability("brp_existing_bsn");
    round.getAvailability("brp_eu_eea_swiss_first_registration");
    expect(store.state).toEqual({ nextIndex: 0, totalChecks: 0 });
    await round.complete();
    await round.complete();
    expect(store.state).toEqual({ nextIndex: 1, totalChecks: 1 });
  });

  it("wraps in repeat mode", async () => {
    const simulator = new ScenarioSimulator(scenario, true, new MemoryStateStore());
    const first = await simulator.beginRound(); await first.complete();
    const second = await simulator.beginRound(); await second.complete();
    const wrapped = await simulator.beginRound();
    expect(wrapped.getAvailability("brp_eu_eea_swiss_first_registration").status).toBe("AVAILABLE");
  });

  it("stays on the final round when repeat is disabled", async () => {
    const simulator = new ScenarioSimulator(scenario, false, new MemoryStateStore());
    const first = await simulator.beginRound(); await first.complete();
    const second = await simulator.beginRound(); await second.complete();
    const finalAgain = await simulator.beginRound();
    expect(finalAgain.getAvailability("brp_existing_bsn").appointmentDates).toEqual(["2026-09-10"]);
  });

  it("treats an omitted service as unavailable", async () => {
    const simulator = new ScenarioSimulator(scenario, false, new MemoryStateStore());
    const round = await simulator.beginRound();
    expect(round.getAvailability("brp_dutch_first_registration")).toMatchObject({
      status: "NOT_AVAILABLE", appointmentDates: []
    });
  });

  it.each([
    [{}, /rounds must be an array/],
    [{ rounds: [] }, /at least one round/],
    [{ rounds: [{ services: { unknown: [] } }] }, /unsupported service/],
    [{ rounds: [{ services: { brp_existing_bsn: "2026-08-20" } }] }, /dates must be an array/],
    [{ rounds: [{ services: { brp_existing_bsn: ["not-a-date"] } }] }, /invalid date/]
  ])("rejects invalid scenario data", (value, expected) => {
    expect(() => parseSimulationScenario(value)).toThrow(expected);
  });

  it("reports missing and malformed scenario files clearly", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "appointment-scenario-"));
    await expect(loadSimulationScenario(path.join(directory, "missing.json")))
      .rejects.toThrow("Simulation scenario file not found");
    const malformed = path.join(directory, "malformed.json");
    await writeFile(malformed, "{not-json", "utf8");
    await expect(loadSimulationScenario(malformed)).rejects.toThrow("Simulation scenario is not valid JSON");
  });
});
