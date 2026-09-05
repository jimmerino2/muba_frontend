import type {
  Claim,
  InsuranceDashboard,
  ListQuery,
  Paginated,
  Patient,
  Payment,
  Policy,
} from '@/lib/types'
import { badRequest, notFound } from '../client'
import { http, paginate } from '../http'
import type { WireClaim, WirePayment } from '../wire'
import { toClaim, toPatient, toPayment, toPolicy } from '../adapters'
import { cache, claimEvents, claimNames, invalidatePayments, organizationName } from './_resolve'
import { getPlatformTruthScoreThreshold } from './config'

/**
 * The TPA view — the delegated review queue.
 *
 * A hospital (GL) or a patient (Non-GL, self-filed) submits a claim against a
 * policy; the TPA validates it against the insurer's policy and may decide it
 * alone, up to the insurer-set `tpaApprovalLimit`. Above that limit — or when
 * a claim carries no TPA at all — it is the insurer's to decide instead; see
 * `live/insurance.ts`'s `getReviewQueue` for that side of the split.
 *
 *   GET  /api/claims[/:id]
 *   POST /api/claims/:id/review     (approve | reject)
 *   GET  /api/payments
 *   GET  /api/policies/:id
 *
 * There is no `GET /api/tpa/dashboard` any more than there was an insurer
 * one — `getDashboard` composes the same counts from the claims and payments
 * lists, exactly like `live/insurance.ts` does, and reuses its
 * `InsuranceDashboard` shape since the two views are the same kind of thing.
 */

function matches(query: string | undefined, ...fields: (string | null | undefined)[]): boolean {
  if (!query?.trim()) return true
  const needle = query.trim().toLowerCase()
  return fields.some((field) => (field ?? '').toLowerCase().includes(needle))
}

const newestFirst = <T>(pick: (item: T) => string) => (a: T, b: T) =>
  Date.parse(pick(b)) - Date.parse(pick(a))

/** A draft belongs to the provider; a TPA never sees an unsubmitted claim, and
 * only ever sees a claim that names it as the administering TPA. */
const visibleToTpa = (claim: WireClaim, tpaId: string) =>
  claim.tpaOrganizationId === tpaId && claim.status !== 'CREATED'

async function hydrateClaim(claim: WireClaim, withEvents = true): Promise<Claim> {
  const [names, events] = await Promise.all([
    claimNames(claim),
    withEvents ? claimEvents(claim.id) : Promise.resolve([]),
  ])
  return toClaim(claim, names, events)
}

/** Whether this TPA may decide `claim` alone, per the policy's insurer-set
 * ceiling. A policy with no delegation (`tpaApprovalLimit` null) is never
 * within limit — there is nothing delegated to decide. */
async function withinTpaLimit(claim: WireClaim): Promise<boolean> {
  const policy = await cache.policies.get(claim.policyId)
  const limit = policy?.coverageRules.tpaApprovalLimit
  return limit !== null && limit !== undefined && claim.claimAmount <= limit
}

/* ------------------------------------------------------------ dashboard */

export async function getDashboard(tpaId: string): Promise<InsuranceDashboard> {
  const [wireClaims, wirePayments] = await Promise.all([
    http<WireClaim[]>('/api/claims'),
    http<WirePayment[]>('/api/payments'),
  ])

  const visible = (wireClaims ?? []).filter((c) => visibleToTpa(c, tpaId))

  const notYetRouted = visible.filter((c) => c.status === 'SUBMITTED' || c.status === 'VERIFYING')
  const requiresReview = visible.filter((c) => c.status === 'REQUIRES_REVIEW')
  const withinLimit = await Promise.all(requiresReview.map(withinTpaLimit))
  const queueSource = [...notYetRouted, ...requiresReview.filter((_, i) => withinLimit[i])]

  const [claims, reviewQueue] = await Promise.all([
    Promise.all(visible.map((c) => hydrateClaim(c, false))),
    Promise.all(queueSource.map((c) => hydrateClaim(c, true))),
  ])

  const count = (...statuses: Claim['status'][]) =>
    claims.filter((c) => statuses.includes(c.status)).length

  const paymentPending = claims.filter(
    (c) => (c.status === 'approved' || c.status === 'auto_approved') && c.paymentId !== null,
  )
  const settled = claims.filter((c) => c.status === 'paid' || c.status === 'closed')
  const decided = claims.filter((c) =>
    ['auto_approved', 'approved', 'rejected', 'paid', 'closed'].includes(c.status),
  )
  const autoDecided = visible.filter((c) => c.approvedAutomatically === true)

  // A TPA does not fund settlement — the insurer does — so it has no
  // "exposure" of its own to show; the payment figures are about what it has
  // initiated on the insurer's behalf.
  const myClaimIds = new Set(visible.map((c) => c.id))
  const myPayments = (wirePayments ?? []).filter((p) => myClaimIds.has(p.claimId))

  return {
    pendingVerification: count('submitted'),
    requiresReview: queueSource.filter((c) => c.status === 'REQUIRES_REVIEW').length,
    approved: count('approved', 'auto_approved'),
    rejected: count('rejected'),
    paymentPending: paymentPending.length,
    settled: settled.length,
    exposureAmount: myPayments
      .filter((p) => p.status !== 'SETTLED')
      .reduce((total, p) => total + p.amount, 0),
    settledAmount: myPayments
      .filter((p) => p.status === 'SETTLED')
      .reduce((total, p) => total + p.amount, 0),
    autoApprovalRate: decided.length ? Math.round((autoDecided.length / decided.length) * 100) : 0,
    reviewQueue: reviewQueue.sort(newestFirst((c) => c.updatedAt)),
  }
}

/* ---------------------------------------------------------------- claims */

export async function getClaims(tpaId: string, query: ListQuery = {}): Promise<Paginated<Claim>> {
  const wire = await http<WireClaim[]>('/api/claims')
  const claims = await Promise.all(
    (wire ?? []).filter((c) => visibleToTpa(c, tpaId)).map((c) => hydrateClaim(c)),
  )
  const rows = claims
    .filter((c) => (query.status ? c.status === query.status : true))
    .filter((c) => matches(query.q, c.claimNumber, c.patientName, c.hospitalName, c.diagnosis))
    .sort(newestFirst((c) => c.updatedAt))
  return paginate(rows, query)
}

/** The TPA's own decidable queue — only claims within its delegated limit. */
export async function getReviewQueue(tpaId: string, query: ListQuery = {}): Promise<Paginated<Claim>> {
  const wire = await http<WireClaim[]>('/api/claims')
  const candidates = (wire ?? []).filter(
    (c) => visibleToTpa(c, tpaId) && c.status === 'REQUIRES_REVIEW',
  )
  const withinLimit = await Promise.all(candidates.map(withinTpaLimit))
  const claims = await Promise.all(
    candidates.filter((_, i) => withinLimit[i]).map((c) => hydrateClaim(c)),
  )
  const rows = claims
    .filter((c) => matches(query.q, c.claimNumber, c.patientName, c.hospitalName, c.diagnosis))
    .sort(newestFirst((c) => c.updatedAt))
  return paginate(rows, query)
}

export interface TpaClaimDetail {
  claim: Claim
  policy: Policy
  patient: Patient | null
}

export async function getClaimById(tpaId: string, claimId: string): Promise<TpaClaimDetail> {
  const wire = await http<WireClaim>(`/api/claims/${claimId}`)
  if (!wire || !visibleToTpa(wire, tpaId)) throw notFound('Claim', claimId)

  const [claim, wirePolicy] = await Promise.all([
    hydrateClaim(wire),
    cache.policies.get(wire.policyId),
  ])
  if (!wirePolicy) throw notFound('Policy', wire.policyId)

  const wirePatient = await cache.patients.get(wire.patientRef)
  const [insurerName, tpaName, threshold] = await Promise.all([
    organizationName(wirePolicy.insuranceOrganizationId),
    wirePolicy.tpaOrganizationId ? organizationName(wirePolicy.tpaOrganizationId) : Promise.resolve(null),
    getPlatformTruthScoreThreshold(),
  ])

  return {
    claim,
    policy: toPolicy(
      wirePolicy,
      { insurerName, holderName: wirePatient?.name ?? claim.patientName, tpaName },
      threshold,
    ),
    patient: wirePatient ? toPatient(wirePatient) : null,
  }
}

/* -------------------------------------------------------------- decisions */

const DECIDABLE = new Set(['verified', 'pending_review'])

function assertDecidable(claim: Claim): void {
  if (!DECIDABLE.has(claim.status)) {
    throw badRequest(
      `Claim ${claim.claimNumber} is "${claim.status}" and is no longer open for a decision.`,
    )
  }
}

export async function approveClaim(
  tpaId: string,
  claimId: string,
  _reviewerName: string,
  body: { reason: string; approvedAmount?: number },
): Promise<Claim> {
  if (!body.reason.trim()) throw badRequest('An approval must record a reason.')

  const existing = await http<WireClaim>(`/api/claims/${claimId}`)
  if (!existing || !visibleToTpa(existing, tpaId)) throw notFound('Claim', claimId)
  if (!(await withinTpaLimit(existing))) {
    throw badRequest(
      'This claim exceeds your delegated approval limit — it must be decided by the insurer.',
    )
  }

  const approvedAmount = body.approvedAmount ?? existing.claimAmount
  if (approvedAmount < 0 || approvedAmount > existing.claimAmount) {
    throw badRequest('The approved amount must be between zero and the amount claimed.')
  }

  const claim = await http<WireClaim>(`/api/claims/${claimId}/review`, {
    method: 'POST',
    body: { decision: 'approve', approvedAmount, reviewerNote: body.reason.trim() },
  })
  invalidatePayments()
  return hydrateClaim(claim)
}

export async function rejectClaim(
  tpaId: string,
  claimId: string,
  _reviewerName: string,
  body: { reason: string },
): Promise<Claim> {
  if (!body.reason.trim()) throw badRequest('A rejection must record a reason.')

  const existing = await http<WireClaim>(`/api/claims/${claimId}`)
  if (!existing || !visibleToTpa(existing, tpaId)) throw notFound('Claim', claimId)
  if (!(await withinTpaLimit(existing))) {
    throw badRequest(
      'This claim exceeds your delegated approval limit — it must be decided by the insurer.',
    )
  }

  const claim = await http<WireClaim>(`/api/claims/${claimId}/review`, {
    method: 'POST',
    body: { decision: 'reject', reviewerNote: body.reason.trim() },
  })
  return hydrateClaim(claim)
}

export interface LineItemDecision {
  lineItemId: string
  approved: boolean
  reason?: string
}

/** See `live/insurance.ts`'s decideLineItems — the same per-line-item
 * review action, gated the same way approveClaim/rejectClaim above already
 * are (visible to this TPA, and within its delegated approval limit). */
export async function decideLineItems(
  tpaId: string,
  claimId: string,
  _reviewerName: string,
  decisions: LineItemDecision[],
): Promise<Claim> {
  if (decisions.length === 0) throw badRequest('Decide at least one line item.')
  const deniedWithoutReason = decisions.find((d) => !d.approved && !d.reason?.trim())
  if (deniedWithoutReason) throw badRequest('A denied line item must record a reason.')

  const existing = await http<WireClaim>(`/api/claims/${claimId}`)
  if (!existing || !visibleToTpa(existing, tpaId)) throw notFound('Claim', claimId)
  if (!(await withinTpaLimit(existing))) {
    throw badRequest(
      'This claim exceeds your delegated approval limit — it must be decided by the insurer.',
    )
  }

  const claim = await http<WireClaim>(`/api/claims/${claimId}/review`, {
    method: 'POST',
    body: {
      decision: decisions.some((d) => d.approved) ? 'approve' : 'reject',
      lineItems: decisions,
    },
  })
  invalidatePayments()
  return hydrateClaim(claim)
}

/** See the note on `live/insurance.ts`'s `requestMoreInfo` — the same gap
 * applies here: no backend transition exists for it, so it resolves locally. */
export async function requestMoreInfo(
  tpaId: string,
  claimId: string,
  reviewerName: string,
  body: { reason: string },
): Promise<Claim> {
  if (!body.reason.trim()) throw badRequest('Describe what additional information is needed.')

  const wire = await http<WireClaim>(`/api/claims/${claimId}`)
  if (!wire || !visibleToTpa(wire, tpaId)) throw notFound('Claim', claimId)

  const claim = await hydrateClaim(wire)
  assertDecidable(claim)

  return {
    ...claim,
    decision: {
      outcome: 'more_info_requested',
      reason: body.reason.trim(),
      reviewerName,
      decidedAt: new Date().toISOString(),
    },
  }
}

/* -------------------------------------------------------------- payments */

/**
 * A TPA is neither payer nor payee — the insurer funds settlement and the
 * hospital or patient receives it — so payments are not scoped by either id
 * on the wire row. They are scoped instead through the claims this TPA
 * administers.
 */
async function hydratePayment(payment: WirePayment): Promise<Payment> {
  let claim: WireClaim | null = null
  try {
    claim = await http<WireClaim>(`/api/claims/${payment.claimId}`)
  } catch {
    /* Still worth showing even if the claim itself is not resolvable. */
  }
  const names = claim ? await claimNames(claim) : null
  return toPayment(payment, {
    claimNumber: claim?.claimNumber ?? '—',
    payerName: names?.insurerName ?? 'Insurer',
    payeeName: names?.hospitalName ?? 'Hospital',
    patientName: names?.patientName ?? '',
  })
}

export async function getPayments(tpaId: string, query: ListQuery = {}): Promise<Paginated<Payment>> {
  const [wireClaims, wirePayments] = await Promise.all([
    http<WireClaim[]>('/api/claims'),
    http<WirePayment[]>('/api/payments'),
  ])
  const myClaimIds = new Set(
    (wireClaims ?? []).filter((c) => c.tpaOrganizationId === tpaId).map((c) => c.id),
  )
  const rows = await Promise.all(
    (wirePayments ?? []).filter((p) => myClaimIds.has(p.claimId)).map(hydratePayment),
  )
  const filtered = rows
    .filter((p) => (query.status ? p.status === query.status : true))
    .filter((p) => matches(query.q, p.paymentReference, p.claimNumber, p.patientName, p.payeeName))
    .sort(newestFirst((p) => p.createdAt))
  return paginate(filtered, query)
}
