import { respond } from '../client'
import type { ManulifePlan } from '../live/clauses'

/** Mock mode has no real backend row to fetch, so these ids are synthesized
 * but stable — mock mode never sends them anywhere that checks them against
 * a real product_plans table, only stores them on the mock Policy record. */
const PLANS: ManulifePlan[] = [
  {
    id: 'plan-mock-gold',
    code: 'GOLD',
    name: 'EZ-Med Deductible — Gold',
    currency: 'MYR',
    roomAndBoardPerDay: 150,
    overallAnnualLimit: 150_000,
    overallLifetimeLimit: 1_500_000,
    deductiblePerPolicyYear: 500,
  },
  {
    id: 'plan-mock-platinum',
    code: 'PLATINUM',
    name: 'EZ-Med Deductible — Platinum',
    currency: 'MYR',
    roomAndBoardPerDay: 250,
    overallAnnualLimit: 250_000,
    overallLifetimeLimit: 2_500_000,
    deductiblePerPolicyYear: 500,
  },
]

export async function getManulifePlans(): Promise<ManulifePlan[]> {
  return respond(PLANS)
}
