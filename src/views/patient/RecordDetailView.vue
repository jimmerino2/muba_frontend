<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useAsync } from '@/lib/useAsync'
import * as patientsApi from '@/lib/api/patients'
import { date, money } from '@/lib/format'
import PageHeader from '@/components/ui/PageHeader.vue'
import RecordDetail from '@/components/RecordDetail.vue'
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
import ErrorState from '@/components/ui/ErrorState.vue'

const route = useRoute()
const auth = useAuthStore()

const { data, loading, error, refresh } = useAsync(() =>
  patientsApi.getMyRecordById(auth.patientId!, route.params.recordId as string),
)

/** Loaded once the record itself is in, so the coverage/owed split can render alongside the bill. */
const claimId = computed(() => data.value?.claimId ?? null)
const { data: claim } = useAsync(
  () => (claimId.value ? patientsApi.getMyClaimById(auth.patientId!, claimId.value) : Promise.resolve(null)),
  { watch: [claimId] },
)
</script>

<template>
  <div>
    <ErrorState v-if="error" :message="error" @retry="refresh" />

    <div v-else-if="loading" class="space-y-5">
      <SkeletonBlock height="h-10" />
      <div class="surface p-5"><SkeletonBlock :lines="5" /></div>
      <div class="surface p-5"><SkeletonBlock :lines="4" /></div>
    </div>

    <template v-else-if="data">
      <PageHeader
        :title="data.diagnosis"
        :subtitle="`${data.hospitalName} · ${date(data.visitDate)}`"
        :back="{ to: '/patient/records', label: 'All records' }"
      >
        <template #actions>
          <RouterLink v-if="data.claimId" :to="`/patient/claims/${data.claimId}`" class="btn-primary">
            View linked claim
          </RouterLink>
          <span
            v-else
            class="rounded-lg border border-ink-700 px-3 py-2 text-xs text-mist-500"
          >
            No claim raised yet
          </span>
        </template>
      </PageHeader>

      <div class="surface mb-5 flex flex-wrap items-center gap-x-10 gap-y-4 p-5">
        <div>
          <p class="label">Total billed</p>
          <p class="tnum mt-1 text-2xl font-semibold tracking-tight text-mist-100">
            {{ money(data.totalCost) }}
          </p>
        </div>
        <div>
          <p class="label">Filed by</p>
          <p class="mt-1 text-sm text-mist-200">{{ data.createdBy }}</p>
        </div>
        <div>
          <p class="label">Filed on</p>
          <p class="mt-1 text-sm text-mist-200">{{ date(data.createdAt) }}</p>
        </div>
      </div>

      <RecordDetail :record="data" :claim="claim" />
    </template>
  </div>
</template>
