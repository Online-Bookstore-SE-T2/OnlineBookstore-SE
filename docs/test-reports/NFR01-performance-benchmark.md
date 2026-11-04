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
| Search response | Under 2 seconds | Sequential API benchmark passed; concurrency target needs work |
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

The 95%-under-800-ms target was not met.

## 6. Health endpoint diagnostic

Five sequential health checks returned HTTP 200 in approximately
1.87–3.28 ms.

A separate test sent 200 concurrent requests to the health endpoint.

| Metric | Result |
|---|---:|
| Successful requests | 200/200 |
| Wall time | 3.08 s |
| Throughput | 64.96 requests/s |
| Median | 741.94 ms |
| P95 | 2,694.67 ms |
| Maximum | 2,782.15 ms |
| Under 800 ms | 109/200 (54.5%) |

The health endpoint's latency increased under concurrency. This indicates
that general server or local environment contention may contribute;
the precise cause is not established.

## 7. MongoDB query-plan verification

The catalog query was tested using MongoDB explain("executionStats").

Before the compound index:
- Documents examined: 5,101
- Keys examined: 5,101
- Execution time: approximately 24 ms
- A blocking SORT stage was present.

After adding { deletedAt: 1, title: 1, _id: 1 }:
- Documents examined: 20
- Keys examined: 20
- Execution time: approximately 0 ms in the recorded explain output
- The query used IXSCAN followed by FETCH and LIMIT, without a blocking SORT.

This reduced the documents examined for the first catalog page by
approximately 99.6%. Explain execution time is not the same as full HTTP
response time.

The existing deletedAt TTL index must retain its expiry configuration.

## 8. Outstanding verification

- Investigate the concurrent latency regression before claiming performance
  acceptance.
- Optimize and benchmark the search query if required.
- Measure actual browser catalog/search rendering.
- Measure checkout confirmation latency.
- Run the agreed acceptance suite and record requirement coverage.
- Re-run the final benchmark after any targeted fix.

## 9. Conclusion

The synthetic dataset and catalog index/query-plan work are in place
locally, and sequential catalog/search requests succeeded. However,
the recorded local concurrent tests do not satisfy the NFR01 requirement
that 95% of read requests complete within 800 ms under 200 concurrent users.

The performance task is not yet fully accepted. Further targeted
investigation and the outstanding acceptance measurements are required.
