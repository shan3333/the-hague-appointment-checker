import { chromium, type Browser, type Page } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { classifyAppointmentStatus, reasonFor } from "./classifier.js";
import { logger } from "./logger.js";
import { withRetry } from "./retry.js";
import type { AppointmentAvailability, CheckResult, DomSignals } from "./types.js";
import { renderSimulation } from "./simulation/renderSimulation.js";
import type { SimulatedStatus } from "./simulation/TimelineSimulator.js";
import type { SimulationView } from "./simulation/renderSimulation.js";
import { closeBrowserCleanly } from "./browserLifecycle.js";
import { captureCheckArtifacts } from "./artifactCapture.js";
import { createInterface } from "node:readline/promises";

export const SELECTORS = {
  flowHeading: "main h1",
  calendarInput: "#date-select",
  noAppointments: "#days-available-message",
  availableDate: '[role="dialog"] button.duet-date__day:not([disabled]):not([aria-disabled="true"]):not(.is-disabled)',
  location: "button.location-list-item",
  locationName: "button.location-list-item h2",
  changeLocation: "button.edit-button",
  timeSelect: "#time-select",
  availableTime: '#time-select option[value]:not([value=""]):not([disabled])',
  loading: '[role="status"]',
  error: '#notification-message[role="alert"]'
} as const;

function stamp(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: config.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
    .format(new Date()).replace(" ", "-").replaceAll(":", "-");
}

async function saveArtifacts(page: Page, prefix: string, html = false): Promise<string> {
  await mkdir(config.screenshotDir, { recursive: true });
  const base = path.join(config.screenshotDir, `${prefix}-${stamp()}`);
  await page.screenshot({ path: `${base}.png`, fullPage: true });
  if (html) await writeFile(`${base}.html`, await page.content(), "utf8");
  return `${base}.png`;
}

async function reachCalendar(page: Page, bookingUrl: string): Promise<void> {
  if (config.debugSlowMode) logger.info("Opening appointment page");
  await page.goto(bookingUrl, { waitUntil: "domcontentloaded", timeout: config.navigationTimeoutMs });
  await page.waitForLoadState("networkidle", { timeout: config.navigationTimeoutMs }).catch(() => undefined);
  const heading = page.locator(SELECTORS.flowHeading);
  await heading.waitFor({ state: "visible", timeout: config.selectorTimeoutMs });
  if (await page.getByRole("heading", { name: /Kies wat u wilt regelen/i }).isVisible().catch(() => false)) {
    const next = page.getByRole("button", { name: "Volgende stap", exact: true });
    await next.waitFor({ state: "visible", timeout: config.selectorTimeoutMs });
    await next.click();
  }
  if (config.debugSlowMode) logger.info("Waiting for calendar");
  await page.getByRole("heading", { name: /Kies plek en tijd/i }).waitFor({ state: "visible", timeout: config.selectorTimeoutMs });
  await page.locator(SELECTORS.calendarInput).waitFor({ state: "visible", timeout: config.selectorTimeoutMs });
  await Promise.race([
    page.locator(SELECTORS.noAppointments).waitFor({ state: "visible", timeout: config.selectorTimeoutMs }),
    page.locator(SELECTORS.availableDate).first().waitFor({ state: "visible", timeout: config.selectorTimeoutMs }),
    page.locator(SELECTORS.availableTime).first().waitFor({ state: "attached", timeout: config.selectorTimeoutMs }),
    page.locator(SELECTORS.error).filter({ hasText: /\S/ }).waitFor({ state: "visible", timeout: config.selectorTimeoutMs })
  ]);
  const loader = page.locator(SELECTORS.loading).filter({ hasText: /Laden/i });
  if (await loader.count()) await loader.first().waitFor({ state: "hidden", timeout: config.selectorTimeoutMs });
}

async function reachPlaceAndTime(page: Page, bookingUrl: string): Promise<void> {
  await page.goto(bookingUrl, { waitUntil: "domcontentloaded", timeout: config.navigationTimeoutMs });
  await page.waitForLoadState("networkidle", { timeout: config.navigationTimeoutMs }).catch(() => undefined);
  await page.locator(SELECTORS.flowHeading).waitFor({ state: "visible", timeout: config.selectorTimeoutMs });
  if (await page.getByRole("heading", { name: /Kies wat u wilt regelen/i }).isVisible().catch(() => false)) {
    const next = page.getByRole("button", { name: "Volgende stap", exact: true });
    await next.waitFor({ state: "visible", timeout: config.selectorTimeoutMs });
    await next.click();
  }
  await page.getByRole("heading", { name: /Kies plek en tijd/i }).waitFor({ state: "visible", timeout: config.selectorTimeoutMs });
}

async function waitForCalendarResult(page: Page): Promise<void> {
  await page.locator(SELECTORS.calendarInput).waitFor({ state: "visible", timeout: config.selectorTimeoutMs });
  const loader = page.locator(SELECTORS.loading).filter({ hasText: /Laden/i });
  if (await loader.count()) await loader.first().waitFor({ state: "hidden", timeout: config.selectorTimeoutMs });
  // Aurelia keeps hidden/stale calendar controls mounted while switching locations.
  // Waiting for the loader plus a short render turn is more reliable than racing
  // mutually exclusive locators, whose losing waits can reject first.
  await page.waitForTimeout(500);
}

export async function extractSignals(page: Page): Promise<DomSignals> {
  // A string avoids build-tool helper injection into Playwright's isolated page context.
  return page.evaluate<DomSignals>(String.raw`(() => {
    const visible = element => !!element && !!element.offsetParent;
    const text = selector => {
      const element = document.querySelector(selector);
      return visible(element) ? (element.textContent || '').trim() : '';
    };
    const dates = Array.from(document.querySelectorAll(${JSON.stringify(SELECTORS.availableDate)}))
      .filter(button => !button.disabled && button.getAttribute('aria-disabled') !== 'true' && !button.classList.contains('is-disabled'));
    const monthNumbers = {
      januari: '01', februari: '02', maart: '03', april: '04', mei: '05', juni: '06',
      juli: '07', augustus: '08', september: '09', oktober: '10', november: '11', december: '12'
    };
    const normalizeDate = (raw, fallbackYear) => {
      const value = (raw || '').trim().toLowerCase();
      let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
      if (match) return value;
      match = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(value);
      if (match) return match[3] + '-' + match[2].padStart(2, '0') + '-' + match[1].padStart(2, '0');
      match = /(?:\w+,\s*)?(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?/.exec(value);
      if (!match || !monthNumbers[match[2]] || !(match[3] || fallbackYear)) return '';
      return (match[3] || fallbackYear) + '-' + monthNumbers[match[2]] + '-' + match[1].padStart(2, '0');
    };
    const selectedInput = document.querySelector(${JSON.stringify(SELECTORS.calendarInput)});
    const headerText = (document.querySelector('.duet-date__select-label') || {}).textContent || '';
    const displayedYear = (/\b(\d{4})\b/.exec(headerText + ' ' + (selectedInput?.value || '')) || [])[1] || '';
    const selectedAccessibleText = (document.querySelector('#selected-date-sr-only') || {}).textContent || '';
    const appointmentDates = [
      normalizeDate(selectedInput && selectedInput.value, displayedYear),
      normalizeDate(selectedInput?.value ? selectedAccessibleText : '', displayedYear),
      ...dates.map(button => normalizeDate(
        button.getAttribute('data-date') || button.value || button.querySelector('.duet-date__vhidden')?.textContent || button.textContent || '',
        displayedYear
      ))
    ].filter(Boolean).filter((value, index, all) => all.indexOf(value) === index).sort();
    const time = document.querySelector(${JSON.stringify(SELECTORS.timeSelect)});
    const times = time && visible(time) && !time.disabled
      ? Array.from(time.options).filter(option =>
          !option.disabled &&
          !!option.value.trim() &&
          !/^kies tijd$/i.test((option.textContent || '').trim())
        ).length : 0;
    const heading = (document.querySelector(${JSON.stringify(SELECTORS.flowHeading)}) || {}).textContent || '';
    const loader = Array.from(document.querySelectorAll(${JSON.stringify(SELECTORS.loading)}))
      .some(element => visible(element) && /Laden/i.test(element.textContent || ''));
    return {
      pageHeadingPresent: /Kies plek en tijd/i.test(heading),
      calendarPresent: visible(document.querySelector(${JSON.stringify(SELECTORS.calendarInput)})) && !!time,
      loadingVisible: loader,
      noAppointmentsText: text(${JSON.stringify(SELECTORS.noAppointments)}),
      enabledDateCount: dates.length,
      availableTimeCount: times,
      appointmentDates,
      errorText: text(${JSON.stringify(SELECTORS.error)})
    };
  })()`);
}

export interface CheckOptions {
  bookingUrl?: string;
  captureAvailabilityScreenshot?: boolean;
  shouldCaptureAvailabilityScreenshot?: (appointmentDates: readonly string[]) => boolean;
  simulatedStatus?: SimulatedStatus;
  simulatedAppointmentDates?: string[];
  simulationView?: SimulationView;
  keepBrowserOpenMs?: number;
  pauseBeforeClose?: boolean;
  multipleLocations?: boolean;
}

async function inspectLocations(page: Page): Promise<{ signals: DomSignals; availabilities: AppointmentAvailability[] }> {
  await page.locator(SELECTORS.location).first().waitFor({ state: "visible", timeout: config.selectorTimeoutMs });
  const locationNames = (await page.locator(SELECTORS.locationName).allTextContents()).map(name => name.trim());
  const availabilities: AppointmentAvailability[] = [];
  const locationSignals: DomSignals[] = [];
  for (let index = 0; index < locationNames.length; index += 1) {
    const location = locationNames[index]!;
    await page.locator(SELECTORS.location).nth(index).click();
    await waitForCalendarResult(page);
    const calendarToggle = page.getByRole("button", { name: /Klik hier om de kalender te openen/i });
    if (await calendarToggle.isVisible().catch(() => false)) {
      await calendarToggle.click({ force: true });
      await page.waitForTimeout(250);
    }
    const signals = await extractSignals(page);
    locationSignals.push(signals);
    availabilities.push(...signals.appointmentDates.map(date => ({ date, location })));
    if (index < locationNames.length - 1) {
      const closeCalendar = page.locator("button.duet-date__close");
      if (await closeCalendar.isVisible().catch(() => false)) await closeCalendar.click();
      await page.locator(SELECTORS.changeLocation).click();
      await page.locator(SELECTORS.location).first().waitFor({ state: "visible", timeout: config.selectorTimeoutMs });
    }
  }
  const definitive = locationSignals.every(signal => classifyAppointmentStatus(signal) === "NOT_AVAILABLE");
  const failed = locationSignals.find(signal => ["ERROR", "PAGE_NOT_LOADED"].includes(classifyAppointmentStatus(signal)));
  const template = failed ?? locationSignals[locationSignals.length - 1];
  if (!template) throw new Error("No appointment locations were found");
  const dates = availabilities.map(item => item.date);
  return {
    availabilities,
    signals: {
      ...template,
      pageHeadingPresent: true,
      calendarPresent: true,
      loadingVisible: false,
      enabledDateCount: availabilities.length,
      appointmentDates: [...new Set(dates)].sort(),
      noAppointmentsText: definitive ? "Geen dagen beschikbaar op alle locaties" : template.noAppointmentsText
    }
  };
}

async function waitForEnter(): Promise<void> {
  if (!process.stdin.isTTY) {
    logger.warn("Cannot pause for Enter because stdin is not interactive");
    return;
  }
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    await prompt.question("Press Enter to continue to the next simulation cycle...");
  } finally {
    prompt.close();
  }
}

export async function checkOnce(options: CheckOptions = {}): Promise<CheckResult> {
  let browser: Browser | undefined;
  let lastPage: Page | undefined;
  let lastDetectedFailure: CheckResult | undefined;
  try {
    return await withRetry(async () => {
      lastDetectedFailure = undefined;
      await browser?.close().catch(() => undefined);
      browser = config.debugSlowMode
        ? await chromium.launch({
            headless: false,
            slowMo: config.debugStepDelayMs
          })
        : await chromium.launch({ headless: config.headless });
      const page = await browser.newPage();
      lastPage = page;
      if (options.simulatedStatus) {
        logger.info(`Simulation mode enabled: ${options.simulatedStatus}`);
        await renderSimulation(page, options.simulatedStatus, options.simulationView, options.simulatedAppointmentDates);
        logger.info("Simulated calendar loaded");
      } else {
        if (!options.bookingUrl) throw new Error("A booking URL is required for a real availability check");
        if (options.multipleLocations) await reachPlaceAndTime(page, options.bookingUrl);
        else await reachCalendar(page, options.bookingUrl);
        logger.info("Calendar loaded");
      }
      if (config.debugSlowMode) logger.info("Reading availability");
      const locationResult = options.multipleLocations ? await inspectLocations(page) : undefined;
      const signals = locationResult?.signals ?? await extractSignals(page);
      const status = classifyAppointmentStatus(signals);
      if (config.debugSlowMode) logger.info(`Status detected: ${status}`);
      const result: CheckResult = {
        status, reason: reasonFor(signals), signals, appointmentDates: signals.appointmentDates,
        availabilities: locationResult?.availabilities ?? signals.appointmentDates.map(date => ({ date }))
      };
      const screenshotMatches = options.shouldCaptureAvailabilityScreenshot?.(signals.appointmentDates) ?? true;
      const artifacts = await captureCheckArtifacts({
        status,
        screenshotMatches,
        debugArtifactsEnabled: config.debugScreenshots,
        availabilityScreenshotRequested: options.captureAvailabilityScreenshot ?? false
      }, async (prefix, includeHtml) => saveArtifacts(page, prefix, includeHtml).catch(error => {
        logger.error(prefix === "debug" ? "Debug artifact failure" : "Screenshot failure", { error: String(error) });
        return undefined;
      }));
      result.screenshotPath = artifacts.screenshotPath;
      if (artifacts.debugArtifactPath) logger.info("Debug screenshot and rendered HTML saved", { path: artifacts.debugArtifactPath });
      if (status === "PAGE_NOT_LOADED" || status === "ERROR") {
        lastDetectedFailure = result;
        throw new Error(result.reason);
      }
      return result;
    }, config.maxRetries, config.retryBackoffMs, undefined, (error, attempt) => logger.warn(`Check failed; retrying (attempt ${attempt})`, { error: String(error) }));
  } catch (error) {
    if (lastPage && config.saveLoadErrorScreenshot) await saveArtifacts(lastPage, "load-error").catch(screenshotError => logger.error("Load-error screenshot failure", { error: String(screenshotError) }));
    return lastDetectedFailure ?? { status: "PAGE_NOT_LOADED", reason: String(error), appointmentDates: [] };
  } finally {
    await closeBrowserCleanly(browser, {
      keepOpenMs: options.keepBrowserOpenMs ?? 0,
      pauseBeforeClose: options.pauseBeforeClose
    }, {
      waitForEnter,
      logWait: milliseconds => logger.info("Waiting before browser closes", { milliseconds }),
      logCloseError: error => logger.error("Browser close failure", { error: String(error) })
    });
  }
}
