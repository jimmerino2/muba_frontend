<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useAsync } from '@/lib/useAsync'
import * as patientsApi from '@/lib/api/patients'
import * as verificationApi from '@/lib/api/verification'
import * as blockchainApi from '@/lib/api/blockchain'
import * as paymentsApi from '@/lib/api/payments'
import { claimStatusLabel, date, money } from '@/lib/format'
import PageHeader from '@/components/ui/PageHeader.vue'
import ClaimStatusBadge from '@/components/ClaimStatusBadge.vue'
import ClaimFinancialSummary from '@/components/ClaimFinancialSummary.vue'
import TruthScorePanel from '@/components/TruthScorePanel.vue'
import ModelComparisonPanel from '@/components/ModelComparisonPanel.vue'
import CoverageRemaining from '@/components/CoverageRemaining.vue'
import ClaimLifecycleTimeline from '@/components/ClaimLifecycleTimeline.vue'
import BlockchainRefLink from '@/components/BlockchainRefLink.vue'
import DetailList from '@/components/ui/DetailList.vue'
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
import ErrorState from '@/components/ui/ErrorState.vue'

const route = useRoute()
const auth = useAuthStore()
const claimId = route.params.claimId as string

const { data, loading, error, refresh } = useAsync(async () => {
  const claim = await patientsApi.getMyClaimById(auth.patientId!, claimId)
  const [verification, attestation, policies, claims, payment] = await Promise.all([
    verificationApi.getVerification(claimId),
    blockchainApi.getClaimTransaction(claimId),
    patientsApi.getMyPolicies(auth.patientId!),
    patientsApi.getMyClaims(auth.patientId!),
    claim.paymentId ? paymentsApi.getPaymentById(claim.paymentId) : Promise.resolve(null),
  ])
  const policy = policies.data.find((p) => p.id === claim.policyId) ?? null
  const usedOnPolicy = claims.data
    .filter((c) => c.policyId === claim.policyId)
    .reduce((sum, c) => sum + (c.amountApproved ?? 0), 0)
  return { claim, verification, attestation, payment, policy, usedOnPolicy }
})

// Secondary detail (full fact list, insurer's written decision, lifecycle
// timeline, on-chain refs, linked record/payment) stays one tap away —
// what a patient needs at a glance is what was claimed and what their policy
// still supports, not the full audit trail.
const showDetails = ref(false)

const facts = computed(() => {
  const claim = data.value?.claim
  if (!claim) return []
  return [
    { label: 'Claim number', value: claim.claimNumber, mono: true },
    { label: 'Policy', value: claim.policyNumber, mono: true },
    { label: 'Insurer', value: claim.insurerName },
    { label: 'Provider', value: claim.hospitalName },
    { label: 'Diagnosis', value: claim.diagnosis },
    { label: 'Submitted', value: date(claim.submittedAt) },
  ]
})

/** Patient-facing explanation of what happens next, in the patient's own terms. */
const nextStep = computed(() => {
  const claim = data.value?.claim
  if (!claim) return null
  switch (claim.status) {
    case 'created':
      return 'Your provider has drafted this claim but has not submitted it to your insurer yet.'
    case 'submitted':
      return 'Your insurer has received this claim. It is queued for an automated plausibility check.'
    case 'verified':
      return 'The plausibility check is complete. Your insurer is applying its policy rules to decide whether a human assessor needs to look at it.'
    case 'pending_review':
      return 'A human assessor at your insurer is reviewing this claim. You will see their decision and their reasoning here once it is made.'
    case 'auto_approved':
    case 'approved':
      return 'This claim has been approved. Your insurer will settle the approved amount directly with your provider.'
    case 'rejected':
      return 'This claim was not approved. The full reasoning is shown below — you can ask your provider to resubmit if new evidence is available.'
    case 'paid':
      return 'Your insurer has paid your provider. Nothing further is needed from you.'
    case 'closed':
      return 'This claim is fully settled and closed.'
  }
})
</script>

<template>
  <div>
    <ErrorState v-if="error" :message="error" @retry="refresh" />

    <div v-else-if="loading" class="space-y-5">
      <SkeletonBlock height="h-10" />
      <SkeletonBlock :lines="4" />
      <div class="surface p-5"><SkeletonBlock :lines="5" /></div>
    </div>

    <template v-else-if="data">
      <PageHeader
        :title="data.claim.diagnosis"
        :subtitle="data.claim.treatmentDescription"
        :back="{ to: '/patient/claims', label: 'All claims' }"
      >
        <template #actions>
          <ClaimStatusBadge :status="data.claim.status" />
        </template>
      </PageHeader>

      <!-- What this means for you, right now -->
      <div
        v-if="nextStep"
        class="surface mb-5 flex items-start gap-3 border-l-2 border-l-brand-600 p-4"
      >
        <span class="mt-0.5 text-brand-400" aria-hidden="true">◈</span>
        <div>
          <p class="text-xs font-medium uppercase tracking-wider text-mist-500">
            Status · {{ claimStatusLabel(data.claim.status) }}
          </p>
          <p class="mt-1 text-sm leading-relaxed text-mist-200">{{ nextStep }}</p>
        </div>
      </div>

      <!-- What was claimed, what's outstanding, and what's left on the policy
           — the numbers a patient actually needs, always visible rather than
           tucked behind "show full details" below. -->
      <ClaimFinancialSummary :claim="data.claim" class="mb-5" />

      <section v-if="data.policy" class="surface mb-5 p-5">
        <CoverageRemaining :used="data.usedOnPolicy" :limit="data.policy.coverageLimit" />
      </section>

      <!--
        Verification is never separated from the decision it informed — score,
        verdict, reasoning trace and Gonka Request ID always show here. `compact`
        only drops the technical per-factor weight breakdown, which a patient
        has no use for and which otherwise makes this the densest section on
        the page.
      -->
      <div class="mb-5 space-y-5">
        <TruthScorePanel
          :verification="data.verification"
          :threshold="data.policy?.truthScoreThreshold"
          compact
        />
        <ModelComparisonPanel :verification="data.verification" />
      </div>

      <!--
        The on-chain proof of that verification stays with it, always visible
        — this is a separate transaction from the payment settlement (which
        has its own such panel on the payment's own page), not a detail to
        bury behind a toggle.
      -->
      <div class="mb-5">
        <BlockchainRefLink
          :reference="data.attestation"
          empty-label="No verification recorded on chain yet — this claim has not been verified, or has no wallet to attest against."
        />
      </div>

      <!-- Everything else — the full fact list, the insurer's written decision,
           the lifecycle timeline, linked record/payment — stays one tap away
           instead of front and centre. -->
      <button
        type="button"
        class="mb-5 flex w-full items-center justify-between rounded-lg border border-ink-700 bg-ink-900/40 px-4 py-3 text-left transition-colors hover:border-ink-600 hover:bg-ink-850/60"
        :aria-expanded="showDetails"
        @click="showDetails = !showDetails"
      >
        <span class="text-sm font-medium text-mist-200">
          {{ showDetails ? 'Hide full details' : 'Show full details' }}
        </span>
        <span class="text-mist-500" :class="{ 'rotate-180': showDetails }" aria-hidden="true">⌄</span>
      </button>

      <template v-if="showDetails">
        <section class="surface mb-5 p-5">
          <h2 class="mb-3 text-sm font-semibold tracking-tight text-mist-100">Claim details</h2>
          <DetailList :items="facts" :columns="3" />
        </section>

        <ClaimFinancialSummary v-if="data.claim.lineItems.length > 1" :claim="data.claim" show-line-items class="mb-5" />

        <section v-if="data.claim.decisionExplanation" class="surface mb-5 p-5">
          <h2 class="mb-3 text-sm font-semibold tracking-tight text-mist-100">Why this decision was made</h2>
          <p class="whitespace-pre-line text-sm leading-relaxed text-mist-300">
            {{ data.claim.decisionExplanation }}
          </p>
        </section>

        <section v-if="data.claim.decision" class="surface mb-5 p-5">
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-sm font-semibold tracking-tight text-mist-100">Insurer's decision</h2>
            <span
              class="rounded-md border px-2 py-1 text-xs font-medium capitalize"
              :class="
                data.claim.decision.outcome === 'approved'
                  ? 'border-emerald-500/35 bg-emerald-500/12 text-emerald-300'
                  : data.claim.decision.outcome === 'rejected'
                    ? 'border-rose-500/35 bg-rose-500/12 text-rose-300'
                    : 'border-amber-500/35 bg-amber-500/12 text-amber-300'
              "
            >
              {{ data.claim.decision.outcome.replace(/_/g, ' ') }}
            </span>
          </div>
          <p class="mt-3 text-sm leading-relaxed text-mist-300">{{ data.claim.decision.reason }}</p>
          <p class="mt-3 text-2xs text-mist-500">
            Decided by {{ data.claim.decision.reviewerName }} ·
            {{ date(data.claim.decision.decidedAt) }}
          </p>
        </section>

        <div class="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
          <ClaimLifecycleTimeline
            :events="data.claim.timeline"
            :current-status="data.claim.status"
          />

          <div class="space-y-5">
            <RouterLink
              v-if="data.payment"
              :to="`/patient/payments/${data.payment.id}`"
              class="surface block p-4 transition-colors hover:border-ink-600 hover:bg-ink-800/70"
            >
              <p class="label">Linked payment</p>
              <p class="mt-1.5 font-mono text-sm text-mist-200">
                {{ data.payment.paymentReference }}
              </p>
              <p class="mt-1 text-xs text-mist-500">
                {{ money(data.payment.amount) }} to {{ data.payment.payeeName }} · view settlement →
              </p>
            </RouterLink>

            <RouterLink
              :to="`/patient/records/${data.claim.recordId}`"
              class="surface block p-4 transition-colors hover:border-ink-600 hover:bg-ink-800/70"
            >
              <p class="label">Source medical record</p>
              <p class="mt-1.5 text-sm text-mist-200">{{ data.claim.diagnosis }}</p>
              <p class="mt-1 text-xs text-mist-500">
                View the record this claim was raised from →
              </p>
            </RouterLink>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>
