<script setup lang="ts">
import { computed } from 'vue'
import type { Claim } from '@/lib/types'
import { money } from '@/lib/format'

/**
 * The one place a claim's money is summarised — original bill, what was
 * decided (approved/denied), what has actually moved (paid), and what's
 * still owed (outstanding). Every claim detail screen across all four roles
 * renders the same numbers from the same claim object rather than each
 * re-deriving its own, so they can never drift apart.
 */
const props = defineProps<{ claim: Claim; showLineItems?: boolean }>()

const isFullyDecided = computed(() => props.claim.amountApproved !== null || props.claim.status === 'rejected')
</script>

<template>
  <section class="surface p-5">
    <h2 class="mb-4 text-sm font-semibold tracking-tight text-mist-100">Claim amounts</h2>

    <div class="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
      <div>
        <p class="label">Original bill</p>
        <p class="tnum mt-1 text-xl font-semibold tracking-tight text-mist-100">
          {{ money(claim.amountRequested) }}
        </p>
      </div>
      <div>
        <p class="label">Approved</p>
        <p
          class="tnum mt-1 text-xl font-semibold tracking-tight"
          :class="claim.amountApproved === null ? 'text-mist-500' : 'text-emerald-300'"
        >
          {{ claim.amountApproved === null ? (isFullyDecided ? money(0) : 'Pending') : money(claim.amountApproved) }}
        </p>
      </div>
      <div>
        <p class="label">Denied</p>
        <p
          class="tnum mt-1 text-xl font-semibold tracking-tight"
          :class="claim.amountDenied ? 'text-rose-300' : 'text-mist-500'"
        >
          {{ claim.amountDenied === null ? '—' : money(claim.amountDenied) }}
        </p>
      </div>
      <div>
        <p class="label">Paid</p>
        <p class="tnum mt-1 text-xl font-semibold tracking-tight text-sui-400">
          {{ money(claim.amountPaid) }}
        </p>
      </div>
    </div>

    <div
      v-if="claim.amountApproved !== null"
      class="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3"
      :class="
        claim.outstandingAmount > 0
          ? 'border-amber-500/35 bg-amber-500/[0.06]'
          : 'border-emerald-500/30 bg-emerald-500/[0.05]'
      "
    >
      <div>
        <p class="text-sm font-medium" :class="claim.outstandingAmount > 0 ? 'text-amber-200' : 'text-emerald-200'">
          {{ claim.outstandingAmount > 0 ? 'Outstanding balance' : 'Fully settled' }}
        </p>
        <p class="mt-0.5 text-xs text-mist-500">
          {{
            claim.outstandingAmount > 0
              ? 'Amount the insurer still owes on this claim.'
              : 'Nothing further is owed on this claim.'
          }}
        </p>
      </div>
      <p
        class="tnum text-2xl font-semibold tracking-tight"
        :class="claim.outstandingAmount > 0 ? 'text-amber-300' : 'text-emerald-300'"
      >
        {{ money(claim.outstandingAmount) }}
      </p>
    </div>

    <p
      v-if="claim.patientResponsibility > 0"
      class="mt-3 text-xs leading-relaxed text-mist-500"
    >
      <span class="text-mist-300">{{ money(claim.patientResponsibility) }}</span> of the original bill was
      not covered by insurance ({{
        claim.amountDenied ? 'a denied line item' : 'a policy or clause adjustment'
      }}) and is the patient's own responsibility — separate from the outstanding balance above.
    </p>

    <div v-if="showLineItems && claim.lineItems.length" class="mt-5 border-t border-ink-700/70 pt-4">
      <h3 class="label mb-3">Line items</h3>
      <ul class="space-y-2">
        <li
          v-for="item in claim.lineItems"
          :key="item.id"
          class="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-ink-700/70 px-3 py-2.5"
        >
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <p class="truncate text-sm text-mist-200">{{ item.description }}</p>
              <span
                v-if="item.approved !== null || item.denied !== null"
                class="shrink-0 rounded px-1.5 py-0.5 text-2xs font-medium"
                :class="item.approved ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'"
              >
                {{ item.approved ? 'Approved' : 'Denied' }}
              </span>
            </div>
            <p class="mt-0.5 text-2xs text-mist-500">{{ item.category }}</p>
            <p v-if="item.reason" class="mt-1 text-xs leading-relaxed text-mist-400">{{ item.reason }}</p>
          </div>
          <p class="tnum shrink-0 text-sm font-medium text-mist-100">{{ money(item.amount) }}</p>
        </li>
      </ul>
    </div>
  </section>
</template>
