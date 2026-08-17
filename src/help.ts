console.log(`The Hague Appointment Checker

Usage:
  npm run check              Run one real website check
  npm run check:simulate     Run one fixed simulated check
  npm run monitor:real       Monitor the real website
  npm run monitor:simulate   Run the local timeline simulator
  npm run customer:activate -- <id>            Send a real customer activation confirmation
  npm run customer:activate:simulate -- <id>   Send a simulation-customer activation test
  npm run customer:booked -- <id>              Mark a real customer as booked
  npm run customer:stop -- <id>                 Stop monitoring a real customer
  npm run telegram:listen                       Listen for real customer feedback buttons
  npm run debug              Visible one-shot inspection at normal speed
  npm run debug:slow         Visible one-shot inspection with slowed actions and temporary keep-open
  npm run test-notification  Test enabled desktop and Telegram notifications
  npm run reset-state              Reset simulation and test-notification state
  npm run reset-state:simulation   Reset simulation state only
  npm run reset-state:test         Reset test-notification state only
  npm run typecheck          Validate TypeScript
  npm test                   Run unit tests
  npm run build              Build production JavaScript`);

console.log(`
Appointment date filters (npm requires -- before forwarded options):
  npm run check -- --within 7d
  npm run check -- --before 2026-09-01
  npm run check -- --between 2026-08-15 2026-09-01
  npm run monitor:real -- --within 1m
  npm run check:simulate -- --within 7d

--between uses strict YYYY-MM-DD dates and includes both boundaries.
Only one of --within, --before, or --between may be used.
Supported --within units: d (days), w (weeks), m (calendar months).`);

console.log(`
Multi-customer monitoring (cannot be combined with a CLI date filter):
  npm run monitor:real -- --customers
  npm run monitor:simulate -- --customers`);
