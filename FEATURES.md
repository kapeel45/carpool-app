# Carpool App — Feature Reference

Human-readable record of what the app does today. Use this when adding or changing features so behavior stays consistent.

**Last updated:** June 2026  
**Stack:** Expo SDK 54 · React Native · Expo Router · Directus (headless CMS/backend) · AsyncStorage (local session)

---

## Table of contents

1. [App structure & navigation](#1-app-structure--navigation)
2. [Authentication & session](#2-authentication--session)
3. [User profile & verification](#3-user-profile--verification)
4. [Find a ride (search & book)](#4-find-a-ride-search--book)
5. [Offer a ride](#5-offer-a-ride)
6. [Booking details & cancellation](#6-booking-details--cancellation)
7. [My Rides](#7-my-rides)
8. [Notifications](#8-notifications)
9. [Home & Analytics](#9-home--analytics)
10. [Directus data model](#10-directus-data-model)
11. [API layer (`app/config/api.ts`)](#11-api-layer-appconfigapits)
12. [Shared components & hooks](#12-shared-components--hooks)
13. [Scripts & one-time setup](#13-scripts--one-time-setup)
14. [Environment variables](#14-environment-variables)
15. [Business rules cheat sheet](#15-business-rules-cheat-sheet)
16. [Known gotchas](#16-known-gotchas)
17. [File map](#17-file-map)

---

## 1. App structure & navigation

### Tab screens (bottom nav)

| Tab | File | Purpose |
|-----|------|---------|
| Home | `app/(tabs)/index.tsx` | Main entry: Find/Offer ride shortcuts, stats, fuel prices, notification bell |
| Analytics | `app/(tabs)/analytics.tsx` | Stats + recent bookings & offered rides |

### Stack screens (pushed on top)

| Screen | File | Purpose |
|--------|------|---------|
| Login | `app/login.tsx` | Phone + MPIN auth, signup |
| Search | `app/search.tsx` | Find rides, book, cancel from list |
| Offer | `app/offer.tsx` | Create or edit a ride offer |
| Booking | `app/booking.tsx` | Confirm booking or view/cancel existing |
| My Rides | `app/myrides.tsx` | Rider bookings + owner rides + cancel |
| Profile | `app/profile.tsx` | Name, email, car, gender, logout |
| Verify email | `app/verify-email.tsx` | OTP entry after profile email save |
| Notifications | `app/notifications.tsx` | Full notification inbox |

Root layout: `app/_layout.tsx` registers all stack routes.

---

## 2. Authentication & session

### Login flow (`app/login.tsx`)

1. **Phone** — 10-digit Indian mobile number.
2. **Existing user with MPIN** → enter MPIN → login.
3. **New user or no MPIN** → set name (if missing) + 4-digit MPIN + confirm → account created/updated → login.

### Session storage (`app/config/session.ts`)

- Stored in **AsyncStorage** under key `user_session`.
- Key helpers:
  - `saveSession` / `getSession` / `clearSession`
  - `refreshSessionFromServer()` — pulls latest profile from Directus and merges safely (does not wipe verified email on partial fetch).

### Phone normalization

- All phones stored/compared as **last 10 digits** (`normalizePhone` in `api.ts`).
- `app_users.phone` is **unique** in Directus.

### Display names

- UI shows **name** from `app_users`, not raw phone.
- `resolveDisplayName(phoneOrName)` looks up `app_users` when value looks like a phone.
- Ride owner is stored on `rides.driver_name` as **phone string**; display resolves to name.

---

## 3. User profile & verification

### Profile fields (`app/profile.tsx` → `app_users`)

| Field | Required for | Notes |
|-------|--------------|-------|
| `name` | Login display | Required on save |
| `phone` | Auth | Unique, set at signup |
| `mpin` | Login | 4-digit PIN |
| `email` | Offer rides | Must be **official work email** |
| `email_verified` | Offer rides | Set after OTP |
| `car_model` | Offer rides | Required on profile save |
| `car_number` | Offer rides | Required on profile save |
| `car_color` | Optional | |
| `gender` | Optional | `male` / `female` / `other` |

### Work email rules (`app/config/work-email.ts`)

- Personal domains (Gmail, Yahoo, Outlook, etc.) are **blocked**.
- Company domains (e.g. `@kaushasoftlabs.com`) are allowed.
- Validation: `validateOfficialWorkEmail()`.

### Email verification

1. User saves profile with work email → OTP sent via **Resend** (`sendEmailOTP`).
2. User opens **Verify email** screen → enters OTP → `verifyEmailOTP` sets `email_verified: true`.
3. OTP stored in Directus `email_otps` collection (10-minute validity).

### Can user offer rides?

`canOfferRides(session)` requires **all** of:

- `emailVerified === true`
- Non-empty `carModel`
- Non-empty `carNumber`

Profile syncs from server on focus via `refreshSessionFromServer()`.

---

## 4. Find a ride (search & book)

**Screen:** `app/search.tsx`

### Search behavior

- Pickup/drop via **Google Places** (`LocationInput` component).
- Lists active rides from Directus (`getRides`), filtered by:
  - Route match (from/to)
  - Departure in the future (`isRideSearchable`)
  - Has available seats
  - Not user's own offer (`filterRidesForFind`)
- List auto-refreshes every **60s** (`FIND_RIDE_REFRESH_MS`).

### Booking from search

- **Seat selector** (`SeatSelector`) — default 1 seat, +/- before book.
- `createBooking()`:
  - Validates seats ≤ `available_seats`
  - Creates booking with `status: confirmed`, `payment_status: pending`
  - **Decrements** `rides.available_seats` by seats booked
  - Rolls back booking if seat update fails
- Shows booked state on ride card; user can **Cancel** from search list.

### Owner contact

- **Call owner** opens phone dialer when owner phone available.

---

## 5. Offer a ride

**Screen:** `app/offer.tsx`

### Create ride

- Requires logged-in user passing `canOfferRides()`.
- Fields: from, to, departure time, price per seat, available seats.
- Optional **suggested price** via Google Distance Matrix (`calculateSuggestedPrice`).
- Creates record in `rides` with `driver_name` = owner's **phone**.

### Edit ride

- URL: `/offer?rideId=<id>` (from My Rides).
- Allowed only when:
  - User owns the ride (`driver_name` matches session phone)
  - **No active bookings** on that ride (`countActiveBookingsForRide`)
- Re-checked at save time (race protection).
- Uses `updateRide()` — throws if bookings exist.

---

## 6. Booking details & cancellation

**Screen:** `app/booking.tsx`

### Modes

| Entry | Behavior |
|-------|----------|
| From search (new) | Seat picker → Confirm booking |
| `viewOnly=true` + `bookingId` | View existing booking |
| After confirm | Success banner, payment summary |

### Cancel booking

- **Rider** can cancel their booking.
- **Owner** can cancel a rider's booking (detected when session phone = ride `driver_name`).
- Calls `cancelBooking(bookingId, cancelledByPhone)`.

### What `cancelBooking` does

1. Sets `payment_status: cancelled` and `status: cancelled` (falls back if `status` field missing).
2. **Restores seats** — increments `rides.available_seats` by `seats_booked`.
3. Sends **notification** to the other party (see [Notifications](#8-notifications)).
4. Cancelled bookings excluded from lists via `isCancelledBooking()` / `ACTIVE_BOOKING_QUERY`.

---

## 7. My Rides

**Screen:** `app/myrides.tsx`

### Sections

- **Stats row** — Taken / Offered / Saved (same as home).
- **Upcoming** — future departures.
- **Past rides** — completed departures.

### Rider view

Each booked ride shows:

- Route, time, owner name, price
- **View Booking** → booking detail screen
- **Cancel** (upcoming only)

### Owner view

Each offered ride shows:

- Route, time, seats, price
- **Booked riders** list (name, seats, price) with **Cancel** per booking (upcoming only)
- **Edit ride** — only if no active bookings
- Hint text when editing locked due to bookings

Data sources:

- `getUserBookings(phone)` — rides user booked as rider
- `getUserOfferedRides(phone)` — rides user published
- `getBookingsForOwnerRides(phone)` — active bookings on owner's rides

---

## 8. Notifications

### When notifications are created

On **booking cancellation**, the **other party** is notified:

| Who cancelled | Who gets notified | Title (example) |
|---------------|-------------------|-----------------|
| Rider | Ride owner | "Booking cancelled" |
| Owner | Rider | "Booking cancelled by owner" |

### Delivery channels

1. **In-app** — `app_notifications` collection in Directus (always attempted).
2. **Email** — via Resend to recipient's verified work email (optional, if `EXPO_PUBLIC_RESEND_API_KEY` configured).

### In-app UI

| Location | Behavior |
|----------|----------|
| **Bell icon** (`NotificationBell`) | On Home (when logged in) and My Rides header; red badge = unread count |
| **Notifications screen** | Full history, tap to open booking, Mark all read, Dismiss |

### Directus collection: `app_notifications`

| Field | Type | Notes |
|-------|------|-------|
| `recipient_phone` | string | 10-digit phone |
| `title` | string | Short heading |
| `message` | text | Full message body |
| `booking_id` | string | Optional link to booking |
| `read` | boolean | `0`/`1` in DB; use `isNotificationRead()` |

**Setup required:** `npm run setup-notifications` (creates collection + permissions).

**Important:** Do not request `date_created` in notification list queries — this collection may not expose system timestamps; sort by `-id` instead.

---

## 9. Home & Analytics

### Home (`app/(tabs)/index.tsx`)

- Welcome + user name when logged in
- **Find a Ride** → login if needed, else search
- **Offer a Ride** → offer screen (profile gate inside offer flow)
- Stats row (Taken / Offered / Saved) → tap opens My Rides
- **Pune fuel prices** from `fuel_prices` collection
- **Notification bell** when logged in

### Analytics (`app/(tabs)/analytics.tsx`)

- Same three stats at top
- **Rides taken** — list of active bookings with route & price
- **Published by you** — list of offered rides
- Cancelled bookings are excluded from activity lists

### Stats hook (`hooks/use-user-stats.ts`)

- `ridesTaken` — count of non-cancelled bookings as rider
- `ridesOffered` — count of rides where `driver_name` = user phone
- `saved` — sum of `total_price` on rider bookings

---

## 10. Directus data model

| Collection | Purpose |
|------------|---------|
| `app_users` | Accounts: phone, name, mpin, email, car, gender |
| `rides` | Offered carpools |
| `bookings` | Rider reservations linked to rides |
| `app_notifications` | In-app alerts |
| `email_otps` | Email verification codes |
| `fuel_prices` | Home screen fuel cards (Pune) |

### Key field conventions

**`rides`**

- `driver_name` — owner phone (10 digits)
- `from_location`, `to_location` — address strings
- `departure_time` — ISO datetime (UTC parsing via `parseDirectusDatetime`)
- `price_per_seat`, `available_seats`
- `status` — typically `active`

**`bookings`**

- `ride_id` — relation to rides
- `rider_phone`, `rider_name`
- `seats_booked`, `total_price`
- `payment_status` — `pending` / `paid` / `cancelled`
- `status` — `confirmed` / `cancelled` (added by setup-notifications)

### Seat inventory

- **Book:** `available_seats -= seats_booked`
- **Cancel:** `available_seats += seats_booked`
- Always validate before book; use `adjustRideAvailableSeats()`.

---

## 11. API layer (`app/config/api.ts`)

Central axios client with `EXPO_PUBLIC_DIRECTUS_TOKEN`. Grouped exports:

| Area | Key functions |
|------|---------------|
| Auth / users | `findUserByPhoneForAuth`, `createUser`, `updateUserProfile`, `fetchAppUserProfile`, `buildSessionFromUser`, `mergeSessionFromUser` |
| Email | `sendEmailOTP`, `verifyEmailOTP`, `assertEmailAvailable` |
| Rides | `getRides`, `createRide`, `updateRide`, `getRideById`, `filterRidesForFind`, `isRideSearchable` |
| Bookings | `createBooking`, `cancelBooking`, `getBookingById`, `getUserBookings`, `getBookingsForRide`, `getBookingsForOwnerRides`, `isCancelledBooking` |
| Seats | `getAvailableSeats`, `adjustRideAvailableSeats`, `countActiveBookingsForRide`, `getRideIdsWithActiveBookings` |
| Notifications | `createAppNotification`, `getNotificationsForUser`, `getUnreadNotificationCount`, `markNotificationRead`, `markAllNotificationsRead`, `isNotificationRead` |
| Stats | `getUserStats` |
| Display | `normalizePhone`, `resolveDisplayName`, `getDisplayName`, `resolveRelationId` |
| Maps / pricing | `calculateSuggestedPrice` |

---

## 12. Shared components & hooks

| File | Purpose |
|------|---------|
| `app/components/LocationInput.tsx` | Google Places autocomplete for pickup/drop |
| `app/components/RideMap.tsx` | Route map (native) |
| `app/components/RideMap.web.tsx` | Web fallback |
| `app/components/SeatSelector.tsx` | +/- seat picker |
| `app/components/NotificationBell.tsx` | Bell + unread badge → notifications screen |
| `hooks/use-user-stats.ts` | Stats with focus refresh |
| `hooks/use-notifications.ts` | Notification list + unread count |
| `app/config/session.ts` | AsyncStorage session |
| `app/config/work-email.ts` | Work email domain rules |
| `app/config/gender.ts` | Gender option constants |

---

## 13. Scripts & one-time setup

Run from project root after copying `.env.example` → `.env`.

| Script | Command | When to use |
|--------|---------|-------------|
| Setup user fields | `npm run setup-directus-fields` | After fresh Directus or missing `app_users` columns (gender, car_*) |
| Setup notifications | `npm run setup-notifications` | Before using in-app notifications / booking `status` field |
| Clear all data | `npm run clear-directus` | Wipe bookings, rides, users, OTPs; re-seed fuel (keeps schema) |
| Fix duplicate phones | `npm run fix-duplicate-phones` | Data cleanup |
| Fix duplicate emails | `npm run fix-duplicate-emails` | Data cleanup |
| Debug profile | `node scripts/debug-profile.mjs` | Inspect user records in Directus |

### Recommended setup order (new environment)

```bash
npm install
cp .env.example .env   # fill in Directus URL + token
npm run setup-directus-fields
npm run setup-notifications
npx expo start
```

---

## 14. Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `EXPO_PUBLIC_DIRECTUS_URL` | Yes | Directus base URL (use LAN IP for physical device) |
| `EXPO_PUBLIC_DIRECTUS_TOKEN` | Yes | Static/admin API token |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | Optional | Places autocomplete + maps + distance pricing |
| `EXPO_PUBLIC_RESEND_API_KEY` | Optional | Email OTP + cancellation emails |

---

## 15. Business rules cheat sheet

| Rule | Detail |
|------|--------|
| Login | Phone + 4-digit MPIN |
| Offer ride | Verified work email + car model + car number |
| Edit ride | Owner only, zero active bookings |
| Book ride | Logged in, seats available, not own ride |
| Cancel booking | Rider **or** owner; restores seats; notifies other party |
| Cancelled bookings | Hidden from My Rides, Analytics, stats, search booked state |
| Owner identity on rides | `driver_name` = phone; display name resolved from `app_users` |
| Payment | `payment_status` tracked; no real payment gateway yet |
| Past rides | Departure time &lt; now → shown under Past |

---

## 16. Known gotchas

1. **Directus URL on phone** — Use computer LAN IP, not `localhost`.
2. **After `clear-directus`** — Users must sign up again; run field setup scripts if schema was wiped manually.
3. **Notification list empty but badge shows count** — Was caused by querying forbidden `date_created`; fixed by sorting on `-id` and limiting fields.
4. **`read` field** — Directus may return `0`/`1`; use `isNotificationRead()`, not raw `Boolean()`.
5. **Profile fetch with `mpin` in fields** — Breaks profile load; auth uses separate field list from profile fetch.
6. **Mixed `??` and `\|\|`** — Needs parentheses in JSX (fixed in booking screen).
7. **Old bookings before seat sync** — May have incorrect `available_seats`; fix manually or clear data.
8. **Expo version** — Follow [Expo 54 docs](https://docs.expo.dev/versions/v54.0.0/) when adding native features.

---

## 17. File map

```
app/
├── (tabs)/
│   ├── index.tsx          # Home
│   ├── analytics.tsx      # Analytics tab
│   └── _layout.tsx        # Tab navigator
├── components/
│   ├── LocationInput.tsx
│   ├── NotificationBell.tsx
│   ├── RideMap.tsx / RideMap.web.tsx
│   └── SeatSelector.tsx
├── config/
│   ├── api.ts             # All Directus API calls
│   ├── session.ts         # AsyncStorage session
│   ├── work-email.ts      # Email domain validation
│   └── gender.ts
├── login.tsx
├── search.tsx
├── offer.tsx
├── booking.tsx
├── myrides.tsx
├── profile.tsx
├── verify-email.tsx
├── notifications.tsx
└── _layout.tsx

hooks/
├── use-user-stats.ts
└── use-notifications.ts

scripts/
├── setup-app-users-fields.mjs
├── setup-notifications.mjs
├── clear-directus.mjs
├── debug-profile.mjs
├── fix-duplicate-phones.mjs
└── fix-duplicate-emails.mjs
```

---

## Adding a new feature — checklist

1. Read this doc and the relevant screen + `api.ts` section.
2. Check [Business rules](#15-business-rules-cheat-sheet) for conflicts.
3. If new Directus fields/collections → add setup script or extend existing one.
4. Use `normalizePhone()` for any phone comparison/storage.
5. If bookings affect seats → use `adjustRideAvailableSeats()`.
6. If user-facing alerts → consider `app_notifications` + bell badge.
7. Exclude cancelled bookings with `isCancelledBooking()` / `ACTIVE_BOOKING_QUERY`.
8. Update **this file** when the feature ships.
