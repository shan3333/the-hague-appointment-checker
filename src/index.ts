import { config } from "./config.js";
import { checkOnce } from "./checker.js";
import { logger } from "./logger.js";
import { NotificationService } from "./notifications/NotificationService.js";
import { openInDefaultBrowser } from "./system.js";
import { loadState, nextState, saveState, shouldNotify } from "./state.js";
import { runMonitor } from "./scheduler.js";
import { SimulationController } from "./simulation/SimulationController.js";
import { FileTimelineStateStore, TimelineSimulator } from "./simulation/TimelineSimulator.js";
import { printModeBanner, resolveRuntimeMode, runModeCheck } from "./mode.js";

const runtimeMode = resolveRuntimeMode({
  appointmentMode: config.appointmentMode,
  simulateStatus: config.simulateStatus,
  simulationSequence: config.simulationSequence
});
printModeBanner(runtimeMode, config.url, config);
const action = process.argv[2] ?? "check";

const timelineSimulator = runtimeMode.kind === "simulation" && runtimeMode.type === "timeline"
  ? new TimelineSimulator(
      runtimeMode.sequence,
      config.simulationRepeat,
      new FileTimelineStateStore(config.simulationStatePath)
    )
  : undefined;
const fixedSimulationStatus = runtimeMode.kind === "simulation" && runtimeMode.type === "fixed"
  ? runtimeMode.sequence[0]
  : undefined;
const simulationController = new SimulationController(fixedSimulationStatus, timelineSimulator);

async function performCheck(): Promise<void> {
  logger.info("Starting appointment check");
  const now = new Date();
  const previous = await loadState(config.statePath);
  const simulation = runtimeMode.kind === "simulation"
    ? await simulationController.next()
    : {};
  if (simulation.timelineCheckNumber !== undefined) {
    logger.info(`Simulation check #${simulation.timelineCheckNumber}`);
    logger.info(`Returning ${simulation.status}`);
  }
  const expectedAvailabilityEvent = simulation.status !== undefined &&
    shouldNotify(simulation.status);
  const captureAvailabilityScreenshot =
    config.enableScreenshot && previous.lastDefinitiveStatus === "NOT_AVAILABLE";
  const keepBrowserOpenMs = action === "check" && config.debugSlowMode
    ? config.debugKeepBrowserOpenMs
    : action === "monitor" && runtimeMode.kind === "simulation"
      ? config.simulationKeepBrowserOpenMs
      : 0;
  const result = await runModeCheck(runtimeMode, simulation.status, {
    real: () => checkOnce({ captureAvailabilityScreenshot, keepBrowserOpenMs }),
    simulated: status => checkOnce({
      captureAvailabilityScreenshot,
      simulatedStatus: status,
      simulationView: {
        cycleNumber: simulation.timelineCheckNumber ?? 1,
        previousStatus: previous.lastDefinitiveStatus,
        currentStatus: status,
        notificationShouldSend: expectedAvailabilityEvent,
        browserWouldOpen: expectedAvailabilityEvent && config.enableOpenBrowser,
        screenshotWouldBeTaken: expectedAvailabilityEvent && config.enableScreenshot,
        timestamp: now.toISOString(),
        countdownSeconds: action === "monitor"
          ? Math.ceil((config.simulationKeepBrowserOpenMs + config.simulationIntervalSeconds * 1_000) / 1_000)
          : 0
      },
      keepBrowserOpenMs,
      pauseBeforeClose: action === "monitor" && config.simulationPauseBeforeClose
    })
  });
  logger.info(`Status: ${result.status}`, { reason: result.reason });
  const availabilityEvent = shouldNotify(result.status);
  const notificationEnabled = config.enableDesktopNotification;
  let notificationAttempted = false;
  let notificationResult: "success" | "failure" | "not attempted" = "not attempted";
  let desktopNotificationSent = false;
  if (availabilityEvent) {
    console.log("\n*** POSSIBLE APPOINTMENT AVAILABLE — OPEN THE WEBSITE NOW ***\n");
    logger.info("Appointment availability detected; running enabled alert actions");
    if (config.enableScreenshot) {
      if (result.screenshotPath) logger.info("Availability screenshot saved", { path: result.screenshotPath });
      else logger.error("Availability screenshot was not saved");
    }
    if (config.enableDesktopNotification) {
      notificationAttempted = true;
      try {
        const notificationService = new NotificationService({
          provider: config.notificationProvider,
          enableSound: config.enableSound
        });
        await notificationService.notify(
          "The Hague Appointment Checker",
          "A possible appointment is available. Open the website now."
        );
        desktopNotificationSent = true;
        notificationResult = "success";
        logger.info("Desktop notification sent", { provider: notificationService.providerName });
      } catch (error) {
        notificationResult = "failure";
        logger.error("Desktop notification failure", { error: String(error) });
      }
    }
    if (config.enableOpenBrowser) {
      try {
        await openInDefaultBrowser(config.url);
        logger.info("Appointment URL opened in default browser");
      } catch (error) {
        logger.error("Could not open default browser", { error: String(error) });
      }
    }
  }
  logger.info(`Previous status: ${previous.lastDefinitiveStatus ?? "NONE"}`);
  logger.info(`Current status: ${result.status}`);
  logger.info(`Appointment available: ${availabilityEvent}`);
  logger.info(`Notification enabled: ${notificationEnabled}`);
  logger.info(`Notification attempted: ${notificationAttempted}`);
  logger.info(`Notification result: ${notificationResult}`);
  await saveState(config.statePath, nextState(previous, result.status, now, desktopNotificationSent));
  if (result.status === "PAGE_NOT_LOADED" || result.status === "ERROR") process.exitCode = 1;
}

if (action === "check") await performCheck();
else if (action === "monitor") {
  logger.info("Monitor started. Press Ctrl+C to stop.");
  const intervalMs = runtimeMode.kind === "real"
    ? config.checkIntervalMinutes * 60_000
    : config.simulationIntervalSeconds * 1_000;
  await runMonitor(performCheck, config, intervalMs, message => logger.info(message));
} else {
  console.error("Unknown command. Run npm run help for available commands.");
  process.exitCode = 2;
}
