import type { Claim, ModelComparison, TruthBand, VerificationFactor, VerificationResult } from '@/lib/types'
import { ago, now } from './_time'
import { claims } from './claims'
import { policies } from './policies'

export const TRUTH_MODEL = 'gonka/med-claims-verifier-v2'

/** Shared banding rule — used by the seed data, the live generator and the UI. */
export function bandFor(score: number): TruthBand {
  if (score >= 85) return 'high'
  if (score >= 60) return 'medium'
  return 'low'
}

const f = (
  label: string,
  detail: string,
  impact: VerificationFactor['impact'],
  weight: number,
): VerificationFactor => ({ label, detail, impact, weight })

/** Each fixture's own claim's own policy — never a flat platform constant —
 * decides whether its Truth Score cleared, same as the live backend. */
function thresholdFor(claimId: string): number {
  const claim = claims.find((c) => c.id === claimId)
  const policy = claim ? policies.find((p) => p.id === claim.policyId) : undefined
  return policy?.truthScoreThreshold ?? 80
}

/**
 * Gonka Router verification results, keyed by claim id. Claims still awaiting
 * verification (`submitted`) and drafts (`created`) deliberately have no entry —
 * the UI must render an honest "not yet verified" state rather than a zero score.
 */
const rawVerifications: Record<string, Omit<VerificationResult, 'threshold' | 'passesThreshold'>> = {
  clm_001: {
    claimId: 'clm_001',
    requestId: 'gonka-req-4b71c9ea',
    truthScore: 93,
    band: 'high',
    verdict: 'Highly plausible — consistent with the submitted evidence',
    reasoning:
      'The coded diagnosis (K35.80, acute appendicitis) and the laparoscopic appendectomy performed are a standard clinical pairing, and the operative note corroborates the discharge summary. Billed line items — theatre, anaesthesia, two nights of inpatient care — fall within the expected range for this procedure at a private tertiary centre in Kuala Lumpur. Documented Alvarado score of 8 and the ultrasound finding independently support the urgency of surgery. No duplicate claim for this episode was found in the patient history.',
    factors: [
      f('Diagnosis–procedure coherence', 'K35.80 and laparoscopic appendectomy are a guideline-standard pairing.', 'positive', 0.32),
      f('Cost within benchmark', 'RM12,400 sits in the 45th percentile for this procedure at private tertiary centres.', 'positive', 0.24),
      f('Documentation completeness', 'Discharge summary, operative note and itemised bill all supplied.', 'positive', 0.22),
      f('Length of stay', 'Two nights is typical; no unexplained extension.', 'positive', 0.14),
      f('Claim history', 'No overlapping or duplicate episode in the past 24 months.', 'positive', 0.08),
    ],
    model: TRUTH_MODEL,
    router: 'Gonka Router',
    latencyMs: 2_140,
    verifiedAt: ago(46),
  },

  clm_002: {
    claimId: 'clm_002',
    requestId: 'gonka-req-9d02f7b3',
    truthScore: 58,
    band: 'low',
    verdict: 'Ambiguous — several elements are not supported by the record',
    reasoning:
      'The diagnosis of chronic lumbar radiculopathy is plausible on its own, but this is the third lumbar imaging study claimed for the same complaint within eight months, and the February MRI reported only a mild L4/L5 disc bulge. A 12-session physiotherapy block billed up front, alongside an epidural steroid injection on the same visit, exceeds the usual stepped-care sequence for this presentation. The submitted documents do not include a neurological examination or a functional score that would justify escalation to injection therapy. This claim warrants human assessment rather than an automated decision.',
    factors: [
      f('Repeat imaging', 'Third lumbar MRI in 8 months; prior study showed only mild disc bulge.', 'negative', 0.34),
      f('Treatment escalation', 'Injection plus a 12-session block without documented stepped care.', 'negative', 0.26),
      f('Missing clinical evidence', 'No neurological examination or functional score submitted.', 'negative', 0.18),
      f('Diagnosis plausibility', 'M54.16 is consistent with the reported symptoms in isolation.', 'positive', 0.14),
      f('Provider standing', 'Submitting centre has a 96% historical claim-acceptance rate.', 'positive', 0.08),
    ],
    model: TRUTH_MODEL,
    router: 'Gonka Router',
    latencyMs: 3_685,
    verifiedAt: ago(10, 1),
  },

  clm_003: {
    claimId: 'clm_003',
    requestId: 'gonka-req-2f88ad14',
    truthScore: 91,
    band: 'high',
    verdict: 'Highly plausible — routine diagnostic pathway',
    reasoning:
      'A diagnostic OGD with biopsy is the guideline-indicated next step for reflux symptoms unresponsive to six months of proton pump inhibitor therapy, and the endoscopy report documents LA Grade B oesophagitis consistent with the coded diagnosis. Billed components — procedure, sedation, histopathology and a single specialist consultation — match the procedure with no unexpected additions. The RM3,850 total is within the normal band for day-case endoscopy at this provider.',
    factors: [
      f('Guideline concordance', 'OGD is indicated after failed PPI therapy at this duration.', 'positive', 0.36),
      f('Findings support diagnosis', 'LA Grade B oesophagitis documented endoscopically.', 'positive', 0.28),
      f('Billing coherence', 'No line items outside the expected procedure bundle.', 'positive', 0.22),
      f('Cost within benchmark', 'RM3,850 is at the median for day-case OGD with biopsy.', 'positive', 0.14),
    ],
    model: TRUTH_MODEL,
    router: 'Gonka Router',
    latencyMs: 1_920,
    verifiedAt: ago(6, 3),
  },

  clm_005: {
    claimId: 'clm_005',
    requestId: 'gonka-req-6c41be05',
    truthScore: 87,
    band: 'high',
    verdict: 'Plausible — imaging corroborates the operative finding',
    reasoning:
      'The pre-operative MRI independently confirms a bucket-handle medial meniscus tear, matching both the coded diagnosis and the arthroscopic procedure performed. The mechanism of injury and the five-week interval between injury and surgery are consistent with a conservative-first pathway. Billed items are confined to the procedure bundle, with no unrelated additions. A small deduction reflects the absence of a documented conservative-management trial in the notes.',
    factors: [
      f('Imaging corroboration', 'MRI confirms the tear the procedure addressed.', 'positive', 0.34),
      f('Mechanism consistency', 'Sports injury and 5-week interval fit the presentation.', 'positive', 0.24),
      f('Billing coherence', 'All line items belong to the arthroscopy bundle.', 'positive', 0.22),
      f('Conservative trial undocumented', 'No physiotherapy or bracing trial recorded before surgery.', 'negative', 0.20),
    ],
    model: TRUTH_MODEL,
    router: 'Gonka Router',
    latencyMs: 2_465,
    verifiedAt: ago(0, 0, 6),
  },

  clm_006: {
    claimId: 'clm_006',
    requestId: 'gonka-req-7e35cc90',
    truthScore: 81,
    band: 'medium',
    verdict: 'Likely valid — one element needs assessor confirmation',
    reasoning:
      'NS1 positivity and the documented platelet nadir of 68 x10^9/L support both the dengue diagnosis and the warning-signs classification that justifies admission. A three-night stay is within the expected range under MOH dengue management guidance. The score is held below the auto-approval threshold because the nursing and monitoring line is billed at roughly twice the provider median for a general-ward dengue admission, which an assessor should confirm before settlement.',
    factors: [
      f('Laboratory corroboration', 'NS1 positive with a documented platelet trend.', 'positive', 0.32),
      f('Admission criteria met', 'Warning-signs classification supports inpatient care.', 'positive', 0.26),
      f('Nursing line above median', 'Monitoring charge is ~2x the provider median for this admission type.', 'negative', 0.28),
      f('Length of stay', 'Three nights is within guideline expectations.', 'positive', 0.14),
    ],
    model: TRUTH_MODEL,
    router: 'Gonka Router',
    latencyMs: 3_010,
    verifiedAt: ago(19, 4),
  },

  clm_007: {
    claimId: 'clm_007',
    requestId: 'gonka-req-1a5f30dd',
    truthScore: 34,
    band: 'low',
    verdict: 'Implausible as claimed — likely excluded cosmetic component',
    reasoning:
      'The claim is coded as a functional septal correction (J34.2), but the operative note describes dorsal hump reduction and tip refinement, which are cosmetic rather than functional procedures. No rhinomanometry, CT sinus imaging or documented failed medical management supports a functional nasal obstruction. The billed amount is roughly 2.4x the benchmark for an isolated septoplasty, consistent with the cosmetic components being included. The functional and cosmetic elements would need to be separated before any part of this claim could be settled.',
    factors: [
      f('Coding vs operative note', 'Note describes cosmetic work not covered by the submitted code.', 'negative', 0.38),
      f('No functional evidence', 'No rhinomanometry, CT, or failed medical management on file.', 'negative', 0.28),
      f('Cost far above benchmark', 'RM14,200 is ~2.4x the isolated septoplasty benchmark.', 'negative', 0.22),
      f('Provider standing', 'Submitting TPA has no adverse history.', 'positive', 0.12),
    ],
    model: TRUTH_MODEL,
    router: 'Gonka Router',
    latencyMs: 4_120,
    verifiedAt: ago(33, 5),
  },

  clm_008: {
    claimId: 'clm_008',
    requestId: 'gonka-req-c3907bfa',
    truthScore: 96,
    band: 'high',
    verdict: 'Highly plausible — scheduled cycle in a pre-authorised plan',
    reasoning:
      'This is cycle 3 of a six-cycle adjuvant regimen already registered against the policy, and the histopathology report on file independently establishes the stage IIB invasive ductal carcinoma diagnosis. Drug selection (docetaxel/cyclophosphamide), dosing interval and the supporting cardiac echo all match the pre-authorised treatment plan. Billed amounts align cycle-for-cycle with the two previously settled cycles under the same policy.',
    factors: [
      f('Pre-authorised plan', 'Cycle 3 of 6 registered against the policy in advance.', 'positive', 0.34),
      f('Histology on file', 'Pathology report independently confirms the diagnosis.', 'positive', 0.26),
      f('Regimen concordance', 'Agents and interval match the authorised protocol.', 'positive', 0.24),
      f('Cost consistency', 'Matches cycles 1 and 2 settled under the same policy.', 'positive', 0.16),
    ],
    model: TRUTH_MODEL,
    router: 'Gonka Router',
    latencyMs: 2_280,
    verifiedAt: ago(60, 2),
  },

  clm_009: {
    claimId: 'clm_009',
    requestId: 'gonka-req-8f3a21c7',
    truthScore: 92,
    band: 'high',
    verdict: 'Highly plausible — standard cataract pathway',
    reasoning:
      'Pre-operative best-corrected visual acuity of 6/24 in the affected eye meets the usual surgical threshold for cataract extraction, and the post-operative acuity of 6/7.5 is consistent with a successful monofocal implant. Procedure, lens, biometry and topical medication are the complete and expected bundle for phacoemulsification. The RM4,750 total is within the normal band for this provider.',
    factors: [
      f('Surgical threshold met', 'Pre-op BCVA 6/24 justifies extraction.', 'positive', 0.34),
      f('Outcome documented', 'Post-op BCVA 6/7.5 recorded at one-week review.', 'positive', 0.26),
      f('Complete bundle', 'Procedure, IOL, biometry and medication all present and expected.', 'positive', 0.24),
      f('Cost within benchmark', 'RM4,750 is at the provider median.', 'positive', 0.16),
    ],
    model: TRUTH_MODEL,
    router: 'Gonka Router',
    latencyMs: 1_760,
    verifiedAt: ago(87, 3),
  },

  clm_011: {
    claimId: 'clm_011',
    requestId: 'gonka-req-5b2e7a41',
    truthScore: 94,
    band: 'high',
    verdict: 'Highly plausible — well evidenced acute cardiac event',
    reasoning:
      'A troponin of 1,840 ng/L with dynamic ECG changes and an angiographically confirmed 95% proximal LAD lesion form a coherent and independently documented NSTEMI presentation. Stent placement with TIMI 3 flow post-procedure, three nights of coronary care and dual antiplatelet therapy are all guideline-concordant. Billed amounts are within the expected band for PCI with a drug-eluting stent at a private tertiary centre. Note that this claim still requires assessor sign-off on value grounds, not on plausibility.',
    factors: [
      f('Biomarker & ECG evidence', 'Troponin 1,840 ng/L with dynamic ECG changes.', 'positive', 0.32),
      f('Angiographic confirmation', '95% proximal LAD lesion documented on catheter report.', 'positive', 0.28),
      f('Guideline concordance', 'PCI, CCU stay and DAPT all standard for NSTEMI.', 'positive', 0.24),
      f('Cost within benchmark', 'RM46,800 is in the expected band for DES-PCI privately.', 'positive', 0.16),
    ],
    model: TRUTH_MODEL,
    router: 'Gonka Router',
    latencyMs: 2_890,
    verifiedAt: ago(12, 3),
  },

  clm_012: {
    claimId: 'clm_012',
    requestId: 'gonka-req-d740e6b8',
    truthScore: 95,
    band: 'high',
    verdict: 'Highly plausible — clinically indicated excision',
    reasoning:
      'A documented recent change in the border and colour of a 9mm pigmented lesion is a standard indication for excision biopsy, so the procedure is clinically justified regardless of the benign histology result. Dermoscopy images and the histopathology report are both on file and consistent with the claim narrative. The four billed line items are the complete expected bundle, and the RM2,660 total is unremarkable for this procedure.',
    factors: [
      f('Clinical indication', 'Documented change in border and colour justifies excision.', 'positive', 0.36),
      f('Imaging & histology on file', 'Dermoscopy and pathology report both submitted.', 'positive', 0.28),
      f('Billing coherence', 'Line items match the expected excision bundle.', 'positive', 0.22),
      f('Cost within benchmark', 'RM2,660 is at the provider median for this procedure.', 'positive', 0.14),
    ],
    model: TRUTH_MODEL,
    router: 'Gonka Router',
    latencyMs: 1_640,
    verifiedAt: ago(8, 4),
  },

  clm_013: {
    claimId: 'clm_013',
    requestId: 'gonka-req-a619b2f5',
    truthScore: 74,
    band: 'medium',
    verdict: 'Plausible but under-evidenced against the surgical criteria',
    reasoning:
      'Tonsillectomy for recurrent tonsillitis is well established, but the usual criterion is seven documented episodes in a year, five per year over two years, or three per year over three years. Only three culture-positive episodes in the past 12 months appear in the record, and the additional episodes the patient reports were not treated at this centre and are therefore unverified. The procedure and billing are otherwise routine and appropriately costed. An assessor should decide whether the reported external episodes can be accepted.',
    factors: [
      f('Below documented episode criteria', 'Three verified episodes vs the usual seven-per-year threshold.', 'negative', 0.34),
      f('Unverified patient-reported history', 'Further episodes reported but treated elsewhere.', 'neutral', 0.22),
      f('Procedure appropriateness', 'Tonsillectomy is standard where criteria are met.', 'positive', 0.24),
      f('Cost within benchmark', 'RM6,900 is at the median for day-case tonsillectomy.', 'positive', 0.20),
    ],
    model: TRUTH_MODEL,
    router: 'Gonka Router',
    latencyMs: 3_240,
    verifiedAt: ago(12, 5),
  },
}

export const verifications: Record<string, VerificationResult> = Object.fromEntries(
  Object.entries(rawVerifications).map(([claimId, v]) => {
    const threshold = thresholdFor(claimId)
    return [claimId, { ...v, threshold, passesThreshold: v.truthScore >= threshold }]
  }),
)

const HEX = 'abcdef0123456789'

function requestId(): string {
  let s = ''
  for (let i = 0; i < 8; i += 1) s += HEX[Math.floor(Math.random() * HEX.length)]
  return `gonka-req-${s}`
}

/**
 * Produces a verification result for a claim submitted during the session. The
 * score is derived from properties an actual verifier would weigh — documentary
 * completeness, cost against the policy limit, coding specificity — so a freshly
 * created claim behaves the way the seeded ones read.
 */
export function generateVerification(
  claim: Claim,
  documentCount: number,
  truthScoreThreshold: number,
  icd10Code?: string,
  model?: string,
): VerificationResult {
  const factors: VerificationFactor[] = []

  // Calibrated so a well-evidenced small claim lands in the 90s, a thin one in the
  // 20s-30s, and a typical submission in the 70s-80s — i.e. near the threshold,
  // where the routing rule actually has to make a judgement.
  let score = 58

  if (documentCount >= 3) {
    score += 18
    factors.push(f('Documentation completeness', `${documentCount} supporting documents supplied.`, 'positive', 0.3))
  } else if (documentCount >= 1) {
    score += 8
    factors.push(f('Documentation partial', `${documentCount} supporting document(s) on file; more would raise confidence.`, 'neutral', 0.3))
  } else {
    score -= 16
    factors.push(f('No supporting documents', 'Nothing was attached to corroborate the treatment narrative.', 'negative', 0.3))
  }

  if (icd10Code) {
    score += 7
    factors.push(f('Specific diagnosis coding', `Source record carries a specific ICD-10 code (${icd10Code}).`, 'positive', 0.24))
  } else {
    score -= 6
    factors.push(f('Unspecific diagnosis coding', 'No ICD-10 code on the source record to anchor the diagnosis.', 'negative', 0.24))
  }

  if (claim.amountRequested <= 5_000) {
    score += 8
    factors.push(f('Low claim value', 'Amount is in the low-risk band for this coverage type.', 'positive', 0.22))
  } else if (claim.amountRequested <= 25_000) {
    score += 2
    factors.push(f('Mid claim value', 'Amount is within the normal band for this coverage type.', 'neutral', 0.22))
  } else {
    score -= 10
    factors.push(f('High claim value', 'Amount is in the upper decile and attracts additional scrutiny.', 'negative', 0.22))
  }

  const described = claim.treatmentDescription.trim().length >= 60
  score += described ? 6 : -10
  factors.push(
    described
      ? f('Treatment narrative', 'The description gives enough detail to assess coherence.', 'positive', 0.24)
      : f('Sparse treatment narrative', 'The description is too brief to fully assess coherence.', 'negative', 0.24),
  )

  // A small deterministic spread keyed to the claim, standing in for the residual
  // signals a real verifier would weigh (cost benchmarks, provider history, prior
  // episodes) — without it every generated claim would land on the same number.
  const seed = `${claim.diagnosis}|${claim.treatmentDescription}|${claim.amountRequested}|${model ?? ''}`
  let h = 0
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) | 0
  const jitter = (Math.abs(h) % 13) - 6
  score += jitter
  if (jitter <= -3) {
    factors.push(f('Cost against benchmark', 'Billed total sits above the provider median for this presentation.', 'negative', 0.14))
  } else if (jitter >= 3) {
    factors.push(f('Cost against benchmark', 'Billed total sits at or below the provider median for this presentation.', 'positive', 0.14))
  }

  score = Math.max(12, Math.min(98, Math.round(score)))
  const band = bandFor(score)

  const verdict =
    band === 'high'
      ? 'Highly plausible — consistent with the submitted evidence'
      : band === 'medium'
        ? 'Plausible but under-evidenced in places'
        : 'Ambiguous — several elements are not supported by the record'

  const positives = factors.filter((x) => x.impact === 'positive').map((x) => x.label.toLowerCase())
  const negatives = factors.filter((x) => x.impact === 'negative').map((x) => x.label.toLowerCase())

  const reasoning = [
    `The stated diagnosis "${claim.diagnosis}" and the treatment claimed were assessed against typical clinical pathways, provider cost benchmarks and the documentation attached to this submission.`,
    positives.length
      ? `Supporting the claim: ${positives.join(', ')}.`
      : 'No strongly supporting signals were identified in the submission.',
    negatives.length
      ? `Weighing against it: ${negatives.join(', ')}.`
      : 'No contradicting signals were identified in the submission.',
    band === 'high'
      ? 'On balance the submission is internally consistent and well evidenced.'
      : 'A human assessor should confirm the flagged elements before this claim is settled.',
  ].join(' ')

  return {
    claimId: claim.id,
    requestId: requestId(),
    truthScore: score,
    band,
    verdict,
    reasoning,
    factors,
    model: model ?? TRUTH_MODEL,
    router: 'Gonka Router',
    latencyMs: 1_600 + Math.floor(Math.random() * 2_600),
    threshold: truthScoreThreshold,
    passesThreshold: score >= truthScoreThreshold,
    verifiedAt: now(),
  }
}

/**
 * A comparison-model "second opinion" for the mock layer — same generator as
 * the primary verification, just re-run under a different model id so the
 * comparison panel has something genuinely different to show (a different
 * score, verdict and reasoning), never a factor in the claim's own decision.
 */
export function generateComparison(
  claim: Claim,
  documentCount: number,
  truthScoreThreshold: number,
  icd10Code: string | undefined,
  model: string,
): ModelComparison {
  const result = generateVerification(claim, documentCount, truthScoreThreshold, icd10Code, model)
  return {
    model,
    truthScore: result.truthScore,
    band: result.band,
    verdict: result.verdict,
    reasoning: result.reasoning,
    factors: result.factors,
    requestId: result.requestId,
    latencyMs: result.latencyMs,
  }
}
