# Plan: Complete checklist.md for sports-nest-backend

## Context

`checklist.md` lists a full feature roadmap for a sports-court booking platform (auth, courts, bookings, payments, notifications, reviews, analytics, search, support, and long-tail features). The codebase (plain Express 5 + Mongoose, not NestJS) already implements a solid core — auth, court/venue management, and the booking engine — but most monetization, engagement, and ops features are either missing entirely or stubbed with schema fields and `// TODO` comments that were never wired up.

Execution proceeds one step at a time, per user direction: each phase below is scoped, executed, and reported on separately before moving to the next — this file is updated after each step to track status.

---

## Step 0 — Remove injected backdoor ✅ DONE (commit `b78361c`)

While reviewing the codebase, a malicious obfuscated payload was found appended to `server.js` after `module.exports = server;`. It was introduced in commit `b7944ef` ("fix", 2025-12-29), authored by a collaborator (`owais.ansari@octdaily.com`), not the project owner. That commit also removed `.env` from `.gitignore` (no `.env` was ever actually tracked, so no leak occurred) and added an unexplained `config.bat` entry to `.gitignore`.

**Completed:**
- `server.js`: obfuscated payload removed, file restored to clean form.
- `.gitignore`: `.env` restored to the ignore list, stray `config.bat` entry removed.
- Verified: no remaining traces of the payload anywhere in the repo (`grep` scan clean); `node --check server.js` passes.
- Committed standalone as `b78361c` on `main` (not pushed).

**Still outstanding, outside of coding scope — user's own action:**
- Revoke `owais.ansari@octdaily.com`'s push access to the repo if unwarranted.
- Rotate secrets (JWT_SECRET, DB creds, email/OAuth creds) as a precaution.

---

## Phase 0 — Foundational infrastructure ✅ DONE (commit `1c457b7`)

Prerequisite for most later phases.

**Completed:**
- **Fixed the broken Cloudinary integration.** `courtController.js`/`venueController.js` already called a `src/utils/cloudinary` module that didn't exist — `deleteFromCloudinary` was dead code (silently swallowed by its own try/catch). Added:
  - `src/utils/cloudinary.js`: inits the SDK from `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET`, exports `uploadToCloudinary` (stream upload) and `deleteFromCloudinary`.
  - `src/middleware/upload.js`: multer memory storage, 5MB limit, image-type allowlist — reusable for avatar/review uploads in later phases.
  - Deliberately **did not** change the court/venue media endpoints (`addMedia`/`deleteMedia`) — on inspection those already work as designed: the client uploads directly to Cloudinary and sends back `{url, publicId}`, which is a legitimate pattern (avoids proxying large media through the API server) and wasn't actually broken. Only the delete-by-`publicId` path was broken, and that's now fixed by the new util existing.
  - New deps: `cloudinary`, `multer`.
- **Fixed insecure CORS.** `src/app.js` had `origin: "*"` with `credentials: true`. Now driven by a `CORS_ORIGINS` env var (comma-separated allowlist), defaulting to `http://localhost:3000` and `http://127.0.0.1:5500` (the latter matches the existing hardcoded Google OAuth redirect target) when unset.
- **Wired `requireEmailVerification`** onto `POST /api/bookings` (booking creation) only — left court/venue creation untouched since owner-onboarding flows reasonably happen before verification completes. Can extend later if desired.
- **Structured logging.** Added `src/utils/logger.js` (winston, silent in test env); `src/middleware/errorHandler.js` now logs through it instead of bare `console.error`, and also handles Multer upload errors as proper 400s.
- **Scheduler foundation.** Added `src/utils/scheduler.js` (node-cron), initialized from `server.js` on listen (guarded by `NODE_ENV !== 'test'`, and never triggered by tests since they import `src/app.js` directly, not `server.js`). Used it to wire up the previously-unwired `Booking.updateBookingStatuses` static method as a job running every 5 minutes.
- New deps: `cloudinary`, `multer`, `winston`, `node-cron`.

**Verification:** `npm test` run before and after (via `git stash`) — identical results both times: 128 passed / 4 failed. The 4 failures are pre-existing and unrelated (missing `GOOGLE_CLIENT_ID` in test env breaks 3 e2e suites; one pre-existing flaky assertion in `tests/unit/booking.test.js`). Zero regressions introduced.

---

## Housekeeping — Fixed pre-existing test suite failures ✅ DONE (commit `2214e72`)

The 4 pre-existing failures noted above turned out to hide a second bug once unblocked. Fixed both:

- **3 e2e suites crashing at import** (`OAuth2Strategy requires a clientID option`): `tests/setup.js` now sets dummy `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` so passport's Google strategy can initialize in the test env.
- **Newly-uncovered hang**: once the e2e suites could actually load, registration calls hung past Jest's 5s timeout — `EmailService` opens a real SMTP connection via `nodemailer`, and `EMAIL_HOST` is unset in tests. Added `__mocks__/nodemailer.js`, a Jest manual mock applied automatically project-wide (no per-file `jest.mock()` needed), so no test ever makes a real SMTP call.
- **4 time-of-day-dependent failures in `tests/unit/booking.test.js`**: several tests built slot times as `Date.now() + 24h/48h/72h`, which preserves the current hour-of-day. Whenever the suite ran outside the fixture court's 08:00-20:00 operating hours (e.g. at 2am), `isAvailableForSlot()` correctly rejected the slot and the assertions failed — deterministic, not random flakiness. Replaced with a `getSlotTime(daysFromNow, hour)` helper that always lands at a fixed safe hour.
- **Cosmetic**: dropped a redundant explicit index on `Booking.bookingNumber` (already `unique: true`, which implies an index) that was logging a Mongoose duplicate-index warning on every run.

**Result:** all 7 suites / 176 tests pass, no warnings.

---

## Phase 1 — Core gaps: Reviews, profile/avatar, favorites, booking emails ✅ DONE (commit `40496bf`)

**Completed:**
- **Reviews & Ratings** — `src/models/Review.js` (rating 1-5, comment, photos, ownerReply, moderation status), `reviewController.js`, `reviewRoutes.js` (mounted at `/api/reviews`), `reviewValidation.js`. A review requires a `completed` booking owned by the caller and not already reviewed (`Booking.isReviewed`). `Review.recalculateCourtStats()` recomputes `Court.stats.averageRating`/`totalReviews` from approved reviews on every create/update/delete/moderate, then calls the existing `Venue.updateStats()` to propagate up. Owner/manager/admin can reply; admin can moderate (approve/pending/reject).
- **Real avatar upload** — `PUT /api/auth/avatar` (`authController.updateAvatar`), using Phase 0's `upload.js` (multer) + `cloudinary.js`. Deletes the previous Cloudinary asset (if any) before setting the new `profilePicture`.
- **User preferences** — `preferences` subdocument on `User.js` (`notifications.{email,sms,push}`, `language`, `currency`) + `GET/PUT /api/auth/preferences`.
- **Favorites/wishlist** — `src/models/Favorite.js` (unique per user+itemType+itemId, `Court` or `Venue` via `refPath`), `favoriteController.js`, `favoriteRoutes.js` (mounted at `/api/favorites`).
- **Recently viewed** — capped-at-20, deduped array on `User.js` (`addRecentlyViewed`, mirrors the existing `refreshTokens` capping pattern), tracked (best-effort, non-blocking) from `GET /api/courts/:id` and `GET /api/venues/:id`. The courts route was missing `optionalAuthenticate` entirely — added it (venues already had it). Exposed via `GET /api/auth/recently-viewed`.
- **Booking email TODOs** — closed both explicit TODOs (`approveBooking` confirmation, `rejectBooking` rejection notice) plus wired cancellation and immediate-confirm-on-create emails via new `EmailService` methods. Added a 15-minute cron job (`scheduler.js`) sending a one-time reminder for bookings starting within 2 hours, guarded by a new `Booking.reminderSent` flag.
- **Incidental fix**: widened the `bookingNumber` random component (100 → 10000) — a pre-existing collision race (already flagged in a code comment) surfaced during test runs when multiple bookings are created in the same tick; this was starting to matter more as the test suite grew.

**Verification:** all 200 tests pass (9 suites) — 24 new (Review, Favorite, avatar/preferences/recently-viewed in `auth.test.js`), zero regressions. Full `npm test` run clean.

---

## Phase 2 — Monetization: coupons, payments, invoices, refunds ✅ DONE (commit `4bce70b`)

**Completed:**
- **Promo codes** — `src/models/PromoCode.js` (percentage/fixed discount, validity window, global + per-user usage limits, venue/court scoping via `isValidFor`/`calculateDiscount` instance methods), `promoCodeController.js`/`promoCodeRoutes.js` (admin/owner CRUD + a `POST /api/promo-codes/validate` preview endpoint that doesn't mutate anything). Closed the `createBooking` coupon TODO — looks up the code, validates it, pushes the discount into the existing `pricing.discounts` array (schema already had `'coupon'` as a valid type), tracks usage via a denormalized `Booking.promoCode` ref (indexed `{promoCode, user}` for cheap per-user limit checks, rather than scanning the discounts array), and only increments `PromoCode.usedCount` after the booking save actually succeeds.
- **Stripe payments** — `src/models/Payment.js` (the authoritative gateway-transaction record; `Booking.payment` stays as denormalized display data, same relationship as `Review` vs `Booking.rating`), `src/utils/stripe.js` wrapper, `paymentController.js`/`paymentRoutes.js` (create-intent, webhook, history, single payment, receipt). The webhook route is mounted directly in `src/app.js` with `express.raw()` **before** the global `express.json()`, since signature verification needs the raw body — `paymentRoutes.js` handles every other endpoint normally under standard JSON parsing.
- **Refunds** — closed the `cancelBooking` TODO and also wired `rejectBooking` (which set `refundPercentage:100` but never touched payment) through a new `processRefund()` helper at the bottom of `bookingController.js` (same pattern as the existing `generateRecurringBookings` helper) that looks up the succeeded `Payment` record and calls Stripe — best-effort, logged via winston, never blocks the cancellation/rejection itself if the gateway call fails.
- **Receipts** — `GET /api/payments/:id/receipt` streams a PDF (`src/utils/pdf.js`, `pdfkit`, generated in-memory, no disk writes) — scoped under Payment rather than Booking since a receipt only makes sense for a completed transaction (a booking can exist with zero completed payments).
- **Security deposits** — `Venue.paymentSettings` (existed, unused) now computes `Booking.pricing.depositAmount` — informational only, included in the single normal charge, not a separate Stripe manual-capture hold (no consuming workflow exists anywhere else in the app to justify that added complexity; documented as a deliberate simplification).
- **Money handling** — the only × 100 / ÷ 100 conversion boundary in the codebase is in `src/utils/stripe.js` and `paymentController.js` respectively; every other money field (`Booking.pricing.totalAmount`, `Court.baseHourlyRate`, `Payment.amount`, etc.) stays a plain major-unit number, consistent with the rest of the codebase.
- **Testing** — `__mocks__/stripe.js` (project-root manual mock, same mechanism as the existing `__mocks__/nodemailer.js`, applied automatically with no per-file `jest.mock()` needed) so no test ever makes a real Stripe API call; exposes `__mockPaymentIntents`/`__mockRefunds`/`__mockWebhooks` so individual tests can override return values. `pdfkit` needed no mock (pure in-memory, no I/O).
- New deps: `stripe`, `pdfkit`. PayPal/other gateways explicitly deferred — `Payment.gateway` enum has only `'stripe'` today so a future gateway is additive, not a migration.

**Verification:** all 230 tests pass (12 suites) — 25 new (`promoCode.test.js`, `payment.test.js` unit + e2e, plus promo-code/refund coverage added directly to `booking.test.js` since that logic lives inside `createBooking`/`cancelBooking`). Zero regressions. The e2e webhook test specifically exercises the raw-body route ordering end-to-end (not just unit-mocked), confirming `express.raw()` actually wins over `express.json()` for that path.

---

## Phase 3 — Engagement & growth: waitlist, group bookings, recommendations, push/WhatsApp ✅ DONE (commit `8d35f54`)

**Completed:**
- **Waitlist** — `'waitlisted'` added to `Booking.status` as the source of truth (`isWaitlisted`/`waitlistPosition` kept as denormalized convenience fields). Joining reuses `POST /api/bookings` with a `joinWaitlist:true` body flag rather than a new endpoint (avoids duplicating pricing/promo/recurring logic); leaving reuses the existing `DELETE /api/bookings/:id` (a waitlisted booking is unpaid, so the refund guard already no-ops correctly). New `Booking.settleWaitlist(court, startTime, endTime)` static promotes the front of the queue via an atomically-guarded `findOneAndUpdate` (race-safe against concurrent calls) or compacts position gaps if the slot's still occupied. Called inline from `cancelBooking`/`rejectBooking`, plus a cron fallback sweep (`scheduler.js`, every 10 min) since `updateBookingStatuses` can free a slot via `no-show`/`expired` without going through either.
- **Group booking participants** — `POST/DELETE /api/bookings/:id/participants[/:participantId]` and `POST .../respond`, supporting both registered-user (by id) and guest (name/email/phone) invites, capped against `groupSize` (which counts the leader), authorized to the booking owner/`groupLeader` (or the participant themself for respond/remove).
- **Featured/recommended courts** — `GET /api/courts/recommended`, registered *before* `GET /:id` in `courtRoutes.js` (verified `/:id` would otherwise treat "recommended" as a slug lookup and swallow it — a real bug, not hypothetical). Optional lat/lng scopes to nearby venues via the existing `Venue.findNearby()`, falling back to the global query if none are nearby. In-JS composite score (matches `Court.calculatePrice`'s existing plain-JS style rather than a Mongo aggregation) blending `isFeatured`, `averageRating`, `totalReviews`, and a recency decay.
- **Push + WhatsApp notifications, gated by preference** — renamed `User.preferences.notifications.sms` → `whatsapp` (confirmed with user; no real users yet, and it's genuinely WhatsApp via Twilio's WhatsApp API, not carrier SMS). New `src/utils/push.js` (firebase-admin, lazy-init guarded by env-var presence since `admin.initializeApp()` throws on bad config — unlike `stripe.js`, there's no safe dummy-credential fallback) and `src/utils/whatsapp.js` (twilio, *does* mirror `stripe.js`'s dummy-credential fallback since twilio's constructor is safe to call eagerly). New `src/utils/notify.js` dispatcher — one function per booking event, each channel independently gated on `user.preferences.notifications.{email,push,whatsapp}` and independently try/caught so one failing never blocks the others; replaces the 4 direct `EmailService` call sites in `bookingController.js` and the scheduler's reminder job. `User.deviceTokens` (mirrors the existing `refreshTokens` subdoc pattern, capped at 10) + `POST/DELETE /api/auth/device-tokens`.
- **Testing** — `__mocks__/firebase-admin.js` and `__mocks__/twilio.js` (project root, same auto-applied mechanism as the existing stripe/nodemailer mocks) so no test ever makes a real push/WhatsApp call.
- **In-app messaging — skipped**, per the roadmap's own "lowest priority, only if real demand" framing, consistent with how Phase 2 explicitly deferred PayPal.
- New deps: `firebase-admin`, `twilio`.

**Verification:** all 264 tests pass (13 suites) — 34 new (notify dispatcher, device tokens, recommended courts, waitlist state machine + join/promotion flow, group booking participants). Zero regressions.

---

## Phase 4 — Ops, analytics, support, compliance ✅ DONE (commit `c76fbc6`)

**Completed:**
- **Audit logs** — `src/models/AuditLog.js` + `src/utils/auditLog.js` (best-effort, non-blocking, same shape as `notify.js`/`processRefund`). Wired into promo code create/update/delete, review moderation, both venue-verification endpoints, and booking refunds (`processRefund` gained a `req` param, threaded through from `cancelBooking`/`rejectBooking`). `GET /api/audit-logs` (admin only, filterable by actor/action/resourceType/resourceId/date range).
- **Analytics & Reporting** — `GET /api/analytics/{revenue,occupancy,popular-courts,bookings-summary}`, `owner`/`manager`/`admin`-gated and scoped to the caller's own courts (extends `venueController.getMyVenues`'s existing `$or:[{owner},{managers}]` lookup one hop to courts; admins see everything). Aggregates off `Booking` rather than `Payment`, since `Booking` already carries `court`/`venue` on the same collection. Occupancy is computed on-demand from `Court.operatingHours` — **not** written back to the existing-but-dead `Court.stats.occupancyRate` field, since nothing else reads it and wiring it as a maintained field would need new side-effect call sites in `cancelBooking`/`rejectBooking`/`updateBookingStatuses` for no current benefit.
- **Support & Help** — `SupportTicket` model (embedded `messages[]`, matching the `Review.ownerReply`/`Booking.participants` embedded-array precedent; disputes are a `category` value, not a separate model) with create/list/get/reply/admin-status-update endpoints. `Faq` model with public list + admin CRUD.
- **GDPR** — `DELETE /api/auth/account` anonymizes in place after re-verifying password (never hard-deletes — `Booking`/`Payment`/`Review` keep their `user` ref for financial/audit-record integrity, resolving to the now-anonymized document); `GET /api/auth/data-export` returns the user's own bookings/payments/reviews/favorites/support-tickets as JSON.
- **Legal** — `LegalDocument` model (versioned ToS/privacy-policy), public `GET /api/legal/:type` (active version only), admin `POST /api/legal` (auto-deactivates the previous active version). Deliberately thin — no version history/diffing/scheduled-publish, not a CMS.
- **Content moderation** — confirmed no new work needed; `Review.status`/`moderateReview` (Phase 1) already covers the only public content surface, and no messaging feature exists to extend to (explicitly skipped in Phase 3).

**Security fix found while testing (unrelated to Phase 4 itself, but directly uncovered by it):** `User.js`'s email regex (`/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/`) had **catastrophic backtracking (ReDoS)** on any TLD it can't cleanly match in one segment (anything longer than 3 characters with no second dot to split on — e.g. `.info` or `.local`). A ~32-character local part was enough to peg a CPU core for minutes, hanging the entire single-threaded Node process on the affected `.save()` call. Found because the GDPR anonymization email (`deleted-<id>@anonymized.local`) accidentally triggered it during test-writing — debugged via process-level CPU/hang investigation, not a logic error in the new code. This was reachable by **any real user registering with a vulnerable-TLD email**, not just the new anonymization code — a live DoS vector on the public registration endpoint. Replaced with a simple, non-backtracking pattern (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`); route-level `express-validator` `isEmail()` was already doing the real validation work, so this Mongoose-level regex was only ever redundant (and, it turned out, broken) defense-in-depth.

**Verification:** all 300 tests pass (20 suites) — 36 new (audit log, analytics, support ticket, FAQ, legal document units + e2e, GDPR coverage in `auth.test.js`, plus indirect audit-log assertions added to the existing promoCode/review/venue/booking tests). Zero regressions.

---

## Phase 5 — Cherry-picked long-tail features ✅ DONE (all 5 sub-phases)

Business demand confirmed for 5 of the Phase 5 list: **wallet/credit system, loyalty/rewards, referral system, court comparison, 2FA**. Weather integration, 360° virtual tours, multi-language (i18n), currency conversion, and bulk/corporate booking remain out of scope. Design doc for all 5 (architecture decisions, dependency order, hook points): `.claude/plans/from-plan-md-phase-5-quirky-snowflake.md`. Built and reported one sub-phase at a time, same discipline as Phases 0-4.

### Phase 5a — Wallet as a full payment method ✅ DONE

**Completed:**
- **Ledger + denormalized balance** — `src/models/WalletTransaction.js` (append-only, `type` credit/debit, `source` enum incl. `loyalty_redemption`/`referral_bonus` declared upfront for 5b/5c). `User.walletBalance` (new field, default 0) is the fast-read cache, kept in sync by two new atomic statics `User.creditWallet`/`debitWallet` (`src/models/User.js`) — `debitWallet` uses a `findOneAndUpdate({walletBalance:{$gte:amount}})` guard so concurrent debits can never overdraw (verified with a `Promise.all` race test).
- **Wallet as a real payment method** — `bookingController.createBooking` debits the wallet (capped at `totalAmount`) when `useWallet:true` is passed, right after the initial `booking.save()`. Full coverage skips Stripe entirely (`isPaid:true`, `payment.method:'wallet'`, a `Payment{gateway:'wallet'}` record created — `Payment.gateway` enum extended to `['stripe','wallet']`). Partial coverage debits what it can and leaves the booking `pending` for the normal Stripe flow. Insufficient/zero balance silently falls back to full gateway payment — no error. New `Booking.pricing.walletAmountApplied` field tracks the split. Deliberately **not** applied to recurring-booking instances (parent occurrence only), to avoid partial-success semantics across a batch.
- **`paymentController.createPaymentIntent`** now sizes the Stripe intent to `totalAmount - walletAmountApplied` instead of the full total, so a partially-wallet-covered booking only charges the remainder.
- **`processRefund` rewritten** (was: refund-to-Stripe-only, silently no-op'd for any booking without a succeeded Stripe payment) — a real bug this feature surfaced, since every wallet-only booking would have hit that no-op path and refunded nothing on cancellation. Now splits the refund amount proportionally: the wallet-covered portion credits back via `User.creditWallet(source:'refund')`, the rest goes through the existing `stripeUtil.createRefund` path. Audit log shape changed from `{resourceType:'Payment', resourceId:payment._id}` to `{resourceType:'Booking', resourceId:booking._id, changes:{gatewayRefunded, walletRefunded}}` since a single refund can now span both a Payment doc and a WalletTransaction.
- **Wallet top-up** — `POST /api/wallet/top-up` opens a Stripe PaymentIntent tagged with `metadata:{purpose:'wallet_topup', userId}`; the existing webhook handler's `payment_intent.succeeded` case branches on that metadata to credit the wallet directly via `creditWallet(source:'top_up')` instead of completing a booking. No Payment doc is created for top-ups (they're not a booking transaction) — idempotency against webhook retries is guarded by a `gatewayPaymentIntentId` lookup on `WalletTransaction` instead.
- **New endpoints** (`src/controllers/walletController.js`, `src/routes/walletRoutes.js`, mounted at `/api/wallet`): `GET /api/wallet` (balance), `GET /api/wallet/transactions` (paginated ledger, same envelope as `getPaymentHistory`), `POST /api/wallet/top-up`, `POST /api/wallet/admin/:userId/adjust` (admin-only, audit-logged).
- **No migration needed** — `walletBalance` schema default (`0`) covers all normal hydrated reads for existing users.

**Verification:** all 327 tests pass (22 suites) — 27 new (`wallet.test.js` unit + e2e: atomic credit/debit incl. concurrency race, full/partial/fallback wallet-covered bookings, wallet-only and mixed-payment refund splitting, top-up webhook incl. retry-idempotency; extended `booking.test.js`/`payment.test.js` for the new hook points). Zero regressions — one existing test updated to match the intentionally-changed refund audit-log shape (was asserting the old Payment-scoped shape).

### Phase 5b — Loyalty / rewards ✅ DONE

**Completed:**
- **Ledger + denormalized balance, same pattern as 5a** — `src/models/LoyaltyTransaction.js` (append-only, `type` earn/redeem/admin_adjustment). `User.loyaltyPoints` (new field, default 0) is the fast-read cache, kept in sync by two new atomic statics `User.earnLoyaltyPoints`/`redeemLoyaltyPoints` (`src/models/User.js`) — same `findOneAndUpdate({loyaltyPoints:{$gte:points}})` race-safety guard as `debitWallet`.
- **Points redeem into wallet credit, not a separate discount** — `User.redeemLoyaltyPoints` atomically debits points, then calls `this.creditWallet(userId, points * POINTS_TO_WALLET_RATE, {source:'loyalty_redemption'})` internally. Wallet stays the single spendable balance; loyalty points are purely a route into it.
- **Earn/redemption rates** — `src/config/loyaltyRates.js`, a standalone module (no other deps) so both `User.js` and the new `src/utils/loyalty.js` can read `POINTS_EARN_RATE`/`POINTS_TO_WALLET_RATE` from env vars without creating a require cycle between them. Both are placeholder defaults (5% of booking total earned as points; 1 point = 0.1 currency unit on redemption) — real business rates TBD, tunable without a code change.
- **`src/utils/loyalty.js`** — `awardBookingPoints(booking)`, best-effort/non-throwing (mirrors `auditLog.record`/`notify.js`), called from the same two places a booking's payment first becomes "paid" that Phase 5a already identified as mutually exclusive per booking (so no double-award risk): `paymentController.handleWebhook`'s `payment_intent.succeeded` case (right after the booking is marked paid) and `bookingController.createBooking`'s wallet-full-coverage branch (right after the `Payment{gateway:'wallet'}` record is created). Verified with an explicit "webhook fires twice" test that points are only ever awarded once, reusing the webhook's existing `payment.status !== 'succeeded'` idempotency guard.
- **New endpoints** (`src/controllers/loyaltyController.js`, `src/routes/loyaltyRoutes.js`, mounted at `/api/loyalty`): `GET /api/loyalty` (points balance + redemption value in wallet currency), `GET /api/loyalty/transactions` (paginated ledger), `POST /api/loyalty/redeem` (audit-logged).
- **No migration needed** — `loyaltyPoints` schema default (`0`) covers all normal hydrated reads for existing users.

**Verification:** all 344 tests pass (24 suites) — 17 new (`loyalty.test.js` unit + e2e: earn/redeem statics incl. insufficient-balance rejection, redemption-credits-wallet assertion, points-floored-to-whole-number, webhook double-fire idempotency; extended `booking.test.js`/`payment.test.js` for the two award hook points, including a check that a still-pending partial-wallet booking does *not* award points early). Zero regressions.

### Phase 5c — Referral system ✅ DONE

**Completed:**
- **Referral code + link at registration** — `User.referralCode` (unique, sparse — lazily generated via a new `crypto.randomBytes`-based `generateUniqueReferralCode()` retry-loop in `src/utils/referral.js`, since a static schema default can't guarantee uniqueness; mirrors `Court.js`'s slug-uniqueness while-loop) and `User.referredBy` (set once, never mutated). `authController.register` now accepts an optional `referralCode` in the body: looks up the referrer before creating the user, silently ignores an unknown/invalid code (never blocks signup), and every new user — referred or not — gets their own code generated at registration. A `Referral{referrer, referredUser, status:'pending'}` record is created best-effort right after the user save if a valid code was matched.
- **New model** `src/models/Referral.js` — one row per referred signup, `referredUser` is DB-unique (a user can only ever be the "referred" side once), `status` enum `pending → rewarded` (no code path currently produces `qualified` as a distinct step — qualification and reward happen atomically together, see below).
- **Qualification hook, same two call sites as 5b's `awardBookingPoints`** — new `processReferralQualification(booking)` in `src/utils/referral.js`, called as an independent sibling right after `awardBookingPoints` in both `paymentController.handleWebhook`'s `payment_intent.succeeded` case and `bookingController.createBooking`'s wallet-full-coverage branch. No-ops unless the paying user has a `referredBy`, a matching `pending` `Referral` exists, and this is genuinely their *first* completed-paid booking (`Booking.countDocuments({user, 'payment.status':'completed', _id:{$ne:booking._id}})===0`). On qualification, credits both the referrer's and the referred user's wallets via `User.creditWallet(source:'referral_bonus')` and flips the `Referral` to `rewarded`.
- **Reward amounts** — `src/config/referralRewards.js` (same standalone-module pattern as `loyaltyRates.js`, to avoid a require cycle between `User.js` and the utils that consume it), env-tunable placeholders (`REFERRAL_REFERRER_REWARD`/`REFERRAL_REFERRED_REWARD`, defaulting to 500/250).
- **New endpoints** (`src/controllers/referralController.js`, `src/routes/referralRoutes.js`, mounted at `/api/referrals`): `GET /api/referrals/my-code` (lazily generates+persists a code for any pre-5c user on first access, rather than a bulk backfill script), `GET /api/referrals` (paginated list of referrals sent). No endpoint to apply a code after registration — `referredBy` is registration-time-only, standard referral-program semantics.
- **No migration needed** — `referredBy`/new users' `referralCode` are populated going forward; existing users pick up a code lazily via `GET /api/referrals/my-code`.

**Verification:** all 359 tests pass (26 suites) — 15 new (`referral.test.js` unit + e2e: code generation incl. a collision-retry test via a mocked `User.findOne`, qualification no-op cases — unreferred user, already-rewarded referral, not-first-booking — and the happy path; extended `auth.test.js` for register-with-valid/unknown-code and the always-assigned-own-code behavior; full e2e loop from registration through a wallet-paid booking to both wallets credited and the referral list showing `rewarded`). Zero regressions.

### Phase 5d — Court comparison ✅ DONE

**Completed:**
- **`GET /api/courts/compare?ids=a,b,c`** — new `courtController.compareCourts`, registered in `courtRoutes.js` in the same slot as `/recommended` (after `GET /`, before `GET /:id`) to avoid the exact route-ordering bug already fixed in Phase 3 (`/:id`'s slug lookup would otherwise swallow `compare` as a literal slug). `Court.find({_id:{$in:ids}, status:'active'}).select(...).populate('venue', ...).lean()`, response `{success, count, data}` matching `getCourts`/`getRecommendedCourts` conventions. Comparison fields: `sportType, surfaceType, courtType, dimensions, capacity, amenities, baseHourlyRate, currency, operatingHours, stats, media`, with `venue` populated for location/address/contact.
- **New validation** `compareCourtsValidation` in `courtVenueValidation.js` — a custom validator on `ids` requiring 2-5 valid Mongo ObjectIds. Unlike `getCourts`/`getRecommendedCourts` (which don't call `validationResult` for their optional numeric filters, since skipping them just falls back to safe defaults), `compareCourts` **does** call `validationResult` — a malformed `ids` list has no sane fallback, so it's actually enforced here rather than silently ignored.
- **Partial results by design** — if some requested IDs don't resolve (bad ID, inactive court), the endpoint silently returns the subset that does, consistent with `getCourts`'s existing filtering behavior; not an oversight.
- **No new deps, no model changes, no migration** — smallest sub-phase, as expected.

**Incidental fix, found while testing (unrelated to the comparison feature itself):** the global rate limiter (`src/app.js`) and the auth-route limiters (`src/routes/authRoutes.js`) are only bypassed for `NODE_ENV==='development'` by default - `'test'` still enforces them. `tests/e2e/court.test.js`'s outer `beforeEach` re-registers two users and creates a venue for *every* test in the file; adding 5 new comparison tests pushed the file over the global limiter's 100-req/15min ceiling, causing the unrelated last test in the file (`calculate-price`) to fail with a rate-limited response. Since Jest gives each test file its own module registry (and therefore its own in-memory limiter state), this was latent in the file already, not something the new tests should have had to work around individually. Fixed at the source: `tests/setup.js` now sets `DISABLE_RATE_LIMIT=true`, the same bypass flag the app already honors for local development - rate limiting itself isn't under test anywhere in this suite.

**Verification:** all 367 tests pass (26 suites) — 9 new (`court.test.js` unit + e2e: side-by-side comparison, inactive-court exclusion, missing-ids error propagation, 2-5 id range validation, malformed-id rejection, and an explicit regression test that `/compare` is never swallowed by `/:id`). Zero regressions.

### Phase 5e — 2FA (TOTP) ✅ DONE — final Phase 5 sub-phase

**Completed:**
- **New deps** `otplib`, `qrcode`. **Pinned `otplib` to `12.0.1`** rather than the current `13.x` latest - `13.x`'s default preset pulls in `@otplib/plugin-base32-scure` → `@scure/base`, which ships ESM-only (`export const ...`) with no CJS build, and this project has zero Babel/ESM transform infrastructure (every other dependency - stripe, twilio, firebase-admin, cloudinary - is plain CJS). Jest failed outright trying to `require()` it. `12.0.1`'s `@otplib/plugin-thirty-two` (base32) + `@otplib/plugin-crypto` (Node's built-in `crypto`) are both pure CJS with no transitive ESM deps, and the top-level `authenticator` API (`generateSecret`, `keyuri`, `generate`, `verify`) is unchanged between majors, so this was a zero-code-impact downgrade to keep the test suite requirement-clean rather than take on a build-tooling change for one dependency. `npm audit` flags the pinned version as deprecated - a documented, deliberate tradeoff, not an oversight.
- **`User.twoFactorAuth`** subdocument: `enabled` (default false), `secret`/`pendingSecret` (`select:false` as the primary defense, also stripped in `toJSON.transform` as defense-in-depth for the one code path - `/2fa/verify`, `/2fa/enable` - that must explicitly `.select('+twoFactorAuth.secret')`), `backupCodes` (array of `{codeHash, usedAt}` - only sha256 hashes ever persisted, same idiom as `createPasswordResetToken`).
- **New util `src/utils/twoFactor.js`** — `generateSecret`/`getQrCodeDataUrl` (wraps `otplib`'s `authenticator.keyuri` + `qrcode.toDataURL`), `verifyTotp` (catches otplib's throw-on-malformed-input and returns `false` instead), `generateBackupCodes` (10 codes, returns both plaintext-for-display-once and pre-hashed-for-storage), `consumeBackupCode` (finds+marks-used a matching unexpired hash in place on the user doc, enforcing single-use).
- **`JWTUtils.generateTwoFactorChallengeToken`/`verifyTwoFactorChallengeToken`** — a short-lived (5min) signed JWT (`type:'2fa-challenge'`), not a new DB session table, consistent with this codebase's all-JWT auth design.
- **Login hook** — `authController.login`, inserted right after the password check succeeds and before `user.lastLogin` is touched: if `user.twoFactorAuth?.enabled`, returns `{twoFactorRequired:true, challengeToken}` instead of a token pair. The pre-existing tail (token issuance) is otherwise untouched. **Google OAuth login is deliberately NOT gated** - confirmed with the user during planning; it's a documented gap, not an oversight, since gating it would mean modifying a separately-tested, already-working callback flow for a case with no concrete report yet.
- **New endpoints** under `/api/auth/2fa` (`authRoutes.js`): `POST /setup` (generates `pendingSecret` + QR), `POST /enable` (body `{code}`, promotes `pendingSecret→secret`, returns backup codes once, audit-logged), `POST /disable` (body `{password}`, re-verifies password exactly like `deleteAccount` does, audit-logged), `GET /status` (`{enabled}` only), `POST /verify` (public, body `{challengeToken, code}`, accepts either a valid TOTP or an unused backup code, completes login via the same tail `login()` uses). `/verify` gets its **own** rate limiter (`twoFactorLimiter`, 10/15min) rather than reusing the pre-existing-but-unused `authLimiter`, since it's a brute-forceable 6-digit code.
- **Validation** added to the existing single `src/middleware/validation.js` (this repo's established precedent for the auth domain, unlike courts/venues/payments which each get their own file).
- **No migration needed** — `twoFactorAuth.enabled` defaults `false`; existing users are simply opted out until they enroll.

**Incidental fix, found while testing (unrelated to 2FA itself):** none beyond the otplib pin above - no other regressions surfaced.

**Verification:** all 380 tests pass (27 suites) — 13 new (`twoFactor.test.js`: setup/enable/disable flow, already-enabled/no-pending-setup rejections, invalid-code rejection, password-gated disable; extended `auth.test.js`'s Login block: 2FA-enabled login returns a challenge not tokens, `/2fa/verify` completes login with a real `authenticator.generate()`-produced code, wrong code and garbage/expired challenge tokens both rejected, and a single-use backup code works once then is rejected on reuse). `otplib`/`qrcode` are pure offline crypto/rendering with no network calls - deliberately **not mocked**, matching the plan's original call. Zero regressions.

---

**Phase 5 complete** — all 5 cherry-picked sub-phases (wallet, loyalty, referral, court comparison, 2FA) shipped, one at a time, each independently tested. 380 tests across 27 suites, up from the 300-test/20-suite baseline at the start of Phase 5.

---

## Dependency chain

```
Step 0 (remove backdoor) ✅ DONE
   │
Phase 0 (upload infra, CORS fix, logging, cron) ✅ DONE
   │
   ├──> Phase 1 (Reviews, avatar, favorites, preferences, booking emails) ✅ DONE
   │        │
   │        └──> Phase 2 (coupons, payments, invoices, deposits) ✅ DONE
   │                 │
   │                 └──> Phase 3 (waitlist, group bookings, recommendations, push/WhatsApp) ✅ DONE
   │                          │
   └──────────────────────────┴──> Phase 4 (analytics, audit logs, support, GDPR) ✅ DONE
                                             │
                                             └──> Phase 5a (wallet) ✅ DONE ──┬──> Phase 5b (loyalty) ✅ DONE
                                                                              ├──> Phase 5c (referral) ✅ DONE
                                                                              ├──> Phase 5d (court comparison) ✅ DONE
                                                                              └──> Phase 5e (2FA) ✅ DONE
```

## Testing approach (applies to every phase)

Follow the existing `tests/unit` + `tests/e2e` split (Jest + `mongodb-memory-server` + `supertest`), one file per new model/controller mirroring current naming conventions:
- Unit tests for schema/instance-method logic (rating aggregation hooks, refund calculations, promo validity).
- E2E tests for full route flows against the in-memory Mongo app instance.
- Mock all new external SDKs in tests (`cloudinary`, `stripe`, `twilio`, `firebase-admin`) via `jest.mock(...)` so CI never makes live network calls; extend test env setup with dummy credentials so modules don't throw on import.
- Export cron job bodies as plain functions so they're testable without real timers.

## Verification

- After Step 0: server boots cleanly, no unexpected network activity, `git diff` on `server.js`/`.gitignore` is minimal and clean. ✅ Confirmed.
- After each subsequent phase: run `npm test` (Jest unit + e2e suites) and manually exercise new endpoints via the existing Swagger UI at `/api-docs`.
