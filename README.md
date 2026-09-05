# RICE — Frontend

A shared coordination layer for medical insurance claims, built for MUBA Hacks 2026.
Three roles — **patient**, **hospital/TPA**, **insurer** — work one claim lifecycle, with
the Gonka Truth Score, its reasoning trace and its request ID visible at every point a
decision is shown.

This is a **UI/UX-first prototype**. Every screen is real and every interaction works,
but all data is mock data shaped exactly like the eventual API responses.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production bundle
npm run typecheck
```

Stack: Vue 3 (`<script setup>`) · TypeScript · Vue Router · Pinia · Tailwind · Vite.

---

## Demo walkthrough

Sign in as any role; the sidebar has a **Demo · view as** switcher, so all three
experiences are reachable in one session. State mutates for the session, so the flow
below is genuinely walkable end to end.

1. **Insurer → Review queue.** Three claims are waiting. `CLM-2026-0078` scored **58**
   (contradictory imaging history); `CLM-2026-0071` scored **94** but is RM46,800, over
   the policy's auto-approval limit. This contrast is the point: the score is an input
   to the routing rule, never the decision.
2. **Open either claim.** Truth Score, band, reasoning trace, weighted contributing
   factors, and a copyable `gonka-req-…` ID sit next to the decision form. Approve it —
   your reasoning is written to the claim timeline.
3. **Insurer → Payments.** The approval created a pending payout. *Initiate settlement*
   builds a sponsored Sui testnet transaction and advances the claim to `paid`.
   `PAY-2026-0088` is seeded as **failed** so the retry path is demoable too.
4. **Switch to Hospital/TPA → Records.** Two records have no claim raised. *Raise claim*
   shows the routing rule **before** submission, then runs verification with a staged
   reveal and shows what the policy engine did with the result.
5. **Switch to Patient.** The claim you just raised is there, with the same lifecycle
   timeline and Truth Score panel — minus the insurer's internal assessor notes, which
   the API strips before they reach a patient.

---

## Architecture

### The API seam

Components never touch mock data. They call `/lib/api/*`, whose function names and
signatures mirror the real backend routes one-for-one:

```
lib/api/auth.ts          POST /api/auth/login · GET /api/auth/me · …
lib/api/patients.ts      GET  /api/patients/me/{records,claims,payments,policies}
lib/api/hospitals.ts     GET/POST /api/hospitals/{records,claims,patients} · …
lib/api/insurance.ts     GET  /api/insurance/{dashboard,claims,policies} · approve/reject/…
lib/api/payments.ts      POST /api/payments/:id/{initiate,retry} · …
lib/api/blockchain.ts    GET  /api/blockchain/{transactions,claims,payments,status}
lib/api/verification.ts  POST/GET /api/verification/claims/:claimId
```

Every function is `async`, returns the standard `Paginated<T>` / resource envelope,
deep-clones its response (so a component can't mutate the store by holding a reference),
and adds 150–400 ms of latency so loading skeletons are built now rather than retrofitted.
Swapping to `/backend` means replacing these function bodies with `fetch` calls — no
component changes.

`lib/types.ts` is the single source of shape truth; no module defines its own version of
a shared entity.

**One deviation from the documented route list:** `insurance.getMembers()`
(`GET /api/insurance/members`) has no counterpart in the contract. The policy create form
needs an insured-party picker and no existing route exposes one. It is flagged in-file so
the backend contract can gain the route — or the form be repointed — at swap time.

### One lifecycle, three views

```
created → submitted → verified → (auto_approved | pending_review) → approved/rejected → paid → closed
```

There is exactly one `ClaimStatus` enum. Each role's dashboard buckets are view filters
over it, not parallel vocabularies. `ClaimLifecycleTimeline` is the same component in all
three roles; only visibility differs, and that filtering happens in the API layer:

- patients never receive internal assessor notes;
- providers don't receive them until the claim is finalised;
- insurers never see a provider's unsubmitted drafts.

### Routing rule

A claim clears without human review only when **both** conditions hold: the Truth Score
meets the policy's `truthScoreThreshold` **and** the amount is within its
`autoApproveLimit`. The rule lives once, in `lib/api/_store.ts#evaluateRouting`, and the
UI always states which of the two conditions decided the outcome.

### Design language

Two accent colours carry fixed meaning and are never used decoratively: **teal** is Gonka
verification, **violet** is Sui / on-chain. Claim and payment statuses use a separate
neutral-to-amber-to-emerald scale so a status badge can never be mistaken for a score.
Every Sui surface carries a `Testnet · Simulated payout` tag.

---

## Scope and honesty

Deliberately mocked, per the project's non-goals:

- **zkLogin** — "Sign in with Google" sets a mock session; no OAuth round trip.
- **Gonka Router** — seeded results for the demo dataset, plus a generator for claims
  created during a session that weighs documentary completeness, coding specificity,
  claim value and narrative detail.
- **Sui settlement** — transactions are shaped like real sponsored testnet transactions
  (digest, epoch, checkpoint, gas, emitted events) but no network is contacted and no
  funds move. The UI says so wherever a transaction appears.
- **Document upload** — file name, size and type are captured; nothing is stored.

## Seeded data

5 patients · 2 providers (one hospital, one TPA) · 2 insurers · 5 policies ·
15 medical records (2 deliberately unclaimed, as targets for the create-claim flow) ·
13 claims covering every lifecycle status · matching payments and on-chain references.
Timestamps are relative to app load, so the dataset always looks freshly active.
