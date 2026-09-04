import type {
  Claim,
  DocumentRef,
  HospitalDashboard,
  ListQuery,
  MedicalRecord,
  Organization,
  Paginated,
  Patient,
  Policy,
  RecordLineItem,
} from '@/lib/types'
import { medicalRecords } from '@/lib/mock-data/records'
import { claims } from '@/lib/mock-data/claims'
import { payments } from '@/lib/mock-data/payments'
import { organizations, patients } from '@/lib/mock-data/users'
import { policies } from '@/lib/mock-data/policies'
import { now } from '@/lib/mock-data/_time'
import {
  badRequest,
  byNewest,
  matchesQuery,
  notFound,
  respond,
  respondList,
} from '../client'
import { appendEvent, claimRef, nextId, nextNumber, recordRef } from './_store'

/**
 * Mirrors the hospital/TPA routes. `hospitalId` stands in for the org the bearer
 * token resolves to.
 *
 *   GET   /api/hospitals/me
 *   GET   /api/hospitals/me/dashboard
 *   GET   /api/hospitals/patients[/:patientId]
 *   POST  /api/hospitals/records
 *   GET   /api/hospitals/records[/:recordId]
 *   PATCH /api/hospitals/records/:recordId
 *   POST  /api/hospitals/records/:recordId/documents
 *   POST  /api/hospitals/records/:recordId/claims
 *   GET   /api/hospitals/claims[/:claimId]
 */

/** Buckets defined once, in the vocabulary of the single shared lifecycle. */
const PENDING_CLAIM_STATUSES = new Set(['submitted', 'verified', 'pending_review'])
const APPROVED_CLAIM_STATUSES = new Set(['auto_approved', 'approved', 'paid', 'closed'])

/** GET /api/hospitals/me */
export async function getMe(hospitalId: string): Promise<Organization> {
  const org = organizations.find((o) => o.id === hospitalId)
  if (!org) throw notFound('Organization', hospitalId)
  return respond(org)
}

/** GET /api/hospitals/me/dashboard */
export async function getDashboard(hospitalId: string): Promise<HospitalDashboard> {
  const mine = claims.filter((c) => c.hospitalId === hospitalId)
  const myPayments = payments.filter((p) => p.payeeId === hospitalId)
  const myRecords = medicalRecords.filter((r) => r.hospitalId === hospitalId)

  const pendingPayments = myPayments.filter((p) => p.status !== 'completed')
  const receivedPayments = myPayments.filter((p) => p.status === 'completed')
  const sum = (rows: typeof myPayments) => rows.reduce((total, p) => total + p.amount, 0)

  return respond({
    claims: {
      submitted: mine.filter((c) => c.status !== 'created').length,
      pending: mine.filter((c) => PENDING_CLAIM_STATUSES.has(c.status)).length,
      approved: mine.filter((c) => APPROVED_CLAIM_STATUSES.has(c.status)).length,
      rejected: mine.filter((c) => c.status === 'rejected').length,
    },
    payments: {
      pending: pendingPayments.length,
      received: receivedPayments.length,
      pendingAmount: sum(pendingPayments),
      receivedAmount: sum(receivedPayments),
    },
    recentClaims: [...mine].sort(byNewest((c) => c.updatedAt)).slice(0, 5),
    recentRecords: [...myRecords].sort(byNewest((r) => r.createdAt)).slice(0, 5),
    patientCount: new Set(myRecords.map((r) => r.patientId)).size,
  })
}

/** GET /api/hospitals/patients — patients this provider has treated. */
export async function getPatients(
  hospitalId: string,
  query: ListQuery = {},
): Promise<Paginated<Patient>> {
  const treated = new Set(
    medicalRecords.filter((r) => r.hospitalId === hospitalId).map((r) => r.patientId),
  )
  const rows = patients
    .filter((p) => treated.has(p.id))
    .filter((p) => matchesQuery(query.q, p.name, p.email, p.nationalId))
  return respondList(rows, query)
}

export interface PatientDetail {
  patient: Patient
  records: MedicalRecord[]
  claims: Claim[]
  policies: Policy[]
}

/** GET /api/hospitals/patients/:patientId */
export async function getPatientById(
  hospitalId: string,
  patientId: string,
): Promise<PatientDetail> {
  const patient = patients.find((p) => p.id === patientId)
  if (!patient) throw notFound('Patient', patientId)
  return respond({
    patient,
    records: medicalRecords
      .filter((r) => r.patientId === patientId && r.hospitalId === hospitalId)
      .sort(byNewest((r) => r.visitDate)),
    claims: claims
      .filter((c) => c.patientId === patientId && c.hospitalId === hospitalId)
      .sort(byNewest((c) => c.updatedAt)),
    policies: policies.filter((p) => p.holderPatientId === patientId),
  })
}

/** GET /api/hospitals/records */
export async function getRecords(
  hospitalId: string,
  query: ListQuery & { unclaimedOnly?: boolean } = {},
): Promise<Paginated<MedicalRecord>> {
  const rows = medicalRecords
    .filter((r) => r.hospitalId === hospitalId)
    .filter((r) => (query.unclaimedOnly ? r.claimId === null : true))
    .filter((r) =>
      matchesQuery(query.q, r.patientName, r.diagnosis, r.recordNumber, r.department, r.physician),
    )
    .sort(byNewest((r) => r.visitDate))
  return respondList(rows, query)
}

/** GET /api/hospitals/records/:recordId */
export async function getRecordById(
  hospitalId: string,
  recordId: string,
): Promise<MedicalRecord> {
  const record = medicalRecords.find((r) => r.id === recordId && r.hospitalId === hospitalId)
  if (!record) throw notFound('Medical record', recordId)
  return respond(record)
}

export interface CreateRecordPayload {
  patientId: string
  visitDate: string
  admissionType: MedicalRecord['admissionType']
  department: string
  physician: string
  diagnosis: string
  icd10Code: string
  treatment: string
  lineItems: RecordLineItem[]
  notes: string
}

/** POST /api/hospitals/records */
export async function createRecord(
  hospitalId: string,
  authorName: string,
  payload: CreateRecordPayload,
): Promise<MedicalRecord> {
  const patient = patients.find((p) => p.id === payload.patientId)
  if (!patient) throw notFound('Patient', payload.patientId)
  if (!payload.lineItems.length) throw badRequest('A record needs at least one billed line item.')

  const org = organizations.find((o) => o.id === hospitalId)
  const record: MedicalRecord = {
    id: nextId('rec'),
    recordNumber: `MR-2026-${medicalRecords.length + 1_041}`,
    patientId: patient.id,
    patientName: patient.name,
    hospitalId,
    hospitalName: org?.name ?? 'Unknown provider',
    visitDate: payload.visitDate,
    admissionType: payload.admissionType,
    department: payload.department,
    physician: payload.physician,
    diagnosis: payload.diagnosis,
    icd10Code: payload.icd10Code,
    treatment: payload.treatment,
    lineItems: payload.lineItems,
    totalCost: payload.lineItems.reduce((total, li) => total + li.amount, 0),
    currency: 'MYR',
    notes: payload.notes,
    documents: [],
    claimId: null,
    createdAt: now(),
    createdBy: authorName,
  }
  medicalRecords.unshift(record)
  return respond(record, 400, 700)
}

/** PATCH /api/hospitals/records/:recordId */
export async function updateRecord(
  hospitalId: string,
  recordId: string,
  patch: Partial<CreateRecordPayload>,
): Promise<MedicalRecord> {
  const record = recordRef(recordId)
  if (record.hospitalId !== hospitalId) throw notFound('Medical record', recordId)
  Object.assign(record, patch)
  if (patch.lineItems) {
    record.totalCost = patch.lineItems.reduce((total, li) => total + li.amount, 0)
  }
  return respond(record, 300, 550)
}

/**
 * POST /api/hospitals/records/:recordId/documents
 *
 * No real storage in this build — the file's name, size and type are captured so
 * the UI can render an accurate attachment list.
 */
export async function uploadDocument(
  recordId: string,
  file: { name: string; size: number; type: string },
  uploadedBy: string,
): Promise<DocumentRef> {
  const record = recordRef(recordId)
  const doc: DocumentRef = {
    id: nextId('doc'),
    name: file.name,
    sizeBytes: file.size,
    mimeType: file.type || 'application/octet-stream',
    uploadedAt: now(),
    uploadedBy,
  }
  record.documents.push(doc)
  return respond(doc, 500, 900)
}

export interface CreateClaimPayload {
  policyId: string
  treatmentDescription: string
  amountRequested: number
  /** When false the claim is saved as a `created` draft instead of being submitted. */
  submit: boolean
}

/** POST /api/hospitals/records/:recordId/claims */
export async function createClaimFromRecord(
  hospitalId: string,
  authorName: string,
  recordId: string,
  payload: CreateClaimPayload,
): Promise<Claim> {
  const record = recordRef(recordId)
  if (record.hospitalId !== hospitalId) throw notFound('Medical record', recordId)
  if (record.claimId) {
    throw badRequest(`A claim already exists for record ${record.recordNumber}.`)
  }

  const policy = policies.find((p) => p.id === payload.policyId)
  if (!policy) throw notFound('Policy', payload.policyId)
  if (policy.holderPatientId !== record.patientId) {
    throw badRequest('That policy does not belong to the patient on this record.')
  }
  if (payload.amountRequested <= 0) {
    throw badRequest('The claimed amount must be greater than zero.')
  }

  const claim: Claim = {
    id: nextId('clm'),
    claimNumber: nextNumber('CLM', claims.length + 41),
    recordId: record.id,
    patientId: record.patientId,
    patientName: record.patientName,
    hospitalId: record.hospitalId,
    hospitalName: record.hospitalName,
    insurerId: policy.insurerId,
    insurerName: policy.insurerName,
    policyId: policy.id,
    policyNumber: policy.policyNumber,
    treatmentDescription: payload.treatmentDescription,
    diagnosis: record.diagnosis,
    amountRequested: payload.amountRequested,
    amountApproved: null,
    currency: 'MYR',
    status: 'created',
    createdAt: now(),
    submittedAt: null,
    updatedAt: now(),
    decision: null,
    paymentId: null,
    timeline: [],
  }
  claims.unshift(claim)
  record.claimId = claim.id

  appendEvent(
    claim,
    'created',
    'Claim drafted',
    `Raised from medical record ${record.recordNumber}.`,
    authorName,
    'hospital',
  )

  if (payload.submit) {
    claim.status = 'submitted'
    claim.submittedAt = now()
    appendEvent(
      claim,
      'submitted',
      'Submitted to insurer',
      `Sent to ${policy.insurerName} with ${record.documents.length} supporting document${record.documents.length === 1 ? '' : 's'}. Queued for Gonka plausibility verification.`,
      authorName,
      'hospital',
    )
  }

  return respond(claim, 400, 750)
}

/** POST /api/hospitals/records/:recordId/claims — submitting a previously saved draft. */
export async function submitClaim(
  hospitalId: string,
  authorName: string,
  claimId: string,
): Promise<Claim> {
  const claim = claimRef(claimId)
  if (claim.hospitalId !== hospitalId) throw notFound('Claim', claimId)
  if (claim.status !== 'created') {
    throw badRequest(`Claim ${claim.claimNumber} has already been submitted.`)
  }
  const record = recordRef(claim.recordId)

  claim.status = 'submitted'
  claim.submittedAt = now()
  appendEvent(
    claim,
    'submitted',
    'Submitted to insurer',
    `Sent to ${claim.insurerName} with ${record.documents.length} supporting document${record.documents.length === 1 ? '' : 's'}. Queued for Gonka plausibility verification.`,
    authorName,
    'hospital',
  )
  return respond(claim, 350, 600)
}

/** GET /api/hospitals/claims */
export async function getClaims(
  hospitalId: string,
  query: ListQuery = {},
): Promise<Paginated<Claim>> {
  const rows = claims
    .filter((c) => c.hospitalId === hospitalId)
    .filter((c) => (query.status ? c.status === query.status : true))
    .filter((c) => matchesQuery(query.q, c.claimNumber, c.patientName, c.diagnosis))
    .sort(byNewest((c) => c.updatedAt))
  return respondList(rows, query)
}

/** GET /api/hospitals/claims/:claimId */
export async function getClaimById(hospitalId: string, claimId: string): Promise<Claim> {
  const claim = claims.find((c) => c.id === claimId && c.hospitalId === hospitalId)
  if (!claim) throw notFound('Claim', claimId)

  // The insurer's internal reasoning stays hidden until the claim is finalised.
  const finalised = ['approved', 'rejected', 'paid', 'closed', 'auto_approved'].includes(
    claim.status,
  )
  return respond({
    ...claim,
    timeline: finalised ? claim.timeline : claim.timeline.filter((e) => !e.internal),
  })
}
