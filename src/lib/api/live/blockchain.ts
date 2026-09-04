import type { BlockchainRef, ChainStatus, ListQuery, Paginated } from '@/lib/types'
import { notFound } from '../client'
import { http, paginate } from '../http'
import type { WireBlockchainRef, WireChainStatus } from '../wire'
import { toBlockchainRef, toChainStatus } from '../adapters'

/**
 * Read-only queries over the on-chain record.
 *
 *   GET /api/blockchain/transactions[?kind=]
 *   GET /api/blockchain/transactions/:id      (by internal id or by digest)
 *   GET /api/blockchain/claims/:claimId       (the verification attestation)
 *   GET /api/blockchain/payments/:paymentId   (the settlement)
 *   GET /api/blockchain/status
 *
 * Two kinds of transaction exist and no more: a `claim_attestation` per
 * verified claim, and a `settlement` per settled payment. Both are real Sui
 * testnet transactions when a gas station is configured, and a deterministic
 * mock digest when one isn't — the backend says which, and the UI carries the
 * "Testnet · Simulated payout" framing either way.
 */

const newestFirst = <T>(pick: (item: T) => string) => (a: T, b: T) =>
  Date.parse(pick(b)) - Date.parse(pick(a))

function matches(query: string | undefined, ...fields: (string | null | undefined)[]): boolean {
  if (!query?.trim()) return true
  const needle = query.trim().toLowerCase()
  return fields.some((field) => (field ?? '').toLowerCase().includes(needle))
}

export interface TransactionQuery extends ListQuery {
  kind?: BlockchainRef['kind']
}

export async function getTransactions(
  query: TransactionQuery = {},
): Promise<Paginated<BlockchainRef>> {
  const wire = await http<WireBlockchainRef[]>('/api/blockchain/transactions', {
    query: { kind: query.kind },
  })
  const rows = (wire ?? [])
    .map(toBlockchainRef)
    .filter((t) => matches(query.q, t.digest, t.claimId, t.paymentId))
    .sort(newestFirst((t) => t.timestamp))
  return paginate(rows, query)
}

export async function getTransactionById(transactionId: string): Promise<BlockchainRef> {
  const ref = await http<WireBlockchainRef>(`/api/blockchain/transactions/${transactionId}`)
  if (!ref) throw notFound('Transaction', transactionId)
  return toBlockchainRef(ref)
}

/** Null when the claim has not been verified yet. */
export async function getClaimTransaction(claimId: string): Promise<BlockchainRef | null> {
  const ref = await http<WireBlockchainRef | null>(`/api/blockchain/claims/${claimId}`)
  return ref ? toBlockchainRef(ref) : null
}

/** Null until the payment has settled. */
export async function getPaymentTransaction(paymentId: string): Promise<BlockchainRef | null> {
  const ref = await http<WireBlockchainRef | null>(`/api/blockchain/payments/${paymentId}`)
  return ref ? toBlockchainRef(ref) : null
}

export async function getStatus(): Promise<ChainStatus> {
  const status = await http<WireChainStatus>('/api/blockchain/status')
  if (!status) throw notFound('Chain status', 'status')
  return toChainStatus(status)
}
