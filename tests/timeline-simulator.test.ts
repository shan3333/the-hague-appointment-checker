import { describe, expect, it } from "vitest";
import {
  TimelineSimulator,
  type TimelineState,
  type TimelineStateStore
} from "../src/simulation/TimelineSimulator.js";

class MemoryTimelineStateStore implements TimelineStateStore {
  state: TimelineState = { nextIndex: 0, totalChecks: 0 };

  async load(): Promise<TimelineState> {
    return { ...this.state };
  }

  async save(state: TimelineState): Promise<void> {
    this.state = { ...state };
  }

  async reset(): Promise<void> {
    this.state = { nextIndex: 0, totalChecks: 0 };
  }
}

describe("TimelineSimulator", () => {
  it("returns the configured sequence and repeats from the beginning", async () => {
    const simulator = new TimelineSimulator(
      ["NOT_AVAILABLE", "NOT_AVAILABLE", "AVAILABLE"],
      true,
      new MemoryTimelineStateStore()
    );

    const results = [];
    for (let index = 0; index < 6; index += 1) results.push(await simulator.next());

    expect(results.map(result => result.status)).toEqual([
      "NOT_AVAILABLE", "NOT_AVAILABLE", "AVAILABLE",
      "NOT_AVAILABLE", "NOT_AVAILABLE", "AVAILABLE"
    ]);
    expect(results.map(result => result.checkNumber)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("stays on the final status when repeat is false", async () => {
    const simulator = new TimelineSimulator(
      ["NOT_AVAILABLE", "AVAILABLE"],
      false,
      new MemoryTimelineStateStore()
    );
    expect((await simulator.next()).status).toBe("NOT_AVAILABLE");
    expect((await simulator.next()).status).toBe("AVAILABLE");
    expect((await simulator.next()).status).toBe("AVAILABLE");
  });

  it("persists its index and resets it explicitly", async () => {
    const store = new MemoryTimelineStateStore();
    const first = new TimelineSimulator(["NOT_AVAILABLE", "AVAILABLE"], true, store);
    await first.next();

    const resumed = new TimelineSimulator(["NOT_AVAILABLE", "AVAILABLE"], true, store);
    expect((await resumed.next()).status).toBe("AVAILABLE");
    await resumed.reset();
    const reset = await resumed.next();
    expect(reset.status).toBe("NOT_AVAILABLE");
    expect(reset.checkNumber).toBe(1);
  });

  it("rejects an empty sequence", () => {
    expect(() => new TimelineSimulator([], true, new MemoryTimelineStateStore())).toThrow(/cannot be empty/);
  });
});
