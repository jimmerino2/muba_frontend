<script setup lang="ts">
import type { VerifyOutcome } from '@/lib/api/verification'
import { money, truncateId } from '@/lib/format'

/**
 * The routing decision, stated as a consequence of BOTH the Truth Score and the
 * claim amount — so the score never reads as the decision on its own.
 */
defineProps<{ outcome: VerifyOutcome; claimNumber: string; amountRequested: number }>()
</script>

<template>
  <section
    class="surface border-l-2 p-5 animate-fade-up"
    :class="outcome.routedTo === 'auto_approved' ? 'border-l-emerald-500' : 'border-l-amber-500'"
  >
    <p class="text-xs font-medium uppercase tracking-wider text-mist-500">
      {{ claimNumber }} · routing decision
    </p>
    <p class="mt-1.5 text-base font-medium text-mist-100">
      {{
        outcome.routedTo === 'auto_approved'
          ? 'Cleared automatically — no human review needed'
          : 'Routed to a human assessor'
      }}
    </p>
    <p class="mt-2 text-sm leading-relaxed text-mist-400">{{ outcome.routingReason }}</p>

    <dl class="mt-4 flex flex-wrap gap-x-8 gap-y-3 border-t border-ink-700/70 pt-4">
      <div>
        <dt class="label">Score vs threshold</dt>
        <dd
          class="tnum mt-1 text-sm"
          :class="outcome.scoreCleared ? 'text-emerald-300' : 'text-amber-300'"
        >
          {{ outcome.verification.truthScore }} / {{ outcome.truthScoreThreshold }} ·
          {{ outcome.scoreCleared ? 'cleared' : 'not met' }}
        </dd>
      </div>
      <div>
        <dt class="label">Amount vs limit</dt>
        <dd
          class="tnum mt-1 text-sm"
          :class="outcome.amountCleared ? 'text-emerald-300' : 'text-amber-300'"
        >
          {{ money(amountRequested) }} / {{ money(outcome.autoApproveLimit) }} ·
          {{ outcome.amountCleared ? 'within' : 'over' }}
        </dd>
      </div>
      <div>
        <dt class="label">Sui attestation</dt>
        <dd class="mt-1 font-mono text-sm text-sui-400">
          {{ truncateId(outcome.attestationDigest) }}
        </dd>
      </div>
    </dl>
  </section>
</template>
