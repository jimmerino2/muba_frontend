import type { BlockchainRef, ChainStatus, ListQuery, Paginated } from '@/lib/types'
import { blockchainRefs, chainStatus } from '@/lib/mock-data/blockchain'
import { byNewest, matchesQuery, notFound, respond, respondList } from '../client'

/**
 * Mirrors the blockchain routes:
 *   GET /api/blockchain/transactions[/:transactionId]
 *   GET /api/blockchain/claims/:claimId
 *   GET /api/blockchain/payments/:paymentId
 *   GET /api/blockchain/status
 *
 * Everything is Sui testnet and every payout is simulated — the UI labels it that
 * way rather than implying real settlement.
 */

export interface TransactionQuery extends ListQuery {
  kind?: BlockchainRef['kind']
}

/** GET /api/blockchain/transactions */
export async function getTransactions(
  query: TransactionQuery = {},
): Promise<Paginated<BlockchainRef>> {
  const rows = blockchainRefs
    .filter((t) => (query.kind ? t.kind === query.kind : true))
    .filter((t) => matchesQuery(query.q, t.digest, t.claimId, t.paymentId))
    .sort(byNewest((t) => t.timestamp))
  return respondList(rows, query)
}

/** GET /api/blockchain/transactions/:transactionId */
export async function getTransactionById(transactionId: string): Promise<BlockchainRef> {
  const tx = blockchainRefs.find((t) => t.id === transactionId || t.digest === transactionId)
  if (!tx) throw notFound('Transaction', transactionId)
  return respond(tx)
}

/**
 * GET /api/blockchain/claims/:claimId — the verification attestation for a claim.
 * Returns null when the claim has not been verified yet.
 */
export async function getClaimTransaction(claimId: string): Promise<BlockchainRef | null> {
  const tx = blockchainRefs
    .filter((t) => t.claimId === claimId && t.kind === 'claim_attestation')
    .sort(byNewest((t) => t.timestamp))[0]
  return respond(tx ?? null)
}

/** GET /api/blockchain/payments/:paymentId — the settlement transaction, if any. */
export async function getPaymentTransaction(paymentId: string): Promise<BlockchainRef | null> {
  const tx = blockchainRefs.find((t) => t.paymentId === paymentId && t.kind === 'settlement')
  return respond(tx ?? null)
}

/** GET /api/blockchain/status */
export async function getStatus(): Promise<ChainStatus> {
  return respond(
    {
      ...chainStatus,
      // The checkpoint height advances while the demo is open, as a real node's would.
      latestCheckpoint: chainStatus.latestCheckpoint + Math.floor(Date.now() / 3_000) % 5_000,
    },
    100,
    240,
  )
}
