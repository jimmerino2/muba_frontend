<script setup lang="ts">
import { RouterLink } from 'vue-router'
import type { Payment } from '@/lib/types'
import { date, money } from '@/lib/format'
import PaymentStatusBadge from '@/components/PaymentStatusBadge.vue'

/**
 * Every payment made against one claim, oldest first — visible whenever a
 * claim has had more than one (a partial settlement, or a follow-up
 * top-up), so the running total is never hidden in a single payment's own
 * page.
 */
defineProps<{
  payments: Payment[]
  currentPaymentId?: string
  paymentPath: (paymentId: string) => string
}>()
</script>

<template>
  <section class="surface p-5">
    <h2 class="mb-4 text-sm font-semibold tracking-tight text-mist-100">Payment history</h2>
    <ul class="divide-y divide-ink-800/80">
      <li v-for="payment in [...payments].reverse()" :key="payment.id">
        <RouterLink
          :to="paymentPath(payment.id)"
          class="flex flex-wrap items-center justify-between gap-3 py-3 transition-colors hover:bg-ink-800/40"
          :class="payment.id === currentPaymentId ? 'opacity-100' : ''"
        >
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <p class="font-mono text-xs text-mist-300">{{ payment.paymentReference }}</p>
              <span v-if="payment.id === currentPaymentId" class="text-2xs text-gonka-400">(this payment)</span>
            </div>
            <p class="mt-0.5 text-2xs text-mist-500">{{ date(payment.createdAt) }}</p>
          </div>
          <div class="flex shrink-0 items-center gap-3">
            <p class="tnum text-sm font-medium text-mist-100">{{ money(payment.amount) }}</p>
            <PaymentStatusBadge :status="payment.status" size="sm" />
          </div>
        </RouterLink>
      </li>
    </ul>
    <p class="mt-3 flex items-center justify-between border-t border-ink-700/70 pt-3 text-sm">
      <span class="text-mist-400">Total across {{ payments.length }} payments</span>
      <span class="tnum font-semibold text-mist-100">
        {{ money(payments.reduce((sum, p) => sum + p.amount, 0)) }}
      </span>
    </p>
  </section>
</template>
