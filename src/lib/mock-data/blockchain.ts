import type { BlockchainEvent, BlockchainRef, ChainStatus } from '@/lib/types'
import { ago, now } from './_time'

export const EXPLORER_BASE = 'https://suiscan.xyz/testnet/tx'

/** The WayFare gas station. Every transaction below is sponsored by this address. */
export const SPONSOR_ADDRESS = '0x9c4e1f7a2b83d05e6f19ca4780b2d3e5f6a71c8b9d0e2f4a5b6c7d8e9f0a1b2c'
export const INSURER_ADDRESS = '0x3f81b6d2c47e905a1b8d3f602c9e47a5b1d08f36c2a94e7b0d5f81a3c6e29b04'

const BASE_CHECKPOINT = 42_917_140

let digestSeq = 0
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

/** Deterministic pseudo-digest so the seeded refs are stable within a session. */
function digest(seed: string): string {
  digestSeq += 1
  let h = 2_166_136_261 ^ digestSeq
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16_777_619)
  }
  let out = ''
  for (let i = 0; i < 44; i += 1) {
    h ^= h << 13
    h ^= h >>> 17
    h ^= h << 5
    out += B58[Math.abs(h) % B58.length]
  }
  return out
}

interface RefSeed {
  id: string
  kind: BlockchainRef['kind']
  claimId: string | null
  paymentId: string | null
  daysAgo: number
  gasFeeSui: number
  events: BlockchainEvent[]
}

function ref(seed: RefSeed): BlockchainRef {
  const d = digest(seed.id)
  return {
    id: seed.id,
    digest: d,
    network: 'sui:testnet',
    kind: seed.kind,
    claimId: seed.claimId,
    paymentId: seed.paymentId,
    status: 'success',
    sender: INSURER_ADDRESS,
    sponsored: true,
    sponsorAddress: SPONSOR_ADDRESS,
    gasFeeSui: seed.gasFeeSui,
    epoch: 742 - Math.floor(seed.daysAgo / 1.5),
    checkpoint: BASE_CHECKPOINT - Math.round(seed.daysAgo * 2_400),
    timestamp: ago(seed.daysAgo),
    explorerUrl: `${EXPLORER_BASE}/${d}`,
    events: seed.events,
  }
}

const attest = (claimNumber: string, score: number, requestId: string): BlockchainEvent[] => [
  {
    type: 'wayfare::claim::VerificationAttested',
    summary: `Claim ${claimNumber} attested with Truth Score ${score} (Gonka request ${requestId}).`,
  },
  {
    type: 'wayfare::claim::StatusChanged',
    summary: `Lifecycle status advanced to "verified" and recorded immutably.`,
  },
]

const settle = (
  claimNumber: string,
  myr: number,
  usdc: number,
  payee: string,
): BlockchainEvent[] => [
  {
    type: '0x2::coin::CoinTransferred',
    summary: `${usdc.toLocaleString('en-MY', { minimumFractionDigits: 2 })} USDC transferred to ${payee}.`,
  },
  {
    type: 'wayfare::settlement::ClaimSettled',
    summary: `Claim ${claimNumber} settled for RM${myr.toLocaleString('en-MY')} and marked paid.`,
  },
  {
    type: 'wayfare::settlement::SponsorGasPaid',
    summary: 'Gas paid by the WayFare sponsor address; the payer signed without holding SUI.',
  },
]

/**
 * On-chain references. Every claim that reached `verified` carries an attestation;
 * every completed payment carries a settlement transaction. Nothing here touches
 * a real network — these are shaped exactly as `/api/blockchain/*` will return.
 */
export const blockchainRefs: BlockchainRef[] = [
  ref({ id: 'bc_001', kind: 'claim_attestation', claimId: 'clm_001', paymentId: null, daysAgo: 46, gasFeeSui: 0.00214, events: attest('CLM-2026-0041', 93, 'gonka-req-4b71c9ea') }),
  ref({ id: 'bc_002', kind: 'claim_attestation', claimId: 'clm_002', paymentId: null, daysAgo: 10, gasFeeSui: 0.00208, events: attest('CLM-2026-0078', 58, 'gonka-req-9d02f7b3') }),
  ref({ id: 'bc_004', kind: 'claim_attestation', claimId: 'clm_003', paymentId: null, daysAgo: 6, gasFeeSui: 0.00196, events: attest('CLM-2026-0085', 91, 'gonka-req-2f88ad14') }),
  ref({ id: 'bc_005', kind: 'claim_attestation', claimId: 'clm_005', paymentId: null, daysAgo: 0, gasFeeSui: 0.00201, events: attest('CLM-2026-0094', 87, 'gonka-req-6c41be05') }),
  ref({ id: 'bc_006', kind: 'claim_attestation', claimId: 'clm_006', paymentId: null, daysAgo: 19, gasFeeSui: 0.00211, events: attest('CLM-2026-0063', 81, 'gonka-req-7e35cc90') }),
  ref({ id: 'bc_007', kind: 'claim_attestation', claimId: 'clm_007', paymentId: null, daysAgo: 33, gasFeeSui: 0.00199, events: attest('CLM-2026-0052', 34, 'gonka-req-1a5f30dd') }),
  ref({ id: 'bc_008', kind: 'claim_attestation', claimId: 'clm_008', paymentId: null, daysAgo: 60, gasFeeSui: 0.00223, events: attest('CLM-2026-0029', 96, 'gonka-req-c3907bfa') }),
  ref({ id: 'bc_009', kind: 'claim_attestation', claimId: 'clm_009', paymentId: null, daysAgo: 87, gasFeeSui: 0.00187, events: attest('CLM-2026-0012', 92, 'gonka-req-8f3a21c7') }),
  ref({ id: 'bc_010', kind: 'claim_attestation', claimId: 'clm_011', paymentId: null, daysAgo: 12, gasFeeSui: 0.00218, events: attest('CLM-2026-0071', 94, 'gonka-req-5b2e7a41') }),
  ref({ id: 'bc_011', kind: 'claim_attestation', claimId: 'clm_012', paymentId: null, daysAgo: 8, gasFeeSui: 0.00193, events: attest('CLM-2026-0088', 95, 'gonka-req-d740e6b8') }),
  ref({ id: 'bc_014', kind: 'claim_attestation', claimId: 'clm_013', paymentId: null, daysAgo: 12, gasFeeSui: 0.00205, events: attest('CLM-2026-0082', 74, 'gonka-req-a619b2f5') }),

  ref({ id: 'bc_003', kind: 'settlement', claimId: 'clm_001', paymentId: 'pay_001', daysAgo: 45, gasFeeSui: 0.00341, events: settle('CLM-2026-0041', 11_900, 2_494.76, 'Gleneagles Kuala Lumpur') }),
  ref({ id: 'bc_012', kind: 'settlement', claimId: 'clm_008', paymentId: 'pay_004', daysAgo: 58, gasFeeSui: 0.00358, events: settle('CLM-2026-0029', 25_500, 5_345.91, 'Gleneagles Kuala Lumpur') }),
  ref({ id: 'bc_013', kind: 'settlement', claimId: 'clm_009', paymentId: 'pay_005', daysAgo: 85, gasFeeSui: 0.00329, events: settle('CLM-2026-0012', 4_500, 943.4, 'MediAssist TPA Sdn Bhd') }),
]

/** Creates a new on-chain reference for an action taken during the session. */
export function createRef(seed: {
  id: string
  kind: BlockchainRef['kind']
  claimId: string | null
  paymentId: string | null
  events: BlockchainEvent[]
}): BlockchainRef {
  const d = digest(seed.id + Date.now())
  return {
    ...seed,
    digest: d,
    network: 'sui:testnet',
    status: 'success',
    sender: INSURER_ADDRESS,
    sponsored: true,
    sponsorAddress: SPONSOR_ADDRESS,
    gasFeeSui: Math.round((0.0018 + Math.random() * 0.0022) * 100_000) / 100_000,
    epoch: 742,
    checkpoint: BASE_CHECKPOINT + Math.floor(Math.random() * 900),
    timestamp: now(),
    explorerUrl: `${EXPLORER_BASE}/${d}`,
    events: seed.events,
  }
}

export { attest as attestationEvents, settle as settlementEvents }

export const chainStatus: ChainStatus = {
  network: 'sui:testnet',
  online: true,
  epoch: 742,
  latestCheckpoint: BASE_CHECKPOINT + 1_284,
  referenceGasPrice: 1_000,
  sponsorAddress: SPONSOR_ADDRESS,
  sponsorBalanceSui: 48.2617,
}
