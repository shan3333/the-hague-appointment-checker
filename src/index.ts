import { config } from "./config.js";
import { checkOnce } from "./checker.js";
import { logger } from "./logger.js";
import { NotificationService } from "./notifications/NotificationService.js";
import { openInDefaultBrowser } from "./system.js";
import { loadState, matchingDatesChanged, nextState, saveState, shouldNotify } from "./state.js";
import { runMonitor } from "./scheduler.js";
import { SimulationController } from "./simulation/SimulationController.js";
import { FileTimelineStateStore } from "./simulation/TimelineSimulator.js";
import { loadSimulationScenario, ScenarioSimulator } from "./simulation/SimulationScenario.js";
import { printModeBanner, resolveRuntimeMode, runModeCheck } from "./mode.js";
import {
  calculateDateRange,
  describeDateFilter,
  evaluateDateFilter
} from "./dateFilter.js";
import { resolveCommandRuntimeOptions } from "./runtimeOptions.js";
import {
  loadCustomers,
  resolveCustomersConfigPath,
  type CustomerConfig
} from "./customers/CustomerConfig.js";
import {
  evaluateCustomers,
  logCustomerAvailability,
  logCustomerSummary
} from "./customers/CustomerMonitor.js";
import { loadCustomersState, saveCustomersState } from "./customers/CustomerState.js";
import { TelegramNotifier } from "./notifications/TelegramNotifier.js";
import { createNotification, type NotificationDraft } from "./notifications/Notification.js";
import { parseCustomerCliOptions } from "./customers/CustomerCli.js";
import { logMonitoringRoundComplete, runWithReloadedCustomers } from "./customers/CustomerCycle.js";
import { groupActiveCustomersByService } from "./customers/CustomerServiceGroups.js";
import { getAppointmentService } from "./appointmentServices.js";
import type { CustomerEvaluationSummary } from "./customers/CustomerMonitor.js";

const action = process.argv[2] ?? "check";

function parseCliOptions() {
  try {
    return parseCustomerCliOptions(process.argv.slice(3));
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
}

const { dateFilter, customersMode } = parseCliOptions();

const runtimeMode = resolveRuntimeMode({
  appointmentMode: config.appointmentMode,
  simulateStatus: config.simulateStatus
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

let customerNotifier: TelegramNotifier | undefined;
let customersConfigPath: string | undefined;
if (customersMode) {
  if (!config.telegramBotToken) throw new Error("--customers requires TELEGRAM_BOT_TOKEN");
  const customerConfigurationMode = runtimeMode.kind === "real" ? "real" : "simulation";
  customersConfigPath = resolveCustomersConfigPath(customerConfigurationMode, config.customersConfigPaths);
  customerNotifier = new TelegramNotifier(config.telegramBotToken, "");
}

const timelineStore = new FileTimelineStateStore(config.simulationStatePath);
const scenarioSimulator = runtimeMode.kind === "simulation" && runtimeMode.type === "timeline"
  ? new ScenarioSimulator(
      await loadSimulationScenario(config.simulationScenarioPath),
      config.simulationRepeat,
      timelineStore
    )
  : undefined;
const fixedSimulationStatus = runtimeMode.kind === "simulation" && runtimeMode.type === "fixed"
  ? runtimeMode.sequence![0]
  : undefined;
const simulationController = new SimulationController(fixedSimulationStatus);

async function performLoadedCheck(cycleCustomers?: readonly CustomerConfig[]): Promise<void> {
  if (customersMode) return performCustomerServiceChecks(cycleCustomers ?? []);
  logger.info("Starting appointment check");
  const now = new Date();
  const previous = await loadState(config.statePath);
  const scenarioRound = scenarioSimulator ? await scenarioSimulator.beginRound() : undefined;
  const scenarioAvailability = scenarioRound?.getAvailability("brp_existing_bsn");
  const simulation = scenarioAvailability
    ? { status: scenarioAvailability.status, timelineCheckNumber: scenarioRound!.roundNumber }
    : runtimeMode.kind === "simulation"
    ? await simulationController.next()
    : {};
  if (simulation.timelineCheckNumber !== undefined) {
    logger.info(`Simulation check #${simulation.timelineCheckNumber}`);
    logger.info(`Returning ${simulation.status}`);
  }
  const simulatedDates = scenarioAvailability?.appointmentDates ?? config.simulateAppointmentDates;
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
  const result = await runModeCheck(runtimeMode, simulation.status as "AVAILABLE" | "NOT_AVAILABLE" | undefined, {
    real: () => checkOnce({ bookingUrl: config.url, captureAvailabilityScreenshot, shouldCaptureAvailabilityScreenshot, keepBrowserOpenMs }),
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
  const notificationEnabled = config.enableDesktopNotification || config.telegram.enabled;
  let notificationAttempted = false;
  let notificationResult: "success" | "failure" | "not attempted" = "not attempted";
  let notificationSent = false;
  if (availabilityEvent) {
    console.log("\n*** POSSIBLE APPOINTMENT AVAILABLE — OPEN THE WEBSITE NOW ***\n");
    logger.info("Appointment availability detected; running enabled alert actions");
    if (config.enableScreenshot) {
      if (result.screenshotPath) logger.info("Availability screenshot saved", { path: result.screenshotPath });
      else logger.error("Availability screenshot was not saved");
    }
    if (notificationEnabled) {
      notificationAttempted = true;
      const notificationService = new NotificationService({
        provider: config.notificationProvider,
        enableSound: config.enableSound,
        desktopEnabled: config.enableDesktopNotification,
        telegram: config.telegram
      });
      const matchingDetails = evaluation.matchingDates[0]
        ? ` Earliest matching appointment: ${evaluation.matchingDates[0]}. Filter: ${describeDateFilter(dateFilter)}.`
        : "";
      const isSimulation = runtimeMode.kind === "simulation";
      const dispatch = await notificationService.notify({
        title: isSimulation
          ? "🧪 Simulation: The Hague Appointment Available"
          : "The Hague Appointment Checker",
        message: isSimulation
          ? `This is a simulated appointment notification. No real appointment website was checked. No booking was attempted. A possible appointment is available.${matchingDetails} Booking URL is included for reference only.`
          : `A possible appointment is available.${matchingDetails} Open the website now.`,
        isSimulation,
        url: config.url,
        timestamp: now,
        metadata: {
          ...(evaluation.matchingDates[0] ? { earliestMatchingDate: evaluation.matchingDates[0] } : {}),
          matchingAppointmentCount: evaluation.matchingDates.length,
          filter: describeDateFilter(dateFilter),
          timezone: config.timezone
        }
      });
      notificationSent = dispatch.deliveries.some(delivery => delivery.success);
      notificationResult = dispatch.deliveries.every(delivery => delivery.success) ? "success" : "failure";
      for (const delivery of dispatch.deliveries.filter(delivery => delivery.success)) {
        logger.info(`${delivery.channel} notification sent`, { provider: delivery.provider });
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
  logger.info(`Desktop notification enabled: ${config.enableDesktopNotification}`);
  logger.info(`Telegram notification enabled: ${config.telegram.enabled}`);
  logger.info(`Notification attempted: ${notificationAttempted}`);
  logger.info(`Notification result: ${notificationResult}`);
  logger.info(`Matching appointment dates changed: ${matchingDatesChanged(previous, evaluation.matchingDates)}`);
  await saveState(config.statePath, nextState(previous, effectiveStatus, now, notificationSent, {
    rawStatus,
    availableDates: evaluation.availableDates,
    matchingDates: evaluation.matchingDates
  }));
  await scenarioRound?.complete();
  if (effectiveStatus === "PAGE_NOT_LOADED" || effectiveStatus === "ERROR") process.exitCode = 1;
}

function addSummary(total: CustomerEvaluationSummary, part: CustomerEvaluationSummary): void {
  for (const key of Object.keys(total) as Array<keyof CustomerEvaluationSummary>) total[key] += part[key];
}

async function performCustomerServiceChecks(customers: readonly CustomerConfig[]): Promise<void> {
  logger.info("Starting service-grouped customer appointment checks");
  const now = new Date();
  const isSimulation = runtimeMode.kind === "simulation";
  const state = await loadCustomersState(config.customerStatePath);
  const groups = groupActiveCustomersByService(customers, now, config.timezone);
  const activeIds = new Set([...groups.values()].flat().map(customer => customer.id));
  const inactiveCustomers = customers.filter(customer => !activeIds.has(customer.id));
  const total: CustomerEvaluationSummary = {
    evaluated: 0, expired: 0, disabled: 0, customersWithMatches: 0,
    notificationsAttempted: 0, notificationsSent: 0, notificationsFailed: 0
  };
  const sender = {
    send: async (draft: NotificationDraft, chatId: string) =>
      customerNotifier!.notify(createNotification(draft), chatId)
  };
  const log = { info: (message: string) => logger.info(message), error: (message: string) => logger.error(message) };

  if (inactiveCustomers.length > 0) {
    addSummary(total, await evaluateCustomers({
      customers: inactiveCustomers, state, status: "NOT_AVAILABLE", appointmentDates: [], now,
      timezone: config.timezone, isSimulation, sender, log
    }));
  }

  const scenarioRound = scenarioSimulator ? await scenarioSimulator.beginRound() : undefined;
  const fixedSimulation = isSimulation && !scenarioRound && groups.size > 0
    ? await simulationController.next()
    : {};
  for (const [serviceId, serviceCustomers] of groups) {
    const service = getAppointmentService(serviceId);
    logger.info(`Checking ${serviceId} for ${serviceCustomers.length} active customers`);
    const result = scenarioRound
      ? scenarioRound.getAvailability(serviceId)
      : await runModeCheck(runtimeMode, fixedSimulation.status, {
        real: () => checkOnce({ bookingUrl: service.bookingUrl, keepBrowserOpenMs: commandRuntime.keepBrowserOpenMs }),
        simulated: status => checkOnce({
        simulatedStatus: status,
        simulatedAppointmentDates: config.simulateAppointmentDates,
        keepBrowserOpenMs: commandRuntime.keepBrowserOpenMs,
        simulationView: {
          cycleNumber: 1,
          previousStatus: null,
          currentStatus: status,
          notificationShouldSend: status === "AVAILABLE",
          browserWouldOpen: false,
          screenshotWouldBeTaken: false,
          timestamp: now.toISOString(),
          availableDates: config.simulateAppointmentDates,
          activeFilter: "CUSTOMER-SPECIFIC",
          countdownSeconds: 0
        }
        })
      });
    if (result.status !== "AVAILABLE" && result.status !== "NOT_AVAILABLE") {
      logger.error(`Customer evaluation skipped for ${serviceId} because the appointment page did not load successfully`);
      process.exitCode = 1;
      continue;
    }
    logger.info(`Found ${(result.appointmentDates ?? []).length} available dates for ${serviceId}`);
    logCustomerAvailability({
      status: result.status, appointmentDates: result.appointmentDates ?? [], isSimulation,
      log
    });
    addSummary(total, await evaluateCustomers({
      customers: serviceCustomers, state, status: result.status, appointmentDates: result.appointmentDates ?? [],
      now, timezone: config.timezone, isSimulation, sender, log
    }));
  }
  logCustomerSummary(total, log);
  await saveCustomersState(config.customerStatePath, state);
  await scenarioRound?.complete();
}

async function performCheck(): Promise<void> {
  if (!customersMode || !customersConfigPath) return performLoadedCheck();
  const result = await runWithReloadedCustomers({
    load: () => loadCustomers(customersConfigPath),
    run: customers => performLoadedCheck(customers),
    log: {
      info: message => logger.info(message),
      error: message => logger.error(message)
    }
  });
  if (result === "completed" && action === "monitor") {
    logMonitoringRoundComplete({ info: message => logger.info(message), error: message => logger.error(message) });
  }
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
