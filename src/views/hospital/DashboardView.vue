<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useAsync } from '@/lib/useAsync'
import * as hospitalsApi from '@/lib/api/hospitals'
import { date, money, moneyCompact, relative } from '@/lib/format'
import PageHeader from '@/components/ui/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'
import ClaimStatusBadge from '@/components/ClaimStatusBadge.vue'
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorState from '@/components/ui/ErrorState.vue'

const auth = useAuthStore()
const { data, loading, error, refresh } = useAsync(() =>
  hospitalsApi.getDashboard(auth.orgId!),
)
</script>

<template>
  <div>
    <PageHeader
      :title="auth.user?.orgName ?? 'Provider dashboard'"
      :subtitle="`Claim and payment position for this ${auth.orgLabel.toLowerCase()}, across every insurer you bill.`"
    >
      <template #actions>
        <RouterLink to="/hospital/records/new" class="btn-primary">New medical record</RouterLink>
      </template>
    </PageHeader>

    <ErrorState v-if="error" :message="error" class="mb-6" @retry="refresh" />

    <section class="mb-3">
      <h2 class="label mb-3">Claims</h2>
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Submitted"
          :value="data?.claims.submitted ?? null"
          hint="All time"
          :loading="loading"
          to="/hospital/claims"
        />
        <StatCard
          label="Pending"
          :value="data?.claims.pending ?? null"
          tone="attention"
          hint="Awaiting verification or assessor"
          :loading="loading"
          to="/hospital/claims"
        />
        <StatCard
          label="Approved"
          :value="data?.claims.approved ?? null"
          tone="positive"
          :loading="loading"
          to="/hospital/claims"
        />
        <StatCard
          label="Rejected"
          :value="data?.claims.rejected ?? null"
          :tone="data?.claims.rejected ? 'negative' : 'neutral'"
          :loading="loading"
          to="/hospital/claims"
        />
      </div>
    </section>

    <section class="mb-6">
      <h2 class="label mb-3">Payments</h2>
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Payments pending"
          :value="data?.payments.pending ?? null"
          tone="attention"
          :hint="data ? `${moneyCompact(data.payments.pendingAmount)} outstanding` : undefined"
          :loading="loading"
          to="/hospital/payments"
        />
        <StatCard
          label="Payments received"
          :value="data?.payments.received ?? null"
          tone="chain"
          :hint="data ? `${moneyCompact(data.payments.receivedAmount)} settled` : undefined"
          :loading="loading"
          to="/hospital/payments"
        />
        <StatCard
          label="Outstanding value"
          :value="data ? money(data.payments.pendingAmount) : null"
          :loading="loading"
        />
        <StatCard
          label="Patients"
          :value="data?.patientCount ?? null"
          hint="Treated at this provider"
          :loading="loading"
          to="/hospital/patients"
        />
      </div>
    </section>

    <div class="grid gap-5 lg:grid-cols-2">
      <section class="surface overflow-hidden">
        <header class="flex items-center justify-between border-b border-ink-700/70 px-5 py-3.5">
          <h2 class="text-sm font-semibold tracking-tight text-mist-100">Recent claim activity</h2>
          <RouterLink to="/hospital/claims" class="text-xs text-mist-500 hover:text-gonka-400">
            View all →
          </RouterLink>
        </header>

        <div v-if="loading" class="space-y-3 p-5">
          <SkeletonBlock v-for="n in 4" :key="n" height="h-12" />
        </div>

        <EmptyState v-else-if="!data?.recentClaims.length" title="No claims raised yet" icon="◇" />

        <ul v-else class="divide-y divide-ink-800/80">
          <li v-for="claim in data.recentClaims" :key="claim.id">
            <RouterLink
              :to="`/hospital/claims/${claim.id}`"
              class="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-ink-800/60"
            >
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-mist-100">{{ claim.patientName }}</p>
                <p class="mt-0.5 truncate text-xs text-mist-500">
                  {{ claim.claimNumber }} · {{ claim.diagnosis }} · {{ relative(claim.updatedAt) }}
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

      <section class="surface overflow-hidden">
        <header class="flex items-center justify-between border-b border-ink-700/70 px-5 py-3.5">
          <h2 class="text-sm font-semibold tracking-tight text-mist-100">Recently filed records</h2>
          <RouterLink to="/hospital/records" class="text-xs text-mist-500 hover:text-gonka-400">
            View all →
          </RouterLink>
        </header>

        <div v-if="loading" class="space-y-3 p-5">
          <SkeletonBlock v-for="n in 4" :key="n" height="h-12" />
        </div>

        <EmptyState v-else-if="!data?.recentRecords.length" title="No records filed yet" icon="⛁">
          <RouterLink to="/hospital/records/new" class="btn-primary">File a record</RouterLink>
        </EmptyState>

        <ul v-else class="divide-y divide-ink-800/80">
          <li v-for="record in data.recentRecords" :key="record.id">
            <RouterLink
              :to="`/hospital/records/${record.id}`"
              class="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-ink-800/60"
            >
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-mist-100">{{ record.patientName }}</p>
                <p class="mt-0.5 truncate text-xs text-mist-500">
                  {{ record.diagnosis }} · {{ date(record.visitDate) }}
                </p>
              </div>
              <div class="flex shrink-0 items-center gap-3">
                <span class="tnum text-sm text-mist-300">{{ money(record.totalCost) }}</span>
                <span
                  v-if="!record.claimId"
                  class="rounded border border-amber-500/35 bg-amber-500/10 px-1.5 py-0.5 text-2xs text-amber-300"
                >
                  No claim
                </span>
              </div>
            </RouterLink>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
