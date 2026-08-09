import type { SimulatedStatus } from "./TimelineSimulator.js";

export interface SimulationSelection {
  status?: SimulatedStatus;
  timelineCheckNumber?: number;
}

export class SimulationController {
  constructor(private readonly fixedStatus?: SimulatedStatus) {}

  async next(): Promise<SimulationSelection> {
    return { status: this.fixedStatus };
  }
}
