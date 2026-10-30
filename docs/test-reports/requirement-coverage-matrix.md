# Requirement Coverage Matrix – OSP-84

This matrix maps the available automated test files to broad functional
areas. It is a file-level coverage overview, not proof that every individual
SRS acceptance criterion or every planned manual test case was executed.

## Backend automated coverage

| Functional area | Available automated test evidence |
|---|---|
| Registration | ST01_registration; UT01_registration |
| Login and session | ST02_login_session; UT02_login_session |
| Profile | ST03_profile; UT03_profile |
| Administration and access control | ST04_admin; UT04_admin; NFR_security_privacy |
| Cart | ST05_cart |
| Checkout | ST06_checkout |
| Order creation | ST07_order_creation |
| Payment | ST08_payment |
| Order history and cancellation | ST09_order_history_cancellation |
| Notifications | ST10_notifications |
| Reviews and seller listings | ST16_reviews_listings |
| Application-level system behaviour | app.test.js |
| Search | UT06_searchService |
| Book details | UT07_bookDetailsService |
| Catalog | UT08_catalogService |
| Book controller | UT09_bookController |
| Catalog controller | UT10_catalogController |
| Input validation | validators.test.js |

## Frontend automated coverage

| Functional area | Available automated test evidence |
|---|---|
| Shared layout | Layout.test.jsx |
| Book details | BookDetailsPage.test.jsx |
| Reviews | BookReviewsPage.test.jsx |
| Login | LoginPage.test.jsx |
| Registration | RegisterPage.test.jsx |
| Search | SearchPage.test.jsx |
| Seller listings | SellerListingsPage.test.jsx |
| Admin console | AdminConsolePage.test.jsx |
| Profile | ProfilePage.test.jsx |
| Theme and styling | theme.test.js |

## Acceptance criteria requiring additional evidence

| Area | Current evidence | Status |
|---|---|---|
| Automated backend functional tests | 286/286 passed | PASS |
| Automated frontend tests | 94/94 passed | PASS |
| Production build | Vite build successful | PASS |
| NFR01 concurrent read performance | Existing benchmark misses the 95%-under-800-ms target | NOT MET |
| Manual UAT | No completed UAT evidence included in this execution | NOT VERIFIED |
| Cross-browser acceptance | No cross-browser execution evidence included here | NOT VERIFIED |
| Browser rendering under 3 seconds | Existing benchmark says not measured | NOT VERIFIED |
| Checkout confirmation under 5 seconds | Existing benchmark says not measured | NOT VERIFIED |
| Detailed SRS case-level traceability | Requires review against the complete SRS and planned test-case list | NOT VERIFIED |

## Traceability note

The available automated tests provide coverage across several major
functional areas. The test filenames do not establish complete coverage
of every planned test case or SRS requirement.

In particular, the available system test files include ST01-ST10 and
ST16-related review/listing coverage. Do not assume that omitted test
identifiers or unlisted requirements have passed. Map each planned test
case to its exact SRS requirement and execution evidence before reporting
a final requirement-coverage percentage.
