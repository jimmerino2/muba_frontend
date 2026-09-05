import type { Policy } from '@/lib/types'
import { ago, ahead } from './_time'

/**
 * `autoApproveLimit` and `truthScoreThreshold` together decide routing: a claim
 * skips human review only when it is at or under the limit AND its Gonka Truth
 * Score meets the threshold. Both conditions are surfaced in the review UI, so
 * an assessor can always see *why* a claim landed in their queue.
 *
 * A single insurer — Manulife Insurance Berhad — underwrites every seeded
 * policy. Every policy is written against one of the two tiers of the
 * transcribed Manulife EZ-Med Deductible contract
 * (`muba_backend/app/features/clauses/clauses-manulife-ezmed.ts`):
 *
 *   PLATINUM — RM250/day room & board, RM250,000 overall annual limit,
 *              RM2,500,000 overall lifetime limit, RM500 deductible/year
 *   GOLD     — RM150/day room & board, RM150,000 overall annual limit,
 *              RM1,500,000 overall lifetime limit, RM500 deductible/year
 *
 * `coverageLimit` here is the tier's overall annual limit (this shape has no
 * separate lifetime-limit field). `autoApproveLimit`/`tpaApprovalLimit`/
 * `truthScoreThreshold` are WayFare's own claim-routing configuration, not
 * contract terms, and are tuned per policy to keep the demo's auto-approve vs
 * TPA-delegated vs insurer-escalated contrasts working under the real tiers.
 */
export const policies: Policy[] = [
  {
    id: 'pol_001',
    name: 'EZ-Med Deductible — Gold',
    productPlanId: 'plan-mock-gold',
    policyNumber: 'MN-INP-2024-88213',
    insurerId: 'org_manulife',
    insurerName: 'Manulife Insurance Berhad',
    holderPatientId: 'pat_001',
    holderName: 'Nurul Aisyah binti Rahman',
    coverageType: 'Inpatient & Surgical',
    status: 'active',
    coverageLimit: 150_000,
    autoApproveLimit: 15_000,
    tpaApprovalLimit: 10_000,
    truthScoreThreshold: 85,
    deductible: 500,
    annualPremium: 2_940,
    startDate: ago(300),
    endDate: ahead(65),
    currency: 'MYR',
  },
  {
    id: 'pol_002',
    name: 'EZ-Med Deductible — Platinum',
    productPlanId: 'plan-mock-platinum',
    policyNumber: 'MN-COM-2025-40917',
    insurerId: 'org_manulife',
    insurerName: 'Manulife Insurance Berhad',
    holderPatientId: 'pat_002',
    holderName: 'Tan Wei Ming',
    coverageType: 'Comprehensive Medical',
    status: 'active',
    coverageLimit: 250_000,
    autoApproveLimit: 25_000,
    tpaApprovalLimit: 20_000,
    truthScoreThreshold: 82,
    deductible: 500,
    annualPremium: 4_680,
    startDate: ago(290),
    endDate: ahead(75),
    currency: 'MYR',
  },
  {
    id: 'pol_003',
    name: 'EZ-Med Deductible — Gold',
    productPlanId: 'plan-mock-gold',
    policyNumber: 'MN-OUT-2025-11204',
    insurerId: 'org_manulife',
    insurerName: 'Manulife Insurance Berhad',
    holderPatientId: 'pat_003',
    holderName: 'Rajesh Kumar a/l Subramaniam',
    coverageType: 'Outpatient & Specialist',
    status: 'active',
    coverageLimit: 150_000,
    autoApproveLimit: 5_000,
    tpaApprovalLimit: 4_000,
    truthScoreThreshold: 88,
    deductible: 500,
    annualPremium: 1_620,
    startDate: ago(230),
    endDate: ahead(135),
    currency: 'MYR',
  },
  {
    id: 'pol_004',
    name: 'EZ-Med Deductible — Platinum',
    productPlanId: 'plan-mock-platinum',
    policyNumber: 'MN-CRI-2024-77530',
    insurerId: 'org_manulife',
    insurerName: 'Manulife Insurance Berhad',
    holderPatientId: 'pat_004',
    holderName: 'Siti Nadia binti Hassan',
    coverageType: 'Critical Illness',
    status: 'active',
    coverageLimit: 250_000,
    autoApproveLimit: 30_000,
    tpaApprovalLimit: 20_000,
    truthScoreThreshold: 90,
    deductible: 500,
    annualPremium: 6_240,
    startDate: ago(170),
    endDate: ahead(195),
    currency: 'MYR',
  },
  {
    id: 'pol_005',
    name: 'EZ-Med Deductible — Gold',
    productPlanId: 'plan-mock-gold',
    policyNumber: 'MN-INP-2025-33641',
    insurerId: 'org_manulife',
    insurerName: 'Manulife Insurance Berhad',
    holderPatientId: 'pat_005',
    holderName: 'Lim Jia Hui',
    coverageType: 'Inpatient & Surgical',
    status: 'active',
    coverageLimit: 150_000,
    autoApproveLimit: 12_000,
    tpaApprovalLimit: 8_000,
    truthScoreThreshold: 85,
    deductible: 500,
    annualPremium: 2_460,
    startDate: ago(118),
    endDate: ahead(247),
    currency: 'MYR',
  },
]

export function findPolicy(policyId: string): Policy | undefined {
  return policies.find((p) => p.id === policyId)
}
