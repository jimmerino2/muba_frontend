<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Claim } from '@/lib/types'
import { useAuthStore } from '@/stores/auth'
import { useAsync } from '@/lib/useAsync'
import * as tpaApi from '@/lib/api/tpa'
import { CLAIM_STATUSES, claimStatusLabel, date, money } from '@/lib/format'
import type { Column } from '@/lib/table'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/DataTable.vue'
import ClaimStatusBadge from '@/components/ClaimStatusBadge.vue'
import ErrorState from '@/components/ui/ErrorState.vue'

const auth = useAuthStore()
const { data, loading, error, refresh } = useAsync(() => tpaApi.getClaims(auth.orgId!))

const status = ref('all')
const STATUS_OPTIONS = computed(() => [
  { value: 'all', label: 'All statuses' },
  ...CLAIM_STATUSES.filter((s) => s !== 'created').map((s) => ({
    value: s,
    label: claimStatusLabel(s),
  })),
])

const rows = computed(() => {
  const all = data.value?.data ?? []
  return status.value === 'all' ? all : all.filter((c) => c.status === status.value)
})

const columns: Column<Claim>[] = [
  { key: 'claimNumber', label: 'Claim', sortable: true, width: 'w-36' },
  { key: 'patientName', label: 'Patient', sortable: true },
  { key: 'hospitalName', label: 'Provider', sortable: true, hideOnMobile: true },
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
      subtitle="Every claim you administer, GL and non-GL alike. Drafts held by providers are not visible here."
    />

    <ErrorState v-if="error" :message="error" class="mb-6" @retry="refresh" />

    <DataTable
      :columns="columns"
      :rows="rows"
      :row-key="(row) => row.id"
      :loading="loading"
      :to="(row) => `/tpa/claims/${row.id}`"
      searchable
      search-placeholder="Search by claim, patient, provider or diagnosis…"
      :search-fields="
        (row) => [row.claimNumber, row.patientName, row.hospitalName, row.diagnosis]
      "
      :initial-sort="{ key: 'updatedAt', direction: 'desc' }"
      empty-title="No claims match this filter"
      empty-icon="◇"
    >
      <template #filters>
        <select v-model="status" class="field w-44 py-1.5 text-xs" aria-label="Filter by status">
          <option v-for="option in STATUS_OPTIONS" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
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

      <template #cell-hospitalName="{ row }">
        <div class="min-w-0">
          <p class="truncate text-mist-300">{{ row.hospitalName }}</p>
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
