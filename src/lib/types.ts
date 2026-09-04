/**
 * Central type definitions. Every mock file and every /lib/api function imports
 * from here — no module invents its own shape for a shared entity. These mirror
 * the response bodies the real /backend will return.
 */

export type Role = 'patient' | 'hospital' | 'insurance'
export type OrgType = 'hospital' | 'tpa'

/* ------------------------------------------------------------------ users */

export interface User {
  id: string
  name: string
  email: string
  role: Role
  avatarInitials: string
  /** Present for role === 'patient' */
  patientId?: string
  /** Present for institutional roles */
  orgId?: string
  orgName?: string
  /** Only meaningful for role === 'hospital'; drives "Hospital" vs "TPA" copy. */
  orgType?: OrgType
  jobTitle?: string
}

export interface Patient {
  id: string
  name: string
  email: string
  phone: string
  dateOfBirth: string
  gender: 'male' | 'female'
  nationalId: string
  address: string
  bloodType: string
  policyIds: string[]
  registeredAt: string
}

export interface Organization {
  id: string
  name: string
  type: OrgType | 'insurer'
  registrationNo: string
  address: string
  contactEmail: string
}

/* --------------------------------------------------------------- policies */

export type PolicyStatus = 'active' | 'lapsed' | 'pending'

export type CoverageType =
  | 'Inpatient & Surgical'
  | 'Outpatient & Specialist'
  | 'Critical Illness'
  | 'Comprehensive Medical'

export interface Policy {
  id: string
  /** Human-readable label (e.g. "Basic Medical Plan") — display only. */
  name: string
  policyNumber: string
  insurerId: string
  insurerName: string
  holderPatientId: string
  holderName: string
  coverageType: CoverageType
  status: PolicyStatus
  /** Annual coverage ceiling, in MYR. */
  coverageLimit: number
  /** Claims at or below this amount may auto-approve when the Truth Score clears the threshold. */
  autoApproveLimit: number
  /** Truth Score (0-100) a claim must meet to skip human review. */
  truthScoreThreshold: number
  deductible: number
  annualPremium: number
  startDate: string
  endDate: string
  currency: 'MYR'
}

/* ---------------------------------------------------------------- records */

export interface DocumentRef {
  id: string
  name: string
  sizeBytes: number
  mimeType: string
  uploadedAt: string
  uploadedBy: string
}

export type RecordCategory =
  | 'Room & Board'
  | 'Procedure'
  | 'Medication'
  | 'Diagnostics'
  | 'Consultation'

export interface RecordLineItem {
  description: string
  category: RecordCategory
  amount: number
}

export interface MedicalRecord {
  id: string
  recordNumber: string
  patientId: string
  patientName: string
  hospitalId: string
  hospitalName: string
  visitDate: string
  admissionType: 'inpatient' | 'outpatient' | 'emergency' | 'day-surgery'
  department: string
  physician: string
  diagnosis: string
  icd10Code: string
  treatment: string
  /** Itemised bill lines; they sum to totalCost. */
  lineItems: RecordLineItem[]
  totalCost: number
  currency: 'MYR'
  notes: string
  documents: DocumentRef[]
  /** Set once a claim has been raised from this record. */
  claimId: string | null
  createdAt: string
  createdBy: string
}

/* ----------------------------------------------------------------- claims */

/**
 * The single lifecycle vocabulary. Every role filters this same enum into its
 * own dashboard buckets — there are no per-role status enums.
 */
export type ClaimStatus =
  | 'created'
  | 'submitted'
  | 'verified'
  | 'auto_approved'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'paid'
  | 'closed'

export type ActorRole = Role | 'system' | 'gonka' | 'sui'

export interface ClaimEvent {
  id: string
  status: ClaimStatus
  label: string
  detail: string
  actor: string
  actorRole: ActorRole
  timestamp: string
  /**
   * Internal notes (reviewer reasoning, routing decisions) are hidden from the
   * patient timeline, and from the hospital until the claim is finalised.
   */
  internal?: boolean
}

export interface ClaimDecision {
  outcome: 'approved' | 'rejected' | 'more_info_requested'
  reason: string
  reviewerName: string
  decidedAt: string
  approvedAmount?: number
}

export interface Claim {
  id: string
  claimNumber: string
  recordId: string
  patientId: string
  patientName: string
  hospitalId: string
  hospitalName: string
  insurerId: string
  insurerName: string
  policyId: string
  policyNumber: string
  treatmentDescription: string
  diagnosis: string
  amountRequested: number
  amountApproved: number | null
  currency: 'MYR'
  status: ClaimStatus
  createdAt: string
  submittedAt: string | null
  updatedAt: string
  decision: ClaimDecision | null
  paymentId: string | null
  timeline: ClaimEvent[]
  /** Human-readable explanation of the final decision — what happened, why
   * it was/wasn't covered, and how AI trust factored in (or didn't). */
  decisionExplanation: string | null
}

/* ---------------------------------------- gonka verification (truth score) */

export type TruthBand = 'high' | 'medium' | 'low'

export interface VerificationFactor {
  label: string
  detail: string
  impact: 'positive' | 'neutral' | 'negative'
  /** Relative contribution to the score, 0-1. */
  weight: number
}

export interface VerificationResult {
  claimId: string
  /** The traceable Gonka Router request id — surfaced in the UI, always. */
  requestId: string
  /** 0-100 plausibility score. */
  truthScore: number
  band: TruthBand
  verdict: string
  /** 2-4 sentence natural-language reasoning trace from the router. */
  reasoning: string
  factors: VerificationFactor[]
  model: string
  router: 'Gonka Router'
  latencyMs: number
  verifiedAt: string
}

/* --------------------------------------------------------------- payments */

export type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface Payment {
  id: string
  paymentReference: string
  claimId: string
  claimNumber: string
  payerId: string
  payerName: string
  payeeId: string
  payeeName: string
  patientName: string
  /** Claim currency amount (MYR). */
  amount: number
  currency: 'MYR'
  /** Stablecoin leg actually settled on Sui. */
  amountUsdc: number
  status: PaymentStatus
  method: 'Sui · USDC (sponsored)'
  createdAt: string
  initiatedAt: string | null
  settledAt: string | null
  failureReason: string | null
  transactionId: string | null
}

/* ------------------------------------------------------------- blockchain */

export interface BlockchainEvent {
  type: string
  summary: string
}

export interface BlockchainRef {
  id: string
  digest: string
  network: 'sui:testnet'
  kind: 'claim_attestation' | 'settlement'
  claimId: string | null
  paymentId: string | null
  status: 'success' | 'pending' | 'failed'
  sender: string
  /** Gas paid by the sponsor address — the user signs, the sponsor pays. */
  sponsored: boolean
  sponsorAddress: string
  gasFeeSui: number
  epoch: number
  checkpoint: number
  timestamp: string
  explorerUrl: string
  events: BlockchainEvent[]
}

export interface ChainStatus {
  network: 'sui:testnet'
  online: boolean
  epoch: number
  latestCheckpoint: number
  referenceGasPrice: number
  sponsorAddress: string
  sponsorBalanceSui: number
}

/* ------------------------------------------------------ api envelope types */

export interface PageMeta {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface Paginated<T> {
  data: T[]
  meta: PageMeta
}

export interface ListQuery {
  page?: number
  pageSize?: number
  status?: string
  q?: string
}

/* ------------------------------------------------------------- dashboards */

export interface HospitalDashboard {
  claims: { submitted: number; pending: number; approved: number; rejected: number }
  payments: { pending: number; received: number; pendingAmount: number; receivedAmount: number }
  recentClaims: Claim[]
  recentRecords: MedicalRecord[]
  patientCount: number
}

export interface InsuranceDashboard {
  pendingVerification: number
  requiresReview: number
  approved: number
  rejected: number
  paymentPending: number
  settled: number
  exposureAmount: number
  settledAmount: number
  autoApprovalRate: number
  reviewQueue: Claim[]
}
