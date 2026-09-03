import type { Policy } from '@/lib/types'
import { ago, ahead } from './_time'

/**
 * `autoApproveLimit` and `truthScoreThreshold` together decide routing: a claim
 * skips human review only when it is at or under the limit AND its Gonka Truth
 * Score meets the threshold. Both conditions are surfaced in the review UI, so
 * an assessor can always see *why* a claim landed in their queue.
 *
 * Great Eastern underwrites four of the five seeded patients (it is the insurer
 * the demo assessor signs in as); Etiqa underwrites the fifth, so cross-insurer
 * scoping is still exercised.
 */
export const policies: Policy[] = [
  {
    id: 'pol_001',
    policyNumber: 'GE-INP-2024-88213',
    insurerId: 'org_greateastern',
    insurerName: 'Great Eastern Takaful',
    holderPatientId: 'pat_001',
    holderName: 'Nurul Aisyah binti Rahman',
    coverageType: 'Inpatient & Surgical',
    status: 'active',
    coverageLimit: 150_000,
    autoApproveLimit: 15_000,
    truthScoreThreshold: 85,
    deductible: 500,
    annualPremium: 2_940,
    startDate: ago(300),
    endDate: ahead(65),
    currency: 'MYR',
  },
  {
    id: 'pol_002',
    policyNumber: 'GE-COM-2025-40917',
    insurerId: 'org_greateastern',
    insurerName: 'Great Eastern Takaful',
    holderPatientId: 'pat_002',
    holderName: 'Tan Wei Ming',
    coverageType: 'Comprehensive Medical',
    status: 'active',
    coverageLimit: 250_000,
    autoApproveLimit: 25_000,
    truthScoreThreshold: 82,
    deductible: 1_000,
    annualPremium: 4_680,
    startDate: ago(290),
    endDate: ahead(75),
    currency: 'MYR',
  },
  {
    id: 'pol_003',
    policyNumber: 'ETQ-OUT-2025-11204',
    insurerId: 'org_etiqa',
    insurerName: 'Etiqa Insurance Berhad',
    holderPatientId: 'pat_003',
    holderName: 'Rajesh Kumar a/l Subramaniam',
    coverageType: 'Outpatient & Specialist',
    status: 'active',
    coverageLimit: 40_000,
    autoApproveLimit: 5_000,
    truthScoreThreshold: 88,
    deductible: 250,
    annualPremium: 1_620,
    startDate: ago(230),
    endDate: ahead(135),
    currency: 'MYR',
  },
  {
    id: 'pol_004',
    policyNumber: 'GE-CRI-2024-77530',
    insurerId: 'org_greateastern',
    insurerName: 'Great Eastern Takaful',
    holderPatientId: 'pat_004',
    holderName: 'Siti Nadia binti Hassan',
    coverageType: 'Critical Illness',
    status: 'active',
    coverageLimit: 500_000,
    autoApproveLimit: 30_000,
    truthScoreThreshold: 90,
    deductible: 2_000,
    annualPremium: 6_240,
    startDate: ago(170),
    endDate: ahead(195),
    currency: 'MYR',
  },
  {
    id: 'pol_005',
    policyNumber: 'GE-INP-2025-33641',
    insurerId: 'org_greateastern',
    insurerName: 'Great Eastern Takaful',
    holderPatientId: 'pat_005',
    holderName: 'Lim Jia Hui',
    coverageType: 'Inpatient & Surgical',
    status: 'active',
    coverageLimit: 120_000,
    autoApproveLimit: 12_000,
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
