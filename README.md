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
- `simulate-timeline` requires `SIMULATION_SEQUENCE`.

The npm commands below explicitly select their mode, so simulation settings in
`.env` cannot change a real command into a simulated one. The removed legacy
`SIMULATION_MODE` variable causes a clear startup error.

## Command reference

| Command | Behaviour |
|---|---|
| `npm run check` | One headless real-website check, then exit |
| `npm run check:simulate` | One fixed simulated check using `SIMULATE_STATUS` |
| `npm run monitor:real` | Repeated headless real checks inside the configured schedule |
| `npm run monitor:simulate` | Headed local timeline simulation using `SIMULATION_SEQUENCE` |
| `npm run debug` | One visible real check with debug screenshot and rendered HTML |
| `npm run debug:slow` | One visible, slowed real check that remains open temporarily |
| `npm run help` | Print CLI commands without checking the website |
| `npm run test-notification` | Test only the platform notification provider |
| `npm run reset-state` | Reset appointment state and the timeline index |
| `npm run typecheck` | Validate TypeScript without emitting files |
| `npm test` | Run all unit tests once |
| `npm run build` | Compile production JavaScript into `dist/` |

Stop either monitor with `Ctrl+C`.

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
```

```bash
npm run check:simulate
```

Use `NOT_AVAILABLE` to test the other definitive state. The simulated detector
uses local HTML and does not derive status from the municipality website.

### Timeline simulation

```dotenv
SIMULATION_SEQUENCE=NOT_AVAILABLE,AVAILABLE,AVAILABLE,NOT_AVAILABLE
SIMULATION_REPEAT=true
SIMULATION_INTERVAL_SECONDS=5
SIMULATION_KEEP_BROWSER_OPEN_MS=30000
SIMULATION_PAUSE_BEFORE_CLOSE=false
```

```bash
npm run reset-state
npm run monitor:simulate
```

Timeline simulation uses `page.setContent()` to show a local dashboard. It
displays the cycle number, previous status, current status, expected notification,
browser and screenshot behaviour, timestamp, and countdown. AVAILABLE is green;
NOT_AVAILABLE is red. The Playwright simulation never navigates to the target
website for detection. If `ENABLE_OPEN_BROWSER=true`, the normal alert pipeline
can still deliberately open the appointment URL after an AVAILABLE result; set it
to `false` for a fully offline simulation.

The dashboard remains open for `SIMULATION_KEEP_BROWSER_OPEN_MS`. With
`SIMULATION_PAUSE_BEFORE_CLOSE=true`, an interactive run also waits for Enter.
The sequence index is stored locally and `npm run reset-state` resets it.

## Notifications and availability actions

While availability remains detected, the monitor sends one desktop notification
on every check until the monitor is stopped or the appointment becomes
unavailable. Consecutive `AVAILABLE` results therefore produce consecutive
notifications. One-shot real and fixed-simulation checks also notify whenever the
current result is AVAILABLE. Previous status is retained only for diagnostics.

These actions are independent:

```dotenv
ENABLE_DESKTOP_NOTIFICATION=true
ENABLE_SOUND=true
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

`DEBUG_STEP_DELAY_MS` controls Playwright `slowMo` and
`DEBUG_KEEP_BROWSER_OPEN_MS` controls the one-off post-check wait. Debug runs save
rendered HTML and full-page screenshots under `screenshots/`.

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

## Known limitations

- Availability is only a signal; a slot may disappear before you open the site.
- Website changes can invalidate selectors or Dutch text contracts.
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
