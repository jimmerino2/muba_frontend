import type {
  Claim,
  ListQuery,
  MedicalRecord,
  Paginated,
  Patient,
  Payment,
  Policy,
} from '@/lib/types'
import { patients } from '@/lib/mock-data/users'
import { medicalRecords } from '@/lib/mock-data/records'
import { claims } from '@/lib/mock-data/claims'
import { payments } from '@/lib/mock-data/payments'
import { policies } from '@/lib/mock-data/policies'
import { byNewest, matchesQuery, notFound, respond, respondList } from '../client'

/**
 * Mirrors the patient-scoped routes. Every function is implicitly scoped to the
 * signed-in patient — `patientId` stands in for the bearer token the real API
 * will read the subject from.
 *
 *   GET /api/patients/me
 *   GET /api/patients/me/records[/:recordId]
 *   GET /api/patients/me/claims[/:claimId]
 *   GET /api/patients/me/payments
 *   GET /api/patients/me/policies
 */

/** GET /api/patients/me */
export async function getMe(patientId: string): Promise<Patient> {
  const patient = patients.find((p) => p.id === patientId)
  if (!patient) throw notFound('Patient', patientId)
  return respond(patient)
}

/** GET /api/patients/me/records */
export async function getMyRecords(
  patientId: string,
  query: ListQuery = {},
): Promise<Paginated<MedicalRecord>> {
  const rows = medicalRecords
    .filter((r) => r.patientId === patientId)
    .filter((r) => matchesQuery(query.q, r.diagnosis, r.recordNumber, r.hospitalName, r.department))
    .sort(byNewest((r) => r.visitDate))
  return respondList(rows, query)
}

/** GET /api/patients/me/records/:recordId */
export async function getMyRecordById(
  patientId: string,
  recordId: string,
): Promise<MedicalRecord> {
  const record = medicalRecords.find((r) => r.id === recordId && r.patientId === patientId)
  if (!record) throw notFound('Medical record', recordId)
  return respond(record)
}

/** GET /api/patients/me/claims */
export async function getMyClaims(
  patientId: string,
  query: ListQuery = {},
): Promise<Paginated<Claim>> {
  const rows = claims
    .filter((c) => c.patientId === patientId)
    .filter((c) => (query.status ? c.status === query.status : true))
    .filter((c) => matchesQuery(query.q, c.claimNumber, c.diagnosis, c.treatmentDescription))
    .sort(byNewest((c) => c.updatedAt))
  return respondList(rows, query)
}

/** GET /api/patients/me/claims/:claimId */
export async function getMyClaimById(patientId: string, claimId: string): Promise<Claim> {
  const claim = claims.find((c) => c.id === claimId && c.patientId === patientId)
  if (!claim) throw notFound('Claim', claimId)
  // Patients never see internal assessor notes.
  return respond({ ...claim, timeline: claim.timeline.filter((e) => !e.internal) })
}

/** GET /api/patients/me/payments */
export async function getMyPayments(
  patientId: string,
  query: ListQuery = {},
): Promise<Paginated<Payment>> {
  const myClaimIds = new Set(claims.filter((c) => c.patientId === patientId).map((c) => c.id))
  const rows = payments
    .filter((p) => myClaimIds.has(p.claimId))
    .filter((p) => (query.status ? p.status === query.status : true))
    .sort(byNewest((p) => p.createdAt))
  return respondList(rows, query)
}

/** GET /api/patients/me/policies */
export async function getMyPolicies(patientId: string): Promise<Paginated<Policy>> {
  const rows = policies.filter((p) => p.holderPatientId === patientId)
  return respondList(rows)
}
