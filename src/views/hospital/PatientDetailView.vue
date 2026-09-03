<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useAsync } from '@/lib/useAsync'
import * as hospitalsApi from '@/lib/api/hospitals'
import { date, initials, money } from '@/lib/format'
import PageHeader from '@/components/ui/PageHeader.vue'
import ClaimStatusBadge from '@/components/ClaimStatusBadge.vue'
import DetailList from '@/components/ui/DetailList.vue'
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorState from '@/components/ui/ErrorState.vue'

const route = useRoute()
const auth = useAuthStore()

const { data, loading, error, refresh } = useAsync(() =>
  hospitalsApi.getPatientById(auth.orgId!, route.params.patientId as string),
)

const facts = computed(() => {
  const p = data.value?.patient
  if (!p) return []
  return [
    { label: 'National ID', value: p.nationalId, mono: true },
    { label: 'Date of birth', value: date(p.dateOfBirth) },
    { label: 'Gender', value: p.gender === 'female' ? 'Female' : 'Male' },
    { label: 'Blood type', value: p.bloodType },
    { label: 'Phone', value: p.phone, mono: true },
    { label: 'Email', value: p.email },
    { label: 'Address', value: p.address },
    { label: 'Registered', value: date(p.registeredAt) },
  ]
})
</script>

<template>
  <div>
    <ErrorState v-if="error" :message="error" @retry="refresh" />

    <div v-else-if="loading" class="space-y-5">
      <SkeletonBlock height="h-10" />
      <div class="surface p-5"><SkeletonBlock :lines="5" /></div>
    </div>

    <template v-else-if="data">
      <PageHeader
        :title="data.patient.name"
        :subtitle="`${data.records.length} record${data.records.length === 1 ? '' : 's'} and ${data.claims.length} claim${data.claims.length === 1 ? '' : 's'} at this provider`"
        :back="{ to: '/hospital/patients', label: 'All patients' }"
      >
        <template #actions>
          <RouterLink to="/hospital/records/new" class="btn-primary">New record</RouterLink>
        </template>
      </PageHeader>

      <section class="surface mb-5 p-5">
        <div class="mb-5 flex items-center gap-4">
          <span
            class="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-ink-750 text-sm font-semibold text-mist-200"
            aria-hidden="true"
          >
            {{ initials(data.patient.name) }}
          </span>
          <div>
            <p class="text-base font-medium text-mist-100">{{ data.patient.name }}</p>
            <p class="text-sm text-mist-500">{{ data.patient.email }}</p>
          </div>
        </div>
        <DetailList :items="facts" :columns="3" />
      </section>

      <!-- Cover this patient holds; the assessor's thresholds are visible to the provider too. -->
      <section class="surface mb-5 overflow-hidden">
        <header class="border-b border-ink-700/70 px-5 py-3.5">
          <h2 class="text-sm font-semibold tracking-tight text-mist-100">Policies held</h2>
        </header>

        <EmptyState v-if="!data.policies.length" title="No active cover on file" icon="⛨" />

        <ul v-else class="divide-y divide-ink-800/80">
          <li v-for="policy in data.policies" :key="policy.id" class="px-5 py-4">
            <div class="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p class="text-sm font-medium text-mist-100">{{ policy.insurerName }}</p>
                <p class="mt-0.5 text-xs text-mist-500">{{ policy.coverageType }}</p>
                <p class="tnum mt-1.5 font-mono text-xs text-mist-400">{{ policy.policyNumber }}</p>
              </div>
              <dl class="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-3">
                <div>
                  <dt class="label">Annual limit</dt>
                  <dd class="tnum mt-0.5 text-sm text-mist-200">{{ money(policy.coverageLimit) }}</dd>
                </div>
                <div>
                  <dt class="label">Auto-approve ≤</dt>
                  <dd class="tnum mt-0.5 text-sm text-mist-200">
                    {{ money(policy.autoApproveLimit) }}
                  </dd>
                </div>
                <div>
                  <dt class="label">Score threshold</dt>
                  <dd class="tnum mt-0.5 text-sm text-gonka-400">{{ policy.truthScoreThreshold }}</dd>
                </div>
              </dl>
            </div>
          </li>
        </ul>
      </section>

      <div class="grid gap-5 lg:grid-cols-2">
        <section class="surface overflow-hidden">
          <header class="border-b border-ink-700/70 px-5 py-3.5">
            <h2 class="text-sm font-semibold tracking-tight text-mist-100">Medical records</h2>
          </header>

          <EmptyState v-if="!data.records.length" title="No records filed" icon="⛁" />

          <ul v-else class="divide-y divide-ink-800/80">
            <li v-for="record in data.records" :key="record.id">
              <RouterLink
                :to="`/hospital/records/${record.id}`"
                class="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-ink-800/60"
              >
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium text-mist-100">{{ record.diagnosis }}</p>
                  <p class="mt-0.5 truncate text-xs text-mist-500">
                    {{ record.recordNumber }} · {{ date(record.visitDate) }}
                  </p>
                </div>
                <span class="tnum shrink-0 text-sm text-mist-300">{{ money(record.totalCost) }}</span>
              </RouterLink>
            </li>
          </ul>
        </section>

        <section class="surface overflow-hidden">
          <header class="border-b border-ink-700/70 px-5 py-3.5">
            <h2 class="text-sm font-semibold tracking-tight text-mist-100">Claims</h2>
          </header>

          <EmptyState v-if="!data.claims.length" title="No claims raised" icon="◇" />

          <ul v-else class="divide-y divide-ink-800/80">
            <li v-for="claim in data.claims" :key="claim.id">
              <RouterLink
                :to="`/hospital/claims/${claim.id}`"
                class="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-ink-800/60"
              >
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium text-mist-100">{{ claim.claimNumber }}</p>
                  <p class="mt-0.5 truncate text-xs text-mist-500">{{ claim.diagnosis }}</p>
                </div>
                <div class="flex shrink-0 items-center gap-3">
                  <span class="tnum text-sm text-mist-300">{{ money(claim.amountRequested) }}</span>
                  <ClaimStatusBadge :status="claim.status" size="sm" />
                </div>
              </RouterLink>
            </li>
          </ul>
        </section>
      </div>
    </template>
  </div>
</template>
