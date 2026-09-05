import { API_MODE } from './http'
import * as live from './live/insurance'
import * as mock from './mock/insurance'

/**
 * The insurer view — dispatch between the live backend and the mock fixtures.
 * See `blockchain.ts` for the note on why both exist.
 */
const impl = API_MODE === 'mock' ? (mock as unknown as typeof live) : live

export type { InsuranceClaimDetail, PolicyPayload } from './live/insurance'

export const {
  getDashboard,
  getClaims,
  getReviewQueue,
  getClaimById,
  approveClaim,
  rejectClaim,
  requestMoreInfo,
  getMembers,
  getPolicies,
  getPolicyById,
  createPolicy,
  updatePolicy,
  listTpaOrganizations,
} = impl
