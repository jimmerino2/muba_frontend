<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useAsync } from '@/lib/useAsync'
import { useVerificationRun } from '@/lib/useVerificationRun'
import * as insuranceApi from '@/lib/api/insurance'
import * as verificationApi from '@/lib/api/verification'
import * as blockchainApi from '@/lib/api/blockchain'
import * as paymentsApi from '@/lib/api/payments'
import { date, money } from '@/lib/format'
import PageHeader from '@/components/ui/PageHeader.vue'
import ClaimStatusBadge from '@/components/ClaimStatusBadge.vue'
import ClaimFinancialSummary from '@/components/ClaimFinancialSummary.vue'
import TruthScorePanel from '@/components/TruthScorePanel.vue'
import VerificationSteps from '@/components/VerificationSteps.vue'
import RoutingOutcomeCard from '@/components/RoutingOutcomeCard.vue'
import ClaimLifecycleTimeline from '@/components/ClaimLifecycleTimeline.vue'
import BlockchainRefLink from '@/components/BlockchainRefLink.vue'
import DetailList from '@/components/ui/DetailList.vue'
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
import ErrorState from '@/components/ui/ErrorState.vue'

const route = useRoute()
const auth = useAuthStore()
const claimId = route.params.claimId as string

const { data, loading, error, refresh } = useAsync(async () => {
  const detail = await insuranceApi.getClaimById(auth.orgId!, claimId)
  const [verification, attestation, payment] = await Promise.all([
    verificationApi.getVerification(claimId),
    blockchainApi.getClaimTransaction(claimId),
    detail.claim.paymentId
      ? paymentsApi.getPaymentById(detail.claim.paymentId)
      : Promise.resolve(null),
  ])
  return { ...detail, verification, attestation, payment }
})

const verify = useVerificationRun()

async function runVerification() {
  const outcome = await verify.run(claimId)
  if (outcome) await refresh()
}

const claimFacts = computed(() => {
  const claim = data.value?.claim
  if (!claim) return []
  return [
    { label: 'Claim number', value: claim.claimNumber, mono: true },
    { label: 'Provider', value: claim.hospitalName },
    { label: 'Diagnosis', value: claim.diagnosis },
    { label: 'Submitted', value: date(claim.submittedAt) },
    { label: 'Last updated', value: date(claim.updatedAt) },
    { label: 'Treatment', value: claim.treatmentDescription },
  ]
})

const policyFacts = computed(() => {
  const p = data.value?.policy
  if (!p) return []
  return [
    { label: 'Policy number', value: p.policyNumber, mono: true },
    { label: 'Coverage type', value: p.coverageType },
    { label: 'Annual limit', value: money(p.coverageLimit) },
    { label: 'Auto-approve limit', value: money(p.autoApproveLimit) },
    { label: 'Score threshold', value: String(p.truthScoreThreshold) },
    { label: 'Deductible', value: money(p.deductible) },
  ]
})

const patientFacts = computed(() => {
  const p = data.value?.patient
  if (!p) return []
  return [
    { label: 'Name', value: p.name },
    { label: 'National ID', value: p.nationalId, mono: true },
    { label: 'Date of birth', value: date(p.dateOfBirth) },
    { label: 'Blood type', value: p.bloodType },
    { label: 'Phone', value: p.phone, mono: true },
    { label: 'Email', value: p.email },
  ]
})

const decidable = computed(
  () => data.value?.claim.status === 'pending_review' || data.value?.claim.status === 'verified',
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
        :title="data.claim.claimNumber"
        :subtitle="`${data.claim.patientName} · ${data.claim.diagnosis} · ${data.claim.hospitalName}`"
        :back="{ to: '/insurance/claims', label: 'All claims' }"
      >
        <template #actions>
          <ClaimStatusBadge :status="data.claim.status" />
          <RouterLink
            v-if="decidable"
            :to="`/insurance/review/${data.claim.id}`"
            class="btn-primary"
          >
            Decide this claim
          </RouterLink>
        </template>
      </PageHeader>

      <!-- Unverified claims are the insurer's own action: run the router. -->
      <div
        v-if="data.claim.status === 'submitted' && !verify.running.value"
        class="surface mb-5 flex flex-wrap items-center justify-between gap-4 border-l-2 border-l-gonka-600 p-4"
      >
        <div>
          <p class="text-sm font-medium text-mist-100">Awaiting verification</p>
          <p class="mt-0.5 text-sm text-mist-500">
            This claim has not been through the Gonka Router. Run it to get a Truth Score and a
            routing decision.
          </p>
        </div>
        <button type="button" class="btn-primary" @click="runVerification">
          Run verification
        </button>
      </div>

      <VerificationSteps
        v-if="verify.running.value"
        :step-index="verify.stepIndex.value"
        class="mb-5"
      />

      <RoutingOutcomeCard
        v-else-if="verify.outcome.value"
        :outcome="verify.outcome.value"
        :claim-number="data.claim.claimNumber"
        :amount-requested="data.claim.amountRequested"
        class="mb-5"
      />

      <p v-if="verify.error.value" class="mb-5 text-sm text-rose-300">{{ verify.error.value }}</p>

      <ClaimFinancialSummary :claim="data.claim" show-line-items class="mb-5" />

      <div class="mb-5">
        <TruthScorePanel
          :verification="data.verification"
          :threshold="data.policy.truthScoreThreshold"
        />
      </div>

      <section v-if="data.claim.decisionExplanation" class="surface mb-5 p-5">
        <h2 class="mb-3 text-sm font-semibold tracking-tight text-mist-100">Final decision</h2>
        <p class="whitespace-pre-line text-sm leading-relaxed text-mist-300">
          {{ data.claim.decisionExplanation }}
        </p>
      </section>

      <section v-if="data.claim.decision" class="surface mb-5 p-5">
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-sm font-semibold tracking-tight text-mist-100">Decision on record</h2>
          <span class="text-2xs text-mist-500">
            {{ data.claim.decision.reviewerName }} · {{ date(data.claim.decision.decidedAt) }}
          </span>
        </div>
        <p class="mt-3 text-sm leading-relaxed text-mist-300">{{ data.claim.decision.reason }}</p>
      </section>

      <div class="mb-5 grid gap-5 lg:grid-cols-3">
        <section class="surface p-5">
          <h2 class="mb-4 text-sm font-semibold tracking-tight text-mist-100">Claim</h2>
          <DetailList :items="claimFacts" />
        </section>
        <section class="surface p-5">
          <h2 class="mb-4 text-sm font-semibold tracking-tight text-mist-100">Policy</h2>
          <DetailList :items="policyFacts" />
        </section>
        <section class="surface p-5">
          <h2 class="mb-4 text-sm font-semibold tracking-tight text-mist-100">Patient</h2>
          <DetailList :items="patientFacts" />
        </section>
      </div>

      <div class="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <ClaimLifecycleTimeline
          :events="data.claim.timeline"
          :current-status="data.claim.status"
        />

        <div class="space-y-5">
          <BlockchainRefLink
            :reference="data.attestation"
            empty-label="No attestation on chain — this claim has not been verified yet."
          />

          <RouterLink
            v-if="data.payment"
            :to="`/insurance/payments/${data.payment.id}`"
            class="surface block p-4 transition-colors hover:border-ink-600 hover:bg-ink-800/70"
          >
            <p class="label">Settlement</p>
            <p class="tnum mt-1.5 text-lg font-semibold text-mist-100">
              {{ money(data.payment.amount) }}
            </p>
            <p class="mt-1 text-xs text-mist-500">
              {{ data.payment.paymentReference }} · {{ data.payment.status }} · manage payout →
            </p>
          </RouterLink>
        </div>
      </div>
    </template>
  </div>
</template>
