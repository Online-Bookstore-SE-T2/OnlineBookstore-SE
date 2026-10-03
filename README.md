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

Requires Node.js 20 LTS and a reachable MongoDB instance.

```bash
npm install
cp server/.env.example server/.env   # then fill in real values
```

## Running

```bash
npm run dev:server   # API on http://localhost:5000
npm run dev:client   # SPA on http://localhost:5173 (proxies /api to the server)
```

## Quality checks

```bash
npm run lint            # shared ESLint configuration
npm test                # server and client test suites
npm run test:coverage   # with coverage reports
```

Server tests use the MongoDB instance at `MONGODB_TEST_URI` (default `mongodb://127.0.0.1:27017`), with a throwaway database per Jest worker.
