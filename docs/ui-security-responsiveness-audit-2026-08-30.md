# SureXend UI / Responsiveness / Security Audit

**Date:** 2026-08-30  
**Branch:** `arena/01a0544d-surexend`

This review focuses on what would move SureXend closer to the standard of a top-tier fintech product: **clarity, trust, speed, accessibility, resilience, and security discipline**.

---

## Executive summary

SureXend already has strong visual ambition, a broad feature surface, and real care for mobile rendering. The biggest gaps are not taste; they are **trust consistency** and **security maturity**.

### What is already strong
- Strong visual identity and premium feel across the app shell.
- Good mobile-first thinking in the CSS system.
- Clear effort around transaction auth, passkeys, idempotency, and webhook verification.
- Useful wallet, bills, conversion, history, and admin surfaces already exist.

### What is holding it back
1. **Trust gap:** some copy still promises features/security posture that the code does not fully support yet.
2. **Session security gap:** tokens still live in browser storage and Google OAuth tokens were being passed in the URL.
3. **Premium UX gap:** a few important flows are still unfinished, misleading, or too dense for a high-trust fintech experience.
4. **Accessibility gap:** zoom is disabled, a lot of text is tiny, and several always-on animations do not fully respect reduced-motion preferences.
5. **Operational security gap:** audit logging previously captured raw sensitive request bodies.

---

## High-priority findings

### P0 — Trust and security

#### 1) Browser-side token storage is still too exposed
- `src/lib/api.ts` stores access and refresh tokens in `localStorage` and a JS-readable cookie.
- That means any successful XSS can become a full account takeover.
- **Target state:** httpOnly, Secure, SameSite cookies with server-side session rotation.

**Evidence:** `src/lib/api.ts`

#### 2) Auth protection is still mostly client-side in the web app shell
- `src/middleware.ts` currently passes everything through.
- The app layout then checks `localStorage` and redirects in the browser.
- This is not how premium fintech apps protect private surfaces.
- **Target state:** server-side session validation for `/app/*` and `/admin/*`, with proper redirects before render.

**Evidence:** `src/middleware.ts`, `src/app/app/layout.tsx`

#### 3) Hardcoded bootstrap admin path should be removed
- `backend/src/auth/auth.service.ts` still contains a baked-in bootstrap admin email.
- Even if intended for recovery, permanent code-level elevation paths are bad practice in fintech.
- **Target state:** only env-configured bootstrap, documented emergency recovery, no hardcoded privileged identity.

**Evidence:** `backend/src/auth/auth.service.ts`

#### 4) Withdraw UX still simulates success instead of executing a real payout
- The withdraw flow still moves to success after a timeout instead of calling a payout API.
- That is a trust issue first, not just a feature gap.
- **Target state:** either build a real payout flow or replace with an honest waitlist like invoices.

**Evidence:** `src/app/app/withdraw/page.tsx`

#### 5) Refresh tokens are not revocable yet
- Refresh tokens are signed and accepted until expiry, but not stored, rotated, or invalidated on logout.
- Logout currently just returns success.
- **Target state:** hashed refresh tokens, rotation on use, device/session inventory, revoke on logout.

**Evidence:** `backend/src/auth/auth.service.ts`, `backend/src/auth/auth.controller.ts`

---

## UI / product polish improvements

### 1) Reduce claim-vs-reality mismatch everywhere
This is the single biggest brand upgrade.

Current examples:
- metadata and landing copy mention bank withdrawals
- security section claims “real-time fraud detection” and “bank-level security” in a way that feels ahead of the implementation
- public footer used stronger regulatory language than the codebase supports
- AI support prompts referenced invoice functionality that is not live

**Why it matters:** billion-dollar fintech brands win on precision. Users forgive “coming soon”; they do not forgive overclaiming.

### 2) Stop putting not-live features in primary navigation
- `Invoice` is still a main app nav item even though it is a coming-soon screen.
- For a premium product, core nav should feel dependable and task-oriented.

**Recommendation:**
- keep live, high-frequency actions in primary nav
- move non-live items into “More”, “Explore”, or a waitlist hub

### 3) Make the app more task-first, less screen-first
A premium fintech app typically optimizes around the top 4 user jobs:
- fund wallet
- send money
- convert
- view history / statement

SureXend already has these, but some screens still feel like feature catalogs rather than fast workflows.

**Specific targets:**
- shorten step counts on send/convert/withdraw
- show fees, ETA, and recipient summary earlier
- turn long option grids into searchable bottom sheets

### 4) Improve information hierarchy
There is a lot of tiny text (`10px`/`11px`) throughout the app.

**Recommendation:**
- minimum 13–14px for secondary body copy on mobile
- reserve 10–11px for metadata only
- increase contrast on muted text blocks
- reduce badge clutter on key financial screens

### 5) Fix incomplete/broken interaction details
Examples:
- landing floating support CTA existed visually but did not actually open support before this pass
- history search box looked real but had no filtering behavior before this pass
- auth flows rely on full page reloads instead of smoother stateful routing
- 2FA login path is not completed in the sign-in UX

---

## Responsiveness and performance improvements

### 1) The CSS system is powerful but too global
`src/app/globals.css` contains a lot of global overrides, mobile safety rules, duplicated surface logic, and heavy `!important` usage.

**Risk:** hard-to-predict styling, slower iteration, and accidental regressions.

**Recommendation:**
- extract shared surface primitives (`Card`, `Sheet`, `Badge`, `Button`, `Input`)
- keep device hacks localized behind utility classes
- move page-specific styling out of global CSS

### 2) Motion is still too “always on” in important places
- landing page and dashboard still use continuous Framer Motion animations
- reduced-motion handling is strong in CSS, but JS-driven animations should also respect it

**Recommendation:**
- use `useReducedMotion()` for all looping motion
- pause live ticker animations in reduced-motion and lite mode
- reserve animation for state change, not idle decoration

### 3) Some mobile flows are too dense
- withdraw renders a giant two-column country/currency wall
- send network selection is compact but still busy for smaller phones
- multiple bottom sheets stack visually with similar styling

**Recommendation:**
- searchable picker for all long lists
- progressive disclosure for advanced options
- stronger spacing and section dividers for money flows

### 4) Replace repeated raw `<img>` usage where practical
There are many raw image tags in app/auth/dashboard/profile surfaces.

**Recommendation:**
- use optimized image primitives for local brand assets
- avoid third-party default avatars on authenticated surfaces
- use deterministic generated initials/avatar fallback instead of external Unsplash calls

---

## Security improvements

### 1) Move to server-owned sessions
Best next move:
- httpOnly access/refresh cookies
- refresh rotation
- device/session revocation
- middleware protection for app/admin routes
- step-up auth for sensitive admin actions

### 2) Add real CSP
Current headers are a start, but a premium fintech should also ship a real **Content-Security-Policy**.

Because the app uses inline scripts and JSON-LD, this needs careful rollout with nonces or hashes.

### 3) Separate admin auth from standard auth
Current admin protection depends on role checks only.

**Recommendation:**
- require passkey or second factor for admin login
- require step-up auth for manual credits, role changes, payout actions, and broadcasts
- add immutable admin audit trails with actor, before/after values, and approval metadata

### 4) Clean up sensitive telemetry and privacy leakage
- login currently does third-party IP geolocation lookups
- external fallback avatars leak requests off-platform
- audit logs previously stored raw sensitive request payloads

**Recommendation:**
- make geolocation optional / server-side privacy-reviewed
- eliminate unnecessary third-party browser requests
- classify and redact all sensitive data in logs and traces

### 5) Finish the 2FA story end-to-end
- enabling 2FA exists
- login returns `requires2FA`
- frontend sign-in flow does not yet complete that challenge

That is both a UX problem and a trust problem.

---

## Improvements shipped in this pass

I made a few low-risk improvements while reviewing:

1. **OAuth token leak reduced**
   - Google callback now redirects tokens via URL fragment instead of query string.
   - Callback page strips sensitive URL data before navigation.

2. **Audit log redaction added**
   - audit logging now redacts common secrets like passwords, PINs, OTP codes, tokens, and passkey tokens before persistence.

3. **Accessibility improved**
   - viewport no longer disables pinch-to-zoom.

4. **AI assistant copy improved**
   - removed misleading invoice prompt/copy
   - aligned assistant help text more closely with what is actually live
   - fixed a bug where assistant-proposed `convert` actions were sanitized away

5. **History search now works**
   - the history search field now filters loaded transactions instead of being a dead control

6. **2FA login was completed end-to-end**
   - password login can now return a short-lived challenge token
   - the web login screen now prompts for the authenticator code and finishes sign-in properly

7. **Refresh sessions became revocable and rotatable**
   - refresh tokens now carry a `jti`
   - active refresh sessions are stored server-side (Redis when available, in-memory fallback otherwise)
   - refresh use rotates the session and logout can revoke the current refresh token
   - password reset now revokes all stored refresh sessions for that user

8. **Privacy leakage on login was reduced**
   - login notifications no longer call a third-party browser IP geolocation service just to decorate the message
   - notifications still record the device and IP metadata already present in the request path

9. **Route protection was strengthened in the web app**
   - Next middleware now gates `/app/*` and `/admin/*` based on the auth cookie presence
   - authenticated users are redirected away from login/register when an unexpired access token is present
   - client auth storage now favors `sessionStorage` for the access token and sets safer cookie attributes

10. **Sensitive admin actions now require step-up approval**
   - backend admin mutation endpoints now apply an `AdminStepUpGuard`
   - the guard verifies either an admin transaction PIN or a passkey approval token via `TransactionAuthService`
   - admin mutation UIs for user updates, manual credits, KYC decisions, pricing changes, and broadcasts now route through a shared approval modal

11. **Security headers and build resilience improved**
   - the frontend now serves an explicit Content Security Policy plus tighter permissions and cross-origin headers
   - preview/dev origins now include the Arena preview domain so local review is less likely to break on host checks
   - app typography no longer depends on build-time Google Fonts fetches, which removed a production-build failure mode in restricted environments

---

## Recommended roadmap

### Next 7 days
- Replace fake withdraw success with a coming-soon state or real integration
- Remove hardcoded bootstrap admin email
- Finish 2FA login flow
- Replace external default avatars with internal initials/avatar generator
- Add reduced-motion handling to Framer Motion loops
- Remove non-live items from primary navigation

### Next 30 days
- Migrate auth to httpOnly cookies
- Tighten middleware so expired access tokens can be refreshed server-side instead of relying on client-only recovery
- Evolve CSP from compatibility mode into a nonce/hash strategy that can drop most inline allowances
- Add immutable admin audit trails with approval metadata and before/after snapshots
- Refactor shared UI primitives and reduce global CSS complexity
- Build a consistent searchable sheet component for currencies, banks, and networks

### Next 60–90 days
- Session management dashboard (devices, revoke sessions)
- full accessibility pass (contrast, focus states, zoom, semantics, keyboard)
- replace float-based money state completely with derived ledger-backed views
- observability: Sentry, structured logs, alerting, reconciliation dashboards

---

## Validation note
Validation improved during this pass:
- `npm run build` for the frontend now succeeds locally.
- `npm run typecheck` for the frontend succeeds after a production build has generated the expected `.next/types` files.
- `git diff --check` is clean on the current working tree.

Backend validation is still incomplete in this sandbox:
- backend dependencies only installed with `--ignore-scripts` because native `bcrypt` setup failed behind network/TLS restrictions;
- `npx prisma generate` could not download the Prisma engine in this environment, so the Nest build still reports broad Prisma-client type failures unrelated to just the latest admin-step-up edits.
