<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useAsync } from '@/lib/useAsync'
import * as patientsApi from '@/lib/api/patients'
import { notFound } from '@/lib/api/client'
import { date, money } from '@/lib/format'
import PageHeader from '@/components/ui/PageHeader.vue'
import ClaimStatusBadge from '@/components/ClaimStatusBadge.vue'
import DetailList from '@/components/ui/DetailList.vue'
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import CoverageRemaining from '@/components/CoverageRemaining.vue'
import { RouterLink } from 'vue-router'

const route = useRoute()
const auth = useAuthStore()
const policyId = route.params.policyId as string

const { data, loading, error, refresh } = useAsync(async () => {
  const [policies, claims] = await Promise.all([
    patientsApi.getMyPolicies(auth.patientId!),
    patientsApi.getMyClaims(auth.patientId!),
  ])
  const policy = policies.data.find((p) => p.id === policyId)
  if (!policy) throw notFound('Policy', policyId)
  return { policy, claims: claims.data.filter((c) => c.policyId === policyId) }
})

// Insurer-internal routing knobs (auto-approve limit, Truth Score threshold)
// are deliberately left off this list — those are the insurer's own
// underwriting controls, not something the insured party needs to see.
const facts = computed(() => {
  const p = data.value?.policy
  if (!p) return []
  return [
    { label: 'Policy number', value: p.policyNumber, mono: true },
    { label: 'Insurer', value: p.insurerName },
    { label: 'Coverage type', value: p.coverageType },
    { label: 'Status', value: p.status },
    { label: 'Start date', value: date(p.startDate) },
    { label: 'End date', value: date(p.endDate) },
    { label: 'Annual coverage limit', value: money(p.coverageLimit) },
    { label: 'Deductible', value: money(p.deductible) },
    { label: 'Annual premium', value: money(p.annualPremium) },
  ]
})

/** What's actually been drawn against the annual limit so far — approved
 * amounts only, the same basis the insurer's own utilisation figure uses. */
const used = computed(() =>
  (data.value?.claims ?? []).reduce((sum, c) => sum + (c.amountApproved ?? 0), 0),
)
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
        :title="data.policy.name"
        :subtitle="`${data.policy.policyNumber} · ${data.policy.insurerName}`"
        :back="{ to: '/patient/policies', label: 'All policies' }"
      />

      <section class="surface mb-5 p-5">
        <CoverageRemaining :used="used" :limit="data.policy.coverageLimit" />
      </section>

      <section class="surface mb-5 p-5">
        <h2 class="mb-4 text-sm font-semibold tracking-tight text-mist-100">Plan details</h2>
        <DetailList :items="facts" :columns="2" />
      </section>

      <section class="surface overflow-hidden">
        <header class="flex items-center justify-between border-b border-ink-700/70 px-5 py-3.5">
          <h2 class="text-sm font-semibold tracking-tight text-mist-100">Claims against this policy</h2>
          <span class="text-2xs text-mist-500">{{ data.claims.length }} total</span>
        </header>

        <EmptyState v-if="!data.claims.length" title="No claims yet" icon="◇" />

        <ul v-else class="divide-y divide-ink-800/80">
          <li v-for="claim in data.claims" :key="claim.id">
            <RouterLink
              :to="`/patient/claims/${claim.id}`"
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
    </template>
  </div>
</template>
