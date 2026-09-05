import type { BlockchainRef, ListQuery, Paginated, Payment, PaymentStatus } from '@/lib/types'
import { badRequest, notFound } from '../client'
import { http, paginate } from '../http'
import type { WireBlockchainRef, WireClaim, WirePayment, WirePaymentStatus } from '../wire'
import { toBlockchainRef, toPayment } from '../adapters'
import { claimNames, invalidatePayments } from './_resolve'
import { MYR_PER_USDC } from './config'

/**
 * Settlement.
 *
 *   GET  /api/payments[/:id]
 *   POST /api/payments/:id/initiate
 *   POST /api/payments/:id/retry
 *   GET  /api/payments/:id/status
 *   GET  /api/payments/:id/transaction
 *
 * `initiate` executes a real sponsored transfer on Sui testnet and a mocked
 * bank payout leg — it is genuinely slow, so the views' staged progress reveal
 * is showing real latency rather than a scripted animation.
 *
 * There is no `POST /api/payments`: a payment exists only as a consequence of a
 * claim reaching APPROVED, which the backend creates itself. `createPayment`
 * below therefore looks one up rather than creating one.
 */

export const SETTLEMENT_RATE_MYR_PER_USDC = MYR_PER_USDC

export interface PaymentQuery extends ListQuery {
  hospitalId?: string
  insurerId?: string
  claimId?: string
}

const newestFirst = <T>(pick: (item: T) => string) => (a: T, b: T) =>
  Date.parse(pick(b)) - Date.parse(pick(a))

function matches(query: string | undefined, ...fields: (string | null | undefined)[]): boolean {
  if (!query?.trim()) return true
  const needle = query.trim().toLowerCase()
  return fields.some((field) => (field ?? '').toLowerCase().includes(needle))
}

/**
 * A payment row carries only ids; the UI shows the claim number and both
 * parties' names. The claim behind each payment supplies all of them, and the
 * resolver cache means a page of payments against a handful of claims costs a
 * handful of lookups.
 */
async function hydrate(payment: WirePayment): Promise<Payment> {
  let claim: WireClaim | null = null
  try {
    claim = await http<WireClaim>(`/api/claims/${payment.claimId}`)
  } catch {
    // The payer and payee can both read a payment, but a claim they are not a
    // party to would 404 — the payment is still worth showing.
  }

  const names = claim ? await claimNames(claim) : null
  return toPayment(payment, {
    claimNumber: claim?.claimNumber ?? '—',
    payerName: names?.insurerName ?? 'Insurer',
    payeeName: names?.hospitalName ?? 'Hospital',
    patientName: names?.patientName ?? '',
  })
}

export async function getPayments(query: PaymentQuery = {}): Promise<Paginated<Payment>> {
  const wire = await http<WirePayment[]>('/api/payments')
  const rows = await Promise.all(
    (wire ?? [])
      .filter((p) => (query.hospitalId ? p.payeeOrganizationId === query.hospitalId : true))
      .filter((p) => (query.insurerId ? p.payerOrganizationId === query.insurerId : true))
      .filter((p) => (query.claimId ? p.claimId === query.claimId : true))
      .map(hydrate),
  )

  return paginate(
    rows
      .filter((p) => (query.status ? p.status === query.status : true))
      .filter((p) => matches(query.q, p.paymentReference, p.claimNumber, p.patientName, p.payeeName))
      .sort(newestFirst((p) => p.createdAt)),
    query,
  )
}

export async function getPaymentById(paymentId: string): Promise<Payment> {
  const payment = await http<WirePayment>(`/api/payments/${paymentId}`)
  if (!payment) throw notFound('Payment', paymentId)
  return hydrate(payment)
}

/**
 * Finds the payment an approved claim implies.
 *
 * The backend creates it as a side effect of approval, so there is nothing to
 * create here — this resolves the existing one, and says so plainly if the
 * claim isn't approved yet.
 */
export async function createPayment(claimId: string): Promise<Payment> {
  const claim = await http<WireClaim>(`/api/claims/${claimId}`)
  if (!claim) throw notFound('Claim', claimId)

  const approved = ['APPROVED', 'PAYMENT_PENDING', 'PAYMENT_SENT', 'PAYMENT_RECEIVED', 'CLOSED']
  if (!approved.includes(claim.status)) {
    throw badRequest(`Claim ${claim.claimNumber} is not approved for payment.`)
  }

  invalidatePayments()
  const payments = await http<WirePayment[]>('/api/payments')
  const payment = (payments ?? []).find((p) => p.claimId === claimId)
  if (!payment) throw notFound('Payment for claim', claimId)
  return hydrate(payment)
}

/**
 * `POST /api/payments` — creates an additional payment against a claim that
 * already has at least one payment but still carries an outstanding balance
 * (a prior payment only partially covered the approved amount). `amount`
 * defaults to the full outstanding balance when omitted. Distinct from
 * `createPayment` above, which only ever resolves the one the backend
 * already auto-created on approval and never makes a second one.
 */
export async function createAdditionalPayment(claimId: string, amount?: number): Promise<Payment> {
  const payment = await http<WirePayment>('/api/payments', {
    method: 'POST',
    body: { claimId, ...(amount !== undefined ? { amount } : {}) },
  })
  invalidatePayments()
  return hydrate(payment)
}

/**
 * `POST /api/payments/:id/initiate` — the real Sui transfer plus the mock bank
 * payout. The backend guards idempotency itself (a 409 on a payment that is not
 * PENDING), so calling this twice can never pay twice.
 */
export async function initiatePayment(paymentId: string): Promise<Payment> {
  const payment = await http<WirePayment>(`/api/payments/${paymentId}/initiate`, { method: 'POST' })
  invalidatePayments()
  return hydrate(payment)
}

/**
 * `POST /api/payments/:id/retry` — only for a FAILED payment.
 *
 * If the on-chain leg already succeeded on a previous attempt, the backend
 * reuses that digest and retries only the payout leg, so a retry cannot double
 * spend on chain.
 */
export async function retryPayment(paymentId: string): Promise<Payment> {
  const payment = await http<WirePayment>(`/api/payments/${paymentId}/retry`, { method: 'POST' })
  invalidatePayments()
  return hydrate(payment)
}

export interface PaymentStatusResponse {
  paymentId: string
  status: PaymentStatus
  settledAt: string | null
  failureReason: string | null
  transactionId: string | null
}

export async function getPaymentStatus(paymentId: string): Promise<PaymentStatusResponse> {
  const status = await http<WirePaymentStatus>(`/api/payments/${paymentId}/status`)
  if (!status) throw notFound('Payment', paymentId)

  const uiStatus: PaymentStatus =
    status.status === 'SETTLED'
      ? 'completed'
      : status.status === 'FAILED'
        ? 'failed'
        : status.status === 'PENDING'
          ? 'pending'
          : 'processing'

  return {
    paymentId: status.paymentId,
    status: uiStatus,
    settledAt: status.completedAt,
    failureReason: status.failureReason,
    transactionId: status.suiTxDigest,
  }
}

/** `GET /api/payments/:id/transaction` — null until the payment has settled. */
export async function getPaymentTransaction(paymentId: string): Promise<BlockchainRef | null> {
  const ref = await http<WireBlockchainRef | null>(`/api/payments/${paymentId}/transaction`)
  return ref ? toBlockchainRef(ref) : null
}
