<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import type { MedicalRecord } from '@/lib/types'
import { useAuthStore } from '@/stores/auth'
import { useAsync } from '@/lib/useAsync'
import * as hospitalsApi from '@/lib/api/hospitals'
import { date, money, titleCase } from '@/lib/format'
import type { Column } from '@/lib/table'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/DataTable.vue'
import StatusFilter from '@/components/ui/StatusFilter.vue'
import ErrorState from '@/components/ui/ErrorState.vue'

const auth = useAuthStore()
const { data, loading, error, refresh } = useAsync(() => hospitalsApi.getRecords(auth.orgId!))

const FILTERS = [
  { value: 'all', label: 'All records' },
  { value: 'unclaimed', label: 'No claim raised' },
  { value: 'claimed', label: 'Claim raised' },
]
const filter = ref('all')

const rows = computed(() => {
  const all = data.value?.data ?? []
  if (filter.value === 'unclaimed') return all.filter((r) => !r.claimId)
  if (filter.value === 'claimed') return all.filter((r) => r.claimId)
  return all
})

const columns: Column<MedicalRecord>[] = [
  { key: 'patientName', label: 'Patient', sortable: true },
  { key: 'diagnosis', label: 'Diagnosis', sortable: true },
  { key: 'visitDate', label: 'Visit', sortable: true, width: 'w-32', hideOnMobile: true },
  { key: 'admissionType', label: 'Type', sortable: true, width: 'w-32', hideOnMobile: true },
  { key: 'totalCost', label: 'Billed', sortable: true, align: 'right', width: 'w-32' },
  { key: 'claimId', label: 'Claim', width: 'w-36', align: 'right' },
]
</script>

<template>
  <div>
    <PageHeader
      title="Medical records"
      subtitle="Records authored at this provider. A claim is raised from a record, so the claim always inherits verified clinical detail."
    >
      <template #actions>
        <RouterLink to="/hospital/records/new" class="btn-primary">New record</RouterLink>
      </template>
    </PageHeader>

    <ErrorState v-if="error" :message="error" class="mb-6" @retry="refresh" />

    <DataTable
      :columns="columns"
      :rows="rows"
      :row-key="(row) => row.id"
      :loading="loading"
      :to="(row) => `/hospital/records/${row.id}`"
      searchable
      search-placeholder="Search by patient, diagnosis or record number…"
      :search-fields="(row) => [row.patientName, row.diagnosis, row.recordNumber, row.physician]"
      :initial-sort="{ key: 'visitDate', direction: 'desc' }"
      empty-title="No records here"
      empty-body="File a record to start the claim lifecycle."
      empty-icon="⛁"
    >
      <template #filters>
        <StatusFilter v-model="filter" :options="FILTERS" />
      </template>

      <template #empty-action>
        <RouterLink to="/hospital/records/new" class="btn-primary">New record</RouterLink>
      </template>

      <template #cell-patientName="{ row }">
        <div class="min-w-0">
          <p class="truncate font-medium text-mist-100">{{ row.patientName }}</p>
          <p class="truncate font-mono text-2xs text-mist-500">{{ row.recordNumber }}</p>
        </div>
      </template>

      <template #cell-diagnosis="{ row }">
        <div class="min-w-0">
          <p class="truncate text-mist-200">{{ row.diagnosis }}</p>
          <p class="truncate text-xs text-mist-500">
            {{ row.department }} · {{ row.documents.length }} document{{
              row.documents.length === 1 ? '' : 's'
            }}
          </p>
        </div>
      </template>

      <template #cell-visitDate="{ row }">
        <span class="text-mist-400">{{ date(row.visitDate) }}</span>
      </template>

      <template #cell-admissionType="{ row }">
        <span class="rounded border border-ink-700 bg-ink-900/60 px-2 py-0.5 text-2xs text-mist-400">
          {{ titleCase(row.admissionType) }}
        </span>
      </template>

      <template #cell-totalCost="{ row }">
        <span class="tnum text-mist-200">{{ money(row.totalCost) }}</span>
      </template>

      <template #cell-claimId="{ row }">
        <RouterLink
          v-if="row.claimId"
          :to="`/hospital/claims/${row.claimId}`"
          class="text-xs text-gonka-400 hover:text-gonka-300"
          @click.stop
        >
          View claim →
        </RouterLink>
        <RouterLink
          v-else
          :to="`/hospital/records/${row.id}/claim`"
          class="rounded-md border border-amber-500/35 bg-amber-500/10 px-2 py-1 text-2xs font-medium text-amber-300 transition-colors hover:bg-amber-500/20"
          @click.stop
        >
          Raise claim
        </RouterLink>
      </template>
    </DataTable>
  </div>
</template>
