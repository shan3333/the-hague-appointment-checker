import "dotenv/config";
import path from "node:path";
import type { NotificationProviderSetting } from "./notifications/NotificationProvider.js";
import { parseDateOnly } from "./dateFilter.js";

if (process.env.SIMULATION_MODE !== undefined) {
  throw new Error("SIMULATION_MODE was removed; use APPOINTMENT_MODE=simulate-timeline instead");
}

function boolean(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false`);
}

function number(name: string, fallback: number, min = 0): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value < min) throw new Error(`${name} must be a number >= ${min}`);
  return value;
}

function hour(name: string, fallback: number): number {
  const value = number(name, fallback);
  if (!Number.isInteger(value) || value > 23) throw new Error(`${name} must be an integer from 0 to 23`);
  return value;
}

function integer(name: string, fallback: number, min: number, max: number): number {
  const value = number(name, fallback, min);
  if (!Number.isInteger(value) || value > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}

const monitorDays = (process.env.MONITOR_DAYS ?? "1,2,3,4,5").split(",").map(Number);
if (monitorDays.some(day => !Number.isInteger(day) || day < 1 || day > 7)) {
  throw new Error("MONITOR_DAYS must contain ISO weekdays 1 through 7");
}

const appointmentMode = process.env.APPOINTMENT_MODE?.trim().toLowerCase();
if (!appointmentMode || !["real", "simulate-fixed", "simulate-timeline"].includes(appointmentMode)) {
  throw new Error("APPOINTMENT_MODE is required: real, simulate-fixed, or simulate-timeline");
}
const rawSimulateStatus = process.env.SIMULATE_STATUS?.trim().toUpperCase();
if (appointmentMode === "simulate-fixed" && rawSimulateStatus !== "AVAILABLE" && rawSimulateStatus !== "NOT_AVAILABLE") {
  throw new Error("APPOINTMENT_MODE=simulate-fixed requires SIMULATE_STATUS=AVAILABLE or NOT_AVAILABLE");
}
const simulationSequence = (process.env.SIMULATION_SEQUENCE ?? "")
  .split(",")
  .map(value => value.trim().toUpperCase())
  .filter(Boolean);
if (appointmentMode === "simulate-timeline") {
  if (simulationSequence.length === 0) throw new Error("SIMULATION_SEQUENCE is required in timeline mode");
  if (simulationSequence.some(status => status !== "AVAILABLE" && status !== "NOT_AVAILABLE")) {
    throw new Error("SIMULATION_SEQUENCE may contain only AVAILABLE and NOT_AVAILABLE");
  }
}

function appointmentDates(name: string, raw: string | undefined): string[] {
  const dates = (raw ?? "").split(",").map(value => value.trim()).filter(Boolean);
  const invalid = dates.find(date => !parseDateOnly(date));
  if (invalid) throw new Error(`${name} contains an invalid YYYY-MM-DD date: ${invalid}`);
  return dates;
}

const simulateAppointmentDates = appointmentDates("SIMULATE_APPOINTMENT_DATES", process.env.SIMULATE_APPOINTMENT_DATES);
const simulationDateSequence = (process.env.SIMULATION_DATE_SEQUENCE ?? "")
  .split(";")
  .filter(value => value.length > 0)
  .map((value, index) => value.trim() === "-"
    ? []
    : appointmentDates(`SIMULATION_DATE_SEQUENCE cycle ${index + 1}`, value));

const notificationProvider = (process.env.NOTIFICATION_PROVIDER?.trim().toLowerCase() || "auto") as NotificationProviderSetting;
const notificationProviders: NotificationProviderSetting[] = ["auto", "telegram", "email", "discord", "slack"];
if (!notificationProviders.includes(notificationProvider)) {
  throw new Error(`NOTIFICATION_PROVIDER must be one of: ${notificationProviders.join(", ")}`);
}

export const config = {
  url: process.env.APPOINTMENT_URL ?? "https://denhaag.mijnafspraakmaken.nl/?product=35",
  appointmentMode,
  simulateStatus: rawSimulateStatus as "AVAILABLE" | "NOT_AVAILABLE" | undefined,
  simulationSequence: simulationSequence as Array<"AVAILABLE" | "NOT_AVAILABLE">,
  simulationRepeat: boolean("SIMULATION_REPEAT", true),
  simulateAppointmentDates,
  simulationDateSequence,
  checkIntervalMinutes: number("CHECK_INTERVAL_MINUTES", 5, 0.1),
  simulationIntervalSeconds: number("SIMULATION_INTERVAL_SECONDS", 5, 0.1),
  simulationKeepBrowserOpenMs: number("SIMULATION_KEEP_BROWSER_OPEN_MS", 30_000),
  simulationPauseBeforeClose: boolean("SIMULATION_PAUSE_BEFORE_CLOSE", false),
  headless: boolean("HEADLESS", true),
  debugSlowMode: boolean("DEBUG_SLOW_MODE", false),
  debugStepDelayMs: number("DEBUG_STEP_DELAY_MS", 2_000),
  debugKeepBrowserOpenMs: number("DEBUG_KEEP_BROWSER_OPEN_MS", 15_000),
  enableDesktopNotification: boolean("ENABLE_DESKTOP_NOTIFICATION", true),
  enableSound: boolean("ENABLE_SOUND", true),
  notificationProvider,
  enableOpenBrowser: boolean("ENABLE_OPEN_BROWSER", true),
  enableScreenshot: boolean("ENABLE_SCREENSHOT", true),
  debugScreenshots: boolean("DEBUG_SCREENSHOTS", false),
  saveLoadErrorScreenshot: boolean("SAVE_LOAD_ERROR_SCREENSHOT", true),
  timezone: process.env.MONITOR_TIMEZONE ?? "Europe/Amsterdam",
  monitorDays,
  startHour: hour("MONITOR_START_HOUR", 8),
  endHour: hour("MONITOR_END_HOUR", 22),
  navigationTimeoutMs: number("NAVIGATION_TIMEOUT_MS", 30_000, 1_000),
  selectorTimeoutMs: number("SELECTOR_TIMEOUT_MS", 30_000, 1_000),
  maxRetries: integer("MAX_RETRIES", 2, 0, 2),
  retryBackoffMs: number("RETRY_BACKOFF_MS", 5_000),
  statePath: path.resolve("data/state.json"),
  simulationStatePath: path.resolve("data/simulation-state.json"),
  screenshotDir: path.resolve("screenshots")
};
