/**
 * The shapes the backend actually returns, exactly as documented in
 * `muba_backend/API.md`.
 *
 * These are deliberately kept separate from `/lib/types.ts`. The UI's types are
 * denormalised and written for rendering (`claim.hospitalName`, a lowercase
 * status vocabulary, an inline timeline); the backend's are normalised and
 * written for storage (ids only, an uppercase state machine, events on their
 * own endpoint). Naming both `Claim` and mapping implicitly would hide a real
 * translation — so the wire shape gets its own names, and `adapters.ts` owns
 * the conversion in one place.
 */

/* -------------------------------------------------------------- identity */

export type WireActorType = 'USER' | 'INSURANCE' | 'HOSPITAL'
export type WireAuthRole =
  | 'USER'
  | 'INSURANCE_ADMIN'
  | 'INSURANCE_EMPLOYEE'
  | 'HOSPITAL_ADMIN'
  | 'HOSPITAL_EMPLOYEE'

export interface WireIdentity {
  accountId: string
  actorType: WireActorType
  authRole: WireAuthRole
  organizationId: string | null
  employeeRole: 'ADMIN' | 'EMPLOYEE' | null
  suiWalletAddress: string | null
}

export interface WireAccount {
  id: string
  email: string | null
  displayName: string
  actorType: WireActorType
  employeeRole: 'ADMIN' | 'EMPLOYEE' | null
  organizationId: string | null
  suiWalletAddress: string | null
  status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED'
  createdAt: string
}

export interface WireSession {
  token: string
  identity: WireIdentity
  account: WireAccount
}

/** `GET /api/identity/organizations/:id` — the trimmed, cross-org-safe view.
 * Note the absent `suiWalletAddress`: an insurer's wallet is deliberately not
 * exposed to a hospital resolving its name. */
export interface WireOrganization {
  id: string
  type: 'INSURANCE' | 'HOSPITAL'
  name: string
  createdAt: string
}

export interface WireMe {
  account: WireAccount
  organization: (WireOrganization & { suiWalletAddress?: string | null }) | null
  effectiveWalletAddress: string | null
}

export interface WireDevAccount {
  id: string
  email: string | null
  displayName: string
  actorType: WireActorType
  employeeRole: 'ADMIN' | 'EMPLOYEE' | null
  organizationId: string | null
  status: string
}

/* -------------------------------------------------------------- patients */

export interface WirePatient {
  id: string
  accountId: string | null
  name: string
  email: string | null
  phone: string
  dateOfBirth: string
  gender: 'male' | 'female' | 'unspecified'
  nationalId: string
  address: string
  bloodType: string
  registeredAt: string
}

/* -------------------------------------------------------------- policies */

export interface WirePolicy {
  id: string
  name: string
  policyNumber: string
  patientRef: string
  insuranceOrganizationId: string
  /** The transcribed product plan tier this policy is written against, when
   * one applies (app/features/clauses in the backend). */
  productPlanId: string | null
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'SUSPENDED'
  coverageType:
    | 'Inpatient & Surgical'
    | 'Outpatient & Specialist'
    | 'Critical Illness'
    | 'Comprehensive Medical'
  annualPremium: number
  coverageStart: string
  coverageEnd: string
  coverageRules: {
    coveredTreatmentTypes: string[]
    maximumCoverage: number
    deductible: number
    requiresReviewAbove: number | null
  }
  createdAt: string
  updatedAt: string
}

/* --------------------------------------------------------------- records */

export interface WireDocumentRef {
  id: string
  recordId: string
  name: string
  sizeBytes: number
  mimeType: string
  uploadedAt: string
}

export interface WireMedicalRecord {
  id: string
  recordNumber: string
  patientId: string
  hospitalOrganizationId: string
  visitDate: string
  admissionType: 'inpatient' | 'outpatient' | 'emergency' | 'day-surgery'
  department: string
  physician: string
  diagnosis: string
  icd10Code: string
  treatment: string
  lineItems: { description: string; category: string; amount: number }[]
  totalCost: number
  notes: string
  documents: WireDocumentRef[]
  claimId: string | null
  createdAt: string
  createdBy: string
}

/* ---------------------------------------------------------------- claims */

export type WireClaimStatus =
  | 'CREATED'
  | 'SUBMITTED'
  | 'VERIFYING'
  | 'REQUIRES_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'PAYMENT_PENDING'
  | 'PAYMENT_SENT'
  | 'PAYMENT_RECEIVED'
  | 'CLOSED'

/** Facts the transcribed contract clauses turn on, carried alongside the claim
 * and never written on-chain. */
export interface WireClauseContext {
  treatmentCountry: string | null
  consecutiveDaysAbroad: number | null
  roomRatePerDay: number | null
  admissionDays: number | null
  roomClass: string | null
  facilityType:
    | 'PRIVATE_HOSPITAL'
    | 'GOVERNMENT_HOSPITAL'
    | 'GOVERNMENT_CLINIC'
    | 'DIALYSIS_CENTRE'
    | 'CANCER_CENTRE'
    | 'CLINIC'
    | null
  isEmergencyTreatment: boolean | null
  benefitCodes: string[]
  deductibleConsumedThisPolicyYear: number | null
}

export interface WireClauseEvaluation {
  clauseId: string
  clauseCode: string
  title: string
  automation: 'AUTO_VERIFY' | 'MANUAL_VERIFY' | 'AUTO_REJECT' | 'REFERENCE'
  ruleKind: string
  outcome: 'PASS' | 'ADJUSTED' | 'REVIEW' | 'REJECT' | 'INCONCLUSIVE' | 'SKIPPED'
  explanation: string
  adjustedAmount: number | null
  workings: Record<string, unknown>
}

export interface WireClauseAssessment {
  productId: string | null
  planId: string | null
  planCode: string | null
  claimAmount: number
  eligibleAmount: number
  recommendation: 'PROCEED' | 'REQUIRES_REVIEW' | 'REJECT'
  rejectedByClauseCode: string | null
  evaluations: WireClauseEvaluation[]
  contextForRouter: string
}

export interface WireClaim {
  id: string
  claimNumber: string
  patientRef: string
  hospitalOrganizationId: string
  insuranceOrganizationId: string
  policyId: string
  recordId: string | null
  treatmentDescription: string
  treatmentType: string
  claimType: 'GL' | 'NON_GL'
  claimAmount: number
  approvedAmount: number | null
  /** true = auto-decided, false = a human reviewer approved it, null = not yet
   * approved. The status enum itself has a single APPROVED. */
  approvedAutomatically: boolean | null
  status: WireClaimStatus
  truthScore: number | null
  reasoning: string | null
  gonkaRequestId: string | null
  walrusBlobId: string | null
  suiTxDigest: string | null
  settlementReference: string | null
  clauseContext: WireClauseContext | null
  clauseAssessment: WireClauseAssessment | null
  /** ISO 8601, or null. Display/audit metadata only. */
  treatmentDate: string | null
  /** Human-readable explanation of the final decision, built once policy,
   * clauses and trust are all known. Null until verification has run. */
  decisionExplanation: string | null
  createdAt: string
  updatedAt: string
}

export interface WireClaimEvent {
  id: string
  claimId: string
  eventType: string
  /** JSON, as a string — the backend stores it that way. */
  metadata: string | null
  createdAt: string
}

/* ---------------------------------------------------------- verification */

export interface WireGonkaRequest {
  id: string
  gonkaRequestId: string
  claimId: string
  status: 'COMPLETED'
  truthScore: number
  band: 'high' | 'medium' | 'low'
  verdict: string
  reasoning: string
  factors: {
    label: string
    detail: string
    impact: 'positive' | 'neutral' | 'negative'
    weight: number
  }[]
  model: string
  latencyMs: number
  decision: 'APPROVE' | 'REJECT' | 'REQUIRES_REVIEW'
  attestationDigest: string | null
  createdAt: string
  completedAt: string
}

export interface WireVerifyOutcome {
  claim: WireClaim
  /** null when the claim was rejected at the policy or clause stage — no Gonka
   * call happens in that case, so nothing is persisted. */
  verification: WireGonkaRequest | null
}

/* -------------------------------------------------------------- payments */

export interface WirePayment {
  id: string
  claimId: string
  payerOrganizationId: string
  payeeOrganizationId: string
  amount: number
  /** Display-only conversion, not a real FX rate. */
  amountUsdc: number
  status: 'PENDING' | 'PROCESSING' | 'SUBMITTED' | 'SETTLED' | 'FAILED'
  failureReason: string | null
  suiTxDigest: string | null
  settlementReference: string | null
  createdAt: string
  initiatedAt: string | null
  completedAt: string | null
}

export interface WirePaymentStatus {
  paymentId: string
  status: WirePayment['status']
  completedAt: string | null
  failureReason: string | null
  suiTxDigest: string | null
}

/* ------------------------------------------------------------ blockchain */

export interface WireBlockchainRef {
  id: string
  digest: string
  network: string
  kind: 'claim_attestation' | 'settlement'
  claimId: string | null
  paymentId: string | null
  status: 'success' | 'pending' | 'failed'
  sender: string | null
  sponsored: boolean
  sponsorAddress: string | null
  gasFeeSui: number
  epoch: number
  checkpoint: number
  explorerUrl: string
  events: { type: string; summary: string }[]
  createdAt: string
}

export interface WireChainStatus {
  network: string
  online: boolean
  epoch: number
  latestCheckpoint: number
  referenceGasPrice: number
  sponsorAddress: string | null
  sponsorBalanceSui: number
}

/* --------------------------------------------------------------- clauses */

export interface WireInsuranceProduct {
  id: string
  code: string
  insurerName: string
  productName: string
  formNumber: string
  revision: string
  jurisdiction: string
  documentTitle: string
  createdAt: string
}

export interface WireProductPlan {
  id: string
  productId: string
  code: string
  name: string
  currency: string
  roomAndBoardPerDay: number
  roomAndBoardDayLimit: number | null
  overallAnnualLimit: number
  overallLifetimeLimit: number
  deductiblePerPolicyYear: number
  createdAt: string
}

export interface WirePlanBenefit {
  id: string
  productId: string
  code: string
  section: 'A' | 'B' | 'C'
  sectionTitle: string
  label: string
  detail: string | null
  platinumValue: string
  goldValue: string
  deductibleApplies: boolean
  createdAt: string
}

export interface WireProductClause {
  id: string
  productId: string
  clauseCode: string
  section: string
  title: string
  text: string
  automation: 'AUTO_VERIFY' | 'MANUAL_VERIFY' | 'AUTO_REJECT' | 'REFERENCE'
  ruleKind: string | null
  ruleConfig: Record<string, unknown>
  rationale: string | null
  active: boolean
  createdAt: string
}

export interface WireProductDefinition {
  id: string
  productId: string
  term: string
  definition: string
  createdAt: string
}

export interface WireProductDetail {
  product: WireInsuranceProduct
  plans: WireProductPlan[]
  benefits: WirePlanBenefit[]
  clauses: WireProductClause[]
  definitions: WireProductDefinition[]
}
