import { config } from "./config.js";
import { emptyState, saveState } from "./state.js";
import { FileTimelineStateStore } from "./simulation/TimelineSimulator.js";

await saveState(config.statePath, { ...emptyState });
await new FileTimelineStateStore(config.simulationStatePath).reset();
console.log("Simulation state reset.");
