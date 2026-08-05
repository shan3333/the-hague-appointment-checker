# Contributing

Thanks for helping improve this project.

1. Create an issue describing the bug, selector change, or proposed improvement.
2. Fork the repository and create a focused branch.
3. Install with `npm ci` and `npx playwright install chromium`.
4. Keep real-site checks polite. Do not add booking automation, CAPTCHA bypasses,
   authentication bypasses, aggressive retries, or high-frequency schedules.
5. Add or update tests and run `npm run typecheck`, `npm test`, and
   `npm run build`.
6. Do not commit `.env`, state files, screenshots, rendered HTML, logs, tokens, or
   personal information.
7. Open a pull request explaining the behaviour change and verification performed.

Selector changes should cite the observation date and prefer IDs, accessible roles,
stable attributes, and visible text over generated CSS classes.
