import { API_MODE } from './http'
import * as live from './live/dev'
import * as mock from './mock/dev'

/**
 * Dev tools — the settlement-treasury top-up button, dispatched between the
 * live backend and the mock fixtures the same way every other resource is.
 * See `blockchain.ts` for why both implementations are kept.
 */
const impl = API_MODE === 'mock' ? (mock as unknown as typeof live) : live

export type { FundTreasuryResult } from './live/dev'

export const { fundTreasury } = impl
