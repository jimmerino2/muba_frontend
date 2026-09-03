# CLAUDE.md — WayFare Frontend

Guidance for Claude Code when working in `/frontend`. This build is **UI/UX-first**: every screen is real, every interaction works, but all data is **mock/sample data** shaped exactly like the real API responses will be. Swapping mock data for live calls to `/backend` later should require touching only the data-fetching layer, never the components.

---

## 0. What we're building and why (context for every session)

WayFare is a shared coordination layer for medical insurance claims across three MUBA Hacks 2026 tracks:

- **Gonka — AI for Society**: claim plausibility check via Gonka Router → Truth Score (0–100%) + reasoning trace + Gonka Request ID, shown transparently in the UI.
- **Sui Track 01 — Payments & Stablecoins**: sponsored Sui settlement transaction, mock payout to hospital.
- **Sui Track 02 — AI × Sui**: claim lifecycle gated on the Truth Score before settlement, zkLogin sign-in, every lifecycle transition as an auditable event.

Judging criteria across all three tracks (from the deck) converge on: **Product UX, real-world readiness, technical implementation, presentation** — plus, specifically for Gonka, **transparency**: the Truth Score, its reasoning trace, and the Gonka Request ID must always be visible and traceable, never hidden behind a plain "approved/rejected" badge.

Read `README.md` at the repo root before starting any session — it has the full problem statement, lifecycle diagram, and non-goals (no real medical records on-chain, settlement is mocked, no real KYC/AML).

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

## 2. API contract (source of truth for the mock layer)

These are the real backend routes. **Every mock data function should be named and shaped as if it were calling one of these** — same resource shape, same pagination/error conventions — so the eventual swap is a find-and-replace of the fetch implementation, not a rewrite.

```
Auth
  POST /api/auth/login
  POST /api/auth/logout
  POST /api/auth/refresh
  GET  /api/auth/me
  POST /api/auth/forgot-password
  POST /api/auth/reset-password

Patient
  GET /api/patients/me
  GET /api/patients/me/records
  GET /api/patients/me/records/:recordId
  GET /api/patients/me/claims
  GET /api/patients/me/claims/:claimId
  GET /api/patients/me/payments
  GET /api/patients/me/policies

Hospital
  GET   /api/hospitals/me
  GET   /api/hospitals/me/dashboard
  GET   /api/hospitals/patients
  GET   /api/hospitals/patients/:patientId
  POST  /api/hospitals/records
  GET   /api/hospitals/records
  GET   /api/hospitals/records/:recordId
  PATCH /api/hospitals/records/:recordId
  POST  /api/hospitals/records/:recordId/documents
  POST  /api/hospitals/records/:recordId/claims
  GET   /api/hospitals/claims
  GET   /api/hospitals/claims/:claimId

Insurance
  GET   /api/insurance/dashboard
  GET   /api/insurance/claims
  GET   /api/insurance/claims/:claimId
  POST  /api/insurance/claims/:claimId/approve
  POST  /api/insurance/claims/:claimId/reject
  POST  /api/insurance/claims/:claimId/request-review
  GET   /api/insurance/policies
  GET   /api/insurance/policies/:policyId
  POST  /api/insurance/policies
  PATCH /api/insurance/policies/:policyId

Payment
  POST /api/payments
  GET  /api/payments
  GET  /api/payments/:paymentId
  POST /api/payments/:paymentId/initiate
  POST /api/payments/:paymentId/retry
  GET  /api/payments/:paymentId/status
  GET  /api/payments/:paymentId/transaction

Blockchain
  GET /api/blockchain/transactions
  GET /api/blockchain/transactions/:transactionId
  GET /api/blockchain/claims/:claimId
  GET /api/blockchain/payments/:paymentId
  GET /api/blockchain/status

Gonka Router
  POST /api/verification/claims/:claimId
  GET  /api/verification/claims/:claimId
```

### Page → route mapping (what mock function backs what screen)

| Page | Backed by |
|---|---|
| Patient Dashboard | `GET /api/patients/me`, `/me/claims`, `/me/records`, `/me/payments`, `/me/policies` |
| Patient Records | `GET /api/patients/me/records[/:recordId]` |
| Patient Claims | `GET /api/patients/me/claims[/:claimId]` (claim detail also pulls `GET /api/verification/claims/:claimId` and `GET /api/blockchain/claims/:claimId`) |
| Patient Payment | `GET /api/patients/me/payments`, `GET /api/payments/:paymentId/transaction` |
| Hospital Dashboard | `GET /api/hospitals/me/dashboard` |
| Hospital Patients | `GET /api/hospitals/patients[/:patientId]` |
| Hospital Records | `GET/POST /api/hospitals/records`, `PATCH /:recordId`, `POST /:recordId/documents` |
| Hospital Claims | `POST /api/hospitals/records/:recordId/claims`, `GET /api/hospitals/claims[/:claimId]` |
| Hospital Payments | `GET /api/payments?hospitalId=...`, `GET /api/payments/:paymentId/status` |
| Insurance Dashboard | `GET /api/insurance/dashboard` |
| Insurance Claim (queue) | `GET /api/insurance/claims[/:claimId]` |
| Insurance Review | `POST /api/insurance/claims/:claimId/approve\|reject\|request-review` |
| Insurance Policies | `GET/POST /api/insurance/policies`, `PATCH /:policyId` |
| Insurance Payment | `GET /api/payments`, `POST /:paymentId/initiate`, `POST /:paymentId/retry` |
| Any Gonka Truth Score panel | `POST/GET /api/verification/claims/:claimId` |
| Any Sui tx reference | `GET /api/blockchain/claims/:claimId`, `/payments/:paymentId`, `/status` |

---

## 3. Mock data architecture

**Never hardcode mock data inline in a component.** All of it lives in one place and is consumed through a thin "service" layer that mirrors the API shape 1:1.

```
/frontend
  /lib
    /mock-data
      users.ts          # patients, hospital staff, insurance officers
      policies.ts
      records.ts
      claims.ts          # includes lifecycle status + timeline events
      payments.ts
      verification.ts    # Gonka Truth Score / reasoning trace / Request ID, keyed by claimId
      blockchain.ts       # Sui tx refs, keyed by claimId / paymentId
    /api                 # one file per resource, function signatures match the real routes
      auth.ts             # login(), logout(), me()
      patients.ts         # getMe(), getMyRecords(), getMyClaims(id?), getMyPayments(), getMyPolicies()
      hospitals.ts
      insurance.ts
      payments.ts
      blockchain.ts
      verification.ts
```

Rules for the `/lib/api/*` layer:
- Every exported function's name and parameters mirror a route above (e.g. `getClaimById(claimId)` → `GET /api/insurance/claims/:claimId`).
- Every function is `async` and returns a `Promise`, even though it resolves from an in-memory array — this is what makes the later swap invisible to components.
- Add an artificial small delay (150–400ms) and a loading state in the UI, so the app *feels* like it's hitting a network, and so loading skeletons get built now instead of retrofitted later.
- Mutations (`approve`, `reject`, `initiate`, etc.) actually mutate the in-memory mock store for the session, so the demo flow (submit → verify → approve → pay → close) is genuinely walkable end-to-end without a backend.
- Centralize types in `/lib/types.ts` (Claim, ClaimStatus, Record, Payment, Policy, VerificationResult, BlockchainRef, User) and import everywhere — do not let each mock file invent its own shape.

### Minimum realistic dataset (seed this on app load)
- 3–5 patients, 1–2 hospitals/TPAs, 1–2 insurers, 2–3 policies
- 8–12 claims spanning every status: `created`, `submitted`, `verified`, `auto_approved`, `pending_review`, `approved`, `rejected`, `paid`, `closed` — include at least one high-Truth-Score auto-approved claim and one low/ambiguous-score claim routed to human review, since that contrast is the core demo narrative
- Matching payments and blockchain tx refs only for claims that reached `approved`/`paid`
- Verification results (Truth Score 0–100, 2–4 sentence reasoning trace, mock Gonka Request ID like `gonka-req-8f3a...`) for every claim that's been submitted or further

---

## 4. Claim lifecycle & status vocabulary (keep consistent everywhere)

```
created → submitted → verified → (auto_approved | pending_review) → approved/rejected → paid → closed
```

Map this single lifecycle to each role's dashboard buckets — don't invent parallel status enums per role:
- Patient's "Pending/Approved/Rejected" = a view filter over the same `ClaimStatus`
- Hospital's "Claims pending" = `submitted | verified | pending_review`
- Insurance's "Pending verification" = `submitted`, "Requires review" = `pending_review`, "Payment pending" = `approved` (pre-payout), "Settled" = `paid | closed`

Every claim detail view (all three roles) renders the same **lifecycle timeline component** with role-appropriate visibility (patients don't see internal reviewer notes; hospitals don't see the insurer's approve/reject reasoning until it's finalized).

---

## 5. Design & component guidance

- Read `/mnt/skills/public/frontend-design/SKILL.md` before building any screen — apply its guidance on intentional visual direction rather than generic defaults.
- Next.js (App Router) + TypeScript + Tailwind, matching the stack in the root README.
- Shared components to build once, reuse across all three roles:
  - `StatCard` (dashboard tiles)
  - `ClaimStatusBadge`
  - `ClaimLifecycleTimeline`
  - `TruthScorePanel` (score, color-coded band, reasoning trace, copyable Gonka Request ID)
  - `BlockchainRefLink` (mock Sui explorer link + tx digest)
  - `DataTable` (claims/payments/records/policies lists — sortable, filterable by status)
  - `RoleShell` (sidebar nav + header, parameterized by role)
- The **Truth Score + reasoning trace + Gonka Request ID must appear together, every time a claim's verification is shown** — this is the single most important transparency requirement from the Gonka track rubric; never show an approve/reject decision without it.
- Sui settlement references should visibly point at "testnet" and note settlement is a demo/mocked payout — carry the README's honesty about scope into the UI copy (e.g. a small "Testnet · Simulated payout" tag), don't imply real money moved.

---

## 6. Auth (mock)

- Build a lightweight `AuthContext` with a `role: 'patient' | 'hospital' | 'insurance'` and mock `user`.
- Login screen: "Sign in with Google" triggers `POST /api/auth/login` (mocked) → sets session → redirects to the right role's dashboard. Also offer a role-switcher in dev (e.g. query param or a small dev-only dropdown) so reviewers can see all three experiences without three Google accounts.
- Route guards per role segment (`/patient/*`, `/hospital/*`, `/insurance/*`) redirect to `/login` if the mock session's role doesn't match.

---

## 7. Non-goals for this frontend build

- No real Google OAuth / zkLogin wiring — mock the session only (see root README for the real setup steps if that's later plugged in).
- No real Gonka Router or Sui calls — the `/lib/api` layer is the seam where those get plugged in later.
- No real file storage — document upload can accept a file and just store its name/size in mock state.
- No real payment rails — payments always resolve to a mocked terminal status after `initiate`.

---

## 8. Definition of done for a page

A page is done when: it consumes only `/lib/api/*` functions (no inline data), has a loading and empty state, matches the role's stat/section list above, and — for any claim-related view — shows the Truth Score panel and lifecycle timeline where specified.
