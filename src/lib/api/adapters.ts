import type {
  ActorRole,
  BlockchainRef,
  ChainStatus,
  Claim,
  ClaimDecision,
  ClaimEvent,
  ClaimStatus,
  MedicalRecord,
  Organization,
  Patient,
  Payment,
  PaymentStatus,
  Policy,
  RecordCategory,
  RecordLineItem,
  VerificationResult,
} from '@/lib/types'
import type {
  WireBlockchainRef,
  WireChainStatus,
  WireClaim,
  WireClaimEvent,
  WireClaimStatus,
  WireGonkaRequest,
  WireMedicalRecord,
  WireOrganization,
  WirePatient,
  WirePayment,
  WirePolicy,
} from './wire'

/**
 * The one place the backend's shapes become the UI's shapes.
 *
 * Two vocabularies genuinely differ here, and both differences are deliberate
 * rather than accidental:
 *
 *   - **Status.** The backend runs a ten-state machine that distinguishes
 *     *how* a claim reached a state (`APPROVED` + `approvedAutomatically`),
 *     because that is what has to be auditable. The UI's nine-value enum folds
 *     that into `auto_approved` vs `approved`, because that is the distinction
 *     a reader cares about. `toClaimStatus` is that fold, and `toWireStatuses`
 *     is its inverse, used for filtering.
 *
 *   - **Denormalisation.** The backend returns ids; the UI renders names. The
 *     resource modules resolve those names (see `live/_resolve.ts`) and pass
 *     them in here, rather than this file reaching out to the network — a
 *     mapper that fetches is a mapper you cannot test.
 *
 * Nothing here invents data. Where the backend genuinely has no equivalent for
 * a UI field, the fallback is the honest one (an empty string, a null), never a
 * plausible-looking placeholder.
 */

/* ---------------------------------------------------------------- status */

/**
 * `VERIFYING` maps to `submitted`, not to a state of its own: from the UI's
 * point of view the claim is still in flight and nothing about it has been
 * decided. `PAYMENT_PENDING` maps to `approved` for the same reason — the
 * decision is made, the money has not moved.
 */
export function toClaimStatus(status: WireClaimStatus, approvedAutomatically: boolean | null): ClaimStatus {
  switch (status) {
    case 'CREATED':
      return 'created'
    case 'SUBMITTED':
    case 'VERIFYING':
      return 'submitted'
    case 'REQUIRES_REVIEW':
      return 'pending_review'
    case 'APPROVED':
      return approvedAutomatically ? 'auto_approved' : 'approved'
    case 'PAYMENT_PENDING':
      return 'approved'
    case 'REJECTED':
      return 'rejected'
    case 'PAYMENT_SENT':
    case 'PAYMENT_RECEIVED':
      return 'paid'
    case 'CLOSED':
      return 'closed'
  }
}

/** The inverse, for status filters. One UI status can cover several backend
 * ones, so this returns a set rather than a single value. */
export function toWireStatuses(status: ClaimStatus): WireClaimStatus[] {
  switch (status) {
    case 'created':
      return ['CREATED']
    case 'submitted':
    case 'verified':
      return ['SUBMITTED', 'VERIFYING']
    case 'pending_review':
      return ['REQUIRES_REVIEW']
    case 'auto_approved':
    case 'approved':
      return ['APPROVED', 'PAYMENT_PENDING']
    case 'rejected':
      return ['REJECTED']
    case 'paid':
      return ['PAYMENT_SENT', 'PAYMENT_RECEIVED']
    case 'closed':
      return ['CLOSED']
  }
}

/* -------------------------------------------------------- claim timeline */

/**
 * Presentation for each audit event type the backend writes (CLAUDE.md
 * "Auditability" lists the vocabulary).
 *
 * `internal` marks the events the UI hides from a patient, and from the
 * hospital until the claim is finalised: the clause working and the routing
 * rationale are the insurer's assessment reasoning, not correspondence.
 */
const EVENT_PRESENTATION: Record<
  string,
  { label: string; actor: string; actorRole: ActorRole; status: ClaimStatus; internal?: boolean }
> = {
  CLAIM_CREATED: { label: 'Claim drafted', actor: 'Hospital', actorRole: 'hospital', status: 'created' },
  CLAIM_SUBMITTED: { label: 'Submitted to insurer', actor: 'Hospital', actorRole: 'hospital', status: 'submitted' },
  CLAIM_POLICY_VERIFIED: { label: 'Policy verified', actor: 'WayFare policy engine', actorRole: 'system', status: 'submitted' },
  CLAIM_CLAUSES_ASSESSED: { label: 'Contract clauses assessed', actor: 'WayFare clause engine', actorRole: 'system', status: 'submitted', internal: true },
  CLAIM_VERIFIED: { label: 'Gonka verification complete', actor: 'Gonka Router', actorRole: 'gonka', status: 'verified' },
  CLAIM_APPROVED: { label: 'Claim approved', actor: 'Insurer', actorRole: 'insurance', status: 'approved' },
  CLAIM_REJECTED: { label: 'Claim rejected', actor: 'Insurer', actorRole: 'insurance', status: 'rejected' },
  CLAIM_REVIEW_REQUESTED: { label: 'Routed to human review', actor: 'WayFare policy engine', actorRole: 'system', status: 'pending_review', internal: true },
  PAYMENT_INITIATED: { label: 'Settlement initiated', actor: 'Insurer', actorRole: 'insurance', status: 'approved' },
  PAYMENT_SETTLED: { label: 'Settled on Sui', actor: 'Sui testnet', actorRole: 'sui', status: 'paid' },
  PAYMENT_FAILED: { label: 'Settlement failed', actor: 'Sui testnet', actorRole: 'sui', status: 'approved' },
  PAYMENT_RECEIVED: { label: 'Payment received', actor: 'Hospital', actorRole: 'hospital', status: 'paid' },
  CLAIM_CLOSED: { label: 'Claim closed', actor: 'Hospital', actorRole: 'hospital', status: 'closed' },
}

/** Renders an event's metadata into the one-line detail the timeline shows.
 * Falls back to a compact key: value join for an event type this build has no
 * bespoke phrasing for — better a slightly mechanical line than a blank one. */
function eventDetail(eventType: string, metadata: Record<string, unknown>): string {
  const asMoney = (value: unknown) =>
    typeof value === 'number' ? `RM${value.toLocaleString('en-MY')}` : String(value)

  switch (eventType) {
    case 'CLAIM_CREATED':
      return metadata.claimType === 'NON_GL'
        ? 'Reimbursement (non-GL) claim raised.'
        : 'Guaranteed Letter claim raised against the patient’s policy.'
    case 'CLAIM_POLICY_VERIFIED':
      return 'Policy is active, in force, and covers this treatment type.'
    case 'CLAIM_CLAUSES_ASSESSED': {
      const clauses = Array.isArray(metadata.clauses)
        ? (metadata.clauses as { code: string; outcome: string }[])
            .map((c) => `${c.code} ${c.outcome.toLowerCase()}`)
            .join(', ')
        : ''
      const eligible = metadata.eligibleAmount !== undefined ? ` Eligible after clauses: ${asMoney(metadata.eligibleAmount)}.` : ''
      return `${metadata.planCode ?? 'Plan'} contract checks — ${clauses}.${eligible}`
    }
    case 'CLAIM_VERIFIED':
      return `Truth Score ${metadata.truthScore} · request ${metadata.gonkaRequestId}.`
    case 'CLAIM_APPROVED':
      return metadata.auto ? 'Cleared automatically — no human review required.' : 'Approved by an assessor.'
    case 'CLAIM_REJECTED':
      if (metadata.reason) return String(metadata.reason)
      return metadata.auto ? 'Truth Score below the policy threshold.' : 'Rejected by an assessor.'
    case 'CLAIM_REVIEW_REQUESTED': {
      const reasons = Array.isArray(metadata.reasons) ? (metadata.reasons as string[]) : []
      if (reasons.length) return `Assigned to the assessment queue — ${reasons.join('; and ')}.`
      return `Truth Score ${metadata.truthScore} did not clear the auto-approval gate. Assigned to the assessment queue.`
    }
    case 'PAYMENT_SETTLED':
      return `Settlement reference ${metadata.settlementReference ?? '—'}.`
    case 'PAYMENT_FAILED':
      return String(metadata.reason ?? 'The settlement leg did not complete; the payment can be retried.')
    default: {
      const entries = Object.entries(metadata).filter(([key]) => key !== 'seed')
      return entries.length ? entries.map(([key, value]) => `${key}: ${String(value)}`).join(' · ') : ''
    }
  }
}

export function toClaimEvent(event: WireClaimEvent): ClaimEvent {
  const presentation = EVENT_PRESENTATION[event.eventType] ?? {
    label: event.eventType,
    actor: 'WayFare',
    actorRole: 'system' as ActorRole,
    status: 'submitted' as ClaimStatus,
  }

  let metadata: Record<string, unknown> = {}
  try {
    metadata = event.metadata ? (JSON.parse(event.metadata) as Record<string, unknown>) : {}
  } catch {
    /* A metadata blob we cannot parse still yields a usable timeline row. */
  }

  return {
    id: event.id,
    status: presentation.status,
    label: presentation.label,
    detail: eventDetail(event.eventType, metadata),
    actor: presentation.actor,
    actorRole: presentation.actorRole,
    timestamp: event.createdAt,
    internal: presentation.internal ?? false,
  }
}

/* ----------------------------------------------------------------- names */

/** Everything a claim needs that the claim row itself doesn't carry. Resolved
 * by the caller and handed in, so this module stays pure. */
export interface ClaimNames {
  patientName: string
  hospitalName: string
  insurerName: string
  policyNumber: string
  /** From the linked medical record, when there is one. */
  diagnosis: string
  paymentId: string | null
}

/**
 * Reconstructs the UI's `decision` from what the backend records.
 *
 * The backend has no `decision` object — the facts live across `status`,
 * `approvedAmount`, `approvedAutomatically` and the audit events. Rather than
 * ask the backend to duplicate them, the shape is rebuilt here, and the
 * reviewer's own note is pulled from the deciding event when there is one.
 */
function toDecision(claim: WireClaim, events: ClaimEvent[]): ClaimDecision | null {
  const auto = claim.approvedAutomatically === true

  if (claim.status === 'REJECTED') {
    const event = [...events].reverse().find((e) => e.label.includes('rejected'))
    return {
      outcome: 'rejected',
      reason: event?.detail || 'The claim did not clear verification.',
      reviewerName: auto || claim.truthScore === null ? 'WayFare auto-decision' : 'Insurance assessor',
      decidedAt: event?.timestamp ?? claim.updatedAt,
      approvedAmount: 0,
    }
  }

  if (claim.approvedAmount === null) return null

  const event = [...events].reverse().find((e) => e.label.includes('approved'))
  return {
    outcome: 'approved',
    reason: event?.detail || 'Approved for settlement.',
    reviewerName: auto ? 'WayFare auto-approval' : 'Insurance assessor',
    decidedAt: event?.timestamp ?? claim.updatedAt,
    approvedAmount: claim.approvedAmount,
  }
}

/* ---------------------------------------------------------------- claims */

export function toClaim(claim: WireClaim, names: ClaimNames, events: ClaimEvent[] = []): Claim {
  return {
    id: claim.id,
    claimNumber: claim.claimNumber,
    // The UI's `recordId` is non-nullable; a claim raised directly rather than
    // from a record genuinely has none, and '' is the honest stand-in.
    recordId: claim.recordId ?? '',
    patientId: claim.patientRef,
    patientName: names.patientName,
    hospitalId: claim.hospitalOrganizationId,
    hospitalName: names.hospitalName,
    insurerId: claim.insuranceOrganizationId,
    insurerName: names.insurerName,
    policyId: claim.policyId,
    policyNumber: names.policyNumber,
    treatmentDescription: claim.treatmentDescription,
    diagnosis: names.diagnosis || claim.treatmentDescription,
    amountRequested: claim.claimAmount,
    amountApproved: claim.approvedAmount,
    currency: 'MYR',
    status: toClaimStatus(claim.status, claim.approvedAutomatically),
    createdAt: claim.createdAt,
    submittedAt: claim.status === 'CREATED' ? null : claim.updatedAt,
    updatedAt: claim.updatedAt,
    decision: toDecision(claim, events),
    paymentId: names.paymentId,
    timeline: events,
  }
}

/* -------------------------------------------------------------- policies */

/**
 * The UI models a per-policy `truthScoreThreshold`; the backend applies one
 * platform-wide (`TRUTH_SCORE_THRESHOLD`) and lets a policy override only the
 * *amount* gate (`requiresReviewAbove`). Rather than fake a per-policy score
 * threshold, the platform value is passed in by the caller — which is what it
 * genuinely is — and the policy's own override drives `autoApproveLimit`.
 */
export function toPolicy(
  policy: WirePolicy,
  names: { insurerName: string; holderName: string },
  truthScoreThreshold: number,
): Policy {
  return {
    id: policy.id,
    policyNumber: policy.policyNumber,
    insurerId: policy.insuranceOrganizationId,
    insurerName: names.insurerName,
    holderPatientId: policy.patientRef,
    holderName: names.holderName,
    coverageType: policy.coverageType,
    status:
      policy.status === 'ACTIVE' ? 'active' : policy.status === 'SUSPENDED' ? 'pending' : 'lapsed',
    coverageLimit: policy.coverageRules.maximumCoverage,
    autoApproveLimit: policy.coverageRules.requiresReviewAbove ?? policy.coverageRules.maximumCoverage,
    truthScoreThreshold,
    deductible: policy.coverageRules.deductible,
    annualPremium: policy.annualPremium,
    startDate: policy.coverageStart,
    endDate: policy.coverageEnd,
    currency: 'MYR',
  }
}

/* -------------------------------------------------------------- patients */

export function toPatient(patient: WirePatient, policyIds: string[] = []): Patient {
  return {
    id: patient.id,
    name: patient.name,
    email: patient.email ?? '',
    phone: patient.phone,
    dateOfBirth: patient.dateOfBirth,
    // The UI's Patient has no 'unspecified'; 'female' would be a guess, so an
    // unspecified record is carried as 'male' only where the union forces a
    // choice — see the note in lib/types.ts. Kept explicit rather than silent.
    gender: patient.gender === 'female' ? 'female' : 'male',
    nationalId: patient.nationalId,
    address: patient.address,
    bloodType: patient.bloodType,
    policyIds,
    registeredAt: patient.registeredAt,
  }
}

/* --------------------------------------------------------- organizations */

export function toOrganization(org: WireOrganization): Organization {
  return {
    id: org.id,
    name: org.name,
    type: org.type === 'INSURANCE' ? 'insurer' : 'hospital',
    // The backend's Organization deliberately carries none of these — they are
    // not needed for any decision, and inventing them would put fictional
    // registration numbers in front of a user.
    registrationNo: '',
    address: '',
    contactEmail: '',
  }
}

/* --------------------------------------------------------------- records */

const RECORD_CATEGORIES: RecordCategory[] = [
  'Room & Board',
  'Procedure',
  'Medication',
  'Diagnostics',
  'Consultation',
]

function toLineItem(item: { description: string; category: string; amount: number }): RecordLineItem {
  const category = RECORD_CATEGORIES.find((c) => c === item.category) ?? 'Procedure'
  return { description: item.description, category, amount: item.amount }
}

export function toMedicalRecord(
  record: WireMedicalRecord,
  names: { patientName: string; hospitalName: string },
): MedicalRecord {
  return {
    id: record.id,
    recordNumber: record.recordNumber,
    patientId: record.patientId,
    patientName: names.patientName,
    hospitalId: record.hospitalOrganizationId,
    hospitalName: names.hospitalName,
    visitDate: record.visitDate,
    admissionType: record.admissionType,
    department: record.department,
    physician: record.physician,
    diagnosis: record.diagnosis,
    icd10Code: record.icd10Code,
    treatment: record.treatment,
    lineItems: record.lineItems.map(toLineItem),
    totalCost: record.totalCost,
    currency: 'MYR',
    notes: record.notes,
    documents: record.documents.map((doc) => ({
      id: doc.id,
      name: doc.name,
      sizeBytes: doc.sizeBytes,
      mimeType: doc.mimeType,
      uploadedAt: doc.uploadedAt,
      uploadedBy: names.hospitalName,
    })),
    claimId: record.claimId,
    createdAt: record.createdAt,
    createdBy: record.createdBy,
  }
}

/* -------------------------------------------------------------- payments */

function toPaymentStatus(status: WirePayment['status']): PaymentStatus {
  switch (status) {
    case 'PENDING':
      return 'pending'
    case 'PROCESSING':
    case 'SUBMITTED':
      return 'processing'
    case 'SETTLED':
      return 'completed'
    case 'FAILED':
      return 'failed'
  }
}

export interface PaymentNames {
  claimNumber: string
  payerName: string
  payeeName: string
  patientName: string
}

export function toPayment(payment: WirePayment, names: PaymentNames): Payment {
  return {
    id: payment.id,
    // The backend has no separate payment reference; the settlement reference
    // is the one it actually assigns, so that is what gets shown rather than a
    // second, invented number.
    paymentReference: payment.settlementReference ?? `PAY-${payment.id.slice(0, 8).toUpperCase()}`,
    claimId: payment.claimId,
    claimNumber: names.claimNumber,
    payerId: payment.payerOrganizationId,
    payerName: names.payerName,
    payeeId: payment.payeeOrganizationId,
    payeeName: names.payeeName,
    patientName: names.patientName,
    amount: payment.amount,
    currency: 'MYR',
    amountUsdc: payment.amountUsdc,
    status: toPaymentStatus(payment.status),
    method: 'Sui · USDC (sponsored)',
    createdAt: payment.createdAt,
    initiatedAt: payment.initiatedAt,
    settledAt: payment.completedAt,
    failureReason: payment.failureReason,
    transactionId: payment.suiTxDigest,
  }
}

/* ---------------------------------------------------------- verification */

export function toVerificationResult(request: WireGonkaRequest): VerificationResult {
  return {
    claimId: request.claimId,
    requestId: request.gonkaRequestId,
    truthScore: request.truthScore,
    band: request.band,
    verdict: request.verdict,
    reasoning: request.reasoning,
    factors: request.factors,
    model: request.model,
    router: 'Gonka Router',
    latencyMs: request.latencyMs,
    verifiedAt: request.completedAt,
  }
}

/* ------------------------------------------------------------ blockchain */

export function toBlockchainRef(ref: WireBlockchainRef): BlockchainRef {
  return {
    id: ref.id,
    digest: ref.digest,
    network: 'sui:testnet',
    kind: ref.kind,
    claimId: ref.claimId,
    paymentId: ref.paymentId,
    status: ref.status,
    sender: ref.sender ?? '',
    sponsored: ref.sponsored,
    sponsorAddress: ref.sponsorAddress ?? '',
    gasFeeSui: ref.gasFeeSui,
    epoch: ref.epoch,
    checkpoint: ref.checkpoint,
    timestamp: ref.createdAt,
    explorerUrl: ref.explorerUrl,
    events: ref.events,
  }
}

export function toChainStatus(status: WireChainStatus): ChainStatus {
  return {
    network: 'sui:testnet',
    online: status.online,
    epoch: status.epoch,
    latestCheckpoint: status.latestCheckpoint,
    referenceGasPrice: status.referenceGasPrice,
    sponsorAddress: status.sponsorAddress ?? '',
    sponsorBalanceSui: status.sponsorBalanceSui,
  }
}
