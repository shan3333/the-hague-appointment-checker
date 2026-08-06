import type { Page } from "playwright";
import type { SimulatedStatus } from "./TimelineSimulator.js";

export interface SimulationView {
  cycleNumber: number;
  previousStatus: SimulatedStatus | null;
  currentStatus: SimulatedStatus;
  notificationShouldSend: boolean;
  browserWouldOpen: boolean;
  screenshotWouldBeTaken: boolean;
  timestamp: string;
  countdownSeconds: number;
  availableDates?: string[];
  matchingDates?: string[];
  activeFilter?: string;
}

export async function renderSimulation(
  page: Page,
  status: SimulatedStatus,
  view?: SimulationView,
  appointmentDates: readonly string[] = []
): Promise<void> {
  const available = status === "AVAILABLE";
  const details: SimulationView = view ?? {
    cycleNumber: 1,
    previousStatus: null,
    currentStatus: status,
    notificationShouldSend: false,
    browserWouldOpen: false,
    screenshotWouldBeTaken: false,
    timestamp: new Date().toISOString(),
    countdownSeconds: 0
  };
  const yesNo = (value: boolean) => value ? "YES" : "NO";
  await page.setContent(`<!doctype html>
    <html lang="nl">
      <head>
        <meta charset="utf-8">
        <title>Lokale afspraaksimulatie</title>
        <style>
          body { font: 18px system-ui, sans-serif; background: #eef2f5; margin: 0; padding: 3rem 2rem; }
          main { background: white; border: 2px solid #243746; border-radius: 16px; box-shadow: 0 12px 35px #0002; margin: auto; max-width: 850px; padding: 2rem; }
          .app-title { font-size: 2rem; font-weight: 750; margin-top: 0; }
          .status { border-radius: 10px; color: white; font-size: 2rem; font-weight: 750; padding: 1.25rem; text-align: center; }
          .available { background: #168343; }
          .not-available { background: #c83232; }
          dl { display: grid; grid-template-columns: minmax(230px, 1fr) 2fr; gap: .75rem 1rem; }
          dt { color: #53626f; font-weight: 650; }
          dd { margin: 0; font-weight: 550; }
          .countdown { background: #eef7f5; border-radius: 10px; margin-top: 1.5rem; padding: 1rem; text-align: center; }
          .detector { position: absolute; height: 1px; width: 1px; overflow: hidden; clip-path: inset(50%); }
          button { font: inherit; padding: .75rem 1rem; }
        </style>
      </head>
      <body>
        <main>
          <div class="app-title" role="heading" aria-level="1">The Hague Appointment Checker</div>
          <p>Local timeline simulation — the municipality website is not contacted.</p>
          <div class="status ${details.currentStatus === "AVAILABLE" ? "available" : "not-available"}">${details.currentStatus}</div>
          <dl>
            <dt>Current cycle</dt><dd>#${details.cycleNumber}</dd>
            <dt>Previous status</dt><dd>${details.previousStatus ?? "NONE"}</dd>
            <dt>Current simulated status</dt><dd>${details.currentStatus}</dd>
            <dt>Notification should be sent</dt><dd>${yesNo(details.notificationShouldSend)}</dd>
            <dt>Browser would be opened</dt><dd>${yesNo(details.browserWouldOpen)}</dd>
            <dt>Screenshot would be taken</dt><dd>${yesNo(details.screenshotWouldBeTaken)}</dd>
            <dt>Current timestamp</dt><dd>${details.timestamp}</dd>
            <dt>Simulated appointment dates</dt><dd>${(details.availableDates ?? appointmentDates).join(", ") || "NONE"}</dd>
            <dt>Active filter</dt><dd>${details.activeFilter ?? "NONE"}</dd>
            <dt>Matching dates</dt><dd>${details.matchingDates?.join(", ") || "NONE"}</dd>
          </dl>
          <div class="countdown">Next cycle in <strong id="countdown">${details.countdownSeconds}</strong> second(s)</div>
          <div class="detector" aria-hidden="true">
            <h1>Kies plek en tijd</h1>
            <label for="date-select">Dag</label>
            <input id="date-select" placeholder="Kies een datum">
            <div role="dialog" aria-label="Kies een datum">
              ${available
                ? (appointmentDates.length > 0
                  ? appointmentDates.map(date => `<button class="duet-date__day" data-date="${date}" aria-disabled="false">${date}</button>`).join("")
                  : '<button class="duet-date__day" aria-disabled="false">Gesimuleerde datum</button>')
                : '<button class="duet-date__day" aria-disabled="true" disabled>10 augustus</button>'}
            </div>
            <p id="days-available-message">
              ${available ? "Er is een gesimuleerde dag beschikbaar" : "In deze simulatie zijn er geen dagen beschikbaar"}
            </p>
            <label for="time-select">Tijd</label>
            <select id="time-select" ${available ? "" : "disabled"}>
              <option value="">Kies tijd</option>
              ${available ? '<option value="10:00">10:00</option>' : ""}
            </select>
            <span id="notification-message" role="alert"></span>
          </div>
        </main>
        <script>
          let remaining = ${Math.max(0, Math.ceil(details.countdownSeconds))};
          const output = document.getElementById("countdown");
          setInterval(() => {
            remaining = Math.max(0, remaining - 1);
            output.textContent = String(remaining);
          }, 1000);
        </script>
      </body>
    </html>`, { waitUntil: "domcontentloaded" });
}
