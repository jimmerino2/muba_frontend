import { http } from '../http'
import type {
  WireClaim,
  WireClaimEvent,
  WireMedicalRecord,
  WireOrganization,
  WirePatient,
  WirePayment,
  WirePolicy,
} from '../wire'
import { toClaimEvent, type ClaimNames } from '../adapters'
import type { ClaimEvent } from '@/lib/types'

/**
 * Name resolution for the denormalised shapes the UI renders.
 *
 * The backend returns ids — `hospitalOrganizationId`, `policyId`, `patientRef`
 * — because that is what a normalised store should return. The UI renders
 * "Sunway General Hospital" and "POL-DEMO-0001". Something has to bridge that,
 * and doing it here rather than widening the API keeps the backend contract
 * clean and the change confined to the data-fetching layer, exactly where the
 * frontend CLAUDE.md says the seam belongs.
 *
 * Three things keep this from being pathological:
 *
 *   1. **Caching.** Organisations, policies and patients barely change within a
 *      session, so each id is fetched at most once and memoised for the rest of
 *      it. A claims list of 12 claims across 2 orgs and 3 policies costs 5
 *      lookups, not 36.
 *   2. **De-duplication.** Two concurrent callers asking for the same id share
 *      one in-flight promise rather than racing two identical requests.
 *   3. **Failure is not fatal.** A name that cannot be resolved (a
 *      cross-organisation lookup the caller isn't entitled to, say — the
 *      backend returns 404 by design) degrades to a readable placeholder
 *      instead of failing the whole list.
 *
 * `reset()` is called on sign-out and role switch: the cache is scoped to one
 * signed-in session, and a hospital's cached view must not leak into an
 * insurer's.
 */

type Loader<T> = (id: string) => Promise<T>

function createCache<T>(load: Loader<T>) {
  const values = new Map<string, T>()
  const inFlight = new Map<string, Promise<T>>()

  return {
    async get(id: string): Promise<T> {
      const cached = values.get(id)
      if (cached !== undefined) return cached

      const pending = inFlight.get(id)
      if (pending) return pending

      const promise = load(id)
        .then((value) => {
          values.set(id, value)
          return value
        })
        .finally(() => inFlight.delete(id))

      inFlight.set(id, promise)
      return promise
    },
    /** Seeds the cache from a payload already fetched for another reason —
     * a policies list, say — so the same rows are never re-requested. */
    put(id: string, value: T): void {
      values.set(id, value)
    },
    clear(): void {
      values.clear()
      inFlight.clear()
    },
  }
}

/** A 404 here means "not visible to this caller", which is a legitimate answer
 * rather than an error — the org-isolation rules are working. */
async function tolerant<T>(load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load()
  } catch {
    return fallback
  }
}

/* ---------------------------------------------------------------- caches */

const organizations = createCache<WireOrganization | null>((id) =>
  tolerant(() => http<WireOrganization>(`/api/identity/organizations/${id}`), null),
)

const policies = createCache<WirePolicy | null>((id) =>
  tolerant(() => http<WirePolicy>(`/api/policies/${id}`), null),
)

const patients = createCache<WirePatient | null>((id) =>
  tolerant(() => http<WirePatient>(`/api/patients/${id}`), null),
)

const records = createCache<WireMedicalRecord | null>((id) =>
  tolerant(() => http<WireMedicalRecord>(`/api/records/${id}`), null),
)

export const cache = {
  organizations,
  policies,
  patients,
  records,
  /** Clear everything. Call on sign-out and on any change of signed-in role. */
  reset(): void {
    organizations.clear()
    policies.clear()
    patients.clear()
    records.clear()
  },
}

/* ------------------------------------------------------------- resolvers */

export async function organizationName(id: string): Promise<string> {
  const org = await organizations.get(id)
  return org?.name ?? 'Unknown organisation'
}

export async function patientName(patientRef: string): Promise<string> {
  const patient = await patients.get(patientRef)
  // A walk-in `patientRef` can be an opaque string with no Patient row behind
  // it at all — showing the reference itself beats showing nothing.
  return patient?.name ?? patientRef
}

export async function policyNumber(id: string): Promise<string> {
  const policy = await policies.get(id)
  return policy?.policyNumber ?? '—'
}

/* ------------------------------------------------------------- claim fan-out */

/**
 * Every payment in the session, keyed by claim id.
 *
 * A claim's `paymentId` is not on the claim row — payments reference claims,
 * not the other way round — so the list is fetched once and indexed. Refreshed
 * on demand rather than cached forever, because a payment appears the moment a
 * claim is approved.
 */
let paymentsByClaim: Map<string, string> | null = null

export async function paymentIdForClaim(claimId: string): Promise<string | null> {
  if (!paymentsByClaim) {
    const rows = await tolerant(() => http<WirePayment[]>('/api/payments'), [])
    paymentsByClaim = new Map((rows ?? []).map((p) => [p.claimId, p.id]))
  }
  return paymentsByClaim.get(claimId) ?? null
}

/** Invalidate after anything that can create or settle a payment. */
export function invalidatePayments(): void {
  paymentsByClaim = null
}

export async function claimEvents(claimId: string): Promise<ClaimEvent[]> {
  const events = await tolerant(() => http<WireClaimEvent[]>(`/api/claims/${claimId}/events`), [])
  return (events ?? []).map(toClaimEvent)
}

/**
 * Resolves everything a single claim needs for display.
 *
 * The four lookups run concurrently, and all four are cached, so resolving a
 * page of claims that share an insurer and a hospital costs a couple of
 * requests rather than four per claim.
 */
export async function claimNames(claim: WireClaim): Promise<ClaimNames> {
  const [patient, hospital, insurer, policy, record, paymentId] = await Promise.all([
    patientName(claim.patientRef),
    organizationName(claim.hospitalOrganizationId),
    organizationName(claim.insuranceOrganizationId),
    policyNumber(claim.policyId),
    claim.recordId ? records.get(claim.recordId) : Promise.resolve(null),
    paymentIdForClaim(claim.id),
  ])

  return {
    patientName: patient,
    hospitalName: hospital,
    insurerName: insurer,
    policyNumber: policy,
    diagnosis: record?.diagnosis ?? '',
    paymentId,
  }
}
