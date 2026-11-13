# Requirement Coverage and Test Traceability Matrix

## 1. Purpose and interpretation

This document reconciles SRS v1.0 Appendix C with the delivered source code and
the test files currently present in the repository.

The original SRS unit-test and system-test IDs are retained as the baseline.
The delivered test IDs and filenames are recorded separately because the
implemented test suite does not consistently follow the original numbering.

A test filename or test description establishes that test evidence exists;
it does not, by itself, establish that every aspect of a requirement has
passed acceptance testing. Refer to the OSP-84 test summary report for
recorded execution results and outstanding acceptance activities.

## 2. Requirement-level traceability

| SRS requirement | Original Appendix C IDs | Delivered source files | Delivered backend unit-test evidence | Delivered backend system-test evidence | Frontend test evidence | Traceability notes |
|---|---|---|---|---|---|---|
| REQ-1 Registration | UT01 / ST01 | `server/src/controllers/authController.js`; `server/src/services/authService.js` | `server/tests/unit/UT01_registration.test.js` | `server/tests/system/ST01_registration.test.js` | `client/src/pages/RegisterPage.test.jsx` | Numbered unit and system tests match the original IDs. |
| REQ-2 Login and session | UT02 / ST02 | `server/src/controllers/authController.js`; `server/src/services/authService.js`; `server/src/services/tokenService.js` | `server/tests/unit/UT02_login_session.test.js` | `server/tests/system/ST02_login_session.test.js` | `client/src/pages/LoginPage.test.jsx` | Unit coverage includes token handling, lockout rules and login behaviour. System tests also include authentication rate-limit checks. |
| REQ-3 Profile and addresses | UT03 / ST03 | `server/src/controllers/userController.js`; `server/src/services/userService.js` | `server/tests/unit/UT03_profile.test.js` | `server/tests/system/ST03_profile.test.js` | `client/src/pages/profile/ProfilePage.test.jsx` | Unit tests cover profile updates, password changes and address management. |
| REQ-4 Administration | UT04 / ST04 | `server/src/controllers/adminController.js`; `server/src/services/adminService.js`; `server/src/services/auditService.js` | `server/tests/unit/UT04_admin.test.js` | `server/tests/system/ST04_admin.test.js` | `client/src/pages/admin/AdminConsolePage.test.jsx` | Unit and system tests cover administration functions, users, seller requests and administrative views. |
| REQ-5 Browse catalog | UT05 / ST05 | `server/src/controllers/catalogController.js`; `server/src/services/catalogService.js`; `server/src/controllers/bookController.js` | `server/tests/unit/UT08_catalogService.test.js`; `server/tests/unit/UT10_catalogController.test.js` | No dedicated catalog system-test file identified. Current `ST05` is the cart test. | `client/src/pages/CatalogPage.test.jsx` | Delivered catalog unit tests use UT08 and UT10, not the original UT05. |
| REQ-6 Search books | UT06 / ST06 | `server/src/controllers/bookController.js`; `server/src/services/searchService.js` | `server/tests/unit/UT06_searchService.test.js`; `server/tests/unit/UT09_bookController.test.js` | No dedicated search system-test file identified. Current `ST06` is checkout. | `client/src/pages/SearchPage.test.jsx` | Search service and controller tests include unmatched-search behaviour. The frontend test covers no-result category suggestions. |
| REQ-7 Filter and sort | UT07 / ST07 | `server/src/controllers/catalogController.js`; `server/src/services/catalogService.js` | `server/tests/unit/UT08_catalogService.test.js` | No dedicated filter/sort system-test file identified. Current `ST07` is order creation. | `client/src/pages/CatalogPage.test.jsx` | Catalog service tests cover category, price and rating filters and sorting. |
| REQ-8 Book details | UT08 / ST08 | `server/src/controllers/bookController.js`; `server/src/services/bookDetailsService.js`; `server/src/services/ratingService.js`; `server/src/services/reviewService.js` | `server/tests/unit/UT07_bookDetailsService.test.js`; `server/tests/unit/UT09_bookController.test.js` | No dedicated book-details system-test file identified. Current `ST08` is payment. | `client/src/pages/BookDetailsPage.test.jsx` | Delivered book-details unit tests use UT07, not the original UT08. |
| REQ-9 Cart | UT09 / ST09 | `server/src/controllers/cartController.js`; `server/src/services/cartService.js` | No dedicated numbered cart unit-test file identified. | `server/tests/system/ST05_cart.test.js` | No dedicated cart-page test file identified in the current frontend test inventory. | Cart is ST05 in the delivered suite; original Appendix C assigned it ST09. |
| REQ-10 Checkout and summary | UT10 / ST10 | `server/src/controllers/checkoutController.js`; `server/src/services/checkoutService.js` | No dedicated numbered checkout unit-test file identified. | `server/tests/system/ST06_checkout.test.js` | `client/src/pages/CheckoutPage.test.jsx` | Checkout is ST06 in the delivered suite; original Appendix C assigned it ST10. |
| REQ-11 Payment | UT11 / ST11 | `server/src/controllers/paymentController.js`; `server/src/services/paymentService.js`; `server/src/services/paymentGateway.js` | `server/tests/unit/paymentGateway.test.js` (unnumbered) | `server/tests/system/ST08_payment.test.js` | `client/src/pages/CheckoutPage.test.jsx` | Payment gateway adapter has unit tests, but the delivered unit filename does not use the original UT11 ID. |
| REQ-12 Atomic order commit | UT12 / ST12 | `server/src/controllers/orderController.js`; `server/src/services/orderService.js`; `server/src/models/Order.js` | No dedicated numbered atomic-order unit-test file identified. | `server/tests/system/ST07_order_creation.test.js` | `client/src/pages/OrderPages.test.jsx` | Order creation is ST07 in the delivered suite; original Appendix C assigned it ST12. |
| REQ-13 Order history | UT13 / ST13 | `server/src/controllers/orderController.js`; `server/src/services/orderService.js` | No dedicated numbered order-history unit-test file identified. | `server/tests/system/ST09_order_history_cancellation.test.js` | `client/src/pages/OrderPages.test.jsx` | Current ST09 covers buyer order history and cancellation, not cart. |
| REQ-14 Seller status update | UT14 / ST14 | `server/src/controllers/orderController.js`; `server/src/services/orderService.js` | No dedicated numbered seller-status unit-test file identified. | `server/tests/system/ST14_seller_orders.test.js` | No dedicated seller-order-status frontend test file identified in the current inventory. | The delivered system test is explicitly named for the seller orders dashboard. |
| REQ-15 Notifications | UT15 / ST15 | `server/src/controllers/notificationController.js`; `server/src/services/notificationService.js`; `server/src/services/emailService.js` | `server/tests/unit/emailService.test.js` (unnumbered) | `server/tests/system/ST10_notifications.test.js` | `client/src/pages/NotificationsPage.test.jsx` | Notification system tests use ST10, not the original ST15. E-mail delivery has a separate unnumbered unit test. |
| REQ-16 Verified-purchase review | UT16 / ST16 | `server/src/controllers/marketplaceController.js`; `server/src/services/reviewService.js`; `server/src/models/Review.js`; `server/src/models/Order.js` | No dedicated numbered review unit-test file identified. | `server/tests/system/ST16_reviews_listings.test.js`; `server/tests/system/ST16_review_flow.test.js` | `client/src/pages/BookReviewsPage.test.jsx`; `client/src/pages/OrderReviewLink.test.jsx` | The explicit ST16 case checks delivered-order eligibility, one review per buyer and updates to the public review list and aggregate. |
| REQ-17 Aggregate rating | UT17 / ST17 | `server/src/services/ratingService.js`; `server/src/services/reviewService.js`; `server/src/models/Review.js`; `server/src/models/Book.js` | No dedicated numbered rating unit-test file identified. | `server/tests/system/ST16_reviews_listings.test.js`; `server/tests/system/ST16_review_flow.test.js` | `client/src/pages/BookDetailsPage.test.jsx`; `client/src/pages/BookReviewsPage.test.jsx` | The explicit ST17 case covers review validation, moderation and aggregate maintenance. |
| REQ-18 Create seller listing | UT18 / ST18 | `server/src/controllers/marketplaceController.js`; `server/src/services/listingService.js`; `server/src/models/Listing.js` | No dedicated numbered listing unit-test file identified. | `server/tests/system/ST16_reviews_listings.test.js` | `client/src/pages/SellerListingsPage.test.jsx` | The system test contains an explicit ST18 seller-listing creation and management case. |
| REQ-19 Edit/remove seller listing | UT19 / ST19 | `server/src/controllers/marketplaceController.js`; `server/src/services/listingService.js`; `server/src/models/Listing.js`; `server/src/models/ListingRemovalRequest.js` | No dedicated numbered listing-removal unit-test file identified. | `server/tests/system/ST16_reviews_listings.test.js` | `client/src/pages/SellerListingsPage.test.jsx` | Explicit ST19 cases cover removal restrictions and administrator resolution of tracked removal requests. |

## 3. Cross-cutting and supporting test files

These tests support multiple requirements or infrastructure behaviour and
should not be assigned to a single functional requirement solely from their
filenames.

| Test file | Observed scope |
|---|---|
| `server/tests/unit/validators.test.js` | Shared validation, text sanitisation, e-mail, password, phone, postal-code and ISBN validation. |
| `server/tests/unit/backupDatabase.test.js` | Database backup archive creation, retention and failure handling. |
| `server/tests/unit/emailService.test.js` | Order e-mail delivery, STARTTLS and delivery failure handling. |
| `server/tests/unit/paymentGateway.test.js` | Razorpay order creation, order and payment retrieval, capture, refund, signature verification and gateway errors. |
| `server/tests/unit/envConfig.test.js` | Startup configuration check: production requires Razorpay unless `ALLOW_PAYMENT_SIMULATOR=true` (hosted-demo deviation from the SRS). |
| `server/tests/system/ST08_razorpay_payment.test.js` | Razorpay payment through the API: one order per checkout, signed confirmation, capture, amount and owner checks, failure releasing stock, refund after cancellation. |
| `server/tests/system/NFR_security_privacy.test.js` | Security, privacy, transport/request limits and secret handling. |
| `server/tests/system/app.test.js` | Application shell and integration-level application behaviour. |
| `server/tests/system/seedDemoData.test.js` | Demo data seed behaviour. |

## 4. Test ID reconciliation and naming discrepancies

The original Appendix C IDs are not a reliable description of the delivered
test filenames. The following differences are confirmed by the current test
inventory and test descriptions:

### System-test ID differences

| Requirement | Original SRS system ID | Delivered system-test file / observed ID |
|---|---|---|
| REQ-5 Browse catalog | ST05 | No dedicated catalog system-test file identified |
| REQ-6 Search | ST06 | No dedicated search system-test file identified |
| REQ-7 Filter/sort | ST07 | No dedicated filter/sort system-test file identified |
| REQ-8 Book details | ST08 | No dedicated book-details system-test file identified |
| REQ-9 Cart | ST09 | `ST05_cart.test.js` |
| REQ-10 Checkout | ST10 | `ST06_checkout.test.js` |
| REQ-11 Payment | ST11 | `ST08_payment.test.js` |
| REQ-12 Atomic order commit | ST12 | `ST07_order_creation.test.js` |
| REQ-13 Order history | ST13 | `ST09_order_history_cancellation.test.js` |
| REQ-14 Seller status update | ST14 | `ST14_seller_orders.test.js` |
| REQ-15 Notifications | ST15 | `ST10_notifications.test.js` |
| REQ-16 Verified-purchase review | ST16 | Explicit ST16 case in `ST16_reviews_listings.test.js` |
| REQ-17 Aggregate rating | ST17 | Explicit ST17 case in `ST16_reviews_listings.test.js`; review-flow coverage also exists |
| REQ-18 Create seller listing | ST18 | Explicit ST18 case in `ST16_reviews_listings.test.js` |
| REQ-19 Edit/remove seller listing | ST19 | Explicit ST19 cases in `ST16_reviews_listings.test.js` |

The filenames `ST16_review_flow.test.js` and
`ST16_reviews_listings.test.js` both begin with `ST16`. Their descriptions
show that the first covers an ST16/ST17 review flow, while the second contains
explicit ST16, ST17, ST18 and ST19 cases. This is a filename-prefix collision,
not evidence of two separate, uniquely numbered ST16 suites. The filenames
have not been silently renamed as part of this documentation reconciliation.

### Unit-test ID differences

| Original SRS unit ID | Requirement | Delivered evidence |
|---|---|---|
| UT01–UT04 | REQ-1–REQ-4 | Matching UT01, UT02, UT03 and UT04 files |
| UT05 | REQ-5 | Catalog service and controller evidence is in UT08 and UT10 |
| UT06 | REQ-6 | UT06 search service and UT09 book controller |
| UT07 | REQ-7 | Catalog filtering/sorting evidence is in UT08 |
| UT08 | REQ-8 | Book details evidence is in UT07 and UT09 |
| UT09 | REQ-9 | No dedicated numbered cart unit-test file identified |
| UT10 | REQ-10 | No dedicated numbered checkout unit-test file identified |
| UT11 | REQ-11 | `paymentGateway.test.js` is unnumbered |
| UT12–UT14 | REQ-12–REQ-14 | No dedicated numbered unit-test files identified |
| UT15 | REQ-15 | `emailService.test.js` is unnumbered |
| UT16–UT19 | REQ-16–REQ-19 | No dedicated numbered unit-test files identified |

The absence of a dedicated numbered unit-test filename does not prove that
the corresponding requirement has no test coverage. System tests, frontend
tests and cross-cutting tests are recorded separately above.

## 5. Current test-file inventory

The inventory below reflects the repository test files inspected for this
reconciliation. The Sprint 2 backup directory is excluded.

| Test area | Current file count |
|---|---:|
| Backend system tests | 16 |
| Backend unit tests | 13 |
| Backend total | 29 |
| Frontend tests | 15 |
| Total backend and frontend test files | 44 |

The backend system inventory includes ST01–ST10, ST14, two ST16-prefixed
files, `NFR_security_privacy.test.js`, `app.test.js` and
`seedDemoData.test.js`.

The backend unit inventory includes UT01–UT04, UT06–UT10,
`backupDatabase.test.js`, `emailService.test.js`,
`paymentGateway.test.js` and `validators.test.js`.

The frontend inventory includes tests for layout, administration, book
details, book reviews, catalog, checkout, login, notifications, order pages,
order-review links, profile, registration, search, seller listings and theme.

This inventory is a file-presence snapshot. It is not a claim that all 44
files were executed in the historical OSP-84 test run.

## 6. Recorded OSP-84 execution evidence

The OSP-84 test summary report records the following historical execution
results from 30 October 2026:

| Execution area | Recorded result |
|---|---|
| Backend Jest | 23 suites; 286 tests passed |
| Frontend Vitest | 10 files; 94 tests passed |
| Combined automated tests | 380 passed; 0 failed |
| Frontend production build | Successful |

These are the results recorded in
`docs/test-reports/OSP-84-test-summary-report.md` and
`docs/test-reports/test-execution-log.md`. They must not be interpreted as
a fresh execution of the current 29 backend and 15 frontend test files.

The OSP-84 report also records that the NFR01 concurrent-user read
performance target was not met. Manual UAT, cross-browser verification,
browser-render timing and checkout-confirmation timing remain unverified
in that report.

## 7. README reconciliation

The README previously listed suggested categories for searches with no
results as remaining SRS work. That item is delivered under REQ-6 / FR05:

- `client/src/pages/SearchPage.jsx` displays a no-results message and
  suggested category links when a submitted search has no matching books.
- `client/src/pages/SearchPage.test.jsx` verifies the no-results message
  and category links to filtered catalog results.

The README should describe this as delivered behaviour, not outstanding work.
Other acceptance gaps and unverified requirements remain documented in the
OSP-84 report and this matrix.
