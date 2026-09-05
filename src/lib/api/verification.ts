import { API_MODE } from './http'
import * as live from './live/verification'
import * as mock from './mock/verification'

/**
 * Gonka verification — dispatch between the live backend and the mock
 * fixtures. See `blockchain.ts` for the note on why both exist.
 *
 * The live path does considerably more than the mock one: a policy check, a
 * contractual clause assessment against the insurer's transcribed policy
 * document, the Gonka call itself, an on-chain attestation, and the auto-decide
 * rule. The mock path simulates only the Truth Score and the routing.
 */
const impl = API_MODE === 'mock' ? (mock as unknown as typeof live) : live

export type { VerifyOutcome } from './live/verification'
export { ClaimRejectedBeforeVerification } from './live/verification'

export const { getVerification, verifyClaim, recoverVerifyOutcome } = impl
