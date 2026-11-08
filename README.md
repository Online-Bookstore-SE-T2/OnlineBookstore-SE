# OnlineBookstore-SE-Project
Online Bookstore with reviews and catalogue updates (WIP)

MERN stack (MongoDB, Express, React, Node.js) as mandated by the SRS and project proposal.

## Layout

| Folder | Contents |
| --- | --- |
| `server/` | Express REST API, Mongoose models, Jest + Supertest tests |
| `client/` | React single-page application (Vite), Vitest + React Testing Library tests |

User-facing strings live in one resource module per tier (`server/src/resources/strings.js`, `client/src/resources/strings.js`). Shared server-side validation lives in `server/src/validation/validators.js`.

## Setup

Requires Node.js 20 LTS and MongoDB 7+ running as a **replica set**.

```bash
npm install                          # re-run after every pull so new dev dependencies are installed
cp server/.env.example server/.env   # then fill in real values
npm run seed:admin -w server         # creates the first Administrator from ADMIN_* in server/.env
npm run seed:books -w server         # adds 100 sample books in 10 categories (safe to re-run)
npm run seed:demo -w server          # creates demo accounts, marketplace listings, orders and reviews
```

Registration never creates an administrator. Further administrators are promoted from the administration console.

### MongoDB must be a replica set

Placing, paying for and cancelling orders run in multi-document transactions (SRS REQ-12, SASD 3.3), and MongoDB only supports those on a replica set. On a standalone server those requests fail with HTTP 500 and the log shows `Transaction numbers are only allowed on a replica set member or mongos`. Everything else appears to work, so the problem is easy to miss.

- **MongoDB Atlas**: clusters are already replica sets; nothing to do.
- **Local `mongod`**: start it with `--replSet rs0`, then run `mongosh --eval "rs.initiate()"` once.
- **MongoDB installed as a Windows service**: add the lines below to `C:\Program Files\MongoDB\Server\<version>\bin\mongod.cfg`, restart the `MongoDB` service, then run `mongosh --eval "rs.initiate()"` once.

  ```yaml
  replication:
    replSetName: rs0
  ```

A single-member replica set is enough. The connection strings in `server/.env` stay the same (for example `mongodb://127.0.0.1:27017/online_bookstore`).

### Sample data

`seed:books` creates any missing categories and 100 sample books with valid ISBN-13s. It never deletes data and skips books whose ISBN already exists, including soft-deleted ones. The sample ratings and review counts are placeholders; a book's rating is recalculated from real reviews as soon as the first one is posted. The SRS performance targets (NFR01) are defined on at least 5,000 books, so load extra data before measuring them.

`seed:demo` adds two demo buyers, two demo sellers and a demo administrator, each with a usable development login. It also creates three demo books and active seller listings, buyer delivery addresses, orders in every order status, and verified-purchase reviews tied to a delivered order. It is safe to re-run without overwriting existing accounts or deleting data, and is disabled in production.

All demo accounts use `DemoPass#2026`. Their e-mail addresses are `demo.buyer@example.test`, `demo.buyer2@example.test`, `demo.seller@example.test`, `demo.seller2@example.test` and `demo.admin@example.test`. Existing accounts keep their existing passwords when the seed is re-run.

## Running

```bash
npm run dev:server   # API on http://localhost:5000
npm run dev:client   # SPA on http://localhost:5174 (proxies /api to the server)
```

### Checkout, payments and order updates

Buyers select a saved address at `/checkout`, review current stock and totals, then pay using Stripe's hosted Payment Element. Configure Stripe test-mode keys in `server/.env` with `PAYMENT_PROVIDER=stripe`, `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY`; card details go directly to Stripe and are never sent to the API. For offline demos and automated tests, leave `PAYMENT_PROVIDER=simulator`; the payment simulator is disabled in production, where Stripe is required.

SMTP order e-mails are sent to buyers after placement, payment outcomes and status changes. Configure `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` and `SMTP_FROM` for STARTTLS on port 587 (`SMTP_PORT` can override the port). Delivery is retried for transient failures; missing SMTP settings disable e-mail without blocking order processing. Seller notifications remain in-app and include only their own listing lines.

Sellers can review orders containing their listings at `/seller/orders` and advance paid orders to Shipped and Shipped orders to Delivered. Buyers can see status history, cancel before shipment, and review delivered books from `/orders`. Both roles can read and mark notifications from `/notifications`.

The implementation for issues #70–#77 covers checkout and payment, order confirmation and history, buyer cancellation, seller fulfillment, status tracking, in-app notifications, and order e-mail. Backup/restore (#78) and demo seed data (#79) are already available from their earlier merged changes.

### With Docker

`docker-compose.yml` runs the API and MongoDB as separate containers, with MongoDB already set up as a single-member replica set, so the demonstration environment can be rebuilt from the repository alone (SRS 7). Only Docker is needed; no local MongoDB or replica set configuration.

```bash
cp server/.env.example server/.env   # set JWT_SECRET and the ADMIN_* values
docker compose up --build -d         # API on http://localhost:5000
docker compose exec api npm run seed:admin
docker compose exec api npm run seed:books
docker compose exec api npm run seed:demo
npm run dev:client                   # the SPA still runs from Node and proxies /api to the container
```

- The API reads `server/.env`, but its MongoDB connection string is always the `mongo` container's, so the `MONGODB_URI` in that file is ignored.
- The `backup` service takes a compressed database snapshot on startup and at 00:00 UTC each day. It retains snapshots from the last 168 hours in `./backups/`; set `BACKUP_HOST_DIR` to mount a different host directory and `BACKUP_MONGODB_URI` to select another MongoDB deployment. Supply these Compose variables in the shell or a root `.env` file (not `server/.env`); keep any credentials out of tracked files. A failed dump leaves prior backups untouched and is reported in the service logs.
- Database backups contain the bookstore's data. Restrict access to the backup directory and store a protected, off-host copy for production; do not commit or publish backup archives.
- The stack runs in development mode by default. Production mode refuses plain HTTP and turns off the simulated payment route, so set `NODE_ENV=production` only behind a proxy that terminates TLS.
- `API_PORT=5050 docker compose up -d` publishes the API on another port. MongoDB is not published to the host, so it never clashes with a local MongoDB.
- Data lives in the `mongo-data` volume. `docker compose down` keeps it; `docker compose down -v` deletes it.
- `server/Dockerfile` builds the production API and client image from the repository root: `docker build -f server/Dockerfile -t online-bookstore-demo .`.

### HTTPS demonstration deployment (Render + MongoDB Atlas)

`render.yaml` defines one Render web service that serves the production React client and API from the same origin. Render terminates TLS and redirects plain HTTP; the service uses two paid instances in Singapore and only auto-deploys after GitHub checks pass. The service URL is assigned by Render after its first successful deployment and should be recorded here for the evaluation.

1. Connect the repository to Render and create a Blueprint from `render.yaml`.
2. Create a MongoDB Atlas replica-set cluster in a nearby region on a tier that supports cloud backups. Enable daily snapshots with seven-day retention. Allow the Render service's outbound IPs in the Atlas network access list.
3. In the Render service's environment settings, provide the Atlas `MONGODB_URI`, Stripe test-mode secret and publishable keys, SMTP host/user/password/from address, and initial `ADMIN_NAME`, `ADMIN_EMAIL` and `ADMIN_PASSWORD`. These values are prompted as unsynchronized secrets; never put them in the repository or a chat. Render generates `JWT_SECRET`.
4. After the service starts, use its shell to run `npm run seed:admin` and, if desired, `npm run seed:books`. The demo seed is intentionally disabled in production.
5. Record the assigned HTTPS URL, then verify `https://<service-url>/api/health`, a Stripe test-mode checkout, and receipt of the SMTP order e-mail.
6. For monitoring (SASD 4.4.3), optionally set `ALERT_EMAIL` to receive alert e-mails, and set the GitHub repository variable `DEMO_URL` to the service URL to turn on the scheduled uptime check (`.github/workflows/uptime.yml`). See [docs/monitoring.md](docs/monitoring.md).

To restore the hosted database, use Atlas Backup to restore one of the daily snapshots from the previous seven days to a new cluster. Update the Render service's `MONGODB_URI` to that restored cluster, redeploy, and verify the health check plus catalog and order flows. Time the restore and validation; the recovery objective is four hours. Keep the existing local Docker backup procedure below for non-hosted environments.

### Database backups and restore

`docker compose up --build -d` builds and starts the backup service with the API and MongoDB. It writes one compressed `mongodump` archive immediately, then another at midnight UTC each day. Backup files are stored on the host in `./backups` (ignored by Git); files more than 168 hours old are pruned only after a new dump succeeds. Check service status and errors with `docker compose logs backup`. To request an additional backup immediately, run `docker compose run --rm backup node src/scripts/backupDatabase.js`.

To restore a backup, first stop the API so it cannot write during recovery. Select an archive from `./backups`, then restore it into the configured database (the `--drop` option replaces collections present in the archive):

```bash
docker compose stop api
docker compose run --rm --no-deps backup sh -c \
  'mongorestore --uri="$MONGODB_URI" --archive="/backups/<archive-filename>" --gzip --drop'
docker compose start api
```

Verify the restored collection counts and exercise the catalog and order flows before returning the service to users. For a restore drill, use an isolated database and a representative backup, time from starting the restore through validation, and record the result; recovery must finish within four hours (NFR09, SRS 6.2, SRS 7). CI runs a timed backup/restore smoke drill against MongoDB and fails if the drill exceeds four hours. The CI smoke dataset verifies the procedure and toolchain, not production-scale throughput, so production operators must also time a drill with representative data and resources.

## Quality checks

```bash
npm run lint                 # shared ESLint configuration
npm test                     # server and client test suites
npm run build -w client      # production client bundle
npm run test:coverage        # with coverage reports
```

Server tests use the MongoDB instance at `MONGODB_TEST_URI` (default `mongodb://127.0.0.1:27017`), with a throwaway database per Jest worker. It must be a replica set too, or the cart, checkout, payment and order tests fail with 500s. Give the base URI without a database name or query string.

Every pull request to `main` runs lint, both test suites against MongoDB started as a single-member replica set, the client production build, both Docker image builds and the timed backup/restore drill in GitHub Actions (`.github/workflows/ci.yml`). The workflow also runs on pushes to `main`; the Render Blueprint is configured to deploy only after GitHub checks pass.

## Behaviour notes

- **No-result search suggestions (REQ-6 / FR05):** when a submitted search returns no books, the search page displays a no-results message and suggests available categories linking to the filtered catalog. Covered by `client/src/pages/SearchPage.test.jsx`.

- **Registration and login**: `POST /api/auth/register` takes `{ name, email, password, confirmPassword }` (plus optional `phone` and `address`). A missing or different `confirmPassword` is a `400` with `fields.confirmPassword` and creates no account; the confirmation is never stored. It answers `201 { token, expiresAt, user }`, so a new account is signed in straight away. `POST /api/auth/login` answers `{ token, expiresAt, user, cart }`, with `cart` shaped as below, so the header cart count needs no second request.
- **Catalog books**: administrators add books with `POST /api/admin/books` (`isbn`, `title`, `author`, `category`, `price`, optional `description` and `coverImageUrl`) and edit them with `PATCH /api/admin/books/:id`. The ISBN must be a valid ISBN-13, is unique across live and deleted books, and cannot be edited. Both are audited and available from the Books tab of the console.

- **Cart** (`/api/cart`): every endpoint answers `200 { cart }`, where `cart` is `{ buyer, items, itemCount, subtotal }`. Each item is `{ listing, quantity, available, lineTotal, listingDetails }`, with `listing` the listing id. Asking for more than the listing's stock is a `409`.
- **Cancelling orders**: a buyer can cancel an order while it is `Placed` or `Paid` (SRS 6.2); `Shipped` and later orders answer `409`. Cancelling restores the stock. Refunds are outside Release 1.0, so a paid order's payment is marked `Refund pending`.
- **Payments**: Stripe test-mode PaymentIntents are verified server-side through the configured gateway; the hosted Payment Element handles card details. The simulator (`POST /api/payments/orders/:orderId/simulate` with `{ "outcome": "success" | "failure" }`) remains available for offline demos and tests, but not in production. A declined or timed-out payment cancels the order and releases its stock in the same transaction (REQ-11); the buyer checks out again to retry.
- **Order status**: `Placed → Paid → Shipped → Delivered` and pre-shipment cancellation are validated against the transition table. Every status change records its actor and timestamp; sellers can only advance orders containing their listings.
- **Administrator order changes**: `PATCH /api/admin/orders/:id/status` with `{ "status": ... }` follows its own table (SASD 4.2.4): `Paid → Shipped`, `Shipped → Delivered`, and cancellation from `Placed`, `Paid` or `Shipped`, so only an administrator can cancel after shipping. Cancelling restores stock and marks a paid order `Refund pending`. Administrators can never mark an order `Paid`. Each change is audited and notified, and the actions are on the Orders tab of the console.
- **Order transaction report**: administrators can open the paginated Order transaction report from the console or request `GET /api/admin/order-transaction-report?page=1`. Each order-item row contains only the Appendix B transaction reference, order ID, buyer and seller names, book title and ISBN, quantity, order amount, payment method, transaction date, status and remarks; e-mail addresses, phone numbers and delivery addresses are not returned. New orders snapshot the ISBN so catalog changes cannot alter historical report rows.
- **Catalog and Listing Report**: administrators can open the paginated report from the console or request `GET /api/admin/catalog-listing-report?page=1`. It includes listing ID, ISBN, book title, author, category, seller name, condition, unit price, available quantity, listing status, average rating and remarks; seller contact details are not returned.
- **Listing removal disputes (TBD-1)**: a seller cannot remove a listing while a `Placed`, `Paid`, or `Shipped` order refers to it. The seller can submit a reason for administrator review and track the request. An administrator must record a decision note. Approval soft-removes the offer from the catalog and seller listing page but does not change or cancel existing orders; their stored order-item snapshots remain available for fulfilment or cancellation. Rejection leaves the listing unchanged.
- **E-mail**: post-commit SMTP e-mails use STARTTLS and bounded retries. Seller order notifications are in-app only and expose only the seller's own lines, not the buyer's e-mail.
- **Error responses** (SASD 4.4.1): every error answers `{ error: { code, message, fields? } }`. `code` follows the status: `400 VALIDATION_FAILED`, `401 INVALID_CREDENTIALS`, `402 PAYMENT_FAILED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 CONFLICT`, `429 TOO_MANY_ATTEMPTS` (the login rate limit and the five-failure account lock), `500 INTERNAL_ERROR`. The system also uses three statuses the SASD table does not list: `410 GONE` (restore after the 30-day retention), `413 PAYLOAD_TOO_LARGE` and `503 SERVICE_UNAVAILABLE` (Stripe not configured, or the database not answering `/api/health/ready`). Any other 4xx is `BAD_REQUEST`. A declined payment is not an error response: the order comes back with `payment.status: 'Failed'`, so `PAYMENT_FAILED` is reserved but not currently sent.
- **Correlation ids** (SASD 4.4.2): every response has an `X-Request-Id` header, and the request log line carries the same id in brackets after the timestamp. A `500` also returns it as `error.correlationId` and logs the stack under `correlationId=<id>`, and the client appends `Reference: <id>` to the message so a user's report can be matched to the log. A well-formed incoming `X-Request-Id` (8 to 64 letters, digits, `.`, `_` or `-`) from the proxy is kept; anything else is replaced with a new UUID.
- **Monitoring** (SASD 4.4.3): every SASD metric is collected in the API process and checked against its alert threshold every 30 seconds. Administrators see the figures on the console's Monitoring tab (`GET /api/admin/monitoring`). Alerts are logged as `[alert] <metric> ...` lines and e-mailed to `ALERT_EMAIL` when it is set. The browser reports its page-load time to `POST /api/metrics/page-load`. `GET /api/health/ready` answers `503` when the database does not respond, and it is what the uptime check calls. [docs/monitoring.md](docs/monitoring.md) explains how each metric is collected and what is left out.
- **Database queries**: `mongoose.set('sanitizeFilter', true)` is on (`server/src/config/db.js`), so any query operator written in code (`$gt`, `$in`, `$ne`, ...) must be wrapped in `mongoose.trusted(...)`. Without that the query fails with a `CastError`, which the API reports as a `404`.

## SRS delivery and acceptance status

The linked sprint issues for checkout, order tracking, seller fulfillment, notifications, e-mail and sandbox payment are implemented. Daily backup/restore and demo seeding were delivered in merged PRs #96 and #95, respectively.

No-result search category suggestions (REQ-6 / FR05) are also implemented; see the Behaviour notes above. Remaining acceptance activities and unverified requirements are recorded in `docs/test-reports/OSP-84-test-summary-report.md` and `docs/test-reports/requirement-coverage-matrix.md`.

For the final demonstration (#109), [docs/demo-script.md](docs/demo-script.md) walks through every role on the `seed:demo` data in about 20 minutes. [docs/design-reconciliation.md](docs/design-reconciliation.md) lists where the delivered system differs from SASD v1.0, with the change to make in the document before it is approved.
