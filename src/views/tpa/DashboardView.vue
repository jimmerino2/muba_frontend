<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useAsync } from '@/lib/useAsync'
import * as tpaApi from '@/lib/api/tpa'
import { money, moneyCompact, relative } from '@/lib/format'
import PageHeader from '@/components/ui/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'
import ClaimStatusBadge from '@/components/ClaimStatusBadge.vue'
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorState from '@/components/ui/ErrorState.vue'

const auth = useAuthStore()
const { data, loading, error, refresh } = useAsync(() => tpaApi.getDashboard(auth.orgId!))
</script>

<template>
  <div>
    <PageHeader
      :title="auth.user?.orgName ?? 'TPA dashboard'"
      subtitle="Claims you administer on the insurer's behalf — the ones within your delegated limit are yours to decide."
    >
      <template #actions>
        <RouterLink to="/tpa/review" class="btn-primary">Open review queue</RouterLink>
      </template>
    </PageHeader>

    <ErrorState v-if="error" :message="error" class="mb-6" @retry="refresh" />

    <section class="mb-3">
      <h2 class="label mb-3">Claim queue</h2>
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Pending verification"
          :value="data?.pendingVerification ?? null"
          hint="Submitted, not yet scored"
          :loading="loading"
          to="/tpa/claims"
        />
        <StatCard
          label="Requires review"
          :value="data?.requiresReview ?? null"
          tone="attention"
          hint="Within your delegated limit"
          :emphasis="!!data?.requiresReview"
          :loading="loading"
          to="/tpa/review"
        />
        <StatCard
          label="Approved"
          :value="data?.approved ?? null"
          tone="positive"
          hint="Includes auto-approvals"
          :loading="loading"
          to="/tpa/claims"
        />
        <StatCard
          label="Rejected"
          :value="data?.rejected ?? null"
          :tone="data?.rejected ? 'negative' : 'neutral'"
          :loading="loading"
          to="/tpa/claims"
        />
      </div>
    </section>

    <section class="mb-6">
      <h2 class="label mb-3">Settlement</h2>
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Payment pending"
          :value="data?.paymentPending ?? null"
          tone="attention"
          :hint="data ? `${moneyCompact(data.exposureAmount)} outstanding` : undefined"
          :loading="loading"
          to="/tpa/payments"
        />
        <StatCard
          label="Settled"
          :value="data?.settled ?? null"
          tone="chain"
          :hint="data ? `${moneyCompact(data.settledAmount)} paid out` : undefined"
          :loading="loading"
          to="/tpa/payments"
        />
        <StatCard
          label="Outstanding value"
          :value="data ? money(data.exposureAmount) : null"
          :loading="loading"
        />
        <StatCard
          label="Auto-approval rate"
          :value="data ? `${data.autoApprovalRate}%` : null"
          hint="Decided without human review"
          :loading="loading"
        />
      </div>
    </section>

    <!-- The queue itself, so the dashboard is actionable rather than decorative -->
    <section class="surface overflow-hidden">
      <header class="flex items-center justify-between border-b border-ink-700/70 px-5 py-3.5">
        <div>
          <h2 class="text-sm font-semibold tracking-tight text-mist-100">Work queue</h2>
          <p class="mt-0.5 text-xs text-mist-500">
            Claims awaiting verification or a decision within your delegated limit
          </p>
        </div>
        <RouterLink to="/tpa/review" class="text-xs text-mist-500 hover:text-brand-400">
          Open review →
        </RouterLink>
      </header>

      <div v-if="loading" class="space-y-3 p-5">
        <SkeletonBlock v-for="n in 4" :key="n" height="h-14" />
      </div>

      <EmptyState
        v-else-if="!data?.reviewQueue.length"
        title="Queue is clear"
        body="No claims are waiting on verification or a decision within your limit."
        icon="✓"
      />

      <ul v-else class="divide-y divide-ink-800/80">
        <li v-for="claim in data.reviewQueue" :key="claim.id">
          <RouterLink
            :to="
              claim.status === 'pending_review'
                ? `/tpa/review/${claim.id}`
                : `/tpa/claims/${claim.id}`
            "
            class="flex flex-wrap items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-ink-800/60"
          >
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2.5">
                <p class="truncate text-sm font-medium text-mist-100">{{ claim.patientName }}</p>
                <ClaimStatusBadge :status="claim.status" size="sm" />
              </div>
              <p class="mt-0.5 truncate text-xs text-mist-500">
                {{ claim.claimNumber }} · {{ claim.diagnosis }} · {{ claim.hospitalName }}
              </p>
            </div>
            <div class="flex shrink-0 items-center gap-5">
              <div class="text-right">
                <p class="tnum text-sm font-medium text-mist-100">
                  {{ money(claim.amountRequested) }}
                </p>
                <p class="text-2xs text-mist-500">{{ relative(claim.updatedAt) }}</p>
              </div>
              <span class="text-mist-500" aria-hidden="true">→</span>
            </div>
          </RouterLink>
        </li>
      </ul>
    </section>
  </div>
</template>
