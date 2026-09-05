<script setup lang="ts">
import { computed } from 'vue'
import type { Payment } from '@/lib/types'
import { useAuthStore } from '@/stores/auth'
import { useAsync } from '@/lib/useAsync'
import * as patientsApi from '@/lib/api/patients'
import { date, money, usdc } from '@/lib/format'
import type { Column } from '@/lib/table'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/DataTable.vue'
import PaymentStatusBadge from '@/components/PaymentStatusBadge.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import CoverageRemaining from '@/components/CoverageRemaining.vue'

const auth = useAuthStore()
const { data, loading, error, refresh } = useAsync(async () => {
  const [payments, policies, claims] = await Promise.all([
    patientsApi.getMyPayments(auth.patientId!),
    patientsApi.getMyPolicies(auth.patientId!),
    patientsApi.getMyClaims(auth.patientId!),
  ])
  return { payments, policies: policies.data, claims: claims.data }
})

const rows = computed(() => data.value?.payments.data ?? [])

/** Combined across every policy held — the same "claimed vs limit" basis
 * each policy's own detail page shows, totalled for a quick glance here. */
const coverage = computed(() => {
  const policies = data.value?.policies ?? []
  const claims = data.value?.claims ?? []
  return {
    limit: policies.reduce((sum, p) => sum + p.coverageLimit, 0),
    used: claims.reduce((sum, c) => sum + (c.amountApproved ?? 0), 0),
  }
})

const columns: Column<Payment>[] = [
  { key: 'paymentReference', label: 'Reference', sortable: true, width: 'w-40' },
  { key: 'payeeName', label: 'Paid to', sortable: true },
  { key: 'amount', label: 'Amount', sortable: true, align: 'right', width: 'w-40' },
  { key: 'status', label: 'Status', sortable: true, width: 'w-32' },
  { key: 'createdAt', label: 'Created', sortable: true, align: 'right', width: 'w-32', hideOnMobile: true },
]
</script>

<template>
  <div>
    <PageHeader
      title="Payments"
      subtitle="Settlements your insurer made to your provider. Payouts go provider-direct — nothing is billed to you here."
    />

    <ErrorState v-if="error" :message="error" class="mb-6" @retry="refresh" />

    <section v-if="!loading && data?.policies.length" class="surface mb-5 p-5">
      <CoverageRemaining :used="coverage.used" :limit="coverage.limit" />
    </section>

    <div
      class="surface mb-5 flex items-start gap-3 border-l-2 border-l-sui-600 p-4"
    >
      <span class="mt-0.5 text-sui-400" aria-hidden="true">⇄</span>
      <p class="text-sm leading-relaxed text-mist-400">
        Settlements run on the <span class="text-sui-400">Sui testnet</span> and are simulated for
        this prototype — the transaction records are real on-chain artefacts in shape, but no money
        moves.
      </p>
    </div>

    <DataTable
      :columns="columns"
      :rows="rows"
      :row-key="(row) => row.id"
      :loading="loading"
      :to="(row) => `/patient/payments/${row.id}`"
      searchable
      search-placeholder="Search by reference or provider…"
      :search-fields="(row) => [row.paymentReference, row.payeeName, row.claimNumber]"
      :initial-sort="{ key: 'createdAt', direction: 'desc' }"
      empty-title="No payments yet"
      empty-body="Once a claim of yours is approved, the settlement to your provider appears here."
      empty-icon="⇄"
    >
      <template #cell-paymentReference="{ row }">
        <div>
          <p class="font-mono text-xs text-mist-300">{{ row.paymentReference }}</p>
          <p class="font-mono text-2xs text-mist-500">{{ row.claimNumber }}</p>
        </div>
      </template>

      <template #cell-payeeName="{ row }">
        <span class="text-mist-200">{{ row.payeeName }}</span>
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

      <template #cell-createdAt="{ row }">
        <span class="text-xs text-mist-500">{{ date(row.createdAt) }}</span>
      </template>
    </DataTable>
  </div>
</template>
