import type { ActorRole, Claim, ClaimEvent, ClaimStatus } from '@/lib/types'
import { ago } from './_time'

let evSeq = 0

function ev(
  status: ClaimStatus,
  label: string,
  detail: string,
  actor: string,
  actorRole: ActorRole,
  timestamp: string,
  internal = false,
): ClaimEvent {
  evSeq += 1
  return {
    id: `evt_${String(evSeq).padStart(3, '0')}`,
    status,
    label,
    detail,
    actor,
    actorRole,
    timestamp,
    internal,
  }
}

/** Every seeded policy is underwritten by the one Manulife org. */
const MANULIFE = { insurerId: 'org_manulife', insurerName: 'Manulife Insurance Berhad' }
const GLEN = { hospitalId: 'org_gleneagles', hospitalName: 'Gleneagles Kuala Lumpur — Manulife Panel Provider' }
const MEDIASSIST = { hospitalId: 'org_mediassist', hospitalName: 'MediAssist Medical Centre — Manulife Panel Provider' }
/** Every submitted claim in this demo is administered by the one seeded TPA. */
const CARECALL = { tpaId: 'org_carecall_tpa', tpaName: 'CareCall TPA Services — Appointed by Manulife' }
/** A draft, never-submitted claim has no TPA assigned yet. */
const NO_TPA = { tpaId: null, tpaName: null }

/**
 * Twelve-plus claims covering every status in the lifecycle. The narrative spine
 * of the demo is the contrast between:
 *   clm_012 — score 95, under the policy limit  → cleared with no human touch
 *   clm_002 — score 58, contradictory history   → routed to a human assessor
 *   clm_011 — score 94 but RM46,800             → routed anyway, on amount alone
 * so the score is visibly an input to a decision, never the decision itself.
 */
export const claims: Claim[] = [
  /* ------------------------------------------------ clm_001 — closed (paid out) */
  {
    id: 'clm_001',
    claimNumber: 'CLM-2026-0041',
    recordId: 'rec_001',
    patientId: 'pat_001',
    patientName: 'Nurul Aisyah binti Rahman',
    ...GLEN,
    ...MANULIFE,
    ...CARECALL,
    policyId: 'pol_001',
    policyNumber: 'MN-INP-2024-88213',
    treatmentDescription: 'Laparoscopic appendectomy with 2-night inpatient stay',
    diagnosis: 'Acute appendicitis',
    amountRequested: 12_400,
    amountApproved: 11_900,
    currency: 'MYR',
    status: 'closed',
    createdAt: ago(46),
    submittedAt: ago(46),
    updatedAt: ago(44),
    decision: {
      outcome: 'approved',
      reason:
        'Cleared automatically: Truth Score 93 exceeds the policy threshold of 85 and the claimed amount is within the RM15,000 auto-approval limit. RM500 policy deductible applied.',
      reviewerName: 'WayFare auto-approval',
      decidedAt: ago(46),
      approvedAmount: 11_900,
    },
    paymentId: 'pay_001',
    timeline: [
      ev('created', 'Claim drafted', 'Raised from medical record MR-2026-1041.', 'Dr. Farah Iskandar', 'hospital', ago(46, 2)),
      ev('submitted', 'Submitted to insurer', 'Sent to Manulife Insurance Berhad with 3 supporting documents.', 'Dr. Farah Iskandar', 'hospital', ago(46, 1)),
      ev('verified', 'Gonka verification complete', 'Truth Score 93 · request gonka-req-4b71c9ea.', 'Gonka Router', 'gonka', ago(46)),
      ev('auto_approved', 'Auto-approval threshold met', 'Score 93 ≥ 85 and RM12,400 ≤ RM15,000 limit — no human review required.', 'WayFare policy engine', 'system', ago(46)),
      ev('approved', 'Approved for settlement', 'RM11,900 payable after the RM500 deductible.', 'WayFare policy engine', 'system', ago(46)),
      ev('paid', 'Settled on Sui', 'RM11,900 (2,494.76 USDC) transferred to Gleneagles Kuala Lumpur — Manulife Panel Provider.', 'Sui testnet', 'sui', ago(45)),
      ev('closed', 'Claim closed', 'Settlement confirmed by the provider; no further action.', 'System', 'system', ago(44)),
    ],
    decisionExplanation: null,
  },

  /* ------------- clm_002 — pending_review, LOW score (core demo contrast) ★ */
  {
    id: 'clm_002',
    claimNumber: 'CLM-2026-0078',
    recordId: 'rec_002',
    patientId: 'pat_002',
    patientName: 'Tan Wei Ming',
    ...GLEN,
    ...MANULIFE,
    ...CARECALL,
    policyId: 'pol_002',
    policyNumber: 'MN-COM-2025-40917',
    treatmentDescription:
      'MRI lumbar spine, epidural steroid injection and a 12-session physiotherapy programme',
    diagnosis: 'Chronic lumbar radiculopathy',
    amountRequested: 18_750,
    amountApproved: null,
    currency: 'MYR',
    status: 'pending_review',
    createdAt: ago(10),
    submittedAt: ago(10),
    updatedAt: ago(10),
    decision: null,
    paymentId: null,
    timeline: [
      ev('created', 'Claim drafted', 'Raised from medical record MR-2026-1078.', 'Dr. Suresh Menon', 'hospital', ago(10, 3)),
      ev('submitted', 'Submitted to insurer', 'Sent to Manulife Insurance Berhad with 2 supporting documents.', 'Dr. Suresh Menon', 'hospital', ago(10, 2)),
      ev('verified', 'Gonka verification complete', 'Truth Score 58 · request gonka-req-9d02f7b3.', 'Gonka Router', 'gonka', ago(10, 1)),
      ev('pending_review', 'Routed to human review', 'Score 58 is below the policy threshold of 82. Assigned to the medical assessment queue.', 'WayFare policy engine', 'system', ago(10, 1)),
      ev('pending_review', 'Assessor note', 'Requested the February MRI report for comparison before ruling on the repeat imaging line.', 'Adrian Yeoh', 'insurance', ago(9), true),
    ],
    decisionExplanation: null,
  },

  /* ------------------------------- clm_003 — auto-approved, awaiting settlement */
  {
    id: 'clm_003',
    claimNumber: 'CLM-2026-0085',
    recordId: 'rec_003',
    patientId: 'pat_003',
    patientName: 'Rajesh Kumar a/l Subramaniam',
    ...MEDIASSIST,
    ...MANULIFE,
    ...CARECALL,
    policyId: 'pol_003',
    policyNumber: 'MN-OUT-2025-11204',
    treatmentDescription: 'Diagnostic oesophagogastroduodenoscopy with biopsy',
    diagnosis: 'Gastro-oesophageal reflux disease with dysphagia',
    amountRequested: 3_850,
    amountApproved: 3_350,
    currency: 'MYR',
    status: 'auto_approved',
    createdAt: ago(6),
    submittedAt: ago(6),
    updatedAt: ago(6),
    decision: {
      outcome: 'approved',
      reason:
        'Cleared automatically: Truth Score 91 exceeds the policy threshold of 88 and RM3,850 is within the RM5,000 auto-approval limit. RM500 deductible applied.',
      reviewerName: 'WayFare auto-approval',
      decidedAt: ago(6),
      approvedAmount: 3_350,
    },
    paymentId: 'pay_002',
    timeline: [
      ev('created', 'Claim drafted', 'Raised from medical record MR-2026-1085.', 'Nurul Izzati (Claims Officer)', 'hospital', ago(6, 4)),
      ev('submitted', 'Submitted to insurer', 'Sent to Manulife Insurance Berhad with 1 supporting document.', 'Nurul Izzati (Claims Officer)', 'hospital', ago(6, 3)),
      ev('verified', 'Gonka verification complete', 'Truth Score 91 · request gonka-req-2f88ad14.', 'Gonka Router', 'gonka', ago(6, 3)),
      ev('auto_approved', 'Auto-approval threshold met', 'Score 91 ≥ 88 and RM3,850 ≤ RM5,000 limit — no human review required.', 'WayFare policy engine', 'system', ago(6, 3)),
    ],
    decisionExplanation: null,
  },

  /* ------------------------------- clm_004 — submitted, awaiting verification */
  {
    id: 'clm_004',
    claimNumber: 'CLM-2026-0091',
    recordId: 'rec_004',
    patientId: 'pat_004',
    patientName: 'Siti Nadia binti Hassan',
    ...GLEN,
    ...MANULIFE,
    ...CARECALL,
    policyId: 'pol_004',
    policyNumber: 'MN-CRI-2024-77530',
    treatmentDescription: 'Emergency management of acute asthma exacerbation, 6h observation',
    diagnosis: 'Acute asthma exacerbation',
    amountRequested: 2_180,
    amountApproved: null,
    currency: 'MYR',
    status: 'submitted',
    createdAt: ago(0, 3),
    submittedAt: ago(0, 2),
    updatedAt: ago(0, 2),
    decision: null,
    paymentId: null,
    timeline: [
      ev('created', 'Claim drafted', 'Raised from medical record MR-2026-1091.', 'Dr. Amir Zulkifli', 'hospital', ago(0, 3)),
      ev('submitted', 'Submitted to insurer', 'Queued for Gonka plausibility verification.', 'Dr. Amir Zulkifli', 'hospital', ago(0, 2)),
    ],
    decisionExplanation: null,
  },

  /* ------------------------- clm_005 — verified, routing decision still pending */
  {
    id: 'clm_005',
    claimNumber: 'CLM-2026-0094',
    recordId: 'rec_005',
    patientId: 'pat_005',
    patientName: 'Lim Jia Hui',
    ...GLEN,
    ...MANULIFE,
    ...CARECALL,
    policyId: 'pol_005',
    policyNumber: 'MN-INP-2025-33641',
    treatmentDescription: 'Arthroscopic partial medial meniscectomy, right knee',
    diagnosis: 'Medial meniscus tear, right knee',
    amountRequested: 10_600,
    amountApproved: null,
    currency: 'MYR',
    status: 'verified',
    createdAt: ago(1, 4),
    submittedAt: ago(1, 3),
    updatedAt: ago(0, 0, 6),
    decision: null,
    paymentId: null,
    timeline: [
      ev('created', 'Claim drafted', 'Raised from medical record MR-2026-1094.', 'Dr. Suresh Menon', 'hospital', ago(1, 4)),
      ev('submitted', 'Submitted to insurer', 'Sent to Manulife Insurance Berhad with 2 supporting documents.', 'Dr. Suresh Menon', 'hospital', ago(1, 3)),
      ev('verified', 'Gonka verification complete', 'Truth Score 87 · request gonka-req-6c41be05. Awaiting the policy routing decision.', 'Gonka Router', 'gonka', ago(0, 0, 6)),
    ],
    decisionExplanation: null,
  },

  /* --------------- clm_006 — human-approved after review, payment outstanding */
  {
    id: 'clm_006',
    claimNumber: 'CLM-2026-0063',
    recordId: 'rec_006',
    patientId: 'pat_001',
    patientName: 'Nurul Aisyah binti Rahman',
    ...GLEN,
    ...MANULIFE,
    ...CARECALL,
    policyId: 'pol_001',
    policyNumber: 'MN-INP-2024-88213',
    treatmentDescription: 'Inpatient management of dengue fever with warning signs, 3-night stay',
    diagnosis: 'Dengue fever with warning signs',
    amountRequested: 8_420,
    amountApproved: 7_920,
    currency: 'MYR',
    status: 'approved',
    createdAt: ago(19),
    submittedAt: ago(19),
    updatedAt: ago(17),
    decision: {
      outcome: 'approved',
      reason:
        'Serial FBC trend and NS1 positivity corroborate the admission. Length of stay is appropriate for warning-sign dengue under MOH guidance. Approved in full less the RM500 deductible.',
      reviewerName: 'Adrian Yeoh',
      decidedAt: ago(17),
      approvedAmount: 7_920,
    },
    paymentId: 'pay_003',
    timeline: [
      ev('created', 'Claim drafted', 'Raised from medical record MR-2026-1063.', 'Dr. Lee Kar Wai', 'hospital', ago(19, 5)),
      ev('submitted', 'Submitted to insurer', 'Sent to Manulife Insurance Berhad with 2 supporting documents.', 'Dr. Lee Kar Wai', 'hospital', ago(19, 4)),
      ev('verified', 'Gonka verification complete', 'Truth Score 81 · request gonka-req-7e35cc90.', 'Gonka Router', 'gonka', ago(19, 4)),
      ev('pending_review', 'Routed to human review', 'Score 81 is below the policy threshold of 85. Assigned to the medical assessment queue.', 'WayFare policy engine', 'system', ago(19, 4)),
      ev('pending_review', 'Assessor note', 'Platelet trend in the lab report is consistent with the coded severity; no query raised with the provider.', 'Adrian Yeoh', 'insurance', ago(18), true),
      ev('approved', 'Approved by assessor', 'RM7,920 payable after the RM500 deductible.', 'Adrian Yeoh', 'insurance', ago(17)),
    ],
    decisionExplanation: null,
  },

  /* -------------------------------------- clm_007 — rejected after human review */
  {
    id: 'clm_007',
    claimNumber: 'CLM-2026-0052',
    recordId: 'rec_007',
    patientId: 'pat_002',
    patientName: 'Tan Wei Ming',
    ...MEDIASSIST,
    ...MANULIFE,
    ...CARECALL,
    policyId: 'pol_002',
    policyNumber: 'MN-COM-2025-40917',
    treatmentDescription: 'Septorhinoplasty with dorsal hump reduction and tip refinement',
    diagnosis: 'Deviated nasal septum',
    amountRequested: 14_200,
    amountApproved: 0,
    currency: 'MYR',
    status: 'rejected',
    createdAt: ago(33),
    submittedAt: ago(33),
    updatedAt: ago(30),
    decision: {
      outcome: 'rejected',
      reason:
        'The operative note documents dorsal hump reduction and tip refinement, which are cosmetic and excluded under section 7.3 of the policy. No rhinomanometry or CT evidence of functional obstruction was submitted. The provider may resubmit a claim limited to the septoplasty component with supporting functional testing.',
      reviewerName: 'Adrian Yeoh',
      decidedAt: ago(30),
      approvedAmount: 0,
    },
    paymentId: null,
    timeline: [
      ev('created', 'Claim drafted', 'Raised from medical record MR-2026-1052.', 'Nurul Izzati (Claims Officer)', 'hospital', ago(33, 6)),
      ev('submitted', 'Submitted to insurer', 'Sent to Manulife Insurance Berhad with 1 supporting document.', 'Nurul Izzati (Claims Officer)', 'hospital', ago(33, 5)),
      ev('verified', 'Gonka verification complete', 'Truth Score 34 · request gonka-req-1a5f30dd.', 'Gonka Router', 'gonka', ago(33, 5)),
      ev('pending_review', 'Routed to human review', 'Score 34 is far below the policy threshold of 82. Flagged as a possible coverage exclusion.', 'WayFare policy engine', 'system', ago(33, 5)),
      ev('pending_review', 'Assessor note', 'Cross-checked the operative note against the exclusions schedule; cosmetic components are itemised separately in the bill.', 'Adrian Yeoh', 'insurance', ago(31), true),
      ev('rejected', 'Rejected by assessor', 'Cosmetic components excluded under policy section 7.3; resubmission invited for the functional component.', 'Adrian Yeoh', 'insurance', ago(30)),
    ],
    decisionExplanation: null,
  },

  /* --------------------------------- clm_008 — auto-approved and paid on Sui */
  {
    id: 'clm_008',
    claimNumber: 'CLM-2026-0029',
    recordId: 'rec_008',
    patientId: 'pat_004',
    patientName: 'Siti Nadia binti Hassan',
    ...GLEN,
    ...MANULIFE,
    ...CARECALL,
    policyId: 'pol_004',
    policyNumber: 'MN-CRI-2024-77530',
    treatmentDescription: 'Adjuvant chemotherapy cycle 3 of 6 (docetaxel/cyclophosphamide)',
    diagnosis: 'Invasive ductal carcinoma, right breast — stage IIB',
    amountRequested: 27_500,
    amountApproved: 27_000,
    currency: 'MYR',
    status: 'paid',
    createdAt: ago(60),
    submittedAt: ago(60),
    updatedAt: ago(58),
    decision: {
      outcome: 'approved',
      reason:
        'Cleared automatically: Truth Score 96 exceeds the policy threshold of 90 and RM27,500 is within the RM30,000 auto-approval limit. RM500 deductible applied.',
      reviewerName: 'WayFare auto-approval',
      decidedAt: ago(60),
      approvedAmount: 27_000,
    },
    paymentId: 'pay_004',
    timeline: [
      ev('created', 'Claim drafted', 'Raised from medical record MR-2026-1029.', 'Dr. Hafiz Rahim', 'hospital', ago(60, 3)),
      ev('submitted', 'Submitted to insurer', 'Sent to Manulife Insurance Berhad with 3 supporting documents.', 'Dr. Hafiz Rahim', 'hospital', ago(60, 2)),
      ev('verified', 'Gonka verification complete', 'Truth Score 96 · request gonka-req-c3907bfa.', 'Gonka Router', 'gonka', ago(60, 2)),
      ev('auto_approved', 'Auto-approval threshold met', 'Score 96 ≥ 90 and RM27,500 ≤ RM30,000 limit — part of a pre-authorised treatment plan.', 'WayFare policy engine', 'system', ago(60, 2)),
      ev('approved', 'Approved for settlement', 'RM27,000 payable after the RM500 deductible.', 'WayFare policy engine', 'system', ago(60, 2)),
      ev('paid', 'Settled on Sui', 'RM27,000 (5,660.38 USDC) transferred to Gleneagles Kuala Lumpur — Manulife Panel Provider.', 'Sui testnet', 'sui', ago(58)),
    ],
    decisionExplanation: null,
  },

  /* ------------------------------------------- clm_009 — closed, historical */
  {
    id: 'clm_009',
    claimNumber: 'CLM-2026-0012',
    recordId: 'rec_009',
    patientId: 'pat_003',
    patientName: 'Rajesh Kumar a/l Subramaniam',
    ...MEDIASSIST,
    ...MANULIFE,
    ...CARECALL,
    policyId: 'pol_003',
    policyNumber: 'MN-OUT-2025-11204',
    treatmentDescription: 'Phacoemulsification with monofocal intraocular lens, left eye',
    diagnosis: 'Age-related nuclear cataract, left eye',
    amountRequested: 4_750,
    amountApproved: 4_250,
    currency: 'MYR',
    status: 'closed',
    createdAt: ago(87),
    submittedAt: ago(87),
    updatedAt: ago(83),
    decision: {
      outcome: 'approved',
      reason:
        'Cleared automatically: Truth Score 92 exceeds the policy threshold of 88 and RM4,750 is within the RM5,000 auto-approval limit. RM500 deductible applied.',
      reviewerName: 'WayFare auto-approval',
      decidedAt: ago(87),
      approvedAmount: 4_250,
    },
    paymentId: 'pay_005',
    timeline: [
      ev('created', 'Claim drafted', 'Raised from medical record MR-2026-0998.', 'Nurul Izzati (Claims Officer)', 'hospital', ago(87, 4)),
      ev('submitted', 'Submitted to insurer', 'Sent to Manulife Insurance Berhad with 1 supporting document.', 'Nurul Izzati (Claims Officer)', 'hospital', ago(87, 3)),
      ev('verified', 'Gonka verification complete', 'Truth Score 92 · request gonka-req-8f3a21c7.', 'Gonka Router', 'gonka', ago(87, 3)),
      ev('auto_approved', 'Auto-approval threshold met', 'Score 92 ≥ 88 and RM4,750 ≤ RM5,000 limit — no human review required.', 'WayFare policy engine', 'system', ago(87, 3)),
      ev('approved', 'Approved for settlement', 'RM4,250 payable after the RM500 deductible.', 'WayFare policy engine', 'system', ago(87, 3)),
      ev('paid', 'Settled on Sui', 'RM4,250 (890.99 USDC) transferred to MediAssist Medical Centre — Manulife Panel Provider.', 'Sui testnet', 'sui', ago(85)),
      ev('closed', 'Claim closed', 'Settlement confirmed by the provider; no further action.', 'System', 'system', ago(83)),
    ],
    decisionExplanation: null,
  },

  /* ------------------------------- clm_010 — draft, never submitted (created) */
  {
    id: 'clm_010',
    claimNumber: 'CLM-2026-0096',
    recordId: 'rec_010',
    patientId: 'pat_005',
    patientName: 'Lim Jia Hui',
    ...GLEN,
    ...MANULIFE,
    ...NO_TPA,
    policyId: 'pol_005',
    policyNumber: 'MN-INP-2025-33641',
    treatmentDescription: 'Outpatient consultation and PPI course for acute gastritis',
    diagnosis: 'Acute gastritis',
    amountRequested: 620,
    amountApproved: null,
    currency: 'MYR',
    status: 'created',
    createdAt: ago(0, 20),
    submittedAt: null,
    updatedAt: ago(0, 20),
    decision: null,
    paymentId: null,
    timeline: [
      ev('created', 'Claim drafted', 'Raised from medical record MR-2026-1096. Not yet submitted to the insurer.', 'Dr. Lee Kar Wai', 'hospital', ago(0, 20)),
    ],
    decisionExplanation: null,
  },

  /* ------- clm_011 — HIGH score but routed on amount alone (core contrast) ★ */
  {
    id: 'clm_011',
    claimNumber: 'CLM-2026-0071',
    recordId: 'rec_011',
    patientId: 'pat_002',
    patientName: 'Tan Wei Ming',
    ...GLEN,
    ...MANULIFE,
    ...CARECALL,
    policyId: 'pol_002',
    policyNumber: 'MN-COM-2025-40917',
    treatmentDescription:
      'Coronary angiogram with drug-eluting stent to the LAD, 3-night coronary care unit stay',
    diagnosis: 'Non-ST elevation myocardial infarction',
    amountRequested: 46_800,
    amountApproved: null,
    currency: 'MYR',
    status: 'pending_review',
    createdAt: ago(12),
    submittedAt: ago(12),
    updatedAt: ago(11),
    decision: null,
    paymentId: null,
    timeline: [
      ev('created', 'Claim drafted', 'Raised from medical record MR-2026-1071.', 'Dr. Hafiz Rahim', 'hospital', ago(12, 4)),
      ev('submitted', 'Submitted to insurer', 'Sent to Manulife Insurance Berhad with 3 supporting documents.', 'Dr. Hafiz Rahim', 'hospital', ago(12, 3)),
      ev('verified', 'Gonka verification complete', 'Truth Score 94 · request gonka-req-5b2e7a41.', 'Gonka Router', 'gonka', ago(12, 3)),
      ev('pending_review', 'Routed to human review', 'Score 94 clears the threshold of 82, but RM46,800 exceeds the RM25,000 auto-approval limit — mandatory assessor sign-off.', 'WayFare policy engine', 'system', ago(12, 3)),
      ev('pending_review', 'Assessor note', 'Clinically well evidenced. Holding only for the high-value second-signature requirement.', 'Adrian Yeoh', 'insurance', ago(11), true),
    ],
    decisionExplanation: null,
  },

  /* ---------------------- clm_012 — auto-approved, settlement failed on retry */
  {
    id: 'clm_012',
    claimNumber: 'CLM-2026-0088',
    recordId: 'rec_012',
    patientId: 'pat_004',
    patientName: 'Siti Nadia binti Hassan',
    ...GLEN,
    ...MANULIFE,
    ...CARECALL,
    policyId: 'pol_004',
    policyNumber: 'MN-CRI-2024-77530',
    treatmentDescription: 'Excision biopsy of a pigmented lesion with histopathology',
    diagnosis: 'Benign melanocytic naevus requiring excision',
    amountRequested: 2_660,
    amountApproved: 2_160,
    currency: 'MYR',
    status: 'auto_approved',
    createdAt: ago(8),
    submittedAt: ago(8),
    updatedAt: ago(8),
    decision: {
      outcome: 'approved',
      reason:
        'Cleared automatically: Truth Score 95 exceeds the policy threshold of 90 and RM2,660 is within the RM30,000 auto-approval limit. RM500 deductible applied.',
      reviewerName: 'WayFare auto-approval',
      decidedAt: ago(8),
      approvedAmount: 2_160,
    },
    paymentId: 'pay_006',
    timeline: [
      ev('created', 'Claim drafted', 'Raised from medical record MR-2026-1088.', 'Dr. Priya Raman', 'hospital', ago(8, 5)),
      ev('submitted', 'Submitted to insurer', 'Sent to Manulife Insurance Berhad with 2 supporting documents.', 'Dr. Priya Raman', 'hospital', ago(8, 4)),
      ev('verified', 'Gonka verification complete', 'Truth Score 95 · request gonka-req-d740e6b8.', 'Gonka Router', 'gonka', ago(8, 4)),
      ev('auto_approved', 'Auto-approval threshold met', 'Score 95 ≥ 90 and RM2,660 ≤ RM30,000 limit — no human review required.', 'WayFare policy engine', 'system', ago(8, 4)),
    ],
    decisionExplanation: null,
  },

  /* ------------------- clm_013 — borderline score, awaiting the demo patient's insurer */
  {
    id: 'clm_013',
    claimNumber: 'CLM-2026-0082',
    recordId: 'rec_015',
    patientId: 'pat_001',
    patientName: 'Nurul Aisyah binti Rahman',
    ...GLEN,
    ...MANULIFE,
    ...CARECALL,
    policyId: 'pol_001',
    policyNumber: 'MN-INP-2024-88213',
    treatmentDescription: 'Bilateral tonsillectomy under general anaesthesia, day-case',
    diagnosis: 'Recurrent tonsillitis',
    amountRequested: 6_900,
    amountApproved: null,
    currency: 'MYR',
    status: 'pending_review',
    createdAt: ago(12),
    submittedAt: ago(12),
    updatedAt: ago(12),
    decision: null,
    paymentId: null,
    timeline: [
      ev('created', 'Claim drafted', 'Raised from medical record MR-2026-1082.', 'Dr. Priya Raman', 'hospital', ago(12, 6)),
      ev('submitted', 'Submitted to insurer', 'Sent to Manulife Insurance Berhad with 2 supporting documents.', 'Dr. Priya Raman', 'hospital', ago(12, 5)),
      ev('verified', 'Gonka verification complete', 'Truth Score 74 · request gonka-req-a619b2f5.', 'Gonka Router', 'gonka', ago(12, 5)),
      ev('pending_review', 'Routed to human review', 'Score 74 is below the policy threshold of 85. Assigned to the medical assessment queue.', 'WayFare policy engine', 'system', ago(12, 5)),
    ],
    decisionExplanation: null,
  },
]

/** Next sequence number for claims created during the session. */
export function nextClaimSequence(): number {
  return claims.length + 41
}

export { ev as makeClaimEvent }
