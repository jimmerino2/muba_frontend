<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useAsync } from '@/lib/useAsync'
import * as paymentsApi from '@/lib/api/payments'
import * as hospitalsApi from '@/lib/api/hospitals'
import { money } from '@/lib/format'
import PageHeader from '@/components/ui/PageHeader.vue'
import PaymentDetail from '@/components/PaymentDetail.vue'
import PaymentHistoryList from '@/components/PaymentHistoryList.vue'
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
import ErrorState from '@/components/ui/ErrorState.vue'

const route = useRoute()
const auth = useAuthStore()
const paymentId = route.params.paymentId as string

const { data, loading, error, refresh } = useAsync(async () => {
  const payment = await paymentsApi.getPaymentById(paymentId)
  const [transaction, history, claim] = await Promise.all([
    paymentsApi.getPaymentTransaction(paymentId),
    paymentsApi.getPayments({ claimId: payment.claimId }),
    hospitalsApi.getClaimById(auth.orgId!, payment.claimId).catch(() => null),
  ])
  return { payment, transaction, history: history.data, claim }
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
        :title="`Payment from ${data.payment.payerName}`"
        :subtitle="`Settlement of claim ${data.payment.claimNumber} · ${data.payment.patientName}`"
        :back="{ to: '/hospital/payments', label: 'All payments' }"
      >
        <template #actions>
          <RouterLink :to="`/hospital/claims/${data.payment.claimId}`" class="btn-ghost">
            View claim
          </RouterLink>
        </template>
      </PageHeader>

      <!-- The provider cannot initiate settlement; only the payer can. Say so. -->
      <div
        v-if="data.payment.status !== 'completed'"
        class="surface mb-5 border-l-2 border-l-amber-500 p-4"
      >
        <p class="text-sm font-medium text-mist-100">Awaiting the insurer</p>
        <p class="mt-0.5 text-sm leading-relaxed text-mist-500">
          Settlement is triggered by {{ data.payment.payerName }}. This payout will appear as
          received here once their transaction reaches finality on Sui.
        </p>
      </div>

      <div
        v-if="data.claim && data.claim.outstandingAmount > 0"
        class="surface mb-5 flex flex-wrap items-center justify-between gap-4 border-l-2 border-l-amber-500 p-4"
      >
        <div>
          <p class="text-sm font-medium text-mist-100">This claim still has an outstanding balance</p>
          <p class="mt-0.5 text-sm text-mist-500">
            {{ money(data.claim.outstandingAmount) }} of the approved amount has not been paid yet.
          </p>
        </div>
      </div>

      <PaymentDetail :payment="data.payment" :transaction="data.transaction" />

      <PaymentHistoryList
        v-if="data.history.length > 1"
        :payments="data.history"
        :current-payment-id="data.payment.id"
        :payment-path="(id) => `/hospital/payments/${id}`"
        class="mt-5"
      />
    </template>
  </div>
</template>
