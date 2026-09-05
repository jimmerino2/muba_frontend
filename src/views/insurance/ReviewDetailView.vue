<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
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
import ModelComparisonPanel from '@/components/ModelComparisonPanel.vue'
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

/**
 * Per-line-item outcome, keyed by line item id — the primary decision this
 * screen records. There is no whole-claim approve/reject shortcut any more:
 * every item defaults to "approved" (the common case) but each one is its
 * own toggle, and a denial only submits with a reason attached.
 */
const itemDecisions = reactive<Record<string, { approved: boolean; reason: string }>>({})

watch(
  data,
  (next) => {
    if (!next) return
    for (const item of next.claim.lineItems) {
      if (!(item.id in itemDecisions)) {
        itemDecisions[item.id] = { approved: item.approved ?? true, reason: item.reason ?? '' }
      }
    }
  },
  { immediate: true },
)

const decidable = computed(
  () => data.value?.claim.status === 'pending_review' || data.value?.claim.status === 'verified',
)

const approvedTotal = computed(() =>
  (data.value?.claim.lineItems ?? [])
    .filter((item) => itemDecisions[item.id]?.approved)
    .reduce((total, item) => total + item.amount, 0),
)
const deniedTotal = computed(() =>
  (data.value?.claim.lineItems ?? [])
    .filter((item) => !itemDecisions[item.id]?.approved)
    .reduce((total, item) => total + item.amount, 0),
)

/** Every denied item needs a reason on record before the decision can submit
 * — the UI should make an unexplained denial impossible, not just discouraged. */
const canSubmit = computed(() => {
  if (!decidable.value || !data.value) return false
  return data.value.claim.lineItems.every((item) => {
    const d = itemDecisions[item.id]
    return d && (d.approved || d.reason.trim().length > 0)
  })
})

const decide = useAction(async () => {
  const reviewer = auth.user!.name
  const decisions = data.value!.claim.lineItems.map((item) => {
    const d = itemDecisions[item.id]!
    return {
      lineItemId: item.id,
      approved: d.approved,
      ...(d.approved ? {} : { reason: d.reason.trim() }),
    }
  })
  await insuranceApi.decideLineItems(auth.orgId!, claimId, reviewer, decisions)
  return true
})

async function submit() {
  const ok = await decide.run()
  if (ok) await router.push(`/insurance/claims/${claimId}`)
}

/* ------------------------------------------------------- request more info */
// Kept as a secondary, distinctly-shaped action so it can never be mistaken
// for a line-item decision: it leaves the claim open and records a note
// rather than approving or denying anything.
const showMoreInfo = ref(false)
const moreInfoReason = ref('')
const requestInfo = useAction(async () => {
  await insuranceApi.requestMoreInfo(auth.orgId!, claimId, auth.user!.name, { reason: moreInfoReason.value })
  return true
})
async function submitMoreInfo() {
  const ok = await requestInfo.run()
  if (!ok) return
  moreInfoReason.value = ''
  showMoreInfo.value = false
  await refresh()
}

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

          <ModelComparisonPanel :verification="data.verification" />

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
        <div class="sticky top-20 space-y-4">
          <form class="surface overflow-hidden" @submit.prevent="submit">
            <header class="border-b border-ink-700/70 px-5 py-3.5">
              <h2 class="text-sm font-semibold tracking-tight text-mist-100">
                Decide each line item
              </h2>
              <p class="mt-0.5 text-xs text-mist-500">
                Reasoning for a denial is written to the claim timeline and shown to the patient.
              </p>
            </header>

            <fieldset :disabled="!decidable" class="divide-y divide-ink-800/80">
              <div v-for="item in data.claim.lineItems" :key="item.id" class="space-y-3 p-5">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="truncate text-sm font-medium text-mist-100">{{ item.description }}</p>
                    <p class="mt-0.5 text-2xs text-mist-500">{{ item.category }}</p>
                  </div>
                  <p class="tnum shrink-0 text-sm font-semibold text-mist-100">{{ money(item.amount) }}</p>
                </div>

                <div class="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    class="rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
                    :class="
                      itemDecisions[item.id]?.approved
                        ? 'border-emerald-500/45 bg-emerald-500/[0.08] text-emerald-300'
                        : 'border-ink-700 text-mist-400 hover:border-ink-600'
                    "
                    @click="itemDecisions[item.id] = { approved: true, reason: '' }"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    class="rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
                    :class="
                      itemDecisions[item.id] && !itemDecisions[item.id]!.approved
                        ? 'border-rose-500/45 bg-rose-500/[0.08] text-rose-300'
                        : 'border-ink-700 text-mist-400 hover:border-ink-600'
                    "
                    @click="itemDecisions[item.id] = { approved: false, reason: itemDecisions[item.id]?.reason ?? '' }"
                  >
                    Deny
                  </button>
                </div>

                <div v-if="itemDecisions[item.id] && !itemDecisions[item.id]!.approved">
                  <textarea
                    v-model="itemDecisions[item.id]!.reason"
                    rows="2"
                    class="field resize-y text-sm"
                    placeholder="Reason this item is not covered (required)"
                  />
                </div>
              </div>
            </fieldset>

            <div class="space-y-3 border-t border-ink-700/70 p-5">
              <div class="flex items-center justify-between text-sm">
                <span class="text-mist-400">Approved</span>
                <span class="tnum font-semibold text-emerald-300">{{ money(approvedTotal) }}</span>
              </div>
              <div class="flex items-center justify-between text-sm">
                <span class="text-mist-400">Denied</span>
                <span class="tnum font-semibold text-rose-300">{{ money(deniedTotal) }}</span>
              </div>

              <p v-if="decide.error.value" class="text-sm text-rose-300">{{ decide.error.value }}</p>

              <button
                type="submit"
                class="btn-primary w-full"
                :disabled="!canSubmit || decide.pending.value"
              >
                {{ decide.pending.value ? 'Recording…' : `Submit decision — ${money(approvedTotal)} approved` }}
              </button>

              <p class="text-xs leading-relaxed text-mist-500">
                Approving any amount creates a pending payout to {{ data.claim.hospitalName }}.
                Settlement is triggered separately from the Payments screen.
              </p>
            </div>
          </form>

          <!-- Secondary, deliberately separate from the line-item decision above -->
          <div class="surface p-4">
            <button
              type="button"
              class="text-xs text-mist-400 hover:text-mist-200"
              :disabled="!decidable"
              @click="showMoreInfo = !showMoreInfo"
            >
              {{ showMoreInfo ? 'Cancel query' : 'Or request more information from the provider →' }}
            </button>
            <form v-if="showMoreInfo" class="mt-3 space-y-2" @submit.prevent="submitMoreInfo">
              <textarea
                v-model="moreInfoReason"
                rows="3"
                class="field resize-y text-sm"
                placeholder="Name the specific document or clarification required."
              />
              <p v-if="requestInfo.error.value" class="text-xs text-rose-300">{{ requestInfo.error.value }}</p>
              <button
                type="submit"
                class="btn-ghost w-full"
                :disabled="!moreInfoReason.trim() || requestInfo.pending.value"
              >
                {{ requestInfo.pending.value ? 'Sending…' : 'Send query to provider' }}
              </button>
            </form>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
