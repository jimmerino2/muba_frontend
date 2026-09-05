<script setup lang="ts">
import { computed } from 'vue'
import type { Policy } from '@/lib/types'
import { useAuthStore } from '@/stores/auth'
import { useAsync } from '@/lib/useAsync'
import * as patientsApi from '@/lib/api/patients'
import { date, money } from '@/lib/format'
import type { Column } from '@/lib/table'
import PageHeader from '@/components/ui/PageHeader.vue'
import DataTable from '@/components/DataTable.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import CoverageRemaining from '@/components/CoverageRemaining.vue'

const auth = useAuthStore()
const { data, loading, error, refresh } = useAsync(async () => {
  const [policies, claims] = await Promise.all([
    patientsApi.getMyPolicies(auth.patientId!),
    patientsApi.getMyClaims(auth.patientId!),
  ])
  return { policies, claims: claims.data }
})

const rows = computed(() => data.value?.policies.data ?? [])

/** Totalled across every policy — how much is left to claim overall. */
const coverage = computed(() => ({
  limit: rows.value.reduce((sum, p) => sum + p.coverageLimit, 0),
  used: (data.value?.claims ?? []).reduce((sum, c) => sum + (c.amountApproved ?? 0), 0),
}))

const columns: Column<Policy>[] = [
  { key: 'policyNumber', label: 'Policy', sortable: true, width: 'w-48' },
  { key: 'coverageType', label: 'Coverage', sortable: true },
  { key: 'coverageLimit', label: 'Annual limit', sortable: true, align: 'right', width: 'w-36', hideOnMobile: true },
  { key: 'endDate', label: 'Renews', sortable: true, align: 'right', width: 'w-32' },
]

const STATUS_TONE: Record<Policy['status'], string> = {
  active: 'border-emerald-500/35 bg-emerald-500/12 text-emerald-300',
  pending: 'border-amber-500/35 bg-amber-500/12 text-amber-300',
  lapsed: 'border-ink-600 bg-ink-800 text-mist-400',
}
</script>

<template>
  <div>
    <PageHeader title="Policies" subtitle="Insurance plans you hold, and what each one covers." />

    <ErrorState v-if="error" :message="error" class="mb-6" @retry="refresh" />

    <section v-if="!loading && rows.length" class="surface mb-5 p-5">
      <CoverageRemaining :used="coverage.used" :limit="coverage.limit" />
    </section>

    <DataTable
      :columns="columns"
      :rows="rows"
      :row-key="(row) => row.id"
      :loading="loading"
      :to="(row) => `/patient/policies/${row.id}`"
      empty-title="No policies yet"
      empty-body="A policy appears here once your insurer sets up your cover."
      empty-icon="⛨"
    >
      <template #cell-policyNumber="{ row }">
        <div>
          <p class="text-sm font-medium text-mist-100">{{ row.name }}</p>
          <div class="mt-0.5 flex items-center gap-2.5">
            <span class="font-mono text-xs text-mist-400">{{ row.policyNumber }}</span>
            <span class="rounded border px-1.5 py-0.5 text-2xs capitalize" :class="STATUS_TONE[row.status]">
              {{ row.status }}
            </span>
          </div>
          <p class="mt-0.5 text-xs text-mist-500">{{ row.insurerName }}</p>
        </div>
      </template>

      <template #cell-coverageType="{ row }">
        <span class="text-mist-400">{{ row.coverageType }}</span>
      </template>

      <template #cell-coverageLimit="{ row }">
        <span class="tnum text-mist-200">{{ money(row.coverageLimit) }}</span>
      </template>

      <template #cell-endDate="{ row }">
        <span class="text-xs text-mist-500">{{ date(row.endDate) }}</span>
      </template>
    </DataTable>
  </div>
</template>
