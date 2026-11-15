# Defect and test observation log – OSP-84

Last updated: 15 November 2026
Code under local review: `85ec534` plus uncommitted changes on `codex/deployment-readiness-fixes`.

This log separates code defects from acceptance gaps and environment blockers. Passing unit tests do not establish full SRS acceptance.

| ID | Observation and reproduction | Priority / classification | Status |
|---|---|---|---|
| CAT-01 | Make `GET /api/books` return HTTP 503. The catalog showed both an error alert and “0 books found,” which looked like a real empty result. | P2 confirmed UI defect | Fixed locally: the heading now says “Catalog unavailable.” Regression covered in `client/src/pages/CatalogPage.test.jsx`. |
| CAT-02 | Open the public catalog: seeded books use `https://placehold.co` cover URLs, but the server's `img-src` policy excluded that host, so browsers blocked the covers. | P2 confirmed UI defect | Fixed in the uncommitted server code by allowing HTTPS image sources. The security-header regression test and lint pass; the public preview still runs committed `85ec534` and needs a later deployment of this fix. |
| STOCK-01 | Open any seeded book detail: the catalog seeder created Book records but no seller listings. Every book said “Currently out of stock” and `GET /api/books?available=true` returned zero. | P1 demo purchase blocker | Fixed in local and public demo data: an approved Demo Sample Store now has one five-copy offer for each of the 100 sample books. The API reports 100 available books. The reusable API seeder is `scripts/seed-demo-inventory.mjs` and skips existing offers on rerun. |
| RATE-01 | Seeded sample books displayed nonzero review counts and ratings even when `GET /api/books/:id` returned no reviews. | P2 misleading demo data | Reconciled all 100 sample books against actual reviews in both databases after saving private backups. Future `seed:books` runs start ratings at zero. |
| SELLER-01 | Suspend a seller in the isolated local database, then request one of their books: the detail still returned the seller's active offer and `available=true` still counted all 100 books. Reinstate the seller afterward. | P1 seller suspension / fulfillment risk | Fixed in uncommitted code: catalog, book detail, public listings, cart and checkout now require an active seller. Focused ST04/ST05/ST06/ST16 and the full 437-test backend suite pass; the public service still runs the older code. |
| SEC-01 | `npm audit --omit=dev` on the prior lockfile reported three high-severity production dependency findings in body-parser, Mongoose and Nodemailer. | P1 dependency security | Fixed in the uncommitted working copy by updating the affected packages; production audit now reports zero findings. The public Render service still runs `85ec534` and needs a deployment of the updated lockfile. |
| DEPLOY-02 | The Docker build had no `.dockerignore`, so a local `server/.env`, dependency folders and generated output could be sent in the build context even though the Dockerfile did not copy them. | P2 deployment/security hardening | Fixed locally: `.dockerignore` excludes environment files, dependencies, build output, backups, test results and docs. |
| DEPLOY-03 | Start the production Compose stack: its API health check followed an HTTP-to-HTTPS redirect on the internal HTTP port, so Docker marked a database-ready API unhealthy. Caddy's active probe needed the same proxy protocol header. | P1 deployment blocker | Fixed locally: both probes now send `X-Forwarded-Proto: https`. API became healthy and HTTPS requests returned 200 in the local production-mode stack. |
| DEPLOY-04 | Run the CI Caddy validation command: the image expects `caddy validate`, while the workflow passed only `validate`, causing `exec: "validate": executable file not found`. | P2 CI configuration defect | Fixed locally; the corrected command reported `Valid configuration`. |
| PERF-01 | The 11 November 200-virtual-user catalog/search benchmark against 5,101 books reported P95 1,512.82 ms and 75.2% of requests below 800 ms. | NFR01 acceptance gap | Local production-mode repeat with 5,100 books passed: through Caddy, 19,781 successful responses, zero failures, P95 225.50 ms and 99.25% below 800 ms. Public Render + Atlas acceptance remains open. See `NFR01-performance-benchmark.md` section 15. |
| DEPLOY-01 | Start and smoke-test the production image, HTTPS proxy, database connection, role flows and backup restore. | Deployment verification | Local QA passed with a MongoDB replica set and test-only configuration. A Free Render + Atlas preview is live; public homepage, database readiness, catalog count and administrator login passed startup checks. Full acceptance and a deployment of the uncommitted fixes remain open. |
| OBS-01 | The earlier 30 October test log recorded MongoDB initially stopped and then started for that run. | Historical environment observation | Resolved for that earlier run; it does not apply to the current local environment described above. |
| OBS-02 | React `act()` warnings appeared during the client suite. | Test warning | Non-blocking; all 145 client tests passed. |
| OBS-03 | jsdom/axe reports that canvas `getContext` is not implemented during accessibility checks. | Test environment limitation | Non-blocking; all 145 client tests passed. |
| OBS-04 | An admin console test reports a missing React list key. | Test warning | Non-blocking; all 145 client tests passed. |

## Verification evidence

- Local lint: passed.
- Local client tests: 17 files, 145 tests passed, including CAT-01 regression.
- Local production client build: passed.
- Local backend tests: 34 suites, 437 tests passed against MongoDB 7 as a replica set. The first run lost its database because the container's file limit was too low; the rerun passed with `nofile=65536`.
- Production app and backup Docker images: built successfully. Compose configuration and Caddy validation: passed.
- Local production-mode HTTPS smoke: site and readiness returned 200; HTTP returned 308 to HTTPS; buyer registration, administrator access, seller approval, listing, checkout, simulated payment, shipment and delivery passed.
- Backup and restore: one archive restored 111 documents into an isolated database; 100 books and one administrator matched the source counts.
- Local production-mode load repeat: 200 concurrent clients against 5,100 books, 15 seconds, 19,781 successful HTTPS responses through Caddy, zero failures, combined P95 225.50 ms and 99.25% below 800 ms. This does not verify Render + Atlas capacity.
- `git diff --check`: passed. Detailed commands and results are in `deployment-local-qa-2026-11-15.md`.
- Latest recorded remote CI on the current main code: 579 tests passed for commit `86f5ee7`; the current `85ec534` main commit only updates that results document. The local changes have not been run by GitHub CI.
- Public Render + Atlas startup, public TLS, external Razorpay, SMTP, off-host backups and the NFR01 200-user target remain unverified.

Manual user acceptance, the 330 design-workbook cases, performance acceptance, external SRS/SASD approval, and deployment of the uncommitted fixes must not be marked passed without their own execution evidence.
