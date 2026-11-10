# Test Execution Log – OSP-84

Execution date: 30 October 2026
Environment: Ubuntu 24.04.3 on WSL
Node.js: 20.20.2
Database: MongoDB 7

## Final execution results

| ID | Activity | Tool | Result | Exit code |
|---|---|---|---|---:|
| EX-01 | Backend automated tests | Jest | 23 suites, 286 tests passed | 0 |
| EX-02 | Frontend automated tests | Vitest | 10 files, 94 tests passed | 0 |
| EX-03 | Frontend production build | Vite | Build successful; 79 modules transformed | 0 |

## Combined result

- Backend: 286 passed, 0 failed.
- Frontend: 94 passed, 0 failed.
- Total: 380 passed, 0 failed.
- Total suites/files: 33 passed.
- Production build: passed.

## Execution observations

1. The initial backend execution was blocked because MongoDB was stopped.
2. MongoDB was started and its availability was verified with a ping.
3. The affected review/listing system test suite was rerun successfully.
4. The complete backend suite was rerun successfully.
5. The final frontend test run passed, with non-blocking React act()
   and jsdom canvas warnings.
6. The final production build completed successfully.

## Log files

The execution-logs directory contains captured command output when the
corresponding temporary log files were available at the time of collection.

---

## 9 November 2026 – Additional automated execution

Evidence directory: `execution-logs/20261109-152324/`

- Backend Jest: 29 suites passed; 329 tests passed.
- Frontend Vitest: 15 files passed; 125 tests passed.
- Combined automated tests: 454 passed.
- Frontend production build: passed; 99 modules transformed.
- `git diff --check`: passed.
- Backend duration: approximately 625.428 seconds.
- Frontend test duration: approximately 131.66 seconds.
- Production build duration: approximately 11.33 seconds.

API smoke checks:
- Health endpoint: HTTP 200, 18.4 ms.
- Catalog endpoint: HTTP 200, 62.2 ms.
- Search endpoint: HTTP 200, 61.8 ms.

These API timings are individual observations, not concurrent-load benchmarks.
See `execution-logs/20261109-152324/` for captured execution output.
