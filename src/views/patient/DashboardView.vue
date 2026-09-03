<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useAsync } from '@/lib/useAsync'
import * as patientsApi from '@/lib/api/patients'
import { date, money, relative } from '@/lib/format'
import PageHeader from '@/components/ui/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'
import ClaimStatusBadge from '@/components/ClaimStatusBadge.vue'
import PaymentStatusBadge from '@/components/PaymentStatusBadge.vue'
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorState from '@/components/ui/ErrorState.vue'

const auth = useAuthStore()
const patientId = auth.patientId!

const { data, loading, error, refresh } = useAsync(async () => {
  const [me, policies, claims, records, payments] = await Promise.all([
    patientsApi.getMe(patientId),
    patientsApi.getMyPolicies(patientId),
    patientsApi.getMyClaims(patientId),
    patientsApi.getMyRecords(patientId),
    patientsApi.getMyPayments(patientId),
  ])
  return {
    me,
    policy: policies.data[0] ?? null,
    claims: claims.data,
    records: records.data.slice(0, 4),
    payments: payments.data.slice(0, 4),
  }
})

/** Patient buckets are a view filter over the shared ClaimStatus, not a new enum. */
const stats = computed(() => {
  const rows = data.value?.claims ?? []
  return {
    total: rows.length,
    pending: rows.filter((c) =>
      ['created', 'submitted', 'verified', 'pending_review'].includes(c.status),
    ).length,
    approved: rows.filter((c) =>
      ['auto_approved', 'approved', 'paid', 'closed'].includes(c.status),
    ).length,
    rejected: rows.filter((c) => c.status === 'rejected').length,
  }
})

const recentClaims = computed(() => (data.value?.claims ?? []).slice(0, 4))
</script>

<template>
  <div>
    <PageHeader
      :title="`Welcome back, ${data?.me.name.split(' ')[0] ?? '—'}`"
      subtitle="Your cover, your claims, and the reasoning behind every decision made about them."
    />

    <ErrorState v-if="error" :message="error" class="mb-6" @retry="refresh" />

    <!-- Active cover -->
    <section class="mb-6">
      <h2 class="label mb-3">Active insurance</h2>

      <div v-if="loading" class="surface p-5"><SkeletonBlock :lines="3" /></div>

      <div
        v-else-if="data?.policy"
        class="surface relative overflow-hidden p-5 sm:p-6"
      >
        <div
          class="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full"
          style="background: radial-gradient(circle, rgba(34, 201, 166, 0.1), transparent 68%)"
          aria-hidden="true"
        />
        <div class="relative flex flex-wrap items-start justify-between gap-5">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <p class="text-lg font-semibold tracking-tight text-mist-100">
                {{ data.policy.insurerName }}
              </p>
              <span
                class="rounded-md border border-emerald-500/35 bg-emerald-500/12 px-2 py-0.5 text-2xs font-medium capitalize text-emerald-300"
              >
                {{ data.policy.status }}
              </span>
            </div>
            <p class="mt-1 text-sm text-mist-400">{{ data.policy.coverageType }}</p>
            <p class="tnum mt-3 font-mono text-sm text-mist-300">{{ data.policy.policyNumber }}</p>
          </div>

          <dl class="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3">
            <div>
              <dt class="label">Annual limit</dt>
              <dd class="tnum mt-1 text-sm font-medium text-mist-100">
                {{ money(data.policy.coverageLimit) }}
              </dd>
            </div>
            <div>
              <dt class="label">Deductible</dt>
              <dd class="tnum mt-1 text-sm font-medium text-mist-100">
                {{ money(data.policy.deductible) }}
              </dd>
            </div>
            <div>
              <dt class="label">Renews</dt>
              <dd class="mt-1 text-sm font-medium text-mist-100">{{ date(data.policy.endDate) }}</dd>
            </div>
          </dl>
        </div>
      </div>

      <EmptyState
        v-else
        class="surface"
        title="No active policy"
        body="You have no cover on file. Contact your insurer to activate a policy."
      />
    </section>

    <!-- Claim buckets -->
    <section class="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Total claims" :value="stats.total" :loading="loading" to="/patient/claims" />
      <StatCard
        label="Pending"
        :value="stats.pending"
        tone="attention"
        hint="Awaiting verification or an assessor"
        :loading="loading"
        to="/patient/claims"
      />
      <StatCard
        label="Approved"
        :value="stats.approved"
        tone="positive"
        :loading="loading"
        to="/patient/claims"
      />
      <StatCard
        label="Rejected"
        :value="stats.rejected"
        :tone="stats.rejected ? 'negative' : 'neutral'"
        :loading="loading"
        to="/patient/claims"
      />
    </section>

    <div class="grid gap-5 lg:grid-cols-2">
      <!-- Recent claims -->
      <section class="surface overflow-hidden">
        <header class="flex items-center justify-between border-b border-ink-700/70 px-5 py-3.5">
          <h2 class="text-sm font-semibold tracking-tight text-mist-100">Recent claims</h2>
          <RouterLink to="/patient/claims" class="text-xs text-mist-500 hover:text-gonka-400">
            View all →
          </RouterLink>
        </header>

        <div v-if="loading" class="space-y-3 p-5">
          <SkeletonBlock v-for="n in 3" :key="n" height="h-12" />
        </div>

        <EmptyState v-else-if="!recentClaims.length" title="No claims yet" icon="◇" />

        <ul v-else class="divide-y divide-ink-800/80">
          <li v-for="claim in recentClaims" :key="claim.id">
            <RouterLink
              :to="`/patient/claims/${claim.id}`"
              class="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-ink-800/60"
            >
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-mist-100">{{ claim.diagnosis }}</p>
                <p class="mt-0.5 truncate text-xs text-mist-500">
                  {{ claim.claimNumber }} · {{ claim.hospitalName }}
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

      <!-- Recent records -->
      <section class="surface overflow-hidden">
        <header class="flex items-center justify-between border-b border-ink-700/70 px-5 py-3.5">
          <h2 class="text-sm font-semibold tracking-tight text-mist-100">Recent medical records</h2>
          <RouterLink to="/patient/records" class="text-xs text-mist-500 hover:text-gonka-400">
            View all →
          </RouterLink>
        </header>

        <div v-if="loading" class="space-y-3 p-5">
          <SkeletonBlock v-for="n in 3" :key="n" height="h-12" />
        </div>

        <EmptyState v-else-if="!data?.records.length" title="No records yet" icon="⛁" />

        <ul v-else class="divide-y divide-ink-800/80">
          <li v-for="record in data.records" :key="record.id">
            <RouterLink
              :to="`/patient/records/${record.id}`"
              class="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-ink-800/60"
            >
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-mist-100">{{ record.diagnosis }}</p>
                <p class="mt-0.5 truncate text-xs text-mist-500">
                  {{ record.hospitalName }} · {{ record.department }}
                </p>
              </div>
              <span class="shrink-0 text-xs text-mist-500">{{ date(record.visitDate) }}</span>
            </RouterLink>
          </li>
        </ul>
      </section>

      <!-- Recent payments -->
      <section class="surface overflow-hidden lg:col-span-2">
        <header class="flex items-center justify-between border-b border-ink-700/70 px-5 py-3.5">
          <h2 class="text-sm font-semibold tracking-tight text-mist-100">Recent payments</h2>
          <RouterLink to="/patient/payments" class="text-xs text-mist-500 hover:text-gonka-400">
            View all →
          </RouterLink>
        </header>

        <div v-if="loading" class="space-y-3 p-5">
          <SkeletonBlock v-for="n in 2" :key="n" height="h-12" />
        </div>

        <EmptyState
          v-else-if="!data?.payments.length"
          title="No payments yet"
          body="Settlements to your providers will appear here once a claim is approved."
          icon="⇄"
        />

        <ul v-else class="divide-y divide-ink-800/80">
          <li v-for="payment in data.payments" :key="payment.id">
            <RouterLink
              :to="`/patient/payments/${payment.id}`"
              class="flex flex-wrap items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-ink-800/60"
            >
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-mist-100">
                  Paid to {{ payment.payeeName }}
                </p>
                <p class="mt-0.5 truncate text-xs text-mist-500">
                  {{ payment.paymentReference }} · {{ relative(payment.createdAt) }}
                </p>
              </div>
              <div class="flex shrink-0 items-center gap-3">
                <span class="tnum text-sm text-mist-300">{{ money(payment.amount) }}</span>
                <PaymentStatusBadge :status="payment.status" size="sm" />
              </div>
            </RouterLink>
          </li>
        </ul>
      </section>
    </div>

    <!-- Actions -->
    <section class="mt-6 flex flex-wrap gap-2">
      <RouterLink to="/patient/claims" class="btn-primary">View all claims</RouterLink>
      <RouterLink to="/patient/records" class="btn-ghost">Browse medical records</RouterLink>
      <a
        v-if="data?.records[0]"
        :href="`mailto:claims@example.test?subject=Query about ${data.records[0].recordNumber}`"
        class="btn-ghost"
      >
        Contact {{ data.records[0].hospitalName }}
      </a>
    </section>
  </div>
</template>
