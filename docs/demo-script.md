# Final demonstration script

This script runs the whole system in about 20 minutes: browsing, registration, sign-in and lockout, purchase, the seller workflow, reviews, administration, reports and monitoring. Each step names the requirement it shows, so the evaluators can match it to the SRS. It is part of #109 (Project Proposal 2.3).

## Before the demonstration

**Choose the environment.** `seed:demo` is disabled in production, deliberately, because its passwords are published in the README. That leaves two options:

| | Local (recommended for the walkthrough) | Deployed Render site (#100) |
| --- | --- | --- |
| Start | `docker compose up --build -d`, or `npm run dev:server` and `npm run dev:client` against a replica-set MongoDB | Already running at the service URL |
| Data | `npm run seed:books -w server` then `npm run seed:demo -w server` | `seed:admin` and `seed:books` only. Create the buyer and seller accounts live during the demo (step 2), or the night before |
| Payments | Simulator buttons on the checkout page | Stripe test mode, card `4242 4242 4242 4242` (any future date and CVC); `4000 0000 0000 0002` is declined |
| Shows HTTPS (NFR05) | No | Yes: point at the padlock and the HTTP-to-HTTPS redirect |

A good compromise is to run steps 1–9 locally and finish with step 10 on the deployed site.

**Reset the data before each rehearsal and before the real run.** Each demo listing has only two copies, and the seed never restocks a listing that already exists. Run the demo against a fresh database: `docker compose down -v`, or drop the development database, then seed again.

**Accounts** (all use the password `DemoPass#2026`):

| Role | Name | E-mail |
| --- | --- | --- |
| Buyer | Aarav Mehta | `demo.buyer@example.test` |
| Buyer | Mira Shah | `demo.buyer2@example.test` |
| Seller | Dev Books | `demo.seller@example.test` |
| Seller | North Star Books | `demo.seller2@example.test` |
| Administrator | Demo Administrator | `demo.admin@example.test` |

**What the seed contains:** three demo books in the *Demo Picks* category (*The JavaScript Handbook*, *Gardens of the Monsoon*, *A Practical Guide to Design*), one listing of each, and one order in every status: Placed and Shipped for Aarav; Paid, Delivered and Cancelled (refund pending) for Mira. There are also two reviews by Mira of the books in her delivered order.

Open two browser windows: an ordinary one for the buyer and seller, and a private one for the administrator, so both sessions can stay signed in.

## The script

### 1. Browse and search as a visitor (2 min): REQ-5, REQ-6, REQ-7, NFR01

1. Open the home page. The catalog lists books with price, rating and category. Change the sort order and filter by **Demo Picks**.
2. Search for `garden`. Then search for `zzzz` to show the no-results message, which suggests categories (REQ-6 / FR05).
3. Open *The JavaScript Handbook*. The page shows its details, the seller listings with condition and price, and Mira's 5-star review.

### 2. Register and sign in (3 min): REQ-1, REQ-2, SASD 4.3.1, SASD 4.4.1

1. Click **Register**. Submit the form empty: every mandatory field shows an inline error, and focus moves to the first one.
2. Fill in a name and an e-mail address. Type a password and a **different** confirmation: *The passwords do not match.* appears on **Confirm password** (#103). Correct it and create the account. The new user is signed in straight away (SASD 4.3.1).
3. Log out. Log in with the wrong password five times. The fifth attempt locks the account for 15 minutes, and even the correct password is then refused with the lock message (REQ-2; the server answers `429 TOO_MANY_ATTEMPTS`, #102).
4. Log in as **Aarav** (`demo.buyer@example.test`).

> The login form is limited to 10 attempts a minute from one address (SRS 6.3). Do steps 2.3 and 2.4 at a normal pace, or wait a minute before 2.4.

### 3. Buy a book (3 min): REQ-9, REQ-10, REQ-11, REQ-12, REQ-15

1. Add *Gardens of the Monsoon* to the cart. The header cart count updates. Open the cart and change the quantity: going over the stock is refused.
2. Click **Checkout**. Choose the saved address, check the summary, and click **Place order and pay**.
3. Choose **Simulate declined payment** (or the declined Stripe card). The order page says *Payment failed and the reserved stock was released.*, and the order is *Cancelled* (REQ-11).
4. Check out again and choose **Simulate successful payment**. The confirmation page appears, the order shows *Paid* under **Orders**, and a notification arrives under **Notifications** (REQ-15).

### 4. Cancel an order (1 min): SRS 6.2

1. Under **Orders**, open the *Paid* order just placed and cancel it. Stock is restored and the payment is marked *Refund pending*.
2. Open Aarav's seeded *Shipped* order. It cannot be cancelled by the buyer.

### 5. Become a seller and list a book (3 min): REQ-13, REQ-14, REQ-4

1. Still as Aarav, open **Profile** and ask to become a seller.
2. In the administrator window, log in as **Demo Administrator**. Open **Administration → Seller requests** and approve Aarav's request. The action is recorded in the **Audit log** tab.
3. Back as Aarav, reload the page: role changes take effect immediately. From the account menu, open **Manage listings** (`/seller/listings`) and list a copy of any catalog book by its ISBN, with price, quantity and condition. It appears on that book's page.

### 6. Fulfil and review an order (3 min): REQ-14, REQ-16, REQ-17

1. Log in as **Mira** and buy one copy of *A Practical Guide to Design* (successful payment).
2. Log in as **Dev Books** (`demo.seller@example.test`) and open **Orders** from the account menu (`/seller/orders`). Mira's order is listed because it contains Dev Books' listing (#85). Mark it shipped.
3. In the administrator window, open **Orders** and mark the same order **Delivered** (#65). Note that an administrator can also cancel a *Shipped* order, which a buyer cannot.
4. As Mira, open *A Practical Guide to Design* and click **Write a review**. A verified-purchase review needs a delivered order. Submit a rating and comment; the book's average rating updates.

### 7. Administration (2 min): REQ-4, SRS 6.2

1. In **Users**, suspend *North Star Books*, then reinstate it. Confirmation dialogs guard every destructive action.
2. In **Books**, add a book with a valid ISBN-13. An invalid check digit is refused.
3. In **Categories**, delete *Demo Picks*: this is refused because it still has books. Create a new category, delete it, tick **Show deleted**, and restore it (30-day soft delete).

### 8. Reports (1 min): SRS Appendix B

1. Open **Order transaction report**. Each paid line shows the buyer, seller, book, ISBN, amount, payment method and status (#105).
2. Open **Catalog and Listing Report**. Every listing appears with its stock, status and average rating (#104).

### 9. Monitoring and error tracing (1 min): SASD 4.4

1. Open **Monitoring** (#106). Search and page-load times have samples from the browsing in step 1, and the failed logins from step 2 are counted. Checkouts are counted too: with fewer than five in the last 15 minutes, the checkout failure rate shows *Not enough data*; with five or more, it shows the share that failed, including the declined payment from step 3.
2. Mention that alerts go to the server log as `[alert] ...` lines (and to `ALERT_EMAIL`). Each response carries an `X-Request-Id`, and an unexpected error shows "Reference: <id>" so a user's report can be traced to the log (#101). Show one in the browser's network panel.

### 10. Deployed site (1 min): NFR05, SRS 6.3

1. Open the Render URL over plain `http://` to show the redirect to HTTPS.
2. Show `/api/health/ready` answering `{"status":"ok","database":"up"}`, and the **Uptime** workflow runs in GitHub Actions once `DEMO_URL` is set.
3. If time allows, place a Stripe test-mode order with `4242 4242 4242 4242` and show the order e-mail arriving (REQ-15, #99).

## If something goes wrong

- **A listing shows as out of stock.** The data was not reset since the last rehearsal: reseed a fresh database, or list more copies as Dev Books (step 5.3).
- **"Too many requests" on login.** Wait one minute (SRS 6.3 limit).
- **The deployed site is slow to respond the first time.** Open it a few minutes before the demonstration.
- **An unexpected error appears.** Read out its *Reference* id and find it in the Render log. That is the correlation id at work.
