# NFR01 Performance Benchmark Report

## 1. Test environment

- Application: Online Bookstore REST API
- Database: MongoDB
- Dataset: 5,101 books present in the local database
- Environment: Local development environment running in WSL
- Health endpoint: GET /api/health
- Catalog endpoint: GET /api/books/?page=1&sort=title_asc
- Search endpoint: GET /api/books/search?q=technology&page=1

These results are local development measurements, not production or
dedicated load-testing infrastructure measurements.

## 2. NFR01 acceptance criteria

| Requirement | Target | Current evidence |
|---|---|---|
| Catalog page rendering | Under 3 seconds | Browser rendering not measured |
| Search response | Under 2 seconds | Sequential API benchmark passed; search under concurrency fails |
| Read requests under load | 95% under 800 ms with 200 concurrent users | Not met in the local concurrent tests |
| Checkout confirmation | Under 5 seconds | Not yet measured |

## 3. Sequential API benchmark

Thirty sequential requests per endpoint were measured.

| Endpoint | Success | Mean | Median | P95 | Maximum |
|---|---:|---:|---:|---:|---:|
| Catalog | 30/30 | 48.74 ms | 45.93 ms | 49.54 ms | 130.55 ms |
| Search | 30/30 | 89.78 ms | 87.51 ms | 105.04 ms | 124.08 ms |

Both endpoints returned successful responses in these tests.

## 4. Concurrent catalog and search benchmark

A local Python ThreadPoolExecutor test issued 200 requests concurrently:
100 catalog requests and 100 search requests.

### Before adding the compound catalog index

| Metric | Result |
|---|---:|
| Successful requests | 200/200 |
| Wall time | 7.76 s |
| Throughput | 25.79 requests/s |
| Catalog median | 4,419.70 ms |
| Catalog P95 | 6,734.56 ms |
| Catalog requests under 800 ms | 2/100 |
| Search median | 4,873.32 ms |
| Search P95 | 7,082.63 ms |
| Search requests under 800 ms | 1/100 |

### After adding the compound catalog index

| Metric | Result |
|---|---:|
| Successful requests | 200/200 |
| Wall time | 11.31 s |
| Throughput | 17.69 requests/s |
| Catalog median | 9,418.24 ms |
| Catalog P95 | 10,780.71 ms |
| Catalog requests under 800 ms | 14/100 |
| Search median | 9,347.22 ms |
| Search P95 | 9,892.44 ms |
| Search requests under 800 ms | 0/100 |

The concurrent results did not improve after the index was added.
The reason has not yet been isolated. These results must not be presented
as proof that the index caused the slowdown.

## 5. Moderate-concurrency benchmark

A separate test used 20 workers for 40 total requests (20 catalog and
20 search requests).

| Endpoint | Success | Median | P95 | Under 800 ms |
|---|---:|---:|---:|---:|
| Catalog | 20/20 | 780.11 ms | 912.97 ms | 12/20 |
| Search | 20/20 | 816.73 ms | 990.22 ms | 8/20 |

The 95%-under-800-ms target was not met in this mixed moderate-concurrency run.

## 6. Health endpoint diagnostic

Five sequential health checks returned HTTP 200 in approximately
1.87–3.28 ms.

A separate test sent 200 concurrent requests to the health endpoint.

| Metric | Request logging enabled | Request logging disabled |
|---|---:|---:|
| Successful requests | 200/200 | 200/200 |
| Wall time | 3.08 s | 1.34 s |
| Throughput | 64.96 requests/s | 149.03 requests/s |
| Median | 741.94 ms | 33.51 ms |
| P95 | 2,694.67 ms | 1,148.16 ms |
| Under 800 ms | 109/200 (54.5%) | 148/200 (74.0%) |

The logging-disabled run used a temporary app instance configured with
request logging disabled; production logging configuration was not changed.
The separate runs suggest that per-request console logging contributes
overhead in this local test, but logging is not the only source of latency:
the logging-disabled health P95 still exceeded 800 ms. This comparison is
diagnostic evidence, not a controlled production conclusion.

## 7. MongoDB query-plan verification

### Catalog query

Before the compound index:
- Documents examined: 5,101
- Keys examined: 5,101
- Execution time: approximately 24 ms
- A blocking SORT stage was present.

After adding `{ deletedAt: 1, title: 1, _id: 1 }`:
- Documents examined: 20
- Keys examined: 20
- Execution time: approximately 0 ms in the recorded explain output
- The query used IXSCAN followed by FETCH and LIMIT, without a blocking SORT.

This reduced the documents examined for the first catalog page by
approximately 99.6%. Explain execution time is not the same as full HTTP
response time.

### Search query

The current search service applies case-insensitive, escaped substring
regular expressions to title, author, and ISBN, while also filtering
soft-deleted and unavailable books and sorting by title and _id.

For the query term `technology` on the 5,000-book performance dataset:

| Operation | Returned | Keys examined | Documents examined | Explain time |
|---|---:|---:|---:|---:|
| Search result find (first page) | 20 | 4,520 | 4,520 | 50 ms |
| Matching count | 500 | 5,000 | 5,000 | 23 ms |

The recorded explain figures above are separate diagnostic explains
of the find and count operations. They are not a direct explain of the
current application pipeline. The current `searchService.js` implementation
builds one aggregation pipeline: it applies the active-book and substring
`$match`, then uses `$facet` to produce the sorted/paginated page and exact
count from the matched stream. This avoids issuing a separate application
count query, but it does not make the case-insensitive substring predicates
selective: the search still has to examine a broad set of active books.
No post-change explain or benchmark has yet established that this pipeline
meets the NFR01 latency targets.

Field-specific explains showed the same broad-scan pattern: author and ISBN
queries each examined 5,000 keys/documents when the tested term had no
matches. The current title/author/ISBN indexes therefore do not make these
case-insensitive substring predicates selective.

### Isolated endpoint concurrency with request logging disabled

The temporary test API was connected to the performance-test database.
The normal application source and production logging configuration were
not changed.

| Test | Requests | Wall time | Throughput | Median | P95 | Under 800 ms |
|---|---:|---:|---:|---:|---:|---:|
| Catalog only | 200/200 | 0.93 s | 215.3 req/s | 415.75 ms | 729.73 ms | 200/200 |
| Search only | 200/200 | 5.33 s | 37.5 req/s | 4,853.83 ms | 5,058.21 ms | 0/200 |

A mixed run with 100 catalog and 100 search requests completed 200/200
requests in 4.56 seconds (43.90 req/s). Catalog median/P95 were
413.6/3,928.55 ms (71/100 under 800 ms); search median/P95 were
3,596.18/3,909.25 ms (0/100 under 800 ms).

At 20 workers and 40 mixed requests, catalog median/P95 were
325.04/427.47 ms and search median/P95 were 396.15/464.25 ms; all 40
requests were under 800 ms. These are separate local runs and should not
be interpreted as a production capacity guarantee.

The isolated 200-request tests identify search as the dominant endpoint
bottleneck in this workload. Catalog-only requests met the 800 ms threshold
in that run, but catalog latency degraded when mixed with expensive search
requests.

## 8. Findings and recommended next step

1. The catalog compound index removes the blocking sort and sharply reduces
   documents examined for the first catalog page.
2. The current search implementation performs broad scans for case-insensitive
   substring matching. The result query and exact count each inspect thousands
   of documents.
3. Request logging adds measurable overhead in the local health-endpoint
   diagnostic, but disabling it does not resolve the search bottleneck.
4. A normal MongoDB text index is not a drop-in replacement: it changes the
   current substring matching semantics and may change how terms are matched.
5. A persisted trigram candidate index has now been implemented, backfilled,
   and tested. Its implementation and benchmark results are documented in
   Section 13.
6. Do not remove the exact count, change search semantics, or deploy an
   unverified index strategy solely to improve this benchmark.

The existing `deletedAt` TTL index must retain its expiry configuration.

## 9. Outstanding verification

- Further tune the indexed search path to meet the NFR01 800 ms read target
  under 200 concurrent connections.
- Re-run controlled mixed and isolated concurrency tests after the change.
- Measure actual browser catalog/search rendering.
- Measure checkout confirmation latency.
- Run the agreed acceptance suite and record requirement coverage.
- Re-run the final benchmark after any targeted fix.

## 10. Conclusion

Sequential catalog and search requests are fast in the local test, and the
catalog compound index improves the catalog query plan. The original search
bottleneck has been substantially reduced through the indexed substring-search
optimization described in Section 13. However, the 800 ms concurrent-read
target remains unmet, and browser rendering and checkout timing remain
unmeasured. Overall NFR01 acceptance is therefore still outstanding.

The performance task is not yet fully accepted. Further targeted
investigation and the outstanding acceptance measurements are required.

---

## 11. Additional API smoke checks – 9 November 2026

The running local API was checked after the automated test execution.

| Endpoint | HTTP status | Observed response time |
|---|---:|---:|
| GET /api/health | 200 | 18.4 ms |
| GET /api/books?page=1 | 200 | 62.2 ms |
| GET /api/books/search?q=technology&page=1 | 200 | 61.8 ms |

These values represent one request per endpoint and are recorded only as
smoke-check observations. They must not be interpreted as sequential
benchmark statistics or evidence of meeting the 200-concurrent-user target.

Browser rendering and checkout confirmation remain unmeasured. Browser
automation packages (Playwright and Puppeteer) were not installed in the
inspected project environment.

The previously recorded concurrent benchmark remains the applicable
load-test evidence. NFR01 is not yet fully satisfied.

All measurements in this report are local development results. They are not
a claim of production performance or a completed acceptance sign-off.
---

## 12. Additional search load test – 10 November 2026

A separate 30-second search load test was executed against
`GET /api/books/search?q=technology` using autocannon with 200 concurrent
connections.

| Metric | Result |
|---|---:|
| Concurrent connections | 200 |
| Duration | 30 seconds |
| Successful HTTP 200 responses | 1,011 |
| Other HTTP status codes | None reported |
| Average throughput | 33.71 requests/second |
| Average latency | 5,444 ms |
| Median latency | 5,375 ms |
| 97.5th-percentile latency | 7,627 ms |
| Maximum latency | 9,106 ms |
| Total test time reported | 31.62 seconds |
| Data received | 10.3 MB |

The test confirms that search remains significantly slower than the
800 ms read-request target under high concurrency. The test used 200
concurrent connections; it does not establish that 200 distinct
authenticated users were simulated. These results are local development
measurements and do not represent production capacity.


## 13. Indexed substring-search optimization – 10 November 2026

### Implementation

A persisted trigram candidate index was added to the Book model.

- Search n-grams are generated from title, author, and ISBN.
- A model save hook refreshes the index when searchable fields change.
- The performance seeder explicitly generates n-grams for bulk-inserted books.
- A backfill processed and updated all 5,101 existing book records.
- MongoDB index: `searchNgrams_1`.
- ASCII queries of at least three characters use indexed trigram candidates.
  The original escaped, case-insensitive substring regex is then applied
  to preserve exact search semantics.
- Short and non-ASCII queries retain the original regex-only fallback.
- The existing exact count, pagination, sorting, and result transformation
  were retained.

### Validation

| Check | Result |
|---|---:|
| Existing books processed by backfill | 5,101 |
| Existing books updated | 5,101 |
| MongoDB query plan | IXSCAN using `searchNgrams_1` |
| Example `technology` candidates examined | 500 |
| Example index keys examined | 500 |
| Example documents examined | 500 |
| Updated search-service tests | 11/11 passed |
| Full backend suite before adding the three new regression tests | 331/331 passed |

The example query-plan result reduces candidate documents from 5,101 to
500 before exact substring verification. This is an example query, not a
claim that every search term has the same selectivity.

The three additional search tests cover partial title matching, short-query
fallback, and Kannada/non-ASCII fallback.

### 200-concurrent search API load tests

Endpoint: `GET /api/books/search?q=technology`

All results below are local development measurements.

| Metric | Original baseline | Post-change run 1 | Post-change run 2 |
|---|---:|---:|---:|
| Concurrent connections | 200 | 200 | 200 |
| Duration | 30 s | 30 s | 30 s |
| HTTP 200 responses | 1,011 | 5,271 | 4,724 |
| Timeouts | Not reported | 121 | No timeout reported |
| Average latency | 5,444 ms | 897.16 ms | 1,244.54 ms |
| Median latency | 5,375 ms | 844 ms | 1,199 ms |
| 97.5th-percentile latency | 7,627 ms | 1,431 ms | 1,625 ms |
| 99th-percentile latency | Not recorded | 1,774 ms | 1,814 ms |
| Maximum latency | 9,106 ms | 9,879 ms | 8,593 ms |
| Average throughput | 33.71 req/s | 175.70 req/s | 157.47 req/s |

An intermediate repeat reported 17 timeouts, but its latency and throughput
tables were not retained, so it is not included as a complete benchmark run.

The two complete post-change runs show substantially higher throughput and
lower average and median latency than the original baseline. The results
also vary between runs, so the first result should not be treated as a
guaranteed steady-state measurement.

### Acceptance status and remaining work

The NFR01 requirement that 95% of reads complete below 800 ms under
200 concurrent users is **not met**. Both complete post-change runs have
median latency above 800 ms. The reported Autocannon tables provide the
97.5th percentile, not an exact P95 measurement.

The following work remains outstanding:

- Further tune search performance and repeat controlled load tests.
- Run final mixed catalog/search concurrency tests.
- Measure browser catalog and search rendering.
- Measure checkout confirmation latency.
- Complete the agreed acceptance suite and requirement-coverage review.

The optimization is implemented and validated, but the overall NFR01 task
is not yet fully accepted. These measurements do not represent production
performance.

## 14. Final concurrent verification – 11 November 2026

### Backend validation

- Backend tests: 33 suites, 430 tests passed.
- Checkout validation: 26 ms.
- Order creation: 66 ms.
- Simulator payment confirmation: 55 ms.
- Total measured checkout flow: 147 ms.
- Checkout target: PASS (under 5 seconds).

### Sustained 200-virtual-user benchmark

The test used 200 persistent virtual users over approximately 15 seconds,
with 100 users requesting catalog pages and 100 users requesting search.

| Metric | Catalog | Search | Overall |
|---|---:|---:|---:|
| Successful responses | 1,839 | 1,825 | 3,664 |
| Failed requests | 0 | 11 | 11 |
| Median | 757.01 ms | 556.24 ms | — |
| P95 | 1,596.38 ms | 1,511.86 ms | 1,512.82 ms |
| P99 | 2,005.38 ms | 6,535.92 ms | — |
| Successful responses under 800 ms | 65.6% | 84.8% | 75.2% |

Overall throughput was 232.10 requests/second.

The NFR01 criterion of 95% of read requests under 800 ms was NOT MET.

### HTTP baseline diagnostic

A separate sustained test of 200 virtual users against the health endpoint
completed 30,281 successful requests with no failures.

| Metric | Result |
|---|---:|
| Throughput | 2,005.13 requests/second |
| Median | 91.20 ms |
| P95 | 143.85 ms |
| P99 | 207.51 ms |
| Under 800 ms | 99.95% |

This indicates that the basic HTTP health path is responsive under load.
The catalog and search workload remains the performance bottleneck.

### Database and response diagnostics

- Catalog query plan examined 20 documents and 20 index keys.
- Search used IXSCAN with searchNgrams_1.
- Search initial cursor stage examined 500 documents and 500 keys.
- Ten complete search aggregation executions had a median of 10.32 ms
  and a maximum of 19.85 ms.
- Average sequential response sizes were 11,053 bytes for catalog
  and 9,332 bytes for search.

These database diagnostics do not establish concurrent HTTP performance.
Further investigation is required to isolate the difference under load.

### Final acceptance assessment

Checkout confirmation meets its measured local development target.
The backend regression suite passes.
Catalog and search database indexes are being used.
However, the sustained concurrent-read acceptance target remains unmet.

All results are local WSL development measurements, not production capacity
guarantees. Issue #83 should remain open until the concurrent-read target
is demonstrated or its acceptance criteria are formally revised.
