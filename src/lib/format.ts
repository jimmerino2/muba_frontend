import type { ClaimStatus, PaymentStatus, TruthBand } from '@/lib/types'

/* --------------------------------------------------------------- numbers */

export function money(amount: number | null | undefined, currency = 'MYR'): string {
  if (amount === null || amount === undefined) return '—'
  const prefix = currency === 'MYR' ? 'RM' : `${currency} `
  return `${prefix}${amount.toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/** Compact form for stat tiles, where the exact ringgit matters less than the scale. */
export function moneyCompact(amount: number): string {
  if (Math.abs(amount) >= 1_000_000) return `RM${(amount / 1_000_000).toFixed(2)}M`
  if (Math.abs(amount) >= 1_000) return `RM${(amount / 1_000).toFixed(1)}k`
  return `RM${amount.toFixed(0)}`
}

export function usdc(amount: number): string {
  return `${amount.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`
}

export function fileSize(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`
  if (bytes >= 1_024) return `${Math.round(bytes / 1_024)} KB`
  return `${bytes} B`
}

/* ----------------------------------------------------------------- dates */

export function date(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-MY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-MY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function relative(iso: string | null | undefined): string {
  if (!iso) return '—'
  const diff = Date.now() - Date.parse(iso)
  const minutes = Math.round(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return date(iso)
}

/* ---------------------------------------------------------------- claims */

const CLAIM_LABELS: Record<ClaimStatus, string> = {
  created: 'Draft',
  submitted: 'Submitted',
  verified: 'Verified',
  auto_approved: 'Auto-approved',
  pending_review: 'Needs review',
  approved: 'Approved',
  rejected: 'Rejected',
  paid: 'Paid',
  closed: 'Closed',
}

/**
 * One colour vocabulary for the whole lifecycle. Teal is reserved for Gonka
 * verification surfaces and violet for on-chain ones, so neither appears here.
 */
const CLAIM_TONES: Record<ClaimStatus, string> = {
  created: 'bg-ink-700/60 text-mist-300 border-ink-600',
  submitted: 'bg-sky-500/12 text-sky-300 border-sky-500/30',
  verified: 'bg-cyan-500/12 text-cyan-300 border-cyan-500/30',
  auto_approved: 'bg-emerald-500/12 text-emerald-300 border-emerald-500/30',
  pending_review: 'bg-amber-500/14 text-amber-300 border-amber-500/35',
  approved: 'bg-emerald-500/14 text-emerald-300 border-emerald-500/35',
  rejected: 'bg-rose-500/14 text-rose-300 border-rose-500/35',
  paid: 'bg-violet-500/14 text-violet-300 border-violet-500/35',
  closed: 'bg-ink-700/60 text-mist-400 border-ink-600',
}

export const claimStatusLabel = (status: ClaimStatus): string => CLAIM_LABELS[status]
export const claimStatusTone = (status: ClaimStatus): string => CLAIM_TONES[status]

export const CLAIM_STATUSES = Object.keys(CLAIM_LABELS) as ClaimStatus[]

/* -------------------------------------------------------------- payments */

const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  pending: 'Pending',
  processing: 'Processing',
  completed: 'Settled',
  failed: 'Failed',
}

const PAYMENT_TONES: Record<PaymentStatus, string> = {
  pending: 'bg-amber-500/14 text-amber-300 border-amber-500/35',
  processing: 'bg-sky-500/14 text-sky-300 border-sky-500/35',
  completed: 'bg-violet-500/14 text-violet-300 border-violet-500/35',
  failed: 'bg-rose-500/14 text-rose-300 border-rose-500/35',
}

export const paymentStatusLabel = (status: PaymentStatus): string => PAYMENT_LABELS[status]
export const paymentStatusTone = (status: PaymentStatus): string => PAYMENT_TONES[status]

/* ----------------------------------------------------------- truth score */

const BAND_LABELS: Record<TruthBand, string> = {
  high: 'High confidence',
  medium: 'Moderate confidence',
  low: 'Low confidence',
}

export const bandLabel = (band: TruthBand): string => BAND_LABELS[band]

/** Truth Score colours are a deliberate three-step scale, not a red/green verdict. */
export function bandColor(band: TruthBand): { text: string; ring: string; fill: string } {
  switch (band) {
    case 'high':
      return { text: 'text-gonka-400', ring: 'stroke-gonka-500', fill: 'bg-gonka-500' }
    case 'medium':
      return { text: 'text-amber-300', ring: 'stroke-amber-400', fill: 'bg-amber-400' }
    case 'low':
      return { text: 'text-rose-300', ring: 'stroke-rose-400', fill: 'bg-rose-400' }
  }
}

/* ----------------------------------------------------------------- misc */

/** Middle-truncates a long identifier: 0x9c4e1f…f0a1b2c */
export function truncateId(value: string, head = 8, tail = 6): string {
  if (value.length <= head + tail + 1) return value
  return `${value.slice(0, head)}…${value.slice(-tail)}`
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((part) => /^[A-Za-z]/.test(part))
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('')
}

export function titleCase(value: string): string {
  return value.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
