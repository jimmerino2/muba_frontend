import { API_MODE } from './http'
import * as live from './live/tpa'
import * as mock from './mock/tpa'

/**
 * The TPA view — dispatch between the live backend and the mock fixtures.
 * See `blockchain.ts` for the note on why both exist.
 */
const impl = API_MODE === 'mock' ? (mock as unknown as typeof live) : live

export type { TpaClaimDetail } from './live/tpa'

export const {
  getDashboard,
  getClaims,
  getReviewQueue,
  getClaimById,
  approveClaim,
  rejectClaim,
  requestMoreInfo,
  getPayments,
} = impl
