<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import type { Policy } from '@/lib/types'
import { useAuthStore } from '@/stores/auth'
import { useAction, useAsync } from '@/lib/useAsync'
import * as hospitalsApi from '@/lib/api/hospitals'
import * as verificationApi from '@/lib/api/verification'
import * as blockchainApi from '@/lib/api/blockchain'
import * as paymentsApi from '@/lib/api/payments'
import { date, money } from '@/lib/format'
import PageHeader from '@/components/ui/PageHeader.vue'
import ClaimStatusBadge from '@/components/ClaimStatusBadge.vue'
import TruthScorePanel from '@/components/TruthScorePanel.vue'
import ClaimLifecycleTimeline from '@/components/ClaimLifecycleTimeline.vue'
import BlockchainRefLink from '@/components/BlockchainRefLink.vue'
import DetailList from '@/components/ui/DetailList.vue'
import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
import ErrorState from '@/components/ui/ErrorState.vue'

const route = useRoute()
const auth = useAuthStore()
const claimId = route.params.claimId as string

const { data, loading, error, refresh } = useAsync(async () => {
  const claim = await hospitalsApi.getClaimById(auth.orgId!, claimId)
  const [verification, attestation, payment, patient] = await Promise.all([
    verificationApi.getVerification(claimId),
    blockchainApi.getClaimTransaction(claimId),
    claim.paymentId ? paymentsApi.getPaymentById(claim.paymentId) : Promise.resolve(null),
    hospitalsApi.getPatientById(auth.orgId!, claim.patientId),
  ])
  // Read-only policy context: the provider sees the thresholds their claim is judged by.
  const policy = patient.policies.find((p) => p.id === claim.policyId) ?? null
  return { claim, verification, attestation, payment, policy }
})

const policy = computed<Policy | null>(() => data.value?.policy ?? null)

const facts = computed(() => {
  const claim = data.value?.claim
  if (!claim) return []
  return [
    { label: 'Claim number', value: claim.claimNumber, mono: true },
    { label: 'Patient', value: claim.patientName },
    { label: 'Insurer', value: claim.insurerName },
    { label: 'Policy', value: claim.policyNumber, mono: true },
    { label: 'Diagnosis', value: claim.diagnosis },
    { label: 'Submitted', value: date(claim.submittedAt) },
  ]
})

/* A draft can still be submitted from here; verification then runs on the insurer side. */
const submitting = ref(false)
const submitDraft = useAction(async () => {
  submitting.value = true
  try {
    await hospitalsApi.submitClaim(auth.orgId!, auth.user!.name, claimId)
    await verificationApi.verifyClaim(claimId)
    await refresh()
  } finally {
    submitting.value = false
  }
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
        :title="data.claim.claimNumber"
        :subtitle="`${data.claim.patientName} · ${data.claim.treatmentDescription}`"
        :back="{ to: '/hospital/claims', label: 'All claims' }"
      >
        <template #actions>
          <ClaimStatusBadge :status="data.claim.status" />
        </template>
      </PageHeader>

      <!-- A draft is the provider's own to-do; make the next action obvious. -->
      <div
        v-if="data.claim.status === 'created'"
        class="surface mb-5 flex flex-wrap items-center justify-between gap-4 border-l-2 border-l-amber-500 p-4"
      >
        <div>
          <p class="text-sm font-medium text-mist-100">This claim is still a draft</p>
          <p class="mt-0.5 text-sm text-mist-500">
            It has not been sent to {{ data.claim.insurerName }} and has not been verified.
          </p>
        </div>
        <button
          type="button"
          class="btn-primary"
          :disabled="submitting"
          @click="submitDraft.run()"
        >
          {{ submitting ? 'Submitting and verifying…' : 'Submit and verify' }}
        </button>
      </div>

      <p v-if="submitDraft.error.value" class="mb-4 text-sm text-rose-300">
        {{ submitDraft.error.value }}
      </p>

      <section class="surface mb-5 p-5">
        <div class="flex flex-wrap items-end gap-x-10 gap-y-5">
          <div>
            <p class="label">Amount claimed</p>
            <p class="tnum mt-1 text-2xl font-semibold tracking-tight text-mist-100">
              {{ money(data.claim.amountRequested) }}
            </p>
          </div>
          <div>
            <p class="label">Approved</p>
            <p
              class="tnum mt-1 text-2xl font-semibold tracking-tight"
              :class="data.claim.amountApproved === null ? 'text-mist-500' : 'text-emerald-300'"
            >
              {{ data.claim.amountApproved === null ? 'Pending' : money(data.claim.amountApproved) }}
            </p>
          </div>
          <div v-if="policy">
            <p class="label">Auto-approve limit</p>
            <p class="tnum mt-1 text-2xl font-semibold tracking-tight text-mist-400">
              {{ money(policy.autoApproveLimit) }}
            </p>
          </div>
          <div v-if="policy">
            <p class="label">Score threshold</p>
            <p class="tnum mt-1 text-2xl font-semibold tracking-tight text-gonka-400">
              {{ policy.truthScoreThreshold }}
            </p>
          </div>
        </div>

        <div class="mt-5 border-t border-ink-700/70 pt-4">
          <DetailList :items="facts" :columns="3" />
        </div>
      </section>

      <div class="mb-5">
        <TruthScorePanel
          :verification="data.verification"
          :threshold="policy?.truthScoreThreshold"
        />
      </div>

      <!-- The insurer's reasoning is withheld until the claim is finalised. -->
      <section v-if="data.claim.decision" class="surface mb-5 p-5">
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-sm font-semibold tracking-tight text-mist-100">Insurer's decision</h2>
          <span class="text-2xs text-mist-500">
            {{ data.claim.decision.reviewerName }} · {{ date(data.claim.decision.decidedAt) }}
          </span>
        </div>
        <p class="mt-3 text-sm leading-relaxed text-mist-300">{{ data.claim.decision.reason }}</p>
      </section>

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
            :to="`/hospital/payments/${data.payment.id}`"
            class="surface block p-4 transition-colors hover:border-ink-600 hover:bg-ink-800/70"
          >
            <p class="label">Payment due to you</p>
            <p class="tnum mt-1.5 text-lg font-semibold text-mist-100">
              {{ money(data.payment.amount) }}
            </p>
            <p class="mt-1 text-xs text-mist-500">
              {{ data.payment.paymentReference }} · {{ data.payment.status }} · view settlement →
            </p>
          </RouterLink>

          <RouterLink
            :to="`/hospital/records/${data.claim.recordId}`"
            class="surface block p-4 transition-colors hover:border-ink-600 hover:bg-ink-800/70"
          >
            <p class="label">Source medical record</p>
            <p class="mt-1.5 text-sm text-mist-200">{{ data.claim.diagnosis }}</p>
            <p class="mt-1 text-xs text-mist-500">Open the record and its attachments →</p>
          </RouterLink>
        </div>
      </div>
    </template>
  </div>
</template>
