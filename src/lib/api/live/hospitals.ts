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
import { badRequest, notFound } from '../client'
import { http, paginate } from '../http'
import type {
  WireClaim,
  WireDocumentRef,
  WireMedicalRecord,
  WireOrganization,
  WirePatient,
  WirePayment,
  WirePolicy,
} from '../wire'
import { toClaim, toMedicalRecord, toOrganization, toPatient, toPolicy } from '../adapters'
import {
  cache,
  claimEvents,
  claimNames,
  invalidatePayments,
  organizationName,
  patientName,
} from './_resolve'
import { TRUTH_SCORE_THRESHOLD } from './config'

/**
 * The hospital / TPA view.
 *
 *   GET   /api/identity/organizations/:id
 *   GET   /api/patients[?q=]
 *   GET   /api/patients/:id
 *   POST  /api/records
 *   GET   /api/records[?unclaimedOnly=true]
 *   GET   /api/records/:id
 *   PATCH /api/records/:id
 *   POST  /api/records/:id/documents
 *   POST  /api/records/:id/claims
 *   POST  /api/claims/:id/submit
 *   GET   /api/claims[/:id]
 *
 * The `hospitalId` every function takes is no longer what scopes the data — the
 * backend resolves the caller's own organisation from the bearer token and will
 * not accept one from the client. It is kept in the signatures so no view had
 * to change, and used only where the UI needs the id itself.
 *
 * There is no `GET /api/hospitals/me/dashboard` on the backend, so
 * `getDashboard` composes the same figures from the claims, payments and
 * records lists. That keeps the numbers honest — they are derived from the same
 * rows the list views show — at the cost of three requests instead of one.
 */

function matches(query: string | undefined, ...fields: (string | null | undefined)[]): boolean {
  if (!query?.trim()) return true
  const needle = query.trim().toLowerCase()
  return fields.some((field) => (field ?? '').toLowerCase().includes(needle))
}

const newestFirst = <T>(pick: (item: T) => string) => (a: T, b: T) =>
  Date.parse(pick(b)) - Date.parse(pick(a))

/** Buckets defined once, in the vocabulary of the single shared lifecycle. */
const PENDING_CLAIM_STATUSES = new Set(['submitted', 'verified', 'pending_review'])
const APPROVED_CLAIM_STATUSES = new Set(['auto_approved', 'approved', 'paid', 'closed'])

/* --------------------------------------------------------------- shared */

async function hydrateClaim(claim: WireClaim, withEvents = true): Promise<Claim> {
  const [names, events] = await Promise.all([
    claimNames(claim),
    withEvents ? claimEvents(claim.id) : Promise.resolve([]),
  ])
  return toClaim(claim, names, events)
}

async function hydrateRecord(record: WireMedicalRecord): Promise<MedicalRecord> {
  const [patient, hospital] = await Promise.all([
    patientName(record.patientId),
    organizationName(record.hospitalOrganizationId),
  ])
  return toMedicalRecord(record, { patientName: patient, hospitalName: hospital })
}

/* ------------------------------------------------------------------- me */

export async function getMe(hospitalId: string): Promise<Organization> {
  const org = await http<WireOrganization>(`/api/identity/organizations/${hospitalId}`)
  if (!org) throw notFound('Organization', hospitalId)
  return toOrganization(org)
}

/* ------------------------------------------------------------ dashboard */

export async function getDashboard(hospitalId: string): Promise<HospitalDashboard> {
  const [wireClaims, wirePayments, wireRecords] = await Promise.all([
    http<WireClaim[]>('/api/claims'),
    http<WirePayment[]>('/api/payments'),
    http<WireMedicalRecord[]>('/api/records'),
  ])

  const claims = await Promise.all((wireClaims ?? []).map((c) => hydrateClaim(c, false)))
  const records = await Promise.all((wireRecords ?? []).map(hydrateRecord))

  // The backend already scopes both lists to the caller's own organisation;
  // filtering again is belt-and-braces against a future unscoped endpoint.
  const mine = claims.filter((c) => c.hospitalId === hospitalId)
  const myPayments = (wirePayments ?? []).filter((p) => p.payeeOrganizationId === hospitalId)
  const myRecords = records.filter((r) => r.hospitalId === hospitalId)

  const pendingPayments = myPayments.filter((p) => p.status !== 'SETTLED')
  const receivedPayments = myPayments.filter((p) => p.status === 'SETTLED')
  const sum = (rows: WirePayment[]) => rows.reduce((total, p) => total + p.amount, 0)

  return {
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
    recentClaims: [...mine].sort(newestFirst((c) => c.updatedAt)).slice(0, 5),
    recentRecords: [...myRecords].sort(newestFirst((r) => r.createdAt)).slice(0, 5),
    patientCount: new Set(myRecords.map((r) => r.patientId)).size,
  }
}

/* -------------------------------------------------------------- patients */

export async function getPatients(
  _hospitalId: string,
  query: ListQuery = {},
): Promise<Paginated<Patient>> {
  // `GET /api/patients` is the directory lookup — it takes the free-text filter
  // server-side, so `q` is forwarded rather than applied here.
  const wire = await http<WirePatient[]>('/api/patients', { query: { q: query.q } })
  const rows = (wire ?? []).map((p) => {
    cache.patients.put(p.id, p)
    return toPatient(p)
  })
  return paginate(rows, query)
}

export interface PatientDetail {
  patient: Patient
  records: MedicalRecord[]
  claims: Claim[]
  policies: Policy[]
}

export async function getPatientById(
  hospitalId: string,
  patientId: string,
): Promise<PatientDetail> {
  const wirePatient = await http<WirePatient>(`/api/patients/${patientId}`)
  if (!wirePatient) throw notFound('Patient', patientId)
  cache.patients.put(wirePatient.id, wirePatient)

  const [wireRecords, wireClaims] = await Promise.all([
    http<WireMedicalRecord[]>('/api/records'),
    http<WireClaim[]>('/api/claims'),
  ])

  const records = await Promise.all(
    (wireRecords ?? [])
      .filter((r) => r.patientId === patientId && r.hospitalOrganizationId === hospitalId)
      .map(hydrateRecord),
  )
  const claims = await Promise.all(
    (wireClaims ?? [])
      .filter((c) => c.patientRef === patientId && c.hospitalOrganizationId === hospitalId)
      .map((c) => hydrateClaim(c, false)),
  )

  // A hospital cannot browse an insurer's book of policies (the backend returns
  // an empty list by design — see API.md on `GET /policies`), but it can resolve
  // the specific policies already referenced by this patient's claims, which is
  // exactly what it needs to file against.
  const policyIds = [...new Set(claims.map((c) => c.policyId))]
  const policies = (
    await Promise.all(
      policyIds.map(async (id) => {
        const policy = await cache.policies.get(id)
        if (!policy) return null
        const insurer = await organizationName(policy.insuranceOrganizationId)
        return toPolicy(
          policy,
          { insurerName: insurer, holderName: wirePatient.name },
          TRUTH_SCORE_THRESHOLD,
        )
      }),
    )
  ).filter((p): p is Policy => p !== null)

  return {
    patient: toPatient(wirePatient, policyIds),
    records: records.sort(newestFirst((r) => r.visitDate)),
    claims: claims.sort(newestFirst((c) => c.updatedAt)),
    policies,
  }
}

/* --------------------------------------------------------------- records */

export async function getRecords(
  hospitalId: string,
  query: ListQuery & { unclaimedOnly?: boolean } = {},
): Promise<Paginated<MedicalRecord>> {
  const wire = await http<WireMedicalRecord[]>('/api/records', {
    query: { unclaimedOnly: query.unclaimedOnly ? 'true' : undefined },
  })
  const records = await Promise.all((wire ?? []).map(hydrateRecord))
  const rows = records
    .filter((r) => r.hospitalId === hospitalId)
    .filter((r) =>
      matches(query.q, r.patientName, r.diagnosis, r.recordNumber, r.department, r.physician),
    )
    .sort(newestFirst((r) => r.visitDate))
  return paginate(rows, query)
}

export async function getRecordById(
  hospitalId: string,
  recordId: string,
): Promise<MedicalRecord> {
  const record = await http<WireMedicalRecord>(`/api/records/${recordId}`)
  if (!record || record.hospitalOrganizationId !== hospitalId) {
    throw notFound('Medical record', recordId)
  }
  cache.records.put(record.id, record)
  return hydrateRecord(record)
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

export async function createRecord(
  _hospitalId: string,
  _authorName: string,
  payload: CreateRecordPayload,
): Promise<MedicalRecord> {
  if (!payload.lineItems.length) throw badRequest('A record needs at least one billed line item.')

  // `createdBy` is set server-side from the authenticated account — the author
  // name the caller passes is not trusted, and is not sent.
  const record = await http<WireMedicalRecord>('/api/records', { method: 'POST', body: payload })
  cache.records.put(record.id, record)
  return hydrateRecord(record)
}

export async function updateRecord(
  _hospitalId: string,
  recordId: string,
  patch: Partial<CreateRecordPayload>,
): Promise<MedicalRecord> {
  const record = await http<WireMedicalRecord>(`/api/records/${recordId}`, {
    method: 'PATCH',
    body: patch,
  })
  cache.records.put(record.id, record)
  return hydrateRecord(record)
}

/**
 * Metadata-only, exactly as the backend stores it: no bytes leave the browser.
 * The UI is explicit that document upload is not real storage in this build.
 */
export async function uploadDocument(
  recordId: string,
  file: { name: string; size: number; type: string },
  uploadedBy: string,
): Promise<DocumentRef> {
  const doc = await http<WireDocumentRef>(`/api/records/${recordId}/documents`, {
    method: 'POST',
    body: {
      name: file.name,
      sizeBytes: file.size,
      mimeType: file.type || 'application/octet-stream',
    },
  })
  return {
    id: doc.id,
    name: doc.name,
    sizeBytes: doc.sizeBytes,
    mimeType: doc.mimeType,
    uploadedAt: doc.uploadedAt,
    uploadedBy,
  }
}

/* ---------------------------------------------------------------- claims */

export interface CreateClaimPayload {
  policyId: string
  treatmentDescription: string
  amountRequested: number
  /** When false the claim is saved as a `created` draft instead of submitted. */
  submit: boolean
}

/**
 * `POST /api/records/:id/claims`.
 *
 * The insurer and the treatment type are not on the UI's payload, so both are
 * derived from the policy the claim is being filed against — which is where
 * they genuinely come from: a policy belongs to exactly one insurer, and its
 * covered treatment types are the only ones that will pass verification.
 */
export async function createClaimFromRecord(
  _hospitalId: string,
  _authorName: string,
  recordId: string,
  payload: CreateClaimPayload,
): Promise<Claim> {
  if (payload.amountRequested <= 0) {
    throw badRequest('The claimed amount must be greater than zero.')
  }

  const policy = await cache.policies.get(payload.policyId)
  if (!policy) throw notFound('Policy', payload.policyId)

  const record = await cache.records.get(recordId)
  const treatmentType = treatmentTypeFor(policy, record)

  const claim = await http<WireClaim>(`/api/records/${recordId}/claims`, {
    method: 'POST',
    body: {
      policyId: payload.policyId,
      insuranceOrganizationId: policy.insuranceOrganizationId,
      treatmentType,
      claimAmount: payload.amountRequested,
      claimType: 'GL',
      submit: payload.submit,
    },
  })

  // A submitted claim can be auto-approved on verification, which creates a
  // payment — the cached index would otherwise miss it.
  invalidatePayments()
  return hydrateClaim(claim)
}

/**
 * Picks the treatment type to file under.
 *
 * The record's admission type is the best available signal, and it is only used
 * when the policy actually covers the corresponding type; otherwise the first
 * covered type is used, and a policy that covers everything (an empty list)
 * falls back to the admission type as written. This is a mapping the backend
 * would ideally own — noted rather than hidden.
 */
function treatmentTypeFor(policy: WirePolicy, record: WireMedicalRecord | null): string {
  const covered = policy.coverageRules.coveredTreatmentTypes
  const fromAdmission =
    record?.admissionType === 'day-surgery' || record?.admissionType === 'inpatient'
      ? 'surgery'
      : record?.admissionType === 'emergency'
        ? 'emergency_care'
        : 'consultation'

  if (covered.length === 0) return fromAdmission
  return covered.includes(fromAdmission) ? fromAdmission : covered[0]!
}

export async function submitClaim(
  _hospitalId: string,
  _authorName: string,
  claimId: string,
): Promise<Claim> {
  const claim = await http<WireClaim>(`/api/claims/${claimId}/submit`, { method: 'POST' })
  return hydrateClaim(claim)
}

export async function getClaims(
  hospitalId: string,
  query: ListQuery = {},
): Promise<Paginated<Claim>> {
  const wire = await http<WireClaim[]>('/api/claims')
  const claims = await Promise.all(
    (wire ?? []).filter((c) => c.hospitalOrganizationId === hospitalId).map((c) => hydrateClaim(c)),
  )
  const rows = claims
    .filter((c) => (query.status ? c.status === query.status : true))
    .filter((c) => matches(query.q, c.claimNumber, c.patientName, c.diagnosis))
    .sort(newestFirst((c) => c.updatedAt))
  return paginate(rows, query)
}

export async function getClaimById(hospitalId: string, claimId: string): Promise<Claim> {
  const wire = await http<WireClaim>(`/api/claims/${claimId}`)
  if (!wire || wire.hospitalOrganizationId !== hospitalId) throw notFound('Claim', claimId)

  const claim = await hydrateClaim(wire)
  // The insurer's internal assessment reasoning stays hidden until the claim
  // is finalised — the same rule the mock layer applied.
  const finalised = ['approved', 'rejected', 'paid', 'closed', 'auto_approved'].includes(claim.status)
  return finalised ? claim : { ...claim, timeline: claim.timeline.filter((e) => !e.internal) }
}

/** `POST /api/claims/:id/close` — the hospital's last step, after settlement. */
export async function closeClaim(_hospitalId: string, claimId: string): Promise<Claim> {
  const claim = await http<WireClaim>(`/api/claims/${claimId}/close`, { method: 'POST' })
  return hydrateClaim(claim)
}
