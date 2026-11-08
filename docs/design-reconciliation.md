# SASD and SRS reconciliation with the delivered system

Issue #109 asks for the SRS and SASD to come out of Draft "in line with what was built". This page lists every difference found between **SASD v1.0** (Draft, 05-10-2026) and the code on `main` plus the `sprint3-accounts-admin` branch. Each difference comes with the change to make in the document. It was compiled by comparing the SASD's API, error, logging and monitoring sections (4.3 and 4.4) with the routes, controllers and tests.

The documents themselves (`SASD_OnlineBookstore_G2.docx`, `SRS_G2_Online_Bookstore_SRS.docx`) are kept outside the repository. Edit those copies, and give the signatures in person.

## Now aligned (no document change)

| SASD | Was | Now |
| --- | --- | --- |
| 4.2.3, 4.4.1: lockout answer | `423` | `429 TOO_MANY_ATTEMPTS` (#102) |
| 4.3.1: `POST /auth/register` body | no `confirmPassword` | `{ name, email, password, confirmPassword }`, mismatch is a `400` on `confirmPassword` (#103) |
| 4.4.1: error codes | message only | every error body has `code` from the 4.4.1 table (#101) |
| 4.4.2: correlation id | none | `X-Request-Id` on every response, in the request log, and in `500` bodies (#101) |
| 4.4.3: monitoring | none | all nine metrics collected and alerted; see `docs/monitoring.md` (#106) |

## Differences to record in the SASD

### 4.3.1 Auth & Account Service

| SASD says | Delivered | Change to make |
| --- | --- | --- |
| `POST /auth/register` → `201 { token, user }` | `201 { message, token, expiresAt, user }` | Add `expiresAt` and `message` |
| `POST /auth/login` → `200 { token, user, cart }` | `200 { token, expiresAt, user, cart }` | Add `expiresAt` |
| (not listed) | `GET /auth/session` returns the signed-in user | Add the row |
| `PATCH /users/me/addresses/:id` with `{ address?, isDefault? }` | `PUT /users/me/addresses/:addressId` edits; `PATCH /users/me/addresses/:addressId/default` sets the default | Replace the row with the two |
| (not listed) | `GET /users/me/addresses`, `PUT /users/me/password`, `POST /users/me/seller-request` | Add the rows (REQ-3, REQ-13) |
| `GET /admin/users?q=` → `{ data, page, limit, total }` | `POST /admin/users/query` with `{ q, page, role?, deleted? }` → `{ items, page, pageSize, total, totalPages }`; the same generic `POST /admin/:entity/query` serves every record type | Replace, and note the generic admin routes (`GET`/`DELETE /admin/:entity/:id`, `POST /admin/:entity/:id/restore`) |
| `PATCH /admin/users/:id/status` with `{ status }` | `POST /admin/users/:id/suspend`, `/reinstate`, `/promote`, `/seller-request/approve`, `/seller-request/reject` | Replace with the action routes |

### 4.3.2 Cart, Order & Payment Service

| SASD says | Delivered | Change to make |
| --- | --- | --- |
| `POST /cart/items` → `201 { cart }` | `200 { cart }` | Status `200` |
| `PATCH /cart/items/:listingId` | `PATCH` and `PUT` both accepted | Note `PUT` |
| `DELETE /cart/items/:listingId` → `204` | `200 { cart }`; also `DELETE /cart` empties it | Status `200 { cart }`, add the row |
| `POST /cart/merge` with `{ items[] }` | Not implemented. There is no guest cart: the cart is stored on the server and returned by `POST /auth/login` (#66) | Remove the row and say why |
| `POST /checkout/validate` → `{ items[], changes[], subtotal, tax, delivery, total }` | `200 { checkout: { address, items[], subtotal, deliveryCharge, totalAmount, currency } }`; each item says whether it is still available and why not. No tax line | Update the response; record that Release 1.0 charges no tax and no delivery (`deliveryCharge: 0`) |
| `POST /checkout/pay` with `{ addressId, method, acceptChanges }` → `201`, or `402 PAYMENT_FAILED` with no order persisted | Two steps. `POST /checkout/orders` with `{ addressId }` commits the order in a transaction and empties the cart (`201 { order }`, or `409` if stock changed). Payment follows with `POST /payments/orders/:orderId/intent` and `/confirm` (Stripe), or `/simulate` (development only) | Replace the row with these routes |
| A declined payment answers `402`, and no order is persisted | The order exists from the first step. A declined, cancelled or timed-out payment answers `200` with the order `Cancelled`, `payment.status: 'Failed'`, and its stock released in the same transaction (REQ-11). `402` is reserved but not sent | Rewrite the note under the table: the guarantee holds for stock and payment, but a cancelled order record is kept for the buyer's history |
| `GET /orders` → `{ data, page, limit, total }` | `200 { orders }` (not paginated) | Update |
| (not listed) | `GET /orders/seller` and `PATCH /orders/seller/:orderId/status` for sellers (#85); `PATCH /admin/orders/:id/status` for administrators (#65, SASD 4.2.4) | Add the rows |

### 4.4 Error handling, logging and monitoring

| SASD says | Delivered | Change to make |
| --- | --- | --- |
| One error class per row (`ValidationError`, `AuthenticationError`, ...) | One `AppError` class, plus `ValidationError`; the code is derived from the HTTP status | Say the code follows the status, so the table reads "status → code" |
| Codes for 400, 401, 402, 403, 404, 409, 429, 500 | Also `410 GONE` (restore after 30 days), `413 PAYLOAD_TOO_LARGE` (over 1 MB), `503 SERVICE_UNAVAILABLE` (Stripe not configured, database down on `/api/health/ready`), and `BAD_REQUEST` for any other 4xx | Add the rows |
| Authentication, admin and payment outcomes logged at information level; validation failures at debug | One information-level line per request (correlation id, method, path, status, duration), and error level with the stack for `500`. There is no debug level. Admin actions are in the audit log | Describe the delivered logging; keep the "never logged" list, which holds |
| 4.4.3 monitoring table | As specified, with the per-instance figures, minimum samples and leave-outs in `docs/monitoring.md` | Add a sentence pointing to that page, and note that failed logins are tracked overall only |

## Bringing the documents out of Draft

**For each document:**

1. Make the changes above (SASD) and the matching ones in the SRS, if any, after #108's traceability check.
2. Change **Status: Draft** to **Status: Approved**, and the version to **1.1**.
3. Add a revision history row. Proposed text for the SASD:

   > 1.1 · `<date>` · Group G2 · Reconciled with the delivered system: API tables in 4.3 updated to the implemented routes and response shapes; checkout split into order commitment and payment; error codes extended (410, 413, 503); logging and monitoring sections updated (4.4.2, 4.4.3). See `docs/design-reconciliation.md`.

4. Each owner signs and dates their approval line. The SASD lists Selvaganesh Arunmozhi (architecture), Shreya Bonal (catalog and search), Sharanabasava Shivappa (transactions) and Satvik Das (marketplace and reviews).

**Still open in #109 (needs the team):**

- [ ] The final report (Project Proposal 2.1, Week 6).
- [ ] Rehearse `docs/demo-script.md` once on a fresh database and once on the deployed site.
- [ ] #84 (acceptance testing) is still open. Its test summary report is merged, so check and close it, since #109 depends on it.
- [ ] Decide whether the deployed demonstration needs seeded data. `seed:demo` refuses to run in production by design; see the table at the top of the demo script.
