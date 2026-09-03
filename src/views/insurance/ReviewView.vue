<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useAsync } from '@/lib/useAsync'
import * as insuranceApi from '@/lib/api/insurance'
import * as verificationApi from '@/lib/api/verification'
import { bandLabel, money, relative } from '@/lib/format'
import PageHeader from '@/components/ui/PageHeader.vue'
import ClaimStatusBadge from '@/components/ClaimStatusBadge.vue'
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorState from '@/components/ui/ErrorState.vue'

const auth = useAuthStore()

/**
 * The human-in-the-loop queue. Each card carries the Truth Score and the reason
 * the claim was routed here — an assessor should never have to open a claim to
 * find out why it needs them.
 */
const { data, loading, error, refresh } = useAsync(async () => {
  const queue = await insuranceApi.getClaims(auth.orgId!, { status: 'pending_review' })
  const verifications = await Promise.all(
    queue.data.map((claim) => verificationApi.getVerification(claim.id)),
  )
  return queue.data.map((claim, index) => ({ claim, verification: verifications[index] ?? null }))
})

const totalValue = computed(() =>
  (data.value ?? []).reduce((sum, row) => sum + row.claim.amountRequested, 0),
)

const BAND_STYLE = {
  high: 'border-gonka-600/40 bg-gonka-950/70 text-gonka-400',
  medium: 'border-amber-500/35 bg-amber-500/[0.08] text-amber-300',
  low: 'border-rose-500/35 bg-rose-500/[0.08] text-rose-300',
}
</script>

<template>
  <div>
    <PageHeader
      title="Review queue"
      subtitle="Claims the policy engine would not clear on its own. Each one shows what the Truth Score said and why a human is needed."
    />

    <ErrorState v-if="error" :message="error" class="mb-6" @retry="refresh" />

    <div v-if="loading" class="space-y-4">
      <div v-for="n in 3" :key="n" class="surface p-5"><SkeletonBlock :lines="4" /></div>
    </div>

    <EmptyState
      v-else-if="!data?.length"
      class="surface"
      title="Queue is clear"
      body="No claims are waiting on a human decision. Anything the engine could not clear will land here automatically."
      icon="✓"
    />

    <template v-else>
      <div class="surface mb-5 flex flex-wrap items-center justify-between gap-4 px-5 py-3.5">
        <p class="text-sm text-mist-300">
          <span class="tnum font-semibold text-mist-100">{{ data.length }}</span>
          claim{{ data.length === 1 ? '' : 's' }} awaiting a decision
        </p>
        <p class="text-sm text-mist-400">
          Combined value
          <span class="tnum font-semibold text-mist-100">{{ money(totalValue) }}</span>
        </p>
      </div>

      <ul class="space-y-4">
        <li v-for="row in data" :key="row.claim.id">
          <RouterLink
            :to="`/insurance/review/${row.claim.id}`"
            class="surface block p-5 transition-colors hover:border-ink-600 hover:bg-ink-850"
          >
            <div class="flex flex-wrap items-start justify-between gap-4">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2.5">
                  <p class="text-base font-medium text-mist-100">{{ row.claim.patientName }}</p>
                  <ClaimStatusBadge :status="row.claim.status" size="sm" />
                </div>
                <p class="mt-1 text-sm text-mist-400">{{ row.claim.diagnosis }}</p>
                <p class="mt-0.5 text-xs text-mist-500">
                  {{ row.claim.claimNumber }} · {{ row.claim.hospitalName }} ·
                  {{ row.claim.policyNumber }} · {{ relative(row.claim.updatedAt) }}
                </p>
              </div>

              <div class="flex shrink-0 items-center gap-6">
                <!-- Score, always with its band label, never a bare number -->
                <div v-if="row.verification" class="text-right">
                  <p class="label">Truth Score</p>
                  <p
                    class="tnum text-2xl font-semibold leading-tight"
                    :class="{
                      'text-gonka-400': row.verification.band === 'high',
                      'text-amber-300': row.verification.band === 'medium',
                      'text-rose-300': row.verification.band === 'low',
                    }"
                  >
                    {{ row.verification.truthScore }}
                  </p>
                  <span
                    class="mt-1 inline-block rounded border px-1.5 py-0.5 text-2xs"
                    :class="BAND_STYLE[row.verification.band]"
                  >
                    {{ bandLabel(row.verification.band) }}
                  </span>
                </div>

                <div class="text-right">
                  <p class="label">Claimed</p>
                  <p class="tnum text-2xl font-semibold leading-tight text-mist-100">
                    {{ money(row.claim.amountRequested) }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Why it is here: pulled straight from the routing event on the timeline -->
            <p
              v-if="row.claim.timeline.some((e) => e.label === 'Routed to human review')"
              class="mt-4 border-t border-ink-700/70 pt-3 text-sm leading-relaxed text-mist-400"
            >
              <span class="text-mist-500">Routed because —</span>
              {{
                row.claim.timeline.filter((e) => e.label === 'Routed to human review').slice(-1)[0]
                  ?.detail
              }}
            </p>

            <p
              v-if="row.verification"
              class="mt-3 line-clamp-2 text-sm leading-relaxed text-mist-500"
            >
              {{ row.verification.reasoning }}
            </p>
          </RouterLink>
        </li>
      </ul>
    </template>
  </div>
</template>
