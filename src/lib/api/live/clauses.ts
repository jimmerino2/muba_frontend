import { http } from '../http'

/**
 * Just enough of `GET /api/clauses/products/:code` to populate the policy
 * form's tier selector — not the full clause/definition browsing surface.
 *
 * Fetched live rather than hardcoded on purpose: the tier numbers (limits,
 * deductible, room & board) are real contract terms transcribed from the
 * insurer's PDF, and a hardcoded copy in the frontend is exactly how this
 * session's seed-data numbers drifted from the real contract twice already.
 */

const MANULIFE_EZMED_CODE = 'MANULIFE_EZMED_DEDUCTIBLE_0125'

export interface ManulifePlan {
  id: string
  code: string
  name: string
  currency: string
  roomAndBoardPerDay: number
  overallAnnualLimit: number
  overallLifetimeLimit: number
  deductiblePerPolicyYear: number
}

interface WireProductDetail {
  plans: ManulifePlan[]
}

export async function getManulifePlans(): Promise<ManulifePlan[]> {
  const detail = await http<WireProductDetail>(`/api/clauses/products/${MANULIFE_EZMED_CODE}`)
  return detail?.plans ?? []
}
