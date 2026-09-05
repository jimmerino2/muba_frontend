<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Claim } from '@/lib/types'
import { useAuthStore } from '@/stores/auth'
import { useAsync } from '@/lib/useAsync'
import * as patientsApi from '@/lib/api/patients'
import { date, money } from '@/lib/format'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/DataTable.vue'
import type { Column } from '@/lib/table'
import ClaimStatusBadge from '@/components/ClaimStatusBadge.vue'
import StatusFilter from '@/components/ui/StatusFilter.vue'
import ErrorState from '@/components/ui/ErrorState.vue'

const auth = useAuthStore()
const { data, loading, error, refresh } = useAsync(() =>
  patientsApi.getMyClaims(auth.patientId!),
)

/** Filters are a view over the shared lifecycle, mapped to patient-facing language. */
const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]
const filter = ref('all')

const BUCKETS: Record<string, string[]> = {
  pending: ['created', 'submitted', 'verified', 'pending_review'],
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
  { key: 'diagnosis', label: 'Diagnosis', sortable: true },
  { key: 'hospitalName', label: 'Provider', sortable: true, width: 'w-40', hideOnMobile: true },
  {
    key: 'amountRequested',
    label: 'Claimed',
    sortable: true,
    align: 'right',
    width: 'w-32',
  },
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
      subtitle="Every claim raised against your policy, with the verification and decision trail behind each one."
    />

    <ErrorState v-if="error" :message="error" class="mb-6" @retry="refresh" />

    <DataTable
      :columns="columns"
      :rows="rows"
      :row-key="(row) => row.id"
      :loading="loading"
      :to="(row) => `/patient/claims/${row.id}`"
      searchable
      search-placeholder="Search by claim number or diagnosis…"
      :search-fields="(row) => [row.claimNumber, row.diagnosis, row.hospitalName]"
      :initial-sort="{ key: 'updatedAt', direction: 'desc' }"
      empty-title="No claims in this view"
      empty-body="Claims raised by your hospital or TPA will appear here."
      empty-icon="◇"
    >
      <template #filters>
        <StatusFilter v-model="filter" :options="FILTERS" />
      </template>

      <template #cell-claimNumber="{ row }">
        <span class="font-mono text-xs text-mist-300">{{ row.claimNumber }}</span>
      </template>

      <template #cell-diagnosis="{ row }">
        <div>
          <p class="break-words font-medium text-mist-100">{{ row.diagnosis }}</p>
          <p class="break-words text-xs text-mist-500">{{ row.treatmentDescription }}</p>
        </div>
      </template>

      <template #cell-hospitalName="{ row }">
        <span class="text-mist-400">{{ row.hospitalName }}</span>
      </template>

      <template #cell-amountRequested="{ row }">
        <div>
          <p class="tnum text-mist-200">{{ money(row.amountRequested) }}</p>
          <p
            v-if="row.amountApproved !== null && row.amountApproved !== row.amountRequested"
            class="tnum text-xs text-mist-500"
          >
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
