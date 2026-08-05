import { chromium, type Browser, type Page } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { classifyAppointmentStatus, reasonFor } from "./classifier.js";
import { logger } from "./logger.js";
import { withRetry } from "./retry.js";
import type { CheckResult, DomSignals } from "./types.js";
import { renderSimulation } from "./simulation/renderSimulation.js";
import type { SimulatedStatus } from "./simulation/TimelineSimulator.js";
import type { SimulationView } from "./simulation/renderSimulation.js";
import { createInterface } from "node:readline/promises";

export const SELECTORS = {
  flowHeading: "main h1",
  calendarInput: "#date-select",
  noAppointments: "#days-available-message",
  availableDate: '[role="dialog"] button.duet-date__day[aria-disabled="false"]:not([disabled])',
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

async function reachCalendar(page: Page): Promise<void> {
  if (config.debugSlowMode) logger.info("Opening appointment page");
  await page.goto(config.url, { waitUntil: "domcontentloaded", timeout: config.navigationTimeoutMs });
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

export async function extractSignals(page: Page): Promise<DomSignals> {
  // A string avoids build-tool helper injection into Playwright's isolated page context.
  return page.evaluate<DomSignals>(`(() => {
    const visible = element => !!element && !!element.offsetParent;
    const text = selector => {
      const element = document.querySelector(selector);
      return visible(element) ? (element.textContent || '').trim() : '';
    };
    const dates = Array.from(document.querySelectorAll(${JSON.stringify(SELECTORS.availableDate)}))
      .filter(button => visible(button) && !button.disabled && button.getAttribute('aria-disabled') === 'false');
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
      errorText: text(${JSON.stringify(SELECTORS.error)})
    };
  })()`);
}

export interface CheckOptions {
  captureAvailabilityScreenshot?: boolean;
  simulatedStatus?: SimulatedStatus;
  simulationView?: SimulationView;
  keepBrowserOpenMs?: number;
  pauseBeforeClose?: boolean;
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
        await renderSimulation(page, options.simulatedStatus, options.simulationView);
        logger.info("Simulated calendar loaded");
      } else {
        await reachCalendar(page);
        logger.info("Calendar loaded");
      }
      if (config.debugSlowMode) logger.info("Reading availability");
      const signals = await extractSignals(page);
      const status = classifyAppointmentStatus(signals);
      if (config.debugSlowMode) logger.info(`Status detected: ${status}`);
      const result: CheckResult = { status, reason: reasonFor(signals), signals };
      if (status === "AVAILABLE" && options.captureAvailabilityScreenshot) {
        result.screenshotPath = await saveArtifacts(page, "appointment-found").catch(error => {
          logger.error("Screenshot failure", { error: String(error) });
          return undefined;
        });
      }
      if (config.debugScreenshots) await saveArtifacts(page, "debug", true).catch(error => logger.error("Debug artifact failure", { error: String(error) }));
      if (status === "PAGE_NOT_LOADED" || status === "ERROR") {
        lastDetectedFailure = result;
        throw new Error(result.reason);
      }
      return result;
    }, config.maxRetries, config.retryBackoffMs, undefined, (error, attempt) => logger.warn(`Check failed; retrying (attempt ${attempt})`, { error: String(error) }));
  } catch (error) {
    if (lastPage && config.saveLoadErrorScreenshot) await saveArtifacts(lastPage, "load-error").catch(screenshotError => logger.error("Load-error screenshot failure", { error: String(screenshotError) }));
    return lastDetectedFailure ?? { status: "PAGE_NOT_LOADED", reason: String(error) };
  } finally {
    const keepBrowserOpenMs = options.keepBrowserOpenMs ?? 0;
    if (browser && (keepBrowserOpenMs > 0 || options.pauseBeforeClose)) {
      const timedWait = keepBrowserOpenMs > 0
        ? new Promise<void>(resolve => {
            logger.info("Waiting before browser closes", { milliseconds: keepBrowserOpenMs });
            setTimeout(resolve, keepBrowserOpenMs);
          })
        : Promise.resolve();
      const enterWait = options.pauseBeforeClose ? waitForEnter() : Promise.resolve();
      await Promise.all([timedWait, enterWait]);
    }
    await browser?.close().catch(error => logger.error("Browser close failure", { error: String(error) }));
  }
}
