# CLAUDE.md — WayFare Frontend

Guidance for Claude Code when working in `muba_frontend`.

**This build is now connected to the real backend.** Every screen calls
`muba_backend` over HTTP through the seam in `src/lib/api`. The mock layer that
preceded it is still there, still works, and is selected with
`VITE_API_MODE=mock` — it is the only way to walk the full lifecycle with no
backend, no seeded database and no Gonka key, so it is kept deliberately rather
than deleted.

**Stack:** Vue 3 (`<script setup>`) + Vite + TypeScript + Tailwind + Pinia +
vue-router. (Earlier revisions of this file said Next.js/App Router. They were
wrong; nothing in this repo has ever been Next.js.)

```
npm run dev        # vite — serves on :5173
npm run typecheck  # vue-tsc --noEmit — run before considering a change done
npm run build      # vue-tsc -b && vite build
```

Configuration lives in `.env.local` — see [.env.example](.env.example) for
every key and what it does. Nothing secret belongs there: everything under
`VITE_` is compiled into the bundle. Point `VITE_API_BASE_URL` at the backend,
and make sure this app's origin is in the backend's `CORS_ORIGIN`.

## 0. What we're building and why (context for every session)

WayFare is a shared coordination layer for medical insurance claims across three MUBA Hacks 2026 tracks:

- **Gonka — AI for Society**: claim plausibility check via Gonka Router → Truth Score (0–100%) + reasoning trace + Gonka Request ID, shown transparently in the UI.
- **Sui Track 01 — Payments & Stablecoins**: sponsored Sui settlement transaction, mock payout to hospital.
- **Sui Track 02 — AI × Sui**: claim lifecycle gated on the Truth Score before settlement, zkLogin sign-in, every lifecycle transition as an auditable event.

Judging criteria across all three tracks (from the deck) converge on: **Product UX, real-world readiness, technical implementation, presentation** — plus, specifically for Gonka, **transparency**: the Truth Score, its reasoning trace, and the Gonka Request ID must always be visible and traceable, never hidden behind a plain "approved/rejected" badge.

Read [muba_backend/CLAUDE.md](../muba_backend/CLAUDE.md) and
[muba_backend/API.md](../muba_backend/API.md) before starting any session — they
hold the problem statement, the lifecycle diagram, the trust model, the non-goals
(no real medical records on-chain, no mainnet, no real KYC/AML) and the
authoritative API contract this app consumes.

---

## 1. Roles & Pages

Three distinct authenticated experiences, each with its own dashboard and nav. Route them under role-prefixed segments so auth/layout is trivial to scope:

```
/frontend/app
  /(auth)/login
  /patient/...
  /hospital/...       (also serves TPA — see note below)
  /insurance/...
```

> **Note on "TPA / Hospital"**: the spec treats these as one role for UI purposes (they share a dashboard shape: claims submitted/pending/approved/rejected + payments pending/received). Build one role experience (`hospital`) with a `orgType: 'hospital' | 'tpa'` field on the mock user so copy can say "Hospital" or "TPA" where relevant, rather than forking the whole role.

### 1.1 Patient
- **Authentication** — zkLogin (Google) mock: a "Sign in with Google" button that sets a mock session; no real OAuth needed for the frontend build.
- **Dashboard**
  - Active insurance (policy card: insurer, policy number, coverage type, status)
  - Total claims / Pending / Approved / Rejected (stat cards)
  - Recent medical records (list, last 3–5)
  - Recent payments (list, last 3–5)
  - Actions (e.g. "View all claims", "Contact hospital")
- **Records** — list + detail of medical records (hospital-authored; patient is read-only)
- **Claims** — list + detail, each claim detail shows lifecycle timeline (created → submitted → verified → approved/rejected → paid → closed), Truth Score + reasoning trace + Gonka Request ID, and Sui tx reference once settled
- **Payment** — list + detail of payments tied to their claims, status + Sui explorer link (mocked)

### 1.2 TPA / Hospital
- **Authentication** — zkLogin (Google) mock, institutional account
- **Dashboard** — Claims submitted / pending / approved / rejected, Payments pending / received (stat cards + recent activity feed)
- **Patients** (using this service) — list + detail, link to their records/claims
- **Records** — create + list + detail (this is the only role that authors records); includes a document upload step (mocked)
- **Claims** — create claim from a record (patient/hospital/insurer/policy refs, treatment description, claim amount) + list + detail with live-feeling Truth Score reveal
- **Payments** — list + detail of payments received/pending for their submitted claims

### 1.3 Insurance Company
- **Authentication** — zkLogin (Google) mock, institutional account
- **Dashboard** — Pending verification / Requires review / Approved / Rejected / Payment pending / Settled (stat cards, queue-style)
- **Claim** — list + detail (this is the review queue: shows Truth Score, reasoning trace, Gonka Request ID prominently, plus policy/hospital/patient context)
- **Review** — the human-in-the-loop screen for claims that didn't clear the auto-approve threshold: approve / reject / request more info, with a reason field
- **Policies** — list + detail + create/edit (policy number, coverage type, auto-approve limit, insured party)
- **Payment** — list + detail of settlements this insurer has triggered, Sui tx reference

---

## 2. API contract (the real one)

The authoritative contract is [muba_backend/API.md](../muba_backend/API.md).
Read it rather than trusting a summary here — this section is orientation, not
a source of truth.

**A previous version of this file documented `/api/auth/*`, `/api/hospitals/*`
and `/api/insurance/*`. Those routes never existed.** The backend is organised
by resource, not by role — the caller's role is resolved server-side from their
bearer token, and every list is already scoped to what that caller may see:

```
Identity      POST /api/identity/login                  zkLogin (Google) — the default sign-in
              POST /api/identity/organizations          bootstrap an org + its first admin
              GET  /api/identity/me
              POST /api/identity/organizations/employees
              GET  /api/identity/organizations/:id      trimmed, cross-org-safe (no wallet)
              POST /api/identity/dev-login              dev only, seeded demo accounts
              GET  /api/identity/dev-accounts           dev only

Policies      GET/POST /api/policies       GET /api/policies/:id
Claims        GET/POST /api/claims         GET /api/claims/:id
              GET  /api/claims/:id/events                the audit trail
              POST /api/claims/:id/submit | /review | /pay | /close
Verification  POST /api/verification/claims/:claimId     run it
              GET  /api/verification/claims/:claimId     read it back
Clauses       GET  /api/clauses/products[/:code]         the transcribed policy contract
Payments      GET  /api/payments[/:id]
              POST /api/payments/:id/initiate | /retry
              GET  /api/payments/:id/status | /transaction
Blockchain    GET  /api/blockchain/transactions[/:id]
              GET  /api/blockchain/claims/:claimId | /payments/:paymentId | /status
Records       GET/POST /api/records        GET/PATCH /api/records/:id
              POST /api/records/:id/documents | /claims
Patients      GET/POST /api/patients       GET /api/patients/me | /:id
```

There is **no** `/api/auth/*` (identity handles it), no `POST /api/payments`
(a payment exists only as a consequence of an approval), no dashboard endpoint
for either role, and no `PATCH /api/policies/:id` — a policy's terms are what a
claim was verified against, so editing one in place would rewrite the basis of
decisions already made.

### The seam: `src/lib/api`

```
src/lib/api
  http.ts        transport — base URL, bearer token, envelope unwrapping, ApiError
  wire.ts        the shapes the BACKEND returns, exactly as API.md documents them
  adapters.ts    the one place wire shapes become UI shapes
  client.ts      ApiError + the helpers the mock layer shares
  live/          real HTTP, one module per resource
  mock/          the in-memory fixtures, unchanged
  <resource>.ts  a thin barrel dispatching on VITE_API_MODE
```

Components import `@/lib/api/<resource>` and never learn which implementation is
behind it. **Keep it that way** — a component that imports from `live/` or
`mock/` directly has broken the seam.

`wire.ts` and `lib/types.ts` are deliberately separate. The backend's shapes are
normalised and written for storage (ids, an uppercase ten-state machine, events
on their own endpoint); the UI's are denormalised and written for rendering
(names, a lowercase nine-value enum, an inline timeline). Naming both `Claim`
would hide a real translation. `adapters.ts` owns that translation, is pure (it
never fetches), and never invents data — where the backend genuinely has no
equivalent for a UI field, the fallback is an honest empty value, not a
plausible-looking placeholder.

`live/_resolve.ts` does the denormalisation: the backend returns ids, the UI
renders names, so organisations, policies, patients and records are fetched once
each and memoised for the session. It is reset on sign-out and role switch — a
hospital's cached view must never leak into an insurer's.

### Known contract gaps

These are real, and they are left visible rather than papered over:

| Gap | How it is handled |
|---|---|
| No dashboard endpoints | Composed client-side from the claims/payments/records lists, so the tiles and the tables can never disagree. |
| No pagination on the backend | `paginate()` in `http.ts` slices client-side. Honest at demo scale; if the backend grows real pagination, only that function moves. |
| No per-policy Truth Score threshold | The backend applies one platform-wide. `live/config.ts` states it once, mirrored from the backend's `.env` rather than faked per policy. |
| No "request more information" transition | The backend takes `approve`/`reject` only — a third outcome would be a state that exists for one role. The query is shown to the reviewer but not persisted. Making it durable needs a `POST /api/claims/:id/notes`. |
| No `PATCH /api/policies/:id` | `updatePolicy` fails with an explanation rather than pretending to succeed. |

## 3. The mock layer (still here, still working)

`VITE_API_MODE=mock` swaps every resource module for the in-memory fixtures. It
is kept — not deleted — because it is the only way to walk the full lifecycle
(submit → verify → route → approve → settle → close) with no backend, no seeded
database and no Gonka key. That is worth a directory.

```
src/lib
  mock-data/        the fixtures — users, policies, records, claims, payments,
                    verification, blockchain
  api/mock/         the mock implementations, one per resource, plus _store.ts
                    which owns the mutations the demo flow depends on
```

Rules that still hold, in both modes:
- **Never hardcode data inline in a component.** Everything comes through
  `@/lib/api/*`.
- Every function is `async` and returns a `Promise`, so neither the component
  nor the reader can tell which implementation answered.
- Centralise types in `src/lib/types.ts`. No module invents its own shape for a
  shared entity.
- The mock layer keeps its artificial 150–400ms latency, which is what forced
  the loading skeletons to be built rather than retrofitted. The live layer has
  real latency and needs no help.

When you change a `live/` module's signature, change its `mock/` counterpart to
match, or the barrel's `typeof live` cast will stop protecting you and mock mode
will fail at runtime rather than at typecheck.

### Real data, in live mode

`npm run seed` in the backend produces the demo dataset: 2 organisations, 5
accounts, 2 patients, 2 policies (one written against the transcribed Manulife
contract), 2 medical records, and 7 claims spanning every interesting branch —
including three that exercise the contractual clause engine's `AUTO_VERIFY`,
`MANUAL_VERIFY` and `AUTO_REJECT` paths.

---

## 4. Claim lifecycle & status vocabulary (keep consistent everywhere)

```
created → submitted → verified → (auto_approved | pending_review) → approved/rejected → paid → closed
```

**The backend runs a different, longer state machine**, and that is deliberate on
both sides. It distinguishes states the UI folds together, because *how* a claim
reached a state is what has to be auditable:

```
backend                          →  UI
CREATED                          →  created
SUBMITTED, VERIFYING             →  submitted     (still in flight; nothing decided)
REQUIRES_REVIEW                  →  pending_review
APPROVED + approvedAutomatically →  auto_approved
APPROVED (human reviewer)        →  approved
PAYMENT_PENDING                  →  approved      (decided; money not moved)
REJECTED                         →  rejected
PAYMENT_SENT, PAYMENT_RECEIVED   →  paid
CLOSED                           →  closed
```

`toClaimStatus` / `toWireStatuses` in `adapters.ts` are that fold and its
inverse. **Do not scatter this mapping** — a second copy of it in a component is
how the two vocabularies drift apart.

Map the single UI lifecycle to each role's dashboard buckets — don't invent
parallel status enums per role:
- Patient's "Pending/Approved/Rejected" = a view filter over the same `ClaimStatus`
- Hospital's "Claims pending" = `submitted | verified | pending_review`
- Insurance's "Pending verification" = `submitted`, "Requires review" = `pending_review`, "Payment pending" = `approved` (pre-payout), "Settled" = `paid | closed`

Every claim detail view (all three roles) renders the same **lifecycle timeline
component** with role-appropriate visibility. The timeline is built from
`GET /api/claims/:id/events` — the backend's real audit trail — and
`EVENT_PRESENTATION` in `adapters.ts` is where each event type gets its label,
actor and phrasing. Events marked `internal` (the clause working, the routing
rationale) are the insurer's assessment reasoning, not correspondence: patients
never see them, and hospitals don't until the claim is finalised.

---

## 5. Design & component guidance

- Match the existing visual direction rather than introducing a second one; the shell, tokens and component set are already established.
- Vue 3 (`<script setup>`) + Vite + TypeScript + Tailwind. Not Next.js — see the header.
- Shared components to build once, reuse across all three roles:
  - `StatCard` (dashboard tiles)
  - `ClaimStatusBadge`
  - `ClaimLifecycleTimeline`
  - `TruthScorePanel` (score, color-coded band, reasoning trace, copyable Gonka Request ID)
  - `BlockchainRefLink` (Sui testnet explorer link + tx digest)
  - `DataTable` (claims/payments/records/policies lists — sortable, filterable by status)
  - `RoleShell` (sidebar nav + header, parameterized by role)
- The **Truth Score + reasoning trace + Gonka Request ID must appear together, every time a claim's verification is shown** — this is the single most important transparency requirement from the Gonka track rubric; never show an approve/reject decision without it.
- Sui settlement references must visibly point at "testnet" and note that the payout leg is simulated — carry the README's honesty about scope into the UI copy (e.g. a small "Testnet · Simulated payout" tag). The on-chain transfer is real on testnet; the bank payout is not. Never imply real money moved.
- **Never delete a component because it looks unused.** Scope moves in both directions on this build, and a component removed for one demo is a component rebuilt for the next.

---

## 6. Auth — zkLogin

**zkLogin is the sign-in method, not one of several.** A Google identity plus a
salt held by the backend deterministically derives the user's Sui address, so
signing in and having a wallet are one act. There is no password anywhere in
this architecture, therefore no forgot-password flow to build: account recovery
is signing in with the same Google account again.

```
LoginView  --(Google ID token)-->  POST /api/identity/login  -->  session + derived Sui address
```

- `src/lib/api/live/auth.ts` loads Google Identity Services on demand (no
  third-party script on every page load) and posts the resulting ID token to the
  backend. `VITE_GOOGLE_CLIENT_ID` must be the *same* client id the backend
  verifies against, and this app's origin must be an authorised JavaScript
  origin on that OAuth client.
- **No role is chosen at sign-in.** The backend resolves the identity to an
  existing account, binds a pending employee invite, or creates a new patient.
  Joining a hospital or an insurer happens through that organisation's invite —
  never by picking a role on a login form.
- The demo accounts on the login screen exist only so a reviewer can walk all
  three roles without three Google accounts. The backend gates them behind
  `ENABLE_DEV_LOGIN` and they vanish from the screen when it is off.
- The bearer token is **opaque**. API.md is explicit that it must not be decoded
  client-side; nothing in `src/lib/api` inspects it.
- `identityService.verifySession()` re-resolves the account on every request, so
  a suspend or role change by an org admin takes effect on the member's very
  next request — not on token expiry.
- Route guards per role segment (`/patient/*`, `/hospital/*`, `/insurance/*`)
  redirect to `/login` when the session's role doesn't match.

---

## 7. Non-goals for this build

- No mainnet. Sui settlement runs against testnet with sponsored gas; the bank
  payout leg is simulated, and the UI says so.
- No real file storage — document upload sends the file's name, size and type as
  metadata, and no bytes leave the browser.
- No production-grade KYC/AML. Note it as a real-world requirement in docs; don't
  build it.
- No secrets in the frontend. Everything under `VITE_` is compiled into the
  bundle: the Google OAuth *client id* is public by design, but the client
  secret, the zkLogin salt secret and the Gonka API key stay on the backend.

---

## 8. Definition of done for a page

A page is done when:

- it consumes only `@/lib/api/*` barrels — never `live/` or `mock/` directly, and
  never inline data;
- it has a loading state, an empty state, and an error state (a live backend
  fails in ways a mock array never did — a 401, a 409 on a state transition, a
  502 from a Gonka timeout, or an unreachable backend entirely);
- it matches the role's stat/section list above;
- for any claim-related view, it shows the Truth Score panel and the lifecycle
  timeline where specified;
- `npm run typecheck` passes.
