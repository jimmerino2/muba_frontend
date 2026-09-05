<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useAction, useAsync } from '@/lib/useAsync'
import * as paymentsApi from '@/lib/api/payments'
import { money, usdc } from '@/lib/format'
import PageHeader from '@/components/ui/PageHeader.vue'
import PaymentDetail from '@/components/PaymentDetail.vue'
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
import ErrorState from '@/components/ui/ErrorState.vue'

const route = useRoute()
const paymentId = route.params.paymentId as string

const { data, loading, error, refresh } = useAsync(async () => {
  const payment = await paymentsApi.getPaymentById(paymentId)
  const transaction = await paymentsApi.getPaymentTransaction(paymentId)
  return { payment, transaction }
})

/** Settlement steps, shown while the sponsored transaction is built and finalised. */
const SETTLE_STEPS = [
  'Building the transfer transaction',
  'Requesting sponsor signature for gas',
  'Submitting to Sui testnet',
  'Waiting for finality',
]
const settleStep = ref(0)
let timer: ReturnType<typeof setInterval> | undefined

const settle = useAction(async (mode: 'initiate' | 'retry') => {
  settleStep.value = 0
  timer = setInterval(() => {
    if (settleStep.value < SETTLE_STEPS.length - 1) settleStep.value += 1
  }, 550)
  try {
    await (mode === 'retry'
      ? paymentsApi.retryPayment(paymentId)
      : paymentsApi.initiatePayment(paymentId))
    await refresh()
    return true
  } finally {
    clearInterval(timer)
  }
})
</script>

<template>
  <div>
    <ErrorState v-if="error" :message="error" @retry="refresh" />

    <div v-else-if="loading" class="space-y-5">
      <SkeletonBlock height="h-10" />
      <div class="surface p-5"><SkeletonBlock :lines="5" /></div>
    </div>

    <template v-else-if="data">
      <PageHeader
        :title="`Payout to ${data.payment.payeeName}`"
        :subtitle="`Settlement of claim ${data.payment.claimNumber} · ${data.payment.patientName}`"
        :back="{ to: '/insurance/payments', label: 'All payments' }"
      >
        <template #actions>
          <RouterLink :to="`/insurance/claims/${data.payment.claimId}`" class="btn-ghost">
            View claim
          </RouterLink>
        </template>
      </PageHeader>

      <!-- Settlement in flight -->
      <section v-if="settle.pending.value" class="surface mb-5 overflow-hidden">
        <header class="flex items-center gap-2.5 border-b border-ink-700/70 px-5 py-3.5">
          <span
            class="h-2 w-2 animate-pulse rounded-full bg-sui-500 shadow-[0_0_10px_2px_rgba(124,138,255,.45)]"
            aria-hidden="true"
          />
          <h2 class="text-sm font-semibold tracking-tight text-mist-100">Settling on Sui testnet</h2>
        </header>
        <ol class="space-y-3 p-5" aria-live="polite">
          <li
            v-for="(step, index) in SETTLE_STEPS"
            :key="step"
            class="flex items-center gap-3 transition-opacity"
            :class="index > settleStep ? 'opacity-35' : 'opacity-100'"
          >
            <span
              class="grid h-5 w-5 shrink-0 place-items-center rounded-full border text-2xs"
              :class="
                index < settleStep
                  ? 'border-sui-600/50 bg-sui-950 text-sui-400'
                  : index === settleStep
                    ? 'border-sui-500 bg-sui-500 text-ink-950'
                    : 'border-ink-700 text-mist-500'
              "
            >
              {{ index < settleStep ? '✓' : index + 1 }}
            </span>
            <span class="text-sm" :class="index <= settleStep ? 'text-mist-200' : 'text-mist-500'">
              {{ step }}
            </span>
          </li>
        </ol>
      </section>

      <!-- Action prompt: this role is the only one that can trigger settlement -->
      <div
        v-else-if="data.payment.status === 'pending'"
        class="surface mb-5 flex flex-wrap items-center justify-between gap-4 border-l-2 border-l-sui-600 p-4"
      >
        <div>
          <p class="text-sm font-medium text-mist-100">Ready to settle</p>
          <p class="mt-0.5 text-sm text-mist-500">
            {{ money(data.payment.amount) }} ({{ usdc(data.payment.amountUsdc) }}) to
            {{ data.payment.payeeName }}. Gas is paid by the RICE sponsor address.
          </p>
        </div>
        <button type="button" class="btn-sui" @click="settle.run('initiate')">
          Initiate settlement
        </button>
      </div>

      <div
        v-else-if="data.payment.status === 'failed'"
        class="surface mb-5 flex flex-wrap items-center justify-between gap-4 border-l-2 border-l-rose-500 p-4"
      >
        <div>
          <p class="text-sm font-medium text-mist-100">Settlement failed</p>
          <p class="mt-0.5 text-sm text-mist-500">
            Nothing was transferred. The reason is recorded below and this payout can be retried
            safely.
          </p>
        </div>
        <button type="button" class="btn-sui" @click="settle.run('retry')">Retry settlement</button>
      </div>

      <p v-if="settle.error.value" class="mb-5 text-sm text-rose-300">{{ settle.error.value }}</p>

      <PaymentDetail :payment="data.payment" :transaction="data.transaction" />
    </template>
  </div>
</template>
