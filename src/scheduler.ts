import { DateTime } from "luxon";

export interface ScheduleConfig { timezone: string; monitorDays: number[]; startHour: number; endHour: number }

export function isWithinSchedule(now: Date, schedule: ScheduleConfig): boolean {
  const local = DateTime.fromJSDate(now).setZone(schedule.timezone);
  return local.isValid && schedule.monitorDays.includes(local.weekday) &&
    local.hour >= schedule.startHour && local.hour <= schedule.endHour;
}

export async function runMonitor(
  check: () => Promise<void>,
  schedule: ScheduleConfig,
  intervalMs: number,
  log: (message: string) => void
): Promise<never> {
  let running = false;
  while (true) {
    if (isWithinSchedule(new Date(), schedule)) {
      if (!running) {
        running = true;
        try { await check(); } finally { running = false; }
      }
    } else log("Outside configured monitoring window; check skipped");
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
}
