# Court Booking API — Frontend Integration Guide

This document describes everything the backend (`court-booking-api`, Express 5 + Mongoose) provides to a client application: every endpoint, request/response shape, auth rules, validation rules, error conditions, and the business logic a frontend must model to use the system correctly. It intentionally says nothing about UI/UX — only what data exists, when it changes, and what flows the frontend needs to drive.

A live interactive spec is also served by the backend itself at `GET /api-docs` (Swagger UI). This document is the narrative, cross-referenced version of the same surface, plus business logic that doesn't show up in a bare OpenAPI spec.

---

## 1. Conventions & Architecture

### 1.1 Base URL & health check
- All API routes are mounted under `/api/*`.
- `GET /health` → `{ success: true, message: "Court Booking API is running", timestamp, environment }` — useful for a frontend connectivity check.
- `GET /` → plain text `"Server is running"`.

### 1.2 Response envelope
Nearly every endpoint returns JSON of one of these shapes:

**Success**
```json
{ "success": true, "message": "...", "data": { /* or array */ } }
```
Some endpoints omit `message` or `data` where not meaningful (e.g. simple deletes just return `{ success, message }`).

**List/paginated success** (used by every list endpoint — bookings, reviews, favorites, payments, wallet/loyalty ledgers, promo codes, audit logs, support tickets):
```json
{ "success": true, "count": 20, "total": 143, "totalPages": 8, "currentPage": 1, "data": [ /* items */ ] }
```
A few read-only "single page" endpoints (venues `/nearby`, courts `/recommended`, `/compare`, venue's `/courts`) intentionally skip the pagination envelope and just return `{ success, count, data }`.

**Validation failure** (express-validator, HTTP 400):
```json
{ "success": false, "message": "Validation failed", "errors": [ { "field": "email", "message": "Please provide a valid email address", "value": "not-an-email" } ] }
```
Some newer domains (analytics, audit logs, promo codes) return the raw express-validator array shape instead: `{ success: false, errors: [...] }` (no top-level `message`) — always check for `errors` array presence rather than relying on `message` to detect a validation failure.

**Generic error**:
```json
{ "success": false, "message": "Human readable reason" }
```
Status codes used throughout: `400` (validation / bad state), `401` (auth required or bad credentials/token), `403` (authenticated but not permitted), `404` (not found), `409` (conflict, e.g. double-booked slot), `429` (rate limited), `500` (unhandled server error).

The global error handler (`src/middleware/errorHandler.js`) normalizes a few backend error classes into this envelope automatically: Mongoose `CastError` → 404 "Resource not found"; duplicate key (`11000`) → 400 (special-cased message "Email address is already registered" for email conflicts); Mongoose `ValidationError` → 400 with concatenated field messages; JWT errors → 401 "Invalid token" / "Token expired"; Multer upload errors → 400 with the multer message.

### 1.3 Authentication
- Bearer JWT in `Authorization: Bearer <accessToken>` header.
- Three auth postures per route, enforced by `src/middleware/auth.js`:
  - **`authenticate`**: token required. Missing/invalid/expired → 401. Loads the user from DB and checks `isActive`; deactivated/anonymized accounts are rejected (401 "User not found or inactive").
  - **`optionalAuthenticate`**: token is read if present and valid, sets `req.user`, but a missing/bad token never blocks the request — it just proceeds unauthenticated. Used for endpoints that are public but personalize behavior when logged in (venue/court detail pages track "recently viewed"; review/booking list endpoints scope results if a user happens to be logged in).
  - **Public**: no auth middleware at all.
- **`authorize(...roles)`** layers role-gating on top of `authenticate`. Roles: `user | owner | manager | admin`. No `req.user` → 401 "Authentication required"; wrong role → 403 "Insufficient permissions".
- **`requireEmailVerification`**: applied only to `POST /api/bookings` (booking creation). Unverified users get 403 `{ message: "Email verification required", code: "EMAIL_NOT_VERIFIED" }` — the frontend should special-case this `code` to prompt "please verify your email" rather than a generic error toast.

**Tokens** (`src/utils/jwt.js`):
| Token | Payload | Expiry | Signed with |
|---|---|---|---|
| Access token | `{userId, type:'access'}` | `15m` (env `JWT_EXPIRE`) | `JWT_SECRET` |
| Refresh token | `{userId, type:'refresh'}` | `30d` (env `JWT_REFRESH_EXPIRE`) | `JWT_REFRESH_SECRET` |
| 2FA challenge token | `{userId, type:'2fa-challenge'}` | fixed 5m | `JWT_SECRET` |

Both carry `issuer:'court-booking-api'`, `audience:'court-booking-client'`. Refresh tokens are also persisted server-side on the user document (`refreshTokens[]`, each with its own 30-day Mongo TTL, capped to the **last 5 issued** — logging in on a 6th device silently evicts the oldest). `POST /api/auth/refresh` rotates the token: the old refresh token is invalidated and a new pair is issued, so the frontend must always store and use the *latest* refresh token returned, discarding the previous one. There is no separate "session" concept beyond these two token types — access tokens are short-lived and refreshed via the refresh token, exactly like a standard JWT rotation scheme.

### 1.4 Roles
`user` (default for all self-registered accounts) → `owner` (venue/court owner) → `manager` (delegated by an owner on specific venues/courts) → `admin` (platform staff). Ownership is per-resource (a `Venue.owner`/`Venue.managers`, `Court.owner`/`Court.managers`), not a single global "I am an owner" flag — a user with `role: 'owner'` only gets elevated access on venues/courts where they are actually listed as owner or manager; `role` mainly gates which *endpoints* are reachable at all, while per-resource fields gate *which* records within that endpoint the user can act on. `admin` bypasses per-resource scoping everywhere.

### 1.5 Rate limiting
- Global limiter: 100 requests / 15 min per IP, applied to everything except in `development`/when `DISABLE_RATE_LIMIT=true`. Over-limit response: 429 `{ success:false, message:"Too many requests from this IP, please try again later." }`.
- `/api/auth/refresh` and `/api/auth/forgot-password`: an additional 100/15min limiter (currently redundant with the global one, same numbers).
- `/api/auth/2fa/verify`: its own 10/15min limiter (brute-force protection on the 6-digit code / backup codes).
- Frontend should treat 429 as retryable-after-a-wait, not a hard failure to surface as a bug.

### 1.6 Money & units
All monetary fields across the entire API (`Booking.pricing.*`, `Court.baseHourlyRate`, `Payment.amount`, wallet/loyalty ledgers, promo code discount values) are **major currency units** (e.g. `2100` = "2100.00 PKR"), never cents. The only cents/minor-unit conversion boundary in the whole system is internal, at the Stripe SDK call site — nothing the frontend sends or receives is ever in cents. Default currency across the app is `PKR`.

### 1.7 IDs, slugs, and geolocation
- Venues and Courts both support lookup by either Mongo ObjectId or a generated `slug` on their `GET /:id` detail routes.
- GeoJSON coordinates are stored/queried as `[longitude, latitude]` (note the order) with `maxDistance` in **meters**.

---

## 2. Auth & User Management (`/api/auth`)

### 2.1 Endpoint reference

| Method & Path | Auth | Notes |
|---|---|---|
| POST /register | Public | Create account, auto-logs in |
| GET /google | Public | Redirect into Google OAuth |
| GET /google/callback | Public (Google) | Redirects to frontend with tokens in query string |
| POST /login | Public | Returns tokens, or a 2FA challenge |
| POST /2fa/verify | Public (rate-limited 10/15min) | Completes a 2FA-gated login |
| POST /refresh | Public (rate-limited) | Rotates access+refresh token pair |
| POST /logout | Bearer | Revokes one refresh token |
| POST /logout-all | Bearer | Revokes all refresh tokens (all devices) |
| GET /profile | Bearer | Get own profile |
| PUT /profile | Bearer | Update own profile |
| PUT /change-password | Bearer | Requires current password; invalidates all sessions |
| POST /forgot-password | Public (rate-limited) | Always 200, no user enumeration |
| POST /reset-password | Public | Consumes reset token; invalidates all sessions |
| GET /verify-email | Public | Consumes email-verification token (query `?token=`) |
| POST /resend-verification | Bearer | Re-sends verification email |
| PUT /avatar | Bearer, multipart | Uploads avatar image |
| GET /preferences | Bearer | Notification/language/currency prefs |
| PUT /preferences | Bearer | Update prefs |
| GET /recently-viewed | Bearer | Last 20 viewed courts/venues |
| POST /device-tokens | Bearer | Register push token |
| DELETE /device-tokens | Bearer | Unregister push token |
| GET /data-export | Bearer | GDPR data export (JSON) |
| DELETE /account | Bearer | GDPR account anonymization |
| POST /2fa/setup | Bearer | Generates TOTP secret + QR |
| POST /2fa/enable | Bearer | Activates 2FA, returns backup codes once |
| POST /2fa/disable | Bearer | Requires password |
| GET /2fa/status | Bearer | `{ enabled }` |

### 2.2 Registration — `POST /api/auth/register`
Body:
```json
{
  "firstName": "string, 2-50 chars, letters/spaces only",
  "lastName": "string, 2-50 chars, letters/spaces only",
  "email": "valid email",
  "password": "optional but effectively required for manual login; min 8 chars, must contain upper+lower+digit+special char (@$!%*?&)",
  "confirmPassword": "must match password",
  "phone": "optional, e.g. +923001234567",
  "dateOfBirth": "optional ISO8601 date, must be in the past",
  "gender": "male | female | other (required)",
  "profilePicture": { "url": "optional valid URL", "publicId": "optional string" },
  "referralCode": "optional string, 4-20 chars"
}
```
Business logic:
- Duplicate email → 400 "User with this email already exists".
- `referralCode`, if present, is matched case-insensitively; an unknown/invalid code is **silently ignored** — it never blocks signup.
- Every new user (referred or not) gets their own unique `referralCode` generated automatically.
- If a valid referral code was used, a `Referral` record is created (`status: pending`) linking referrer → new user. It only pays out later — see §5.4.
- An email verification token (24h expiry) is generated and a verification email sent (best-effort; failure doesn't block registration).
- Registration **immediately logs the user in** — response includes both `user` and a token pair.

201 response:
```json
{ "success": true, "message": "User registered successfully. Please check your email for verification.", "data": { "user": { /* User, see §2.9 */ }, "tokens": { "accessToken": "...", "refreshToken": "..." } } }
```

### 2.3 Google OAuth — `GET /api/auth/google`, `GET /api/auth/google/callback`
Standard OAuth2 redirect flow (`passport-google-oauth20`). First-time Google sign-in auto-creates a `User` with `isEmailVerified: true`, `provider: 'google'`, no password. **Important**: a Google login is matched only by `googleId` — if a manual account already exists with the same email, Google sign-in creates a *second*, separate user record rather than linking them. On success the callback **redirects** (not a JSON response) to a configured frontend URL with `?accessToken=...&refreshToken=...` in the query string — the frontend must parse tokens from the URL after this redirect, not from a fetch response body. **2FA is not enforced on the Google login path** even if the account has 2FA enabled — a documented gap, not a bug to work around.

### 2.4 Login — `POST /api/auth/login`
Body: `{ email, password }`. Order of checks: unknown user or inactive → 401 "Invalid credentials"; Google-only account (no password set) → 400 "This account is registered with Google. Please login via Google."; unverified email → 401 "Please verify your email"; wrong password → 401 "Invalid credentials" (same message as unknown user, deliberately, to avoid leaking which case occurred).

If the account has 2FA enabled, login does **not** return tokens yet:
```json
{ "success": true, "message": "Two-factor authentication code required", "data": { "twoFactorRequired": true, "challengeToken": "..." } }
```
The frontend must then prompt for a 6-digit code (or a backup code) and call `POST /api/auth/2fa/verify` with `{ challengeToken, code }` to obtain real tokens (same response shape as a normal login success). The challenge token expires in 5 minutes. If not present, `/login` completes normally with `{ user, tokens }` exactly like registration's response.

### 2.5 Two-Factor Authentication (TOTP)
- `POST /2fa/setup` (bearer): generates a pending TOTP secret. 400 if already enabled. Returns `{ qrCodeDataUrl, manualEntryKey }` — render the QR (a data URL, directly usable as an `<img src>`) or show the manual key for apps like Google Authenticator/Authy.
- `POST /2fa/enable` (bearer): body `{ code }` — the 6-digit code generated by the authenticator app against the pending secret. 400 if no pending setup exists (must call `/setup` first) or if the code is wrong. On success, returns a **one-time list of 10 backup codes** — the frontend must display these to the user immediately and prominently (e.g. "save these somewhere safe") since they are never retrievable again (only hashes are stored server-side).
- `POST /2fa/disable` (bearer): body `{ password }` — required even if login was recently confirmed; Google-only accounts without a password skip this check. 400 "Password is incorrect" on mismatch.
- `GET /2fa/status` (bearer): `{ enabled: boolean }` — use this to render the account-security page toggle state.
- `POST /2fa/verify` (public): completes a login that returned `twoFactorRequired: true`. Accepts either a live TOTP code or one of the 10 backup codes (single-use — a backup code is invalidated the moment it's used, so surface that in the UI once consumed).

### 2.6 Token lifecycle
- `POST /refresh`: body `{ refreshToken }`. Old token is invalidated, a new pair returned — always persist and use the newest refresh token. Invalid/expired/unknown token → 401.
- `POST /logout`: optional body `{ refreshToken }` — revokes just that device's session. Omit to just clear local tokens without server-side revocation (though passing it is preferable for correctness).
- `POST /logout-all`: revokes every refresh token for the account (all devices/sessions).
- Changing password (`PUT /change-password`) and completing a password reset (`POST /reset-password`) both **force-invalidate every refresh token** — the frontend must treat these as "you will be logged out everywhere, please log in again," not just on the current device.

### 2.7 Password reset & email verification
- `POST /forgot-password` (`{ email }`): **always** returns 200 regardless of whether the email exists (no account enumeration) — message `"If the email exists, a password reset link has been sent."`. Reset token expires in **10 minutes**.
- `POST /reset-password` (`{ token, password, confirmPassword }`): 400 "Invalid or expired reset token" if the token is wrong/expired.
- `GET /verify-email?token=...`: consumes the emailed link. 400 if missing/invalid/expired token.
- `POST /resend-verification` (bearer): 400 "Email is already verified" if already done.

### 2.8 Profile, avatar, preferences
- `GET/PUT /profile`: PUT whitelists `firstName, lastName, phone, dateOfBirth, gender, profilePicture` only — any other field in the body is silently dropped, so don't rely on this endpoint to change `email`, `role`, or wallet/loyalty fields.
- `PUT /avatar`: multipart, field name **`avatar`**, single image, ≤5MB, JPEG/PNG/WEBP/GIF only. Replaces and deletes the previous Cloudinary asset.
- `GET/PUT /preferences`: `preferences.notifications.{email, whatsapp, push}` (booleans; note the field is `whatsapp`, **not** `sms`), `preferences.language` (2-10 char code), `preferences.currency` (exactly 3 chars, e.g. `PKR`). These flags directly gate which notification channels the backend will actually use for booking events (see §4 business logic) — the frontend's settings screen is the only place users can change them.
- `GET /recently-viewed`: last 20 courts/venues the user viewed (de-duplicated, most-recent-first), auto-populated. Tracked automatically when the user hits `GET /api/courts/:id` or `GET /api/venues/:id` while authenticated — no explicit "mark as viewed" call needed from the frontend.
- `POST/DELETE /device-tokens`: register/unregister a push notification token. Body `{ token, platform }` where `platform ∈ {ios, android, web}` on register; capped at the 10 most recent tokens per user.

### 2.9 GDPR — data export & account deletion
- `GET /data-export`: returns the user's own `profile`, `bookings`, `payments`, `reviews`, `favorites`, `supportTickets` as one JSON payload plus `exportedAt`. Suitable to offer as a "Download my data" button.
- `DELETE /account` (`{ password }`): this is **anonymization, not a hard delete**. On success the account's PII is scrubbed (name → "Deleted User", email → `deleted-<id>@anonymized.com`, phone/DOB/gender/avatar cleared, all sessions/device tokens/recently-viewed cleared, all notification prefs disabled), `isActive` set false, `deletedAt` stamped. The user's `Favorite` records are hard-deleted. Their `Booking`/`Payment`/`Review` history is **kept** (referencing the now-anonymized user) for financial/audit integrity — don't expect these to disappear from admin-side reports. Frontend should treat a successful call as "goodbye, logged out everywhere," and never attempt to log back in with the old credentials.

### 2.10 User object shape (as returned to the client)
Fields always present: `_id, firstName, lastName, email, gender, phone, dateOfBirth, profilePicture:{url,publicId}, isEmailVerified, role (user|owner|manager|admin), isActive, provider (manual|google), lastLogin, preferences:{notifications:{email,whatsapp,push}, language, currency}, recentlyViewed:[], deviceTokens:[{token,platform,addedAt}], walletBalance, loyaltyPoints, referralCode, referredBy, twoFactorAuth:{enabled}, createdAt, updatedAt`.

Never returned to the client (stripped in the `toJSON` transform): `password`, `passwordResetToken`/`passwordResetExpires`, `emailVerificationToken`/`emailVerificationExpires`, `refreshTokens`, `twoFactorAuth.secret`, `twoFactorAuth.pendingSecret`, `twoFactorAuth.backupCodes`.

---

## 3. Venues & Courts

Venues are physical locations; a Venue has many Courts. Both support search, geolocation, media, and an owner/manager delegation model.

### 3.1 Venue endpoints (`/api/venues`)

| Method & Path | Auth | Purpose |
|---|---|---|
| POST / | Bearer | Create a venue |
| GET / | Public | Search/list venues |
| GET /nearby | Public | Geo-proximity search |
| GET /my-venues | Bearer | Venues I own/manage |
| GET /:id | Optional auth | Detail (id or slug) |
| PUT /:id | Owner/manager/admin | Update |
| DELETE /:id | Owner/admin | Delete (blocked if it still has courts) |
| POST /:id/media, DELETE /:id/media/:mediaId | Owner/manager/admin | Photos/videos/virtual tours |
| PATCH /:id/status | Owner/admin | active/inactive/pending-verification/suspended |
| POST /:id/verify | Admin | Marks verified, may auto-activate |
| POST /:id/verification-documents | Owner or admin | Upload a compliance doc reference |
| PATCH /:id/verification-documents/:docId | Admin | Approve/reject a document |
| POST /:id/update-stats | Owner/admin | Force stats recompute |
| GET /:venueId/courts | Public | Courts belonging to a venue |

**Search/list (`GET /`)** query params: `search` (full-text), `city`/`state`/`country` (partial match), `latitude`+`longitude`+`maxDistance` (geo filter, meters, default 10000), `minRating`, `amenities` (comma list of boolean amenity keys, e.g. `parking,wifi`), `status` (only respected for admins — everyone else is forced to `active`), `isFeatured`/`isPromoted` (`"true"`), `sortBy` (default `-stats.averageRating`), `page`/`limit` (1-100, default 20). `verification.documents` is always stripped from every list/detail response for privacy — don't expect raw compliance documents in any Venue payload.

**`GET /nearby`**: requires `latitude`+`longitude` (400 without them); `maxDistance` meters (default 10000), `limit` (default 20). No pagination envelope, just `{ success, count, data }`.

**`GET /:id`**: works with either the Mongo ID or the venue's `slug`. Non-`active` venues 404 for anyone except the owner/admin. Response includes a computed `activeCourtsCount` (not a stored field). Viewing while logged in silently records the venue in the user's `recentlyViewed`.

**Update authorization**: owner, listed manager, or admin. Non-owner/admin managers cannot change `status`, `verification`, or the `managers` list itself via `PUT /:id` (those keys are silently stripped if a manager sends them) — only admins/owners can touch those.

**Verification workflow**: uploading a document (`POST /verification-documents`) is owner/admin-only (managers cannot). Admin then reviews each document individually (`PATCH /verification-documents/:docId`, `status: approved|rejected`) and separately marks the whole venue verified (`POST /:id/verify`), which also auto-flips `status` from `pending-verification` to `active`. There is no owner self-verify path — a new venue effectively stays `pending-verification` (and thus invisible to normal search) until an admin explicitly verifies it.

**Media** (`POST/DELETE /:id/media`): client supplies an already-hosted `url` (+ optional Cloudinary `publicId`) — **there is no file-upload endpoint here**, the frontend uploads to Cloudinary (or wherever) itself first and just registers the resulting URL. Accepts a single object or an array (bulk add). Fields: `type` (`image|video|virtual-tour`), `url` (required), `publicId`, `altText`, `isPrimary`, `order`. The first media item ever added, or any item explicitly flagged `isPrimary`, becomes the primary image; adding a new primary un-flags the previous one.

**Stats propagation is not fully automatic** — `Venue.stats` (`totalCourts, totalBookings, totalRevenue, averageRating, totalReviews`) is recomputed on: court create/delete, `POST /:id/update-stats`, and implicitly whenever a review changes court ratings (§6). It is **not** recomputed on every single booking — don't assume `stats.totalBookings`/`totalRevenue` are live-real-time; treat them as "recently refreshed," and use the Analytics endpoints (§8) for anything that needs to be trustworthy in real time.

### 3.2 Court endpoints (`/api/courts`)

| Method & Path | Auth | Purpose |
|---|---|---|
| POST / | owner/manager/admin (+ must own/manage the venue) | Create a court under a venue |
| GET / | Public | Search/list courts |
| GET /recommended | Public | Featured/scored recommendations |
| GET /compare?ids=a,b,c | Public | Side-by-side comparison, 2-5 ids |
| GET /:id | Optional auth | Detail (id or slug) |
| PUT /:id | Owner/manager/admin (court or parent venue) | Update |
| DELETE /:id | Owner/admin | Delete (**no active-booking check — proceeds unconditionally**) |
| POST/DELETE /:id/media/:mediaId | Owner/manager/admin | Photos/videos |
| POST/PUT/DELETE /:id/pricing-rules[/:ruleId] | Owner/manager/admin | Peak/off-peak/seasonal pricing |
| POST/DELETE /:id/availability-exceptions[/:exceptionId] | Owner/manager/admin | Holidays/maintenance/blackouts |
| POST /:id/calculate-price | Public | Price preview for a time slot |
| POST /:id/check-availability | Public | Schedule-availability check (not booking-conflict check) |
| PATCH /:id/status | Owner/manager/admin | active/inactive/maintenance/temporarily-closed |

`GET /recommended` and `GET /compare` are registered **before** `GET /:id` in the router — this matters only if you're reasoning about the backend's own routing, not something the frontend needs to work around; just call the documented paths.

**Search/list (`GET /`)**: `venue`, `sportType`, `courtType`, `surfaceType` (exact filters), `minPrice`/`maxPrice` (on `baseHourlyRate`), `minRating`, `amenities` (comma list), `search` (text), `isFeatured`, `status` (forced to `active` unless requester is owner/manager/admin), `sortBy` (default `-stats.averageRating`), `page`/`limit`.

**`GET /recommended`**: optional `latitude`/`longitude` for proximity (15km radius via nearby venues; silently falls back to a global query if none are nearby — never errors or returns empty just because geo missed), `limit` (default 10, max 50). Ranking is a composite score: `+50` if the court is admin-flagged `isFeatured`, `+10` per average-rating star (max 50), `+0.4` per review up to 50 reviews (max 20), plus a recency bonus that starts at 15 and linearly fades to 0 by ~90 days after creation. No pagination — single page, sorted by score descending.

**`GET /compare?ids=`**: `ids` must be 2-5 comma-separated valid Mongo IDs (this is one of the few filter endpoints where validation is strictly enforced — a malformed id list returns 400, not a silently-degraded result). Only `active` courts among the given ids are returned, so requesting 5 ids can validly come back with fewer results (e.g. one inactive/deleted). Selected fields: `name, slug, sportType, surfaceType, courtType, dimensions, capacity, amenities, baseHourlyRate, currency, operatingHours, stats, media`, plus the parent `venue` (name/address/location/contact) populated — enough to build a comparison table without a second fetch per court.

**`GET /:id`**: id-or-slug. Non-`active` courts 404 unless the requester is the court's own owner or an admin (note: unlike the mutation endpoints, a venue owner/manager who isn't directly on the court's own `owner`/`managers` does *not* get visibility into a non-active court here). Populates the *entire* parent venue document. Viewing while logged in records it in `recentlyViewed`.

**Pricing preview — `POST /:id/calculate-price`** (public, no auth, no side effects): body `{ startTime, endTime, membershipTier?, groupSize?, isEarlyBird? }`. Finds any matching `pricingRule` for that time slot (day-of-week + time-of-day + active date range, highest `priority` wins) to override the base hourly rate, multiplies by duration, then layers matching `discountRules` (membership tier match, `groupSize >= rule.minGroupSize`, or early-bird flag) cumulatively — each rule is either a flat amount or a percentage off the running total. Result is floored at 0. Returns `{ baseRate, totalPrice, currency, duration (minutes), startTime, endTime }`. **The frontend should call this to show a live price quote before booking** — it is exactly the pricing logic actually applied at booking creation.

**Availability check — `POST /:id/check-availability`** (public): body `{ startTime, endTime }`. Checks the court's `status`, weekly `operatingHours`, and any date-specific `availabilityExceptions` (holidays/maintenance/blackouts). Returns `{ available, reason?, startTime, endTime }`. **This endpoint does not check for conflicting bookings** — it only tells you whether the court is scheduled to be open at all during that window. For a real "is this slot still bookable" check (including other people's reservations), use `POST /api/bookings/check-availability` or `GET /api/bookings/available-slots/:courtId` (§4.2) instead — treat this court-level endpoint as a first-pass filter (e.g. graying out days the venue is closed), not the final word on bookability.

**Pricing rules / availability exceptions / maintenance**: these are owner/manager-authored scheduling primitives, not something an end-user books through directly, but the frontend booking UI should reflect them: `pricingRules[].type ∈ {peak, off-peak, weekend, weekday, seasonal, holiday, promotional, early-bird, last-minute}`; `availabilityExceptions[].type ∈ {holiday, maintenance, special-event, blackout, custom}` (each defaults `isAvailable: false` — i.e. an exception is assumed to be closing the court unless explicitly marked otherwise); `court.maintenanceSchedule[]` populated when `PATCH /:id/status` sets `status: 'maintenance'` with a `reason`.

### 3.3 Court/Venue schema highlights (fields returned to the client)

**Venue**: `name, displayName, description, address:{street,city,state,country,postalCode,landmark}, location:{type:'Point', coordinates:[lng,lat], googleMapsUrl}, contact:{primaryPhone,secondaryPhone,email,website,socialMedia}, defaultOperatingHours[{dayOfWeek(0=Sun),openTime,closeTime,isClosed}], timezone, amenities{...many booleans/objects}, media[], owner, managers[], settings:{requiresApproval, allowOnlineBooking, allowWalkIn, maxAdvanceBookingDays, cancellationPolicy:{allowCancellation,cancellationWindowHours,refundPercentage}, paymentSettings:{acceptCash,acceptCard,acceptOnlinePayment,requireDeposit,depositPercentage}}, status(active|inactive|pending-verification|suspended), verification:{isVerified,verifiedAt,verifiedBy}, stats:{totalCourts,totalBookings,totalRevenue,averageRating,totalReviews}, slug, tags[], isFeatured, isPromoted, createdAt, updatedAt`. Virtuals: `primaryImage`, `fullAddress`.

**Court**: `name, courtNumber, description, venue, sportType(tennis|badminton|squash|basketball|volleyball|pickleball|table-tennis|futsal|other), surfaceType, courtType(indoor|outdoor|covered), dimensions:{length,width,unit}, capacity:{minPlayers,maxPlayers}, amenities{...booleans}, accessibility{...booleans+notes}, media[], baseHourlyRate, currency, pricingRules[], discountRules[], bookingSettings:{minBookingDuration,maxBookingDuration,bookingInterval,advanceBookingDays,sameDayBookingCutoff,bufferTimeBetweenBookings,allowRecurringBookings,allowPartialBooking,maxConcurrentBookingsPerUser,requiresApproval}, operatingHours[{dayOfWeek,openTime,closeTime,isClosed,breakTimes[]}], availabilityExceptions[], status(active|inactive|maintenance|temporarily-closed), maintenanceSchedule[], owner, managers[], stats:{totalBookings,totalRevenue,averageRating,totalReviews,occupancyRate}, slug, tags[], isFeatured, isVerified, createdAt, updatedAt`. Virtuals: `primaryImage`, `isCurrentlyOpen`.

`court.bookingSettings` is the source of truth the frontend booking form must respect: minimum/maximum booking duration, the slot-snapping interval, how many days in advance bookings are allowed, same-day cutoff, whether recurring bookings are allowed at all for this court, and the max number of concurrent active bookings one user can hold on this court (booking creation enforces this server-side and will reject over the cap — see §4).

---

## 4. Bookings (`/api/bookings`)

This is the core transactional domain. A booking's `status` field is a state machine; pricing, payment, waitlisting, group participants, and recurring series are all facets of the same `Booking` document.

### 4.1 Endpoint reference

| Method & Path | Auth | Purpose |
|---|---|---|
| POST / | Bearer + verified email | Create a booking (single, recurring, or join a waitlist) |
| GET / | Bearer | List bookings (scoped; admins/owners/managers see more) |
| POST /check-availability | Public | Real conflict check against existing bookings |
| GET /available-slots/:courtId?date= | Public | Full day broken into interval slots, each flagged available |
| GET /my-bookings | Bearer | Current user's bookings + summary stats |
| GET /:id | Bearer | Detail (accepts Mongo id or human `bookingNumber`) |
| PUT /:id | Owner or admin | Reschedule / edit notes / group size |
| DELETE /:id | Owner, venue/court owner, or admin | Cancel (with refund calc) |
| POST /:id/approve | owner/manager/admin (of that court/venue) | Approve a pending booking |
| POST /:id/reject | owner/manager/admin | Reject a pending booking (100% refund) |
| POST /:id/check-in | Owner or staff | Move confirmed → in-progress |
| POST /:id/check-out | Owner or staff | Move in-progress → completed |
| POST /:id/participants | Owner or group leader | Invite a group-booking participant |
| POST /:id/participants/:pid/respond | Self, owner, or leader | Accept/decline an invite |
| DELETE /:id/participants/:pid | Self, owner, or leader | Remove a participant |

### 4.2 Creating a booking — `POST /api/bookings`
Body:
```json
{
  "court": "courtId (required)",
  "startTime": "ISO8601, must be future",
  "endTime": "ISO8601, after startTime",
  "bookingType": "single | recurring (default single)",
  "recurringPattern": { "frequency": "daily|weekly|monthly", "interval": 1, "daysOfWeek": [1,3,5], "endDate": "ISO8601", "occurrences": 12 },
  "groupSize": 1,
  "isGroupBooking": false,
  "joinWaitlist": false,
  "useWallet": false,
  "couponCode": "optional promo code string",
  "participants": [ /* optional, see §4.6 */ ],
  "notes": "≤1000 chars",
  "specialRequests": "≤500 chars",
  "contactInfo": { "name": "", "email": "", "phone": "" }
}
```
Validation & business rules, in the order the backend checks them:
1. Court must exist and be `active` (404 / 400).
2. Duration must fall within the court's `bookingSettings.minBookingDuration`/`maxBookingDuration` (400).
3. `court.isAvailableForSlot()` must pass (open, not closed that weekday, not blacked out) — 400 with the specific `reason` if it fails.
4. **Conflict check** against other bookings on that exact court+time. If a conflict exists and `joinWaitlist` was **not** set → **409** with `{ conflicts: [{bookingNumber, startTime, endTime, status}] }`. If `joinWaitlist: true`, the booking is created anyway with `status: 'waitlisted'` instead of erroring (not allowed for `bookingType: 'recurring'` — 400 if combined).
5. Per-user concurrency cap: if the user already has `maxConcurrentBookingsPerUser` active (`pending-confirmation`/`confirmed`) bookings on this court, further bookings are rejected (400).
6. If `couponCode` given: looked up, validated against amount/venue/court/date-window/usage-limit rules (400 with the specific reason on failure — see §5.5), and applied as a `pricing.discounts[]` entry of type `coupon`.
7. Pricing computed via the same engine as `POST /courts/:id/calculate-price` (§3.2) — **call that endpoint first to show the user a live quote**, since the numbers should match exactly.
8. If `useWallet: true`, the wallet is debited up to `min(walletBalance, totalAmount)` immediately after creation — full coverage marks the booking paid instantly (no Stripe step needed); partial coverage leaves the remainder for a normal Stripe payment (§5.1). Insufficient/zero balance silently skips wallet usage — never an error.
9. Whether the booking lands in `confirmed` or `pending-confirmation` depends on `court.bookingSettings.requiresApproval` / `venue.settings.requiresApproval`.

201 response for a single booking: `{ success, message, data: <booking> }` (message varies: `"Added to waitlist at position N"`, `"Booking created and awaiting approval"`, or `"Booking confirmed successfully"`). For a recurring series: `data: { parentBooking, recurringBookings: [...], totalBookings }` — occurrences that individually conflict are **silently skipped** (no error for the whole request), so compare `totalBookings` against the expected occurrence count to detect gaps and inform the user.

### 4.3 Checking availability before booking
Two public, no-auth endpoints exist specifically so the frontend can build a real calendar/slot picker without needing a login:
- `POST /api/bookings/check-availability` — body `{ court, startTime, endTime }` → `{ available, reason? }` (schedule issue) or `{ available, conflicts: [...] }` (booking overlap). Use this for a specific candidate slot the user picked.
- `GET /api/bookings/available-slots/:courtId?date=YYYY-MM-DD&interval=30` — returns the whole day pre-sliced into `interval`-minute blocks (15-180 allowed, default 30), each with `{ startTime, endTime, available }`. **Use this to render a slot-picker grid** rather than looping `check-availability` per slot client-side.

### 4.4 Listing & viewing bookings
- `GET /my-bookings`: supports `status` filter and an `upcoming: true` shortcut (forces `status ∈ {confirmed, pending-confirmation}` AND future `startTime`, overriding any explicit `status` you also pass). Response includes a `stats` block: `{ totalBookings, activeBookings, statusBreakdown: [{_id: status, count, totalSpent}] }` — handy for a "my bookings" dashboard header without a separate analytics call.
- `GET /`: broader listing; non-admin users are scoped to their own bookings unless they're querying by a `court`/`venue` they own or manage (in which case they see that resource's bookings across all users) — normal end users cannot pass an arbitrary `user` filter to see someone else's bookings (that only works for admins).
- `GET /:id`: accepts either the booking's `_id` or its human-readable `bookingNumber` (e.g. `BK260715-0001`) interchangeably — convenient for building a "look up my booking by confirmation number" support flow. 403 for anyone who isn't the booking's own user, the court owner, the venue owner, or an admin (note: court/venue *managers* are not included in this specific check — only in the list/approve endpoints).

### 4.5 Booking status state machine

```
pending-confirmation ──approve──> confirmed ──check-in (≤15min early)──> in-progress ──check-out──> completed
        │                              │
        └──reject/cancel──> cancelled <┘──cancel──> cancelled
        │
        └──(tentative hold expires)──> expired

confirmed ──(no check-in, 30+min past start, background job)──> no-show

(any create with joinWaitlist:true + conflict) ──> waitlisted ──(slot frees up)──> confirmed | pending-confirmation
```
Notes the frontend must encode:
- **`rejected` is not a distinct status** — rejecting a pending booking (`POST /:id/reject`) sets `status: 'cancelled'` with `rejectionReason` populated and a 100% refund, not some separate "rejected" value. If you need to distinguish "owner rejected" from "user cancelled" in the UI, check `rejectionReason` presence.
- `in-progress`/`completed`/`no-show`/`expired` transitions can happen **automatically via a background job** (not directly caused by any frontend call) — check-in/check-out endpoints exist for staff-operated flows (e.g. front-desk tablet), but a booking will still auto-complete once its `endTime` passes even if nobody calls check-out, and auto-flip to `no-show` if nobody checked in ~30 minutes after `startTime`. Poll or refetch booking status rather than assuming it's static once `confirmed`.
- `canBeModified()` (gates `PUT /:id`): only from `confirmed`/`pending-confirmation`, and only with ≥2 hours left before `startTime`.
- `canBeCancelled()` (gates `DELETE /:id`): blocked once already `cancelled`/`completed`/`no-show`, or once `startTime` is in the past.
- A **"leave a review" CTA should only be shown** when `status === 'completed'` **and** `isReviewed === false` (§6 covers the review call itself).

### 4.6 Rescheduling — `PUT /api/bookings/:id`
Body: any of `startTime`, `endTime`, `notes`, `specialRequests`, `groupSize`, `modificationReason`. If time changes, the backend re-runs the same conflict check (409 on overlap) and re-validates against the court's schedule (400 on schedule violation), then **recalculates only `pricing.totalAmount`** (not tax/discounts/subtotal individually) via the pricing engine. Every reschedule is appended to `modificationHistory` (before/after time + price + reason) — useful if you want to show a "booking history" audit trail on the detail page. Owner or admin only.

### 4.7 Cancellation & refunds — `DELETE /api/bookings/:id`
Body: `{ reason }` (required, 10-500 chars). Refund percentage is purely time-based off how far out `startTime` is at the moment of cancellation:

| Time before start | Refund |
|---|---|
| ≥ 24 hours | 100% |
| ≥ 12 hours | 75% |
| ≥ 6 hours | 50% |
| ≥ 2 hours | 25% |
| < 2 hours | 0% (not refund-eligible) |

If the booking was paid and is refund-eligible, the refund is split proportionally between however the original payment was funded: the wallet-covered portion (`pricing.walletAmountApplied`) is credited straight back to the wallet, and any remainder is refunded to the original card via Stripe. This is best-effort/non-blocking — the cancellation always succeeds even if the gateway call fails (it's logged server-side for manual follow-up); the frontend should not expect a refund failure to ever surface as a cancellation error. Response: `{ data: { booking, refundInfo } }`. Cancelling (or an owner rejecting) a booking also automatically tries to promote the next person on that exact slot's waitlist, if any (§4.9) — no separate action needed.

### 4.8 Approvals (owner/manager/admin workflow)
`POST /:id/approve` and `POST /:id/reject` are only reachable from `pending-confirmation`, and only by the specific court's/venue's owner/manager, or a platform admin. Approve simply flips to `confirmed`. Reject requires a `reason` (10-500 chars) and forces a full refund. Build the "pending bookings" queue for owners/managers off `GET /api/bookings?status=pending-confirmation&court=...` (or `venue=...`).

### 4.9 Waitlist
- **Join**: set `joinWaitlist: true` in the normal `POST /api/bookings` body when the slot you want conflicts with an existing booking. The response tells you your `waitlistPosition` via the message ("Added to waitlist at position 3"); the booking record itself also carries `isWaitlisted: true`/`waitlistPosition`. Not allowed for recurring booking series.
- **Leave**: there's no separate "leave waitlist" endpoint — just call the normal `DELETE /:id` cancel flow.
- **Never charged**: waitlisted bookings are not debited from the wallet and don't count toward court booking stats.
- **Promotion**: happens automatically, server-side, the instant the exact same slot frees up via someone else's cancellation or rejection. The promoted booking flips straight to `confirmed` or `pending-confirmation` (per that court/venue's approval settings) and the user is notified through their configured channels. **There is no polling/webhook endpoint dedicated to this** — the frontend should rely on the notification (email/push/WhatsApp, per user prefs) and/or simply refetch `GET /:id` / `GET /my-bookings` to observe the status change; don't build a dedicated waitlist-status poller against a nonexistent endpoint.

### 4.10 Recurring bookings
Set `bookingType: 'recurring'` with a `recurringPattern` (`frequency` required, plus at least one of `endDate`/`occurrences`, max 52 occurrences). The backend generates every occurrence as its own independent `Booking` document (own `bookingNumber`, own status, individually approvable/cancellable/reschedulable), linked back to a `parentBooking`. Occurrences that happen to conflict with something else are **dropped silently** — always check the returned `totalBookings` against what the user asked for and inform them if fewer were created than expected (e.g. "11 of 12 sessions booked — Tuesday March 3rd was already taken").

### 4.11 Group bookings & participants
`groupSize` includes the booking owner/leader — the participant list capacity is `groupSize - 1` (400 "Group is full" past that). Two ways to invite:
- **Registered user**: `POST /:id/participants` with `{ user: <userId>, paymentShare? }` — name/email/phone are auto-filled from that user's profile (any name/email/phone you also send is ignored).
- **Guest (no account)**: `POST /:id/participants` with `{ name, email, phone, paymentShare? }`.
Only the booking's owner or the designated `groupLeader` can send invites or remove participants. `POST /:id/participants/:pid/respond` (`{ status: 'confirmed' | 'declined' }`) can be called by the invited person themselves (if they're a registered user matched on `participant.user`), the owner, or the leader — this is how an invitee accepts/declines from a notification link. Removing a participant is an outright delete of that entry, not a status change.

### 4.12 Booking pricing breakdown (fields to render on a receipt/summary screen)
`pricing: { basePrice, discounts: [{type: membership|promotional|group|early-bird|coupon, name, amount, percentage}], totalDiscount, subtotal, tax (flat 5%), serviceFee (currently always 0), totalAmount, currency, depositAmount (informational only — already included in totalAmount, not a separate authorization hold), walletAmountApplied }`. `payment: { amount, currency, status: pending|completed|failed|refunded|partially-refunded, method: cash|card|online|wallet|bank-transfer, transactionId, paidAt, refundAmount, refundedAt, refundReason }`.

### 4.13 Notifications the backend already sends (don't duplicate client-side)
The backend sends booking-lifecycle notifications (email/push/WhatsApp, gated per-user by `preferences.notifications.{email,push,whatsapp}`) for: booking confirmation, approval, rejection, cancellation, and a one-time reminder ~2 hours before `startTime` (tracked via a `reminderSent` flag so it only fires once). The frontend does not need to build its own reminder scheduling — just make sure the user's notification preferences (§2.8) are reachable/editable so they can opt in/out of channels.

---

## 5. Monetization: Payments, Wallet, Loyalty, Referrals, Promo Codes

### 5.1 Payments (`/api/payments`)
Real money movement goes through Stripe. The flow:
1. Frontend calls `POST /api/payments/create-intent` with `{ bookingId }` (booking owner or admin only; 400 if the booking is already paid). The backend sizes the PaymentIntent to `totalAmount - walletAmountApplied` (i.e. only what's left after any wallet coverage from booking creation) and returns:
   ```json
   { "success": true, "message": "Payment intent created", "data": { "clientSecret": "...", "paymentId": "..." } }
   ```
2. Frontend uses **Stripe.js/Elements directly** with that `clientSecret` to collect card details and confirm the charge — the backend never touches raw card data.
3. **The booking's paid status is not updated by step 2 or by any call the frontend makes.** It only flips when Stripe calls the backend's webhook (`POST /api/payments/webhook`, server-to-server, not something the frontend ever calls). After confirming with Stripe client-side, the frontend should poll/refetch `GET /api/payments/:id` or `GET /api/bookings/:id` to observe `status` becoming `succeeded`/`completed` — there can be a short delay while the webhook lands.

Other endpoints:
- `GET /api/payments/history` (`?status=&page=&limit=`): the user's own payment history, paginated.
- `GET /api/payments/:id`: owner or admin only.
- `GET /api/payments/:id/receipt`: **binary PDF response** (`Content-Type: application/pdf`, `Content-Disposition: attachment`), not JSON — only available once `status === 'succeeded'` (400 otherwise). Use this directly as a download link href, not via a JSON-parsing fetch.

Payment fields: `_id, booking, user, gateway (stripe|wallet), amount, currency, status (pending|processing|succeeded|failed|refunded|partially-refunded|cancelled), paymentMethod, refunds:[{amount,reason,status,createdAt}], failureReason, paidAt, createdAt`.

### 5.2 Wallet (`/api/wallet`)
A user's spendable in-app credit balance (`User.walletBalance`).
- `GET /`: `{ data: { walletBalance } }`.
- `GET /transactions` (`?type=credit|debit&source=...&page=&limit=`): paginated ledger. `source ∈ {booking_payment, refund, admin_adjustment, loyalty_redemption, referral_bonus, top_up}`.
- `POST /top-up` (`{ amount }`, ≥1): creates a Stripe PaymentIntent tagged for a wallet top-up, returns `{ clientSecret }` — same Stripe.js confirmation pattern as booking payments. **The wallet balance itself is only credited by the webhook** once Stripe confirms the charge; no `Payment` document is created for top-ups (only a ledger entry), and duplicate webhook deliveries are naturally deduplicated server-side, so don't worry about double-crediting on retries.
- `POST /admin/:userId/adjust` (admin only, `{ amount, type: credit|debit, reason }`): manual balance correction tool for support/admin tooling.
- Using the wallet as a booking payment method is initiated from the booking-creation call (`useWallet: true`, §4.2), not from a wallet endpoint — the wallet endpoints here are for balance/top-up/history only.

### 5.3 Loyalty (`/api/loyalty`)
- `GET /`: `{ data: { loyaltyPoints, walletValueIfRedeemed } }` — the second number is a preview of what redeeming everything right now would add to the wallet.
- `GET /transactions`: paginated ledger (`type: earn|redeem|admin_adjustment`, `source: booking_completed|redemption|admin_adjustment`).
- `POST /redeem` (`{ points }`, integer ≥1): converts points into wallet credit at a fixed rate (currently **1 point = 0.1 currency units**; the earn rate is currently **5 points per 100 spent** on a paid booking, i.e. 5%). Both rates are server-configured and could change — don't hardcode them in the frontend, always read `walletValueIfRedeemed`/actual response values rather than computing client-side. 400 "Insufficient loyalty points" if over-redeeming.
- **There is no "pay with points directly" option** — redemption always goes through the wallet first; to spend points on a booking, redeem them, then use the wallet (`useWallet: true`) on the booking.
- Points are earned automatically the moment a booking is first fully paid (whether via the Stripe webhook or full wallet coverage) — never awarded twice for the same booking, no frontend action needed beyond just letting the payment complete.

### 5.4 Referrals (`/api/referrals`)
- `GET /my-code`: returns (and lazily generates, if the account predates this feature) the user's own shareable `referralCode`.
- `GET /`: paginated list of referrals this user has sent (`status: pending|qualified|rewarded`, `referredUser` populated).
- New users apply a code at registration time only (`referralCode` field on `POST /api/auth/register`, §2.2) — **there is no "apply a referral code after signup" endpoint**; it's a registration-moment decision.
- **Qualification**: a referral pays out (currently jumps straight from `pending` to `rewarded`, no separately-observable `qualified` step in the response you'll actually see) the moment the *referred* user completes their first ever fully-paid booking. Both the referrer and the referred user each receive a one-time wallet credit (currently 500 and 250 currency units respectively — again, don't hardcode; these are env-configurable). This happens automatically; there's nothing for the frontend to trigger beyond showing the user's referral code/link and their referral list.

### 5.5 Promo Codes (`/api/promo-codes`)
- `POST /api/promo-codes/validate` (any authenticated user) — a **pure preview**, it never mutates usage counts or anything else. Body: `{ code, court, amount }` (amount = the booking subtotal you're pricing). Returns `{ data: { code, discount, finalAmount } }` on success. On failure, 400 with a specific reason: code not found/inactive, outside its valid date window, `amount` below `minBookingAmount`, the court/venue isn't in the code's allowed scope, or the code's total usage limit is exhausted. **Use this to validate a coupon field in the booking form before submitting the actual booking** — pass the same `couponCode` through to `POST /api/bookings` afterward since validation there is independent (and where the per-user usage limit is actually enforced, since `/validate` only checks the global limit, not the per-user one).
- Everything else on this router (`POST/GET/PUT/DELETE /api/promo-codes[/:id]`) is owner/admin-only CRUD for managing codes (`discountType: percentage|fixed`, `discountValue`, optional `maxDiscountAmount`/`minBookingAmount`, `validFrom`/`validUntil`, `usageLimit`/`usageLimitPerUser`, optional `applicableVenues`/`applicableCourts` scoping) — relevant only if you're building an owner-facing "manage my promotions" screen.

### 5.6 Refunds — how they surface in the UI
There's no dedicated "refund" endpoint the frontend calls — refunds are a side effect of booking cancellation/rejection (§4.7). To reflect a refund in the UI, watch for: `Payment.status` becoming `refunded`/`partially-refunded` with a new entry in `Payment.refunds[]`, and/or a new `WalletTransaction` with `source: 'refund'`. Both can appear for a single cancellation if the original booking was paid partly by wallet and partly by card.

---

## 6. Reviews & Favorites

### 6.1 Reviews (`/api/reviews`)

| Method & Path | Auth | Notes |
|---|---|---|
| POST / | Bearer | Submit a review for a completed booking |
| GET / | Optional auth | Public list (approved only, unless admin) |
| GET /:id | Public | Single review, regardless of moderation status |
| PUT /:id | Author only | Edit own review |
| DELETE /:id | Author or admin | Delete |
| POST /:id/reply | Court/venue owner/manager or admin | Owner reply |
| PUT /:id/moderate | Admin only | Approve/pending/reject |

**Eligibility to review**: the referenced `booking` must belong to the caller, have `status === 'completed'`, and not already be reviewed (`booking.isReviewed === false`) — violating any of these returns a specific 400/403/404. This is exactly the same rule the "leave a review" CTA in §4.5 should gate on. Body: `{ booking, rating (1-5), comment? (≤1000 chars), photos?: [{url, publicId}] }`.

**Moderation**: `status ∈ {approved, pending, rejected}`, defaulting to **`approved`** — reviews publish immediately and moderation is an after-the-fact admin action, not a pre-publish queue. The public list endpoint (`GET /`) forces `status: approved` for everyone except an authenticated admin; the single-review-by-id endpoint does **not** filter by status (a direct link to a pending/rejected review still resolves), so don't rely on `GET /:id` for enforcing visibility rules in a public review feed.

**Owner reply**: any of the court's owner/managers, the venue's owner/managers, or an admin can post via `POST /:id/reply` (`{ text ≤1000 chars }`). It's a **single embedded reply, not a thread** — calling it again overwrites the previous reply text and updates who/when replied.

**Stats propagation**: creating, rating-editing, deleting, or moderating a review **synchronously** recalculates `Court.stats.averageRating`/`totalReviews` (from approved reviews only) and cascades into `Venue.stats` too, all within the same request — the frontend can trust these numbers are fresh immediately after any of those calls return, without a separate refresh step.

Review fields: `_id, user, court, venue, booking, rating, comment, photos[], ownerReply:{text,repliedBy,repliedAt}, status, moderatedBy, moderatedAt, moderationReason, createdAt, updatedAt`.

### 6.2 Favorites (`/api/favorites`)

| Method & Path | Auth | Notes |
|---|---|---|
| POST / | Bearer | Add a court or venue to favorites |
| GET / | Bearer | List my favorites |
| DELETE /:id | Bearer, owner only | Remove (by favorite record id, not item id) |

Body for add: `{ itemType: 'Court'|'Venue', itemId }`. Duplicate add (same user+type+item) → 400 "Already in favorites" — **this is explicit add/remove, not a single toggle endpoint**; the frontend needs to track favorited state itself (e.g. from the list response) and call POST or DELETE accordingly, not blindly call one endpoint. List supports `?itemType=` filtering and is always scoped to the caller — there's no way to view someone else's favorites. The populated item appears under the `itemId` key (not renamed to `court`/`venue`) regardless of type.

---

## 7. Support & Content

### 7.1 Support Tickets (`/api/support-tickets`)
- `POST /`: any authenticated user. `{ subject (≤200), category? (booking-issue|payment-issue|refund-dispute|account|technical|other, default other), description (≤2000), relatedBooking? }`.
- `GET /`: own tickets only, unless admin (sees all). Filters: `status (open|in-progress|resolved|closed)`, `category`.
- `GET /:id`: owner or admin only (403/404 otherwise).
- `POST /:id/messages` (`{ message ≤2000 }`): appends to the ticket's message thread. Only the ticket's own creator or an admin can post. **If the owner replies to a `resolved`/`closed` ticket, it automatically reopens to `open`** — build the UI to reflect that a reply is also an implicit "reopen," not just a comment.
- `PUT /:id/status` (admin only): `{ status?, priority? (low|medium|high|urgent), assignedTo? }`. Setting `resolved`/`closed` stamps the corresponding timestamp.

### 7.2 FAQs (`/api/faqs`)
- `GET /`: fully public, no auth. `?category=booking|payment|account|venue-owner|general`. Only `isPublished: true` entries are ever returned; sorted by an admin-set `order` field. No pagination — return the whole published list.
- `POST/PUT/DELETE /:id`: admin-only content management.

### 7.3 Legal Documents (`/api/legal`)
- `GET /:type` (public, `type ∈ {terms-of-service, privacy-policy}`): returns only the **currently active** version (404 if none published yet for that type). Use this to render your ToS/Privacy pages — don't hardcode the text anywhere in the frontend since it's meant to be updateable without a redeploy.
- `POST /` (admin only, `{ type, version, content }`): publishes a new version and auto-deactivates the previous one; old versions are retained in the DB but not reachable via any public "history" endpoint — there's no version-history/diff UI to build against currently.

### 7.4 Analytics (`/api/analytics`) — owner/manager/admin only
All four endpoints are scoped: `admin` sees everything; `owner`/`manager` only see data for courts they own/manage (directly, or via a venue they own/manage). Build an owner dashboard around these:
- `GET /revenue?startDate&endDate&groupBy(day|week|month)&court&venue`: `{ timeline: [{_id: bucketDate, revenue, refunded, bookings}], totals: {totalRevenue, totalRefunded, totalBookings} }`.
- `GET /occupancy?startDate&endDate(both required)&court`: `{ data: [{court, courtName, bookedMinutes, availableMinutes, occupancyRate}] }` — `occupancyRate` is a 0-100 percentage computed live from the court's operating hours, not a stored/cached field.
- `GET /popular-courts?startDate&endDate&limit(1-50, default 10)`: `{ data: [{court:{_id,name,sportType}, bookingCount, revenue}] }`, sorted by booking count.
- `GET /bookings-summary?startDate&endDate`: `{ data: { statusBreakdown: [{_id: status, count}], trend: [{_id: date, count}], totals: {totalBookings, avgBookingValue} } }` — filtered on `createdAt`, unlike revenue/popular-courts which filter on the booking's `startTime`.

### 7.5 Audit Logs (`/api/audit-logs`) — admin only
`GET /?actor&action&resourceType&resourceId&startDate&endDate&page&limit`: a read-only trail of sensitive actions (promo code changes, review moderation, venue verification, refunds, 2FA enable/disable, account deletion, wallet adjustments, legal doc publishes, support ticket status changes). Each entry: `{ actor (populated), action (e.g. "venue.verified"), resourceType, resourceId, changes, reason?, ip?, userAgent?, createdAt }`. Purely a compliance/support tool — not something an end-user ever sees.

---

## 8. Frontend Implementation Checklist — Flows to Build

This section translates the above into concrete user flows the frontend needs to fully cover the backend's capability. Nothing here is a UI prescription — just the sequence of calls and state each flow depends on.

**Onboarding & account**
- Registration (with optional referral code capture from a `?ref=CODE` link), email verification banner/reminder until `isEmailVerified`, Google OAuth button (handle the token-in-redirect-URL pattern, not a JSON response), login with 2FA challenge branching, forgot/reset password, avatar upload, editable profile + preferences (including per-channel notification toggles and currency/language), 2FA setup/enable (with a mandatory "save your backup codes" step)/disable, device token registration for push (mobile/PWA), "download my data" and "delete my account" (with the anonymization caveat clearly understood), logout vs. logout-everywhere.

**Discovery**
- Venue/court search with the full filter set (location/geo, price range, rating, amenities, sport type, text search), a map or list view driven by `/nearby`, a recommended/featured rail off `/courts/recommended`, a "recently viewed" rail, favorite/unfavorite toggling (remember: separate add/remove calls, not a single toggle), and a court comparison view (2-5 courts) via `/courts/compare`.

**Booking**
- Slot picker backed by `available-slots`/`check-availability` (never trust a stale local calendar — always confirm with these endpoints right before submit), live price quote via `calculate-price` mirrored against the actual `createBooking` pricing, a promo code field validated via `promo-codes/validate` before submit, wallet-usage toggle (only offer it if `walletBalance > 0`), recurring-booking setup with an explicit "N of M sessions booked" confirmation screen (since partial conflicts are silently dropped), waitlist opt-in when a slot conflicts, and a group-booking invite flow (registered-user vs. guest invite, capacity-aware, with accept/decline links for invitees).
- Booking management: list/detail with status-aware actions (reschedule only if `canBeModified` conditions likely hold — but always let the server be the final arbiter and surface its 400 reason if it disagrees), cancel with a refund-percentage preview computed client-side from the same time-based table in §4.7 (but always trust the server's `refundInfo` in the response as the real number), owner/manager approval queue, staff check-in/check-out screens if applicable, and a review CTA gated on `completed && !isReviewed`.

**Payments & money**
- Stripe Elements integration for both booking payment and wallet top-up (same `clientSecret` pattern), a payment/receipt history screen (with PDF receipt download links), a wallet screen (balance, ledger, top-up), a loyalty screen (points balance, redeem-to-wallet action, ledger), and a referrals screen (my code/link, list of referrals and their status).

**Trust & support**
- Review submission/editing UI on completed bookings, an owner-facing reply UI, a public review feed (approved-only) on venue/court pages, a support ticket creation + threaded-reply UI, a public FAQ page, and Terms/Privacy pages sourced live from `/api/legal/:type`.

**Owner/manager/admin surfaces** (only relevant if the frontend serves these roles too)
- Venue/court CRUD, media management, pricing rules and availability exceptions editors, verification document upload + status tracking, an analytics dashboard (revenue/occupancy/popular-courts/bookings-summary), a moderation queue for reviews, a support ticket admin console, FAQ/legal content management, promo code management, and (admin-only) the audit log viewer and wallet manual-adjustment tool.

---

## 9. Quick Reference — All Base Paths

| Domain | Base path | Primary auth posture |
|---|---|---|
| Auth & account | `/api/auth` | Mixed (see §2) |
| Venues | `/api/venues` | Mostly public read, owner/manager/admin write |
| Courts | `/api/courts` | Mostly public read, owner/manager/admin write |
| Bookings | `/api/bookings` | Bearer for mutation, public for availability checks |
| Reviews | `/api/reviews` | Public read (approved), bearer write |
| Favorites | `/api/favorites` | Bearer only |
| Payments | `/api/payments` | Bearer (webhook is server-to-server) |
| Wallet | `/api/wallet` | Bearer (+ admin adjust) |
| Loyalty | `/api/loyalty` | Bearer |
| Referrals | `/api/referrals` | Bearer |
| Promo Codes | `/api/promo-codes` | Public validate, owner/admin CRUD |
| Analytics | `/api/analytics` | owner/manager/admin |
| Audit Logs | `/api/audit-logs` | admin only |
| Support Tickets | `/api/support-tickets` | Bearer (admin sees all) |
| FAQs | `/api/faqs` | Public read, admin write |
| Legal | `/api/legal` | Public read, admin write |
