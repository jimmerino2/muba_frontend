<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import type { Policy } from '@/lib/types'
import { useAuthStore } from '@/stores/auth'
import { useAsync } from '@/lib/useAsync'
import * as insuranceApi from '@/lib/api/insurance'
import { date, money } from '@/lib/format'
import type { Column } from '@/lib/table'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/DataTable.vue'
import ErrorState from '@/components/ui/ErrorState.vue'

const auth = useAuthStore()
const { data, loading, error, refresh } = useAsync(() => insuranceApi.getPolicies(auth.orgId!))

const rows = computed(() => data.value?.data ?? [])

const columns: Column<Policy>[] = [
  { key: 'policyNumber', label: 'Policy', sortable: true, width: 'w-48' },
  { key: 'holderName', label: 'Insured party', sortable: true },
  { key: 'coverageType', label: 'Coverage', sortable: true, hideOnMobile: true },
  { key: 'coverageLimit', label: 'Annual limit', sortable: true, align: 'right', width: 'w-36' },
  { key: 'autoApproveLimit', label: 'Auto-approve', sortable: true, align: 'right', width: 'w-40' },
  { key: 'endDate', label: 'Renews', sortable: true, align: 'right', width: 'w-32', hideOnMobile: true },
]

const STATUS_TONE: Record<Policy['status'], string> = {
  active: 'border-emerald-500/35 bg-emerald-500/12 text-emerald-300',
  pending: 'border-amber-500/35 bg-amber-500/12 text-amber-300',
  lapsed: 'border-ink-600 bg-ink-800 text-mist-400',
}
</script>

<template>
  <div>
    <PageHeader
      title="Policies"
      subtitle="Cover you underwrite. The auto-approval limit and Truth Score threshold set here decide which claims reach an assessor."
    >
      <template #actions>
        <RouterLink to="/insurance/policies/new" class="btn-primary">New policy</RouterLink>
      </template>
    </PageHeader>

    <ErrorState v-if="error" :message="error" class="mb-6" @retry="refresh" />

    <DataTable
      :columns="columns"
      :rows="rows"
      :row-key="(row) => row.id"
      :loading="loading"
      :to="(row) => `/insurance/policies/${row.id}`"
      searchable
      search-placeholder="Search by policy number, holder or coverage…"
      :search-fields="(row) => [row.policyNumber, row.holderName, row.coverageType]"
      :initial-sort="{ key: 'policyNumber', direction: 'asc' }"
      empty-title="No policies yet"
      empty-body="Create a policy to start underwriting claims."
      empty-icon="⛨"
    >
      <template #empty-action>
        <RouterLink to="/insurance/policies/new" class="btn-primary">New policy</RouterLink>
      </template>

      <template #cell-policyNumber="{ row }">
        <div class="flex items-center gap-2.5">
          <span class="font-mono text-xs text-mist-300">{{ row.policyNumber }}</span>
          <span
            class="rounded border px-1.5 py-0.5 text-2xs capitalize"
            :class="STATUS_TONE[row.status]"
          >
            {{ row.status }}
          </span>
        </div>
      </template>

      <template #cell-holderName="{ row }">
        <span class="font-medium text-mist-100">{{ row.holderName }}</span>
      </template>

      <template #cell-coverageType="{ row }">
        <span class="text-mist-400">{{ row.coverageType }}</span>
      </template>

      <template #cell-coverageLimit="{ row }">
        <span class="tnum text-mist-200">{{ money(row.coverageLimit) }}</span>
      </template>

      <template #cell-autoApproveLimit="{ row }">
        <div>
          <p class="tnum text-mist-200">{{ money(row.autoApproveLimit) }}</p>
          <p class="tnum text-2xs text-gonka-400">score ≥ {{ row.truthScoreThreshold }}</p>
        </div>
      </template>

      <template #cell-endDate="{ row }">
        <span class="text-xs text-mist-500">{{ date(row.endDate) }}</span>
      </template>
    </DataTable>
  </div>
</template>
