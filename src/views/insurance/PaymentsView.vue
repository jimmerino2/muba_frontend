<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Payment } from '@/lib/types'
import { useAuthStore } from '@/stores/auth'
import { useAsync } from '@/lib/useAsync'
import * as paymentsApi from '@/lib/api/payments'
import { date, money, usdc } from '@/lib/format'
import type { Column } from '@/lib/table'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/DataTable.vue'
import PaymentStatusBadge from '@/components/PaymentStatusBadge.vue'
import StatCard from '@/components/StatCard.vue'
import StatusFilter from '@/components/ui/StatusFilter.vue'
import ErrorState from '@/components/ui/ErrorState.vue'

const auth = useAuthStore()
const { data, loading, error, refresh } = useAsync(() =>
  paymentsApi.getPayments({ insurerId: auth.orgId! }),
)

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Awaiting settlement' },
  { value: 'completed', label: 'Settled' },
  { value: 'failed', label: 'Failed' },
]
const filter = ref('all')

const all = computed(() => data.value?.data ?? [])

const rows = computed(() => {
  if (filter.value === 'all') return all.value
  if (filter.value === 'pending')
    return all.value.filter((p) => p.status === 'pending' || p.status === 'processing')
  return all.value.filter((p) => p.status === filter.value)
})

const totals = computed(() => {
  const sum = (rows: Payment[]) => rows.reduce((t, p) => t + p.amount, 0)
  const outstanding = all.value.filter((p) => p.status !== 'completed')
  const settled = all.value.filter((p) => p.status === 'completed')
  return {
    outstanding: sum(outstanding),
    outstandingCount: outstanding.length,
    settled: sum(settled),
    settledCount: settled.length,
    failed: all.value.filter((p) => p.status === 'failed').length,
  }
})

const columns: Column<Payment>[] = [
  { key: 'paymentReference', label: 'Reference', sortable: true, width: 'w-40' },
  { key: 'payeeName', label: 'Pay to', sortable: true },
  { key: 'patientName', label: 'Patient', sortable: true, hideOnMobile: true },
  { key: 'amount', label: 'Amount', sortable: true, align: 'right', width: 'w-40' },
  { key: 'status', label: 'Status', sortable: true, width: 'w-32' },
  { key: 'settledAt', label: 'Settled', sortable: true, align: 'right', width: 'w-32', hideOnMobile: true },
]
</script>

<template>
  <div>
    <PageHeader
      title="Payments"
      subtitle="Payouts you owe providers. Settlement runs as a sponsored Sui transaction — the payer signs without holding SUI."
    />

    <ErrorState v-if="error" :message="error" class="mb-6" @retry="refresh" />

    <section class="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        label="Awaiting settlement"
        :value="money(totals.outstanding)"
        tone="attention"
        :hint="`${totals.outstandingCount} payout${totals.outstandingCount === 1 ? '' : 's'} to trigger`"
        :emphasis="totals.outstandingCount > 0"
        :loading="loading"
      />
      <StatCard
        label="Settled"
        :value="money(totals.settled)"
        tone="chain"
        :hint="`${totals.settledCount} on Sui testnet`"
        :loading="loading"
      />
      <StatCard label="Total payouts" :value="all.length" :loading="loading" />
      <StatCard
        label="Failed"
        :value="totals.failed"
        :tone="totals.failed ? 'negative' : 'neutral'"
        hint="Retry from the payment detail"
        :loading="loading"
      />
    </section>

    <DataTable
      :columns="columns"
      :rows="rows"
      :row-key="(row) => row.id"
      :loading="loading"
      :to="(row) => `/insurance/payments/${row.id}`"
      searchable
      search-placeholder="Search by reference, provider or patient…"
      :search-fields="(row) => [row.paymentReference, row.payeeName, row.patientName, row.claimNumber]"
      :initial-sort="{ key: 'createdAt', direction: 'desc' }"
      empty-title="No payments in this view"
      empty-body="Approving a claim creates the payout that appears here."
      empty-icon="⇄"
    >
      <template #filters>
        <StatusFilter v-model="filter" :options="FILTERS" />
      </template>

      <template #cell-paymentReference="{ row }">
        <div>
          <p class="font-mono text-xs text-mist-300">{{ row.paymentReference }}</p>
          <p class="font-mono text-2xs text-mist-500">{{ row.claimNumber }}</p>
        </div>
      </template>

      <template #cell-payeeName="{ row }">
        <span class="text-mist-200">{{ row.payeeName }}</span>
      </template>

      <template #cell-patientName="{ row }">
        <span class="text-mist-400">{{ row.patientName }}</span>
      </template>

      <template #cell-amount="{ row }">
        <div>
          <p class="tnum text-mist-100">{{ money(row.amount) }}</p>
          <p class="tnum text-2xs text-sui-400">{{ usdc(row.amountUsdc) }}</p>
        </div>
      </template>

      <template #cell-status="{ row }">
        <PaymentStatusBadge :status="row.status" size="sm" />
      </template>

      <template #cell-settledAt="{ row }">
        <span class="text-xs text-mist-500">{{ row.settledAt ? date(row.settledAt) : '—' }}</span>
      </template>
    </DataTable>
  </div>
</template>
