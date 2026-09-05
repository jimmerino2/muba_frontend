<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useAsync } from '@/lib/useAsync'
import * as insuranceApi from '@/lib/api/insurance'
import { date, money } from '@/lib/format'
import PageHeader from '@/components/ui/PageHeader.vue'
import ClaimStatusBadge from '@/components/ClaimStatusBadge.vue'
import DetailList from '@/components/ui/DetailList.vue'
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorState from '@/components/ui/ErrorState.vue'

const route = useRoute()
const auth = useAuthStore()
const policyId = route.params.policyId as string

const { data, loading, error, refresh } = useAsync(async () => {
  const policy = await insuranceApi.getPolicyById(auth.orgId!, policyId)
  const claims = await insuranceApi.getClaims(auth.orgId!)
  return { policy, claims: claims.data.filter((c) => c.policyId === policyId) }
})

const facts = computed(() => {
  const p = data.value?.policy
  if (!p) return []
  return [
    { label: 'Policy number', value: p.policyNumber, mono: true },
    { label: 'Name', value: p.name },
    { label: 'Insured party', value: p.holderName },
    { label: 'Coverage type', value: p.coverageType },
    { label: 'Status', value: p.status },
    { label: 'Start date', value: date(p.startDate) },
    { label: 'End date', value: date(p.endDate) },
    { label: 'Annual premium', value: money(p.annualPremium) },
    { label: 'Deductible', value: money(p.deductible) },
    { label: 'Currency', value: p.currency },
  ]
})

/** Utilisation against the annual limit, from claims actually approved. */
const utilisation = computed(() => {
  const rows = data.value?.claims ?? []
  const used = rows.reduce((sum, c) => sum + (c.amountApproved ?? 0), 0)
  const limit = data.value?.policy.coverageLimit ?? 0
  return { used, limit, percent: limit ? Math.min(100, Math.round((used / limit) * 100)) : 0 }
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
        :title="data.policy.name"
        :subtitle="`${data.policy.policyNumber} · ${data.policy.holderName} · ${data.policy.coverageType}`"
        :back="{ to: '/insurance/policies', label: 'All policies' }"
      />

      <!-- The numbers that drive routing get their own emphasis. -->
      <section class="surface mb-5 p-5">
        <h2 class="mb-4 text-sm font-semibold tracking-tight text-mist-100">Automation rules</h2>
        <div class="grid gap-5 sm:grid-cols-3">
          <div class="rounded-lg border border-ink-700 bg-ink-900/50 p-4">
            <p class="label">Auto-approval limit</p>
            <p class="tnum mt-1.5 text-2xl font-semibold tracking-tight text-mist-100">
              {{ money(data.policy.autoApproveLimit) }}
            </p>
            <p class="mt-2 text-xs leading-relaxed text-mist-500">
              Claims above this amount always reach an assessor, however high their Truth Score.
            </p>
          </div>
          <div class="rounded-lg border border-gonka-600/30 bg-gonka-950/40 p-4">
            <p class="label">Truth Score threshold</p>
            <p class="tnum mt-1.5 text-2xl font-semibold tracking-tight text-gonka-400">
              {{ data.policy.truthScoreThreshold }}
            </p>
            <p class="mt-2 text-xs leading-relaxed text-mist-500">
              Claims scoring below this reach an assessor, however small the amount.
            </p>
          </div>
          <div class="rounded-lg border border-ink-700 bg-ink-900/50 p-4">
            <p class="label">TPA approval limit</p>
            <p class="tnum mt-1.5 text-2xl font-semibold tracking-tight text-mist-100">
              {{ data.policy.tpaApprovalLimit !== null ? money(data.policy.tpaApprovalLimit) : 'No TPA delegation' }}
            </p>
            <p class="mt-2 text-xs leading-relaxed text-mist-500">
              {{
                data.policy.tpaApprovalLimit !== null
                  ? 'The administering TPA may decide claims at or below this amount alone; above it, the claim escalates to your own review queue.'
                  : 'This policy has no TPA delegated — every claim needing human review comes to your own queue directly.'
              }}
            </p>
          </div>
        </div>
        <p class="mt-4 text-sm leading-relaxed text-mist-400">
          A claim clears without human review only when
          <span class="text-mist-200">both</span> the auto-approval limit and the Truth Score
          threshold are met.
        </p>
      </section>

      <section class="surface mb-5 p-5">
        <div class="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p class="label">Approved against this policy</p>
            <p class="tnum mt-1 text-2xl font-semibold tracking-tight text-mist-100">
              {{ money(utilisation.used) }}
            </p>
          </div>
          <p class="tnum text-sm text-mist-500">
            of {{ money(utilisation.limit) }} annual limit · {{ utilisation.percent }}% used
          </p>
        </div>
        <div class="mt-3 h-2 overflow-hidden rounded-full bg-ink-750">
          <div
            class="h-full rounded-full bg-brand-500 transition-[width] duration-700"
            :style="{ width: `${utilisation.percent}%` }"
          />
        </div>
      </section>

      <section class="surface mb-5 p-5">
        <h2 class="mb-4 text-sm font-semibold tracking-tight text-mist-100">Policy details</h2>
        <DetailList :items="facts" :columns="3" />
      </section>

      <section class="surface overflow-hidden">
        <header class="flex items-center justify-between border-b border-ink-700/70 px-5 py-3.5">
          <h2 class="text-sm font-semibold tracking-tight text-mist-100">
            Claims against this policy
          </h2>
          <span class="text-2xs text-mist-500">{{ data.claims.length }} total</span>
        </header>

        <EmptyState v-if="!data.claims.length" title="No claims yet" icon="◇" />

        <ul v-else class="divide-y divide-ink-800/80">
          <li v-for="claim in data.claims" :key="claim.id">
            <RouterLink
              :to="`/insurance/claims/${claim.id}`"
              class="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-ink-800/60"
            >
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-mist-100">{{ claim.claimNumber }}</p>
                <p class="mt-0.5 truncate text-xs text-mist-500">
                  {{ claim.diagnosis }} · {{ claim.hospitalName }}
                </p>
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
