export type AppointmentStatus = "AVAILABLE" | "NOT_AVAILABLE" | "PAGE_NOT_LOADED" | "ERROR";

export interface AppointmentAvailability {
  date: string;
  location?: string;
}

export interface DomSignals {
  pageHeadingPresent: boolean;
  calendarPresent: boolean;
  loadingVisible: boolean;
  noAppointmentsText: string;
  enabledDateCount: number;
  availableTimeCount: number;
  appointmentDates: string[];
  errorText: string;
}

export interface CheckResult {
  status: AppointmentStatus;
  reason: string;
  signals?: DomSignals;
  appointmentDates?: string[];
  availabilities?: AppointmentAvailability[];
  screenshotPath?: string;
}
