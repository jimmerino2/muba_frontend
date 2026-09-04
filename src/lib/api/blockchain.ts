import { API_MODE } from './http'
import * as live from './live/blockchain'
import * as mock from './mock/blockchain'

/**
 * Sui transaction records — the dispatch point between the live backend and
 * the in-memory mock layer.
 *
 * Components import from here and never learn which is in use; that is the
 * whole point of the seam. `VITE_API_MODE=mock` selects the fixtures, which is
 * how the full lifecycle can still be demoed with no backend, no seeded
 * database and no Gonka key. Anything else, including the default, is live.
 *
 * The mock implementation is kept rather than deleted, for exactly that reason.
 */
const impl = API_MODE === 'mock' ? (mock as unknown as typeof live) : live

export type { TransactionQuery } from './live/blockchain'

export const {
  getTransactions,
  getTransactionById,
  getClaimTransaction,
  getPaymentTransaction,
  getStatus,
} = impl
