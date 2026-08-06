import type { Browser } from "playwright";

export type InterruptSignal = "SIGINT" | "SIGTERM";

export interface KeepOpenConfiguration {
  action: string;
  mode: "real" | "simulate-fixed" | "simulate-timeline";
  headless: boolean;
  debugSlowMode: boolean;
  debugKeepBrowserOpenMs: number;
  simulationKeepBrowserOpenMs: number;
}

export function resolveKeepBrowserOpenMs(configuration: KeepOpenConfiguration): number {
  if (configuration.headless) return 0;
  if (configuration.action === "check" && configuration.mode === "simulate-fixed") {
    return configuration.simulationKeepBrowserOpenMs;
  }
  if (configuration.action === "monitor" && configuration.mode === "simulate-timeline") {
    return configuration.simulationKeepBrowserOpenMs;
  }
  if (configuration.action === "check" && configuration.debugSlowMode) {
    return configuration.debugKeepBrowserOpenMs;
  }
  return 0;
}

export interface BrowserCleanupDependencies {
  sleep(milliseconds: number): Promise<void>;
  waitForEnter(): Promise<void>;
  logWait(milliseconds: number): void;
  logCloseError(error: unknown): void;
  onInterrupt(handler: (signal: InterruptSignal) => void): () => void;
  terminateAfterCleanup(signal: InterruptSignal): void;
}

const defaultDependencies: BrowserCleanupDependencies = {
  sleep: milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
  waitForEnter: async () => undefined,
  logWait: () => undefined,
  logCloseError: () => undefined,
  onInterrupt: handler => {
    const onSigint = () => handler("SIGINT");
    const onSigterm = () => handler("SIGTERM");
    process.once("SIGINT", onSigint);
    process.once("SIGTERM", onSigterm);
    return () => {
      process.off("SIGINT", onSigint);
      process.off("SIGTERM", onSigterm);
    };
  },
  terminateAfterCleanup: signal => process.kill(process.pid, signal)
};

export async function closeBrowserCleanly(
  browser: Pick<Browser, "close"> | undefined,
  options: { keepOpenMs: number; pauseBeforeClose?: boolean },
  dependencies: Partial<BrowserCleanupDependencies> = {}
): Promise<void> {
  if (!browser) return;
  const deps = { ...defaultDependencies, ...dependencies };
  let interrupted: InterruptSignal | undefined;
  let resolveInterrupt: (() => void) | undefined;
  const interrupt = new Promise<void>(resolve => { resolveInterrupt = resolve; });
  const removeInterruptHandlers = deps.onInterrupt(signal => {
    interrupted = signal;
    resolveInterrupt?.();
  });
  try {
    const waits: Array<Promise<void>> = [];
    if (options.keepOpenMs > 0) {
      deps.logWait(options.keepOpenMs);
      waits.push(Promise.race([deps.sleep(options.keepOpenMs), interrupt]));
    }
    if (options.pauseBeforeClose) waits.push(Promise.race([deps.waitForEnter(), interrupt]));
    await Promise.all(waits);
  } finally {
    removeInterruptHandlers();
    await browser.close().catch(deps.logCloseError);
  }
  if (interrupted) deps.terminateAfterCleanup(interrupted);
}
