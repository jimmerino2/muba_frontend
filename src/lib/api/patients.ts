import { API_MODE } from './http'
import * as live from './live/patients'
import * as mock from './mock/patients'

/**
 * The patient's own view — dispatch between the live backend and the mock
 * fixtures. See `blockchain.ts` for the note on why both exist.
 */
const impl = API_MODE === 'mock' ? (mock as unknown as typeof live) : live

export const {
  getMe,
  getMyRecords,
  getMyRecordById,
  getMyClaims,
  getMyClaimById,
  getMyPayments,
  getMyPolicies,
} = impl
