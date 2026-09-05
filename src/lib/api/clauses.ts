import { API_MODE } from './http'
import * as live from './live/clauses'
import * as mock from './mock/clauses'

/** The Manulife tier lookup the policy form uses. See `live/clauses.ts`. */
const impl = API_MODE === 'mock' ? (mock as unknown as typeof live) : live

export type { ManulifePlan } from './live/clauses'
export const { getManulifePlans } = impl
