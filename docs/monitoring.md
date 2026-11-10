# Monitoring (SASD 4.4.3)

This page describes how the delivered system collects the metrics in SASD 4.4.3, how it raises alerts, and what is left out and why. The code is in `server/src/monitoring/`.

## How it works

- **Collection.** The API process keeps every metric in memory, in one-minute buckets covering the last 15 minutes. That is the longest window any threshold uses, so memory stays bounded. Only counts and durations are kept, never e-mail addresses, IP addresses or request bodies (SRS 6.3).
- **Alert check.** Every 30 seconds the server evaluates each metric against its threshold. When a metric goes into alert, it writes one line to the server log at error level:

  ```
  [alert] checkoutFailureRate value=12.5% threshold=10% window=15m instance=srv-abc123
  ```

  When `ALERT_EMAIL` is set, it also e-mails that line to that address, using the order e-mail SMTP settings. When the metric recovers, a matching `[alert-resolved] ...` line is written at warning level. An alert that stays on is reported once, not every 30 seconds.
- **Viewing.** Administrators see every metric on the console's **Monitoring** tab: value, threshold, window, sample count and status. The tab reads `GET /api/admin/monitoring`, which is administrator only.
- **Uptime.** `.github/workflows/uptime.yml` runs every 15 minutes once the repository variable `DEMO_URL` is set.

## Metrics

| SASD metric | Threshold | How it is measured | Where |
| --- | --- | --- | --- |
| Checkout failure rate | > 10% over 15 min | Each `POST /api/checkout/orders` that answers `201` or `409` is one checkout. It fails when the order is refused because stock changed (`409`), or when its payment is declined, cancelled or times out (`payment.status: 'Failed'`, or a `402`). Needs at least 5 checkouts in the window. | `monitor.middleware()`, `paymentController` |
| Transaction abort rate in order commitment | > 2% of commits over 15 min | Every run of the `createOrder` transaction that commits or aborts. An abort is a stock or cart conflict (`409`) or an unexpected error. A request refused before anything is written (bad address, empty cart, `400`/`401`/`403`/`404`) is not counted. Driver retries of a transient transaction error are counted separately (`totals.orderCommitRetries`). Needs 5 commits. | `checkoutService.measuredTransaction` |
| Search response time, p95 | > 2 s | Server time for `GET /api/books/search`, from the first middleware to the response. Needs 10 samples. | `monitor.middleware()` |
| Page load time, p95 | > 3 s | The browser's Navigation Timing (navigation start to the end of the load event), sent once per full page load to `POST /api/metrics/page-load`. Needs 10 samples. | `client/src/utils/pageLoad.js` |
| API 5xx rate | > 1% over 15 min | Share of `/api/*` responses with status 500 or above. Needs 20 requests. | `monitor.middleware()` |
| Failed login rate | > 20 failures in one minute, overall | Every refused login: unknown e-mail, wrong password, or a locked account. Lockouts are also counted (`totals.lockouts`). | `authService.loginUser` |
| E-mail permanent failures | Any occurrence in 15 min | An order e-mail that is finally not delivered: a permanent SMTP error, or transient errors still failing after the four retries. | `emailService` |
| Database connection pool use | > 80%, sustained | The driver's connection-monitoring events give the connections checked out per server, as a share of `maxPoolSize` (100 by default). It alerts when every check for five minutes is over 80%. | `monitor.instrumentPool` |
| Service availability | Two consecutive failed checks | **In the app:** each 30-second check pings the database, and two failures in a row raise `databaseAvailability`. **Outside the app:** the uptime workflow requests `/` and `GET /api/health/ready`; if they fail twice, a minute apart, the run fails and GitHub e-mails the maintainers. | `monitor.checkDatabase`, `uptime.yml` |

The minimum sample counts are not in the SASD. They stop one slow request or one declined card from setting off an alert on a demo with almost no traffic. Until a metric has enough samples, the console shows it as **Not enough data**.

## What is left out, and why

- **Failed logins per e-mail address.** SASD 4.4.3 names a per-address rate as well as the overall one. Only the overall rate is collected. Tracking per address would mean keeping e-mail addresses in the metrics, and per-address abuse is already stopped by the five-failure lockout (REQ-2) and the 10-per-minute limit per IP address (SRS 6.3). Lockouts are counted, which confirms the lockout is working. Because of the per-IP limit, a single client cannot reach 20 failures a minute, so this alert fires only for attempts spread across many addresses. That is the credential-stuffing pattern it is meant to catch.
- **Figures are per instance.** `render.yaml` runs two instances, and each keeps and alerts on its own figures. Rates and percentiles therefore describe roughly half the traffic each. The console shows which instance answered. A shared metrics store, or a hosted metrics service, would be needed to combine them, and the Release 1.0 deployment has neither. Figures also restart from zero whenever an instance restarts.
- **Page load times come from the browser.** A browser could send false timings. The endpoint accepts only one number between 1 ms and 120 s and is limited to 30 reports a minute per address, so one client cannot swamp the samples. Browsers without the Navigation Timing API send nothing. Only full page loads are measured, not navigation inside the single-page app.
- **Uptime checks need the deployed URL.** They start once `DEMO_URL` is set after deployment (#100). GitHub runs scheduled workflows on a best-effort basis, so checks can arrive a few minutes late. The platform's own health check (`/api/health`) stays a plain liveness check, so a database outage does not make Render restart healthy instances.
- **No long-term history.** Alerts go to the log and, optionally, by e-mail. The figures are not kept after the 15-minute window. For longer history, Render's log streams can forward the `[alert]` lines to a log service.

## Checking it by hand

1. Sign in as an administrator, open **Administration → Monitoring**, and confirm all nine metrics are listed.
2. Run a few searches and reload the page a few times. The search and page-load sample counts go up.
3. With the payment simulator (development only), place an order and choose **failure**. The checkout failure rate goes up. Once it has 5 checkouts in the window and is above 10%, the server log shows `[alert] checkoutFailureRate ...` within 30 seconds.
4. Stop MongoDB. Within a minute the log shows `[alert] databaseAvailability ...` and `GET /api/health/ready` answers `503 SERVICE_UNAVAILABLE`.
