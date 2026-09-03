<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useAction, useAsync } from '@/lib/useAsync'
import * as insuranceApi from '@/lib/api/insurance'
import * as verificationApi from '@/lib/api/verification'
import * as blockchainApi from '@/lib/api/blockchain'
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
const router = useRouter()
const auth = useAuthStore()
const claimId = route.params.claimId as string

const { data, loading, error, refresh } = useAsync(async () => {
  const detail = await insuranceApi.getClaimById(auth.orgId!, claimId)
  const [verification, attestation] = await Promise.all([
    verificationApi.getVerification(claimId),
    blockchainApi.getClaimTransaction(claimId),
  ])
  return { ...detail, verification, attestation }
})

type Outcome = 'approve' | 'reject' | 'more_info'
const outcome = ref<Outcome>('approve')
const reason = ref('')
const approvedAmount = ref<number>(0)

/** Default the payable amount to claimed-less-deductible, which the assessor can override. */
watch(data, (next) => {
  if (next && !approvedAmount.value) {
    approvedAmount.value = Math.max(0, next.claim.amountRequested - next.policy.deductible)
  }
})

const decidable = computed(
  () => data.value?.claim.status === 'pending_review' || data.value?.claim.status === 'verified',
)

const canSubmit = computed(() => {
  if (!decidable.value || !reason.value.trim()) return false
  if (outcome.value !== 'approve') return true
  const amount = Number(approvedAmount.value)
  return amount >= 0 && amount <= (data.value?.claim.amountRequested ?? 0)
})

const decide = useAction(async () => {
  const reviewer = auth.user!.name
  const body = { reason: reason.value }

  if (outcome.value === 'approve') {
    await insuranceApi.approveClaim(auth.orgId!, claimId, reviewer, {
      ...body,
      approvedAmount: Number(approvedAmount.value),
    })
  } else if (outcome.value === 'reject') {
    await insuranceApi.rejectClaim(auth.orgId!, claimId, reviewer, body)
  } else {
    await insuranceApi.requestMoreInfo(auth.orgId!, claimId, reviewer, body)
  }
  return true
})

async function submit() {
  const ok = await decide.run()
  if (!ok) return
  if (outcome.value === 'more_info') {
    reason.value = ''
    await refresh()
  } else {
    await router.push(`/insurance/claims/${claimId}`)
  }
}

const OUTCOMES: { value: Outcome; label: string; hint: string }[] = [
  { value: 'approve', label: 'Approve', hint: 'Clear for settlement and create the payout' },
  { value: 'reject', label: 'Reject', hint: 'Decline the claim, with a reason on the record' },
  {
    value: 'more_info',
    label: 'Request more info',
    hint: 'Keep it open and record a query to the provider',
  },
]

const context = computed(() => {
  const d = data.value
  if (!d) return []
  return [
    { label: 'Patient', value: d.claim.patientName },
    { label: 'Provider', value: d.claim.hospitalName },
    { label: 'Policy', value: d.claim.policyNumber, mono: true },
    { label: 'Coverage', value: d.policy.coverageType },
    { label: 'Diagnosis', value: d.claim.diagnosis },
    { label: 'Submitted', value: date(d.claim.submittedAt) },
    { label: 'Annual limit', value: money(d.policy.coverageLimit) },
    { label: 'Deductible', value: money(d.policy.deductible) },
    { label: 'Auto-approve limit', value: money(d.policy.autoApproveLimit) },
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
        :title="`Review ${data.claim.claimNumber}`"
        :subtitle="`${data.claim.patientName} · ${data.claim.treatmentDescription}`"
        :back="{ to: '/insurance/review', label: 'Review queue' }"
      >
        <template #actions>
          <ClaimStatusBadge :status="data.claim.status" />
          <RouterLink :to="`/insurance/claims/${data.claim.id}`" class="btn-ghost">
            Full claim record
          </RouterLink>
        </template>
      </PageHeader>

      <div
        v-if="!decidable"
        class="surface mb-5 border-l-2 border-l-mist-500 p-4"
      >
        <p class="text-sm font-medium text-mist-100">This claim is no longer open for a decision</p>
        <p class="mt-0.5 text-sm text-mist-500">
          It is currently marked
          <span class="text-mist-300">{{ data.claim.status.replace(/_/g, ' ') }}</span
          >. Decisions can only be recorded while a claim is verified or pending review.
        </p>
      </div>

      <div class="grid gap-5 lg:grid-cols-[1.3fr_1fr] lg:items-start">
        <!-- Evidence column -->
        <div class="space-y-5">
          <TruthScorePanel
            :verification="data.verification"
            :threshold="data.policy.truthScoreThreshold"
          />

          <section class="surface p-5">
            <h2 class="mb-4 text-sm font-semibold tracking-tight text-mist-100">
              Claim and policy context
            </h2>
            <DetailList :items="context" :columns="3" />
          </section>

          <ClaimLifecycleTimeline
            :events="data.claim.timeline"
            :current-status="data.claim.status"
            dense
          />

          <BlockchainRefLink :reference="data.attestation" />
        </div>

        <!-- Decision column -->
        <form class="surface sticky top-20 overflow-hidden" @submit.prevent="submit">
          <header class="border-b border-ink-700/70 px-5 py-3.5">
            <h2 class="text-sm font-semibold tracking-tight text-mist-100">Record a decision</h2>
            <p class="mt-0.5 text-xs text-mist-500">
              Your reasoning is written to the claim timeline and shown to the patient.
            </p>
          </header>

          <div class="space-y-4 p-5">
            <div>
              <p class="label mb-1.5">Amount claimed</p>
              <p class="tnum text-2xl font-semibold tracking-tight text-mist-100">
                {{ money(data.claim.amountRequested) }}
              </p>
            </div>

            <fieldset :disabled="!decidable">
              <legend class="label mb-2">Outcome</legend>
              <div class="space-y-2">
                <label
                  v-for="option in OUTCOMES"
                  :key="option.value"
                  class="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors"
                  :class="[
                    outcome === option.value
                      ? option.value === 'approve'
                        ? 'border-emerald-500/45 bg-emerald-500/[0.07]'
                        : option.value === 'reject'
                          ? 'border-rose-500/45 bg-rose-500/[0.07]'
                          : 'border-amber-500/45 bg-amber-500/[0.07]'
                      : 'border-ink-700 hover:border-ink-600',
                    !decidable ? 'opacity-50' : '',
                  ]"
                >
                  <input
                    v-model="outcome"
                    type="radio"
                    name="outcome"
                    :value="option.value"
                    class="mt-1 h-3.5 w-3.5 shrink-0 accent-[#22C9A6]"
                  />
                  <div>
                    <p class="text-sm font-medium text-mist-100">{{ option.label }}</p>
                    <p class="mt-0.5 text-xs leading-relaxed text-mist-500">{{ option.hint }}</p>
                  </div>
                </label>
              </div>
            </fieldset>

            <div v-if="outcome === 'approve'">
              <label for="approved-amount" class="label mb-1.5 block">Approved amount (MYR)</label>
              <input
                id="approved-amount"
                v-model.number="approvedAmount"
                type="number"
                min="0"
                :max="data.claim.amountRequested"
                step="0.01"
                class="field tnum"
                :disabled="!decidable"
              />
              <p class="mt-1.5 text-xs text-mist-500">
                Defaults to the claim less the {{ money(data.policy.deductible) }} deductible.
              </p>
            </div>

            <div>
              <label for="reason" class="label mb-1.5 block">
                {{ outcome === 'more_info' ? 'What do you need from the provider?' : 'Reasoning' }}
              </label>
              <textarea
                id="reason"
                v-model="reason"
                rows="5"
                class="field resize-y"
                :disabled="!decidable"
                :placeholder="
                  outcome === 'approve'
                    ? 'What in the evidence supports approval?'
                    : outcome === 'reject'
                      ? 'Which policy term or missing evidence drives the rejection?'
                      : 'Name the specific document or clarification required.'
                "
              />
              <p class="mt-1.5 text-xs text-mist-500">
                Be specific. The Truth Score is decision support — this reasoning is the decision.
              </p>
            </div>

            <p v-if="decide.error.value" class="text-sm text-rose-300">{{ decide.error.value }}</p>

            <button
              type="submit"
              class="w-full"
              :class="
                outcome === 'reject' ? 'btn-danger' : outcome === 'approve' ? 'btn-primary' : 'btn-ghost'
              "
              :disabled="!canSubmit || decide.pending.value"
            >
              {{
                decide.pending.value
                  ? 'Recording…'
                  : outcome === 'approve'
                    ? `Approve ${money(Number(approvedAmount))}`
                    : outcome === 'reject'
                      ? 'Reject claim'
                      : 'Send query to provider'
              }}
            </button>

            <p v-if="outcome === 'approve'" class="text-xs leading-relaxed text-mist-500">
              Approving creates a pending payout to {{ data.claim.hospitalName }}. Settlement is
              triggered separately from the Payments screen.
            </p>
          </div>
        </form>
      </div>
    </template>
  </div>
</template>
