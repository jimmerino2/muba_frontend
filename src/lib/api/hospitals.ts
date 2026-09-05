import { API_MODE } from './http'
import * as live from './live/hospitals'
import * as mock from './mock/hospitals'

/**
 * The hospital / TPA view — dispatch between the live backend and the mock
 * fixtures. See `blockchain.ts` for the note on why both exist.
 */
const impl = API_MODE === 'mock' ? (mock as unknown as typeof live) : live

export type {
  ClaimClauseContextInput,
  CreateClaimPayload,
  CreateRecordPayload,
  PatientDetail,
} from './live/hospitals'

export const {
  getMe,
  getDashboard,
  getPatients,
  getPatientById,
  getRecords,
  getRecordById,
  createRecord,
  updateRecord,
  uploadDocument,
  createClaimFromRecord,
  submitClaim,
  getClaims,
  getClaimById,
} = impl

/**
 * `POST /api/claims/:id/close` — the hospital's final step once settlement has
 * landed. Live-only: the mock layer never modelled a separate close action, so
 * in mock mode this is a no-op that reads the claim back unchanged.
 */
export const closeClaim: typeof live.closeClaim =
  API_MODE === 'mock'
    ? async (hospitalId, claimId) => mock.getClaimById(hospitalId, claimId)
    : live.closeClaim
