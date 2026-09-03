<script setup lang="ts">
import { computed } from 'vue'
import type { Patient } from '@/lib/types'
import { useAuthStore } from '@/stores/auth'
import { useAsync } from '@/lib/useAsync'
import * as hospitalsApi from '@/lib/api/hospitals'
import { date, initials } from '@/lib/format'
import type { Column } from '@/lib/table'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/DataTable.vue'
import ErrorState from '@/components/ui/ErrorState.vue'

const auth = useAuthStore()
const { data, loading, error, refresh } = useAsync(() => hospitalsApi.getPatients(auth.orgId!))

const rows = computed(() => data.value?.data ?? [])

const columns: Column<Patient>[] = [
  { key: 'name', label: 'Patient', sortable: true },
  { key: 'nationalId', label: 'National ID', sortable: true, width: 'w-40', hideOnMobile: true },
  { key: 'dateOfBirth', label: 'Date of birth', sortable: true, width: 'w-36', hideOnMobile: true },
  { key: 'bloodType', label: 'Blood type', width: 'w-28', hideOnMobile: true },
  { key: 'phone', label: 'Contact', width: 'w-44' },
]
</script>

<template>
  <div>
    <PageHeader
      title="Patients"
      :subtitle="`Patients with at least one medical record filed at this ${auth.orgLabel.toLowerCase()}.`"
    />

    <ErrorState v-if="error" :message="error" class="mb-6" @retry="refresh" />

    <DataTable
      :columns="columns"
      :rows="rows"
      :row-key="(row) => row.id"
      :loading="loading"
      :to="(row) => `/hospital/patients/${row.id}`"
      searchable
      search-placeholder="Search by name, email or national ID…"
      :search-fields="(row) => [row.name, row.email, row.nationalId]"
      :initial-sort="{ key: 'name', direction: 'asc' }"
      empty-title="No patients yet"
      empty-body="A patient appears here once you file their first medical record."
      empty-icon="☰"
    >
      <template #cell-name="{ row }">
        <div class="flex items-center gap-3">
          <span
            class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink-750 text-2xs font-semibold text-mist-300"
            aria-hidden="true"
          >
            {{ initials(row.name) }}
          </span>
          <div class="min-w-0">
            <p class="truncate font-medium text-mist-100">{{ row.name }}</p>
            <p class="truncate text-xs text-mist-500">{{ row.email }}</p>
          </div>
        </div>
      </template>

      <template #cell-nationalId="{ row }">
        <span class="tnum font-mono text-xs text-mist-400">{{ row.nationalId }}</span>
      </template>

      <template #cell-dateOfBirth="{ row }">
        <span class="text-mist-400">{{ date(row.dateOfBirth) }}</span>
      </template>

      <template #cell-bloodType="{ row }">
        <span class="rounded border border-ink-700 bg-ink-900/60 px-2 py-0.5 text-2xs text-mist-300">
          {{ row.bloodType }}
        </span>
      </template>

      <template #cell-phone="{ row }">
        <span class="tnum font-mono text-xs text-mist-400">{{ row.phone }}</span>
      </template>
    </DataTable>
  </div>
</template>
