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

## Running

```bash
npm run dev:server   # API on http://localhost:5000
npm run dev:client   # SPA on http://localhost:5174 (proxies /api to the server)
```

### With Docker

`docker-compose.yml` runs the API and MongoDB as separate containers, with MongoDB already set up as a single-member replica set, so the demonstration environment can be rebuilt from the repository alone (SRS 7). Only Docker is needed; no local MongoDB or replica set configuration.

```bash
cp server/.env.example server/.env   # set JWT_SECRET and the ADMIN_* values
docker compose up --build -d         # API on http://localhost:5000
docker compose exec api npm run seed:admin
docker compose exec api npm run seed:books
npm run dev:client                   # the SPA still runs from Node and proxies /api to the container
```

- The API reads `server/.env`, but its MongoDB connection string is always the `mongo` container's, so the `MONGODB_URI` in that file is ignored.
- The stack runs in development mode by default. Production mode refuses plain HTTP and turns off the simulated payment route, so set `NODE_ENV=production` only behind a proxy that terminates TLS.
- `API_PORT=5050 docker compose up -d` publishes the API on another port. MongoDB is not published to the host, so it never clashes with a local MongoDB.
- Data lives in the `mongo-data` volume. `docker compose down` keeps it; `docker compose down -v` deletes it.
- `server/Dockerfile` builds the API image on its own: `docker build -f server/Dockerfile -t online-bookstore-api .` from the repository root.

## Quality checks

```bash
npm run lint            # shared ESLint configuration
npm test                # server and client test suites
npm run test:coverage   # with coverage reports
```

Server tests use the MongoDB instance at `MONGODB_TEST_URI` (default `mongodb://127.0.0.1:27017`), with a throwaway database per Jest worker. It must be a replica set too, or the cart, checkout, payment and order tests fail with 500s. Give the base URI without a database name or query string.

## Behaviour notes

- **Cart** (`/api/cart`): every endpoint answers `200 { cart }`, where `cart` is `{ buyer, items, itemCount, subtotal }`. Each item is `{ listing, quantity, available, lineTotal, listingDetails }`, with `listing` the listing id. Asking for more than the listing's stock is a `409`.
- **Cancelling orders**: a buyer can cancel an order while it is `Placed` or `Paid` (SRS 6.2); `Shipped` and later orders answer `409`. Cancelling restores the stock. Refunds are outside Release 1.0, so a paid order's payment is marked `Refund pending`.
- **Payments**: `POST /api/payments/orders/:orderId/simulate` with `{ "outcome": "success" | "failure" }` stands in for the sandbox gateway and is disabled in production. A declined payment cancels the order and releases its stock in the same transaction (REQ-11); the buyer checks out again to retry.
- **Database queries**: `mongoose.set('sanitizeFilter', true)` is on (`server/src/config/db.js`), so any query operator written in code (`$gt`, `$in`, `$ne`, ...) must be wrapped in `mongoose.trusted(...)`. Without that the query fails with a `CastError`, which the API reports as a `404`.

## Not yet implemented

These parts of the SRS and SASD are still open:

- Sellers viewing orders for their listings and advancing order status (REQ-14). Nothing moves an order to `Shipped` or `Delivered` yet, so the review flow can only be exercised with test data.
- E-mail notifications (REQ-15); notifications are in-app only, and sellers are not yet notified of new orders.
- Administrators adding or editing books, and changing or cancelling orders (FR15, SASD 4.2.4).
- A real sandbox payment gateway (SASD OD-1).
- Client screens for checkout, order confirmation, order history and notifications (SRS 3.1).
- Suggested categories when a search finds nothing (REQ-6).
