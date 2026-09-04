import type {
  Claim,
  ListQuery,
  MedicalRecord,
  Paginated,
  Patient,
  Payment,
  Policy,
} from '@/lib/types'
import { http, paginate } from '../http'
import { notFound } from '../client'
import type { WireClaim, WireMedicalRecord, WirePatient, WirePayment, WirePolicy } from '../wire'
import { toClaim, toMedicalRecord, toPatient, toPayment, toPolicy } from '../adapters'
import { cache, claimEvents, claimNames, organizationName, patientName } from './_resolve'
import { TRUTH_SCORE_THRESHOLD } from './config'

/**
 * The patient's own view. Every route here is already scoped to the signed-in
 * account by the backend — `GET /api/claims` returns only claims where the
 * caller is the patient, `GET /api/policies` only their own policies — so the
 * `patientId` argument each function still takes is used for client-side
 * filtering and nothing else. It is kept in the signature so the calling views
 * did not have to change.
 *
 *   GET /api/patients/me
 *   GET /api/records          (scoped to the caller)
 *   GET /api/claims           (scoped to the caller)
 *   GET /api/payments         (scoped to the caller)
 *   GET /api/policies         (scoped to the caller)
 */

function matches(query: string | undefined, ...fields: (string | null | undefined)[]): boolean {
  if (!query?.trim()) return true
  const needle = query.trim().toLowerCase()
  return fields.some((field) => (field ?? '').toLowerCase().includes(needle))
}

const newestFirst = <T>(pick: (item: T) => string) => (a: T, b: T) =>
  Date.parse(pick(b)) - Date.parse(pick(a))

/* ------------------------------------------------------------------ me */

export async function getMe(_patientId: string): Promise<Patient> {
  const patient = await http<WirePatient>('/api/patients/me')
  if (!patient) throw notFound('Patient', 'me')

  const policies = await http<WirePolicy[]>('/api/policies')
  return toPatient(
    patient,
    (policies ?? []).filter((p) => p.patientRef === patient.id).map((p) => p.id),
  )
}

export interface UpdateProfilePayload {
  name?: string
  phone?: string
  dateOfBirth?: string
  gender?: 'male' | 'female'
  nationalId?: string
  address?: string
  bloodType?: string
}

/**
 * `PATCH /api/patients/:id` — powers the post-login "complete your profile"
 * setup page. A freshly auto-created patient (see the backend's
 * `bindOrCreateForAccount`) starts with every one of these fields blank; the
 * setup page is what actually fills them in for the first time.
 */
export async function updateProfile(patientId: string, patch: UpdateProfilePayload): Promise<Patient> {
  const patient = await http<WirePatient>(`/api/patients/${patientId}`, { method: 'PATCH', body: patch })
  cache.patients.put(patient.id, patient)
  return toPatient(patient)
}

/* -------------------------------------------------------------- records */

async function hydrateRecord(record: WireMedicalRecord): Promise<MedicalRecord> {
  const [patient, hospital] = await Promise.all([
    patientName(record.patientId),
    organizationName(record.hospitalOrganizationId),
  ])
  return toMedicalRecord(record, { patientName: patient, hospitalName: hospital })
}

export async function getMyRecords(
  _patientId: string,
  query: ListQuery = {},
): Promise<Paginated<MedicalRecord>> {
  const wire = await http<WireMedicalRecord[]>('/api/records')
  const records = await Promise.all((wire ?? []).map(hydrateRecord))
  const rows = records
    .filter((r) => matches(query.q, r.diagnosis, r.recordNumber, r.hospitalName, r.department))
    .sort(newestFirst((r) => r.visitDate))
  return paginate(rows, query)
}

export async function getMyRecordById(
  _patientId: string,
  recordId: string,
): Promise<MedicalRecord> {
  const record = await http<WireMedicalRecord>(`/api/records/${recordId}`)
  if (!record) throw notFound('Medical record', recordId)
  cache.records.put(record.id, record)
  return hydrateRecord(record)
}

/* --------------------------------------------------------------- claims */

export async function getMyClaims(
  _patientId: string,
  query: ListQuery = {},
): Promise<Paginated<Claim>> {
  const wire = await http<WireClaim[]>('/api/claims')
  const claims = await Promise.all(
    (wire ?? []).map(async (claim) => {
      const [names, events] = await Promise.all([claimNames(claim), claimEvents(claim.id)])
      // A patient never sees the insurer's internal assessment reasoning.
      return toClaim(claim, names, events.filter((e) => !e.internal))
    }),
  )

  const rows = claims
    .filter((c) => (query.status ? c.status === query.status : true))
    .filter((c) => matches(query.q, c.claimNumber, c.diagnosis, c.treatmentDescription))
    .sort(newestFirst((c) => c.updatedAt))
  return paginate(rows, query)
}

export async function getMyClaimById(_patientId: string, claimId: string): Promise<Claim> {
  const claim = await http<WireClaim>(`/api/claims/${claimId}`)
  if (!claim) throw notFound('Claim', claimId)
  const [names, events] = await Promise.all([claimNames(claim), claimEvents(claim.id)])
  return toClaim(claim, names, events.filter((e) => !e.internal))
}

/* ------------------------------------------------------------- payments */

/**
 * `GET /api/payments` returns an empty list for a `USER` — a payment is between
 * the insurer and the hospital, and the patient is not a party to it. Their
 * claims still carry the settlement digest, which is what the payments view
 * actually renders, so this reconstructs the row from the claim rather than
 * showing a patient an empty page for payouts that genuinely happened.
 */
export async function getMyPayments(
  _patientId: string,
  query: ListQuery = {},
): Promise<Paginated<Payment>> {
  const direct = await http<WirePayment[]>('/api/payments')
  if (direct && direct.length > 0) {
    const rows = await Promise.all(
      direct.map(async (payment) => {
        const claim = await http<WireClaim>(`/api/claims/${payment.claimId}`)
        const names = claim ? await claimNames(claim) : null
        return toPayment(payment, {
          claimNumber: claim?.claimNumber ?? '—',
          payerName: names?.insurerName ?? 'Insurer',
          payeeName: names?.hospitalName ?? 'Hospital',
          patientName: names?.patientName ?? '',
        })
      }),
    )
    return paginate(
      rows
        .filter((p) => (query.status ? p.status === query.status : true))
        .sort(newestFirst((p) => p.createdAt)),
      query,
    )
  }

  const claims = await http<WireClaim[]>('/api/claims')
  const settled = (claims ?? []).filter((c) => c.suiTxDigest !== null)
  const rows = await Promise.all(
    settled.map(async (claim) => {
      const names = await claimNames(claim)
      return toPayment(
        {
          id: names.paymentId ?? `claim-${claim.id}`,
          claimId: claim.id,
          payerOrganizationId: claim.insuranceOrganizationId,
          payeeOrganizationId: claim.hospitalOrganizationId,
          amount: claim.approvedAmount ?? claim.claimAmount,
          // Mirrors the backend's own display-only conversion; the settled
          // amount itself is never converted.
          amountUsdc: Math.round(((claim.approvedAmount ?? claim.claimAmount) / 4.7) * 100) / 100,
          status: claim.status === 'CLOSED' || claim.status.startsWith('PAYMENT') ? 'SETTLED' : 'PENDING',
          failureReason: null,
          suiTxDigest: claim.suiTxDigest,
          settlementReference: claim.settlementReference,
          createdAt: claim.updatedAt,
          initiatedAt: claim.updatedAt,
          completedAt: claim.updatedAt,
        },
        {
          claimNumber: claim.claimNumber,
          payerName: names.insurerName,
          payeeName: names.hospitalName,
          patientName: names.patientName,
        },
      )
    }),
  )

  return paginate(
    rows
      .filter((p) => (query.status ? p.status === query.status : true))
      .sort(newestFirst((p) => p.createdAt)),
    query,
  )
}

/* ------------------------------------------------------------- policies */

export async function getMyPolicies(_patientId: string): Promise<Paginated<Policy>> {
  const wire = await http<WirePolicy[]>('/api/policies')
  const rows = await Promise.all(
    (wire ?? []).map(async (policy) => {
      cache.policies.put(policy.id, policy)
      const [insurer, holder] = await Promise.all([
        organizationName(policy.insuranceOrganizationId),
        patientName(policy.patientRef),
      ])
      return toPolicy(policy, { insurerName: insurer, holderName: holder }, TRUTH_SCORE_THRESHOLD)
    }),
  )
  return paginate(rows)
}
