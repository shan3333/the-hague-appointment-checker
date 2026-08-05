type Level = "INFO" | "WARN" | "ERROR";

function timestamp(date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Amsterdam",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false
  }).format(date);
}

function write(level: Level, message: string, details?: unknown): void {
  const suffix = details === undefined ? "" : ` ${JSON.stringify(details)}`;
  console.log(`${timestamp()} ${level} ${message}${suffix}`);
}

export const logger = {
  info: (message: string, details?: unknown) => write("INFO", message, details),
  warn: (message: string, details?: unknown) => write("WARN", message, details),
  error: (message: string, details?: unknown) => write("ERROR", message, details)
};
