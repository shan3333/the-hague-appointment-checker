import type { AppointmentStatus, DomSignals } from "./types.js";

export function classifyAppointmentStatus(signals: DomSignals): AppointmentStatus {
  if (!signals.pageHeadingPresent || !signals.calendarPresent || signals.loadingVisible) {
    return "PAGE_NOT_LOADED";
  }
  if (signals.errorText.trim()) return "ERROR";
  if (signals.enabledDateCount > 0 || signals.availableTimeCount > 0) return "AVAILABLE";
  if (/geen\s+dagen\s+beschikbaar/i.test(signals.noAppointmentsText)) return "NOT_AVAILABLE";
  return "PAGE_NOT_LOADED";
}

export function reasonFor(signals: DomSignals): string {
  if (signals.enabledDateCount > 0) return `${signals.enabledDateCount} selectable date(s) detected`;
  if (signals.availableTimeCount > 0) return `${signals.availableTimeCount} selectable time(s) detected`;
  if (signals.errorText.trim()) return `Page error: ${signals.errorText.trim()}`;
  if (signals.noAppointmentsText.trim()) return signals.noAppointmentsText.trim();
  return "Calendar did not reach a recognized complete state";
}
