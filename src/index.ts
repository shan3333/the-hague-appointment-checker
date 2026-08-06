import { config } from "./config.js";
import { checkOnce } from "./checker.js";
import { logger } from "./logger.js";
import { NotificationService } from "./notifications/NotificationService.js";
import { openInDefaultBrowser } from "./system.js";
import { loadState, matchingDatesChanged, nextState, saveState, shouldNotify } from "./state.js";
import { runMonitor } from "./scheduler.js";
import { SimulationController } from "./simulation/SimulationController.js";
import { FileTimelineStateStore, TimelineSimulator } from "./simulation/TimelineSimulator.js";
import { printModeBanner, resolveRuntimeMode, runModeCheck } from "./mode.js";
import {
  calculateDateRange,
  describeDateFilter,
  evaluateDateFilter,
  parseDateFilterArgs,
  selectSimulationDates,
  type DateFilter
} from "./dateFilter.js";
import { resolveCommandRuntimeOptions } from "./runtimeOptions.js";

const action = process.argv[2] ?? "check";

function parseCliFilter(): DateFilter | undefined {
  try {
    return parseDateFilterArgs(process.argv.slice(3));
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
}

const dateFilter = parseCliFilter();

const runtimeMode = resolveRuntimeMode({
  appointmentMode: config.appointmentMode,
  simulateStatus: config.simulateStatus,
  simulationSequence: config.simulationSequence
});
const commandRuntime = resolveCommandRuntimeOptions({
  action,
  mode: runtimeMode.kind === "real" ? "real" : `simulate-${runtimeMode.type}`,
  headless: config.headless,
  debugSlowMode: config.debugSlowMode,
  debugScreenshots: config.debugScreenshots,
  debugKeepBrowserOpenMs: config.debugKeepBrowserOpenMs,
  simulationKeepBrowserOpenMs: config.simulationKeepBrowserOpenMs
});
printModeBanner(runtimeMode, config.url, config, commandRuntime);
if (dateFilter) logger.info(`Active appointment date filter: ${describeDateFilter(dateFilter)}`);

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

function simulationDates(checkNumber?: number): string[] {
  if (runtimeMode.kind !== "simulation" || runtimeMode.type === "fixed") {
    return config.simulateAppointmentDates;
  }
  return selectSimulationDates(
    config.simulateAppointmentDates,
    config.simulationDateSequence,
    checkNumber,
    config.simulationRepeat
  );
}

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
  const simulatedDates = simulationDates(simulation.timelineCheckNumber);
  const range = calculateDateRange(now, dateFilter, config.timezone);
  const simulatedEvaluation = simulation.status === undefined
    ? undefined
    : evaluateDateFilter(simulation.status, simulatedDates, range, dateFilter !== undefined);
  const expectedAvailabilityEvent = simulatedEvaluation !== undefined &&
    shouldNotify(simulatedEvaluation.status);
  const captureAvailabilityScreenshot =
    config.enableScreenshot && previous.lastDefinitiveStatus === "NOT_AVAILABLE";
  const shouldCaptureAvailabilityScreenshot = (dates: readonly string[]) =>
    evaluateDateFilter("AVAILABLE", dates, range, dateFilter !== undefined).status === "AVAILABLE";
  const keepBrowserOpenMs = commandRuntime.keepBrowserOpenMs;
  const result = await runModeCheck(runtimeMode, simulation.status, {
    real: () => checkOnce({ captureAvailabilityScreenshot, shouldCaptureAvailabilityScreenshot, keepBrowserOpenMs }),
    simulated: status => checkOnce({
      captureAvailabilityScreenshot,
      shouldCaptureAvailabilityScreenshot,
      simulatedStatus: status,
      simulatedAppointmentDates: simulatedDates,
      simulationView: {
        cycleNumber: simulation.timelineCheckNumber ?? 1,
        previousStatus: previous.lastDefinitiveStatus,
        currentStatus: simulatedEvaluation?.status === "AVAILABLE" ? "AVAILABLE" : "NOT_AVAILABLE",
        notificationShouldSend: expectedAvailabilityEvent,
        browserWouldOpen: expectedAvailabilityEvent && config.enableOpenBrowser,
        screenshotWouldBeTaken: expectedAvailabilityEvent && config.enableScreenshot,
        timestamp: now.toISOString(),
        availableDates: simulatedDates,
        matchingDates: simulatedEvaluation?.matchingDates,
        activeFilter: dateFilter ? describeDateFilter(dateFilter) : "NONE",
        countdownSeconds: action === "monitor"
          ? Math.ceil((config.simulationKeepBrowserOpenMs + config.simulationIntervalSeconds * 1_000) / 1_000)
          : 0
      },
      keepBrowserOpenMs,
      pauseBeforeClose: action === "monitor" && config.simulationPauseBeforeClose
    })
  });
  const rawStatus = result.status;
  const evaluation = evaluateDateFilter(rawStatus, result.appointmentDates ?? [], range, dateFilter !== undefined);
  const effectiveStatus = evaluation.status;
  logger.info(`Status: ${effectiveStatus}`, { rawStatus, reason: result.reason });
  if (dateFilter || config.debugSlowMode || config.debugScreenshots) {
    logger.info(`Parsed appointment dates: ${evaluation.availableDates.join(", ") || "NONE"}`);
    logger.info(`Date filter: ${describeDateFilter(dateFilter)}`);
    logger.info(`Date range: ${range.start} through ${range.end ?? "unbounded"}`);
    logger.info(`Matching appointment dates: ${evaluation.matchingDates.join(", ") || "NONE"}`);
    logger.info(`Rejected appointment dates: ${evaluation.rejectedDates.join(", ") || "NONE"}`);
    logger.info(`Rejected before range start: ${evaluation.rejectedBeforeStart.join(", ") || "NONE"}`);
    logger.info(`Rejected after range end: ${evaluation.rejectedAfterEnd.join(", ") || "NONE"}`);
    logger.info(`Rejected because date is in the past: ${evaluation.rejectedPastDates.join(", ") || "NONE"}`);
  }
  if (dateFilter && rawStatus === "AVAILABLE") {
    if (evaluation.matchingDates.length > 0) {
      console.log("Appointment found");
      console.log(`Earliest matching appointment: ${evaluation.matchingDates[0]}`);
      console.log(`Matching appointments: ${evaluation.matchingDates.length}`);
    } else {
      console.log("Appointments are available, but none match the requested date range.");
      if (evaluation.availableDates[0]) console.log(`Earliest available appointment: ${evaluation.availableDates[0]}`);
    }
    console.log(`Filter: ${describeDateFilter(dateFilter)}`);
    console.log(`Range: ${range.start} through ${range.end ?? "unbounded"}`);
  }
  const availabilityEvent = shouldNotify(effectiveStatus);
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
        const matchingDetails = evaluation.matchingDates[0]
          ? ` Earliest matching appointment: ${evaluation.matchingDates[0]}. Filter: ${describeDateFilter(dateFilter)}.`
          : "";
        await notificationService.notify(
          "The Hague Appointment Checker",
          `A possible appointment is available.${matchingDetails} Open the website now.`
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
  logger.info(`Current status: ${effectiveStatus}`);
  logger.info(`Appointment available: ${availabilityEvent}`);
  logger.info(`Notification enabled: ${notificationEnabled}`);
  logger.info(`Notification attempted: ${notificationAttempted}`);
  logger.info(`Notification result: ${notificationResult}`);
  logger.info(`Matching appointment dates changed: ${matchingDatesChanged(previous, evaluation.matchingDates)}`);
  await saveState(config.statePath, nextState(previous, effectiveStatus, now, desktopNotificationSent, {
    rawStatus,
    availableDates: evaluation.availableDates,
    matchingDates: evaluation.matchingDates
  }));
  if (effectiveStatus === "PAGE_NOT_LOADED" || effectiveStatus === "ERROR") process.exitCode = 1;
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
