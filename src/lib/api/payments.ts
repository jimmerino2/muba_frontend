import { API_MODE } from './http'
import * as live from './live/payments'
import * as mock from './mock/payments'

/**
 * Settlement — dispatch between the live backend and the mock fixtures.
 * See `blockchain.ts` for the note on why both exist.
 */
const impl = API_MODE === 'mock' ? (mock as unknown as typeof live) : live

export type { PaymentQuery, PaymentStatusResponse } from './live/payments'
export { SETTLEMENT_RATE_MYR_PER_USDC } from './live/payments'

export const {
  getPayments,
  getPaymentById,
  createPayment,
  initiatePayment,
  retryPayment,
  getPaymentStatus,
  getPaymentTransaction,
} = impl
