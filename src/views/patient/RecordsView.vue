<script setup lang="ts">
import { computed } from 'vue'
import type { MedicalRecord } from '@/lib/types'
import { useAuthStore } from '@/stores/auth'
import { useAsync } from '@/lib/useAsync'
import * as patientsApi from '@/lib/api/patients'
import { date, money, titleCase } from '@/lib/format'
import type { Column } from '@/lib/table'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/DataTable.vue'
import ErrorState from '@/components/ui/ErrorState.vue'

const auth = useAuthStore()
const { data, loading, error, refresh } = useAsync(() =>
  patientsApi.getMyRecords(auth.patientId!),
)

const rows = computed(() => data.value?.data ?? [])

const columns: Column<MedicalRecord>[] = [
  { key: 'visitDate', label: 'Visit', sortable: true, width: 'w-32' },
  { key: 'diagnosis', label: 'Diagnosis', sortable: true },
  { key: 'hospitalName', label: 'Provider', sortable: true, hideOnMobile: true },
  { key: 'admissionType', label: 'Type', sortable: true, width: 'w-32', hideOnMobile: true },
  { key: 'totalCost', label: 'Billed', sortable: true, align: 'right', width: 'w-32' },
]
</script>

<template>
  <div>
    <PageHeader
      title="Medical records"
      subtitle="Records filed by your hospital or TPA. These are authored by your provider — you have read access."
    />

    <ErrorState v-if="error" :message="error" class="mb-6" @retry="refresh" />

    <DataTable
      :columns="columns"
      :rows="rows"
      :row-key="(row) => row.id"
      :loading="loading"
      :to="(row) => `/patient/records/${row.id}`"
      searchable
      search-placeholder="Search by diagnosis, provider or record number…"
      :search-fields="(row) => [row.diagnosis, row.hospitalName, row.recordNumber, row.department]"
      :initial-sort="{ key: 'visitDate', direction: 'desc' }"
      empty-title="No medical records"
      empty-body="Records appear here once a provider files one against your name."
      empty-icon="⛁"
    >
      <template #cell-visitDate="{ row }">
        <div>
          <p class="text-mist-200">{{ date(row.visitDate) }}</p>
          <p class="font-mono text-2xs text-mist-500">{{ row.recordNumber }}</p>
        </div>
      </template>

      <template #cell-diagnosis="{ row }">
        <div class="min-w-0">
          <p class="truncate font-medium text-mist-100">{{ row.diagnosis }}</p>
          <p class="truncate text-xs text-mist-500">
            {{ row.department }} · {{ row.physician }}
          </p>
        </div>
      </template>

      <template #cell-hospitalName="{ row }">
        <span class="text-mist-400">{{ row.hospitalName }}</span>
      </template>

      <template #cell-admissionType="{ row }">
        <span class="rounded border border-ink-700 bg-ink-900/60 px-2 py-0.5 text-2xs text-mist-400">
          {{ titleCase(row.admissionType) }}
        </span>
      </template>

      <template #cell-totalCost="{ row }">
        <span class="tnum text-mist-200">{{ money(row.totalCost) }}</span>
      </template>
    </DataTable>
  </div>
</template>
