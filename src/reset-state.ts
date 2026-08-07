import { config } from "./config.js";
import { emptyState, saveState } from "./state.js";
import { FileTimelineStateStore } from "./simulation/TimelineSimulator.js";
import { emptyCustomersState, saveCustomersState } from "./customers/CustomerState.js";

await saveState(config.statePath, { ...emptyState });
await new FileTimelineStateStore(config.simulationStatePath).reset();
await saveCustomersState(config.customerStatePath, emptyCustomersState);
console.log("Appointment, simulation, and customer notification state reset.");
