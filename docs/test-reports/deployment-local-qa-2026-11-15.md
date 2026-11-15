# Local deployment QA – 15 November 2026

Source: main `85ec534` plus uncommitted changes on `codex/deployment-readiness-fixes`. Production-mode tests used isolated local data; later public demo-data corrections are recorded below.

## Environment and commands

- Windows 11 host with Kali Linux under WSL 2. Docker Engine `28.5.2+dfsg4`, Compose `2.40.3`, MongoDB container `7.0.48`, production app image on Node `20.20.2`.
- Installed Docker Engine, Compose and Buildx from Kali's package repository. `docker run --rm hello-world` passed.
- `docker compose -f docker-compose.production.yml config --quiet` passed with ignored example environment files.
- `docker run ... caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` reported `Valid configuration`.
- `docker compose -f docker-compose.production.yml build` built `online-bookstore:local` and `online-bookstore-backup:local`. The app build included the React production bundle.
- `npm run lint` passed; `npm test -w client -- --run` passed **145/145**; `npm run build -w client` passed.
- `npm test -w server -- --maxWorkers=2` passed **437/437** across 34 suites against a single-member MongoDB replica set after the seller-suspension regression tests were added. The first attempt failed when MongoDB exhausted its default open-file limit and exited; recreating the test container with `--ulimit nofile=65536:65536` resolved the environment failure.

## Production-mode stack smoke

The local QA override ran MongoDB on a private Compose network, set `DEMO_DOMAIN=localhost`, and enabled the payment simulator for test-only checkout. The API still ran with `NODE_ENV=production` from the production image. The local HTTPS certificate was issued for localhost; client probes used test-only certificate trust bypass.

| Check | Observed result |
|---|---|
| API container readiness | Healthy after internal probe sent `X-Forwarded-Proto: https` |
| `GET https://localhost/api/health/ready` | HTTP 200, `{"status":"ok","database":"up"}` |
| `HEAD http://localhost/` | HTTP 308, `Location: https://localhost/` |
| `HEAD https://localhost/` | HTTP 200, `Content-Type: text/html` |
| Catalog and search | 100 seeded books; a full-title search returned 1 matching book |
| Buyer and administrator | Buyer registration succeeded; administrator login and Monitoring access returned 9 metric rows |
| Seller onboarding | Request became Pending, administrator approved it, seller login returned Seller, listing endpoint returned 200 |
| End-to-end order | Seller created a listing; buyer saved an address, added the listing to cart, validated checkout, placed an order, and simulated successful payment. Seller advanced it to Shipped and Delivered; buyer read Delivered status. |
| Backup and restore | Backup archive created after seed; `mongorestore` restored 111 documents into `online_bookstore_qa_restore` with 0 failures. Restored counts: 100 books, 1 user. |

## Local production-mode load repeat

After the smoke run, the same local stack was restarted and seeded with 100
demo books plus 5,000 synthetic books. The API confirmed 5,100 catalog books
and 500 `technology` search matches. A separate Node container used
`scripts/qa-load-benchmark.js` to run 200 persistent clients for 15 seconds,
half on catalog and half on search. The API kept production request logging
enabled. Direct API requests: 21,400 successes, 0 failures, combined P95
227.16 ms, 100% below 800 ms. Through Caddy's local HTTPS endpoint: 19,781
successes, 0 failures, combined P95 225.50 ms, 99.25% below 800 ms. The
local client accepted Caddy's localhost certificate for the test only.

This meets the NFR01 read threshold locally in production mode. The earlier
development-mode benchmark failed, and the public Render + Atlas target has
not yet been measured. A second local HTTPS run had 19,625 successful
responses, zero failures, P95 227.14 ms and 99.37% below 800 ms; its JSON
summary is in `test-results/deployment-qa/load-https.json`. See
`NFR01-performance-benchmark.md` section 15.

The smoke run exposed two deployment defects fixed on this branch: the production API health check followed an HTTPS redirect on the container's HTTP port, and the CI Caddy validation command omitted the `caddy` executable. Caddy's active health probe also needed the HTTPS forwarding header. Compose and Caddy validation passed after the fixes, and the stack became healthy.

## Free public preview (15 November 2026)

- Render service `srv-dbsk6ad6e07s73a3oq5g` runs one Free Node instance in Singapore at `https://online-bookstore-preview-free.onrender.com`. It builds committed `main` at `85ec534`; this working tree remains uncommitted. Future `main` pushes are configured to deploy after GitHub checks pass. The first deploy failed while Atlas still denied Render's outbound IPs. After adding `74.220.52.0/24` and `74.220.60.0/24`, a second deploy became Live.
- Atlas cluster `online-bookstore-free` is M0 in AWS Singapore. Its `bookstore_app` user has `readWrite` only on `online_bookstore`. The temporary local seeding IP was removed after use. Credentials are held outside the repository in `work/private/preview-credentials.json` on this machine and were not logged or committed.
- Public smoke checks: `GET /` returned HTTP 200 and the React root; `GET /api/health/ready` returned HTTP 200 with `{"status":"ok","database":"up"}`; `GET /api/books?limit=1` reported 100 seeded books; administrator login returned the Administrator role and a token. These are deployment checks, not acceptance testing of the six project documents.
- The initial startup command seeded the administrator before binding the web port and timed out Render's health check. The seed completed during the retry. The active service now runs `npm start -w server`, and the local `render.yaml` runs `node src/server.js`. Seed an administrator separately for a new database.
- The uncommitted working copy is also running locally at `http://localhost:5173` with Vite proxying to the API on port 5000 and an isolated MongoDB container. Local checks returned HTTP 200 for the page, `ok/up` for readiness, and 100 catalog books. This process is a temporary preview for review on this computer, not the public Render release.
- A subsequent demo inventory run registered and approved **Demo Sample Store** through the public and local APIs, then created one five-copy offer for each of the 100 sample books. The script was rerun locally and created zero duplicates. Both catalogs reported 100 available books; a public book detail returned one active offer with quantity five. These are fictional sample offers with no physical fulfillment.
- The original sample seeder had inserted nonzero rating and review counts without reviews. Existing local and public sample books were reconciled against real reviews after backing up their old cached values outside the repository. The checked public book now has rating zero, review count zero, and zero reviews. Future `seed:books` runs no longer fabricate ratings.
- The uncommitted dependency refresh installed Mongoose 8.24.9, Nodemailer 10.5.0, body-parser 1.20.9, Vite 6.4.6 and Vitest 4.1.12. A fresh `npm ci` succeeded; `npm audit --omit=dev` reported zero vulnerabilities; lint passed; the backend suite passed 437/437 and the frontend suite passed 145/145. A production Docker image built with Node 20. The 19 remaining audit findings are low or moderate and in development dependencies. The public Render service still runs the earlier committed dependency tree.
- In an isolated local check, suspending the demo seller left one active offer visible on a book and left all 100 sample books in the available filter. The seller was reinstated immediately. The uncommitted code now excludes suspended sellers from catalog availability, book details, public listings, cart and checkout. Focused ST04/ST05/ST06/ST16 and the full 437-test backend suite pass. The public service still runs the older code; no public seller was suspended.

## Still required for public acceptance

- Review and commit the local changes when approved. The public preview currently runs the earlier committed code; the uncommitted fixes have not been deployed. A future CI-gated `main` deploy has not yet been observed.
- The optional GitHub `DEMO_URL` variable is unset, so scheduled uptime monitoring is not active.
- Recheck public HTTPS, Atlas readiness, real external payment integration if required, SMTP delivery, hosted backups and a restore drill on representative data.
- Repeat NFR01 load testing with at least 5,000 books on the intended Render + Atlas deployment; local production-mode success does not establish public capacity.
- Run manual workbook/UAT cases and obtain the external document approvals separately. Local automated success does not mark those cases passed.
