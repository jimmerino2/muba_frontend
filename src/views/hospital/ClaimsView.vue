<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Claim } from '@/lib/types'
import { useAuthStore } from '@/stores/auth'
import { useAsync } from '@/lib/useAsync'
import * as hospitalsApi from '@/lib/api/hospitals'
import { date, money } from '@/lib/format'
import type { Column } from '@/lib/table'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/DataTable.vue'
import ClaimStatusBadge from '@/components/ClaimStatusBadge.vue'
import StatusFilter from '@/components/ui/StatusFilter.vue'
import ErrorState from '@/components/ui/ErrorState.vue'

const auth = useAuthStore()
const { data, loading, error, refresh } = useAsync(() => hospitalsApi.getClaims(auth.orgId!))

/** Provider buckets over the shared lifecycle — "pending" means anything not yet decided. */
const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Drafts' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]
const filter = ref('all')

const BUCKETS: Record<string, string[]> = {
  draft: ['created'],
  pending: ['submitted', 'verified', 'pending_review'],
  approved: ['auto_approved', 'approved', 'paid', 'closed'],
  rejected: ['rejected'],
}

const rows = computed(() => {
  const all = data.value?.data ?? []
  if (filter.value === 'all') return all
  return all.filter((c) => BUCKETS[filter.value]!.includes(c.status))
})

const columns: Column<Claim>[] = [
  { key: 'claimNumber', label: 'Claim', sortable: true, width: 'w-36' },
  { key: 'patientName', label: 'Patient', sortable: true },
  { key: 'insurerName', label: 'Insurer', sortable: true, hideOnMobile: true },
  { key: 'amountRequested', label: 'Claimed', sortable: true, align: 'right', width: 'w-32' },
  { key: 'status', label: 'Status', sortable: true, width: 'w-36' },
  {
    key: 'updatedAt',
    label: 'Updated',
    sortable: true,
    align: 'right',
    width: 'w-32',
    hideOnMobile: true,
  },
]
</script>

<template>
  <div>
    <PageHeader
      title="Claims"
      subtitle="Every claim raised from a record at this provider, across all insurers you bill."
    />

    <ErrorState v-if="error" :message="error" class="mb-6" @retry="refresh" />

    <DataTable
      :columns="columns"
      :rows="rows"
      :row-key="(row) => row.id"
      :loading="loading"
      :to="(row) => `/hospital/claims/${row.id}`"
      searchable
      search-placeholder="Search by claim number, patient or diagnosis…"
      :search-fields="(row) => [row.claimNumber, row.patientName, row.diagnosis]"
      :initial-sort="{ key: 'updatedAt', direction: 'desc' }"
      empty-title="No claims in this view"
      empty-body="Raise a claim from a medical record to get started."
      empty-icon="◇"
    >
      <template #filters>
        <StatusFilter v-model="filter" :options="FILTERS" />
      </template>

      <template #cell-claimNumber="{ row }">
        <span class="font-mono text-xs text-mist-300">{{ row.claimNumber }}</span>
      </template>

      <template #cell-patientName="{ row }">
        <div class="min-w-0">
          <p class="truncate font-medium text-mist-100">{{ row.patientName }}</p>
          <p class="truncate text-xs text-mist-500">{{ row.diagnosis }}</p>
        </div>
      </template>

      <template #cell-insurerName="{ row }">
        <div class="min-w-0">
          <p class="truncate text-mist-300">{{ row.insurerName }}</p>
          <p class="truncate font-mono text-2xs text-mist-500">{{ row.policyNumber }}</p>
        </div>
      </template>

      <template #cell-amountRequested="{ row }">
        <div>
          <p class="tnum text-mist-200">{{ money(row.amountRequested) }}</p>
          <p v-if="row.amountApproved !== null" class="tnum text-2xs text-emerald-300">
            {{ money(row.amountApproved) }} approved
          </p>
        </div>
      </template>

      <template #cell-status="{ row }">
        <ClaimStatusBadge :status="row.status" size="sm" />
      </template>

      <template #cell-updatedAt="{ row }">
        <span class="text-xs text-mist-500">{{ date(row.updatedAt) }}</span>
      </template>
    </DataTable>
  </div>
</template>
