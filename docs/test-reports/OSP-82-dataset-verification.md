# OSP-82: Performance Dataset Generation and Verification

## 1. Objective

Generate a synthetic dataset of 5,000 books for catalog and search
performance testing without modifying the existing demo database.

## 2. Test environment

- Application: Online Bookstore
- Database: MongoDB
- Environment: Local development environment in WSL
- Performance database: online_bookstore_performance_test
- Demo database: online_bookstore (kept separate)
- Generator: server/src/scripts/seedPerformanceBooks.js
- Command: npm run seed:performance

## 3. Dataset generation

The performance seeder generated 5,000 synthetic book records.

| Metric | Result |
|---|---:|
| Target records | 5,000 |
| Newly inserted | 5,000 |
| Existing ISBNs skipped | 0 |
| Categories reused | 10 |

## 4. ISBN validation

The generated ISBN values were checked using the project's
ISBN-13 validation function.

| Validation | Result |
|---|---:|
| Expected records | 5,000 |
| Records found | 5,000 |
| Unique ISBNs | 5,000 |
| Invalid ISBNs | 0 |

## 5. Category distribution

The dataset was distributed equally across 10 categories.

| Category | Books |
|---|---:|
| Technology | 500 |
| Self-Help | 500 |
| Business | 500 |
| Fiction | 500 |
| Science | 500 |
| Mathematics | 500 |
| Biography | 500 |
| Education | 500 |
| History | 500 |
| Health | 500 |
| **Total** | **5,000** |

## 6. Rerun / idempotency test

The performance seeder was executed a second time against the same
performance database.

| Metric | Result |
|---|---:|
| Target records | 5,000 |
| Newly inserted | 0 |
| Existing ISBNs skipped | 5,000 |
| Categories reused | 10 |
| Final book count | 5,000 |

The rerun did not create duplicate records or increase the dataset size.

## 7. Database isolation

The performance dataset was generated in
`online_bookstore_performance_test`.

The existing `online_bookstore` database was not used for this
generation or verification process.

## 8. Conclusion

The OSP-82 dataset-generation verification passed.

- Exactly 5,000 synthetic books were generated.
- All 5,000 ISBNs were unique and valid.
- All 10 categories contained 500 books each.
- Re-running the generator skipped all existing records.
- The final performance database count remained 5,000.

The dataset is ready for use in controlled performance testing.
