import type { SimulatedStatus, TimelineSimulator } from "./TimelineSimulator.js";

export interface SimulationSelection {
  status?: SimulatedStatus;
  timelineCheckNumber?: number;
}

export class SimulationController {
  constructor(
    private readonly fixedStatus?: SimulatedStatus,
    private readonly timeline?: TimelineSimulator
  ) {}

  async next(): Promise<SimulationSelection> {
    if (this.timeline) {
      const result = await this.timeline.next();
      return { status: result.status, timelineCheckNumber: result.checkNumber };
    }
    return { status: this.fixedStatus };
  }
}
