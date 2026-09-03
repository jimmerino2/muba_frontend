<script setup lang="ts">
import { computed } from 'vue'
import type { BlockchainRef, Payment } from '@/lib/types'
import { dateTime, money, usdc } from '@/lib/format'
import { SETTLEMENT_RATE_MYR_PER_USDC } from '@/lib/api/payments'
import PaymentStatusBadge from '@/components/PaymentStatusBadge.vue'
import BlockchainRefLink from '@/components/BlockchainRefLink.vue'
import DetailList from '@/components/ui/DetailList.vue'

/** The payment body, shared by all three roles; each supplies its own actions. */
const props = defineProps<{ payment: Payment; transaction: BlockchainRef | null }>()

const facts = computed(() => [
  { label: 'Reference', value: props.payment.paymentReference, mono: true },
  { label: 'Claim', value: props.payment.claimNumber, mono: true },
  { label: 'Payer', value: props.payment.payerName },
  { label: 'Payee', value: props.payment.payeeName },
  { label: 'Patient', value: props.payment.patientName },
  { label: 'Method', value: props.payment.method },
  { label: 'Created', value: dateTime(props.payment.createdAt) },
  { label: 'Initiated', value: dateTime(props.payment.initiatedAt) },
  { label: 'Settled', value: dateTime(props.payment.settledAt) },
])
</script>

<template>
  <div class="space-y-5">
    <section class="surface p-5">
      <div class="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p class="label">Payout amount</p>
          <p class="tnum mt-1 text-3xl font-semibold tracking-tight text-mist-100">
            {{ money(payment.amount) }}
          </p>
          <p class="tnum mt-1.5 text-sm text-sui-400">
            {{ usdc(payment.amountUsdc) }}
            <span class="text-mist-500">· 1 USDC = RM{{ SETTLEMENT_RATE_MYR_PER_USDC }}</span>
          </p>
        </div>
        <PaymentStatusBadge :status="payment.status" />
      </div>

      <!-- Failure is a first-class state: say what happened and whether it is recoverable. -->
      <div
        v-if="payment.failureReason"
        class="mt-5 rounded-lg border border-rose-500/30 bg-rose-500/[0.06] p-4"
      >
        <p class="text-xs font-medium text-rose-200">Settlement failed</p>
        <p class="mt-1.5 text-sm leading-relaxed text-mist-300">{{ payment.failureReason }}</p>
      </div>

      <div class="mt-5 border-t border-ink-700/70 pt-4">
        <DetailList :items="facts" :columns="3" />
      </div>

      <div v-if="$slots.actions" class="mt-5 flex flex-wrap gap-2 border-t border-ink-700/70 pt-4">
        <slot name="actions" />
      </div>
    </section>

    <BlockchainRefLink
      :reference="transaction"
      :empty-label="
        payment.status === 'failed'
          ? 'No transaction on chain — the settlement attempt did not reach finality.'
          : 'No transaction on chain yet — this payout has not been initiated.'
      "
    />
  </div>
</template>
