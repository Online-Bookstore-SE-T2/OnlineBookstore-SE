# Online Bookstore – Sprint 2 Test Summary Report

## 1. Report details

- Project: Online Bookstore
- Group: G2
- Issue: OSP-84 – Acceptance Testing and Test Summary Report
- Execution date: 30 October 2026
- Environment: Ubuntu 24.04.3 on WSL
- Runtime: Node.js 20.20.2
- Database: MongoDB 7
- Test tools: Jest, Vitest, Vite

## 2. Objective

Execute the available automated backend and frontend tests, verify that the
frontend production build completes, record execution results, and identify
acceptance criteria that remain unverified or unsuccessful.

## 3. Execution summary

| Test activity | Result | Status |
|---|---:|---|
| Backend test suites | 23/23 passed | PASS |
| Backend test cases | 286/286 passed | PASS |
| Frontend test files | 10/10 passed | PASS |
| Frontend test cases | 94/94 passed | PASS |
| Combined automated tests | 380/380 passed | PASS |
| Frontend production build | Build completed successfully | PASS |

Total automated test suites/files: 33
Total automated test cases: 380
Failed automated test cases in final run: 0

## 4. Backend test execution

The backend Jest test run completed successfully.

- Test suites: 23 passed out of 23.
- Test cases: 286 passed out of 286.
- Duration: approximately 158.482 seconds.
- Exit code: 0.

The backend tests include system and unit tests covering registration,
authentication, profile management, administration, cart, checkout,
order creation, payment, order history, notifications, reviews, listings,
security, catalog, search, controllers, and validators.

## 5. Frontend test execution

The frontend Vitest test run completed successfully.

- Test files: 10 passed out of 10.
- Test cases: 94 passed out of 94.
- Duration: approximately 56.49 seconds.
- Exit code: 0.

The frontend tests cover layout, book details, book reviews, login,
registration, search, seller listings, admin console, profile, and theme
behaviour.

Non-blocking warnings were observed:
- React act() warnings relating to CatalogPage state updates.
- jsdom does not implement HTMLCanvasElement.getContext during an
  accessibility/color-contrast check.

These warnings did not cause test failures.

## 6. Production build verification

The frontend production build was executed using Vite.

- Modules transformed: 79.
- Build result: successful.
- Duration: approximately 3.48 seconds.
- Exit code: 0.

## 7. Environment issue observed during initial execution

An earlier backend test run failed because the local MongoDB service was
not running. The affected integration/system tests could not establish
their database connection.

MongoDB was subsequently started and verified using a database ping.
The affected review/listing test suite was rerun and passed. The complete
backend suite was then rerun successfully.

The initial failures are therefore recorded as an environment-related
execution blocker, not as confirmed application defects.

## 8. Performance acceptance status

The existing NFR01 performance benchmark report records that the
200-concurrent-user read-request target was not met.

In particular, the recorded concurrent benchmark did not achieve the
requirement that 95% of read requests complete within 800 ms. The
moderate-concurrency benchmark also did not meet that threshold.

Sequential catalog and search API benchmarks succeeded, and the catalog
query-plan investigation showed reduced documents examined after the
compound index was introduced. However, these results do not establish
that the concurrent performance acceptance criterion has passed.

Refer to NFR01-performance-benchmark.md for the measurements.

## 9. Outstanding acceptance activities

The following activities are not established as passed by the automated
test results in this report:

- Resolve and rerun the NFR01 concurrent performance benchmark.
- Verify actual browser catalog rendering and checkout confirmation timing.
- Complete and record manual user acceptance testing.
- Confirm the planned cross-browser checks.
- Record any required end-to-end sandbox payment and notification service
  verification.
- Complete detailed test-case-to-SRS requirement traceability.

These activities should be completed or explicitly accepted as outstanding
before declaring all Test Plan exit criteria satisfied.

## 10. Conclusion

The final automated execution was successful: all 380 backend and frontend
automated test cases passed, across 33 test suites/files. The frontend
production build also completed successfully.

The automated functional test run is green. However, full acceptance of
the project is not claimed because the recorded NFR01 concurrent
performance target remains unmet and some manual/acceptance activities
require separate evidence.

## 11. Deliverables

- OSP-84-test-summary-report.md
- test-execution-log.md
- defect-observation-log.md
- requirement-coverage-matrix.md
- execution-logs/ (captured command output, where available)
- NFR01-performance-benchmark.md (existing performance evidence)
