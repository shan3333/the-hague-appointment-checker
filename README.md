# The Hague Appointment Checker

A small, local Node.js and Playwright tool that detects possible appointment
availability on The Hague appointment website. It reports availability and can
notify you, but it never books, confirms, or submits an appointment.

> **Independent project:** This software is not affiliated with, endorsed by, or
> operated by the Municipality of The Hague. Website behaviour and selectors can
> change without notice. Use it respectfully and verify any result yourself.

## Supported platforms

- macOS, including Apple Silicon and Intel
- Windows 10/11
- Desktop Linux with `notify-send`, or the `node-notifier` fallback

Node.js 20 or newer and Playwright Chromium are required.

## Quick start

```bash
npm install
npx playwright install chromium
cp .env.example .env
npm run check
```

This performs one headless check against the real appointment website and exits.
The legacy single-user commands monitor product 35. Multi-customer mode selects
the booking target from each customer's required `service` field.
On Windows PowerShell, replace the copy command with:

```powershell
Copy-Item .env.example .env
```

To test locally without using the municipality website as the availability
source, set `SIMULATE_STATUS=NOT_AVAILABLE` or `AVAILABLE` in `.env`, then run:

```bash
npm run check:simulate
```

Start continuous real monitoring with `npm run monitor:real`, or run the visual
timeline simulator with `npm run monitor:simulate`. Stop either monitor with
`Ctrl+C`.

## Install

```bash
npm install
npx playwright install chromium
cp .env.example .env
```

On Windows PowerShell, use `Copy-Item .env.example .env` instead of `cp`.
The checked-in npm lockfile makes `npm ci` preferable in CI and clean checkouts.

## Important modes

`APPOINTMENT_MODE` is the only mode selector:

- `real` uses the municipality website.
- `simulate-fixed` requires `SIMULATE_STATUS=AVAILABLE` or `NOT_AVAILABLE`.
- `simulate-timeline` loads the date-driven scenario selected by `SIMULATION_SCENARIO`.

The npm commands below explicitly select their mode, so simulation settings in
`.env` cannot change a real command into a simulated one. The removed legacy
`SIMULATION_MODE` variable causes a clear startup error.

## Command reference

| Command | Behaviour |
|---|---|
| `npm run check` | One headless real-website check, then exit |
| `npm run check:simulate` | One fixed simulated check using `SIMULATE_STATUS` |
| `npm run monitor:real` | Repeated headless real checks inside the configured schedule |
| `npm run monitor:simulate` | Local scenario simulation using service-specific rounds |
| `npm run telegram:listen` | Long-poll Telegram for real customer feedback buttons |
| `npm run customer:activate -- <id>` | Activate one real customer's monitoring |
| `npm run customer:booked -- <id>` | Mark one real customer booked and stop monitoring |
| `npm run customer:stop -- <id>` | Stop one real customer without recording a booking |
| `npm run debug` | Visible one-shot inspection at normal speed; saves a screenshot and rendered HTML |
| `npm run debug:slow` | Visible one-shot inspection with slowed actions, verbose step logs, debug artifacts, and temporary keep-open |
| `npm run debug:foreign-documents` | One safe product-15 check across all locations; prints location-aware availability and does not notify or monitor |
| `npm run help` | Print CLI commands without checking the website |
| `npm run test-notification` | Send a production-style fake appointment alert through enabled channels |
| `npm run reset-state` | Safely reset simulation and test-notification state |
| `npm run reset-state:simulation` | Reset only simulation timeline and simulation customer state |
| `npm run reset-state:test` | Reset only synthetic test-notification state |
| `npm run typecheck` | Validate TypeScript without emitting files |
| `npm test` | Run all unit tests once |
| `npm run build` | Compile production JavaScript into `dist/` |

Stop either monitor with `Ctrl+C`.

## Appointment date filters

Existing check, monitor, and debug commands accept one optional date filter. npm
requires the `--` separator before arguments forwarded to the checker:

```bash
npm run check -- --within 7d
npm run check -- --within 2w
npm run check -- --within 1m
npm run check -- --before 2026-09-01
npm run check -- --between 2026-08-15 2026-09-01
npm run monitor:real -- --within 30d
npm run monitor:real -- --between 2026-08-15 2026-09-01
npm run monitor:simulate -- --between 2026-08-15 2026-09-01
```

The same syntax works with `check:simulate`, `monitor:simulate`, `debug`, and
`debug:slow`. PowerShell uses the same npm syntax.

- `d` means calendar days, `w` means seven-day calendar weeks, and `m` means
  calendar months.
- `--within`, `--before`, and no-filter ranges start today in `MONITOR_TIMEZONE`; `--between` uses its explicit start. Boundaries are inclusive, and past appointments are always ignored.
- `--within 7d` includes today through today plus seven calendar days.
- `--before 2026-09-01` includes appointments on 1 September.
- `--between 2026-08-15 2026-09-01` uses strict `YYYY-MM-DD` dates and includes both the start and end dates.
- Calendar-month arithmetic clamps at month end: 31 January plus one month is
  28 February, or 29 February in a leap year.
- Dates before today are ignored.
- Without a filter, any parsed future appointment is accepted. Legacy availability
  without a parseable date remains accepted for backward compatibility.
- Only one of `--within`, `--before`, or `--between` may be used. Invalid, missing, reversed, or impossible dates stop before Chromium launches.
- npm requires the `--` argument separator shown above. Windows PowerShell uses the same command syntax.

When a filter is active, alerts, browser opening, and availability state use only
matching dates. Filtered and debug runs log all parsed, matching, and rejected
dates. The current notification policy remains one notification on every completed
cycle that has a matching appointment. One-shot `check`, `debug`, and `debug:slow`
runs therefore also notify whenever they detect matching availability, even when
the saved status and matching dates are unchanged.

## Supported BRP services

| Service ID | Appointment | Product |
|---|---|---:|
| `brp_existing_bsn` | Register again in BRP — existing BSN | 35 |
| `brp_dutch_first_registration` | First BRP registration — Dutch citizen | 27 |
| `brp_eu_eea_swiss_first_registration` | First BRP registration — EU/EEA/Swiss citizen | 28 |
| `brp_residence_permit_first_registration` | First BRP registration — residence permit holder | 30 |
| `brp_foreign_documents` | Register foreign documents in the BRP | 15 |

Product 15 is location-aware. Availability is represented internally as
`{ date: string; location?: string }`; the optional location keeps all existing
single-location services compatible. The checker discovers every location,
selects them sequentially, waits for each calendar result, and combines the
dates. Customer filters are applied to the combined availability, and the
location for the earliest matching appointment is included in the alert.

To inspect product 15 once without enabling monitoring or sending notifications,
run:

```bash
npm run debug:foreign-documents
```

The observed flow uses `button.location-list-item` for location choices, an `h2`
inside each choice for its name, and the accessible calendar title
`Datum is beschikbaar`. Selecting a location replaces the list with its calendar;
`Wijzig locatie` returns to the list. These stable semantic labels are preferred,
but municipality markup can change without notice.

## Multi-customer monitoring MVP

Multi-customer mode uses one Telegram bot. Each customer selects one supported
service and can use a separate chat, date filter, and expiry date. Each cycle
groups active customers by service, performs one website check per active service,
parses its dates once, and reuses that result for every customer in that group.
N customers across M active services therefore cause exactly M municipality
checks (at most four), not N. Services with no active customers are not checked.

Enable it explicitly with `--customers`:

```bash
cp config/customers.example.json config/customers.json
npm run monitor:real -- --customers
```

Set `TELEGRAM_BOT_TOKEN` in `.env`. Multi-customer mode uses each customer's
`chatId`; the global `TELEGRAM_CHAT_ID` remains the destination for existing
single-user notifications and is not required by `--customers`.

Real multi-customer mode loads only `config/customers.json`. It never falls back
to simulation customers. That local file is ignored by Git; the committed
`config/customers.example.json` contains synthetic IDs only. Set a different real
path with `CUSTOMERS_CONFIG_PATH` if needed.

The selected customer file is reloaded and fully validated at the beginning of
every monitoring cycle. Customer additions and changes to filters, `enabled`,
`expiresAt`, or `chatId` therefore take effect on the next cycle without a process
restart. If a reload fails, that cycle fails closed: stale customer data is not
used, no browser check or alert occurs, and the monitor retries normally on the
next scheduled cycle.

```json
[
  {
    "id": "customer-001",
    "service": "brp_eu_eea_swiss_first_registration",
    "chatId": "-1001111111111",
    "enabled": true,
    "filter": { "type": "before", "date": "2026-09-01" },
    "expiresAt": "2026-09-07"
  },
  {
    "id": "customer-002",
    "service": "brp_existing_bsn",
    "chatId": "-1002222222222",
    "enabled": true,
    "filter": { "type": "between", "start": "2026-09-01", "end": "2026-09-30" },
    "expiresAt": "2026-09-07"
  },
  {
    "id": "customer-003",
    "service": "brp_residence_permit_first_registration",
    "chatId": "-1003333333333",
    "enabled": true,
    "filter": { "type": "within", "value": "1m" },
    "expiresAt": "2026-09-07"
  }
]
```

Required fields are `id`, `service`, `chatId`, `enabled`, `filter`, and `expiresAt`.
Customer IDs must be unique. Filters use the exact validation and inclusive date
boundaries of `--before`, `--within`, and `--between`.

`service` must be one of the five supported IDs above. Missing or unknown values
fail validation and include the customer ID in the error. There is deliberately
no fallback to product 35.

`expiresAt` is an inclusive calendar date in `MONITOR_TIMEZONE` (Europe/Amsterdam
by default). A customer remains active through 23:59:59 on that date and is
skipped beginning the following local calendar day. Disabled and expired entries
remain in the file but receive no alerts.

Multi-customer alerts use per-customer state in `data/customer-state.json`:

```json
{
  "customers": {
    "customer-001": {
      "service": "brp_eu_eea_swiss_first_registration",
      "lastMatchingDates": ["2026-08-20"],
      "lastCheckedAt": "2026-08-07T10:00:00.000Z",
      "lastNotifiedAt": "2026-08-07T10:00:00.000Z",
      "expiryNotificationSent": false
    }
  }
}
```

The first match sends an alert containing that service's official booking URL.
An unchanged set of matching dates is suppressed;
changed dates, a newly earlier date, or a match after a no-match cycle sends a new
alert. State is independent by customer and service, so changing a customer ID's
service starts availability deduplication fresh. A failed Telegram delivery for one
customer does not stop evaluation of the others and is retried on a later cycle.
There is deliberately no global command for resetting this real customer state.
Real lifecycle outcomes change through explicit customer operations such as
`customer:activate` and Telegram booking feedback; customer configuration files
are never mutated by state commands.

### Booking feedback buttons

Real multi-customer appointment alerts include **I booked it** and **Keep
looking** buttons. Start the independent callback listener alongside the monitor:

```bash
npm run monitor:real -- --customers
npm run telegram:listen
```

The listener uses Telegram `getUpdates` long polling and the real customer
configuration only. It verifies that the callback chat matches the configured
customer. **I booked it** records the alert response and confirmation time, sets
the customer's runtime status to `booked`, and excludes that customer from later
checks. **Keep looking** records the unsuccessful alert and leaves the customer
active. Old and duplicate button presses are handled without reactivating a
customer.

Runtime outcomes and the minimal per-alert history live in
`data/customer-state.json`; configuration remains in `config/customers.json`.
Simulation uses `data/simulation-customer-state.json`, so simulated monitoring
and activation cannot modify real booking outcomes. The success reply is the
exported `BOOKED_CONFIRMATION_MESSAGE` constant in `src/telegram-listener.ts`,
which is the intended place to append a Tally URL later.

For a systemd deployment, keep monitoring and callback polling independent. A
second unit can use the same working directory, environment file, Node user, and
restart policy as the existing monitor unit, with this command:

```ini
[Unit]
Description=The Hague appointment Telegram feedback listener
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/absolute/path/to/the-hague-appointment-checker
EnvironmentFile=/absolute/path/to/the-hague-appointment-checker/.env
ExecStart=/usr/bin/npm run telegram:listen
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Review the absolute paths and service user for the host before installing this
as `appointment-telegram.service`. The monitor does not depend on the listener,
so Telegram polling failures cannot stop appointment checks.

Simulation multi-customer mode loads only `config/customers.simulation.json` and
never falls back to `config/customers.json`. Create it from the simulation-only
example and use synthetic or dedicated test chat IDs:

```bash
cp config/customers.simulation.example.json config/customers.simulation.json
npm run monitor:simulate -- --customers
```

Both `config/customers.simulation.json` and the real customer file are ignored by
Git. Override only the simulation path with `SIMULATION_CUSTOMERS_CONFIG_PATH`.
If the required mode-specific file is missing, startup fails and names the exact
file to create; there is deliberately no cross-mode fallback. The checked-in
simulation example contains fake customer and Telegram chat IDs only.
Keep only synthetic or dedicated test destinations in the local simulation file;
never reuse real customer group IDs there.

`--customers` cannot be combined with a CLI `--within`, `--before`, or `--between`
filter. Without `--customers`, all existing single-user behavior remains unchanged,
including desktop notifications and its once-per-available-cycle policy. Customer
alerts do not reserve an appointment and never attempt a booking.

### Customer lifecycle notifications

After creating a customer's Telegram group, adding the bot, obtaining the chat
ID, and validating `config/customers.json`, manually send a real activation
confirmation with:

```bash
npm run customer:activate -- customer-001
```

The command always loads the real customer configuration. It sends only to the
selected customer and refuses unknown, disabled, or expired customers. Merely
adding a customer to the JSON file never sends an activation message.

If a customer does not use the Telegram feedback buttons, update only that real
customer through an explicit administrative command:

```bash
npm run customer:booked -- customer-001
npm run customer:stop -- customer-001
```

`customer:booked` records `bookedAt` and a manual status source.
`customer:stop` records `stoppedAt` without classifying the outcome as a booking.
Both preserve activation data, alert history, and unrelated customer records;
both use the coordinated runtime-state update used by the Telegram listener.
Repeating the same operation is safe and retains the original timestamp.
Transitions from another inactive status, including `expired`, are rejected.
These commands always load `config/customers.json` and modify only
`data/customer-state.json`; simulation, test-notification, and global appointment
state are not touched.

To test activation safely with simulation customers only:

```bash
npm run customer:activate:simulate -- simulation-customer-a
```

This command is restricted to `config/customers.simulation.json` and clearly
labels the notification as simulation. Neither lifecycle command falls back to
the other mode's configuration.

When an enabled customer passes the inclusive `expiresAt` date, the customer is
excluded from appointment matching and receives one monitoring-ended message.
Successful delivery sets `expiryNotificationSent` in the local customer state,
so later cycles do not resend it. A failed delivery is logged, remains eligible
for retry on a later cycle, and does not stop other customers from being
processed. Customer configuration is never modified automatically.

For timeline testing, define service availability by round in `config/simulation.json`, then run:

```bash
npm run monitor:simulate -- --between 2026-08-15 2026-09-01
```

Each round contains a `services` object whose keys are supported service IDs and
whose values are arrays of ISO dates. Empty or omitted service arrays mean
`NOT_AVAILABLE`; non-empty arrays mean `AVAILABLE`.

## Configuration

Copy `.env.example` to `.env`, then edit the local copy. `.env` is ignored by
Git. The example is organized by target, real schedule, browser/reliability,
notifications, debugging, fixed simulation, and timeline simulation.

### Real monitoring

```dotenv
APPOINTMENT_MODE=real
CHECK_INTERVAL_MINUTES=5
MONITOR_TIMEZONE=Europe/Amsterdam
MONITOR_DAYS=1,2,3,4,5
MONITOR_START_HOUR=8
MONITOR_END_HOUR=22
HEADLESS=true
```

Weekdays use ISO values: Monday is `1`, Sunday is `7`. The default monitoring
window is Monday–Friday, 08:00 through 22:59 in Europe/Amsterdam. Checks never
overlap and each check uses one browser session. A failed load gets at most two
retries with backoff.

Run one real check:

```bash
npm run check
```

Start real monitoring:

```bash
npm run monitor:real
```

### Fixed simulation

```dotenv
SIMULATE_STATUS=AVAILABLE
SIMULATE_APPOINTMENT_DATES=2026-08-10,2026-08-20
```

```bash
npm run check:simulate
```

Use `NOT_AVAILABLE` to test the other definitive state. The simulated detector
uses local HTML and does not derive status from the municipality website.
With an active date filter, an AVAILABLE simulation without a simulated date is
treated as having no matching appointment.

### Timeline simulation

```dotenv
SIMULATION_SCENARIO=config/simulation.json
SIMULATION_REPEAT=true
SIMULATION_INTERVAL_SECONDS=5
SIMULATION_KEEP_BROWSER_OPEN_MS=30000
SIMULATION_PAUSE_BEFORE_CLOSE=false
```

```bash
npm run reset-state:simulation
npm run monitor:simulate
```

Timeline customer simulation reads `config/simulation.json` and never navigates
to the municipality website. All active services use the same round; the round
advances once only after every service group and customer has been evaluated.
Multiple customers sharing a service receive the same raw date list and retain
their independent production date-filter evaluation.

The dashboard remains open for `SIMULATION_KEEP_BROWSER_OPEN_MS`. With
`SIMULATION_PAUSE_BEFORE_CLOSE=true`, an interactive run also waits for Enter.
The scenario round index is stored locally and `npm run reset-state:simulation`
resets it together with simulation customer state. The safe umbrella
`npm run reset-state` resets those two files plus synthetic test-notification
state. Neither command modifies real customer state or production appointment
state. Use `npm run reset-state:test` when only the synthetic Telegram feedback
test should be reset.
`SIMULATION_REPEAT=true` wraps to the first round after the last. When false, the
final round is reused. `SIMULATION_SEQUENCE` and `SIMULATION_DATE_SEQUENCE` are no
longer used and can be removed from existing `.env` files. Fixed one-shot
simulation continues to use `SIMULATE_STATUS` and `SIMULATE_APPOINTMENT_DATES`.

## Notifications and availability actions

While availability remains detected, the monitor sends notifications through every enabled channel
on every check until the monitor is stopped or the appointment becomes
unavailable. Consecutive `AVAILABLE` results therefore produce consecutive
notifications. One-shot real and fixed-simulation checks also notify whenever the
current result is AVAILABLE. Previous status is retained only for diagnostics.

These actions are independent:

```dotenv
ENABLE_DESKTOP_NOTIFICATION=true
ENABLE_SOUND=true
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
ENABLE_OPEN_BROWSER=true
ENABLE_SCREENSHOT=true
NOTIFICATION_PROVIDER=auto
```

Failure of one action is logged and does not prevent the remaining actions,
browser cleanup, or subsequent monitor cycles. Test notifications without opening
the appointment website:

```bash
npm run test-notification
```

### Telegram

Telegram is optional and disabled by default. It is enabled automatically only
when both Telegram values are present. If either value is missing, Telegram is
not registered and desktop notifications continue independently. To enable phone
notifications:

1. Open Telegram and create a bot by messaging **@BotFather** and using `/newbot`.
2. Send at least one message to the new bot from the Telegram account or group
   that should receive alerts.
3. Obtain the corresponding chat ID, for example by inspecting the bot's
   `getUpdates` response after sending that message.
4. Add the credentials only to your local `.env`:

```dotenv
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_CHAT_ID=your-chat-id
```

Then run:

```bash
npm run test-notification
```

The test command does not contact the appointment website. When Telegram is
enabled it uses the same appointment-alert builder, message formatter, booking
link, inline buttons, compact callback data, and generated alert IDs as real
multi-customer monitoring. It uses the reserved synthetic identity
`customer-test-notification`; no real customer configuration is loaded or
changed. Test callback outcomes are stored separately in
`data/test-notification-state.json`. The independently enabled desktop channel
continues to receive the same test alert.

To test the complete feedback loop, use two terminals:

```bash
# Terminal 1
npm run telegram:listen
```

```bash
# Terminal 2
npm run test-notification
```

Telegram should show a realistic appointment alert dated seven days from the
test run, the normal product 35 booking link, and both feedback buttons. Pressing
**I booked it** records the synthetic customer as booked in the dedicated test
state and replies that monitoring stopped. Pressing **Keep looking** records that
alert as unsuccessful and leaves the synthetic customer active. Run
`test-notification` again to generate a fresh alert and reactivate only the
synthetic test identity. Telegram failures are logged without stopping other
notification channels.

**Security:** never commit or paste your bot token into source files, screenshots,
issues, or logs. `.env` is ignored by Git; `.env.example` contains empty values only.

### macOS

macOS uses `osascript` through `execFile`, with AppleScript values escaped and no
shell interpolation. In System Settings > Notifications, allow notifications for
your terminal or the displayed script sender. Also check Focus settings.

### Windows

Windows uses `node-notifier` for Toast notifications. Enable notifications for
the terminal/Node sender under Settings > System > Notifications and check Focus
Assist. Windows behaviour is covered by unit tests but must be visually verified
on Windows hardware.

### Linux

Linux prefers `notify-send` and falls back to `node-notifier` only when the
executable is unavailable. Debian/Ubuntu users can install it with:

```bash
sudo apt install libnotify-bin
```

A graphical session and notification daemon are required. Linux behaviour is
unit-tested but must be visually verified on a Linux desktop.

## Detection safety

The checker distinguishes:

- `AVAILABLE`: a visible, enabled date button with `aria-disabled="false"`, or
  an enabled time option with a real value.
- `NOT_AVAILABLE`: the complete calendar explicitly reports the Dutch
  `geen dagen beschikbaar` message and no positive signal exists.
- `PAGE_NOT_LOADED`: the expected page/calendar is absent, still loading, blank,
  or otherwise incomplete.
- `ERROR`: the page renders a non-empty error alert.

The real checker waits for DOM content, the expected heading and calendar anchor,
then a positive date/time signal, explicit no-availability message, or explicit
error. A blank page or disappeared message cannot become AVAILABLE. Failed and
partial loads never trigger alerts. Browsers close in a `finally` block.

Observed stable contracts on 5 August 2026:

| Purpose | Selector or text contract |
|---|---|
| Calendar anchor | `#date-select` |
| No availability | `#days-available-message` containing `geen dagen beschikbaar` |
| Available date | `[role="dialog"] button.duet-date__day[aria-disabled="false"]:not([disabled])` |
| Available time | enabled non-empty option under `#time-select` |
| Loading | `[role="status"]` containing `Laden` |
| Page error | `#notification-message[role="alert"]` with non-empty text |
| Completed step | heading `Kies plek en tijd` |

No sufficiently stable documented JSON availability endpoint was confirmed, so
the real checker uses the rendered browser page. It does not bypass CAPTCHAs,
authentication, access controls, rate limits, or anti-bot protections, and it
never performs a final booking or confirmation action.

## Debugging and troubleshooting

Run a visible real check:

```bash
npm run debug
```

For slower interaction:

```bash
npm run debug:slow
```

Use `debug` for a normal-speed visible inspection that closes as soon as the
check and artifact capture finish. Use `debug:slow` for slowed Playwright actions,
verbose step logging, and a final `DEBUG_KEEP_BROWSER_OPEN_MS` viewing period.
Both capture the debug screenshot and rendered HTML before Chromium cleanup.
`DEBUG_STEP_DELAY_MS` controls slow-mode Playwright `slowMo`; it does not affect
standard debug. `monitor:real` instead repeats checks using `CHECK_INTERVAL_MINUTES`.
Debug artifacts are written under `screenshots/`.

If the checker returns `PAGE_NOT_LOADED`:

1. Confirm Chromium is installed with `npx playwright install chromium`.
2. Run `npm run debug` and inspect the newest local debug artifacts.
3. Check for maintenance, CAPTCHA, network failure, or changed Dutch text.
4. Compare the rendered DOM with the selector table above.
5. Update selectors only from observed DOM, then run typecheck and tests.

The appointment website is an external dependency. Selector, flow, content, or
anti-automation changes may require maintenance at any time.

## Privacy and local data

The application has no analytics or remote data store. It contacts the configured
appointment URL only in real mode or when the optional browser-opening action is
enabled. It writes status JSON under `data/` and screenshots/debug HTML under
`screenshots/`. Those runtime artifacts and `.env` are ignored by Git and excluded
from npm packages. Screenshots and HTML may contain page content; review them
before sharing.

State also stores the raw page status, parsed appointment dates, and matching
dates for diagnostics. Older state files are merged with safe defaults. These
fields do not suppress repeated notifications while matching availability remains.

## Known limitations

- Availability is only a signal; a slot may disappear before you open the site.
- Website changes can invalidate selectors or Dutch text contracts.
- Date filtering can only evaluate dates exposed by the currently rendered
  calendar or selected-date field; it does not crawl unlimited future months.
- Desktop notifications depend on operating-system permissions and a graphical
  session.
- macOS is the only notification implementation visually verified by the current
  maintainer environment; Windows and Linux need platform-specific verification.
- The tool is intended for polite personal use, not high-frequency polling.

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) for development and pull-request guidance.
Report security concerns using [SECURITY.md](SECURITY.md), not a public issue when
sensitive details are involved. Normal defects and selector-change reports can
use the GitHub issue template.

## License

Licensed under the MIT License. See [LICENSE](LICENSE).
