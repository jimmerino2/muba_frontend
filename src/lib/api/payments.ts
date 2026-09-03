import type { BlockchainRef, ListQuery, Paginated, Payment, PaymentStatus } from '@/lib/types'
import { MYR_PER_USDC, payments } from '@/lib/mock-data/payments'
import { blockchainRefs } from '@/lib/mock-data/blockchain'
import { now } from '@/lib/mock-data/_time'
import { badRequest, byNewest, matchesQuery, notFound, respond, respondList } from './client'
import { claimRef, ensurePayment, paymentRef, settleOnChain } from './_store'

/**
 * Mirrors the payment routes:
 *   POST /api/payments
 *   GET  /api/payments[/:paymentId]
 *   POST /api/payments/:paymentId/initiate
 *   POST /api/payments/:paymentId/retry
 *   GET  /api/payments/:paymentId/status
 *   GET  /api/payments/:paymentId/transaction
 *
 * Settlement is simulated end to end: `initiate` moves the payment through
 * `processing`, mints a sponsored Sui testnet transaction, and advances the
 * underlying claim to `paid`. No real money moves — the UI says so, everywhere.
 */

/** Display rate for the MYR → USDC leg. The real API returns this on each payment. */
export const SETTLEMENT_RATE_MYR_PER_USDC = MYR_PER_USDC

export interface PaymentQuery extends ListQuery {
  /** Provider-scoped view — payments this org will receive. */
  hospitalId?: string
  /** Insurer-scoped view — payments this org must fund. */
  insurerId?: string
  claimId?: string
}

/** GET /api/payments */
export async function getPayments(query: PaymentQuery = {}): Promise<Paginated<Payment>> {
  const rows = payments
    .filter((p) => (query.hospitalId ? p.payeeId === query.hospitalId : true))
    .filter((p) => (query.insurerId ? p.payerId === query.insurerId : true))
    .filter((p) => (query.claimId ? p.claimId === query.claimId : true))
    .filter((p) => (query.status ? p.status === query.status : true))
    .filter((p) => matchesQuery(query.q, p.paymentReference, p.claimNumber, p.patientName, p.payeeName))
    .sort(byNewest((p) => p.createdAt))
  return respondList(rows, query)
}

/** GET /api/payments/:paymentId */
export async function getPaymentById(paymentId: string): Promise<Payment> {
  const payment = payments.find((p) => p.id === paymentId)
  if (!payment) throw notFound('Payment', paymentId)
  return respond(payment)
}

/** POST /api/payments — creates the pending payout implied by an approved claim. */
export async function createPayment(claimId: string): Promise<Payment> {
  const claim = claimRef(claimId)
  if (!['approved', 'auto_approved'].includes(claim.status)) {
    throw badRequest(`Claim ${claim.claimNumber} is not approved for payment.`)
  }
  return respond(ensurePayment(claim), 300, 550)
}

/**
 * POST /api/payments/:paymentId/initiate
 *
 * Slower than a data read on purpose: this is a chain round trip, and the UI
 * shows the transaction being built, signed by the sponsor, and finalised.
 */
export async function initiatePayment(paymentId: string): Promise<Payment> {
  const payment = paymentRef(paymentId)
  if (payment.status === 'completed') {
    throw badRequest(`Payment ${payment.paymentReference} has already settled.`)
  }
  if (payment.status === 'processing') {
    throw badRequest(`Payment ${payment.paymentReference} is already in flight.`)
  }

  payment.status = 'processing'
  payment.initiatedAt = now()
  await new Promise((resolve) => setTimeout(resolve, 1_400 + Math.random() * 900))

  settleOnChain(payment)
  return respond(payment, 200, 400)
}

/** POST /api/payments/:paymentId/retry — for a settlement that previously failed. */
export async function retryPayment(paymentId: string): Promise<Payment> {
  const payment = paymentRef(paymentId)
  if (payment.status !== 'failed') {
    throw badRequest(`Only a failed payment can be retried; this one is "${payment.status}".`)
  }
  payment.status = 'pending'
  payment.failureReason = null
  return initiatePayment(paymentId)
}

export interface PaymentStatusResponse {
  paymentId: string
  status: PaymentStatus
  settledAt: string | null
  failureReason: string | null
  transactionId: string | null
}

/** GET /api/payments/:paymentId/status — the lightweight poll endpoint. */
export async function getPaymentStatus(paymentId: string): Promise<PaymentStatusResponse> {
  const payment = paymentRef(paymentId)
  return respond(
    {
      paymentId: payment.id,
      status: payment.status,
      settledAt: payment.settledAt,
      failureReason: payment.failureReason,
      transactionId: payment.transactionId,
    },
    100,
    220,
  )
}

/** GET /api/payments/:paymentId/transaction — null until the payment has settled. */
export async function getPaymentTransaction(paymentId: string): Promise<BlockchainRef | null> {
  const payment = paymentRef(paymentId)
  if (!payment.transactionId) return respond(null, 120, 260)
  return respond(blockchainRefs.find((r) => r.id === payment.transactionId) ?? null)
}
