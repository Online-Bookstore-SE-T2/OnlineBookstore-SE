# Deployment runbook

This repo supports two deployment paths:

- **Render + MongoDB Atlas**: the existing managed demo deployment in `render.yaml`. Render terminates HTTPS; the app container serves both the React site and API.
- **Docker Compose + Caddy + MongoDB Atlas**: an optional self-hosted HTTPS deployment for a Linux host with a stable public address. Caddy obtains and renews TLS certificates. MongoDB stays in Atlas and is never published from the host.

The Compose stack has not been used to deploy a live service from this repository. A live deployment still needs an operator-owned domain, host, Atlas cluster, payment credentials and mail settings. The checked-in sample files contain no secrets.

## Self-hosted HTTPS deployment

### Prerequisites

- A Linux VM or server with Docker Engine and Docker Compose v2.
- A DNS `A` record for the domain pointing to the host's public IP. Add an `AAAA` record only if IPv6 is reachable too.
- Inbound TCP ports 80 and 443 open in the host and cloud firewalls; UDP 443 is optional for HTTP/3.
- A MongoDB Atlas replica-set cluster. Restrict network access to the host's stable outbound IP. Create a read/write database user for the app and a separate read-only user for the backup worker. Use URL-encoded passwords in MongoDB connection strings.
- Razorpay test-mode keys for a non-live demonstration, or production keys only when real payments have been explicitly approved. SMTP credentials are optional; without them order e-mail is disabled.

### Configure secrets

1. Create the server environment file from the sample and fill in the required values. Keep it on the host only:

   ```sh
   cp server/.env.example server/.env
   ```

   Set `MONGODB_URI` to the Atlas URI for the app's read/write user and database `online_bookstore`; set a long random `JWT_SECRET`; set the initial `ADMIN_NAME`, `ADMIN_EMAIL` and `ADMIN_PASSWORD`; and set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `PAYMENT_PROVIDER=razorpay`. Configure SMTP values if order e-mail is required. `docker-compose.production.yml` forces production mode, the public client origin, and simulator disabled by default.

2. Create the root Compose environment file:

   ```sh
   cp deploy/production.env.example .env
   ```

   Replace `DEMO_DOMAIN`, `BACKUP_MONGODB_URI` and the example Atlas host. The backup URI must use the separate read-only user. The root `.env`, `server/.env`, and backup directory are ignored by Git.

3. Confirm that `docker compose -f docker-compose.production.yml config --quiet` succeeds before starting the services. This validates Compose interpolation and file references without exposing the rendered secret values.

### Build and start

From the repository root:

```sh
docker compose -f docker-compose.production.yml build
docker compose -f docker-compose.production.yml up -d
docker compose -f docker-compose.production.yml ps
docker compose -f docker-compose.production.yml logs --tail=100 api caddy backup
```

The API waits for its readiness probe to reach Atlas before Caddy starts. Caddy routes requests to the API only while `/api/health/ready` succeeds. Neither the API nor MongoDB is published directly to the host. Caddy's data and configuration volumes preserve its issued certificates across container recreation.

### Initialize and smoke-check

Create the first administrator and optional catalog seed from one-off API containers:

```sh
docker compose -f docker-compose.production.yml run --rm api npm run seed:admin
docker compose -f docker-compose.production.yml run --rm api npm run seed:books
```

Then verify the service from a machine outside the host:

```sh
DEMO_DOMAIN=books.example.com # replace with the domain set in the root .env
curl -fsS "https://$DEMO_DOMAIN/api/health/ready"
curl -sSI "http://$DEMO_DOMAIN/"
```

The first command should return HTTP 200 with `{"status":"ok","database":"up"}`. The second should redirect to HTTPS. Complete a browser smoke test for registration/login, catalog search, buyer checkout with Razorpay test credentials, seller order fulfillment, and the administrator console. Check that an order e-mail arrives if SMTP was configured. Do not test live payment keys with real customers until separately approved.

### Backups, updates and rollback

The backup worker writes an archive at startup and daily at 00:00 UTC, retaining seven days locally. Use an encrypted, access-restricted, off-host copy as well; a backup stored only on the same VM is not a disaster-recovery copy. Atlas snapshots should remain the primary managed recovery mechanism when enabled. Check `docker compose -f docker-compose.production.yml logs backup` after startup and after each scheduled run. Perform and record restore drills against an isolated database before relying on the recovery process.

For a release, set a unique `APP_IMAGE_TAG` in the root `.env`, then rebuild and restart:

```sh
docker compose -f docker-compose.production.yml build api backup
docker compose -f docker-compose.production.yml up -d
```

Retain the previous image tag until the new release passes smoke checks. To roll back, restore the previous `APP_IMAGE_TAG` and run `docker compose -f docker-compose.production.yml up -d --no-build api backup`. Verify readiness and the checkout/catalog flows after rollback. Back up the database before any release that changes persisted data.

For a planned shutdown, run `docker compose -f docker-compose.production.yml down`; named certificate volumes and the host backup directory remain. Do not add `-v` unless intentionally deleting Caddy's certificate state.

## Free Render + Atlas demonstration

The Blueprint requests **one Render Free web service** in Singapore. Use an
**Atlas Free (M0) cluster**. Neither requires a paid compute plan or a custom
domain. Do not enable Atlas's optional paid backup subscription, switch to an
Atlas Flex/Dedicated tier, or upgrade the Render instance. If a payment method
is on the Render workspace, usage beyond included bandwidth or build minutes
can still be billed; a workspace without a payment method stops service or
builds at those limits instead. The public preview at
`https://online-bookstore-preview-free.onrender.com` is a directly configured
Render Node service; it does not read `render.yaml`. The CI/CD workflow deploys
every push to `main` that passes CI (step 6).

1. Create an Atlas Free cluster, preferably in a region near Singapore, and a
   database user with read/write access to `online_bookstore`. Form the driver
   URI with `online_bookstore` as its database and URL-encode special
   characters in the password. Keep the URI private.
2. The existing Render Node service builds with
   `npm ci --include=dev && npm run build -w client`, starts with
   `npm start -w server`, and deploys `main` through the CI/CD workflow.
   Its plan is Free with one instance. The `render.yaml` Docker Blueprint is
   an alternative for a new service; do not create a duplicate for this
   preview.
3. The Render service's two Singapore outbound ranges, `74.220.52.0/24` and
   `74.220.60.0/24`, are on the Atlas project access list. Recheck Render's
   outbound ranges after a networking change. Avoid a permanent `0.0.0.0/0`
   entry. The first deploy failed before the ranges were added; the second
   deploy succeeded.
4. The first administrator, 100 sample books and 100 demo seller offers were seeded once from an
   authorized machine. Seed commands are deliberately outside the web startup
   path: database setup delayed port binding and failed the initial health
   check. For a fresh database, temporarily allow the seeding machine's IP,
   run `npm run seed:admin -w server` and `npm run seed:books -w server` with
   production environment variables, then remove that IP entry. Render Free
   has no dashboard shell or one-off jobs. On Windows, if Node's SRV lookup
   returns `ECONNREFUSED`, use Atlas's standard non-SRV connection string for
   the local seed; the hosted service uses the SRV connection string. For a new
   demonstration, set `DEMO_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`,
   `DEMO_SELLER_NAME`, `DEMO_SELLER_EMAIL` and `DEMO_SELLER_PASSWORD` from a
   private source, then run `node scripts/seed-demo-inventory.mjs`. It uses the
   registration, administrator approval and seller listing APIs. Re-running it
   skips offers already present for that seller. The sample inventory is
   fictional and must not be described as real stock.
5. Give the [preview URL](https://online-bookstore-preview-free.onrender.com)
   to the test owner. The GitHub repository variable `DEMO_URL` (step 6) also
   turns on the scheduled uptime check, which checks the site and
   `/api/health/ready` every 15 minutes; a cold start can cause an initial
   timeout and a retry.
6. Continuous deployment: copy the Render service's **Settings → Deploy Hook**
   URL into the GitHub repository secret `RENDER_DEPLOY_HOOK_URL`, and set the
   repository variable `DEMO_URL` to the preview URL. The `deploy` job in
   `.github/workflows/ci.yml` then deploys each push to `main` after
   `lint-and-test` passes, waits until `GET /api/health` reports the new
   commit, and smoke-tests `/` and `/api/health/ready`. Treat the hook URL as
   a secret: anyone holding it can trigger a deploy. Environment variables are
   still set in the Render dashboard; a deploy does not change them.

The Blueprint uses the payment simulator, a documented SRS deviation; it
does not charge customers. Render Free blocks SMTP ports 25, 465 and 587.
If email is required without payment, a free SMTP provider that supports
STARTTLS on port 2525 may be used by setting `SMTP_HOST`, `SMTP_PORT=2525`,
`SMTP_USER`, `SMTP_PASS` and `SMTP_FROM` in Render; sender verification and
provider limits still apply. For example, [Brevo Free](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan)
currently allows 300 sends per day and [supports port 2525](https://help.brevo.com/hc/en-us/articles/10905415650322-Which-SMTP-port-should-I-use-Port-587-465-or-2525):
use `SMTP_HOST=smtp-relay.brevo.com`, its SMTP login and SMTP key, and a
verified sender address. Order email is disabled until a provider is
configured and verified. Do not enter live Razorpay keys for this
demonstration.

### Free-tier limits and recovery

- Render Free spins down after 15 minutes without inbound traffic and may take
  about a minute to restart. It has one instance and no persistent disk.
  Continuous uptime and the cold-start latency target are not guaranteed.
  Render may also suspend a Free service that sends unusually high traffic to
  Atlas, so coordinate any large load run with the test owner and check the
  workspace's included usage first.
- Atlas Free has a 512 MB storage limit. Its optional automatic backup
  subscription costs money; leave it off. For a no-cost copy, run the
  repository's `npm run backup -w server` on an authorized local machine with
  MongoDB Database Tools installed and a read-only Atlas URI in `MONGODB_URI`.
  Keep the archive encrypted and off the Render instance. A person must
  schedule and verify copies; seven-day retention and four-hour recovery are
  not automatically guaranteed by this configuration.
- Render's local filesystem is erased on restart or spin-down, so database
  archives must never be stored there. To restore, use `mongorestore` from an
  authorized machine to a separate Atlas Free cluster or database, inspect the
  restored data, update `MONGODB_URI` in Render, and redeploy. Free clusters
  allow only one cluster per Atlas project, so an isolated restore may need a
  separate free project.

Render's health check uses `/api/health` for process liveness. The GitHub
uptime workflow uses `/api/health/ready` to include Atlas. For a custom domain,
update the `CLIENT_ORIGIN` Blueprint mapping to that HTTPS origin before a
sync. Render waits for passing GitHub checks before auto-deploying a commit on
`main`; its results-only commit includes `[skip render]` to avoid a second
deploy. Free rollback covers only the two most recent previous deploys.
